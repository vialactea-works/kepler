import { execaSync } from "execa";
import { randomUUID } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ApplicationConnector } from "../../tests/e2e/connectors.js";
import { E2EWorkflow } from "../../tests/e2e/workflow-checkpoints.js";
import { TemporaryE2EResourceConnector } from "../../tests/e2e/resources.js";

const projectRoot = Path.resolve(import.meta.dirname, "../..");
const resourceConnector = new TemporaryE2EResourceConnector();
const checkpointPaths = new Set<string>();
const ownedRoots = new Map<string, string>();

interface PrivateFixtureFile {
  readonly directory: string;
  readonly name: string;
  readonly contents: string;
}

interface FixtureState {
  readonly rootDirectory: string;
  readonly ownerNonce: string;
  readonly homeDirectory: string;
  readonly configDirectory: string;
  readonly cacheDirectory: string;
  readonly temporaryDirectory: string;
  readonly repositoryDirectory: string;
  readonly workspaceDirectory: string;
  readonly initialHead: string;
  readonly initialReadme: string;
  readonly privateFiles: readonly PrivateFixtureFile[];
  readonly partTwoHead?: string;
}

const isolatedConnector: ApplicationConnector = {
  kind: "native",
  assertAvailable: () => undefined,
  invoke: () => {
    throw new Error("CLI transport is outside this fixture component test");
  },
};

const checkpointPath = async (): Promise<string> => {
  const path = Path.join(
    await Fs.realpath(Os.tmpdir()),
    `kepler-e2e-checkpoint-test-${randomUUID()}.json`,
  );
  checkpointPaths.add(path);
  return path;
};

const workflow = (scenario: string, path: string): E2EWorkflow =>
  new E2EWorkflow(scenario, { checkpointPath: path, connector: isolatedConnector });

const trackFixture = (state: Pick<FixtureState, "rootDirectory" | "ownerNonce">): void => {
  ownedRoots.set(state.rootDirectory, state.ownerNonce);
};

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await Fs.lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
};

afterEach(async () => {
  for (const [rootDirectory, ownerNonce] of ownedRoots) {
    if (await pathExists(rootDirectory)) {
      const resources = await resourceConnector.resume(rootDirectory, ownerNonce);
      await resources.cleanup();
    }
  }
  ownedRoots.clear();
  for (const path of checkpointPaths) {
    if (await pathExists(path)) {
      const stat = await Fs.lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`Refusing to remove a non-file test checkpoint: ${path}`);
      }
      await Fs.unlink(path);
    }
  }
  checkpointPaths.clear();
});

