import { describe, expect, it, vi } from "vitest";
import { executeRecoveryRequest, parseRecoveryReconstructionRequest } from "../../packages/cli/src/cli/recovery-execution.js";
import { historyReconstructionFixture } from "../support/history-reconstruction.js";

const candidate = "10000000-0000-4000-8000-000000000001";

describe("recovery reconstruction request", () => {
  it("parses only exact preparation and check envelopes", () => {
    expect(parseRecoveryReconstructionRequest(JSON.stringify({ phase: "prepare", candidate_id: candidate, plan: {} }))).toEqual({ phase: "prepare", candidate_id: candidate, plan: {} });
    expect(parseRecoveryReconstructionRequest('{"phase":"check","manifest":{}}')).toEqual({ phase: "check", manifest: {} });
  });

  it.each([
    "null", "[]", "{}", "{} {}", '{"phase":"check","phase":"check","manifest":{}}',
    '{"phase":"apply","manifest":{}}', '{"phase":"prepare","plan":{}}',
    '{"phase":"prepare","candidate_id":1,"plan":{}}', '{"phase":"check","manifest":{},"bytes":"unapproved"}',
  ])("rejects malformed, duplicate, unknown and raw-byte request fields: %s", (request) => {
    expect(() => parseRecoveryReconstructionRequest(request)).toThrow(expect.objectContaining({ code: "history_reconstruction_request_invalid" }));
  });
});

describe("recovery execution adapter", () => {
  it("prepares and rechecks real retained drafts without exposing raw journal bytes or starting continuation", async () => {
    const f = await historyReconstructionFixture();
    const runtime = { drafts: f.drafts, access: f.h.access, operations: { execute: vi.fn(async () => ({})) } };
    const prepared = await executeRecoveryRequest("reconstruct", f.scope, JSON.stringify({ phase: "prepare", ...f.request }), runtime);
    expect(prepared).toMatchObject({ published: false, execution_started: false, mission_id: f.scope.missionId, generation_id: f.reset.data.generation_id, history_version: f.reset.id, mode: "recovering" });
    expect(prepared).not.toHaveProperty("candidate_journals");
    expect(JSON.stringify(prepared)).not.toContain("bytes_base64");
    const checked = await executeRecoveryRequest("reconstruct", f.scope, JSON.stringify({ phase: "check", manifest: prepared.manifest }), runtime);
    expect(checked).toMatchObject({ checked: true, published: false, execution_started: false, history_version: f.reset.id, mode: "recovering", manifest: prepared.manifest });
    expect(runtime.operations.execute).not.toHaveBeenCalled();
    expect((await f.h.access.read("/record", f.f.missionId)).historyVersion).toBe(f.reset.id);
  });

  it.each(["reset", "migrate", "publish"] as const)("preserves the complete raw %s request for independent engine validation", async (operation) => {
    const f = await historyReconstructionFixture();
    const execute = vi.fn(async () => ({ result: "delegated" }));
    const runtime = { drafts: f.drafts, access: f.h.access, operations: { execute } };
    const raw = '{"phase":"preview","manifest":{"duplicate":1,"duplicate":2}}';
    expect(await executeRecoveryRequest(operation, f.scope, raw, runtime)).toEqual({ result: "delegated" });
    expect(execute).toHaveBeenCalledWith(operation, f.scope, raw);
  });

  it("keeps invalid reconstruction data outside preparation and publication", async () => {
    const f = await historyReconstructionFixture();
    const prepare = vi.fn(f.drafts.prepare.bind(f.drafts));
    const verify = vi.fn(f.drafts.verify.bind(f.drafts));
    const execute = vi.fn(async () => ({}));
    await expect(executeRecoveryRequest("reconstruct", f.scope, '{"phase":"apply"}', { drafts: { prepare, verify }, access: f.h.access, operations: { execute } })).rejects.toMatchObject({ code: "history_reconstruction_request_invalid" });
    expect(prepare).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
