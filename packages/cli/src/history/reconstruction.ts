import { Ajv, type AnySchemaObject } from "ajv";
import { EVENT_ENVELOPE_VERSION, type EventEnvelope } from "@vialactea-works/kepler-core";
import {
  CONSTRUCTION_EVENT_VERSION,
  validateConstructionEvent,
  type ConstructionEventRecord,
  type ConstructionStage,
  type EffortLevel,
  type MissionWorkspaceContext,
  type MissionWorkspaceSelection,
  type MissionStartingCheckpoint,
} from "../construction/events.js";
import { parseStrictJson } from "../json/strict-json.js";
import {
  HistoryError,
  historyDigest,
  historyManifestDigest,
  parseHistoryControl,
  parseHistoryManifest,
  type HistoryAction,
  type HistoryCandidateJournal,
  type HistoryControl,
  type HistoryDigest,
  type HistoryProposedEvent,
  type HistoryRebuildManifest,
  type HistoryRequiredMaterial,
  type HistoryReconciliation,
  type HistorySourceEntry,
  type HistorySourceRange,
} from "./control.js";
import { historyArchiveIndexDigest, parseHistoryArchiveIndex, type HistoryArchiveIndex } from "./archive-index.js";
import { collectHistory, type HistoryCollection } from "./collection.js";
import { historyState } from "./gateway.js";
import { canonicalJson, scanJournalBytes, serializeJournalEvent } from "./journal.js";
import { validateCandidateMissionBinding } from "./reconstruction-binding.js";

export interface ReconstructionPlanAction {
  readonly id: string;
  readonly action: "retain" | "replace" | "add" | "exclude";
  readonly source: HistorySourceRange | null;
  readonly event: HistoryProposedEvent | null;
  readonly reason: string;
  readonly authority: {
    readonly decision_reference: string;
    readonly artifact_bindings: readonly {
      readonly artifact_id: string;
      readonly content_version?: HistoryDigest;
      readonly checkpoint?: { readonly repository_id: string; readonly commit: string };
    }[];
  } | null;
  readonly proof: { readonly reference: string; readonly content_version: HistoryDigest } | null;
  readonly loss_reference: string | null;
  readonly data_bindings: readonly { readonly pointer: string; readonly action_id: string }[];
}

export interface CleanRestartContext {
  readonly confirmation: {
    readonly confirmed: true;
    readonly requester: string;
    readonly decision_reference: string;
  };
  readonly mission: {
    readonly title: string;
    readonly request: string;
    readonly contexts: readonly { readonly reference: string; readonly purpose: string }[];
    readonly repositories: readonly MissionWorkspaceSelection[];
  };
  readonly prepared_repositories: readonly {
    readonly repository_id: string;
    readonly context: MissionWorkspaceContext;
    readonly branch: string;
    readonly integration_target: string;
    readonly starting_checkpoint: MissionStartingCheckpoint;
  }[];
  readonly units: readonly {
    readonly unit_id: string;
    readonly directory: string;
    readonly initial_effort: {
      readonly default: EffortLevel;
      readonly stage_overrides: Readonly<Partial<Record<ConstructionStage, EffortLevel>>>;
      readonly selected_by: string;
    };
  }[];
}

export interface ReconstructionPlan {
  readonly format: "kepler.mission-history-reconstruction-plan";
  readonly version: 1;
  readonly mode: "reconstruct" | "clean-restart";
  readonly mission_id: string;
  readonly generation_id: string;
  readonly reset_event_id: string;
  readonly archive_id: string;
  readonly archive_inventory_hash: HistoryDigest;
  readonly actions: readonly ReconstructionPlanAction[];
  readonly dependency_order: readonly string[];
  readonly required_material: HistoryRequiredMaterial;
  readonly continuation: {
    readonly operation: string;
    readonly unresolved_work: readonly string[];
    readonly required_approvals: readonly string[];
  };
  readonly requester: string;
  readonly reconciliation: HistoryReconciliation;
  readonly clean_restart: CleanRestartContext | null;
}