describe("E2E workflow fixture checkpoints", () => {
  it("reopens the same native Git fixture across a separate process and cleans it after finish", async () => {
    const scenario = "cross-process-fixture-resume";
    const path = await checkpointPath();
    const instance = workflow(scenario, path);
    let state!: FixtureState;

    await instance.start<FixtureState>(async (harness) => {
      const resources = harness.resources;
      const privateFiles: PrivateFixtureFile[] = [
        { directory: resources.homeDirectory, name: ".resume-state", contents: "home bytes\n" },
        { directory: resources.configDirectory, name: "resume-state", contents: "config bytes\n" },
        { directory: resources.cacheDirectory, name: "resume-state", contents: "cache bytes\n" },
        { directory: resources.workspaceDirectory, name: "resume-state", contents: "workspace bytes\n" },
      ];
      for (const file of privateFiles) {
        await Fs.writeFile(Path.join(file.directory, file.name), file.contents);
      }
      state = {
        rootDirectory: resources.rootDirectory,
        ownerNonce: resources.ownerNonce,
        homeDirectory: resources.homeDirectory,
        configDirectory: resources.configDirectory,
        cacheDirectory: resources.cacheDirectory,
        temporaryDirectory: resources.temporaryDirectory,
        repositoryDirectory: resources.repositoryDirectory,
        workspaceDirectory: resources.workspaceDirectory,
        initialHead: resources.runGit(resources.repositoryDirectory, "rev-parse", "HEAD"),
        initialReadme: await Fs.readFile(Path.join(resources.repositoryDirectory, "README.md"), "utf8"),
        privateFiles,
      };
      trackFixture(state);
      return state;
    });

    expect(await pathExists(path)).toBe(true);
    const script = `
      import assert from "node:assert/strict";
      import { readFileSync, writeFileSync } from "node:fs";
      import * as Path from "node:path";
      import { E2EWorkflow } from "./tests/e2e/workflow-checkpoints.ts";
      const scenario = ${JSON.stringify(scenario)};
      const checkpointPath = ${JSON.stringify(path)};
      const connector = { kind: "native", assertAvailable() {}, invoke() { throw new Error("unexpected CLI transport"); } };
      const workflow = new E2EWorkflow(scenario, { checkpointPath, connector });
      await workflow.continue(2, async (harness, state) => {
        const resources = harness.resources;
        assert.equal(resources.rootDirectory, state.rootDirectory);
        assert.equal(resources.ownerNonce, state.ownerNonce);
        assert.equal(resources.homeDirectory, state.homeDirectory);
        assert.equal(resources.configDirectory, state.configDirectory);
        assert.equal(resources.cacheDirectory, state.cacheDirectory);
        assert.equal(resources.temporaryDirectory, state.temporaryDirectory);
        assert.equal(resources.repositoryDirectory, state.repositoryDirectory);
        assert.equal(resources.workspaceDirectory, state.workspaceDirectory);
        assert.equal(resources.environment().HOME, state.homeDirectory);
        assert.equal(resources.environment().XDG_CONFIG_HOME, state.configDirectory);
        assert.equal(resources.environment().XDG_CACHE_HOME, state.cacheDirectory);
        assert.equal(resources.runGit(resources.repositoryDirectory, "rev-parse", "HEAD"), state.initialHead);
        assert.equal(readFileSync(Path.join(resources.repositoryDirectory, "README.md"), "utf8"), state.initialReadme);
        for (const file of state.privateFiles) {
          assert.equal(readFileSync(Path.join(file.directory, file.name), "utf8"), file.contents);
        }
        writeFileSync(Path.join(resources.repositoryDirectory, "part-two.txt"), "part two bytes\\n");
        resources.runGit(resources.repositoryDirectory, "add", "part-two.txt");
        resources.runGit(resources.repositoryDirectory, "commit", "-q", "-m", "Continue the same fixture");
        return { ...state, partTwoHead: resources.runGit(resources.repositoryDirectory, "rev-parse", "HEAD") };
      });
    `;
    const child = execaSync(process.execPath, ["-e", script], {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        CI: "1",
        HOME: process.env.HOME ?? "",
        KEPLER_E2E_TEST_SCENARIO: scenario,
        PATH: process.env.PATH ?? "",
        TMPDIR: Os.tmpdir(),
      },
      extendEnv: false,
      reject: false,
      timeout: 30_000,
    });
    expect(child.exitCode, `${child.stderr}\n${child.stdout}`).toBe(0);

    await instance.finish<FixtureState>(3, async (harness, resumed) => {
      expect(resumed.rootDirectory).toBe(state.rootDirectory);
      expect(resumed.partTwoHead).toBeTruthy();
      expect(harness.resources.runGit(resumed.repositoryDirectory, "rev-parse", "HEAD"))
        .toBe(resumed.partTwoHead);
      expect(await Fs.readFile(Path.join(resumed.repositoryDirectory, "part-two.txt"), "utf8"))
        .toBe("part two bytes\n");
    });

    expect(await pathExists(state.rootDirectory)).toBe(false);
    expect(await pathExists(path)).toBe(false);
  });

  it("fails closed for missing, wrong-part, wrong-scenario, and stale fixture checkpoints", async () => {
    const missingPath = await checkpointPath();
    await expect(workflow("missing-checkpoint", missingPath).continue(2, async () => ({})))
      .rejects.toThrow();

    const scenario = "strict-resume-guards";
    const path = await checkpointPath();
    const instance = workflow(scenario, path);
    let state!: FixtureState;
    await instance.start<FixtureState>(async (harness) => {
      state = {
        rootDirectory: harness.resources.rootDirectory,
        ownerNonce: harness.resources.ownerNonce,
        homeDirectory: harness.resources.homeDirectory,
        configDirectory: harness.resources.configDirectory,
        cacheDirectory: harness.resources.cacheDirectory,
        temporaryDirectory: harness.resources.temporaryDirectory,
        repositoryDirectory: harness.resources.repositoryDirectory,
        workspaceDirectory: harness.resources.workspaceDirectory,
        initialHead: harness.resources.runGit(harness.resources.repositoryDirectory, "rev-parse", "HEAD"),
        initialReadme: await Fs.readFile(Path.join(harness.resources.repositoryDirectory, "README.md"), "utf8"),
        privateFiles: [],
      };
      trackFixture(state);
      return state;
    });

    await expect(workflow("foreign-scenario", path).continue(2, async () => ({})))
      .rejects.toThrow("does not match this scenario");
    await expect(instance.finish(3, async () => undefined))
      .rejects.toThrow("does not match this scenario, checkout, path, or part");
    await expect(instance.continue(3, async () => ({})))
      .rejects.toThrow("continuation part must be 2");
    expect(await pathExists(state.rootDirectory)).toBe(true);
    expect(await pathExists(path)).toBe(true);

    const readmePath = Path.join(state.repositoryDirectory, "README.md");
    await Fs.writeFile(readmePath, "changed fixture bytes\n");
    await expect(instance.continue<FixtureState, FixtureState>(2, async (_harness, saved) => saved))
      .rejects.toThrow("fixture changed after its checkpoint was settled");
    expect(await pathExists(state.rootDirectory)).toBe(true);
    expect(await pathExists(path)).toBe(true);

    await Fs.writeFile(readmePath, state.initialReadme);
    await instance.continue<FixtureState, FixtureState>(2, async (_harness, saved) => saved);
    await instance.finish(3, async () => undefined);
    expect(await pathExists(state.rootDirectory)).toBe(false);
    expect(await pathExists(path)).toBe(false);
  });

  it("rejects altered foreign-source markers and symlinked resource roots without deleting them", async () => {
    const scenario = "resource-owner-validation";
    const path = await checkpointPath();
    const instance = workflow(scenario, path);
    let state!: FixtureState;
    await instance.start<FixtureState>(async (harness) => {
      state = {
        rootDirectory: harness.resources.rootDirectory,
        ownerNonce: harness.resources.ownerNonce,
        homeDirectory: harness.resources.homeDirectory,
        configDirectory: harness.resources.configDirectory,
        cacheDirectory: harness.resources.cacheDirectory,
        temporaryDirectory: harness.resources.temporaryDirectory,
        repositoryDirectory: harness.resources.repositoryDirectory,
        workspaceDirectory: harness.resources.workspaceDirectory,
        initialHead: harness.resources.runGit(harness.resources.repositoryDirectory, "rev-parse", "HEAD"),
        initialReadme: await Fs.readFile(Path.join(harness.resources.repositoryDirectory, "README.md"), "utf8"),
        privateFiles: [],
      };
      trackFixture(state);
      return state;
    });

    const originalCheckpoint = await Fs.readFile(path);
    const temporaryDirectory = await Fs.realpath(Os.tmpdir());
    const foreignRoot = Path.join(temporaryDirectory, `kepler-e2e-foreign-${randomUUID()}`);
    const foreignCheckpoint = JSON.parse(originalCheckpoint.toString("utf8")) as Record<string, unknown>;
    foreignCheckpoint.rootDirectory = foreignRoot;
    await Fs.writeFile(path, `${JSON.stringify(foreignCheckpoint)}\n`, { mode: 0o600 });
    await expect(instance.continue(2, async () => ({}))).rejects.toThrow("ENOENT");
    expect(await pathExists(state.rootDirectory)).toBe(true);
    expect(await pathExists(foreignRoot)).toBe(false);
    await Fs.writeFile(path, originalCheckpoint, { mode: 0o600 });

    const markerPath = Path.join(state.rootDirectory, ".kepler-e2e-owner.json");
    const markerBytes = await Fs.readFile(markerPath);
    const marker = JSON.parse(markerBytes.toString("utf8")) as Record<string, unknown>;
    marker.sourceCheckout = "/foreign/checkout";
    await Fs.writeFile(markerPath, `${JSON.stringify(marker)}\n`, { mode: 0o600 });
    await expect(instance.continue(2, async () => ({}))).rejects.toThrow("ownership marker does not match");
    expect(await pathExists(state.rootDirectory)).toBe(true);
    expect(await pathExists(path)).toBe(true);
    await Fs.writeFile(markerPath, markerBytes, { mode: 0o600 });

    const movedRoot = Path.join(temporaryDirectory, `kepler-e2e-moved-${randomUUID()}`);
    await Fs.rename(state.rootDirectory, movedRoot);
    await Fs.symlink(movedRoot, state.rootDirectory, "dir");
    await expect(instance.continue(2, async () => ({}))).rejects.toThrow("not a private real directory");
    await Fs.unlink(state.rootDirectory);
    await Fs.rename(movedRoot, state.rootDirectory);

    await instance.continue<FixtureState, FixtureState>(2, async (_harness, saved) => saved);
    await instance.finish(3, async () => undefined);
    expect(await pathExists(state.rootDirectory)).toBe(false);
    expect(await pathExists(path)).toBe(false);
  });

  it.each([
    ["error", new Error("intentional callback failure")],
    ["undefined", undefined],
    ["null", null],
    ["zero", 0],
    ["empty string", ""],
  ] as const)("cleans the validated fixture and exact checkpoint after callback failure (%s)", async (_label, callbackError) => {
    const scenario = "callback-failure-cleanup";
    const path = await checkpointPath();
    const instance = workflow(scenario, path);
    let state!: FixtureState;
    await instance.start<FixtureState>(async (harness) => {
      state = {
        rootDirectory: harness.resources.rootDirectory,
        ownerNonce: harness.resources.ownerNonce,
        homeDirectory: harness.resources.homeDirectory,
        configDirectory: harness.resources.configDirectory,
        cacheDirectory: harness.resources.cacheDirectory,
        temporaryDirectory: harness.resources.temporaryDirectory,
        repositoryDirectory: harness.resources.repositoryDirectory,
        workspaceDirectory: harness.resources.workspaceDirectory,
        initialHead: harness.resources.runGit(harness.resources.repositoryDirectory, "rev-parse", "HEAD"),
        initialReadme: await Fs.readFile(Path.join(harness.resources.repositoryDirectory, "README.md"), "utf8"),
        privateFiles: [],
      };
      trackFixture(state);
      return state;
    });
    await expect(instance.continue(2, async () => { throw callbackError; }))
      .rejects.toBe(callbackError);
    expect(await pathExists(state.rootDirectory)).toBe(false);
    expect(await pathExists(path)).toBe(false);
  });

  it("rejects an oversized checkpoint before scenario execution and preserves it", async () => {
    const path = await checkpointPath();
    const length = 8 * 1024 * 1024 + 1;
    await Fs.writeFile(path, Buffer.alloc(length, 0x20), { mode: 0o600, flag: "wx" });
    let called = false;
    await expect(workflow("oversized-checkpoint", path).continue(2, async () => {
      called = true;
      return {};
    })).rejects.toThrow("size limit");
    expect(called).toBe(false);
    expect((await Fs.stat(path)).size).toBe(length);
  });

  it("does not overwrite an existing foreign checkpoint on start", async () => {
    const path = await checkpointPath();
    const foreignBytes = Buffer.from('{"foreign":true}\n');
    await Fs.writeFile(path, foreignBytes, { mode: 0o600, flag: "wx" });
    let called = false;
    await expect(workflow("do-not-overwrite", path).start(async () => {
      called = true;
      return {};
    })).rejects.toThrow("already exists");
    expect(called).toBe(false);
    expect(await Fs.readFile(path)).toEqual(foreignBytes);
  });
});
