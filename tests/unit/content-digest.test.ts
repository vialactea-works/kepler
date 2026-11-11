import { describe, expect, it } from "vitest";
import { sha256Digest, type ContentDigest } from "../../packages/cli/src/cli/content-digest.js";

describe("content digest", () => {
  it("computes stable SHA-256 digests for text and byte input", () => {
    const expected: ContentDigest = "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(sha256Digest("abc")).toBe(expected);
    expect(sha256Digest(new TextEncoder().encode("abc"))).toBe(expected);
  });
});
