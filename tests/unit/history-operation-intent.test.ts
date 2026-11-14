import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { historyDigest, historyManifestDigest, parseHistoryGuard } from "../../packages/cli/src/history/control.js";
import { canonicalJson } from "../../packages/cli/src/history/journal.js";
import { historyOperationKey, parseHistoryOperationIntent, parseHistoryOperationRequest, type HistoryOperation } from "../../packages/cli/src/history/operation-intent.js";
import { historyOperationFixture } from "../support/history-operation.js";

const operations: readonly HistoryOperation[] = ["reset", "migrate", "publish"];

describe("exact history operation intent", () => {
  it.each(operations)("round-trips complete original instructions for %s without mutable input aliases", (operation) => {
    const { intent } = historyOperationFixture(operation);
    const expected = canonicalJson(intent);
    const parsed = parseHistoryOperationIntent(intent);
    expect(canonicalJson(parsed)).toBe(expected);
    expect(parseHistoryOperationIntent(expected)).toEqual(parsed);
    (intent as { requester: string }).requester = "Changed caller";
    expect(canonicalJson(parsed)).toBe(expected);
  });

  it("binds an operation key to the full original request rather than a domain or journal identity", () => {
    const { intent } = historyOperationFixture();
    const request = { operation: intent.operation, missionId: intent.mission_id, generationId: intent.generation_id, manifestHash: intent.manifest_hash, requester: intent.requester, decisionReference: intent.decision_reference };
    expect(historyOperationKey(request)).toBe(intent.key);
    expect(historyOperationKey({ ...request, decisionReference: "decision:different" })).not.toBe(intent.key);
    expect(historyOperationKey({ ...request, generationId: randomUUID() })).not.toBe(intent.key);
  });

  it.each([
    { version: 2 }, { key: historyDigest("other") }, { mission_id: randomUUID() }, { generation_id: randomUUID() },
    { requester: "Other requester" }, { decision_reference: "decision:other" }, { operation: "publish" }, { extra: true },
  ])("rejects changed or unsupported retained fields: %j", (change) => {
    const { intent } = historyOperationFixture();
    expect(() => parseHistoryOperationIntent({ ...intent, ...change })).toThrow();
  });

  it("rejects duplicate keys, non-JSON input and mismatched archive identity", () => {
    const { intent } = historyOperationFixture();
    expect(() => parseHistoryOperationIntent(canonicalJson(intent).replace('"version":1', '"version":2,"version":1'))).toThrow();
    expect(() => parseHistoryOperationIntent(undefined)).toThrow();
    expect(() => parseHistoryOperationIntent({ ...intent, archive_index: { ...intent.archive_index, archive_id: randomUUID() } })).toThrow();
  });

  it("rejects altered candidate bytes, unknown predecessors, and escaped original coordinates", () => {
    const { intent } = historyOperationFixture("publish");
    expect(() => parseHistoryOperationIntent({ ...intent, candidate_journals: intent.candidate_journals.map((journal) => ({ ...journal, bytes_base64: "not base64!" })) })).toThrow();
    expect(() => parseHistoryOperationIntent({ ...intent, predecessor: null })).toThrow();
    expect(() => parseHistoryOperationIntent({ ...intent, original_sources: [{ ...intent.original_sources[0], path: "../foreign" }] })).toThrow();
    expect(() => parseHistoryOperationIntent({ ...intent, predecessor: { ...intent.predecessor!, bytes_base64: Buffer.from("changed").toString("base64") } })).toThrow();
  });
});

describe("compatibility guard contract", () => {
  it("validates the dedicated control guard without treating it as phase progress", () => {
    const { intent } = historyOperationFixture();
    expect(parseHistoryGuard(intent.guard, intent.control)).toEqual(intent.guard);
    expect(parseHistoryGuard(canonicalJson(intent.guard), intent.control)).toEqual(intent.guard);
  });

  it.each([
    { phase: "other" }, { event_version: 2 }, { caused_by: [] }, { type: "construction.other" },
  ])("rejects unsupported guard bindings: %j", (change) => {
    const { intent } = historyOperationFixture();
    expect(() => parseHistoryGuard({ ...intent.guard, ...change }, intent.control)).toThrow();
  });

  it("rejects changed payloads, event identity reuse, duplicate JSON keys and rebuilt guard authority", () => {
    const { intent } = historyOperationFixture();
    expect(() => parseHistoryGuard({ ...intent.guard, data: { ...intent.guard.data, extra: true } }, intent.control)).toThrow();
    expect(() => parseHistoryGuard({ ...intent.guard, id: intent.control.id }, intent.control)).toThrow();
    expect(() => parseHistoryGuard('{"id":"one","id":"two"}', intent.control)).toThrow();
    const rebuilt = historyOperationFixture("publish");
    expect(() => parseHistoryGuard(rebuilt.intent.guard, rebuilt.control)).toThrow();
  });
});

describe("strict recovery operation request", () => {
  it.each(operations)("separates read-only preview and exact requester apply authority for %s", (operation) => {
    const { manifest, decision } = historyOperationFixture(operation);
    expect(parseHistoryOperationRequest({ phase: "preview", manifest }, operation)).toEqual({ phase: "preview", manifest });
    const apply = { phase: "apply", manifest, approved_manifest_hash: historyManifestDigest(manifest), requester: manifest.requester, decision_reference: decision };
    expect(parseHistoryOperationRequest(canonicalJson(apply), operation)).toEqual(apply);
    expect(() => parseHistoryOperationRequest({ ...apply, approved_manifest_hash: historyDigest("wrong") }, operation)).toThrow();
    expect(() => parseHistoryOperationRequest({ ...apply, requester: "Other" }, operation)).toThrow();
    expect(() => parseHistoryOperationRequest({ ...apply, decision_reference: " " }, operation)).toThrow();
  });

  it("rejects missing approvals, unknown fields, wrong commands, duplicate keys and multiple objects", () => {
    const { manifest } = historyOperationFixture();
    expect(() => parseHistoryOperationRequest({ phase: "apply", manifest }, "reset")).toThrow();
    expect(() => parseHistoryOperationRequest({ phase: "preview", manifest, requester: "Hidden" }, "reset")).toThrow();
    expect(() => parseHistoryOperationRequest({ phase: "preview", manifest }, "migrate")).toThrow();
    expect(() => parseHistoryOperationRequest('{"phase":"preview","phase":"apply"}', "reset")).toThrow();
    expect(() => parseHistoryOperationRequest('{} {}', "reset")).toThrow();
    expect(() => parseHistoryOperationRequest(null, "reset")).toThrow();
    expect(() => parseHistoryOperationRequest(undefined, "reset")).toThrow();
  });
});