export interface ReconstructionArchiveFile {
  readonly source_id: string;
  readonly origin: string;
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface ReconstructionArchive {
  readonly index: HistoryArchiveIndex;
  readonly files: readonly ReconstructionArchiveFile[];
}

export interface ReconstructionIdentityReservations {
  readonly event_ids: readonly string[];
  readonly journal_ids: readonly string[];
}

export type ReconstructionCheck =
  | { readonly status: "valid"; readonly reference: string }
  | { readonly status: "invalid"; readonly reason: string };

export interface ReconstructionAuthorityRequest {
  readonly reset: HistoryControl;
  readonly plan: ReconstructionPlan;
  readonly archive: ReconstructionArchive;
  readonly action: ReconstructionPlanAction;
  readonly event: ConstructionEventRecord;
}

export interface ReconstructionMaterialRequest {
  readonly reset: HistoryControl;
  readonly plan: ReconstructionPlan;
  readonly archive: ReconstructionArchive;
  readonly required_material: HistoryRequiredMaterial;
  readonly candidate_journals: readonly PreparedCandidateJournal[];
  readonly history: HistoryCollection;
  readonly expected_state: Readonly<Record<string, unknown>>;
}

export interface ReconstructionContinuationRequest {
  readonly reset: HistoryControl;
  readonly plan: ReconstructionPlan;
  readonly continuation: ReconstructionPlan["continuation"];
  readonly history: HistoryCollection;
  readonly expected_state: Readonly<Record<string, unknown>>;
  readonly required_material: HistoryRequiredMaterial;
}

export interface ReconstructionDependencies {
  readonly identity: () => string;
  readonly identity_reservations: ReconstructionIdentityReservations;
  readonly clock: () => Date;
  readonly producer: { readonly name: string; readonly version: string };
  readonly verifyAuthority: (request: ReconstructionAuthorityRequest) => Promise<ReconstructionCheck>;
  readonly verifyMaterial: (request: ReconstructionMaterialRequest) => Promise<ReconstructionCheck>;
  readonly verifyContinuation: (request: ReconstructionContinuationRequest) => Promise<ReconstructionCheck>;
}

export interface PreparedCandidateJournal extends HistoryCandidateJournal {
  readonly bytes: Uint8Array;
}

export interface ReconstructionOutputMapping {
  readonly action_id: string;
  readonly disposition: "retain" | "replace" | "add" | "exclude";
  readonly source_id: string | null;
  readonly source_byte_offset: number | null;
  readonly source_byte_length: number | null;
  readonly output_event_id: string | null;
  readonly output_journal_id: string | null;
  readonly output_byte_offset: number | null;
  readonly output_byte_length: number | null;
  readonly loss_reference: string | null;
}

export interface PreparedReconstruction {
  readonly checked: true;
  readonly manifest: HistoryRebuildManifest;
  readonly candidate_journals: readonly PreparedCandidateJournal[];
  readonly source_to_output: readonly ReconstructionOutputMapping[];
  readonly history: HistoryCollection;
  readonly state: Readonly<Record<string, unknown>>;
  readonly verification: {
    readonly authority: readonly { readonly action_id: string; readonly reference: string }[];
    readonly material: { readonly reference: string };
    readonly continuation: { readonly reference: string };
  };
}

const textSchema: AnySchemaObject = { type: "string", minLength: 1, pattern: "\\S" };
const uuidSchema: AnySchemaObject = { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" };
const digestSchema: AnySchemaObject = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const integerSchema: AnySchemaObject = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const jsonObjectSchema: AnySchemaObject = { type: "object" };
const objectSchema = (properties: Record<string, AnySchemaObject>): AnySchemaObject => ({
  type: "object", additionalProperties: false, required: Object.keys(properties), properties,
});
const arraySchema = (items: AnySchemaObject, minItems = 0): AnySchemaObject => ({ type: "array", items, minItems });
const nullableSchema = (schema: AnySchemaObject): AnySchemaObject => ({ anyOf: [schema, { type: "null" }] });
const textArraySchema: AnySchemaObject = { ...arraySchema(textSchema), uniqueItems: true };
const materialSchema = objectSchema({ reference: textSchema, content_version: digestSchema });
const sourceRangeSchema = objectSchema({ source_id: textSchema, byte_offset: integerSchema, byte_length: integerSchema });
const contextSchema: AnySchemaObject = {
  oneOf: [
    objectSchema({ kind: { const: "existing" } }),
    objectSchema({ kind: { const: "new" } }),
    objectSchema({ kind: { const: "previous" }, workspace_id: textSchema, mission_id: uuidSchema, record_home_repository_id: textSchema }),
  ],
};
const branchSchema: AnySchemaObject = {
  oneOf: [
    objectSchema({ kind: { const: "current" } }),
    objectSchema({ kind: { const: "default" } }),
    objectSchema({ kind: { const: "existing" }, name: textSchema }),
    objectSchema({ kind: { const: "new" }, name: textSchema, base: textSchema }),
  ],
};
const startingCheckpointSchema: AnySchemaObject = {
  oneOf: [objectSchema({ kind: { const: "commit" }, commit: textSchema }), objectSchema({ kind: { const: "no-commit" } })],
};
const repositorySelectionSchema = objectSchema({
  repository_id: textSchema, context: contextSchema, branch: branchSchema, integration_target: textSchema,
  starting_checkpoint: startingCheckpointSchema,
});
const preparedRepositorySchema = objectSchema({
  repository_id: textSchema, context: contextSchema, branch: textSchema, integration_target: textSchema,
  starting_checkpoint: startingCheckpointSchema,
});
const reconciliationSchema = objectSchema({
  orchestrator: textSchema,
  affected_workers_terminal: { const: true },
  effects_reconciled: { const: true },
  integration_lock_reconciled: { const: true },
  run_references: textArraySchema,
  references: arraySchema(objectSchema({ reference: textSchema, purpose: textSchema }), 1),
  summary: textSchema,
});
const proposedCauseSchema: AnySchemaObject = {
  ...objectSchema({ event_id: nullableSchema(uuidSchema), action_id: nullableSchema(uuidSchema) }),
  oneOf: [
    { properties: { event_id: uuidSchema, action_id: { type: "null" } } },
    { properties: { event_id: { type: "null" }, action_id: uuidSchema } },
  ],
};
const proposedEventSchema = objectSchema({
  phase: { const: "construction" }, type: textSchema, event_version: { type: "integer", minimum: 1 },
  data: jsonObjectSchema, causes: arraySchema(proposedCauseSchema),
});
const authorityCheckpointSchema = objectSchema({ repository_id: textSchema, commit: { type: "string", pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" } });
const authorityBindingSchema: AnySchemaObject = {
  oneOf: [
    objectSchema({ artifact_id: uuidSchema, content_version: digestSchema }),
    objectSchema({ artifact_id: uuidSchema, checkpoint: authorityCheckpointSchema }),
    objectSchema({ artifact_id: uuidSchema, content_version: digestSchema, checkpoint: authorityCheckpointSchema }),
  ],
};
const authoritySchema = objectSchema({
  decision_reference: textSchema, artifact_bindings: arraySchema(authorityBindingSchema),
});
const planActionSchema = objectSchema({
  id: uuidSchema,
  action: { enum: ["retain", "replace", "add", "exclude"] },
  source: nullableSchema(sourceRangeSchema),
  event: nullableSchema(proposedEventSchema),
  reason: textSchema,
  authority: nullableSchema(authoritySchema),
  proof: nullableSchema(materialSchema),
  loss_reference: nullableSchema(textSchema),
  data_bindings: arraySchema(objectSchema({ pointer: textSchema, action_id: uuidSchema })),
});
const artifactMaterialSchema = objectSchema({ artifact_id: uuidSchema, reference: textSchema, content_version: digestSchema });
const checkpointSchema = objectSchema({
  repository_id: textSchema, commit: { type: "string", pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" },
});
const requiredMaterialSchema = objectSchema({
  artifact_bindings: arraySchema(artifactMaterialSchema), checkpoints: arraySchema(checkpointSchema), evidence: arraySchema(materialSchema),
});
const continuationSchema = objectSchema({ operation: textSchema, unresolved_work: arraySchema(textSchema), required_approvals: arraySchema(textSchema) });
const stageNames = ["functional-design", "quality-requirements", "implementation-planning", "implementation", "unit-of-work-review", "deliver"];
const effortNames = ["minimal", "standard", "comprehensive"];
const effortSchema = objectSchema({
  default: { enum: effortNames },
  stage_overrides: { type: "object", additionalProperties: { enum: effortNames }, propertyNames: { enum: stageNames } },
  selected_by: textSchema,
});
const cleanRestartSchema = objectSchema({
  confirmation: objectSchema({ confirmed: { const: true }, requester: textSchema, decision_reference: textSchema }),
  mission: objectSchema({
    title: textSchema, request: textSchema,
    contexts: arraySchema(objectSchema({ reference: textSchema, purpose: textSchema })),
    repositories: arraySchema(repositorySelectionSchema, 1),
  }),
  prepared_repositories: arraySchema(preparedRepositorySchema, 1),
  units: arraySchema(objectSchema({ unit_id: textSchema, directory: textSchema, initial_effort: effortSchema })),
});
const planSchema = objectSchema({
  format: { const: "kepler.mission-history-reconstruction-plan" }, version: { const: 1 },
  mode: { enum: ["reconstruct", "clean-restart"] }, mission_id: uuidSchema, generation_id: uuidSchema,
  reset_event_id: uuidSchema, archive_id: uuidSchema, archive_inventory_hash: digestSchema,
  actions: arraySchema(planActionSchema), dependency_order: textArraySchema, required_material: requiredMaterialSchema,
  continuation: continuationSchema, requester: textSchema, reconciliation: reconciliationSchema,
  clean_restart: nullableSchema(cleanRestartSchema),
});
const validatePlan = new Ajv({ strict: true, allErrors: false }).compile<ReconstructionPlan>(planSchema);

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const compare = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};
const compareActions = (left: ReconstructionPlanAction | HistoryAction, right: ReconstructionPlanAction | HistoryAction): number =>
  compare(left.source?.source_id ?? left.loss_reference ?? "", right.source?.source_id ?? right.loss_reference ?? "") ||
  (left.source?.byte_offset ?? -1) - (right.source?.byte_offset ?? -1) || compare(left.id, right.id);
const fail = (code: string, message: string, details: Readonly<Record<string, unknown>> = {}): never => {
  throw new HistoryError(code, message, details);
};
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const generatedAction = (action: ReconstructionPlanAction): boolean => action.action === "replace" || action.action === "add";

type ReconstructionJsonValue = null | boolean | number | string | ReconstructionJsonValue[] | { readonly [key: string]: ReconstructionJsonValue };

const decodePointer = (pointer: string): readonly string[] => {
  if (!pointer.startsWith("/") || pointer === "/") fail("history_reconstruction_invalid", "Data bindings require a non-root JSON Pointer.", { pointer });
  const parts = pointer.slice(1).split("/").map((part) => {
    if (/~(?![01])/.test(part)) fail("history_reconstruction_invalid", "Data binding JSON Pointers must use valid escapes.", { pointer });
    return part.replaceAll("~1", "/").replaceAll("~0", "~");
  });
  if (parts.some((part) => ["__proto__", "prototype", "constructor"].includes(part))) {
    fail("history_reconstruction_invalid", "Data binding JSON Pointers cannot traverse prototype properties.", { pointer });
  }
  return parts;
};

const valueAtPointer = (root: unknown, parts: readonly string[], pointer: string): ReconstructionJsonValue => {
  let current = root;
  for (const part of parts) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(part)) fail("history_reconstruction_invalid", "Array JSON Pointer segments must be canonical indexes.", { pointer });
      const index = Number(part);
      if (!Number.isSafeInteger(index) || index >= current.length) fail("history_reconstruction_invalid", "Data binding JSON Pointer is outside its array.", { pointer });
      current = current[index];
    } else if (record(current) && Object.hasOwn(current, part)) {
      current = current[part];
    } else {
      fail("history_reconstruction_invalid", "Data binding JSON Pointer does not resolve.", { pointer });
    }
  }
  return current as ReconstructionJsonValue;
};

type CurrentFactReferenceKind = "task-integration" | "integration-preparation" | "predecessor-integration";

interface CurrentFactReference {
  readonly pointer: string;
  readonly target_type: "construction.integration-accepted" | "construction.integration-prepared";
  readonly kind: CurrentFactReferenceKind;
  readonly target_task_id?: string;
}

const currentFactReferences = (event: ConstructionEventRecord | HistoryProposedEvent): readonly CurrentFactReference[] => {
  if (event.type === "construction.task-completed") return [{
    pointer: "/integration_event_id", target_type: "construction.integration-accepted", kind: "task-integration",
  }];
  if (event.type === "construction.integration-accepted") return [{
    pointer: "/prepared_event_id", target_type: "construction.integration-prepared", kind: "integration-preparation",
  }];
  if (event.type !== "construction.task-admitted" || !Array.isArray(event.data.predecessor_provenance)) return [];
  return event.data.predecessor_provenance.flatMap((item, index) => record(item) && typeof item.task_id === "string"
    ? [{
      pointer: `/predecessor_provenance/${index}/integration_event_id`,
      target_type: "construction.integration-accepted" as const,
      kind: "predecessor-integration" as const,
      target_task_id: item.task_id,
    }]
    : []);
};

const referenceForPointer = (event: HistoryProposedEvent, pointer: string): CurrentFactReference | undefined =>
  currentFactReferences(event).find((reference) => reference.pointer === pointer);

const referenceMatchesTarget = (source: ConstructionEventRecord, target: ConstructionEventRecord, reference: CurrentFactReference): boolean => {
  const sourceData = source.data;
  const targetData = target.data;
  if (target.type !== reference.target_type || sourceData.unit_id !== targetData.unit_id) return false;
  if (reference.kind === "integration-preparation") {
    return source.type === "construction.integration-accepted" && target.type === "construction.integration-prepared" &&
      sourceData.task_id === targetData.task_id && sourceData.stage_attempt_id === targetData.stage_attempt_id &&
      sourceData.activity === "code-integration" && targetData.activity === "code-integration";
  }
  if (reference.kind === "predecessor-integration") {
    return source.type === "construction.task-admitted" && target.type === "construction.integration-accepted" &&
      targetData.task_id === reference.target_task_id && targetData.activity === "code-integration";
  }
  return source.type === "construction.task-completed" && target.type === "construction.integration-accepted" &&
    sourceData.task_id === targetData.task_id && targetData.activity === "code-integration";
};

export const validateReconstructionReferences = (
  eventsById: ReadonlyMap<string, ConstructionEventRecord>,
  actionByOutputEventId: ReadonlyMap<string, ReconstructionPlanAction>,
): void => {
  for (const [sourceId, source] of eventsById) {
    const sourceAction = actionByOutputEventId.get(sourceId);
    if (!sourceAction) throw new HistoryError("history_reconstruction_reference_invalid", "Every selected fact must have an owning reconstruction action.", { event_id: sourceId });
    for (const reference of currentFactReferences(source)) {
      const targetId = valueAtPointer(source.data, decodePointer(reference.pointer), reference.pointer);
      if (typeof targetId !== "string") {
        throw new HistoryError("history_reconstruction_reference_invalid", "A required current-fact reference must resolve to one selected event ID.", { event_id: sourceId, pointer: reference.pointer });
      }
      const target = eventsById.get(targetId);
      const targetAction = actionByOutputEventId.get(targetId);
      if (!target || !targetAction) {
        throw new HistoryError("history_reconstruction_reference_invalid", "A current-fact reference must target one selected fact.", { event_id: sourceId, pointer: reference.pointer, target_event_id: targetId, target_type: reference.target_type });
      }
      if (!referenceMatchesTarget(source, target, reference)) {
        fail("history_reconstruction_reference_invalid", "A current-fact reference must target the correct fact type and scope.", { event_id: sourceId, pointer: reference.pointer, target_event_id: targetId, target_type: reference.target_type });
      }
      const binding = sourceAction.data_bindings.find((candidate) => candidate.pointer === reference.pointer);
      if (generatedAction(targetAction) && binding?.action_id !== targetAction.id) {
        fail("history_reconstruction_reference_mapping_required", "References to replaced or generated facts require an explicit action mapping.", { event_id: sourceId, pointer: reference.pointer, target_action_id: targetAction.id });
      }
      if (binding && binding.action_id !== targetAction.id) {
        fail("history_reconstruction_reference_mapping_invalid", "A data binding must point to the selected target fact.", { event_id: sourceId, pointer: reference.pointer, target_action_id: targetAction.id });
      }
    }
  }
};

const markerPointers = (value: unknown, pointer = ""): readonly { readonly pointer: string; readonly actionId: string }[] => {
  if (Array.isArray(value)) return value.flatMap((item, index) => markerPointers(item, `${pointer}/${index}`));
  if (!record(value)) return [];
  if (Object.hasOwn(value, "$event_action")) {
    const actionId = value.$event_action;
    if (!exactKeys(value, ["$event_action"]) || typeof actionId !== "string" || !uuidV4.test(actionId)) {
      throw new HistoryError("history_reconstruction_invalid", "Event-action data placeholders must identify one UUID action.", { pointer });
    }
    return [{ pointer, actionId }];
  }
  return Object.entries(value).flatMap(([key, nested]) => markerPointers(nested, `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`));
};

const validatePlanBindings = (plan: ReconstructionPlan): void => {
  const ids = plan.actions.map((action) => action.id);
  if (new Set(ids).size !== ids.length) fail("history_reconstruction_invalid", "Reconstruction action identities must be unique.");
  if (plan.actions.some((action, index) => index > 0 && compareActions(plan.actions[index - 1]!, action) > 0)) {
    fail("history_reconstruction_invalid", "Reconstruction actions must be sorted by source identity, source offset, and action identity.");
  }
  const generated = plan.actions.filter(generatedAction);
  if (new Set(plan.dependency_order).size !== plan.dependency_order.length || plan.dependency_order.length !== generated.length ||
      generated.some((action) => !plan.dependency_order.includes(action.id))) {
    fail("history_reconstruction_invalid", "Dependency order must name each replacement and addition exactly once.");
  }
  const actionById = new Map(plan.actions.map((action) => [action.id, action]));
  const dependencyPosition = new Map(plan.dependency_order.map((id, index) => [id, index]));
  for (const action of plan.actions) {
    if ((action.action === "retain" || action.action === "exclude") &&
        (!action.source || action.event !== null || action.authority !== null || action.proof !== null || action.loss_reference !== null || action.data_bindings.length)) {
      fail("history_reconstruction_invalid", "Retain and exclude actions require source bytes and cannot invent event data.", { action_id: action.id });
    }
    if (action.action === "replace" && (!action.source || !action.event || action.loss_reference !== null)) {
      fail("history_reconstruction_invalid", "A replacement requires one source range and supported event data.", { action_id: action.id });
    }
    if (action.action === "add" && (action.source !== null || !action.event)) {
      fail("history_reconstruction_invalid", "An addition cannot impersonate existing source bytes.", { action_id: action.id });
    }
    if (action.source && !Number.isSafeInteger(action.source.byte_offset + action.source.byte_length)) {
      fail("history_reconstruction_invalid", "Source range boundaries must be safe integers.", { action_id: action.id });
    }
    if (action.event) {
      const bindings = new Map<string, string>();
      for (const binding of action.data_bindings) {
        const parts = decodePointer(binding.pointer);
        if (!referenceForPointer(action.event, binding.pointer)) {
          fail("history_reconstruction_invalid", "Data bindings must target a schema-known current-fact reference.", { action_id: action.id, pointer: binding.pointer });
        }
        if (bindings.has(binding.pointer)) fail("history_reconstruction_invalid", "Data binding pointers must be unique per action.", { action_id: action.id, pointer: binding.pointer });
        const marker = valueAtPointer(action.event.data, parts, binding.pointer);
        if (!record(marker) || !exactKeys(marker, ["$event_action"]) || marker.$event_action !== binding.action_id) {
          fail("history_reconstruction_invalid", "Each data binding must match its exact event-action placeholder.", { action_id: action.id, pointer: binding.pointer });
        }
        bindings.set(binding.pointer, binding.action_id);
      }
      const markers = markerPointers(action.event.data);
      if (markers.length !== bindings.size || markers.some((marker) => bindings.get(marker.pointer) !== marker.actionId)) {
        fail("history_reconstruction_invalid", "Generated event data contains an unresolved or unbound action placeholder.", { action_id: action.id });
      }
      const references = new Set([
        ...action.event.causes.flatMap((cause) => cause.action_id ? [cause.action_id] : []),
        ...action.data_bindings.map((binding) => binding.action_id),
      ]);
      for (const dependencyId of references) {
        const dependency = actionById.get(dependencyId);
        if (!dependency) throw new HistoryError("history_reconstruction_invalid", "Generated event dependencies must resolve to a retained or generated action.", { action_id: action.id, dependency_id: dependencyId });
        if (dependency.action === "exclude" || dependencyId === action.id) {
          fail("history_reconstruction_invalid", "Generated event dependencies must resolve to a retained or generated action.", { action_id: action.id, dependency_id: dependencyId });
        }
        if (generatedAction(dependency) && (dependencyPosition.get(dependencyId) ?? Infinity) >= (dependencyPosition.get(action.id) ?? -1)) {
          fail("history_reconstruction_invalid", "Generated event dependencies must precede their dependents.", { action_id: action.id, dependency_id: dependencyId });
        }
      }
    }
  }
  if (plan.mode === "clean-restart") {
    if (!plan.clean_restart || plan.actions.some((action) => action.action !== "exclude") || plan.dependency_order.length) {
      fail("history_reconstruction_invalid", "Clean restart must exclude every available source and use only typed bootstrap context.");
    }
    const cleanRestart = plan.clean_restart;
    if (!cleanRestart) throw new HistoryError("history_reconstruction_invalid", "Clean restart requires typed bootstrap context.");
    if (cleanRestart.confirmation.requester !== plan.requester) fail("history_reconstruction_invalid", "Clean-restart confirmation must identify the plan requester.");
  } else if (plan.clean_restart !== null) {
    fail("history_reconstruction_invalid", "Reconstruction plans cannot contain clean-restart bootstrap context.");
  }
}

export const parseReconstructionPlan = (input: unknown): ReconstructionPlan => {
  let value = input;
  if (typeof input === "string") {
    const parsed = parseStrictJson(input);
    if (parsed.kind !== "parsed") throw new HistoryError("history_reconstruction_plan_invalid", "The reconstruction plan must be one strict JSON object.", { reason: parsed });
    value = parsed.value;
  }
  try {
    canonicalJson(value);
  } catch {
    fail("history_reconstruction_plan_invalid", "The reconstruction plan must contain only JSON values.");
  }
  if (!validatePlan(value)) throw new HistoryError("history_reconstruction_plan_invalid", "The reconstruction plan does not match its strict format.", { issues: validatePlan.errors });
  const plan = value as ReconstructionPlan;
  validatePlanBindings(plan);
  return plan;
};

interface HistoryJournalCoordinates {
  readonly phase: string;
  readonly journal_id: string;
  readonly generation_id?: string;
}

interface ValidatedArchiveFile extends ReconstructionArchiveFile {
  readonly entry: HistorySourceEntry;
  readonly history_path: boolean;
  readonly coordinates?: HistoryJournalCoordinates;
}

interface ReconstructionPhaseJournal extends ValidatedArchiveFile {
  readonly mission_id: string;
  readonly phase: "construction";
  readonly journal_id: string;
  readonly generation_id?: string;
  readonly byte_length: number;
  readonly content_version: HistoryDigest;
}

interface ValidatedReconstructionArchive {
  readonly index: HistoryArchiveIndex;
  readonly public_snapshot: ReconstructionArchive;
  readonly files: readonly ValidatedArchiveFile[];
  readonly history_files: readonly ValidatedArchiveFile[];
  readonly phase_journals: readonly ReconstructionPhaseJournal[];
}

const historyPrefix = (missionId: string): string => `.kepler/missions/${missionId}/history/`;

const parseHistorySourcePath = (path: string, missionId: string): HistoryJournalCoordinates | undefined => {
  if (!path.startsWith(historyPrefix(missionId)) || !path.endsWith(".jsonl")) return undefined;
  const parts = path.slice(historyPrefix(missionId).length).split("/");
  if (parts.length === 2 && parts[0] !== "control" && parts[0] !== "generations") {
    const journalId = parts[1]!.slice(0, -6);
    return uuidV4.test(journalId) ? { phase: parts[0]!, journal_id: journalId } : undefined;
  }
  if (parts.length === 4 && parts[0] === "generations") {
    const generationId = parts[1]!;
    const journalId = parts[3]!.slice(0, -6);
    return uuidV4.test(generationId) && uuidV4.test(journalId)
      ? { generation_id: generationId, phase: parts[2]!, journal_id: journalId }
      : undefined;
  }
  return undefined;
};

const validateArchive = (
  reset: HistoryControl,
  plan: ReconstructionPlan,
  archive: ReconstructionArchive,
): ValidatedReconstructionArchive => {
  if (reset.type !== "mission.history-reset" || reset.data.manifest.format !== "kepler.mission-history-reset") {
    throw new HistoryError("history_reconstruction_reset_invalid", "Reconstruction requires a complete selected reset control.");
  }
  const resetManifest = reset.data.manifest;
  if (resetManifest.format !== "kepler.mission-history-reset") throw new HistoryError("history_reconstruction_reset_invalid", "Reconstruction requires a reset manifest.");
  const index = parseHistoryArchiveIndex(cloneJson(archive.index));
  if (plan.mission_id !== reset.data.mission_id || plan.mission_id !== index.mission_id ||
      plan.generation_id !== reset.data.generation_id || plan.reset_event_id !== reset.id ||
      plan.archive_id !== resetManifest.archive_id || plan.archive_id !== index.archive_id ||
      index.manifest_hash !== historyManifestDigest(resetManifest) ||
      canonicalJson(index.source_inventory) !== canonicalJson(resetManifest.source_inventory) ||
      plan.archive_inventory_hash !== historyArchiveIndexDigest(index)) {
    fail("history_reconstruction_reset_mismatch", "The plan, computed archive index, and selected reset context must match exactly.");
  }
  if (!Array.isArray(archive.files) || archive.files.length !== index.source_inventory.length) {
    fail("history_reconstruction_archive_incomplete", "Every indexed source file must be supplied exactly once.");
  }
  const sourceById = new Map<string, ReconstructionArchiveFile>();
  for (const file of archive.files) {
    if (!record(file) || typeof file.source_id !== "string" || sourceById.has(file.source_id)) {
      fail("history_reconstruction_archive_invalid", "Archive files must have unique file-scoped source identities.", { source_id: record(file) ? file.source_id : undefined });
    }
    sourceById.set(file.source_id, file);
  }
  const files = index.source_inventory.map((entry): ValidatedArchiveFile => {
    const file = sourceById.get(entry.source_id);
    if (!file) throw new HistoryError("history_reconstruction_archive_incomplete", "An indexed archive file is missing.", { source_id: entry.source_id, path: entry.path });
    if (file.origin !== entry.origin || file.path !== entry.path || !(file.bytes instanceof Uint8Array) ||
        file.bytes.length !== entry.byte_length || historyDigest(file.bytes) !== entry.content_version) {
      fail("history_reconstruction_archive_invalid", "Each archive file must match its exact indexed origin, path, length, and digest.", { source_id: entry.source_id, path: entry.path });
    }
    const bytes = new Uint8Array(file.bytes);
    const history_path = entry.path.startsWith(historyPrefix(plan.mission_id));
    const coordinates = parseHistorySourcePath(entry.path, plan.mission_id);
    return {
      source_id: entry.source_id, origin: entry.origin, path: entry.path, bytes, entry, history_path,
      ...(coordinates ? { coordinates } : {}),
    };
  });
  const history_files = files.filter((file) => file.history_path);
  const phase_journals = history_files.flatMap((file): ReconstructionPhaseJournal[] => {
    const coordinates = file.coordinates;
    if (!coordinates || coordinates.phase !== "construction") return [];
    return [{
      ...file,
      mission_id: plan.mission_id,
      phase: "construction",
      journal_id: coordinates.journal_id,
      generation_id: coordinates.generation_id,
      byte_length: file.entry.byte_length,
      content_version: file.entry.content_version,
    }];
  });
  const public_snapshot: ReconstructionArchive = {
    index: cloneJson(index),
    files: files.map((file) => ({
      source_id: file.source_id,
      origin: file.origin,
      path: file.path,
      bytes: new Uint8Array(file.bytes),
    })),
  };
  return { index, public_snapshot, files, history_files, phase_journals };
};

interface SourceLineRange {
  readonly byte_offset: number;
  readonly byte_length: number;
  readonly line_index: number;
}

interface CheckedSource {
  readonly source: ReconstructionPhaseJournal;
  readonly lines: readonly SourceLineRange[];
  readonly scan: ReturnType<typeof scanJournalBytes>;
}

interface ActionSourceRange {
  readonly file: ValidatedArchiveFile;
  readonly line?: SourceLineRange;
  readonly checked?: CheckedSource;
}

const sourceLines = (source: ReconstructionPhaseJournal): CheckedSource => {
  const scan = scanJournalBytes(source.bytes);
  const lines: SourceLineRange[] = [];
  let offset = 0;
  for (let index = 0; index < scan.lines.length; index += 1) {
    const line = scan.lines[index]!;
    const byteLength = line.byteLength + (line.terminated ? 1 : 0);
    lines.push({ byte_offset: offset, byte_length: byteLength, line_index: index });
    offset += byteLength;
  }
  if (offset !== source.bytes.length) fail("history_reconstruction_archive_invalid", "The journal scanner did not cover every source byte.", { source_id: source.source_id });
  return { source, lines, scan };
};

const validateSourceDispositions = (
  plan: ReconstructionPlan,
  historyFiles: readonly ValidatedArchiveFile[],
  phaseJournals: readonly ReconstructionPhaseJournal[],
): ReadonlyMap<string, ActionSourceRange> => {
  const filesById = new Map(historyFiles.map((file) => [file.source_id, file]));
  const journalsById = new Map(phaseJournals.map((journal) => [journal.source_id, journal]));
  const actionsBySource = new Map<string, ReconstructionPlanAction[]>();
  for (const action of plan.actions) {
    if (!action.source) continue;
    if (!filesById.has(action.source.source_id)) {
      fail("history_reconstruction_source_unknown", "An action must refer to an indexed mission-history file.", { source_id: action.source.source_id });
    }
    const actions = actionsBySource.get(action.source.source_id) ?? [];
    actions.push(action);
    actionsBySource.set(action.source.source_id, actions);
  }
  const lineForAction = new Map<string, ActionSourceRange>();
  for (const file of historyFiles) {
    const actions = [...(actionsBySource.get(file.source_id) ?? [])].sort((left, right) => left.source!.byte_offset - right.source!.byte_offset);
    const source = journalsById.get(file.source_id);
    if (!source) {
      const action = actions[0];
      if (actions.length !== 1 || action?.action !== "exclude" || action.source?.byte_offset !== 0 || action.source.byte_length !== file.bytes.length) {
        fail("history_reconstruction_disposition_incomplete", "Non-phase history files require one whole-file exclusion.", { source_id: file.source_id });
      }
      lineForAction.set(action.id, { file });
      continue;
    }
    const checked = sourceLines(source);
    const { lines } = checked;
    if (source.bytes.length === 0) {
      const action = actions[0];
      if (actions.length !== 1 || action?.action !== "exclude" || action.source?.byte_offset !== 0 || action.source.byte_length !== 0) {
        fail("history_reconstruction_disposition_incomplete", "An empty source requires one explicit zero-length exclusion.", { source_id: source.source_id });
      }
      lineForAction.set(action.id, { file, checked });
      continue;
    }
    let covered = 0;
    for (const action of actions) {
      const range = action.source!;
      if (range.byte_offset !== covered || range.byte_length <= 0 || range.byte_offset + range.byte_length > source.bytes.length) {
        fail("history_reconstruction_disposition_incomplete", "Source ranges must cover every byte once without gaps or overlap.", { source_id: source.source_id, action_id: action.id });
      }
      const startIndex = lines.findIndex((line) => line.byte_offset === range.byte_offset);
      const last = lines.find((line) => line.byte_offset + line.byte_length === range.byte_offset + range.byte_length);
      if (startIndex < 0 || !last || range.byte_offset + range.byte_length > source.bytes.length) {
        fail("history_reconstruction_range_invalid", "Source ranges must start and end on exact complete line boundaries.", { source_id: source.source_id, action_id: action.id });
      }
      const endIndex = lines.findIndex((line) => line === last);
      if ((action.action === "retain" || action.action === "replace") && (startIndex !== endIndex || range.byte_length !== lines[startIndex]!.byte_length)) {
        fail("history_reconstruction_range_invalid", "Retain and replace actions must identify exactly one full source line.", { source_id: source.source_id, action_id: action.id });
      }
      if (action.action === "exclude" && (action.event !== null || action.authority !== null || action.proof !== null)) {
        fail("history_reconstruction_invalid", "Excluded source bytes cannot invent an output fact.", { action_id: action.id });
      }
      const line = startIndex === endIndex ? lines[startIndex] : undefined;
      if (action.action === "retain") {
        if (!line) throw new HistoryError("history_reconstruction_range_invalid", "A retained action must identify one complete event line.", { action_id: action.id });
        const record = checked.scan.lines[line.line_index];
        const problems = checked.scan.problems.filter((problem) => problem.line === line.line_index + 1);
        if (!record?.event || problems.length || !record.terminated) {
          fail("history_reconstruction_retain_invalid", "Only a complete, valid event line can be retained verbatim.", { action_id: action.id, source_id: source.source_id });
        }
        const valid = validateConstructionEvent(record.event);
        if (valid.status !== "valid" || valid.event.phase !== source.phase || valid.event.journal_id !== source.journal_id ||
            valid.event.data.mission_id !== plan.mission_id) {
          fail("history_reconstruction_retain_invalid", "Retained events must pass current owner validation and match their archived mission journal.", { action_id: action.id });
        }
      }
      if (action.action === "replace" && action.event === null) fail("history_reconstruction_invalid", "A replacement must provide a generated event.", { action_id: action.id });
      covered += range.byte_length;
      lineForAction.set(action.id, { file, ...(line ? { line } : {}), checked });
    }
    if (covered !== source.bytes.length) fail("history_reconstruction_disposition_incomplete", "Every available source byte requires exactly one disposition.", { source_id: source.source_id });
  }
  if (actionsBySource.size !== historyFiles.length) fail("history_reconstruction_disposition_incomplete", "Every mission-history file requires an explicit disposition.");
  return lineForAction;
};

const cloneJson = <T>(value: T): T => {
  try {
    return JSON.parse(canonicalJson(value)) as T;
  } catch (error) {
    throw new HistoryError("history_reconstruction_json_invalid", "A private JSON snapshot could not be cloned.", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

const freezeJson = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeJson(child);
  }
  return value;
};

const cloneArchiveSnapshot = (archive: ReconstructionArchive): ReconstructionArchive => ({
  index: cloneJson(archive.index),
  files: archive.files.map((file) => ({
    source_id: file.source_id,
    origin: file.origin,
    path: file.path,
    bytes: new Uint8Array(file.bytes),
  })),
});

const setPointer = (root: unknown, parts: readonly string[], pointer: string, replacement: string): void => {
  let current = root;
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isSafeInteger(index) || index >= current.length) fail("history_reconstruction_invalid", "Data binding JSON Pointer is outside its array.", { pointer });
      current = current[index];
    } else if (record(current) && Object.hasOwn(current, part)) {
      current = current[part];
    } else {
      fail("history_reconstruction_invalid", "Data binding JSON Pointer does not resolve.", { pointer });
    }
  }
  const last = parts.at(-1);
  if (last === undefined) throw new HistoryError("history_reconstruction_invalid", "Data binding JSON Pointer cannot target the root.", { pointer });
  if (Array.isArray(current)) {
    const index = Number(last);
    if (!Number.isSafeInteger(index) || index >= current.length) fail("history_reconstruction_invalid", "Data binding JSON Pointer is outside its array.", { pointer });
    current[index] = replacement;
  } else if (record(current) && Object.hasOwn(current, last)) {
    current[last] = replacement;
  } else {
    fail("history_reconstruction_invalid", "Data binding JSON Pointer does not resolve.", { pointer });
  }
};

