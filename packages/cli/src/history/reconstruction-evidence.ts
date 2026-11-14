import { Ajv, type AnySchemaObject } from "ajv";
import { markdownArtifactReader } from "@vialactea-works/kepler-core";
import { validateConstructionEvent, type ConstructionEventRecord, type RepositoryCheckpoint } from "../construction/events.js";
import { projectConstruction } from "../construction/projection.js";
import { readTaskGraph } from "../construction/task-graph.js";
import { parseStrictJson } from "../json/strict-json.js";
import { collectHistory } from "./collection.js";
import { HistoryError, historyDigest, parseHistoryControl, type HistoryMaterial } from "./control.js";
import { historyState } from "./gateway.js";
import { canonicalJson, scanJournalBytes } from "./journal.js";
import { parseHistoryArchiveIndex } from "./archive-index.js";
import { parseReconstructionPlan, type ReconstructionArchive, type ReconstructionAuthorityRequest, type ReconstructionCheck, type ReconstructionMaterialRequest, type ReconstructionPlanAction } from "./reconstruction.js";

export interface HistoryAuthorityDocument {
  readonly format: "kepler.history-action-authority";
  readonly version: 1;
  readonly mission_id: string;
  readonly requester: string;
  readonly decision_reference: string;
  readonly decision: "approved";
  readonly subject: { readonly kind: "action" | "clean-restart"; readonly input_hash: string };
  readonly source_material: readonly HistoryMaterial[];
}

export interface HistoryFactProof {
  readonly format: "kepler.history-fact-proof";
  readonly version: 1;
  readonly mission_id: string;
  readonly action_input_hash: string;
  readonly source_fact: HistoryMaterial;
  readonly supporting_outputs: readonly HistoryMaterial[];
}

export interface ResolvedHistoryMaterial extends HistoryMaterial {
  readonly bytes: Uint8Array;
  readonly source_path: string;
}

export interface ReconstructionEvidenceRuntime {
  readonly readMaterial: (reference: string, archive: ReconstructionArchive, history?: ReconstructionMaterialRequest["history"]) => Promise<ResolvedHistoryMaterial>;
  readonly checkpoint: (checkpoint: RepositoryCheckpoint, sourcePath: string | null, history: ReconstructionMaterialRequest["history"]) => Promise<{ readonly exists: boolean; readonly bytes?: Uint8Array }>;
}

