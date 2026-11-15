import { describe, expect, it } from "vitest";
import {
  parseWorkflowCheckpoint,
  serializeWorkflowState,
} from "../../tests/e2e/workflow-checkpoints.js";

const checkpoint = {
  version: 1,
  scenario: "unit-contract",
  sourceCheckout: "/workspace/kepler",
  rootDirectory: "/tmp/kepler-e2e-fixture",
  checkpointPath: "/tmp/kepler-e2e-checkpoint.json",
  ownerNonce: "01234567-89ab-cdef-0123-456789abcdef",
  nextPart: 2,
  fixtureDigest: "a".repeat(64),
  state: { mission: "mission-1", accepted: true, sequence: [1, "two", null] },
} as const;

const encodedCheckpoint = (): string => `${JSON.stringify(checkpoint)}\n`;

describe("E2E workflow checkpoint contract", () => {
  it("serializes plain JSON state without losing shared values", () => {
    const shared = { id: "fixture" };
    expect(serializeWorkflowState({ left: shared, right: shared })).toBe(
      '{"left":{"id":"fixture"},"right":{"id":"fixture"}}',
    );
    expect(serializeWorkflowState([true, null, 42, "text"])).toBe(
      '[true,null,42,"text"]',
    );
  });

  it("rejects values that JSON would omit, coerce, or serialize as non-plain objects", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const sparse = new Array(2);
    const accessor = Object.defineProperty({}, "value", { enumerable: true, get: () => 1 });
    const symbolKeyed = { [Symbol("hidden")]: "value" };
    const cases: readonly unknown[] = [
      undefined,
      () => "not data",
      new Map([["id", 1]]),
      new Set([1]),
      new Uint8Array([1, 2]),
      new Date(0),
      Number.NaN,
      Number.POSITIVE_INFINITY,
      1n,
      Symbol("value"),
      cycle,
      sparse,
      accessor,
      symbolKeyed,
    ];
    for (const state of cases) {
      expect(() => serializeWorkflowState(state)).toThrow();
    }
  });

  it("bounds serialized state and parsed checkpoint size in UTF-8 bytes", () => {
    const limit = 8 * 1024 * 1024;
    expect(Buffer.byteLength(serializeWorkflowState("a".repeat(limit - 2)), "utf8")).toBe(limit);
    expect(() => serializeWorkflowState("é".repeat(limit / 2))).toThrow("size limit");
    expect(() => parseWorkflowCheckpoint(" ".repeat(limit + 1))).toThrow("size limit");
  });

  it("round-trips the strict versioned envelope", () => {
    expect(parseWorkflowCheckpoint(encodedCheckpoint())).toEqual(checkpoint);
  });

  it("rejects duplicate fields at every JSON object level", () => {
    const duplicateEnvelope = encodedCheckpoint().replace(
      '"scenario":"unit-contract"',
      '"scenario":"unit-contract","scenario":"unit-contract"',
    );
    const duplicateState = encodedCheckpoint().replace(
      '"state":{"mission":"mission-1","accepted":true,"sequence":[1,"two",null]}',
      '"state":{"mission":"mission-1","mission":"other","accepted":true,"sequence":[1,"two",null]}',
    );
    expect(() => parseWorkflowCheckpoint(duplicateEnvelope)).toThrow("duplicate field");
    expect(() => parseWorkflowCheckpoint(duplicateState)).toThrow("duplicate field");
  });

  it("rejects unsupported fields, unsupported versions, invalid parts, and malformed JSON", () => {
    expect(() => parseWorkflowCheckpoint(JSON.stringify({ ...checkpoint, unexpected: true })))
      .toThrow("unsupported fields");
    expect(() => parseWorkflowCheckpoint(JSON.stringify({ ...checkpoint, version: 2 })))
      .toThrow("invalid field values");
    expect(() => parseWorkflowCheckpoint(JSON.stringify({ ...checkpoint, nextPart: 4 })))
      .toThrow("invalid field values");
    expect(() => parseWorkflowCheckpoint('{"version":1,'))
      .toThrow("strict JSON");
    for (const fixtureDigest of [["a".repeat(64)], null, 123, {}, true]) {
      expect(() => parseWorkflowCheckpoint(JSON.stringify({ ...checkpoint, fixtureDigest })))
        .toThrow("invalid field values");
    }
  });
});