const isHistoryMaterial = (value: unknown): value is { readonly reference: string; readonly content_version: HistoryDigest } =>
  record(value) && typeof value.reference === "string" && value.reference.trim().length > 0 &&
  typeof value.content_version === "string" && /^sha256:[0-9a-f]{64}$/.test(value.content_version);

const generatedFactRequiresProof = (event: ConstructionEventRecord): boolean => {
  if (event.type === "construction.evidence-recorded") return true;
  return [
    "construction.stage-attempt-completed",
    "construction.activity-attempt-completed",
    "construction.task-completed",
    "construction.integration-accepted",
    "construction.implementation-completion-assessed",
  ].includes(event.type);
};

const exactApprovalAuthority = (action: ReconstructionPlanAction, event: ConstructionEventRecord): void => {
  if (event.type !== "construction.approval-recorded") return;
  const authority = action.authority;
  if (!authority || authority.decision_reference !== event.data.decision_reference ||
      canonicalJson(authority.artifact_bindings) !== canonicalJson(event.data.artifact_bindings)) {
    fail("history_reconstruction_authority_required", "A generated artifact approval requires the exact action-level decision and artifact bindings.", { action_id: action.id });
  }
};

const validateGeneratedAuthorityInput = (action: ReconstructionPlanAction, event: ConstructionEventRecord): void => {
  if (!action.authority && !action.proof) {
    fail("history_reconstruction_authority_required", "Every generated fact requires explicit action-level authority or proof.", { action_id: action.id });
  }
  if (generatedFactRequiresProof(event) && !isHistoryMaterial(action.proof)) {
    fail("history_reconstruction_proof_required", "A generated passed check or completed fact requires exact retained proof material.", { action_id: action.id, type: event.type });
  }
  exactApprovalAuthority(action, event);
}

