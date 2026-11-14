import { randomUUID } from "node:crypto";
import { describe, expect, expectTypeOf, it } from "vitest";
import { missionStartupResourceKey } from "../../packages/cli/src/construction/mission-startup-resource.js";
import { historyAdmissionResourceKey, parseLiveHistoryBinding, type HistoryExclusiveScope } from "../../packages/cli/src/history/access.js";
import { createHistoryControl, historyDigest, type HistorySourceEntry } from "../../packages/cli/src/history/control.js";
import { historyInventory } from "../../packages/cli/src/history/storage.js";
import { historyAccessFixture } from "../support/history-access.js";
import { historyGenerationFixture, historyTestBytes, historyTestEvent } from "../support/history-generation.js";
import { historyStorageEntries } from "../support/history-storage.js";

const writerEntries = (entries: ReadonlyMap<string, Uint8Array>): readonly string[] => [...entries.keys()].filter((key) => key.includes("/history-writers/"));
const installControl = (h: ReturnType<typeof historyAccessFixture>, f: ReturnType<typeof historyGenerationFixture>, control: ReturnType<typeof createHistoryControl>) => {
  const activation = historyTestBytes([control]);
  const guard = historyTestEvent("construction.history-generation-required", { mission_id: f.missionId, generation_id: control.data.generation_id, control_event_id: control.id }, randomUUID(), [control.id]);
  const root = `/record/.kepler/missions/${f.missionId}/history/control`;
  h.entries.set(`${root}/active.json`, activation);
  h.entries.set(`${root}/events/${control.journal_id}.jsonl`, activation);
  h.entries.set(`${root}/${guard.journal_id}.jsonl`, historyTestBytes([guard]));
  h.entries.set(h.bindingPath, h.encode({ ...h.binding, generation_id: control.data.generation_id, history_version: control.id, selection_hash: historyDigest(activation) }));
};

describe("shared history binding", () => {
  it("retains the existing canonical startup resource identity", () => {
    const mission = "10000000-0000-4000-8000-000000000001";
    expect(missionStartupResourceKey("/git", mission)).toBe("6ac9499196533a9f29f85731f213039637f52fd65dfdf9eb5cc4a8ddd3b94666");
    expect(missionStartupResourceKey("/other", mission)).not.toBe(missionStartupResourceKey("/git", mission));
    expect(missionStartupResourceKey("/git", randomUUID())).not.toBe(missionStartupResourceKey("/git", mission));
  });
  it("parses exact current identities and scopes admission by actual common directory and mission", () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f);
    expect(parseLiveHistoryBinding(h.encode(h.binding))).toEqual(h.binding);
    expect(historyAdmissionResourceKey("/git", f.missionId)).toMatch(/^[0-9a-f]{64}$/);
    expect(historyAdmissionResourceKey("/git", f.missionId)).not.toBe(historyAdmissionResourceKey("/another-git", f.missionId));
    expect(historyAdmissionResourceKey("/git", f.missionId)).not.toBe(historyAdmissionResourceKey("/git", randomUUID()));
  });

  it.each([
    { version: 2 }, { mission_id: "partial" }, { generation_id: "INVALID" }, { selection_hash: "sha256:wrong" },
    { origins: [] }, { origins: ["duplicate", "duplicate"] }, { origins: ["z", "a"] }, { unknown: true },
  ])("rejects invalid local binding fields %j", (change) => {
    const h = historyAccessFixture(historyGenerationFixture());
    expect(() => parseLiveHistoryBinding(h.encode({ ...h.binding, ...change }))).toThrowError(expect.objectContaining({ code: "history_binding_invalid" }));
  });

  it("rejects duplicate JSON keys and damaged bytes without changing source state", () => {
    expect(() => parseLiveHistoryBinding(new TextEncoder().encode('{"format":1,"format":2}'))).toThrowError(expect.objectContaining({ code: "history_binding_invalid" }));
    expect(() => parseLiveHistoryBinding(new Uint8Array([255]))).toThrowError(expect.objectContaining({ code: "history_binding_invalid" }));
  });
});

