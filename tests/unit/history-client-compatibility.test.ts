import { describe, expect, it } from "vitest";
import { HISTORY_CLIENT_COMPATIBILITY_FORMAT, HISTORY_CLIENT_COMPATIBILITY_PURPOSE, HISTORY_CLIENT_GENERATION_PROTOCOL, HISTORY_UNSUPPORTED_LEGACY_CLIENT_REVISION, parseHistoryClientCompatibilityDocument, serializeHistoryClientCompatibilityDocument, validateHistoryClientCompatibility, type HistoryClientCompatibilityDocument } from "../../packages/cli/src/history/client-compatibility.js";
import { historyDigest } from "../../packages/cli/src/history/control.js";
import { canonicalJson } from "../../packages/cli/src/history/journal.js";

const binding = { record_home_repository_id: "record-home", mission_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", workflow: "standard" as const, request_reference: "request:original", unit_ids: ["unit:one"] };
const sourceReference = "snapshot:repo:.kepler/missions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/recovery/reconciliation/client-scope.txt";
const compatibilityReference = "snapshot:repo:.kepler/missions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/recovery/reconciliation/client-compatibility-reset.json";
const reportReference = "snapshot:repo:.kepler/missions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/recovery/reconciliation/reset.json";
const sourceHash = historyDigest("retained client evidence");
const document = (): HistoryClientCompatibilityDocument => ({
  format: HISTORY_CLIENT_COMPATIBILITY_FORMAT,
  version: 1,
  mission_binding: binding,
  generation_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  operation: "reset",
  required_protocol: HISTORY_CLIENT_GENERATION_PROTOCOL,
  confirmed_by: "agent:lead",
  scope_complete: true,
  external_client_references: ["copy:offline"],
  clients: [
    { reference: "client:interactive", kind: "interactive", run_references: ["run:one"], origin_ids: ["repo:current"], protocol_status: "compatible", operational_state: "stopped", client_identity: "Kepler test adapter build abc123", evidence: [{ reference: sourceReference, content_version: sourceHash }] },
    { reference: "copy:offline", kind: "quiescent-copy", run_references: [], origin_ids: [], protocol_status: "unverified", operational_state: "stopped", client_identity: null, evidence: [{ reference: sourceReference, content_version: sourceHash }] },
  ],
  unresolved_clients: [],
  source_material: [{ reference: sourceReference, content_version: sourceHash }],
});
const report = (compatibilityContentVersion = historyDigest("compatibility bytes")) => ({
  reference: compatibilityReference,
  content_version: compatibilityContentVersion,
  report_reference: reportReference,
  materials: [
    { reference: compatibilityReference, purpose: HISTORY_CLIENT_COMPATIBILITY_PURPOSE, content_version: compatibilityContentVersion },
    { reference: sourceReference, purpose: "client inventory evidence", content_version: sourceHash },
  ],
  scope_evidence_references: [compatibilityReference, sourceReference],
});
const scope = {
  mission_binding: binding,
  generation_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  operation: "reset" as const,
  lead: "agent:lead",
  run_references: ["run:one"],
  origin_ids: ["repo:current"],
};

const validate = (value: unknown): HistoryClientCompatibilityDocument => parseHistoryClientCompatibilityDocument(value);

describe("history client compatibility evidence", () => {
  it("accepts compatible-but-stopped clients and unknown stopped external copies", () => {
    const parsed = validate(document());
    expect(parsed.clients[0]).toMatchObject({ protocol_status: "compatible", operational_state: "stopped" });
    expect(parsed.clients[1]).toMatchObject({ protocol_status: "unverified", operational_state: "stopped", client_identity: null });
    expect(() => validateHistoryClientCompatibility(parsed, scope, report())).not.toThrow();
  });

  it.each(["unknown", "unknown build", "UNKNOWN CLIENT", "null", "null identity", "null-label", "3.1.0", "v3.1.0", "Kepler@3.1.0", "Kepler CLI 3.1.0"])("rejects an ambiguous compatible identity %s", (clientIdentity) => {
    const value = document();
    expect(() => validate({ ...value, clients: [{ ...value.clients[0]!, client_identity: clientIdentity }, value.clients[1]] })).toThrow(/specific build or adapter identity/u);
    expect(validate({ ...value, clients: [{ ...value.clients[0]!, protocol_status: "unverified", client_identity: null }, value.clients[1]] }).clients[0]).toMatchObject({ protocol_status: "unverified", operational_state: "stopped", client_identity: null });
  });

  it("accepts an external client reference associated with a known run and origin", () => {
    const value = document();
    const parsed = validate({ ...value, external_client_references: [...value.external_client_references, value.clients[0]!.reference] });
    expect(parsed.clients[0]).toMatchObject({ run_references: ["run:one"], origin_ids: ["repo:current"] });
    expect(() => validateHistoryClientCompatibility(parsed, scope, report())).not.toThrow();
    expect(() => validateHistoryClientCompatibility(parsed, { ...scope, origin_ids: [] }, report())).toThrow(/working-copy origins/u);
  });

  it("accepts active-read-only only for compatible clients without affected runs", () => {
    const value = document();
    const parsed = validate({
      ...value,
      external_client_references: [],
      clients: [{ ...value.clients[0]!, run_references: [], operational_state: "active-read-only" }],
    });
    expect(parsed.clients[0]).toMatchObject({ protocol_status: "compatible", operational_state: "active-read-only" });
  });

  it("rejects duplicate JSON keys, unknown fields, and unsupported status/state combinations", () => {
    expect(() => validate('{"format":"kepler.history-client-compatibility","format":"kepler.history-client-compatibility"}')).toThrow();
    expect(() => validate({ ...document(), extra: true })).toThrow();
    const value = document();
    expect(() => validate({ ...value, clients: [{ ...value.clients[0]!, operational_state: "active-read-only" }, value.clients[1]] })).toThrow();
    expect(() => validate({ ...value, clients: [{ ...value.clients[0]!, protocol_status: "unverified", operational_state: "active-read-only" }, value.clients[1]] })).toThrow();
    expect(() => validate({ ...value, clients: [{ ...value.clients[0]!, client_identity: null }, value.clients[1]] })).toThrow();
    expect(() => validate({ ...value, clients: [{ ...value.clients[1]!, operational_state: "active-read-only" }, value.clients[0]] })).toThrow();
  });

  it("rejects duplicate client/source/evidence references and unresolved clients", () => {
    const value = document();
    expect(() => validate({ ...value, clients: [value.clients[0], value.clients[0]] })).toThrow();
    expect(() => validate({ ...value, source_material: [...value.source_material, value.source_material[0]] })).toThrow();
    expect(() => validate({ ...value, clients: [{ ...value.clients[0]!, evidence: [value.clients[0]!.evidence[0], value.clients[0]!.evidence[0]] }, value.clients[1]] })).toThrow();
    expect(() => validate({ ...value, unresolved_clients: ["client:unknown"] })).toThrow();
  });

  it("requires exact operation scope, run/origin coverage, and external references", () => {
    const parsed = validate(document());
    expect(() => validateHistoryClientCompatibility(parsed, { ...scope, operation: "publish" }, report())).toThrow();
    expect(() => validateHistoryClientCompatibility(parsed, { ...scope, generation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }, report())).toThrow();
    expect(() => validateHistoryClientCompatibility(parsed, { ...scope, run_references: ["run:other"] }, report())).toThrow();
    expect(() => validateHistoryClientCompatibility(parsed, { ...scope, origin_ids: ["repo:other"] }, report())).toThrow();
    expect(() => validateHistoryClientCompatibility({ ...parsed, external_client_references: [] }, scope, report())).toThrow();
    expect(() => validateHistoryClientCompatibility({ ...parsed, external_client_references: ["copy:missing"] }, scope, report())).toThrow();
  });

  it("closes report materials and scope evidence by exact hashes", () => {
    const parsed = validate(document());
    expect(() => validateHistoryClientCompatibility(parsed, scope, { ...report(), scope_evidence_references: [sourceReference] })).toThrow();
    expect(() => validateHistoryClientCompatibility(parsed, scope, { ...report(), materials: report().materials.filter((item) => item.reference !== sourceReference) })).toThrow();
    expect(() => validateHistoryClientCompatibility(parsed, scope, { ...report(), materials: report().materials.map((item) => item.reference === sourceReference ? { ...item, content_version: historyDigest("changed") } : item) })).toThrow();
    expect(() => validateHistoryClientCompatibility(parsed, scope, { ...report(), materials: [...report().materials, report().materials[0]!] })).toThrow();
    expect(() => validateHistoryClientCompatibility({ ...parsed, source_material: [{ reference: compatibilityReference, content_version: sourceHash }] }, scope, report())).toThrow();
    expect(() => validateHistoryClientCompatibility({ ...parsed, source_material: [{ reference: reportReference, content_version: sourceHash }] }, scope, report())).toThrow();
    expect(() => validateHistoryClientCompatibility({ ...parsed, clients: [{ ...parsed.clients[0]!, evidence: [{ reference: sourceReference, content_version: historyDigest("changed") }] }, parsed.clients[1]] }, scope, report())).toThrow();
  });

  it("rejects the pinned legacy client without rejecting a different 3.1.0 build by version alone", () => {
    const value = document();
    const legacy = { ...value.clients[0]!, client_identity: `Kepler CLI 3.1.0 ${HISTORY_UNSUPPORTED_LEGACY_CLIENT_REVISION}` };
    expect(() => validate({ ...value, clients: [legacy, value.clients[1]] })).toThrow(/pinned legacy/u);
    expect(validate({ ...value, clients: [{ ...legacy, client_identity: "Kepler CLI 3.1.0 build abc123" }, value.clients[1]] }).clients[0]?.protocol_status).toBe("compatible");
    expect(serializeHistoryClientCompatibilityDocument(value)).toEqual(new TextEncoder().encode(`${canonicalJson(value)}\n`));
  });
});