const verifierResult = async <Request>(
  callback: (request: Request) => Promise<ReconstructionCheck>,
  request: Request,
  code: string,
  label: string,
): Promise<{ readonly reference: string }> => {
  try {
    const result = await callback(request);
    if (result.status === "invalid") throw new HistoryError(code, `The ${label} verifier rejected this candidate.`, { reason: result.reason });
    if (result.status !== "valid" || typeof result.reference !== "string" || !result.reference.trim()) {
      throw new HistoryError(code, `The ${label} verifier returned no valid check receipt.`);
    }
    return { reference: result.reference };
  } catch (error) {
    if (error instanceof HistoryError) throw error;
    throw new HistoryError(code, `The ${label} verifier failed.`, { message: error instanceof Error ? error.message : String(error) });
  }
};

const makeBootstrapActions = (
  context: CleanRestartContext,
  plan: ReconstructionPlan,
  reset: HistoryControl,
  identity: () => string,
  reserved: Set<string>,
): readonly ReconstructionPlanAction[] => {
  const binding = reset.data.manifest.format === "kepler.mission-history-reset" ? reset.data.manifest.mission_binding : undefined;
  if (!binding || binding.unit_ids.length !== context.units.length ||
      binding.unit_ids.some((unitId, index) => unitId !== context.units[index]?.unit_id)) {
    throw new HistoryError("history_reconstruction_bootstrap_invalid", "Clean restart must preserve the exact known unit identities and their order.");
  }
  const missionRepositories = new Map(context.mission.repositories.map((repository) => [repository.repository_id, repository]));
  if (context.prepared_repositories.length !== missionRepositories.size || new Set(context.prepared_repositories.map((repo) => repo.repository_id)).size !== missionRepositories.size) {
    fail("history_reconstruction_bootstrap_invalid", "Clean restart workspace facts must cover every selected repository exactly once.");
  }
  for (const repository of context.prepared_repositories) {
    const selected = missionRepositories.get(repository.repository_id);
    if (!selected || canonicalJson(selected.context) !== canonicalJson(repository.context) ||
        selected.integration_target !== repository.integration_target ||
        canonicalJson(selected.starting_checkpoint) !== canonicalJson(repository.starting_checkpoint)) {
      fail("history_reconstruction_bootstrap_invalid", "Prepared workspace context must match its requester-confirmed mission selection.", { repository_id: repository.repository_id });
    }
  }
  if (context.confirmation.requester !== plan.requester || !context.confirmation.decision_reference.trim()) {
    fail("history_reconstruction_bootstrap_invalid", "Clean-restart bootstrap requires explicit requester confirmation.");
  }
  const nextIdentity = (): string => {
    const value = identity();
    if (!uuidV4.test(value) || reserved.has(value)) fail("history_reconstruction_identity_invalid", "The injected identity source did not return a fresh UUIDv4.", { identity: value });
    reserved.add(value);
    return value;
  };
  const action = (event: HistoryProposedEvent): ReconstructionPlanAction => ({
    id: nextIdentity(), action: "add", source: null, event, reason: "Requester-confirmed clean-restart bootstrap",
    authority: { decision_reference: context.confirmation.decision_reference, artifact_bindings: [] }, proof: null,
    loss_reference: null, data_bindings: [],
  });
  const missionAction = action({
    phase: "construction", type: "construction.mission-created", event_version: CONSTRUCTION_EVENT_VERSION,
    data: {
      mission_id: plan.mission_id,
      title: context.mission.title,
      request: context.mission.request,
      workflow: "standard",
      record_home: { repository_id: binding.record_home_repository_id },
      contexts: context.mission.contexts,
      repositories: context.mission.repositories,
    },
    causes: [],
  });
  const preparedAction = action({
    phase: "construction", type: "construction.mission-workspaces-prepared", event_version: CONSTRUCTION_EVENT_VERSION,
    data: { mission_id: plan.mission_id, repositories: context.prepared_repositories },
    causes: [{ event_id: null, action_id: missionAction.id }],
  });
  const unitActions = context.units.map((unit) => action({
    phase: "construction", type: "construction.unit-created", event_version: CONSTRUCTION_EVENT_VERSION,
    data: {
      mission_id: plan.mission_id,
      unit_id: unit.unit_id,
      directory: unit.directory,
      workflow: "standard",
      initial_effort: unit.initial_effort,
    },
    causes: [{ event_id: null, action_id: preparedAction.id }],
  }));
  return [missionAction, preparedAction, ...unitActions];
};

