import { describe, expect, it } from "vitest";
import { AuditRequestInput, type AuditInputStream } from "../../packages/cli/src/audit/request-input.js";

const stream = (chunks: readonly (Uint8Array | string)[], isTTY = false): AuditInputStream => ({
  isTTY,
  chunks: async function* () { yield* chunks; },
});

describe("audit request input", () => {
  it("reads UTF-8 request chunks without changing their contents", async () => {
    const input = new AuditRequestInput(stream(["{\"content\":", "\"é\"}"]));
    expect(await input.read()).toEqual({ kind: "read", value: "{\"content\":\"é\"}" });
  });

  it("rejects terminal input, empty input, oversized input, and invalid UTF-8", async () => {
    expect((await new AuditRequestInput(stream([], true)).read()).kind).toBe("failed");
    expect((await new AuditRequestInput(stream([])).read()).kind).toBe("failed");
    expect((await new AuditRequestInput(stream([new Uint8Array(16 * 1024 * 1024 + 1)])).read()).kind).toBe("failed");
    const invalidUtf8 = new Uint8Array([0xff]);
    expect((await new AuditRequestInput(stream([invalidUtf8])).read()).kind).toBe("failed");
  });

  it("returns a structured failure when reading the stream throws", async () => {
    const broken: AuditInputStream = {
      isTTY: false,
      chunks: async function* () { throw new Error("read failed"); },
    };
    expect(await new AuditRequestInput(broken).read()).toMatchObject({ kind: "failed", code: "audit_request_read_failed" });
  });
});
