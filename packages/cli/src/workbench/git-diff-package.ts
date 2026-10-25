import { spawn } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { parseAttachment, type LocalWorkspaceAttachment } from "../construction/mission-workspace.js";
import type { DiffPackageResolvedSource } from "../construction/diff-package-source.js";

export interface GitDiffPackageProcessResult {
  readonly status: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

export interface GitDiffPackageProcessPort {
  run(command: string, args: readonly string[], cwd: string): Promise<GitDiffPackageProcessResult>;
}

export type GitDiffPackageWriteResult =
  | { readonly kind: "written" }
  | { readonly kind: "failed"; readonly created: boolean; readonly message: string };

export interface GitDiffPackageFileSystemPort {
  realpath(path: string): Promise<string>;
  directoryExists(path: string): Promise<boolean>;
  pathExists(path: string): Promise<boolean>;
  readDirectory(path: string): Promise<readonly string[]>;
  readFile(path: string): Promise<string>;
  createTemporaryDirectory(prefix: string): Promise<string>;
  writeExclusive(path: string, content: string): Promise<GitDiffPackageWriteResult>;
  removeFile(path: string): Promise<void>;
  removeTemporaryDirectory(path: string): Promise<void>;
}

export interface GitDiffPackageRuntime {
  readonly process: GitDiffPackageProcessPort;
  readonly fileSystem: GitDiffPackageFileSystemPort;
  readonly temporaryDirectory: string;
}

export interface GitDiffPackageFileChange {
  readonly path: string;
  readonly pathBytesBase64: string;
  readonly status: string;
  readonly additions: number | null;
  readonly deletions: number | null;
  readonly nontext: boolean;
  readonly oldMode: string;
  readonly newMode: string;
  readonly oldObjectId: string | null;
  readonly newObjectId: string | null;
  readonly objectAccess: readonly { readonly command: string; readonly args: readonly string[] }[];
}

export interface GitDiffPackageCommit {
  readonly commit: string;
  readonly parents: readonly string[];
  readonly relation: "comparison-range" | "target-checkpoint";
  readonly changedPaths: readonly { readonly path: string; readonly pathBytesBase64: string }[];
}

export interface GitDiffPackageRepositoryBinding {
  readonly repositoryId: string;
  readonly workspacePath: string;
  readonly gitDirectory: string;
  readonly commonDirectory: string;
}

export interface GitDiffPackageComparison {
  readonly binding: DiffPackageResolvedSource["comparisons"][number];
  readonly repositoryRoot: string;
  readonly baseIsAncestor: boolean | null;
  readonly files: readonly GitDiffPackageFileChange[];
  readonly commits: readonly GitDiffPackageCommit[];
  readonly patch: string;
  readonly patchBytesBase64?: string;
}

export interface GitDiffPackageAdapterFailure {
  readonly kind: "failed";
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly recovery: string;
}

const failed = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Preserve the selected source records and repository state, then resolve the reported Git or output condition.",
): GitDiffPackageAdapterFailure => ({ kind: "failed", code, message, details, recovery });

const gitEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("GIT_")) environment[key] = value;
  }
  Object.assign(environment, {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
  });
  return environment;
};