interface ArchivedIdentityInventory {
  readonly identities: ReadonlySet<string>;
  readonly event_ids: ReadonlySet<string>;
}

const reserveUuidValues = (value: unknown, identities: Set<string>): void => {
  if (typeof value === "string") {
    if (uuidV4.test(value)) identities.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) reserveUuidValues(item, identities);
    return;
  }
  if (record(value)) for (const nested of Object.values(value)) reserveUuidValues(nested, identities);
};

const archiveKnownIdentities = (files: readonly ValidatedArchiveFile[], missionId: string): ArchivedIdentityInventory => {
  const identities = new Set<string>();
  const event_ids = new Set<string>();
  for (const file of files) {
    if (!file.history_path) continue;
    if (file.coordinates) {
      identities.add(file.coordinates.journal_id);
      if (file.coordinates.generation_id) identities.add(file.coordinates.generation_id);
    }
    const finalSegment = file.path.slice(historyPrefix(missionId).length).split("/").at(-1);
    if (finalSegment?.endsWith(".jsonl")) {
      const journalId = finalSegment.slice(0, -6);
      if (uuidV4.test(journalId)) identities.add(journalId);
    }
    for (const line of scanJournalBytes(file.bytes).lines) {
      if (line.raw) {
        const parsed = parseStrictJson(line.raw);
        if (parsed.kind === "parsed") reserveUuidValues(parsed.value, identities);
      }
      if (!line.event) continue;
      identities.add(line.event.id);
      identities.add(line.event.journal_id);
      for (const causeId of line.event.caused_by) identities.add(causeId);
      event_ids.add(line.event.id);
    }
  }
  return { identities, event_ids };
};

