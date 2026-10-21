import {
  EVENT_ENVELOPE_VERSION,
  type EventEnvelope,
  type EventId,
  type JournalId,
} from "@vialactea-works/kepler-core";
import {
  CONSTRUCTION_EVENT_VERSION,
  CONSTRUCTION_PHASE,
  validateConstructionEvent,
  type ConstructionEventType,
  type ConstructionStage,
  type EvidenceId,
  type MaterialInput,
} from "../construction/events.js";
import type { ScopeSelectors } from "../cli/scope-selectors.js";
import type { EventJournal } from "../history/journal.js";

export interface AuditRecordScope {
  readonly missionId: string;
  readonly unitId: string;
  readonly stage?: ConstructionStage;
  readonly stageAttemptId?: string;
  readonly taskId?: string;
  readonly activity?: string;
  readonly activityAttemptId?: string;
  readonly causedBy: readonly string[];
}

export interface AuditRecordIdentitySource {
  readonly next: () => string;
}

export interface AuditRecordRuntime {
  readonly identities: AuditRecordIdentitySource;
  readonly now: () => string;
  readonly producer: { readonly name: string; readonly version: string };
}

export interface AuditRecordRequestIssue {
  readonly pointer: string;
  readonly message: string;
}

export type AuditRecordResult =
  | { readonly kind: "valid"; readonly event: EventEnvelope; readonly evidenceId?: EvidenceId }
  | { readonly kind: "invalid"; readonly issues: readonly AuditRecordRequestIssue[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validInputs = (value: unknown): value is readonly MaterialInput[] =>
  Array.isArray(value) && value.every((item) => isRecord(item) &&
    hasOnlyKeys(item, ["reference", "purpose"]) &&
    nonEmptyString(item.reference) && nonEmptyString(item.purpose));

const requestKeys: Readonly<Record<AuditRecordKind, readonly string[]>> = {
  evidence: ["inputs", "artifact_bindings", "checkpoints", "check", "executor", "result", "output_refs", "conditions"],
  approval: ["requester", "inputs", "artifact_bindings", "checkpoints", "decision_reference"],
  interaction: ["participants", "content", "references", "reply_reference", "effort_selection"],
};

export type AuditRecordKind = "evidence" | "approval" | "interaction";

const validateRequest = (
  kind: AuditRecordKind,
  request: unknown,
): readonly AuditRecordRequestIssue[] => {
  if (!isRecord(request)) return [{ pointer: "", message: "Expected one JSON object." }];
  const issues: AuditRecordRequestIssue[] = [];
  for (const key of Object.keys(request)) {
    if (!requestKeys[kind].includes(key)) {
      issues.push({ pointer: `/${key}`, message: "Unknown request field." });
    }
  }
  const requireText = (key: string): void => {
    if (!nonEmptyString(request[key])) issues.push({ pointer: `/${key}`, message: "Expected non-empty text." });
  };
  if (kind !== "interaction" && !validInputs(request.inputs)) {
    issues.push({ pointer: "/inputs", message: "Expected inputs with non-empty reference and purpose fields." });
  }
  if (kind !== "interaction") {
    if (!Array.isArray(request.artifact_bindings)) issues.push({ pointer: "/artifact_bindings", message: "Expected the bound artifact versions." });
    if (!Array.isArray(request.checkpoints)) issues.push({ pointer: "/checkpoints", message: "Expected the repository checkpoint set." });
  }
  if (kind === "evidence") {
    requireText("check");
    requireText("executor");
    if (!isRecord(request.result) || !["passed", "failed", "inconclusive"].includes(String(request.result.status)) || !nonEmptyString(request.result.summary)) {
      issues.push({ pointer: "/result", message: "Expected a check result status and non-empty summary." });
    }
    if (request.output_refs !== undefined && (!Array.isArray(request.output_refs) || !request.output_refs.every(nonEmptyString))) {
      issues.push({ pointer: "/output_refs", message: "Expected an array of non-empty references." });
    }
    if (request.conditions !== undefined && (!Array.isArray(request.conditions) || !request.conditions.every(nonEmptyString))) {
      issues.push({ pointer: "/conditions", message: "Expected an array of non-empty conditions." });
    }
  } else if (kind === "approval") {
    requireText("requester");
    requireText("decision_reference");
  } else {
    if (!Array.isArray(request.participants) || request.participants.length === 0 || !request.participants.every(nonEmptyString)) {
      issues.push({ pointer: "/participants", message: "Expected at least one non-empty participant." });
    }
    requireText("content");
    if (request.references !== undefined && (!Array.isArray(request.references) || !request.references.every(nonEmptyString))) {
      issues.push({ pointer: "/references", message: "Expected an array of non-empty references." });
    }
    if (request.reply_reference !== undefined && !nonEmptyString(request.reply_reference)) {
      issues.push({ pointer: "/reply_reference", message: "Expected non-empty reference text." });
    }
    if (request.effort_selection !== undefined && !isRecord(request.effort_selection)) {
      issues.push({ pointer: "/effort_selection", message: "Expected a structured effort selection." });
    }
  }
  return issues;
};

const eventType = (kind: AuditRecordKind): ConstructionEventType =>
  `construction.${kind === "evidence" ? "evidence-recorded" : kind === "approval" ? "approval-recorded" : "interaction-recorded"}` as ConstructionEventType;

export interface AuditRecordContext {
  readonly scope: AuditRecordScope;
  readonly journalId: string;
  readonly journal: EventJournal;
}

export interface AuditRecordContextResolver {
  readonly resolve: (selectors: ScopeSelectors, project?: string, kind?: AuditRecordKind) => Promise<
    | { readonly kind: "resolved"; readonly context: AuditRecordContext }
    | { readonly kind: "failed"; readonly code: string; readonly message: string; readonly details: Readonly<Record<string, unknown>>; readonly recovery: string }
  >;
}

export interface AuditRecordingResult {
  readonly kind: "success" | "failed";
  readonly data: Readonly<Record<string, unknown>>;
}

export class AuditRecording {
  constructor(
    private readonly contexts: AuditRecordContextResolver,
    private readonly runtime: AuditRecordRuntime,
  ) {}

  async execute(
    kind: AuditRecordKind,
    selectors: ScopeSelectors,
    request: unknown,
    project?: string,
  ): Promise<AuditRecordingResult> {
    const context = await this.contexts.resolve(selectors, project, kind);
    if (context.kind === "failed") return { kind: "failed", data: {
      code: context.code,
      message: context.message,
      details: context.details,
      recovery: context.recovery,
    } };
    const created = createAuditRecord(kind, request, context.context.scope, context.context.journalId, this.runtime);
    if (created.kind === "invalid") {
      return {
        kind: "failed",
        data: {
          code: "invalid_audit_request",
          message: "The audit request or its phase bindings failed validation.",
          details: { issues: created.issues },
          recovery: "Correct the request and explicit scope bindings, then retry.",
        },
      };
    }
    try {
      await context.context.journal.append(created.event);
    } catch (error) {
      return {
        kind: "failed",
        data: {
          code: "audit_record_failed",
          message: "Kepler could not durably append the audit event.",
          details: { journal_id: context.context.journalId, message: error instanceof Error ? error.message : String(error) },
          recovery: "Inspect the selected journal for an appended or uncertain record before retrying.",
        },
      };
    }
    return {
      kind: "success",
      data: {
        id: created.event.id,
        journal_id: created.event.journal_id,
        ...(created.evidenceId ? { evidence_id: created.evidenceId } : {}),
      },
    };
  }
}

export const createAuditRecord = (
  kind: AuditRecordKind,
  request: unknown,
  scope: AuditRecordScope,
  journalId: string,
  runtime: AuditRecordRuntime,
): AuditRecordResult => {
  const issues = [...validateRequest(kind, request)];
  if (!isRecord(request)) return { kind: "invalid", issues };
  if (kind === "interaction" && isRecord(request.effort_selection) && request.effort_selection.target === "stage" &&
      request.effort_selection.stage !== scope.stage) {
    issues.push({ pointer: "/effort_selection/stage", message: "A stage effort selection must match the explicit audit stage scope." });
  }
  const eventId = runtime.identities.next();
  const evidenceId = kind === "evidence" ? runtime.identities.next() : undefined;
  if (kind === "evidence" && eventId === evidenceId) {
    issues.push({ pointer: "/", message: "Event and evidence identities must be distinct." });
  }
  const common = {
    mission_id: scope.missionId,
    unit_id: scope.unitId,
    ...(scope.stage ? { stage: scope.stage } : {}),
    ...(scope.stageAttemptId ? { stage_attempt_id: scope.stageAttemptId } : {}),
    ...(scope.taskId ? { task_id: scope.taskId } : {}),
    ...(scope.activity ? { activity: scope.activity } : {}),
    ...(scope.activityAttemptId ? { activity_attempt_id: scope.activityAttemptId } : {}),
  };
  const data = kind === "evidence"
    ? {
        ...common,
        evidence_id: evidenceId,
        artifact_bindings: request.artifact_bindings,
        checkpoints: request.checkpoints,
        inputs: request.inputs,
        check: request.check,
        executor: request.executor,
        result: request.result,
        output_refs: request.output_refs ?? [],
        conditions: request.conditions ?? [],
      }
    : kind === "approval"
      ? {
          ...common,
          artifact_bindings: request.artifact_bindings,
          checkpoints: request.checkpoints,
          requester: request.requester,
          inputs: request.inputs,
          decision_reference: request.decision_reference,
        }
      : {
          mission_id: scope.missionId,
          unit_id: scope.unitId,
          participants: request.participants,
          content: request.content,
          references: request.references ?? [],
          ...(request.reply_reference === undefined ? {} : { reply_reference: request.reply_reference }),
          ...(request.effort_selection === undefined ? {} : { effort_selection: request.effort_selection }),
        };
  const event: EventEnvelope = {
    id: eventId as EventId,
    phase: CONSTRUCTION_PHASE,
    type: eventType(kind),
    envelope_version: EVENT_ENVELOPE_VERSION,
    event_version: CONSTRUCTION_EVENT_VERSION,
    journal_id: journalId as JournalId,
    recorded_at: runtime.now(),
    producer: runtime.producer,
    caused_by: [...scope.causedBy] as EventId[],
    data,
  };
  const validation = validateConstructionEvent(event);
  if (validation.status !== "valid") {
    const errors = validation.status === "invalid"
      ? validation.issues.map((issue) => ({ pointer: issue.path, message: issue.message }))
      : [{ pointer: "/", message: `Unsupported Construction event: ${validation.reason}.` }];
    return { kind: "invalid", issues: [...issues, ...errors] };
  }
  if (issues.length > 0) return { kind: "invalid", issues };
  return { kind: "valid", event: validation.event, ...(evidenceId ? { evidenceId: evidenceId as EvidenceId } : {}) };
};