const nodeProcess: GitDiffPackageProcessPort = {
  run: (command, args, cwd) => new Promise((resolve) => {
    const child = spawn(command, [...args], {
      cwd,
      env: gitEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => resolve({ status: -1, stdout: Buffer.concat(stdout), stderr: Buffer.from(error.message) }));
    child.on("close", (code) => resolve({
      status: code === null ? -1 : code,
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat(stderr),
    }));
  }),
};

const nodeFileSystem: GitDiffPackageFileSystemPort = {
  realpath: (path) => Fs.realpath(path),
  directoryExists: async (path) => {
    try { return (await Fs.stat(path)).isDirectory(); } catch { return false; }
  },
  pathExists: async (path) => {
    try { await Fs.lstat(path); return true; } catch { return false; }
  },
  readDirectory: async (path) => (await Fs.readdir(path)).sort((left, right) => left.localeCompare(right)),
  readFile: (path) => Fs.readFile(path, "utf8"),
  createTemporaryDirectory: (prefix) => Fs.mkdtemp(prefix),
  writeExclusive: async (path, content) => {
    let file: Awaited<ReturnType<typeof Fs.open>> | undefined;
    let created = false;
    try {
      file = await Fs.open(path, "wx", 0o600);
      created = true;
      await file.writeFile(content, "utf8");
      await file.sync();
      await file.close();
      return { kind: "written" };
    } catch (error) {
      await file?.close().catch(() => undefined);
      return {
        kind: "failed",
        created,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
  removeFile: async (path) => { await Fs.unlink(path); },
  removeTemporaryDirectory: async (path) => { await Fs.rmdir(path); },
};

export const createNodeGitDiffPackageRuntime = (
  overrides: Partial<GitDiffPackageRuntime> = {},
): GitDiffPackageRuntime => ({
  process: overrides.process ?? nodeProcess,
  fileSystem: overrides.fileSystem ?? nodeFileSystem,
  temporaryDirectory: overrides.temporaryDirectory ?? Os.tmpdir(),
});

const output = (result: GitDiffPackageProcessResult): string => result.stdout.toString("utf8").replace(/[\r\n]+$/, "");
const errorOutput = (result: GitDiffPackageProcessResult): string => result.stderr.toString("utf8").trim();

const contained = (root: string, candidate: string): boolean => {
  const relative = Path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${Path.sep}`) && !Path.isAbsolute(relative));
};

const startingCheckpointMatches = (left: unknown, right: unknown): boolean => {
  if (typeof left !== "object" || left === null || Array.isArray(left) ||
      typeof right !== "object" || right === null || Array.isArray(right)) return false;
  const expected = left as Record<string, unknown>;
  const actual = right as Record<string, unknown>;
  if (expected.kind !== actual.kind) return false;
  return expected.kind === "no-commit" ||
    (expected.kind === "commit" && typeof expected.commit === "string" && expected.commit === actual.commit);
};

const checkpointIdPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

const isFailure = (value: unknown): value is GitDiffPackageAdapterFailure =>
  typeof value === "object" && value !== null && "kind" in value && value.kind === "failed";

const bytePath = (bytes: Buffer): { readonly path: string; readonly pathBytesBase64: string } => {
  const pathBytesBase64 = bytes.toString("base64");
  const path = bytes.toString("utf8");
  return Buffer.from(path, "utf8").equals(bytes)
    ? { path, pathBytesBase64 }
    : { path: `base64:${pathBytesBase64}`, pathBytesBase64 };
};

const nulSeparated = (value: Buffer): Buffer[] => {
  const parts: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== 0) continue;
    parts.push(value.subarray(start, index));
    start = index + 1;
  }
  if (start < value.length) parts.push(value.subarray(start));
  return parts;
};

interface RawDiffEntry {
  readonly oldMode: string;
  readonly newMode: string;
  readonly oldObjectId: string | null;
  readonly newObjectId: string | null;
  readonly status: string;
  readonly path: Buffer;
}

interface NumStatEntry {
  readonly additions: number | null;
  readonly deletions: number | null;
  readonly path: Buffer;
}

const parseRawDiff = (raw: Buffer): RawDiffEntry[] | undefined => {
  const parts = nulSeparated(raw);
  const result: RawDiffEntry[] = [];
  for (let index = 0; index < parts.length;) {
    const header = parts[index++]!.toString("ascii");
    const path = parts[index++];
    const match = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z][0-9]*)$/.exec(header);
    if (!match || !path || path.length === 0) return undefined;
    const [, oldMode, newMode, oldId, newId, status] = match;
    result.push({
      oldMode: oldMode!,
      newMode: newMode!,
      oldObjectId: /^0+$/.test(oldId!) ? null : oldId!,
      newObjectId: /^0+$/.test(newId!) ? null : newId!,
      status: status!,
      path,
    });
  }
  return result;
};

const parseNumStat = (raw: Buffer): NumStatEntry[] | undefined => {
  const result: NumStatEntry[] = [];
  for (const entry of nulSeparated(raw)) {
    const firstTab = entry.indexOf(9);
    const secondTab = firstTab < 0 ? -1 : entry.indexOf(9, firstTab + 1);
    if (firstTab < 0 || secondTab < 0) return undefined;
    const additionsText = entry.subarray(0, firstTab).toString("ascii");
    const deletionsText = entry.subarray(firstTab + 1, secondTab).toString("ascii");
    const path = entry.subarray(secondTab + 1);
    const count = (value: string): number | null => value === "-" ? null : /^\d+$/.test(value) ? Number(value) : NaN;
    const additions = count(additionsText);
    const deletions = count(deletionsText);
    if (Number.isNaN(additions) || Number.isNaN(deletions) || path.length === 0) return undefined;
    result.push({ additions, deletions, path });
  }
  return result;
};

const pathKey = (path: Buffer): string => path.toString("base64");

export class GitDiffPackageAdapter {
  constructor(private readonly runtime: GitDiffPackageRuntime = createNodeGitDiffPackageRuntime()) {}

  async resolveRepositoryRoots(
    source: DiffPackageResolvedSource,
  ): Promise<{ readonly kind: "resolved"; readonly roots: ReadonlyMap<string, GitDiffPackageRepositoryBinding> } | GitDiffPackageAdapterFailure> {
    const { fileSystem, process: processPort } = this.runtime;
    let recordHomeRoot: string;
    try {
      recordHomeRoot = await fileSystem.realpath(source.projectRoot);
    } catch (error) {
      return failed("diff_package_record_home_unavailable", "The selected record-home working tree cannot be resolved.", {
        path: source.projectRoot,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const topLevel = await processPort.run("git", ["rev-parse", "--show-toplevel"], recordHomeRoot);
    if (topLevel.status !== 0) return failed("diff_package_record_home_not_git", "Git could not resolve the selected record-home repository.", { stderr: errorOutput(topLevel) });
    let resolvedTopLevel: string;
    try { resolvedTopLevel = await fileSystem.realpath(output(topLevel)); } catch {
      return failed("diff_package_record_home_not_git", "The selected record-home repository root does not resolve.", { path: output(topLevel) });
    }
    if (resolvedTopLevel !== recordHomeRoot) {
      return failed("diff_package_record_home_root_mismatch", "The selected record-home path must name the repository root.", { selected: recordHomeRoot, repository_root: resolvedTopLevel });
    }
    const commonResult = await processPort.run("git", ["rev-parse", "--git-common-dir"], recordHomeRoot);
    if (commonResult.status !== 0) return failed("diff_package_workspace_binding_unavailable", "Git could not resolve the record-home common directory.", { stderr: errorOutput(commonResult) });
    let commonDirectory: string;
    try {
      const value = output(commonResult);
      commonDirectory = await fileSystem.realpath(Path.isAbsolute(value) ? value : Path.resolve(recordHomeRoot, value));
    } catch (error) {
      return failed("diff_package_workspace_binding_unavailable", "The record-home common directory does not resolve.", { message: error instanceof Error ? error.message : String(error) });
    }
    const attachmentDirectory = Path.join(commonDirectory, "kepler", "missions", source.missionId, "workspaces");
    let attachmentFiles: readonly string[];
    try {
      attachmentFiles = (await fileSystem.readDirectory(attachmentDirectory)).filter((name) => name.endsWith(".json"));
    } catch (error) {
      return failed("diff_package_workspace_binding_missing", "The recorded mission workspace attachments are unavailable.", {
        mission_id: source.missionId,
        attachment_directory: attachmentDirectory,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const attachments: LocalWorkspaceAttachment[] = [];
    for (const name of attachmentFiles) {
      try {
        const parsed = parseAttachment(JSON.parse(await fileSystem.readFile(Path.join(attachmentDirectory, name))));
        if (parsed) attachments.push(parsed);
      } catch {
        continue;
      }
    }
    const requiredRepositoryIds = [...new Set([
      ...source.workspaceRepositories.map((repository) => repository.repository_id),
      ...source.comparisons.map((comparison) => comparison.repositoryId),
    ])];
    const expectedRepositories = new Map<string, DiffPackageResolvedSource["workspaceRepositories"][number]>();
    for (const repository of source.workspaceRepositories) {
      if (expectedRepositories.has(repository.repository_id)) {
        return failed("diff_package_workspace_binding_ambiguous", "The selected mission records a repository identity more than once.", { repository_id: repository.repository_id });
      }
      expectedRepositories.set(repository.repository_id, repository);
    }
    const roots = new Map<string, GitDiffPackageRepositoryBinding>();
    for (const repositoryId of requiredRepositoryIds) {
      const expected = expectedRepositories.get(repositoryId);
      if (!expected) return failed("diff_package_repository_binding_missing", "A comparison names a repository that is absent from the recorded prepared-workspace set.", { repository_id: repositoryId });
      const matches = attachments.filter((attachment) =>
        attachment.mission_id === source.missionId &&
        attachment.record_home_repository_id === source.recordHomeRepositoryId &&
        attachment.repository_id === repositoryId &&
        attachment.branch === expected.branch &&
        attachment.integration_target === expected.integration_target &&
        startingCheckpointMatches(attachment.starting_checkpoint, expected.starting_checkpoint));
      if (matches.length !== 1) {
        return failed(matches.length === 0 ? "diff_package_workspace_binding_missing" : "diff_package_workspace_binding_ambiguous",
          matches.length === 0 ? "The source repository has no exact prepared-workspace attachment." : "The source repository has multiple exact prepared-workspace attachments.",
          { mission_id: source.missionId, repository_id: repositoryId, matching_attachments: matches.length });
      }
      const attachment = matches[0]!;
      const repository = await this.verifyAttachment(attachment, recordHomeRoot);
      if (repository.kind === "failed") return repository;
      roots.set(repositoryId, repository.repository);
    }
    return { kind: "resolved", roots };
  }

  async compare(
    source: DiffPackageResolvedSource,
    roots: ReadonlyMap<string, GitDiffPackageRepositoryBinding>,
  ): Promise<readonly GitDiffPackageComparison[] | GitDiffPackageAdapterFailure> {
    const results: GitDiffPackageComparison[] = [];
    for (const binding of source.comparisons) {
      const repository = roots.get(binding.repositoryId);
      if (!repository) return failed("diff_package_repository_binding_missing", "A selected comparison has no resolved repository binding.", { repository_id: binding.repositoryId, role: binding.role });
      const comparison = await this.compareOne(binding, repository, roots, source.projectRoot);
      if (comparison.kind === "failed") return comparison;
      results.push(comparison.comparison);
    }
    return results;
  }

  async write(
    source: DiffPackageResolvedSource,
    content: string,
    selectedOutput?: string,
  ): Promise<{ readonly kind: "written"; readonly path: string } | GitDiffPackageAdapterFailure> {
    if (selectedOutput === undefined) return this.writeTemporary(content);
    return this.writeSelected(source, selectedOutput, content);
  }

  private async verifyAttachment(
    attachment: LocalWorkspaceAttachment,
    recordHomeRoot: string,
  ): Promise<{ readonly kind: "resolved"; readonly repository: GitDiffPackageRepositoryBinding } | GitDiffPackageAdapterFailure> {
    if (attachment.repository_path !== attachment.workspace_path) {
      return failed("diff_package_workspace_identity_mismatch", "A recorded workspace attachment must bind the same workspace and repository path.", {
        repository_id: attachment.repository_id,
        workspace_path: attachment.workspace_path,
        repository_path: attachment.repository_path,
      });
    }
    const { fileSystem, process: processPort } = this.runtime;
    let gitDirectory: string;
    let commonDirectory: string;
    try {
      gitDirectory = await fileSystem.realpath(attachment.git_directory);
      commonDirectory = await fileSystem.realpath(attachment.common_directory);
    } catch (error) {
      return failed("diff_package_workspace_git_directory_unavailable", "A recorded workspace Git directory cannot be resolved.", {
        repository_id: attachment.repository_id,
        git_directory: attachment.git_directory,
        common_directory: attachment.common_directory,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (!(await fileSystem.directoryExists(gitDirectory)) || !(await fileSystem.directoryExists(commonDirectory))) {
      return failed("diff_package_workspace_git_directory_unavailable", "A recorded workspace Git object directory is unavailable.", {
        repository_id: attachment.repository_id,
        git_directory: gitDirectory,
        common_directory: commonDirectory,
      });
    }
    const recordedCommon = await processPort.run("git", ["--git-dir", gitDirectory, "rev-parse", "--git-common-dir"], recordHomeRoot);
    if (recordedCommon.status !== 0) return failed("diff_package_workspace_git_directory_unavailable", "Git cannot read a recorded workspace's repository object database.", {
      repository_id: attachment.repository_id,
      git_directory: gitDirectory,
      stderr: errorOutput(recordedCommon),
    });
    const canonicalCommonDirectory = await this.resolveGitPath(gitDirectory, output(recordedCommon));
    if (canonicalCommonDirectory.kind === "failed") return canonicalCommonDirectory;
    if (canonicalCommonDirectory.path !== commonDirectory) return failed("diff_package_workspace_identity_mismatch", "A recorded workspace Git directory no longer matches its recorded common object directory.", {
      repository_id: attachment.repository_id,
      git_directory: gitDirectory,
      recorded_common_directory: commonDirectory,
      current_common_directory: canonicalCommonDirectory.path,
    });

    let liveRoot: string | undefined;
    try {
      const resolved = await fileSystem.realpath(attachment.workspace_path);
      if (await fileSystem.directoryExists(resolved)) liveRoot = resolved;
    } catch {
      liveRoot = undefined;
    }
    if (liveRoot) {
      const topLevel = await processPort.run("git", ["rev-parse", "--show-toplevel"], liveRoot);
      if (topLevel.status === 0) {
        let canonicalTop: string | undefined;
        try { canonicalTop = await fileSystem.realpath(output(topLevel)); } catch {
          canonicalTop = undefined;
        }
        if (canonicalTop === liveRoot) {
          const [currentGitDirectoryResult, currentCommonDirectoryResult] = await Promise.all([
            processPort.run("git", ["rev-parse", "--git-dir"], liveRoot),
            processPort.run("git", ["rev-parse", "--git-common-dir"], liveRoot),
          ]);
          if (currentGitDirectoryResult.status !== 0 || currentCommonDirectoryResult.status !== 0) {
            return failed("diff_package_workspace_git_directory_unavailable", "Git could not verify a live workspace against its recorded repository identity.", {
              repository_id: attachment.repository_id,
              git_directory_error: errorOutput(currentGitDirectoryResult),
              common_directory_error: errorOutput(currentCommonDirectoryResult),
            });
          }
          const currentGitDirectory = await this.resolveGitPath(liveRoot, output(currentGitDirectoryResult));
          const currentCommonDirectory = await this.resolveGitPath(liveRoot, output(currentCommonDirectoryResult));
          if (currentGitDirectory.kind === "failed") return currentGitDirectory;
          if (currentCommonDirectory.kind === "failed") return currentCommonDirectory;
          if (currentGitDirectory.path !== gitDirectory || currentCommonDirectory.path !== commonDirectory) {
            return failed("diff_package_workspace_identity_mismatch", "A live workspace path no longer refers to its recorded Git repository identity.", {
              repository_id: attachment.repository_id,
              workspace_path: attachment.workspace_path,
              recorded_git_directory: gitDirectory,
              current_git_directory: currentGitDirectory.path,
              recorded_common_directory: commonDirectory,
              current_common_directory: currentCommonDirectory.path,
            });
          }
        }
      }
    }
    return {
      kind: "resolved",
      repository: {
        repositoryId: attachment.repository_id,
        workspacePath: attachment.repository_path,
        gitDirectory,
        commonDirectory,
      },
    };
  }

  private async resolveGitPath(root: string, value: string): Promise<{ readonly kind: "resolved"; readonly path: string } | GitDiffPackageAdapterFailure> {
    try {
      return { kind: "resolved", path: await this.runtime.fileSystem.realpath(Path.isAbsolute(value) ? value : Path.resolve(root, value)) };
    } catch (error) {
      return failed("diff_package_workspace_git_directory_unavailable", "A Git directory reported by the source repository cannot be resolved.", {
        path: value,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async compareOne(
    binding: DiffPackageResolvedSource["comparisons"][number],
    repository: GitDiffPackageRepositoryBinding,
    roots: ReadonlyMap<string, GitDiffPackageRepositoryBinding>,
    cwd: string,
  ): Promise<{ readonly kind: "resolved"; readonly comparison: GitDiffPackageComparison } | GitDiffPackageAdapterFailure> {
    const objectFormatResult = await this.runGit(repository.gitDirectory, cwd, ["rev-parse", "--show-object-format"], binding);
    if (objectFormatResult.kind === "failed") return objectFormatResult;
    const objectFormat = output(objectFormatResult.result);
    const idLength = objectFormat === "sha1" ? 40 : objectFormat === "sha256" ? 64 : 0;
    if (idLength === 0) return failed("diff_package_object_format_unsupported", "The source repository uses an unsupported Git object format.", { repository_id: binding.repositoryId, object_format: objectFormat });
    const targetCommit = binding.target.commit;
    if (targetCommit.length !== idLength || !checkpointIdPattern.test(targetCommit)) {
      return failed("diff_package_checkpoint_invalid", "A recorded target checkpoint is not a full Git object id for its repository.", { repository_id: binding.repositoryId, commit: targetCommit });
    }
    const targetExists = await this.runtime.process.run("git", ["--git-dir", repository.gitDirectory, "cat-file", "-e", `${targetCommit}^{commit}`], cwd);
    if (targetExists.status !== 0) return failed("diff_package_git_object_missing", "A required target commit object is unavailable in the recorded repository.", {
      repository_id: binding.repositoryId,
      role: binding.role,
      commit: targetCommit,
      stderr: errorOutput(targetExists),
    });

    const noCommitBase = "noCommit" in binding.base;
    let baseCommit: string | undefined;
    if (!noCommitBase) {
      baseCommit = binding.base.commit;
      if (baseCommit.length !== idLength || !checkpointIdPattern.test(baseCommit)) {
        return failed("diff_package_checkpoint_invalid", "A recorded base checkpoint is not a full Git object id for its repository.", { repository_id: binding.repositoryId, commit: baseCommit });
      }
      const baseExists = await this.runtime.process.run("git", ["--git-dir", repository.gitDirectory, "cat-file", "-e", `${baseCommit}^{commit}`], cwd);
      if (baseExists.status !== 0) return failed("diff_package_git_object_missing", "A required base commit object is unavailable in the recorded repository.", {
        repository_id: binding.repositoryId,
        role: binding.role,
        commit: baseCommit,
        stderr: errorOutput(baseExists),
      });
    }

    let baseIsAncestor: boolean | null = null;
    if (baseCommit !== undefined) {
      const ancestry = await this.runtime.process.run("git", ["--git-dir", repository.gitDirectory, "merge-base", "--is-ancestor", baseCommit, targetCommit], cwd);
      if (ancestry.status === 0) baseIsAncestor = true;
      else if (ancestry.status === 1) baseIsAncestor = false;
      else return failed("diff_package_ancestry_check_failed", "Git could not inspect the declared checkpoint ancestry.", {
        repository_id: binding.repositoryId,
        role: binding.role,
        base: baseCommit,
        target: targetCommit,
        stderr: errorOutput(ancestry),
      });
    } else {
      const parentList = await this.runtime.process.run("git", ["--git-dir", repository.gitDirectory, "rev-list", "--parents", "-n", "1", targetCommit], cwd);
      if (parentList.status !== 0) return failed("diff_package_ancestry_check_failed", "Git could not verify the no-commit source binding.", {
        repository_id: binding.repositoryId,
        target: targetCommit,
        stderr: errorOutput(parentList),
      });
      baseIsAncestor = parentList.stdout.toString("ascii").trim().split(/\s+/).length === 1;
      if (!baseIsAncestor) return failed("diff_package_no_commit_target_has_parents", "A no-commit source must compare with the initial commit in its recorded repository.", {
        repository_id: binding.repositoryId,
        role: binding.role,
        target: targetCommit,
      });
    }

    const rangeArgs = noCommitBase
      ? ["--root", "--no-commit-id", "-r", "--no-renames", "--full-index", `--abbrev=${idLength}`, targetCommit]
      : ["--no-renames", "--full-index", `--abbrev=${idLength}`, baseCommit!, targetCommit, "--"];
    const rawArgs = noCommitBase
      ? ["diff-tree", "--raw", "-z", ...rangeArgs]
      : ["diff", "--raw", "-z", ...rangeArgs];
    const numStatArgs = noCommitBase
      ? ["diff-tree", "--numstat", "-z", ...rangeArgs]
      : ["diff", "--numstat", "-z", ...rangeArgs];
    const patchArgs = noCommitBase
      ? ["diff-tree", "--patch", "--no-ext-diff", "--no-textconv", "--no-color", "-U10", ...rangeArgs]
      : ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "-U10", ...rangeArgs];
    const [rawResult, numStatResult, patchResult] = await Promise.all([
      this.runtime.process.run("git", ["--git-dir", repository.gitDirectory, ...rawArgs], cwd),
      this.runtime.process.run("git", ["--git-dir", repository.gitDirectory, ...numStatArgs], cwd),
      this.runtime.process.run("git", ["--git-dir", repository.gitDirectory, ...patchArgs], cwd),
    ]);
    for (const [name, result] of [["raw diff", rawResult], ["numstat", numStatResult], ["patch", patchResult]] as const) {
      if (result.status !== 0) return failed("diff_package_git_diff_failed", `Git could not produce the complete ${name} for the recorded checkpoints.`, {
        repository_id: binding.repositoryId,
        role: binding.role,
        base: binding.base,
        target: binding.target,
        stderr: errorOutput(result),
      });
    }
    const rawFiles = parseRawDiff(rawResult.stdout);
    const numStats = parseNumStat(numStatResult.stdout);
    if (!rawFiles || !numStats) return failed("diff_package_git_output_invalid", "Git returned an incomplete or malformed path/statistics stream.", {
      repository_id: binding.repositoryId,
      role: binding.role,
    });
    const stats = new Map<string, NumStatEntry>();
    for (const entry of numStats) {
      const key = pathKey(entry.path);
      if (stats.has(key)) return failed("diff_package_git_output_ambiguous", "Git returned duplicate file statistics for one path.", { repository_id: binding.repositoryId, role: binding.role, path_bytes_base64: key });
      stats.set(key, entry);
    }
    if (rawFiles.length !== numStats.length || rawFiles.some((entry) => !stats.has(pathKey(entry.path)))) {
      return failed("diff_package_git_output_incomplete", "Git's changed-path and statistics streams do not describe the same complete file set.", {
        repository_id: binding.repositoryId,
        role: binding.role,
        raw_path_count: rawFiles.length,
        stat_path_count: numStats.length,
      });
    }
    const files: GitDiffPackageFileChange[] = [];
    for (const entry of rawFiles) {
      const stat = stats.get(pathKey(entry.path))!;
      const decoded = bytePath(entry.path);
      const nontext = stat.additions === null || stat.deletions === null || entry.oldMode === "120000" || entry.newMode === "120000" || entry.oldMode === "160000" || entry.newMode === "160000";
      const access: { command: string; args: string[] }[] = [];
      let gitlinkRepository: GitDiffPackageRepositoryBinding | undefined;
      if (entry.oldMode === "160000" || entry.newMode === "160000") {
        if (decoded.path.startsWith("base64:")) return failed("diff_package_gitlink_path_unavailable", "The Gitlink path cannot be matched to a recorded repository binding.", {
          repository_id: binding.repositoryId,
          path_bytes_base64: decoded.pathBytesBase64,
        });
        const gitlinkWorkspacePath = Path.resolve(repository.workspacePath, decoded.path);
        const matches = [...roots.entries()].filter(([repositoryId, candidate]) =>
          repositoryId !== binding.repositoryId && Path.resolve(candidate.workspacePath) === gitlinkWorkspacePath);
        if (matches.length !== 1) return failed(matches.length === 0 ? "diff_package_gitlink_repository_missing" : "diff_package_gitlink_repository_ambiguous",
          matches.length === 0 ? "The Gitlink path does not identify one recorded submodule repository." : "The Gitlink path identifies multiple recorded submodule repositories.", {
            repository_id: binding.repositoryId,
            path: decoded.path,
            submodule_workspace_path: gitlinkWorkspacePath,
            matching_repository_ids: matches.map(([repositoryId]) => repositoryId),
          });
        const [repositoryId, linkedRepository] = matches[0]!;
        gitlinkRepository = { ...linkedRepository, repositoryId };
      }
      const objectVersions = [
        { objectId: entry.oldObjectId, mode: entry.oldMode },
        { objectId: entry.newObjectId, mode: entry.newMode },
      ];
      for (const [index, version] of objectVersions.entries()) {
        const { objectId, mode } = version;
        if (!objectId) continue;
        const objectRepository = mode === "160000" ? gitlinkRepository : repository;
        if (!objectRepository) return failed("diff_package_gitlink_repository_missing", "A Gitlink object has no exact recorded submodule repository binding.", {
          repository_id: binding.repositoryId,
          path: decoded.path,
          object_id: objectId,
        });
        const objectType = mode === "160000" ? "commit" : "blob";
        const objectReference = mode === "160000" ? `${objectId}^{commit}` : objectId;
        const object = await this.runtime.process.run("git", ["--git-dir", objectRepository.gitDirectory, "cat-file", "-e", objectReference], cwd);
        if (object.status !== 0) return failed("diff_package_git_object_missing", "A changed file's recorded Git object is unavailable for inspection.", {
          repository_id: binding.repositoryId,
          object_repository_id: objectRepository.repositoryId,
          role: binding.role,
          path: decoded.path,
          object_id: objectId,
          stderr: errorOutput(object),
        });
        if (nontext && (index === 0 || objectId !== entry.oldObjectId)) {
          access.push({ command: "git", args: ["--no-replace-objects", "--git-dir", objectRepository.gitDirectory, "cat-file", objectType, objectId] });
        }
      }
      files.push({
        ...decoded,
        status: entry.status,
        additions: stat.additions,
        deletions: stat.deletions,
        nontext,
        oldMode: entry.oldMode,
        newMode: entry.newMode,
        oldObjectId: entry.oldObjectId,
        newObjectId: entry.newObjectId,
        objectAccess: access,
      });
    }
    const commits = await this.commitHistory(repository.gitDirectory, cwd, binding, baseCommit, targetCommit);
    if (isFailure(commits)) return commits;
    const patchBytesBase64 = Buffer.from(patchResult.stdout).toString("base64");
    const patchText = patchResult.stdout.toString("utf8");
    const patchIsUtf8 = Buffer.from(patchText, "utf8").equals(patchResult.stdout);
    return {
      kind: "resolved",
      comparison: {
        binding,
        repositoryRoot: repository.workspacePath,
        baseIsAncestor,
        files,
        commits,
        patch: patchIsUtf8 ? patchText : "",
        ...(patchIsUtf8 ? {} : { patchBytesBase64 }),
      },
    };
  }

  private async runGit(
    gitDirectory: string,
    cwd: string,
    args: readonly string[],
    binding: DiffPackageResolvedSource["comparisons"][number],
  ): Promise<{ readonly kind: "resolved"; readonly result: GitDiffPackageProcessResult } | GitDiffPackageAdapterFailure> {
    const gitArgs = ["--git-dir", gitDirectory, ...args];
    const result = await this.runtime.process.run("git", gitArgs, cwd);
    return result.status === 0 ? { kind: "resolved", result } : failed("diff_package_git_command_failed", "Git could not inspect the recorded repository source.", {
      repository_id: binding.repositoryId,
      role: binding.role,
      args: gitArgs,
      stderr: errorOutput(result),
    });
  }

  private async commitHistory(
    gitDirectory: string,
    cwd: string,
    binding: DiffPackageResolvedSource["comparisons"][number],
    baseCommit: string | undefined,
    targetCommit: string,
  ): Promise<readonly GitDiffPackageCommit[] | GitDiffPackageAdapterFailure> {
    const args = baseCommit === undefined
      ? ["rev-list", "--parents", "--reverse", "--topo-order", targetCommit]
      : ["rev-list", "--parents", "--reverse", "--topo-order", targetCommit, `^${baseCommit}`];
    const history = await this.runGit(gitDirectory, cwd, args, binding);
    if (history.kind === "failed") return history;
    const records = history.result.stdout.toString("ascii").split(/\r?\n/).filter((line) => line.length > 0);
    const commits: GitDiffPackageCommit[] = [];
    for (const record of records) {
      const [commit] = record.split(/\s+/);
      if (!commit || !checkpointIdPattern.test(commit)) return failed("diff_package_git_history_invalid", "Git returned an invalid commit attribution record.", { repository_id: binding.repositoryId, role: binding.role });
      const details = await this.commitDetails(gitDirectory, cwd, binding, commit, "comparison-range");
      if (isFailure(details)) return details;
      commits.push(details);
    }
    if (!commits.some((commit) => commit.commit === targetCommit)) {
      const targetDetails = await this.commitDetails(gitDirectory, cwd, binding, targetCommit, "target-checkpoint");
      if (isFailure(targetDetails)) return targetDetails;
      commits.push(targetDetails);
    }
    return commits;
  }

  private async commitDetails(
    gitDirectory: string,
    cwd: string,
    binding: DiffPackageResolvedSource["comparisons"][number],
    commitId: string,
    relation: GitDiffPackageCommit["relation"],
  ): Promise<GitDiffPackageCommit | GitDiffPackageAdapterFailure> {
    const metadata = await this.runGit(gitDirectory, cwd, ["rev-list", "--parents", "-n", "1", commitId], binding);
    if (metadata.kind === "failed") return metadata;
    const [commit, ...parents] = metadata.result.stdout.toString("ascii").trim().split(/\s+/);
    if (commit !== commitId || parents.some((parent) => !checkpointIdPattern.test(parent))) {
      return failed("diff_package_git_history_invalid", "Git returned invalid checkpoint parent attribution.", { repository_id: binding.repositoryId, role: binding.role, commit: commitId });
    }
    const pathArgs = parents.length === 0
      ? ["diff-tree", "--root", "-r", "-m", "--no-commit-id", "--name-only", "-z", "--no-renames", commitId]
      : ["diff-tree", "-r", "-m", "--no-commit-id", "--name-only", "-z", "--no-renames", commitId];
    const paths = await this.runGit(gitDirectory, cwd, pathArgs, binding);
    if (paths.kind === "failed") return paths;
    const changedPaths = new Map<string, { readonly path: string; readonly pathBytesBase64: string }>();
    for (const path of nulSeparated(paths.result.stdout)) {
      if (path.length === 0) continue;
      changedPaths.set(pathKey(path), bytePath(path));
    }
    return { commit: commitId, parents, relation, changedPaths: [...changedPaths.values()] };
  }

  private async writeTemporary(content: string): Promise<{ readonly kind: "written"; readonly path: string } | GitDiffPackageAdapterFailure> {
    let directory: string;
    try { directory = await this.runtime.fileSystem.createTemporaryDirectory(Path.join(this.runtime.temporaryDirectory, "kepler-diff-package-")); } catch (error) {
      return failed("diff_package_temporary_output_failed", "Kepler could not create a fresh temporary package directory.", { message: error instanceof Error ? error.message : String(error) });
    }
    const path = Path.join(directory, "package.md");
    const written = await this.runtime.fileSystem.writeExclusive(path, content);
    if (written.kind === "failed") {
      if (written.created) {
        try { await this.runtime.fileSystem.removeFile(path); } catch (error) {
          return failed("diff_package_output_cleanup_failed", "Kepler could not remove its partial temporary package file.", {
            path,
            write_error: written.message,
            cleanup_error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      try { await this.runtime.fileSystem.removeTemporaryDirectory(directory); } catch (error) {
        return failed("diff_package_output_cleanup_failed", "Kepler could not remove its empty temporary package directory.", {
          path: directory,
          write_error: written.message,
          cleanup_error: error instanceof Error ? error.message : String(error),
        });
      }
      return failed("diff_package_temporary_output_failed", "Kepler could not write the complete temporary diff package.", { path, created: written.created, message: written.message });
    }
    return { kind: "written", path };
  }

  private async writeSelected(
    source: DiffPackageResolvedSource,
    selectedOutput: string,
    content: string,
  ): Promise<{ readonly kind: "written"; readonly path: string } | GitDiffPackageAdapterFailure> {
    const { fileSystem, process: processPort } = this.runtime;
    let root: string;
    try { root = await fileSystem.realpath(source.projectRoot); } catch (error) {
      return failed("diff_package_output_path_invalid", "The selected record-home root cannot be resolved for --out.", { message: error instanceof Error ? error.message : String(error) });
    }
    const absolute = Path.resolve(root, selectedOutput);
    const relative = Path.relative(root, absolute);
    if (!contained(root, absolute) || relative.length === 0 || relative.split(Path.sep).includes(".git") ||
        relative.split(Path.sep).slice(0, 2).join(Path.sep) === Path.join(".kepler", "missions")) {
      return failed("diff_package_output_path_invalid", "--out must select a new file inside the record-home project and outside Git metadata and Construction history.", { path: selectedOutput });
    }
    let parent: string;
    try { parent = await fileSystem.realpath(Path.dirname(absolute)); } catch (error) {
      return failed("diff_package_output_parent_unavailable", "The --out parent directory must already exist.", {
        path: Path.dirname(absolute),
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (!contained(root, parent) || !(await fileSystem.directoryExists(parent))) {
      return failed("diff_package_output_path_invalid", "The --out parent directory must remain inside the record-home project.", { parent, project_root: root });
    }
    const target = Path.join(parent, Path.basename(absolute));
    if (await fileSystem.pathExists(target)) return failed("diff_package_output_exists", "--out must name a new file that does not already exist.", { path: target });
    const relativeTarget = Path.relative(root, target);
    const tracked = await processPort.run("git", ["--literal-pathspecs", "ls-files", "--error-unmatch", "--", relativeTarget], root);
    if (tracked.status === 0) return failed("diff_package_output_tracked_path", "--out cannot replace tracked application content.", { path: relativeTarget });
    if (tracked.status !== 1) return failed("diff_package_output_tracking_check_failed", "Git could not confirm that --out is not a tracked path.", { path: relativeTarget, stderr: errorOutput(tracked) });
    const written = await fileSystem.writeExclusive(target, content);
    if (written.kind === "failed") {
      if (written.created) {
        try { await fileSystem.removeFile(target); } catch (error) {
          return failed("diff_package_output_cleanup_failed", "Kepler could not remove the partial --out file it created.", {
            path: target,
            write_error: written.message,
            cleanup_error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return failed(written.created ? "diff_package_output_write_failed" : "diff_package_output_exists_or_unavailable",
        written.created ? "Kepler could not write the complete diff package." : "--out must name a new file that does not already exist.",
        { path: target, created: written.created, message: written.message });
    }
    return { kind: "written", path: target };
  }
}
