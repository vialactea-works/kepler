import { describe, expect, it } from "vitest";
import { MetadataJsonError, parseMetadataJsonObject } from "../../packages/cli/src/cli/metadata-json.js";

describe("metadata JSON", () => {
  it("parses an object with nested arrays and values", () => {
    expect(parseMetadataJsonObject('{"release":"3.0.0","files":[{"path":"bundle/a.md"}]}', "fixture"))
      .toEqual({ release: "3.0.0", files: [{ path: "bundle/a.md" }] });
  });

  it("rejects duplicate members at every object depth, including escaped-equivalent keys", () => {
    for (const contents of [
      '{"release":"3.0.0","release":"3.0.1"}',
      '{"outer":{"value":1,"value":2}}',
      '{"a":1,"\\u0061":2}',
    ]) {
      expect(() => parseMetadataJsonObject(contents, "fixture"))
        .toThrow(MetadataJsonError);
      expect(() => parseMetadataJsonObject(contents, "fixture"))
        .toThrow(/Duplicate JSON object member/);
    }
  });

  it("rejects malformed JSON and non-object top-level values", () => {
    for (const contents of ["{", "{} trailing", "null", "[]", '"value"']) {
      expect(() => parseMetadataJsonObject(contents, "fixture"))
        .toThrow(MetadataJsonError);
    }
  });
});
