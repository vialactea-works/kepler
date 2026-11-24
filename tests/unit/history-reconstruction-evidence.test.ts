import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { historyDigest, type HistoryRebuildManifest } from "../../packages/cli/src/history/control.js";
import { canonicalJson } from "../../packages/cli/src/history/journal.js";
import { ReconstructionEvidence, historyReconstructionActionHash, verifyReconstructionGraphMaterial, parseHistoryAuthorityDocument, parseHistoryFactProof, type ResolvedHistoryMaterial } from "../../packages/cli/src/history/reconstruction-evidence.js";
import { validateConstructionEvent } from "../../packages/cli/src/construction/events.js";
import type { ReconstructionAuthorityRequest, ReconstructionMaterialRequest, ReconstructionPlanAction } from "../../packages/cli/src/history/reconstruction.js";
import { historyReconstructionFixture } from "../support/history-reconstruction.js";
import { historyTestBytes, historyTestEvent } from "../support/history-generation.js";
import { taskGraphExample } from "../fixtures/task-graph.js";

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(`${canonicalJson(value)}\n`);
const fixture = async () => {
  const t = await historyReconstructionFixture();
  const prepared = await t.drafts.prepare(t.scope, t.request);
  const checked = await t.drafts.verify(t.scope, prepared.manifest as HistoryRebuildManifest);
  const sources = new Map<string, ResolvedHistoryMaterial>();
  const store = (reference: string, bytes: Uint8Array, path = `.kepler/missions/${t.f.missionId}/recovery/evidence/material.json`) => { const value = { reference, bytes: new Uint8Array(bytes), source_path: path, content_version: historyDigest(bytes) }; sources.set(reference, value); return { reference, content_version: value.content_version }; };
  const evidence = new ReconstructionEvidence({ readMaterial: async (reference) => { const value = sources.get(reference); if (!value) throw new Error("Required fixture material is unavailable"); return { ...value, bytes: new Uint8Array(value.bytes) }; }, checkpoint: async () => ({ exists: false }) });
  const action = t.plan.actions.find((action) => action.action === "add")!;
  const event = checked.history.events.find((record) => record.constructionEvent?.type === "construction.interaction-recorded")!.constructionEvent!;
  const source = store("material:requester-excerpt", new TextEncoder().encode("The requester approved this exact bounded continuation.\n"));
  const authority = { format: "kepler.history-action-authority", version: 1, mission_id: t.f.missionId, requester: t.plan.requester, decision_reference: action.authority!.decision_reference, decision: "approved", subject: { kind: "action", input_hash: historyReconstructionActionHash(action) }, source_material: [source] };
  const authorityMaterial = store(action.authority!.decision_reference, encode(authority));
  const plan = { ...t.plan, required_material: { ...t.plan.required_material, evidence: [authorityMaterial] } };
  const request: ReconstructionAuthorityRequest = { reset: t.reset, plan, archive: t.archive, action, event };
  const materialRequest: ReconstructionMaterialRequest = { reset: t.reset, plan, archive: t.archive, required_material: plan.required_material, candidate_journals: checked.candidate_journals, history: checked.history, expected_state: checked.state };
  return { ...t, plan, checked, sources, store, evidence, authority, request, materialRequest };
};