describe("history access and admission", () => {
  it("keeps reads free of ownership effects and rejects missing, stale and unbound mutation versions", async () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f);
    expect((await h.access.read("/record", f.missionId)).coordination).toBe("bound");
    expect(h.acquired).toEqual([]);
    await expect(h.access.beginMutation({ ...h.request, historyVersion: undefined })).rejects.toMatchObject({ code: "history_version_required" });
    await expect(h.access.beginMutation({ ...h.request, historyVersion: randomUUID() })).rejects.toMatchObject({ code: "history_version_mismatch" });
    await expect(h.access.beginMutation({ ...h.request, historyVersion: "short" })).rejects.toMatchObject({ code: "history_version_invalid" });
    expect(h.acquired).toEqual([]);
    const unbound = historyAccessFixture(f, { bound: false });
    expect((await unbound.access.read("/record", f.missionId)).coordination).toBe("unbound");
    await expect(unbound.access.beginMutation(unbound.request)).rejects.toMatchObject({ code: "history_binding_required" });
  });

  it("requires ownership verification before joining and preserves callback failures", async () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f, { bound: false });
    await expect(h.access.join(h.request, async () => { throw 0; })).rejects.toBe(0);
    expect(h.entries.has(h.bindingPath)).toBe(false);
    expect(h.held.size).toBe(0);
    let verified = false;
    const joined = await h.access.join(h.request, async (view, context) => {
      expect(view.historyVersion).toBe(f.control.id);
      expect(context.recordHome).toBe("/record");
      verified = true;
    });
    expect(verified).toBe(true);
    expect(joined.coordination).toBe("bound");
    expect(h.held.size).toBe(0);
  });

  it("keeps ownership callbacks from changing its selected version or storage root", async () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f, { bound: false });
    const joined = await h.access.join(h.request, async (view, context) => {
      try { (view as { historyVersion: string }).historyVersion = randomUUID(); } catch {}
      try { (context as { commonDirectory: string }).commonDirectory = "/unrelated"; } catch {}
    });
    expect(joined.historyVersion).toBe(f.control.id);
    expect(joined.coordination).toBe("bound");
    expect(h.context.commonDirectory).toBe("/git");
    expect([...h.entries.keys()].some((key) => key.startsWith("/unrelated/"))).toBe(false);
    expect(parseLiveHistoryBinding(h.entries.get(h.bindingPath)!).history_version).toBe(f.control.id);
  });

  it("admits independent ordinary writers together and excludes recovery until both finish", async () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f);
    const first = await h.access.beginMutation(h.request);
    const second = await h.access.beginMutation(h.request);
    expect(writerEntries(h.entries)).toHaveLength(2);
    expect(h.held.size).toBe(0);
    await expect(h.access.withRecovery("/record", f.missionId, async () => "unsafe")).rejects.toMatchObject({ code: "history_writers_active" });
    expect(await h.access.withRecovery("/record", randomUUID(), async () => "another mission")).toBe("another mission");
    await first.release();
    await first.release();
    await expect(h.access.withRecovery("/record", f.missionId, async () => "unsafe")).rejects.toMatchObject({ code: "history_writers_active" });
    await second.release();
    expect(await h.access.withRecovery("/record", f.missionId, async () => "exclusive")).toBe("exclusive");
    expect(writerEntries(h.entries)).toEqual([]);
  });

  it.each([undefined, null, 0, ""])("preserves a thrown callback value %s and releases its writer", async (failure) => {
    const h = historyAccessFixture(historyGenerationFixture());
    await expect(h.access.withMutation(h.request, async () => { throw failure; })).rejects.toBe(failure);
    expect(writerEntries(h.entries)).toEqual([]);
    expect(h.held.size).toBe(0);
  });

  it("rejects a reused writer identity without taking over its original claim", async () => {
    const token = randomUUID();
    const h = historyAccessFixture(historyGenerationFixture(), { next: () => token });
    const first = await h.access.beginMutation(h.request);
    const original = h.entries.get(`/git/${first.reference}`);
    await expect(h.access.beginMutation(h.request)).rejects.toMatchObject({ code: "history_writer_identity_reused" });
    expect(h.entries.get(`/git/${first.reference}`)).toEqual(original);
    await first.release();
  });

  it("freezes the original request version before an intervening selection change", async () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f);
    const request = { ...h.request, historyVersion: String(f.control.id) };
    h.controls.beforeAcquire = () => {
      h.controls.beforeAcquire = undefined;
      const replacement = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: f.control.recorded_at, producer: f.control.producer, manifest: f.manifest, decisionReference: "request:original", causes: [f.creation.id] });
      installControl(h, f, replacement);
      request.historyVersion = replacement.id;
    };
    await expect(h.access.withMutation(request, async () => "unsafe")).rejects.toMatchObject({ code: "history_version_mismatch" });
    expect(writerEntries(h.entries)).toEqual([]);
    expect(h.held.size).toBe(0);
  });

  it("reports uncertain writer cleanup without claiming that the callback had no effect", async () => {
    const h = historyAccessFixture(historyGenerationFixture());
    await expect(h.access.withMutation(h.request, async () => {
      const [writer] = writerEntries(h.entries);
      h.entries.delete(writer!);
      return "recorded result";
    })).rejects.toMatchObject({ code: "history_writer_release_failed", details: { operation_callback: "returned", effects_uncertain: true } });
  });

  it("fences unfinished recovery and recognizes only exact superseded pending bytes", async () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f);
    const path = `kepler/missions/${f.missionId}/recovery/pending/old.json`;
    const raw = new Uint8Array([255, 13, 0]);
    h.entries.set(`/git/${path}`, raw);
    expect((await h.access.read("/record", f.missionId)).pendingRecovery).toBe(true);
    await expect(h.access.beginMutation(h.request)).rejects.toMatchObject({ code: "history_recovery_pending" });
    const source: HistorySourceEntry = { source_id: `local-runtime:${path}`, origin: "local-runtime", path, byte_length: raw.length, content_version: historyDigest(raw) };
    const reset = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: f.control.recorded_at, producer: f.control.producer, manifest: { ...f.resetManifest, source_inventory: [source] }, decisionReference: "decision:reset", causes: [] });
    installControl(h, f, reset);
    const recovering = await h.access.read("/record", f.missionId);
    expect(recovering.mode).toBe("recovering");
    expect(recovering.pendingSources[0]?.status).toBe("superseded");
    await expect(h.access.beginMutation({ ...h.request, historyVersion: reset.id })).rejects.toMatchObject({ code: "history_recovery_pending" });
    h.entries.set(`/git/${path}`, new Uint8Array([254]));
    expect((await h.access.read("/record", f.missionId)).pendingSources[0]?.status).toBe("pending");
  });

  it("binds nested old pending files to the selected reset without hiding their bytes", async () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f);
    const path = `kepler/missions/${f.missionId}/recovery/pending/older/nested.json`;
    const contents = h.encode({ original: "nested intent" });
    h.entries.set(`/git/${path}`, contents);
    const source: HistorySourceEntry = { source_id: `local-runtime:${path}`, origin: "local-runtime", path, byte_length: contents.length, content_version: historyDigest(contents) };
    const reset = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: f.control.recorded_at, producer: f.control.producer, manifest: { ...f.resetManifest, generation_id: randomUUID(), source_inventory: [source] }, decisionReference: "decision:reset", causes: [] });
    installControl(h, f, reset);
    const view = await h.access.read("/record", f.missionId);
    expect(view.pendingRecovery).toBe(false);
    expect(view.pendingSources).toContainEqual({ source_id: source.source_id, path, byte_length: contents.length, content_version: historyDigest(contents), status: "superseded" });
    expect(h.entries.get(`/git/${path}`)).toEqual(contents);
  });

  it("does not reuse a predecessor reset's pending-byte approval after a new reset", async () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f);
    const path = `kepler/missions/${f.missionId}/recovery/pending/original.json`;
    const original = h.encode({ original: 1 });
    const changed = h.encode({ original: 2 });
    const row = (contents: Uint8Array): HistorySourceEntry => ({ source_id: `local-runtime:${path}`, origin: "local-runtime", path, byte_length: contents.length, content_version: historyDigest(contents) });
    h.entries.set(`/git/${path}`, original);
    const first = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: f.control.recorded_at, producer: f.control.producer, manifest: { ...f.resetManifest, generation_id: randomUUID(), source_inventory: [row(original)] }, decisionReference: "decision:first-reset", causes: [] });
    installControl(h, f, first);
    h.entries.set(`/git/${path}`, changed);
    const next = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: f.control.recorded_at, producer: f.control.producer, manifest: { ...f.resetManifest, generation_id: randomUUID(), previous_control: { event_id: first.id, content_version: historyDigest(historyTestBytes([first])) }, source_inventory: [row(changed)] }, decisionReference: "decision:next-reset", causes: [first.id] });
    installControl(h, f, next);
    h.entries.set(`/git/${path}`, original);
    const view = await h.access.read("/record", f.missionId);
    expect(view.pendingRecovery).toBe(true);
    expect(view.pendingSources).toContainEqual({ source_id: `local-runtime:${path}`, path, byte_length: original.length, content_version: historyDigest(original), status: "pending" });
  });

  it("keeps unjoined phase additions out of current state and refuses implicit import", async () => {
    const f = historyGenerationFixture();
    const context = { recordHome: "/record", commonDirectory: "/git", origins: [{ id: "current", label: "record-home", root: "/record" }, { id: "peer", label: "peer", root: "/peer" }], unavailableOrigins: [] };
    const h = historyAccessFixture(f, { context, extraEntries: historyStorageEntries(f, "/peer") });
    h.entries.set(h.bindingPath, h.encode({ ...h.binding, origins: ["peer"] }));
    const journal = randomUUID();
    const event = historyTestEvent("construction.interaction-recorded", { mission_id: f.missionId, unit_id: f.unitId, participants: ["requester"], content: "Unaccepted imported fact", references: [] }, journal, [f.unit.id]);
    const path = `/record/.kepler/missions/${f.missionId}/history/generations/${f.generationId}/construction/${journal}.jsonl`;
    h.entries.set(path, historyTestBytes([event]));
    const view = await h.access.read("/record", f.missionId);
    expect(view.coordination).toBe("unjoined");
    expect(view.history.events).toHaveLength(3);
    await expect(h.access.join(h.request, async () => undefined)).rejects.toMatchObject({ code: "history_handoff_unaccepted_facts" });
    h.entries.delete(path);
    expect((await h.access.join(h.request, async () => undefined)).coordination).toBe("bound");
  });

  it("excludes only its exact known claims from an input snapshot and revokes closed fences", async () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f);
    const before = historyInventory(await h.storage.snapshot("/record", f.missionId));
    let retained: HistoryExclusiveScope | undefined;
    await h.access.withRecovery("/record", f.missionId, async (scope) => {
      retained = scope;
      expect(scope.ownSources).toHaveLength(1);
      expect(historyInventory(await h.access.snapshot(scope))).toEqual(before);
      expect(historyInventory(await h.storage.snapshot("/record", f.missionId))).toContainEqual(scope.ownSources[0]);
      await expect(h.access.snapshot({ ...scope, ownSources: before })).rejects.toMatchObject({ code: "history_fence_required" });
      const ownerPath = `/git/${scope.ownSources[0]!.path}`;
      const original = h.entries.get(ownerPath)!;
      h.entries.set(ownerPath, h.encode({ different: true }));
      await expect(h.access.snapshot(scope)).rejects.toMatchObject({ code: "history_ownership_changed" });
      h.entries.set(ownerPath, original);
    });
    await expect(h.access.snapshot(retained!)).rejects.toMatchObject({ code: "history_fence_required" });
    await expect(h.access.publishBinding(retained!, f.control, null)).rejects.toMatchObject({ code: "history_fence_required" });
  });

  it("rejects a startup label on a different coordination resource", async () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f, { bound: false });
    const claimed = await h.runtime.coordination.acquire({ commonDirectory: "/git", location: { kind: "mission", missionId: f.missionId }, resourceKey: "a".repeat(64), owner: { ...h.runtime.identity, mission_id: f.missionId, resource_scope: "mission-startup" } });
    if (claimed.kind !== "acquired") throw new Error("Expected a relabeled fixture claim");
    let called = false;
    await expect(h.access.withStartup("/record", f.missionId, claimed.lease, async () => { called = true; })).rejects.toMatchObject({ code: "history_startup_authority_invalid" });
    expect(called).toBe(false);
    expect(h.entries.has(h.bindingPath)).toBe(false);
    await claimed.lease.release();
  });

  it("does not let an arbitrary caller omit a foreign source from raw inspection", async () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f);
    expectTypeOf(h.storage.snapshot).parameters.toEqualTypeOf<[recordHome: string, missionId: string]>();
    const original = await h.storage.snapshot("/record", f.missionId);
    const foreign = historyInventory(original)[0]!;
    const inspected = await Reflect.apply(h.storage.snapshot, h.storage, ["/record", f.missionId, { ownedOutputs: [foreign] }]);
    expect(historyInventory(inspected)).toContainEqual(foreign);
  });

  it("requires the real startup claim for initial binding and blocks unresolved foreign locks", async () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f, { bound: false });
    const claimed = await h.runtime.coordination.acquire({ commonDirectory: "/git", location: { kind: "mission", missionId: f.missionId }, resourceKey: missionStartupResourceKey("/git", f.missionId), owner: { ...h.runtime.identity, mission_id: f.missionId, resource_scope: "mission-startup" } });
    if (claimed.kind !== "acquired") throw new Error("Expected a startup fixture claim");
    await expect(h.access.withRecovery("/record", f.missionId, async () => "unsafe")).rejects.toMatchObject({ code: "history_ownership_unresolved" });
    await h.access.withStartup("/record", f.missionId, claimed.lease, async (scope) => {
      expect(scope.ownSources).toHaveLength(2);
      await h.access.publishBinding(scope, f.control, null);
    });
    expect((await h.access.read("/record", f.missionId)).coordination).toBe("bound");
    await claimed.lease.release();
    await expect(h.access.withRecovery("/record", f.missionId, (scope) => h.access.publishBinding(scope, f.control, historyDigest(h.entries.get(h.bindingPath)!)))).rejects.toMatchObject({ code: "history_activation_authority_invalid" });
  });

  it("preserves joined origins when initial publication is retried after later facts", async () => {
    const f = historyGenerationFixture();
    const context = { recordHome: "/record", commonDirectory: "/git", origins: [{ id: "current", label: "record-home", root: "/record" }, { id: "peer", label: "peer", root: "/peer" }], unavailableOrigins: [] };
    const h = historyAccessFixture(f, { context, extraEntries: historyStorageEntries(f, "/peer") });
    h.entries.set(h.bindingPath, h.encode({ ...h.binding, origins: ["current", "peer"] }));
    const journal = randomUUID();
    const interaction = historyTestEvent("construction.interaction-recorded", { mission_id: f.missionId, unit_id: f.unitId, participants: ["requester"], content: "Later peer work", references: [] }, journal, [f.unit.id]);
    h.entries.set(`/peer/.kepler/missions/${f.missionId}/history/generations/${f.generationId}/construction/${journal}.jsonl`, historyTestBytes([interaction]));
    const original = h.entries.get(h.bindingPath)!;
    expect((await h.access.read("/record", f.missionId)).history.events).toHaveLength(4);
    const acquired = await h.runtime.coordination.acquire({ commonDirectory: "/git", location: { kind: "mission", missionId: f.missionId }, resourceKey: missionStartupResourceKey("/git", f.missionId), owner: { ...h.runtime.identity, mission_id: f.missionId, resource_scope: "mission-startup" } });
    if (acquired.kind !== "acquired") throw new Error("Expected a startup fixture claim");
    await h.access.withStartup("/record", f.missionId, acquired.lease, (scope) => h.access.publishBinding(scope, f.control, historyDigest(original)));
    await acquired.lease.release();
    expect(h.entries.get(h.bindingPath)).toEqual(original);
    expect((await h.access.read("/record", f.missionId)).history.events).toHaveLength(4);
  });

  it("keeps a historical reset from replacing a later effective head through a stale copy", async () => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f);
    const transition = async (previous: ReturnType<typeof createHistoryControl>) => h.access.withRecovery("/record", f.missionId, async (scope) => {
      const inventory = historyInventory(await h.access.snapshot(scope));
      const original = h.entries.get(h.bindingPath)!;
      const reset = createHistoryControl({ id: randomUUID(), journalId: randomUUID(), recordedAt: f.control.recorded_at, producer: f.control.producer, manifest: { ...f.resetManifest, generation_id: randomUUID(), previous_control: { event_id: previous.id, content_version: historyDigest(historyTestBytes([previous])) }, source_inventory: inventory }, decisionReference: "decision:reset", causes: [previous.id] });
      installControl(h, f, reset);
      h.entries.set(h.bindingPath, original);
      await h.access.publishBinding(scope, reset, historyDigest(original));
      return reset;
    });
    const first = await transition(f.control);
    const later = await transition(first);
    const current = h.entries.get(h.bindingPath)!;
    h.entries.set(`/record/.kepler/missions/${f.missionId}/history/control/active.json`, historyTestBytes([first]));
    await expect(h.access.withRecovery("/record", f.missionId, (scope) => h.access.publishBinding(scope, first, historyDigest(current)))).rejects.toMatchObject({ code: "history_activation_stale" });
    expect(parseLiveHistoryBinding(h.entries.get(h.bindingPath)!).history_version).toBe(later.id);
  });

  it.each(["unknown", "non-uuid.json", ".retained.partial"])("refuses unrecognized or interrupted writer records: %s", async (name) => {
    const f = historyGenerationFixture();
    const h = historyAccessFixture(f);
    const path = `/git/kepler/missions/${f.missionId}/coordination/history-writers/${name}`;
    const original = Uint8Array.from([255, 123]);
    h.entries.set(path, original);
    await expect(h.access.withRecovery("/record", f.missionId, async () => "unsafe")).rejects.toMatchObject({ code: "history_writers_active" });
    expect(h.entries.get(path)).toEqual(original);
  });

  it("reports admission-release failure and preserves its registered writer without executing it", async () => {
    const h = historyAccessFixture(historyGenerationFixture());
    h.controls.failRelease = true;
    let called = false;
    await expect(h.access.withMutation(h.request, async () => { called = true; })).rejects.toMatchObject({ code: "history_admission_release_failed" });
    expect(called).toBe(false);
    expect(writerEntries(h.entries)).toHaveLength(1);
    expect(h.held.size).toBe(1);
  });
});