const reservedControlIdentities = (input: unknown): ReadonlySet<string> => {
  if (!record(input) || !Array.isArray(input.event_ids) || !Array.isArray(input.journal_ids)) {
    fail("history_reconstruction_identity_reservations_invalid", "Current control-context event and journal identity reservations are required.");
  }
  const reservations = input as Record<string, unknown>;
  const result = new Set<string>();
  for (const value of [...reservations.event_ids as unknown[], ...reservations.journal_ids as unknown[]]) {
    if (typeof value !== "string") throw new HistoryError("history_reconstruction_identity_reservations_invalid", "Current control-context identity reservations must be UUIDv4 values.", { identity: value });
    if (!uuidV4.test(value) || result.has(value)) {
      fail("history_reconstruction_identity_reservations_invalid", "Current control-context identity reservations must be unique UUIDv4 values.", { identity: value });
    }
    result.add(value);
  }
  return result;
};

const requiredMaterialContainsProofs = (actions: readonly ReconstructionPlanAction[], material: HistoryRequiredMaterial): void => {
  for (const action of actions) {
    if (action.proof && !material.evidence.some((item) => item.reference === action.proof!.reference && item.content_version === action.proof!.content_version)) {
      fail("history_reconstruction_material_invalid", "Action proof must also be bound in required material.", { action_id: action.id });
    }
    if (action.authority) {
      for (const binding of action.authority.artifact_bindings) {
        if (binding.content_version && !material.artifact_bindings.some((item) => item.artifact_id === binding.artifact_id && item.content_version === binding.content_version)) {
          fail("history_reconstruction_material_invalid", "Action authority artifact bindings must appear in required material.", { action_id: action.id, artifact_id: binding.artifact_id });
        }
      }
    }
  }
};

