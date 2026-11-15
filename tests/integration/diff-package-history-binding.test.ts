import "reflect-metadata";
import type { DynamicModule, INestApplicationContext } from "@nestjs/common";
import { CommandFactory } from "nest-commander";
import { randomUUID, createHash } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitCommand } from "../../packages/cli/src/cli/nest/capability.commands.js";
import {
  createHistoryBoundDiffPackageOperation,
  GIT_DIFF_PACKAGE_OPERATION,
  GitDiffPackageCommand,
  GitDiffPackageIntegrationCommand,
  GitDiffPackageUnitReviewCommand,
  GitDiffPackageValidationCommand,
  type GitDiffPackageOperation,
} from "../../packages/cli/src/cli/nest/diff-package.commands.js";
import { MissionMutations } from "../../packages/cli/src/cli/mission-mutations.js";
import { createNodeUnitQueryFileSystem } from "../../packages/cli/src/construction/unit-queries-runtime.js";
import { UnitQueries } from "../../packages/cli/src/construction/unit-queries.js";
import { HistoryMutations } from "../../packages/cli/src/history/mutations.js";
import { historyReaderMetadata } from "../../packages/cli/src/history/reader.js";
import { GitDiffPackageService } from "../../packages/cli/src/workbench/diff-package.js";
import { GitDiffPackageAdapter } from "../../packages/cli/src/workbench/git-diff-package.js";
import type { DiffPackageResolvedSource } from "../../packages/cli/src/construction/diff-package-source.js";
import { GitAuthorLookup } from "../../packages/cli/src/cli/git-author.js";
import { ResultModule } from "../../packages/cli/src/cli/nest/result.module.js";
import { parseCliEnvelope } from "../cli/result-envelope.js";
import { createHistoryRepository } from "../support/history-repository.js";

const repositories: string[] = [];
const unit = "2026-11-13-recovery";
const implementationAttempt = "40000000-0000-4000-8000-000000000001";

const git = (cwd: string, ...args: string[]): string => Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" }).stdout.toString().trim();

const snapshot = async (root: string): Promise<Record<string, string>> => {
  const result: Record<string, string> = {};
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await Fs.readdir(directory, { withFileTypes: true })) {
      const path = Path.join(directory, entry.name);
      const relative = Path.relative(root, path);
      if (entry.isDirectory()) {
        result[`directory:${relative}`] = "";
        await visit(path);
      } else if (entry.isFile()) {
        result[`file:${relative}`] = createHash("sha256").update(await Fs.readFile(path)).digest("hex");
      }
    }
  };
  await visit(root);
  return result;
};

const runCli = async (arguments_: string[], operation: GitDiffPackageOperation) => {
  let stdout = "";
  let stderr = "";
  let thrown: unknown;
  let application: INestApplicationContext | undefined;
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  class DiffPackageHistoryIntegrationModule {}
  const rootModule: DynamicModule = {
    module: DiffPackageHistoryIntegrationModule,
    imports: [ResultModule],
    providers: [
      GitCommand,
      GitDiffPackageCommand,
      GitDiffPackageValidationCommand,
      GitDiffPackageIntegrationCommand,
      GitDiffPackageUnitReviewCommand,
      { provide: GitAuthorLookup, useValue: { execute: async () => ({ kind: "failed" }) } },
      { provide: GIT_DIFF_PACKAGE_OPERATION, useValue: operation },
    ],
  };

  try {
    process.exitCode = 0;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stderr.write;
    application = await CommandFactory.createWithoutRunning(rootModule, {
      cliName: "kepler",
      errorHandler: (error) => { throw error; },
      serviceErrorHandler: (error) => { throw error; },
    });
    process.argv = [originalArgv[0], "kepler", ...arguments_];
    try {
      await CommandFactory.runApplication(application);
    } catch (error) {
      thrown = error;
    }
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    await application?.close();
  }

  return { result: parseCliEnvelope(stdout), stderr, thrown };
};