const text: AnySchemaObject = { type: "string", minLength: 1, pattern: "\\S" };
const digest: AnySchemaObject = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const uuid: AnySchemaObject = { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" };
const object = (properties: Record<string, AnySchemaObject>): AnySchemaObject => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const material = object({ reference: text, content_version: digest });
const validateAuthority = new Ajv({ strict: true }).compile(object({ format: { const: "kepler.history-action-authority" }, version: { const: 1 }, mission_id: uuid, requester: text, decision_reference: text, decision: { const: "approved" }, subject: object({ kind: { enum: ["action", "clean-restart"] }, input_hash: digest }), source_material: { type: "array", minItems: 1, items: material } }));
const validateProof = new Ajv({ strict: true }).compile(object({ format: { const: "kepler.history-fact-proof" }, version: { const: 1 }, mission_id: uuid, action_input_hash: digest, source_fact: material, supporting_outputs: { type: "array", minItems: 1, items: material } }));
const decoder = new TextDecoder("utf-8", { fatal: true });
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(canonicalJson(value)) as T;
const archiveCopy = (archive: ReconstructionArchive): ReconstructionArchive => ({ index: parseHistoryArchiveIndex(clone(archive.index)), files: archive.files.map((file) => ({ ...file, bytes: new Uint8Array(file.bytes) })) });
const invalid = (reason: string): ReconstructionCheck => ({ status: "invalid", reason });
const strict = (value: unknown): unknown => { const parsed = parseStrictJson(typeof value === "string" ? value : canonicalJson(value)); if (parsed.kind !== "parsed") throw new HistoryError("history_proof_invalid", "Recovery evidence must contain one strict JSON value."); return parsed.value; };

export const parseHistoryAuthorityDocument = (input: unknown): HistoryAuthorityDocument => {
  const value = strict(input);
  if (!validateAuthority(value)) throw new HistoryError("history_authority_invalid", "Requester authority must match the strict action-authority contract.");
  return value as HistoryAuthorityDocument;
};

export const parseHistoryFactProof = (input: unknown): HistoryFactProof => {
  const value = strict(input);
  if (!validateProof(value)) throw new HistoryError("history_proof_invalid", "A completed or checked fact requires its exact retained fact and output material.");
  return value as HistoryFactProof;
};

export const historyReconstructionActionHash = (action: ReconstructionPlanAction): string => historyDigest(canonicalJson({ ...action, proof: action.proof ? { reference: action.proof.reference } : null }));

const mask = (value: Readonly<Record<string, unknown>>, pointers: readonly string[]): Record<string, unknown> => {
  const result = clone(value) as Record<string, unknown>;
  for (const pointer of pointers) {
    const parts = pointer.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
    let current: unknown = result;
    for (const part of parts.slice(0, -1)) { if (!record(current) && !Array.isArray(current) || !Object.hasOwn(current, part)) throw new HistoryError("history_proof_invalid", "A proof data binding does not resolve in its actual source fact."); current = (current as Record<string, unknown>)[part]; }
    const last = parts.at(-1)!;
    if (!record(current) && !Array.isArray(current) || !Object.hasOwn(current, last)) throw new HistoryError("history_proof_invalid", "A proof data binding does not resolve in its actual source fact.");
    (current as Record<string, unknown>)[last] = "reconstructed-event-reference";
  }
  return result;
};

export const verifyReconstructionGraphMaterial = (input: {
  readonly missionId: string;
  readonly unitId: string;
  readonly material: ResolvedHistoryMaterial;
  readonly graphReference: { readonly graph_id: string; readonly content_version: string };
  readonly planArtifactId: string;
  readonly executionIdentities: readonly string[];
  readonly taskDefinition?: { readonly graph_id: string; readonly task_id: string; readonly content_version: string };
}): ReconstructionCheck => {
  const path = `.kepler/missions/${input.missionId}/construction/units-of-work/${input.unitId}/tasks-dag.json`;
  if (input.material.source_path !== path || historyDigest(input.material.bytes) !== input.material.content_version || input.material.content_version !== input.graphReference.content_version) return invalid("The actual task graph bytes or mission-owned path differ from their recorded binding.");
  let parsed;
  try { parsed = readTaskGraph(decoder.decode(input.material.bytes), { unitDirectoryId: input.unitId, planUnitId: input.unitId, planArtifactId: input.planArtifactId, executionIdentities: input.executionIdentities }); } catch { return invalid("The retained task graph cannot be read by its normal owner."); }
  if (parsed.kind !== "valid" || parsed.graph.id !== input.graphReference.graph_id) return invalid("The retained task graph fails its normal owner validation or recorded graph identity.");
  if (input.taskDefinition) {
    const task = parsed.graph.tasks.find((task) => task.id === input.taskDefinition!.task_id);
    if (!task || input.taskDefinition.graph_id !== parsed.graph.id || historyDigest(JSON.stringify(task)) !== input.taskDefinition.content_version) return invalid("The actual task definition differs from its recorded admission binding.");
  }
  return { status: "valid", reference: input.material.reference };
};

const proofRequired = (event: ConstructionEventRecord): boolean => ["construction.evidence-recorded", "construction.stage-attempt-completed", "construction.activity-attempt-completed", "construction.task-completed", "construction.integration-accepted", "construction.implementation-completion-assessed"].includes(event.type);

export class ReconstructionEvidence {
  private readonly runtime: ReconstructionEvidenceRuntime;

  public constructor(runtime: ReconstructionEvidenceRuntime) {
    if (typeof runtime.readMaterial !== "function" || typeof runtime.checkpoint !== "function") throw new HistoryError("history_material_reader_required", "Recovery needs actual retained material and repository checkpoint readers.");
    this.runtime = { ...runtime };
  }

  public async authority(input: ReconstructionAuthorityRequest): Promise<ReconstructionCheck> {
    const request = { reset: parseHistoryControl(input.reset), plan: parseReconstructionPlan(input.plan), action: clone(input.action), event: clone(input.event), archive: archiveCopy(input.archive) };
    try {
      if (request.event.data.mission_id !== request.plan.mission_id || request.reset.id !== request.plan.reset_event_id || request.reset.data.generation_id !== request.plan.generation_id) return invalid("Action evidence has another mission or reset binding.");
      const original = request.plan.actions.find((action) => action.id === request.action.id);
      const bootstrapAction = request.plan.mode === "clean-restart" && request.plan.clean_restart !== null && !original && ["construction.mission-created", "construction.mission-workspaces-prepared", "construction.unit-created"].includes(request.event.type);
      if (original ? canonicalJson(original) !== canonicalJson(request.action) : !bootstrapAction) return invalid("The proposed fact is not the exact selected plan action or its confirmed clean-restart bootstrap.");
      if (request.action.authority) {
        const reference = request.action.authority.decision_reference;
        const resolved = await this.read(reference, request.archive);
        if (!request.plan.required_material.evidence.some((material) => material.reference === reference && material.content_version === resolved.content_version)) return invalid("The approved reconstruction must bind the exact retained requester decision bytes as required evidence.");
        const authority = parseHistoryAuthorityDocument(decoder.decode(resolved.bytes));
        const bootstrap = bootstrapAction;
        const expectedHash = bootstrap ? historyDigest(canonicalJson(request.plan.clean_restart)) : historyReconstructionActionHash(request.action);
        if (authority.mission_id !== request.plan.mission_id || authority.requester !== request.plan.requester || authority.decision_reference !== reference || authority.subject.kind !== (bootstrap ? "clean-restart" : "action") || authority.subject.input_hash !== expectedHash) return invalid("The retained requester decision does not authorize this exact action or confirmed clean-restart context.");
        for (const material of authority.source_material) await this.read(material.reference, request.archive, material.content_version);
      } else if (!request.action.proof) return invalid("Generated facts require an explicit retained requester decision or actual fact proof.");
      if (proofRequired(request.event) && !request.action.proof) return invalid("Completed or checked facts require retained actual output proof.");
      if (request.action.proof) await this.proof(request);
      return { status: "valid", reference: request.action.authority?.decision_reference ?? request.action.proof!.reference };
    } catch (error) { return invalid(error instanceof Error ? error.message : String(error)); }
  }

  public async material(input: ReconstructionMaterialRequest): Promise<ReconstructionCheck> {
    const plan = parseReconstructionPlan(input.plan);
    const reset = parseHistoryControl(input.reset);
    const required = clone(input.required_material);
    const archive = archiveCopy(input.archive);
    const history = collectHistory(plan.mission_id, input.candidate_journals.map((journal) => ({ sourceId: journal.reference, missionId: plan.mission_id, generationId: plan.generation_id, phase: journal.phase, journalId: journal.journal_id, bytes: new Uint8Array(journal.bytes) })), { completeness: "complete", generationId: plan.generation_id });
    try {
      if (reset.id !== plan.reset_event_id || reset.data.mission_id !== plan.mission_id || reset.data.generation_id !== plan.generation_id || canonicalJson(required) !== canonicalJson(plan.required_material) || canonicalJson(historyState(history)) !== canonicalJson(input.expected_state)) return invalid("Required material and actual candidate have inconsistent scope or state.");
      const units = projectConstruction(history).units;
      const artifacts: { readonly id: string; readonly material: ResolvedHistoryMaterial; readonly type: string; readonly unitId: string | undefined }[] = [];
      for (const binding of required.artifact_bindings) {
        const resolved = await this.read(binding.reference, archive, binding.content_version, this.copyHistory(history, plan.generation_id));
        const parsed = markdownArtifactReader.parse(resolved.source_path, decoder.decode(resolved.bytes));
        if (parsed.kind !== "parsed" || !record(parsed.artifact.metadata) || parsed.artifact.metadata.id !== binding.artifact_id) return invalid("A required artifact has invalid metadata or another identity.");
        const unitId = typeof parsed.artifact.metadata.unit_id === "string" ? parsed.artifact.metadata.unit_id : undefined;
        const checked = markdownArtifactReader.validate(parsed.artifact, unitId ? { scope: "unit", unitId } : { scope: "project" });
        if (checked.kind !== "valid" || unitId && !units.some((unit) => unit.unitId === unitId) || unitId && !resolved.source_path.startsWith(`.kepler/missions/${plan.mission_id}/construction/units-of-work/${unitId}/`)) return invalid("Required artifact ownership or content does not pass its normal owner contract.");
        artifacts.push({ id: binding.artifact_id, material: resolved, type: String(parsed.artifact.metadata.type), unitId });
      }
      for (const checkpoint of required.checkpoints) if (!(await this.runtime.checkpoint(clone(checkpoint), null, this.copyHistory(history, plan.generation_id))).exists) return invalid("A required commit is unavailable in its actual prepared repository.");
      const evidence: ResolvedHistoryMaterial[] = [];
      for (const material of required.evidence) evidence.push(await this.read(material.reference, archive, material.content_version, this.copyHistory(history, plan.generation_id)));
      for (const collected of history.events) {
        const event = collected.constructionEvent;
        if (!event) return invalid("A candidate fact has no valid current owner schema.");
        const data = event.data as unknown as Record<string, unknown>;
        if (record(data.graph_ref)) {
          const graphReference = data.graph_ref;
          const unitId = String(data.unit_id);
          const graph = evidence.find((material) => material.content_version === graphReference.content_version && material.source_path === `.kepler/missions/${plan.mission_id}/construction/units-of-work/${unitId}/tasks-dag.json`);
          const authored = artifacts.filter((artifact) => artifact.type === "implementation-plan" && artifact.unitId === unitId && artifact.material.source_path.endsWith("/plan.md"));
          if (!graph || new Set(authored.map((artifact) => artifact.id)).size !== 1) return invalid("A candidate graph binding lacks its actual canonical task graph and checked authored plan.");
          const checked = verifyReconstructionGraphMaterial({ missionId: plan.mission_id, unitId, material: graph, graphReference: graphReference as { readonly graph_id: string; readonly content_version: string }, planArtifactId: authored[0]!.id, executionIdentities: history.events.flatMap((record) => record.event ? [record.event.id] : []), ...(record(data.task_definition_ref) ? { taskDefinition: data.task_definition_ref as { readonly graph_id: string; readonly task_id: string; readonly content_version: string } } : {}) });
          if (checked.status !== "valid") return checked;
          if (record(graphReference.checkpoint)) {
            const checkpoint = graphReference.checkpoint as unknown as RepositoryCheckpoint;
            if (!required.checkpoints.some((value) => value.repository_id === checkpoint.repository_id && value.commit === checkpoint.commit)) return invalid("The graph checkpoint is absent from required material.");
            const actual = await this.runtime.checkpoint(clone(checkpoint), graph.source_path, this.copyHistory(history, plan.generation_id));
            if (!actual.exists || !actual.bytes || historyDigest(actual.bytes) !== graph.content_version) return invalid("Actual committed task-graph bytes differ from the recorded graph binding.");
          }
        }
        if (Array.isArray(data.artifact_bindings)) for (const raw of data.artifact_bindings) {
          if (!record(raw) || typeof raw.artifact_id !== "string") return invalid("A candidate artifact binding is malformed.");
          const matching = artifacts.filter((artifact) => artifact.id === raw.artifact_id && (typeof raw.content_version !== "string" || artifact.material.content_version === raw.content_version));
          if (!matching.length) return invalid("A candidate fact uses artifact material omitted from the checked required set.");
          if (record(raw.checkpoint)) {
            const checkpoint = raw.checkpoint as unknown as RepositoryCheckpoint;
            if (!required.checkpoints.some((value) => value.repository_id === checkpoint.repository_id && value.commit === checkpoint.commit)) return invalid("A bound artifact checkpoint is absent from required material.");
            let exact = false;
            for (const artifact of matching) { const actual = await this.runtime.checkpoint(clone(checkpoint), artifact.material.source_path, this.copyHistory(history, plan.generation_id)); if (actual.exists && actual.bytes && historyDigest(actual.bytes) === artifact.material.content_version) exact = true; }
            if (!exact) return invalid("The actual committed artifact bytes differ from their retained binding.");
          }
        }
        for (const field of ["checkpoints", "candidate_checkpoints"] as const) if (Array.isArray(data[field])) for (const raw of data[field]) if (!record(raw) || !required.checkpoints.some((value) => value.repository_id === raw.repository_id && value.commit === raw.commit)) return invalid("A candidate fact references an unchecked repository checkpoint.");
      }
      return { status: "valid", reference: `verified-reconstruction-material:${historyDigest(canonicalJson(required)).slice(7)}` };
    } catch (error) { return invalid(error instanceof Error ? error.message : String(error)); }
  }

  private copyHistory(history: ReconstructionMaterialRequest["history"], generationId: string) {
    return collectHistory(history.missionId, history.journals.map((journal) => ({ sourceId: journal.sourceId, missionId: journal.missionId, generationId, phase: journal.phase, journalId: journal.journalId, bytes: new Uint8Array(journal.bytes) })), { completeness: history.sourceSetComplete ? "complete" : "incomplete", generationId });
  }

  private async read(reference: string, archive: ReconstructionArchive, expected?: string, history?: ReconstructionMaterialRequest["history"]): Promise<ResolvedHistoryMaterial> {
    const input = await this.runtime.readMaterial(reference, archiveCopy(archive), history);
    const bytes = new Uint8Array(input.bytes);
    if (input.reference !== reference || !bytes.length || historyDigest(bytes) !== input.content_version || expected !== undefined && input.content_version !== expected) throw new HistoryError("history_material_changed", "Required evidence is missing, empty, altered, or bound to another reference.");
    return { reference, content_version: input.content_version, source_path: input.source_path, bytes };
  }

  private async proof(request: ReconstructionAuthorityRequest): Promise<void> {
    const material = request.action.proof!;
    const resolved = await this.read(material.reference, request.archive, material.content_version);
    const proof = parseHistoryFactProof(decoder.decode(resolved.bytes));
    if (proof.mission_id !== request.plan.mission_id || proof.action_input_hash !== historyReconstructionActionHash(request.action)) throw new HistoryError("history_proof_invalid", "The actual proof does not bind this exact proposed action.");
    const source = await this.read(proof.source_fact.reference, request.archive, proof.source_fact.content_version);
    const scan = scanJournalBytes(source.bytes);
    const validation = scan.lines.length === 1 && !scan.problems.length && scan.lines[0]?.event ? validateConstructionEvent(scan.lines[0].event) : undefined;
    if (validation?.status !== "valid" || validation.event.type !== request.event.type || validation.event.event_version !== request.event.event_version || canonicalJson(mask(validation.event.data, request.action.data_bindings.map((binding) => binding.pointer))) !== canonicalJson(mask(request.event.data, request.action.data_bindings.map((binding) => binding.pointer)))) throw new HistoryError("history_proof_invalid", "The retained owner fact does not establish the actual proposed fact's data.");
    for (const material of proof.supporting_outputs) await this.read(material.reference, request.archive, material.content_version);
    const outputRefs = validation.event.data.output_refs;
    if (validation.event.type === "construction.evidence-recorded" && (!Array.isArray(outputRefs) || outputRefs.some((reference: unknown) => typeof reference !== "string" || !proof.supporting_outputs.some((material) => material.reference === reference)))) throw new HistoryError("history_proof_invalid", "Actual check outputs are not completely retained and bound.");
  }
}
