import { randomUUID } from "node:crypto";
import { HistoryAccess, type LiveHistoryBinding } from "../../packages/cli/src/history/access.js";
import { HistoryError, historyDigest } from "../../packages/cli/src/history/control.js";
import type { HistoryFiles, HistoryRepositoryContext } from "../../packages/cli/src/history/files.js";
import type { MissionCoordination, MissionCoordinationRequest } from "../../packages/cli/src/construction/mission-coordination.js";
import { canonicalJson } from "../../packages/cli/src/history/journal.js";
import { historyStorageEntries, memoryHistoryStorage } from "./history-storage.js";
import type { historyGenerationFixture } from "./history-generation.js";

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(`${canonicalJson(value)}\n`);
const equal = (left: Uint8Array, right: Uint8Array): boolean => left.length === right.length && left.every((byte, index) => byte === right[index]);

export const historyAccessFixture = (f: ReturnType<typeof historyGenerationFixture>, options: {
  readonly bound?: boolean;
  readonly context?: HistoryRepositoryContext;
  readonly extraEntries?: ReadonlyMap<string, Uint8Array>;
  readonly next?: () => string;
} = {}) => {
  const context = options.context ?? { recordHome: "/record", commonDirectory: "/git", origins: [{ id: "current", label: "record-home", root: "/record" }], unavailableOrigins: [] };
  const entries = new Map([...historyStorageEntries(f), ...(options.extraEntries ?? [])]);
  const bindingPath = `/git/kepler/missions/${f.missionId}/coordination/history-selection.json`;
  const binding: LiveHistoryBinding = { format: "kepler.mission-history-binding", version: 1, mission_id: f.missionId, generation_id: f.generationId, history_version: f.control.id, selection_hash: historyDigest(f.input.activation!), origins: ["current"] };
  if (options.bound ?? true) entries.set(bindingPath, encode(binding));
  const readonly = memoryHistoryStorage(entries, {}, context);
  const files: HistoryFiles = {
    ...readonly.files,
    write: async (location, bytes, mode) => {
      const key = `${location.root}/${location.relative}`;
      const previous = entries.get(key);
      if (previous && equal(previous, bytes)) return { status: "existing", content_version: historyDigest(bytes), byte_length: bytes.length };
      if (mode.kind === "create" && previous !== undefined) throw new HistoryError("history_file_conflict", "Conflicting immutable fixture output");
      if (mode.kind === "replace" && (previous ? historyDigest(previous) : null) !== mode.expected) throw new HistoryError("history_file_changed", "Changed fixture activation input");
      entries.set(key, new Uint8Array(bytes));
      return { status: previous === undefined ? "created" : "replaced", content_version: historyDigest(bytes), byte_length: bytes.length };
    },
    remove: async (location, expected) => {
      const key = `${location.root}/${location.relative}`;
      const existing = entries.get(key);
      if (existing === undefined) return "missing";
      if (historyDigest(existing) !== expected) throw new HistoryError("history_source_changed", "Fixture source identity changed");
      entries.delete(key);
      return "removed";
    },
  };
  const storage = memoryHistoryStorage(entries, files, context);
  const controls: { beforeAcquire?: (request: MissionCoordinationRequest) => void; failRelease: boolean } = { failRelease: false };
  const acquired: MissionCoordinationRequest[] = [];
  const held = new Set<string>();
  const coordination: MissionCoordination = {
    acquire: async (request) => {
      controls.beforeAcquire?.(request);
      const path = `${request.commonDirectory}/kepler/missions/${request.owner.mission_id}/coordination/${request.resourceKey}`;
      if (held.has(path)) return { kind: "failed", code: "resource_contended", message: "Fixture admission is held", details: {}, recovery: "Wait for the existing owner" };
      held.add(path);
      acquired.push(request);
      const owner = { ...request.owner, token: randomUUID() };
      const contents = encode(owner);
      entries.set(`${path}/owner.json`, contents);
      return { kind: "acquired", lease: { lockPath: path, owner, release: async () => {
        if (controls.failRelease || !equal(entries.get(`${path}/owner.json`) ?? new Uint8Array(), contents)) return { kind: "failed", code: "coordination_owner_mismatch", message: "Fixture release ownership is uncertain", details: {}, recovery: "Reconcile the exact owner" };
        entries.delete(`${path}/owner.json`);
        held.delete(path);
        return { kind: "released" };
      } } };
    },
    release: async () => { throw new Error("Fixture callers must release the actual owned lease"); },
  };
  const identity = { machine_id: "test-host", process_id: 42, process_incarnation_id: randomUUID() };
  const runtime = { coordination, identity, next: options.next ?? randomUUID };
  const access = new HistoryAccess(storage, runtime);
  const request = { recordHome: "/record", missionId: f.missionId, historyVersion: f.control.id };
  return { access, storage, entries, binding, bindingPath, controls, acquired, held, runtime, context, request, encode };
};