const prepareOperation = async () => {
  const repository = await createHistoryRepository();
  repositories.push(repository.parent);
  const { root, f, access } = repository;
  await access.join({ recordHome: root, missionId: f.missionId, historyVersion: f.control.id }, async () => undefined);
  await Fs.writeFile(Path.join(root, "README.md"), "Diff package source\n", "utf8");
  git(root, "config", "user.name", "Diff package test");
  git(root, "config", "user.email", "diff-package@example.invalid");
  git(root, "add", "README.md");
  if (Bun.spawnSync(["git", "commit", "-q", "-m", "source baseline"], { cwd: root }).exitCode !== 0) throw new Error("Could not commit the disposable diff-package baseline.");
  const base = git(root, "rev-parse", "HEAD");
  await Fs.writeFile(Path.join(root, "result.txt"), "selected generation result\n", "utf8");
  git(root, "add", "result.txt");
  if (Bun.spawnSync(["git", "commit", "-q", "-m", "selected source"], { cwd: root }).exitCode !== 0) throw new Error("Could not commit the disposable diff-package target.");
  const target = git(root, "rev-parse", "HEAD");
  const selected = await access.read(root, f.missionId);
  const metadata = historyReaderMetadata(selected);
  const workspaceId = "a".repeat(64);
  const workspacePath = await Fs.realpath(root);
  const gitDirectory = git(root, "rev-parse", "--absolute-git-dir");
  const commonDirectory = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const attachmentDirectory = Path.join(commonDirectory, "kepler", "missions", f.missionId, "workspaces");
  await Fs.mkdir(attachmentDirectory, { recursive: true });
  await Fs.writeFile(Path.join(attachmentDirectory, `${workspaceId}.json`), `${JSON.stringify({
    format: "kepler.mission-workspace.v1",
    mission_id: f.missionId,
    record_home_repository_id: "record-home",
    repository_id: "record-home",
    workspace_id: workspaceId,
    workspace_path: workspacePath,
    repository_path: workspacePath,
    git_directory: gitDirectory,
    common_directory: commonDirectory,
    branch: "main",
    integration_target: "refs/heads/main",
    starting_checkpoint: { kind: "no-commit" },
  })}\n`, "utf8");
  await Fs.mkdir(Path.join(root, ".kepler", "packages"), { recursive: true });
  const source: DiffPackageResolvedSource = {
    scope: { kind: "unit-review", unitId: f.unitId, implementationAttemptId: implementationAttempt },
    projectRoot: workspacePath,
    missionId: f.missionId,
    historyVersion: metadata.history_version,
    generationId: metadata.generation_id,
    historyMetadata: metadata,
    recordHomeRepositoryId: "record-home",
    workspaceRepositories: [{
      repository_id: "record-home",
      context: { kind: "existing" },
      branch: "main",
      integration_target: "refs/heads/main",
      starting_checkpoint: { kind: "no-commit" },
    }],
    comparisons: [{
      role: "unit-review-original-baseline-to-completion",
      repositoryId: "record-home",
      base: { repositoryId: "record-home", commit: base },
      target: { repositoryId: "record-home", commit: target },
      sourceEventIds: [],
      accepted: null,
    }],
    taskDefinitions: [],
    upstreamVersions: [],
    sourceAttempts: [],
    activityEvidence: [],
    retainedScopes: [],
    integrationHistory: [],
    sourceRecords: [],
  };
  const service = new GitDiffPackageService({
    resolve: async (scope) => ({ kind: "resolved", source: { ...source, scope } }),
  }, new GitDiffPackageAdapter());
  const units = new UnitQueries(
    { resolve: async () => ({ kind: "resolved", root }) },
    createNodeUnitQueryFileSystem(),
    access,
  );
  const mutations = new MissionMutations(
    { resolve: async () => ({ kind: "resolved", root }) },
    units,
    new HistoryMutations(access),
  );
  return {
    root,
    f,
    commonDirectory,
    operation: createHistoryBoundDiffPackageOperation(service, mutations),
  };
};

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((root) => Fs.rm(root, { recursive: true, force: true })));
});

describe("diff-package history-version admission through the CLI", () => {
  it("holds selected history admission around Git comparison and the --out write", async () => {
    const { root, f, operation } = await prepareOperation();
    const outputPath = ".kepler/packages/review.md";
    const result = await runCli([
      "git", "diff-package", "unit-review", "--unit", unit,
      "--implementation-attempt", implementationAttempt,
      "--history-version", f.control.id,
      "--out", outputPath,
    ], operation);

    expect(result.thrown).toBeUndefined();
    expect(result.result).toMatchObject({
      status: "success",
      data: {
        history_version: f.control.id,
        generation_id: f.generationId,
        output: Path.join(root, outputPath),
      },
    });
    const content = await Fs.readFile(Path.join(root, outputPath), "utf8");
    expect(content).toContain(f.control.id);
    expect(content).toContain(f.generationId);
    const view = await prepareWritersPath(root, f.missionId);
    expect(view).toEqual([]);
  });

  it("rejects missing and stale output versions without creating output or writer ownership files", async () => {
    const { root, f, commonDirectory, operation } = await prepareOperation();
    const coordinationRoot = Path.join(commonDirectory, "kepler", "missions", f.missionId);
    const before = await snapshot(coordinationRoot);
    const missingPath = ".kepler/packages/missing.md";
    const missing = await runCli([
      "git", "diff-package", "unit-review", "--unit", unit,
      "--implementation-attempt", implementationAttempt,
      "--out", missingPath,
    ], operation);
    expect(missing.thrown).toBeUndefined();
    expect(missing.result).toMatchObject({ status: "failed", data: { code: "history_version_required" } });
    await expect(Fs.access(Path.join(root, missingPath))).rejects.toThrow();
    expect(await snapshot(coordinationRoot)).toEqual(before);

    const stalePath = ".kepler/packages/stale.md";
    const stale = await runCli([
      "git", "diff-package", "unit-review", "--unit", unit,
      "--implementation-attempt", implementationAttempt,
      "--history-version", randomUUID(),
      "--out", stalePath,
    ], operation);
    expect(stale.thrown).toBeUndefined();
    expect(stale.result).toMatchObject({ status: "failed", data: { code: "history_version_mismatch" } });
    await expect(Fs.access(Path.join(root, stalePath))).rejects.toThrow();
    expect(await snapshot(coordinationRoot)).toEqual(before);
  });
});

const prepareWritersPath = async (root: string, missionId: string): Promise<string[]> => {
  const access = await Fs.realpath(Path.join(root, ".git"));
  const writers = Path.join(access, "kepler", "missions", missionId, "coordination", "history-writers");
  try {
    return (await Fs.readdir(writers)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
};