export const prepareReconstruction = async (input: {
  readonly plan: unknown;
  readonly reset: unknown;
  readonly archive: ReconstructionArchive;
} & ReconstructionDependencies): Promise<PreparedReconstruction> => {
  if (typeof input.identity !== "function" || typeof input.clock !== "function" ||
      typeof input.verifyAuthority !== "function" || typeof input.verifyMaterial !== "function" || typeof input.verifyContinuation !== "function") {
    fail("history_reconstruction_verifier_required", "Identity, clock, and all authority/material/continuation verifiers are mandatory.");
  }
  if (!record(input.producer) || typeof input.producer.name !== "string" || !input.producer.name.trim() ||
      typeof input.producer.version !== "string" || !input.producer.version.trim()) {
    fail("history_reconstruction_producer_invalid", "Generated history requires the injected current producer identity.");
  }
  const identity = input.identity;
  const clock = input.clock;
  const verifyAuthority = input.verifyAuthority;
  const verifyMaterial = input.verifyMaterial;
  const verifyContinuation = input.verifyContinuation;
  const producer = Object.freeze({ name: input.producer.name, version: input.producer.version });
  const plan = freezeJson(cloneJson(parseReconstructionPlan(input.plan)));
  const reset = freezeJson(cloneJson(parseHistoryControl(input.reset)));
  const verifiedArchive = validateArchive(reset, plan, input.archive);
  const actionLines = validateSourceDispositions(plan, verifiedArchive.history_files, verifiedArchive.phase_journals);
  const resetManifest = reset.data.manifest;
  if (resetManifest.format !== "kepler.mission-history-reset") throw new HistoryError("history_reconstruction_reset_invalid", "Reconstruction requires a reset manifest.");
  const missingReferences = new Set(resetManifest.known_missing_sources.map((source) => source.reference));
  for (const action of plan.actions) {
    if (action.loss_reference !== null && !missingReferences.has(action.loss_reference)) {
      fail("history_reconstruction_loss_unknown", "A missing-source action must cite a loss declared by the selected reset.", { action_id: action.id, loss_reference: action.loss_reference });
    }
    if (action.loss_reference !== null && action.action !== "add") fail("history_reconstruction_loss_invalid", "Only an explicit addition can represent a declared missing source.", { action_id: action.id });
  }
  const archivedIdentities = archiveKnownIdentities(verifiedArchive.history_files, plan.mission_id);
  const reservedIds = new Set([
    ...archivedIdentities.identities,
    ...reservedControlIdentities(input.identity_reservations),
    ...plan.actions.map((action) => action.id),
    reset.id,
    reset.journal_id,
    plan.mission_id,
    plan.generation_id,
    ...(resetManifest.previous_control.event_id ? [resetManifest.previous_control.event_id] : []),
  ]);
  const bootstrapActions = plan.mode === "clean-restart"
    ? makeBootstrapActions(plan.clean_restart!, plan, reset, identity, reservedIds)
    : [];
  const actions = [...plan.actions, ...bootstrapActions];
  const originalEventIds = archivedIdentities.event_ids;
  const generatedPlanActions = actions.filter(generatedAction);
  const dependencyOrder = [...plan.dependency_order, ...bootstrapActions.map((action) => action.id)];
  const dependencyPosition = new Map(dependencyOrder.map((id, index) => [id, index]));
  const actionById = new Map(actions.map((action) => [action.id, action]));
  for (const action of generatedPlanActions) {
    for (const dependencyId of [
      ...action.event!.causes.flatMap((cause) => cause.action_id ? [cause.action_id] : []),
      ...action.data_bindings.map((binding) => binding.action_id),
    ]) {
      const dependency = actionById.get(dependencyId);
      if (!dependency) throw new HistoryError("history_reconstruction_dependency_missing", "A generated fact has an unresolved action dependency.", { action_id: action.id, dependency_id: dependencyId });
      if (generatedAction(dependency) && (dependencyPosition.get(dependencyId) ?? Infinity) >= (dependencyPosition.get(action.id) ?? -1)) {
        fail("history_reconstruction_dependency_order", "Generated facts must follow their explicit generated dependencies.", { action_id: action.id, dependency_id: dependencyId });
      }
    }
  }
  requiredMaterialContainsProofs(actions, plan.required_material);

  const nextIdentity = (): string => {
    const value = identity();
    if (!uuidV4.test(value) || reservedIds.has(value)) fail("history_reconstruction_identity_invalid", "The injected identity source did not return a fresh UUIDv4.", { identity: value });
    reservedIds.add(value);
    return value;
  };
  const eventIdByAction = new Map<string, string>();
  const outputEventsById = new Map<string, ConstructionEventRecord>();
  const actionByOutputEventId = new Map<string, ReconstructionPlanAction>();
  for (const action of actions) {
    if (action.action !== "retain") continue;
    const source = actionLines.get(action.id);
    const line = source?.line;
    const checked = source?.checked;
    if (!source || !line || !checked) throw new HistoryError("history_reconstruction_retain_invalid", "Retain actions must map to a complete validated source event.", { action_id: action.id });
    const sourceEvent = checked.scan.lines[line.line_index]?.event;
    const validation = sourceEvent ? validateConstructionEvent(sourceEvent) : undefined;
    if (validation?.status !== "valid") throw new HistoryError("history_reconstruction_retain_invalid", "Retained source event bytes were not parsed.", { action_id: action.id });
    const event = validation.event;
    eventIdByAction.set(action.id, event.id);
    outputEventsById.set(event.id, event);
    actionByOutputEventId.set(event.id, action);
  }

  interface Segment {
    readonly actionId: string;
    readonly eventId: string;
    readonly bytes: Uint8Array;
  }
  const outputSegments = new Map<string, Segment[]>();
  const sourceOutputJournals = new Map<string, string>();
  const outputCoordinates = new Map<string, HistoryAction["output"]>();
  const authorityChecks: Array<{ readonly action_id: string; readonly reference: string }> = [];

  const addSegment = (journalId: string, segment: Segment): void => {
    const segments = outputSegments.get(journalId) ?? [];
    segments.push(segment);
    outputSegments.set(journalId, segments);
  };

  for (const action of actions) {
    if (action.action !== "retain") continue;
    const range = action.source!;
    const checked = actionLines.get(action.id)!.checked;
    if (!checked) throw new HistoryError("history_reconstruction_retain_invalid", "Retained source journal metadata is missing.", { action_id: action.id });
    const source = checked.source;
    const previousSource = sourceOutputJournals.get(source.journal_id);
    if (previousSource && previousSource !== source.source_id) {
      fail("history_reconstruction_output_conflict", "Retained archive sources cannot share one output journal identity.", { journal_id: source.journal_id });
    }
    sourceOutputJournals.set(source.journal_id, source.source_id);
    const bytes = source.bytes.slice(range.byte_offset, range.byte_offset + range.byte_length);
    const eventId = eventIdByAction.get(action.id)!;
    addSegment(source.journal_id, { actionId: action.id, eventId, bytes });
  }

  const generatedById = new Map(generatedPlanActions.map((action) => [action.id, action]));
  for (const actionId of dependencyOrder) {
    const action = generatedById.get(actionId) ?? bootstrapActions.find((candidate) => candidate.id === actionId);
    if (!action?.event) throw new HistoryError("history_reconstruction_dependency_missing", "Dependency order includes an event without a generated action.", { action_id: actionId });
    const proposed = action.event;
    const journalId = nextIdentity();
    const eventId = nextIdentity();
    if (originalEventIds.has(eventId)) fail("history_reconstruction_identity_invalid", "Generated event IDs cannot reuse archived event identities.", { event_id: eventId });
    const data = cloneJson(proposed.data);
    for (const binding of action.data_bindings) {
      const targetEventId = eventIdByAction.get(binding.action_id);
      if (!targetEventId) throw new HistoryError("history_reconstruction_dependency_missing", "A data binding target has no selected output event.", { action_id: action.id, dependency_id: binding.action_id });
      setPointer(data, decodePointer(binding.pointer), binding.pointer, targetEventId);
    }
    const causes: EventEnvelope["caused_by"] = proposed.causes.map((cause): EventEnvelope["id"] => {
      if (cause.event_id !== null) return cause.event_id as EventEnvelope["id"];
      const mapped = cause.action_id === null ? undefined : eventIdByAction.get(cause.action_id);
      if (!mapped) throw new HistoryError("history_reconstruction_dependency_missing", "A generated cause has no selected output event.", { action_id: action.id, dependency_id: cause.action_id });
      return mapped as EventEnvelope["id"];
    });
    if (new Set(causes).size !== causes.length) fail("history_reconstruction_invalid", "A generated event cannot contain duplicate causes.", { action_id: action.id });
    const now = clock();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail("history_reconstruction_clock_invalid", "The injected current clock must return a valid Date.");
    const candidate: EventEnvelope = {
      id: eventId as EventEnvelope["id"],
      phase: "construction",
      type: proposed.type,
      envelope_version: EVENT_ENVELOPE_VERSION,
      event_version: proposed.event_version,
      journal_id: journalId as EventEnvelope["journal_id"],
      recorded_at: now.toISOString(),
      producer,
      caused_by: causes,
      data,
    };
    const validated = validateConstructionEvent(candidate);
    if (validated.status !== "valid") throw new HistoryError("history_reconstruction_event_invalid", "A generated fact failed the current Construction owner schema.", { action_id: action.id, validation: validated });
    if (validated.event.data.mission_id !== plan.mission_id || validated.event.phase !== "construction") {
      fail("history_reconstruction_event_invalid", "A generated fact must belong to the selected mission and Construction phase.", { action_id: action.id });
    }
    validateGeneratedAuthorityInput(action, validated.event);
    const authority = await verifierResult(verifyAuthority, {
      reset: cloneJson(reset),
      plan: cloneJson(plan),
      archive: cloneArchiveSnapshot(verifiedArchive.public_snapshot),
      action: cloneJson(action),
      event: cloneJson(validated.event),
    } satisfies ReconstructionAuthorityRequest, "history_reconstruction_authority_invalid", "authority");
    authorityChecks.push({ action_id: action.id, reference: authority.reference });
    const encoded = new TextEncoder().encode(`${serializeJournalEvent(validated.event)}\n`);
    addSegment(journalId, { actionId: action.id, eventId, bytes: encoded });
    eventIdByAction.set(action.id, eventId);
    outputEventsById.set(eventId, validated.event);
    actionByOutputEventId.set(eventId, action);
  }

  validateReconstructionReferences(outputEventsById, actionByOutputEventId);

  const candidateJournals: PreparedCandidateJournal[] = [];
  const finalActions = new Map<string, HistoryAction>();
  for (const action of actions) {
    finalActions.set(action.id, {
      ...action,
      output: { event_id: null, journal_id: null, byte_offset: null, byte_length: null },
    });
  }
  for (const [journalId, segments] of outputSegments) {
    const sorted = [...segments].sort((left, right) => {
      const leftAction = actions.find((action) => action.id === left.actionId)!;
      const rightAction = actions.find((action) => action.id === right.actionId)!;
      const leftRange = leftAction.source;
      const rightRange = rightAction.source;
      return (leftRange?.byte_offset ?? -1) - (rightRange?.byte_offset ?? -1) || compare(left.actionId, right.actionId);
    });
    let length = 0;
    for (const segment of sorted) {
      outputCoordinates.set(segment.actionId, {
        event_id: segment.eventId, journal_id: journalId, byte_offset: length, byte_length: segment.bytes.length,
      });
      const finalAction = finalActions.get(segment.actionId)!;
      finalActions.set(segment.actionId, { ...finalAction, output: outputCoordinates.get(segment.actionId)! });
      length += segment.bytes.length;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const segment of sorted) {
      bytes.set(segment.bytes, offset);
      offset += segment.bytes.length;
    }
    const metadata: HistoryCandidateJournal = {
      phase: "construction", journal_id: journalId, byte_length: bytes.length, content_version: historyDigest(bytes),
      reference: `candidate:${plan.generation_id}/construction/${journalId}`,
    };
    candidateJournals.push({ ...metadata, bytes });
  }
  candidateJournals.sort((left, right) => compare(left.phase, right.phase) || compare(left.journal_id, right.journal_id));
  if (candidateJournals.length === 0) fail("history_reconstruction_candidate_empty", "A reconstruction candidate must contain at least one validated event.");

  const candidateSources = candidateJournals.map((journal) => ({
    sourceId: `reconstruction/${journal.journal_id}`,
    generationId: plan.generation_id,
    missionId: plan.mission_id,
    phase: journal.phase,
    journalId: journal.journal_id,
    bytes: journal.bytes,
  }));
  const history = collectHistory(plan.mission_id, candidateSources, { completeness: "complete", generationId: plan.generation_id });
  if (history.issues.length) fail("history_reconstruction_history_invalid", "The complete candidate has damaged records, invalid identities, or missing/uncertain causes.", { issues: history.issues });
  const state = historyState(history);
  validateCandidateMissionBinding(resetManifest.mission_binding, history, "history_reconstruction_binding_mismatch");

  const requiredMaterial = cloneJson(plan.required_material);
  const candidateHistorySnapshot = (): HistoryCollection => collectHistory(plan.mission_id, candidateJournals.map((journal) => ({
    sourceId: `reconstruction/${journal.journal_id}`,
    generationId: plan.generation_id,
    missionId: plan.mission_id,
    phase: journal.phase,
    journalId: journal.journal_id,
    bytes: new Uint8Array(journal.bytes),
  })), { completeness: "complete", generationId: plan.generation_id });
  const materialCheck = await verifierResult(verifyMaterial, {
    reset: cloneJson(reset),
    plan: cloneJson(plan),
    archive: cloneArchiveSnapshot(verifiedArchive.public_snapshot),
    required_material: cloneJson(requiredMaterial),
    candidate_journals: candidateJournals.map((journal) => ({ ...journal, bytes: new Uint8Array(journal.bytes) })),
    history: candidateHistorySnapshot(),
    expected_state: cloneJson(state),
  } satisfies ReconstructionMaterialRequest, "history_reconstruction_material_invalid", "material");
  const continuationCheck = await verifierResult(verifyContinuation, {
    reset: cloneJson(reset),
    plan: cloneJson(plan),
    continuation: cloneJson(plan.continuation),
    history: candidateHistorySnapshot(),
    expected_state: cloneJson(state),
    required_material: cloneJson(requiredMaterial),
  } satisfies ReconstructionContinuationRequest, "history_reconstruction_continuation_invalid", "continuation");

  for (const action of actions) {
    if (action.action === "exclude") continue;
    const output = outputCoordinates.get(action.id);
    if (!output) fail("history_reconstruction_output_missing", "Every retained or generated action requires exact output coordinates.", { action_id: action.id });
  }
  const manifestActions = [...finalActions.values()].sort(compareActions);
  const manifest: HistoryRebuildManifest = {
    format: "kepler.mission-history-rebuild", version: 1,
    mission_id: plan.mission_id, generation_id: plan.generation_id, reset_event_id: reset.id,
    archive_id: plan.archive_id, archive_inventory_hash: plan.archive_inventory_hash,
    actions: manifestActions, dependency_order: dependencyOrder,
    candidate_journals: candidateJournals.map(({ bytes: _bytes, ...metadata }) => metadata),
    required_material: requiredMaterial, expected_state: state, continuation: cloneJson(plan.continuation),
    requester: plan.requester, reconciliation: cloneJson(plan.reconciliation),
  };
  const checkedManifest = parseHistoryManifest(manifest);
  if (checkedManifest.format !== "kepler.mission-history-rebuild") throw new HistoryError("history_reconstruction_manifest_invalid", "The prepared output did not produce a checked rebuild manifest.");
  const sourceToOutput = manifestActions.map((action): ReconstructionOutputMapping => ({
    action_id: action.id,
    disposition: action.action,
    source_id: action.source?.source_id ?? null,
    source_byte_offset: action.source?.byte_offset ?? null,
    source_byte_length: action.source?.byte_length ?? null,
    output_event_id: action.output.event_id,
    output_journal_id: action.output.journal_id,
    output_byte_offset: action.output.byte_offset,
    output_byte_length: action.output.byte_length,
    loss_reference: action.loss_reference,
  }));
  return {
    checked: true,
    manifest: checkedManifest,
    candidate_journals: candidateJournals,
    source_to_output: sourceToOutput,
    history,
    state,
    verification: {
      authority: authorityChecks,
      material: { reference: materialCheck.reference },
      continuation: { reference: continuationCheck.reference },
    },
  };
};
