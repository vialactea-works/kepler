import { describe, expect, it } from "vitest";
import {
  createBuildIdentity,
  createDevelopmentSourceIdentity,
  createSourceIdentity,
  sourceContentDigest,
} from "../../scripts/release-identity.js";

const digest = `sha256:${"a".repeat(64)}` as const;
const commit = "0123456789abcdef0123456789abcdef01234567";
const target = { os: "linux", arch: "x64" } as const;

function sourceFiles(extra = "") {
  return [
    { path: "src/main.ts", contents: new TextEncoder().encode("export {}\n") },
    { path: "skills/kepler-code/SKILL.md", contents: new TextEncoder().encode(extra) },
  ];
}

describe("immutable release identity", () => {
  it("hashes sorted source paths and contents deterministically", () => {
    const files = sourceFiles();
    expect(sourceContentDigest(files)).toBe(
      sourceContentDigest([...files].reverse()),
    );
    expect(sourceContentDigest(files)).not.toBe(sourceContentDigest(sourceFiles("changed")));
  });

  it("rejects source paths that are not normalized relative POSIX paths", () => {
    const contents = new TextEncoder().encode("source\n");
    expect(() => sourceContentDigest([{ path: "../src/main.ts", contents }])).toThrow(
      "not normalized and relative",
    );
    expect(() => sourceContentDigest([{ path: "src\\\\main.ts", contents }])).toThrow(
      "not normalized and relative",
    );
    expect(() => sourceContentDigest([{ path: "C:/src/main.ts", contents }])).toThrow(
      "not normalized and relative",
    );
  });

  it("identifies dirty source by its content rather than HEAD alone", () => {
    const clean = createSourceIdentity({ commit, clean: true, files: sourceFiles() });
    const dirty = createSourceIdentity({ commit, clean: false, files: sourceFiles("dirty") });

    expect(clean).toMatchObject({ kind: "production", commit });
    expect(dirty).toMatchObject({ kind: "development", commit });
    expect(dirty.content_digest).not.toBe(clean.content_digest);
  });

  it("marks an isolated development package as development even from clean source", () => {
    const clean = createSourceIdentity({ commit, clean: true, files: sourceFiles() });
    const development = createDevelopmentSourceIdentity(clean);

    expect(clean.kind).toBe("production");
    expect(development).toEqual({ ...clean, kind: "development" });
    expect(development.content_digest).toBe(clean.content_digest);
  });

  it("binds the release, source, target, and resource identity without a binary self-hash", () => {
    const source = createSourceIdentity({ commit, clean: false, files: sourceFiles() });
    const identity = createBuildIdentity("3.0.0", source, digest, target);

    expect(identity).toEqual({
      format_version: 1,
      kepler_release: "3.0.0",
      source,
      target,
      resource_digest: digest,
    });
    expect(JSON.stringify(identity)).not.toContain("binary_digest");
  });
});
