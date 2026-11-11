import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { snapshotFrozenDependencies } from "../../scripts/build-release-binary.js";

const temporaryRoots: string[] = [];

function makeRoot(): string {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-frozen-deps-test-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) Fs.rmSync(root, { recursive: true, force: true });
});

describe("frozen dependency snapshots", () => {
  it("fingerprints dependency bytes and includes only links resolved inside the owned snapshot", () => {
    const root = makeRoot();
    const packageRoot = Path.join(root, "node_modules", "example-package");
    const workspacePackage = Path.join(root, "packages", "core");
    Fs.mkdirSync(packageRoot, { recursive: true });
    Fs.mkdirSync(workspacePackage, { recursive: true });
    Fs.writeFileSync(Path.join(packageRoot, "index.js"), "export const version = 1;\n");
    Fs.writeFileSync(Path.join(workspacePackage, "index.js"), "export const workspace = true;\n");
    const namespace = Path.join(root, "node_modules", "@vialactea-works");
    Fs.mkdirSync(namespace, { recursive: true });
    Fs.symlinkSync("../../packages/core", Path.join(namespace, "kepler-core"), "dir");

    const before = snapshotFrozenDependencies(root);
    Fs.writeFileSync(Path.join(packageRoot, "index.js"), "export const version = 2;\n");
    const after = snapshotFrozenDependencies(root);

    expect(before.entries).toBeGreaterThan(1);
    expect(after.digest).not.toBe(before.digest);
  });

  it("rejects dependency symlinks that escape the owned snapshot", () => {
    const root = makeRoot();
    const outside = makeRoot();
    const packageRoot = Path.join(root, "node_modules", "example-package");
    Fs.mkdirSync(packageRoot, { recursive: true });
    Fs.writeFileSync(Path.join(outside, "outside.js"), "outside\n");
    Fs.symlinkSync(Path.join(outside, "outside.js"), Path.join(packageRoot, "outside.js"));

    expect(() => snapshotFrozenDependencies(root)).toThrow(/symlink escapes its owned snapshot/i);
  });

  it("rejects hard-linked dependency bytes that remain shared with another location", () => {
    const root = makeRoot();
    const outside = makeRoot();
    const packageRoot = Path.join(root, "node_modules", "example-package");
    Fs.mkdirSync(packageRoot, { recursive: true });
    const sharedFile = Path.join(outside, "shared.js");
    Fs.writeFileSync(sharedFile, "shared\n");
    Fs.linkSync(sharedFile, Path.join(packageRoot, "shared.js"));

    expect(() => snapshotFrozenDependencies(root)).toThrow(/shared by a hard link/i);
  });
});