describe("actual reconstruction authority and material", () => {
  it("requires exact action authority and readable source decision material", async () => {
    const t = await fixture();
    expect(await t.evidence.authority(t.request)).toMatchObject({ status: "valid", reference: t.request.action.authority!.decision_reference });
    t.store(t.request.action.authority!.decision_reference, encode({ ...t.authority, subject: { ...t.authority.subject, input_hash: historyDigest("another action") } }));
    expect(await t.evidence.authority(t.request)).toMatchObject({ status: "invalid" });
    t.store(t.request.action.authority!.decision_reference, encode(t.authority));
    t.sources.delete("material:requester-excerpt");
    expect(await t.evidence.authority(t.request)).toMatchObject({ status: "invalid" });
  });

  it("rejects wrong requester, stale action input and another reset scope", async () => {
    const t = await fixture();
    t.store(t.request.action.authority!.decision_reference, encode({ ...t.authority, requester: "Another requester" }));
    expect(await t.evidence.authority(t.request)).toMatchObject({ status: "invalid" });
    expect(await t.evidence.authority({ ...t.request, action: { ...t.request.action, reason: "Different action input" } })).toMatchObject({ status: "invalid" });
    expect(await t.evidence.authority({ ...t.request, plan: { ...t.plan, reset_event_id: randomUUID() } })).toMatchObject({ status: "invalid" });
  });

  it("checks retained normal owner facts and their actual output bytes for generated evidence", async () => {
    const t = await fixture();
    const output = t.store("material:unit-check-output", new TextEncoder().encode("1 unit test passed\n"));
    const data = { mission_id: t.f.missionId, unit_id: t.f.unitId, stage: "functional-design", stage_attempt_id: randomUUID(), evidence_id: randomUUID(), artifact_bindings: [], checkpoints: [], inputs: [], check: "unit fixture", executor: "worker:bounded", result: { status: "passed", summary: "The actual fixture unit check passed" }, output_refs: [output.reference], conditions: ["The check passed"] };
    const recorded = historyTestEvent("construction.evidence-recorded", data, randomUUID(), [t.f.unit.id]);
    const validation = validateConstructionEvent(historyTestEvent("construction.evidence-recorded", data, randomUUID(), [t.f.unit.id]));
    if (validation.status !== "valid") throw new Error("Invalid public evidence fixture");
    const source = t.store("material:original-owner-fact", historyTestBytes([recorded]));
    const reference = "material:exact-fact-proof";
    let action: ReconstructionPlanAction = { id: randomUUID(), action: "add", source: null, event: { phase: "construction", type: "construction.evidence-recorded", event_version: 1, data, causes: [{ event_id: t.f.unit.id, action_id: null }] }, reason: "Recover the actual checked result", authority: null, proof: { reference, content_version: historyDigest("not recorded yet") }, loss_reference: null, data_bindings: [] };
    const hash = historyReconstructionActionHash(action);
    const proof = t.store(reference, encode({ format: "kepler.history-fact-proof", version: 1, mission_id: t.f.missionId, action_input_hash: hash, source_fact: source, supporting_outputs: [output] }));
    action = { ...action, proof };
    expect(historyReconstructionActionHash(action)).toBe(hash);
    const plan = { ...t.plan, actions: [...t.plan.actions, action].sort((a, b) => (a.source?.source_id ?? "").localeCompare(b.source?.source_id ?? "") || (a.source?.byte_offset ?? -1) - (b.source?.byte_offset ?? -1) || a.id.localeCompare(b.id)), dependency_order: [...t.plan.dependency_order, action.id], required_material: { ...t.plan.required_material, evidence: [proof] } };
    const request = { ...t.request, plan, action, event: validation.event };
    expect(await t.evidence.authority(request)).toMatchObject({ status: "valid" });
    t.sources.set(output.reference, { ...t.sources.get(output.reference)!, bytes: new Uint8Array() });
    expect(await t.evidence.authority(request)).toMatchObject({ status: "invalid" });
  });

  it("rejects boolean-only, malformed, duplicate-key and unknown evidence contracts", async () => {
    const t = await fixture();
    expect(() => parseHistoryAuthorityDocument({ ...t.authority, checked: true })).toThrow();
    expect(() => parseHistoryAuthorityDocument({ ...t.authority, source_material: [] })).toThrow();
    expect(() => parseHistoryAuthorityDocument('{"version":1,"version":1}')).toThrow();
    expect(() => parseHistoryFactProof({ checked: true })).toThrow();
    expect(() => parseHistoryFactProof("not JSON")).toThrow();
  });

  it("checks actual candidate state even when no extra material is required", async () => {
    const t = await fixture();
    expect(await t.evidence.material(t.materialRequest)).toMatchObject({ status: "valid" });
    expect(await t.evidence.material({ ...t.materialRequest, expected_state: {} })).toMatchObject({ status: "invalid" });
    const journal = t.materialRequest.candidate_journals[0]!;
    expect(await t.evidence.material({ ...t.materialRequest, candidate_journals: [{ ...journal, bytes: new TextEncoder().encode("unreadable event\n") }] })).toMatchObject({ status: "invalid" });
  });

  it("validates artifact bytes, identity and unit ownership with the real artifact reader", async () => {
    const t = await fixture();
    const id = randomUUID();
    const path = `.kepler/missions/${t.f.missionId}/construction/units-of-work/${t.f.unitId}/details/functional-design/source.md`;
    const material = t.store("material:artifact", new TextEncoder().encode(`---\nid: ${id}\ntype: supporting-document\nschema_version: 3\nunit_id: ${t.f.unitId}\nauthor: Fixture <fixture@example.test>\n---\n\n# Source\n\nRetained design evidence.\n`), path);
    const required = { ...t.plan.required_material, artifact_bindings: [{ ...material, artifact_id: id }] };
    const request = { ...t.materialRequest, plan: { ...t.plan, required_material: required }, required_material: required };
    const result = await t.evidence.material(request);
    expect(result.status === "valid" ? result.status : result.reason).toBe("valid");
    t.sources.set(material.reference, { ...t.sources.get(material.reference)!, source_path: ".kepler/unrelated/source.md" });
    expect(await t.evidence.material(request)).toMatchObject({ status: "invalid" });
  });

  it("checks retained graph and task-definition bytes through the normal graph owner", () => {
    const graph = taskGraphExample();
    const missionId = randomUUID();
    const bytes = new TextEncoder().encode(`${JSON.stringify(graph)}\n`);
    const material = { reference: "material:actual-graph", content_version: historyDigest(bytes), bytes, source_path: `.kepler/missions/${missionId}/construction/units-of-work/${graph.unit_id}/tasks-dag.json` };
    const input = { missionId, unitId: graph.unit_id, material, graphReference: { graph_id: graph.id, content_version: material.content_version }, planArtifactId: randomUUID(), executionIdentities: [], taskDefinition: { graph_id: graph.id, task_id: graph.tasks[0]!.id, content_version: historyDigest(JSON.stringify(graph.tasks[0])) } };
    expect(verifyReconstructionGraphMaterial(input)).toMatchObject({ status: "valid" });
    expect(verifyReconstructionGraphMaterial({ ...input, taskDefinition: { ...input.taskDefinition, content_version: historyDigest("another task body") } })).toMatchObject({ status: "invalid" });
    expect(verifyReconstructionGraphMaterial({ ...input, executionIdentities: [graph.id] })).toMatchObject({ status: "invalid" });
    expect(verifyReconstructionGraphMaterial({ ...input, material: { ...material, source_path: "outside/tasks-dag.json" } })).toMatchObject({ status: "invalid" });
  });

  it("does not accept a caller's checkpoint existence claim without a real reader result", async () => {
    const t = await fixture();
    const required = { ...t.plan.required_material, checkpoints: [{ repository_id: "record-home", commit: "a".repeat(40) }] };
    expect(await t.evidence.material({ ...t.materialRequest, plan: { ...t.plan, required_material: required }, required_material: required })).toMatchObject({ status: "invalid" });
  });
});
