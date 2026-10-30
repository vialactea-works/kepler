import { execa } from "execa";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = Path.resolve(import.meta.dirname, "../..");
const script = Path.join(repositoryRoot, "scripts", "release-assets.ts");
const version = "0.11.0";
const commit = "0123456789abcdef0123456789abcdef01234567";
const source = {
  repository: "vialactea-works/kepler",
  runId: "1234567",
  runAttempt: "1",
};
const assets = [
  "kepler-darwin-x64",
  "kepler-darwin-arm64",
  "kepler-linux-x64",
  "kepler-linux-arm64",
  "kepler-bundle.tar.gz",
  `kepler-core-${version}.tgz`,
];
const temporaryRoots: string[] = [];

const run = async (
  mode: "create" | "verify",
  directory: string,
  sourceCommit = commit,
): Promise<void> => {
  await execa(
    process.execPath,
    [
      script,
      "--mode",
      mode,
      "--assets",
      directory,
      "--version",
      version,
      "--commit",
      sourceCommit,
      "--repository",
      source.repository,
      "--run-id",
      source.runId,
      "--run-attempt",
      source.runAttempt,
    ],
    { cwd: repositoryRoot, timeout: 30_000 },
  );
};

const createAssetDirectory = async (): Promise<string> => {
  const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-release-assets-"));
  temporaryRoots.push(root);
  for (const [index, name] of assets.entries()) {
    await Fs.writeFile(Path.join(root, name), `release asset ${index}\n`);
  }
  return root;
};

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await Fs.rm(root, { recursive: true, force: true });
    await expect(Fs.access(root)).rejects.toThrow();
  }
});

describe("release asset provenance", () => {
  it("binds supported assets and checksums to the exact version and source commit", async () => {
    const directory = await createAssetDirectory();
    await run("create", directory);
    await run("verify", directory);

    const manifest = JSON.parse(
      await Fs.readFile(Path.join(directory, "RELEASE-MANIFEST.json"), "utf8"),
    ) as {
      readonly version: string;
      readonly tag: string;
      readonly source: { readonly commit: string; readonly repository: string };
      readonly assets: readonly { readonly name: string; readonly sha256: string }[];
    };
    expect(manifest.version).toBe(version);
    expect(manifest.tag).toBe(`v${version}`);
    expect(manifest.source.commit).toBe(commit);
    expect(manifest.source.repository).toBe(source.repository);
    expect(manifest.assets.map((asset) => asset.name)).toEqual([...assets].sort());

    await Fs.writeFile(Path.join(directory, assets[0]!), "tampered\n");
    await expect(run("verify", directory)).rejects.toThrow();
  });

  it("rejects provenance for a different source commit", async () => {
    const directory = await createAssetDirectory();
    await run("create", directory);
    await expect(
      run("verify", directory, "fedcba9876543210fedcba9876543210fedcba98"),
    ).rejects.toThrow();
  });
});
