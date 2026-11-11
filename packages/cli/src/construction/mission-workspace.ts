import { createHash } from "node:crypto";
import * as Path from "node:path";
import type {
  InspectedMissionRepository,
  MissionRepositoryRequest,
  MissionStartupFailure,
  MissionStartupRequest,
  MissionWorkspacePreparation,
  MissionWorkspacePreparationContext,
  MissionWorkspacePreparationResult,
  MissionWorkspaceRequest,
  MissionRecordHomeIdentity,
  PreparedMissionRepository,
} from "./mission-startup.js";
import type { MissionCoordination, MissionCoordinationOwner } from "./mission-coordination.js";
import type { MissionId, MissionStartingCheckpoint, MissionWorkspaceContext } from "./events.js";

export interface MissionWorkspaceCommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface MissionWorkspaceReachabilityResult {
  readonly status: number;
  readonly objectIds: readonly string[];
  readonly stderr: string;
}

export interface MissionWorkspaceGit {
  readonly run: (cwd: string, args: readonly string[]) => Promise<MissionWorkspaceCommandResult>;
  readonly findReachableObjects: (cwd: string, objectIds: readonly string[]) => Promise<MissionWorkspaceReachabilityResult>;
}

export interface MissionWorkspaceFileSystem {
  readonly pathKind: (path: string) => Promise<"missing" | "directory" | "file" | "symlink" | "other">;
  readonly realpath: (path: string) => Promise<string>;
  readonly mkdir: (path: string) => Promise<void>;
  readonly readFile: (path: string) => Promise<string>;
  readonly readDirectory?: (path: string) => Promise<readonly string[]>;
  readonly writeFileExclusive: (path: string, content: string) => Promise<void>;
}

export interface MissionWorkspaceIdentity {
  readonly machine_id: string;
  readonly process_id: number;
  readonly process_incarnation_id: string;
}

export interface MissionWorkspaceRuntime {
  readonly cwd: string;
  readonly git: MissionWorkspaceGit;
  readonly fileSystem: MissionWorkspaceFileSystem;
  readonly coordination: MissionCoordination;
  readonly identity: MissionWorkspaceIdentity;
}

interface GitRepository {
  readonly root: string;
  readonly gitDirectory: string;
  readonly commonDirectory: string;
  readonly currentBranch?: string;
  readonly head?: string;
  readonly dirty: boolean;
  readonly statusPaths: readonly string[];
}

export interface LocalWorkspaceAttachment {
  readonly format: "kepler.mission-workspace.v1";
  readonly mission_id: string;
  readonly record_home_repository_id: string;
  readonly repository_id: string;
  readonly workspace_id: string;
  readonly workspace_path: string;
  readonly repository_path: string;
  readonly git_directory: string;
  readonly common_directory: string;
  readonly branch: string;
  readonly integration_target: string;
  readonly starting_checkpoint: MissionStartingCheckpoint;
}

interface ResolvedBranch {
  readonly name: string;
  readonly startingCheckpoint: MissionStartingCheckpoint;
  readonly baseCommit?: string;
  readonly create: boolean;
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const workspaceIdPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40,64}$/;
const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Resolve the reported condition and retry after preserving the selected workspace state.",
): MissionStartupFailure => ({ kind: "failed", code, message, details, recovery });

const hashIdentity = (scope: string, commonDirectory: string, identity: string): string =>
  createHash("sha256").update(`${scope}\0${commonDirectory}\0${identity}`).digest("hex");

export const missionWorkspaceKey = (commonDirectory: string, canonicalWorkspacePath: string): string =>
  hashIdentity("workspace", commonDirectory, canonicalWorkspacePath);

export const missionIntegrationTargetKey = (commonDirectory: string, canonicalTarget: string): string =>
  hashIdentity("integration-target", commonDirectory, canonicalTarget);

const output = (result: MissionWorkspaceCommandResult): string => result.stdout.trim();

const runRequired = async (
  runtime: MissionWorkspaceRuntime,
  cwd: string,
  args: readonly string[],
  code: string,
  message: string,
): Promise<string | MissionStartupFailure> => {
  const result = await runtime.git.run(cwd, args);
  if (result.status !== 0) {
    return failure(code, message, { command: ["git", ...args], stderr: result.stderr.trim() });
  }
  return output(result);
};

const resolveGitPath = async (
  runtime: MissionWorkspaceRuntime,
  cwd: string,
  gitPath: string,
): Promise<string> => await runtime.fileSystem.realpath(Path.resolve(cwd, gitPath));

const inspectGitRepository = async (
  runtime: MissionWorkspaceRuntime,
  path: string,
  allowedUntrackedPaths: ReadonlySet<string> = new Set(),
): Promise<GitRepository | MissionStartupFailure> => {
  let canonicalPath: string;
  try {
    canonicalPath = await runtime.fileSystem.realpath(Path.resolve(runtime.cwd, path));
  } catch (error) {
    return failure("repository_path_unavailable", "The selected repository path does not exist or cannot be resolved.", {
      path,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  if (await runtime.fileSystem.pathKind(canonicalPath) !== "directory") {
    return failure("repository_path_invalid", "The selected repository path is not a directory.", { path: canonicalPath });
  }

  const bare = await runtime.git.run(canonicalPath, ["rev-parse", "--is-bare-repository"]);
  if (bare.status !== 0 || output(bare) !== "false") {
    return failure("repository_not_worktree", "The selected path must be a non-bare Git working tree.", {
      path: canonicalPath,
      stderr: bare.stderr.trim(),
    });
  }

  const topLevel = await runRequired(runtime, canonicalPath, ["rev-parse", "--show-toplevel"], "repository_inspection_failed", "Git could not resolve the selected worktree root.");
  if (typeof topLevel !== "string") return topLevel;
  const root = await runtime.fileSystem.realpath(topLevel);
  if (root !== canonicalPath) {
    return failure("repository_root_mismatch", "The selected path must name the repository root, not a nested directory.", {
      selected_path: canonicalPath,
      repository_root: root,
    });
  }

  const gitDirectoryValue = await runRequired(runtime, root, ["rev-parse", "--git-dir"], "repository_inspection_failed", "Git could not resolve the selected worktree Git directory.");
  if (typeof gitDirectoryValue !== "string") return gitDirectoryValue;
  const commonDirectoryValue = await runRequired(runtime, root, ["rev-parse", "--git-common-dir"], "repository_inspection_failed", "Git could not resolve the selected repository common directory.");
  if (typeof commonDirectoryValue !== "string") return commonDirectoryValue;
  const gitDirectory = await resolveGitPath(runtime, root, gitDirectoryValue);
  const commonDirectory = await resolveGitPath(runtime, root, commonDirectoryValue);

  const branchResult = await runtime.git.run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const currentBranch = branchResult.status === 0 ? output(branchResult) : undefined;
  const headResult = await runtime.git.run(root, ["rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"]);
  const head = headResult.status === 0 && commitPattern.test(output(headResult)) ? output(headResult) : undefined;
  if (!head && !currentBranch) {
    return failure("repository_head_unavailable", "Git could not resolve a commit or an unborn branch for the selected worktree.", {
      path: root,
      head_error: headResult.stderr.trim(),
      branch_error: branchResult.stderr.trim(),
    });
  }

  const status = await runtime.git.run(root, ["status", "--porcelain=v1", "--untracked-files=all", "-z"]);
  if (status.status !== 0) {
    return failure("repository_status_failed", "Git could not inspect the selected worktree state.", {
      path: root,
      stderr: status.stderr.trim(),
    });
  }
  const statusEntries: { readonly code: string; readonly path: string }[] = [];
  for (const entry of status.stdout.split("\0")) {
    if (entry.length === 0) continue;
    statusEntries.push({ code: entry.slice(0, 2), path: entry.slice(3) });
  }
  const statusPaths = statusEntries.map((entry) => entry.path);
  const dirty = statusEntries.some((entry) => entry.code !== "??" || !allowedUntrackedPaths.has(entry.path));
  return { root, gitDirectory, commonDirectory, currentBranch, head, dirty, statusPaths };
};

const resolveDestination = async (
  runtime: MissionWorkspaceRuntime,
  path: string,
): Promise<string | MissionStartupFailure> => {
  const absolute = Path.resolve(runtime.cwd, path);
  const parent = Path.dirname(absolute);
  const base = Path.basename(absolute);
  if (base.length === 0 || base === "." || base === "..") {
    return failure("workspace_destination_invalid", "A new workspace requires a named destination path.", { path });
  }
  let canonicalParent: string;
  try {
    canonicalParent = await runtime.fileSystem.realpath(parent);
  } catch (error) {
    return failure("workspace_parent_unavailable", "The selected workspace parent directory must already exist.", {
      path: parent,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  if (await runtime.fileSystem.pathKind(canonicalParent) !== "directory") {
    return failure("workspace_parent_invalid", "The selected workspace parent is not a directory.", { path: canonicalParent });
  }
  const destination = Path.join(canonicalParent, base);
  const kind = await runtime.fileSystem.pathKind(destination);
  if (kind !== "missing") {
    return failure("workspace_destination_exists", "Kepler will not reuse or overwrite an existing workspace destination.", {
      path: destination,
      path_kind: kind,
    });
  }
  return destination;
};

const normalizeIntegrationTarget = async (
  runtime: MissionWorkspaceRuntime,
  cwd: string,
  value: string,
): Promise<string | MissionStartupFailure> => {
  const ref = value.startsWith("refs/heads/") ? value : value.startsWith("refs/") ? value : `refs/heads/${value}`;
  if (!ref.startsWith("refs/heads/")) {
    return failure("integration_target_invalid", "The Integration target must be a local branch ref.", { target: value });
  }
  const checked = await runtime.git.run(cwd, ["check-ref-format", ref]);
  if (checked.status !== 0) {
    return failure("integration_target_invalid", "Git rejected the selected Integration target ref.", { target: value });
  }
  return ref;
};

const validateBranchName = async (
  runtime: MissionWorkspaceRuntime,
  cwd: string,
  name: string,
): Promise<string | MissionStartupFailure> => {
  const ref = `refs/heads/${name}`;
  const checked = await runtime.git.run(cwd, ["check-ref-format", ref]);
  if (checked.status !== 0) {
    return failure("branch_selection_invalid", "Git rejected the selected branch name.", { branch: name });
  }
  return name;
};

const resolveCommit = async (
  runtime: MissionWorkspaceRuntime,
  cwd: string,
  ref: string,
): Promise<string | undefined> => {
  const resolved = await runtime.git.run(cwd, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
  return resolved.status === 0 && commitPattern.test(output(resolved)) ? output(resolved) : undefined;
};

const resolveBranch = async (
  runtime: MissionWorkspaceRuntime,
  repository: GitRepository,
  request: MissionRepositoryRequest,
): Promise<ResolvedBranch | MissionStartupFailure> => {
  const selected = request.branch;
  if (selected.kind === "new") {
    const name = await validateBranchName(runtime, repository.root, selected.name);
    if (typeof name !== "string") return name;
    const baseCommit = await resolveCommit(runtime, repository.root, selected.base);
    if (!baseCommit) {
      return failure("branch_base_unavailable", "Git could not resolve the explicitly selected branch base to a commit.", {
        base: selected.base,
        repository_id: request.repositoryId,
      });
    }
    const exists = await runtime.git.run(repository.root, ["show-ref", "--verify", "--quiet", `refs/heads/${name}`]);
    if (exists.status === 0) {
      return failure("branch_already_exists", "The selected new branch already exists.", { branch: name });
    }
    return { name, startingCheckpoint: { kind: "commit", commit: baseCommit }, baseCommit, create: true };
  }

  let name: string;
  if (selected.kind === "current") {
    if (!repository.currentBranch) {
      return failure("current_branch_unavailable", "The selected worktree has no current branch; choose an explicit existing or new branch.", {
        repository_id: request.repositoryId,
      });
    }
    name = repository.currentBranch;
  } else if (selected.kind === "default") {
    const symbolic = await runtime.git.run(repository.root, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
    const target = output(symbolic);
    const prefix = "refs/remotes/origin/";
    if (symbolic.status !== 0 || !target.startsWith(prefix)) {
      return failure("default_branch_unavailable", "Git has no local origin/HEAD default-branch selection.", {
        repository_id: request.repositoryId,
        stderr: symbolic.stderr.trim(),
      });
    }
    name = target.slice(prefix.length);
  } else {
    const valid = await validateBranchName(runtime, repository.root, selected.name);
    if (typeof valid !== "string") return valid;
    name = valid;
  }

  const checkpoint = await resolveCommit(runtime, repository.root, `refs/heads/${name}`);
  if (checkpoint) return { name, startingCheckpoint: { kind: "commit", commit: checkpoint }, create: false };
  if (selected.kind === "current" && repository.currentBranch === name && !repository.head) {
    return { name, startingCheckpoint: { kind: "no-commit" }, create: false };
  }
  return failure("selected_branch_unavailable", "Git could not resolve the selected local branch to a commit.", {
    repository_id: request.repositoryId,
    branch: name,
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseAttachment = (input: unknown): LocalWorkspaceAttachment | undefined => {
  if (!isRecord(input) || input.format !== "kepler.mission-workspace.v1" ||
    typeof input.mission_id !== "string" || !uuidV4.test(input.mission_id) ||
    typeof input.record_home_repository_id !== "string" || typeof input.repository_id !== "string" ||
    typeof input.workspace_id !== "string" || !workspaceIdPattern.test(input.workspace_id) ||
    typeof input.workspace_path !== "string" || typeof input.repository_path !== "string" ||
    typeof input.git_directory !== "string" || typeof input.common_directory !== "string" ||
    typeof input.branch !== "string" || typeof input.integration_target !== "string" ||
    !isRecord(input.starting_checkpoint)) return undefined;
  let startingCheckpoint: MissionStartingCheckpoint;
  if (input.starting_checkpoint.kind === "no-commit") {
    startingCheckpoint = { kind: "no-commit" };
  } else if (input.starting_checkpoint.kind === "commit" && typeof input.starting_checkpoint.commit === "string" &&
    commitPattern.test(input.starting_checkpoint.commit)) {
    startingCheckpoint = { kind: "commit", commit: input.starting_checkpoint.commit };
  } else {
    return undefined;
  }
  return {
    format: "kepler.mission-workspace.v1",
    mission_id: input.mission_id,
    record_home_repository_id: input.record_home_repository_id,
    repository_id: input.repository_id,
    workspace_id: input.workspace_id,
    workspace_path: input.workspace_path,
    repository_path: input.repository_path,
    git_directory: input.git_directory,
    common_directory: input.common_directory,
    branch: input.branch,
    integration_target: input.integration_target,
    starting_checkpoint: startingCheckpoint,
  };
};

const resolvePrevious = async (
  runtime: MissionWorkspaceRuntime,
  workspace: Extract<MissionWorkspaceRequest, { kind: "previous" }>,
  repositoryId: string,
): Promise<LocalWorkspaceAttachment | MissionStartupFailure> => {
  if (!workspaceIdPattern.test(workspace.workspace_id) || !uuidV4.test(workspace.mission_id)) {
    return failure("previous_workspace_identity_invalid", "The previous workspace identity is malformed.", {
      workspace_id: workspace.workspace_id,
      mission_id: workspace.mission_id,
    });
  }
  const recordHome = await inspectGitRepository(runtime, workspace.record_home_path);
  if ("kind" in recordHome) return recordHome;
  const attachmentPath = Path.join(
    recordHome.commonDirectory,
    "kepler",
    "missions",
    workspace.mission_id,
    "workspaces",
    `${workspace.workspace_id}.json`,
  );
  if (await runtime.fileSystem.pathKind(attachmentPath) !== "file") {
    return failure("previous_workspace_missing", "The selected saved workspace binding is not present in its source record home.", {
      mission_id: workspace.mission_id,
      workspace_id: workspace.workspace_id,
      record_home_path: recordHome.root,
    });
  }
  let attachment: LocalWorkspaceAttachment | undefined;
  try {
    const parsed: unknown = JSON.parse(await runtime.fileSystem.readFile(attachmentPath));
    attachment = parseAttachment(parsed);
  } catch {
    attachment = undefined;
  }
  if (!attachment || attachment.mission_id !== workspace.mission_id ||
    attachment.record_home_repository_id !== workspace.record_home_repository_id ||
    attachment.repository_id !== repositoryId || attachment.workspace_id !== workspace.workspace_id) {
    return failure("previous_workspace_binding_invalid", "The selected saved workspace binding does not match the requested mission and repository.", {
      mission_id: workspace.mission_id,
      workspace_id: workspace.workspace_id,
      repository_id: repositoryId,
    });
  }
  return attachment;
};

const currentBranch = async (
  runtime: MissionWorkspaceRuntime,
  repository: GitRepository,
): Promise<string | undefined> => {
  const branch = await runtime.git.run(repository.root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  return branch.status === 0 ? output(branch) : undefined;
};

const worktreeBranches = async (
  runtime: MissionWorkspaceRuntime,
  repository: GitRepository,
): Promise<{ readonly kind: "branches"; readonly branches: readonly string[] } | MissionStartupFailure> => {
  const listed = await runtime.git.run(repository.root, ["worktree", "list", "--porcelain"]);
  if (listed.status !== 0) return failure("worktree_list_failed", "Git could not inspect branches already attached to worktrees.", {
    stderr: listed.stderr.trim(),
  });
  const branches: string[] = [];
  for (const line of listed.stdout.split(/\r?\n/)) {
    if (line.startsWith("branch ")) branches.push(line.slice("branch ".length));
  }
  return { kind: "branches", branches };
};

const sourceFor = async (
  runtime: MissionWorkspaceRuntime,
  request: MissionRepositoryRequest,
): Promise<{ readonly repository: GitRepository; readonly workspacePath: string; readonly context: MissionWorkspaceContext; readonly workspaceKind: "existing" | "new" | "previous" } | MissionStartupFailure> => {
  const selection = request.workspace;
  if (selection.kind === "existing") {
    const repository = await inspectGitRepository(runtime, selection.path);
    if ("kind" in repository) return repository;
    return { repository, workspacePath: repository.root, context: { kind: "existing" }, workspaceKind: "existing" };
  }
  if (selection.kind === "new") {
    const repository = await inspectGitRepository(runtime, selection.source);
    if ("kind" in repository) return repository;
    const workspacePath = await resolveDestination(runtime, selection.path);
    if (typeof workspacePath !== "string") return workspacePath;
    return { repository, workspacePath, context: { kind: "new" }, workspaceKind: "new" };
  }
  const attachment = await resolvePrevious(runtime, selection, request.repositoryId);
  if ("kind" in attachment) return attachment;
  const repository = await inspectGitRepository(runtime, attachment.workspace_path);
  if ("kind" in repository) return repository;
  if (repository.root !== attachment.workspace_path ||
    repository.commonDirectory !== attachment.common_directory ||
    repository.gitDirectory !== attachment.git_directory) {
    return failure("previous_workspace_identity_changed", "The saved workspace path no longer resolves to its recorded Git identity.", {
      mission_id: attachment.mission_id,
      workspace_id: attachment.workspace_id,
      workspace_path: attachment.workspace_path,
    });
  }
  const context: MissionWorkspaceContext = {
    kind: "previous",
    workspace_id: selection.workspace_id,
    mission_id: selection.mission_id as MissionId,
    record_home_repository_id: selection.record_home_repository_id,
  };
  return { repository, workspacePath: repository.root, context, workspaceKind: "previous" };
};

const inspectOne = async (
  runtime: MissionWorkspaceRuntime,
  recordHomePath: string,
  recordHomeCommonDirectory: string,
  recordHomeRepositoryId: string,
  request: MissionRepositoryRequest,
): Promise<InspectedMissionRepository | MissionStartupFailure> => {
  const source = await sourceFor(runtime, request);
  if ("kind" in source) return source;
  const branch = await resolveBranch(runtime, source.repository, request);
  if ("kind" in branch) return branch;
  const target = await normalizeIntegrationTarget(runtime, source.repository.root, request.integrationTarget);
  if (typeof target !== "string") return target;
  const changesBranch = branch.create || source.repository.currentBranch !== branch.name;
  if (source.workspaceKind !== "new" && changesBranch && source.repository.dirty) {
    return failure("workspace_dirty_branch_change", "Kepler will not change branches in a dirty existing workspace.", {
      repository_id: request.repositoryId,
      workspace_path: source.workspacePath,
      selected_branch: branch.name,
    }, "Preserve the dirty work and choose its current branch, or make the selected workspace clean before a branch change.");
  }
  if (source.workspaceKind === "new" && !branch.create) {
    const attached = await worktreeBranches(runtime, source.repository);
    if ("kind" in attached && attached.kind === "failed") return attached;
    if (attached.branches.includes(`refs/heads/${branch.name}`)) {
      return failure("branch_already_attached", "The selected branch is already checked out in a Git worktree.", {
        repository_id: request.repositoryId,
        branch: branch.name,
      }, "Select a new branch or an existing branch that is not attached to another worktree.");
    }
  }
  const localWorkspaceKey = missionWorkspaceKey(source.repository.commonDirectory, source.workspacePath);
  const integrationTargetKey = missionIntegrationTargetKey(source.repository.commonDirectory, target);
  return {
    repositoryId: request.repositoryId,
    context: source.context,
    branchSelection: request.branch,
    resolvedBranch: branch.name,
    integrationTarget: target,
    integrationTargetKey,
    startingCheckpoint: branch.startingCheckpoint,
    repositoryPath: source.repository.root,
    recordHomePath,
    gitDirectory: source.repository.gitDirectory,
    commonDirectory: source.repository.commonDirectory,
    localWorkspaceKey,
    workspacePath: source.workspacePath,
    workspaceKind: source.workspaceKind,
    sourcePath: source.repository.root,
    ...(branch.baseCommit ? { baseCommit: branch.baseCommit } : {}),
    recordHomeRepositoryId,
    recordHomeCommonDirectory,
    initialDirtyPaths: source.repository.statusPaths,
    initialBranch: source.repository.currentBranch ?? null,
    initialCheckpoint: checkpointFromRepository(source.repository),
  };
};

const checkpointFromRepository = (repository: GitRepository): MissionStartingCheckpoint =>
  repository.head ? { kind: "commit", commit: repository.head } : { kind: "no-commit" };

const sameCheckpoint = (left: MissionStartingCheckpoint, right: MissionStartingCheckpoint): boolean =>
  left.kind === right.kind && (left.kind === "no-commit" || (
    right.kind === "commit" && left.commit === right.commit
  ));

const runBranchPreparation = async (
  runtime: MissionWorkspaceRuntime,
  inspected: InspectedMissionRepository,
  recordHomePath: string,
  context: MissionWorkspacePreparationContext,
): Promise<GitRepository | MissionStartupFailure> => {
  const effects: Readonly<Record<string, unknown>>[] = [];
  let uncertainEffect: Readonly<Record<string, unknown>> | undefined;
  const withEffects = (result: MissionStartupFailure): MissionStartupFailure => {
    const partialEffects = uncertainEffect ? [...effects, uncertainEffect] : [...effects];
    return partialEffects.length === 0
      ? result
      : { ...result, details: { ...result.details, partial_effects: partialEffects } };
  };
  try {
    const preflightPath = inspected.workspaceKind === "new" ? inspected.sourcePath : inspected.workspacePath;
    const allowedUntrackedPaths = new Set<string>();
    if (inspected.workspaceKind !== "new" && inspected.workspacePath === recordHomePath) {
      const journalRelativePath = Path.relative(recordHomePath, context.missionJournalPath);
      const journalStatusPath = journalRelativePath.split(Path.sep).join("/");
      const initialDirtyPaths = new Set(inspected.initialDirtyPaths ?? []);
      if (journalRelativePath !== "" && journalRelativePath !== ".." &&
        !journalRelativePath.startsWith(`..${Path.sep}`) && !Path.isAbsolute(journalRelativePath) &&
        !initialDirtyPaths.has(journalStatusPath)) {
        allowedUntrackedPaths.add(journalStatusPath);
      }
    }
    const current = await inspectGitRepository(runtime, preflightPath, allowedUntrackedPaths);
    if ("kind" in current) return withEffects(current);
    if (current.root !== preflightPath || current.gitDirectory !== inspected.gitDirectory ||
        current.commonDirectory !== inspected.commonDirectory) {
      return withEffects(failure("workspace_repository_changed", "The selected canonical Git workspace identity changed after mission inspection.", {
        repository_id: inspected.repositoryId,
        expected_path: preflightPath,
        actual_path: current.root,
        expected_git_directory: inspected.gitDirectory,
        actual_git_directory: current.gitDirectory,
        expected_common_directory: inspected.commonDirectory,
        actual_common_directory: current.commonDirectory,
      }));
    }
    if (inspected.workspaceKind === "new" && await runtime.fileSystem.pathKind(inspected.workspacePath) !== "missing") {
      return withEffects(failure("workspace_destination_raced", "The selected workspace destination appeared after inspection; Kepler left it untouched.", {
        path: inspected.workspacePath,
      }));
    }
    const workspaceCoordinates = await verifyCanonicalWorkspaceCoordinates(runtime, inspected);
    if ("kind" in workspaceCoordinates) return withEffects(workspaceCoordinates);

    if (inspected.workspaceKind === "new") {
      if (await runtime.fileSystem.pathKind(inspected.workspacePath) !== "missing") {
        return withEffects(failure("workspace_destination_raced", "The selected workspace destination appeared after inspection; Kepler left it untouched.", {
          path: inspected.workspacePath,
        }));
      }
      const args = inspected.branchSelection.kind === "new"
        ? ["worktree", "add", "--quiet", "-b", inspected.resolvedBranch, inspected.workspacePath, inspected.baseCommit ?? ""]
        : ["worktree", "add", "--quiet", inspected.workspacePath, inspected.resolvedBranch];
      uncertainEffect = {
        repository_id: inspected.repositoryId,
        workspace_path: inspected.workspacePath,
        effect: "worktree-created",
        state: "uncertain",
      };
      const added = await runtime.git.run(current.root, args);
      if (added.status !== 0) {
        return withEffects(failure("workspace_creation_failed", "Git could not create the explicitly selected worktree; no cleanup was attempted.", {
          repository_id: inspected.repositoryId,
          workspace_path: inspected.workspacePath,
          stderr: added.stderr.trim(),
        }));
      }
      effects.push({ ...uncertainEffect, state: "completed" });
      uncertainEffect = undefined;
    } else {
      const selectedBranch = await currentBranch(runtime, current);
      if (inspected.branchSelection.kind === "new") {
        if (current.dirty) {
          return withEffects(failure("workspace_dirty_branch_change", "Kepler will not create a branch in a dirty existing workspace.", {
            repository_id: inspected.repositoryId,
            workspace_path: inspected.workspacePath,
          }));
        }
        uncertainEffect = {
          repository_id: inspected.repositoryId,
          workspace_path: inspected.workspacePath,
          branch: inspected.resolvedBranch,
          effect: "branch-created",
          state: "uncertain",
        };
        const changed = await runtime.git.run(current.root, [
          "switch", "--quiet", "--no-overwrite-ignore", "--no-track", "--create", inspected.resolvedBranch, inspected.baseCommit ?? "",
        ]);
        if (changed.status !== 0) {
          return withEffects(failure("branch_creation_failed", "Git could not create the explicitly selected branch; no cleanup was attempted.", {
            repository_id: inspected.repositoryId,
            branch: inspected.resolvedBranch,
            stderr: changed.stderr.trim(),
          }));
        }
        effects.push({ ...uncertainEffect, state: "completed" });
        uncertainEffect = undefined;
      } else if (selectedBranch !== inspected.resolvedBranch) {
        if (current.dirty) {
          return withEffects(failure("workspace_dirty_branch_change", "Kepler will not change branches in a dirty existing workspace.", {
            repository_id: inspected.repositoryId,
            workspace_path: inspected.workspacePath,
            selected_branch: inspected.resolvedBranch,
          }));
        }
        uncertainEffect = {
          repository_id: inspected.repositoryId,
          workspace_path: inspected.workspacePath,
          branch: inspected.resolvedBranch,
          effect: "branch-switched",
          state: "uncertain",
        };
        const changed = await runtime.git.run(current.root, ["switch", "--quiet", "--no-overwrite-ignore", "--", inspected.resolvedBranch]);
        if (changed.status !== 0) {
          return withEffects(failure("branch_switch_failed", "Git could not switch to the explicitly selected branch; no cleanup was attempted.", {
            repository_id: inspected.repositoryId,
            branch: inspected.resolvedBranch,
            stderr: changed.stderr.trim(),
          }));
        }
        effects.push({ ...uncertainEffect, state: "completed" });
        uncertainEffect = undefined;
      }
    }

    const selectedPath = await inspectGitRepository(runtime, inspected.workspacePath);
    if ("kind" in selectedPath) return withEffects(selectedPath);
    const finalBranch = await currentBranch(runtime, selectedPath);
    const startingCheckpoint = checkpointFromRepository(selectedPath);
    if (selectedPath.root !== inspected.workspacePath || selectedPath.commonDirectory !== inspected.commonDirectory ||
      finalBranch !== inspected.resolvedBranch || !sameCheckpoint(startingCheckpoint, inspected.startingCheckpoint)) {
      return withEffects(failure("workspace_preparation_verification_failed", "The prepared worktree does not match its inspected repository, branch, or starting checkpoint.", {
        repository_id: inspected.repositoryId,
        expected_branch: inspected.resolvedBranch,
        actual_branch: finalBranch,
        expected_checkpoint: inspected.startingCheckpoint,
        actual_checkpoint: startingCheckpoint,
        workspace_path: inspected.workspacePath,
      }, "Preserve the worktree and reconcile its actual Git state before retrying; Kepler will not reset or repair it."));
    }
    return selectedPath;
  } catch (error) {
    return withEffects(failure("workspace_preparation_failed", "Git workspace preparation did not complete.", {
      repository_id: inspected.repositoryId,
      workspace_path: inspected.workspacePath,
      message: error instanceof Error ? error.message : String(error),
    }, "Preserve all reported resources and reconcile their actual Git state before retrying; Kepler will not clean up, reset, or repair them."));
  }
};

const ensureSafeDirectory = async (
  fileSystem: MissionWorkspaceFileSystem,
  root: string,
  segments: readonly string[],
): Promise<string | MissionStartupFailure> => {
  let current = root;
  try {
    if (await fileSystem.realpath(root) !== root) {
      return failure("local_storage_root_invalid", "The selected Git common directory is not canonical.", { root });
    }
    for (const segment of segments) {
      const next = Path.join(current, segment);
      let kind = await fileSystem.pathKind(next);
      if (kind === "missing") {
        try {
          await fileSystem.mkdir(next);
        } catch {
          kind = await fileSystem.pathKind(next);
        }
        if (kind === "missing") kind = await fileSystem.pathKind(next);
      }
      if (kind !== "directory" || await fileSystem.realpath(next) !== next) {
        return failure("local_storage_path_invalid", "A local mission storage path contains a non-directory or symbolic link.", {
          path: next,
          path_kind: kind,
        });
      }
      current = next;
    }
    return current;
  } catch (error) {
    return failure("local_storage_failed", "Kepler could not prepare a local mission storage directory.", {
      root,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

const writeAttachment = async (
  runtime: MissionWorkspaceRuntime,
  inspected: InspectedMissionRepository,
  missionId: MissionId,
  repository: GitRepository,
): Promise<MissionStartupFailure | undefined> => {
  const attachment: LocalWorkspaceAttachment = {
    format: "kepler.mission-workspace.v1",
    mission_id: missionId,
    record_home_repository_id: inspected.recordHomeRepositoryId,
    repository_id: inspected.repositoryId,
    workspace_id: inspected.localWorkspaceKey,
    workspace_path: repository.root,
    repository_path: repository.root,
    git_directory: repository.gitDirectory,
    common_directory: repository.commonDirectory,
    branch: inspected.resolvedBranch,
    integration_target: inspected.integrationTarget,
    starting_checkpoint: inspected.startingCheckpoint,
  };
  const directory = await ensureSafeDirectory(runtime.fileSystem, inspected.recordHomeCommonDirectory, [
    "kepler",
    "missions",
    missionId,
    "workspaces",
  ]);
  if (typeof directory !== "string") return directory;
  const attachmentPath = Path.join(directory, `${inspected.localWorkspaceKey}.json`);
  const kind = await runtime.fileSystem.pathKind(attachmentPath);
  if (kind === "file") {
    try {
      const actual = parseAttachment(JSON.parse(await runtime.fileSystem.readFile(attachmentPath)));
      if (actual && actual.format === attachment.format && actual.mission_id === attachment.mission_id &&
          actual.record_home_repository_id === attachment.record_home_repository_id &&
          actual.repository_id === attachment.repository_id && actual.workspace_id === attachment.workspace_id &&
          actual.workspace_path === attachment.workspace_path && actual.repository_path === attachment.repository_path &&
          actual.git_directory === attachment.git_directory && actual.common_directory === attachment.common_directory &&
          actual.branch === attachment.branch && actual.integration_target === attachment.integration_target &&
          sameCheckpoint(actual.starting_checkpoint, attachment.starting_checkpoint)) return undefined;
    } catch {
      return failure("workspace_attachment_conflict", "An existing workspace attachment is malformed or cannot be read; Kepler left it untouched.", {
        repository_id: inspected.repositoryId,
        workspace_id: inspected.localWorkspaceKey,
        attachment_path: attachmentPath,
      }, "Preserve the attachment and compare it with the saved mission binding before retrying.");
    }
    return failure("workspace_attachment_conflict", "An existing workspace attachment does not match the saved mission binding; Kepler left it untouched.", {
      repository_id: inspected.repositoryId,
      workspace_id: inspected.localWorkspaceKey,
      attachment_path: attachmentPath,
    }, "Preserve the attachment and resolve the identity conflict explicitly before retrying.");
  }
  if (kind !== "missing") {
    return failure("workspace_attachment_conflict", "The workspace attachment path is not a missing path or a regular file; Kepler left it untouched.", {
      repository_id: inspected.repositoryId,
      workspace_id: inspected.localWorkspaceKey,
      attachment_path: attachmentPath,
      path_kind: kind,
    }, "Preserve the attachment path and resolve its type explicitly before retrying.");
  }
  try {
    await runtime.fileSystem.writeFileExclusive(attachmentPath, `${JSON.stringify(attachment, null, 2)}\n`);
  } catch (error) {
    return failure("workspace_attachment_write_failed", "The prepared workspace could not be recorded in the selected record home.", {
      repository_id: inspected.repositoryId,
      workspace_id: inspected.localWorkspaceKey,
      attachment_path: attachmentPath,
      message: error instanceof Error ? error.message : String(error),
    }, "Keep the prepared worktree and mission facts; reconcile the local attachment before starting any stage.");
  }
  return undefined;
};

const expectedCheckpoint = (repository: InspectedMissionRepository): MissionStartingCheckpoint => repository.startingCheckpoint;

const repositoryCheckpointFailure = (
  inspected: InspectedMissionRepository,
  actualBranch: string | undefined,
  actualCheckpoint: MissionStartingCheckpoint,
  message: string,
): MissionStartupFailure => failure("workspace_recovery_conflict", message, {
  repository_id: inspected.repositoryId,
  workspace_path: inspected.workspacePath,
  expected_branch: inspected.resolvedBranch,
  actual_branch: actualBranch ?? null,
  expected_checkpoint: expectedCheckpoint(inspected),
  actual_checkpoint: actualCheckpoint,
  initial_branch: inspected.initialBranch,
  initial_checkpoint: inspected.initialCheckpoint,
}, "Preserve the current Git state and attachment. Restore no baseline automatically; resolve the reported mismatch explicitly before retrying.");

const worktreeRegistration = async (
  runtime: MissionWorkspaceRuntime,
  repository: GitRepository,
  workspacePath: string,
  branch: string,
): Promise<boolean | MissionStartupFailure> => {
  const listed = await runtime.git.run(repository.root, ["worktree", "list", "--porcelain"]);
  if (listed.status !== 0) return failure("worktree_list_failed", "Git could not verify the selected worktree registration.", {
    repository_id: "unknown",
    workspace_path: workspacePath,
    stderr: listed.stderr.trim(),
  });
  let currentPath: string | undefined;
  for (const line of listed.stdout.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) currentPath = line.slice("worktree ".length);
    if (line === `branch refs/heads/${branch}` && currentPath === workspacePath) return true;
  }
  return false;
};

const reconcileSavedRepository = async (
  runtime: MissionWorkspaceRuntime,
  inspected: InspectedMissionRepository,
  recordHome: string,
  context: MissionWorkspacePreparationContext,
): Promise<GitRepository | MissionStartupFailure> => {
  const savedCoordinates = await verifyCanonicalWorkspaceCoordinates(runtime, inspected);
  if ("kind" in savedCoordinates) return savedCoordinates;
  const recordHomeRepository = await inspectGitRepository(runtime, recordHome);
  if ("kind" in recordHomeRepository) return recordHomeRepository;
  if (recordHomeRepository.root !== inspected.recordHomePath ||
      recordHomeRepository.commonDirectory !== inspected.recordHomeCommonDirectory) {
    return failure("record_home_changed", "The selected record-home Git worktree no longer matches the saved mission identity.", {
      expected_record_home: inspected.recordHomePath,
      actual_record_home: recordHomeRepository.root,
      expected_common_directory: inspected.recordHomeCommonDirectory,
      actual_common_directory: recordHomeRepository.commonDirectory,
    }, "Select the original record home and preserve all mission history before retrying.");
  }

  const source = await inspectGitRepository(runtime, inspected.sourcePath);
  if ("kind" in source) return source;
  if (source.root !== inspected.sourcePath || source.root !== inspected.repositoryPath ||
      source.gitDirectory !== inspected.gitDirectory || source.commonDirectory !== inspected.commonDirectory) {
    return failure("workspace_repository_changed", "The saved source path no longer identifies the original canonical Git repository.", {
      repository_id: inspected.repositoryId,
      expected_source_path: inspected.sourcePath,
      actual_source_path: source.root,
      expected_git_directory: inspected.gitDirectory,
      actual_git_directory: source.gitDirectory,
      expected_common_directory: inspected.commonDirectory,
      actual_common_directory: source.commonDirectory,
    }, "Preserve all resources and select no replacement repository; resolve the Git identity mismatch before retrying.");
  }

  let selectedPath: GitRepository | MissionStartupFailure;
  if (inspected.workspaceKind === "new") {
    const destinationKind = await runtime.fileSystem.pathKind(inspected.workspacePath);
    if (destinationKind === "missing") {
      const expected = inspected.startingCheckpoint;
      if (expected.kind !== "commit") {
        return failure("workspace_recovery_unsupported", "A missing worktree cannot be recovered from an unborn starting checkpoint.", {
          repository_id: inspected.repositoryId,
          workspace_path: inspected.workspacePath,
          starting_checkpoint: expected,
        }, "Preserve the saved mission facts. Choose an explicit supported recovery path; Kepler will not invent a commit.");
      }
      const branchRef = `refs/heads/${inspected.resolvedBranch}`;
      const branchCommit = await resolveCommit(runtime, source.root, branchRef);
      if (branchCommit && branchCommit !== expected.commit) {
        return repositoryCheckpointFailure(inspected, inspected.initialBranch ?? undefined, checkpointFromRepository(source), "The selected branch moved away from the fixed starting checkpoint.");
      }
      if (inspected.branchSelection.kind !== "new" && branchCommit !== expected.commit) {
        return failure("workspace_recovery_conflict", "The selected existing branch no longer points to its fixed starting checkpoint.", {
          repository_id: inspected.repositoryId,
          branch: inspected.resolvedBranch,
          expected_checkpoint: expected,
          actual_branch_checkpoint: branchCommit ?? null,
        }, "Preserve the branch and workspace paths; restore or select history explicitly before retrying.");
      }
      const destinationCoordinates = await verifyCanonicalWorkspaceCoordinates(runtime, inspected);
      if ("kind" in destinationCoordinates) return destinationCoordinates;
      if (await runtime.fileSystem.pathKind(inspected.workspacePath) !== "missing") {
        return failure("workspace_destination_conflict", "The saved worktree destination appeared before guarded recovery could create it; Kepler left it untouched.", {
          repository_id: inspected.repositoryId,
          workspace_path: inspected.workspacePath,
        }, "Preserve the path and Git metadata, then reconcile the original mission identity explicitly.");
      }
      if (inspected.branchSelection.kind === "new" && !branchCommit) {
        const added = await runtime.git.run(source.root, [
          "worktree", "add", "--quiet", "-b", inspected.resolvedBranch, inspected.workspacePath, expected.commit,
        ]);
        if (added.status !== 0) return failure("workspace_creation_failed", "Git could not create the saved worktree from its fixed commit; no cleanup was attempted.", {
          repository_id: inspected.repositoryId,
          workspace_path: inspected.workspacePath,
          stderr: added.stderr.trim(),
          partial_effects: [{ repository_id: inspected.repositoryId, workspace_path: inspected.workspacePath, effect: "worktree-created", state: "uncertain" }],
        }, "Preserve the selected path and Git metadata. Retry the same mission only after reconciling any worktree Git may have created.");
      } else {
        const added = await runtime.git.run(source.root, ["worktree", "add", "--quiet", inspected.workspacePath, inspected.resolvedBranch]);
        if (added.status !== 0) return failure("workspace_creation_failed", "Git could not create the saved worktree from its fixed branch; no cleanup was attempted.", {
          repository_id: inspected.repositoryId,
          workspace_path: inspected.workspacePath,
          stderr: added.stderr.trim(),
          partial_effects: [{ repository_id: inspected.repositoryId, workspace_path: inspected.workspacePath, effect: "worktree-created", state: "uncertain" }],
        }, "Preserve the selected path and Git metadata. Retry the same mission only after reconciling any worktree Git may have created.");
      }
    } else if (destinationKind !== "directory") {
      return failure("workspace_destination_conflict", "The saved worktree destination is not a directory; Kepler left it untouched.", {
        repository_id: inspected.repositoryId,
        workspace_path: inspected.workspacePath,
        path_kind: destinationKind,
      }, "Preserve the path and resolve its conflict explicitly before retrying.");
    }
    selectedPath = await inspectGitRepository(runtime, inspected.workspacePath);
    if ("kind" in selectedPath) return selectedPath;
    if (selectedPath.root !== inspected.workspacePath || selectedPath.commonDirectory !== inspected.commonDirectory) {
      return failure("workspace_destination_conflict", "The saved destination is not the intended worktree of the original Git repository.", {
        repository_id: inspected.repositoryId,
        workspace_path: inspected.workspacePath,
        expected_common_directory: inspected.commonDirectory,
        actual_common_directory: selectedPath.commonDirectory,
      }, "Preserve the destination and repository metadata; resolve the identity mismatch without deleting or adopting the path.");
    }
    const registered = await worktreeRegistration(runtime, source, inspected.workspacePath, inspected.resolvedBranch);
    if (typeof registered !== "boolean") return registered;
    if (!registered) return failure("workspace_registration_conflict", "The destination is not registered as the selected branch's worktree; Kepler left it untouched.", {
      repository_id: inspected.repositoryId,
      workspace_path: inspected.workspacePath,
      branch: inspected.resolvedBranch,
    }, "Preserve all Git metadata and resolve the worktree registration explicitly before retrying.");
  } else {
    const allowedUntrackedPaths = new Set<string>();
    if (inspected.workspacePath === recordHome) {
      const journalRelativePath = Path.relative(recordHome, context.missionJournalPath);
      const journalStatusPath = journalRelativePath.split(Path.sep).join("/");
      if (journalRelativePath !== "" && journalRelativePath !== ".." &&
          !journalRelativePath.startsWith(`..${Path.sep}`) && !Path.isAbsolute(journalRelativePath) &&
          !inspected.initialDirtyPaths.includes(journalStatusPath)) allowedUntrackedPaths.add(journalStatusPath);
    }
    selectedPath = await inspectGitRepository(runtime, inspected.workspacePath, allowedUntrackedPaths);
    if ("kind" in selectedPath) return selectedPath;
    if (selectedPath.root !== inspected.workspacePath || selectedPath.root !== inspected.repositoryPath ||
        selectedPath.commonDirectory !== inspected.commonDirectory || selectedPath.gitDirectory !== inspected.gitDirectory) {
      return failure("workspace_repository_changed", "The selected workspace path no longer identifies the original Git worktree.", {
        repository_id: inspected.repositoryId,
        workspace_path: inspected.workspacePath,
        expected_git_directory: inspected.gitDirectory,
        actual_git_directory: selectedPath.gitDirectory,
        expected_common_directory: inspected.commonDirectory,
        actual_common_directory: selectedPath.commonDirectory,
      }, "Preserve the selected path and resolve the worktree identity mismatch before retrying.");
    }
    const selectedBranch = await currentBranch(runtime, selectedPath);
    const selectedCheckpoint = checkpointFromRepository(selectedPath);
    const alreadyPrepared = selectedBranch === inspected.resolvedBranch && sameCheckpoint(selectedCheckpoint, inspected.startingCheckpoint);
    if (!alreadyPrepared) {
      const initialState = selectedBranch === inspected.initialBranch && sameCheckpoint(selectedCheckpoint, inspected.initialCheckpoint);
      if (!initialState || selectedPath.dirty) {
        return repositoryCheckpointFailure(inspected, selectedBranch, selectedCheckpoint, "The selected workspace differs from both its saved starting checkpoint and original pre-preparation state.");
      }
      const branchCommit = await resolveCommit(runtime, selectedPath.root, `refs/heads/${inspected.resolvedBranch}`);
      if (inspected.startingCheckpoint.kind === "commit" && branchCommit !== inspected.startingCheckpoint.commit) {
        if (inspected.branchSelection.kind !== "new" || branchCommit !== undefined) {
          return failure("workspace_recovery_conflict", "The selected branch no longer matches its saved starting commit.", {
            repository_id: inspected.repositoryId,
            branch: inspected.resolvedBranch,
            expected_checkpoint: inspected.startingCheckpoint,
            actual_branch_checkpoint: branchCommit ?? null,
          }, "Preserve the current branch and resolve the fixed checkpoint mismatch explicitly before retrying.");
        }
      } else if (inspected.startingCheckpoint.kind === "no-commit" && branchCommit !== undefined) {
        return failure("workspace_recovery_conflict", "The selected branch now has a commit but its saved checkpoint is unborn.", {
          repository_id: inspected.repositoryId,
          branch: inspected.resolvedBranch,
          expected_checkpoint: inspected.startingCheckpoint,
          actual_branch_checkpoint: branchCommit,
        }, "Preserve the current branch and resolve the fixed checkpoint mismatch explicitly before retrying.");
      }
      const branchCoordinates = await verifyCanonicalWorkspaceCoordinates(runtime, inspected);
      if ("kind" in branchCoordinates) return branchCoordinates;
      const changed = inspected.branchSelection.kind === "new" && branchCommit === undefined
        ? await runtime.git.run(selectedPath.root, ["switch", "--quiet", "--no-overwrite-ignore", "--no-track", "--create", inspected.resolvedBranch, inspected.baseCommit ?? ""])
        : await runtime.git.run(selectedPath.root, ["switch", "--quiet", "--no-overwrite-ignore", "--", inspected.resolvedBranch]);
      if (changed.status !== 0) return failure("workspace_branch_recovery_failed", "Git could not apply the saved branch selection; no rollback was attempted.", {
        repository_id: inspected.repositoryId,
        workspace_path: inspected.workspacePath,
        branch: inspected.resolvedBranch,
        stderr: changed.stderr.trim(),
        partial_effects: [{ repository_id: inspected.repositoryId, workspace_path: inspected.workspacePath, effect: "branch-selection", state: "uncertain" }],
      }, "Preserve all branch, working-tree, and journal state. Retry the same mission only after confirming the actual branch and checkpoint.");
    }
  }

  const finalBranch = await currentBranch(runtime, selectedPath);
  const finalCheckpoint = checkpointFromRepository(selectedPath);
  if (selectedPath.commonDirectory !== inspected.commonDirectory || finalBranch !== inspected.resolvedBranch ||
      !sameCheckpoint(finalCheckpoint, inspected.startingCheckpoint)) {
    return repositoryCheckpointFailure(inspected, finalBranch, finalCheckpoint, "The reconciled workspace does not match the saved branch and starting checkpoint.");
  }
  return selectedPath;
};

interface CanonicalWorkspaceCoordinates {
  readonly commonDirectory: string;
  readonly workspacePath: string;
  readonly workspaceKey: string;
}

const verifyCanonicalWorkspaceCoordinates = async (
  runtime: MissionWorkspaceRuntime,
  inspected: InspectedMissionRepository,
): Promise<CanonicalWorkspaceCoordinates | MissionStartupFailure> => {
  const rejected = (reason: string, details: Readonly<Record<string, unknown>> = {}): MissionStartupFailure => failure(
    "workspace_recovery_identity_changed",
    "The saved workspace or Git common-directory coordinate is not canonical or no longer matches its resource identity.",
    { repository_id: inspected.repositoryId, reason, ...details },
    "Preserve the saved workspace and retry the same mission only after resolving the canonical path identity; Kepler will not adopt or rebind an alias.",
  );
  const commonDirectory = inspected.commonDirectory;
  const workspacePath = inspected.workspacePath;
  if (!Path.isAbsolute(commonDirectory) || Path.resolve(commonDirectory) !== commonDirectory ||
      !Path.isAbsolute(workspacePath) || Path.resolve(workspacePath) !== workspacePath) {
    return rejected("saved-path-not-normalized", { common_directory: commonDirectory, workspace_path: workspacePath });
  }
  try {
    if (await runtime.fileSystem.pathKind(commonDirectory) !== "directory" ||
        await runtime.fileSystem.realpath(commonDirectory) !== commonDirectory) {
      return rejected("common-directory-alias", { common_directory: commonDirectory });
    }
    const workspaceKind = await runtime.fileSystem.pathKind(workspacePath);
    let canonicalWorkspacePath: string;
    if (inspected.workspaceKind === "new" && workspaceKind === "missing") {
      const parent = Path.dirname(workspacePath);
      const name = Path.basename(workspacePath);
      if (!name || name === "." || name === ".." || Path.join(parent, name) !== workspacePath ||
          await runtime.fileSystem.pathKind(parent) !== "directory" || await runtime.fileSystem.realpath(parent) !== parent) {
        return rejected("workspace-parent-alias", { workspace_path: workspacePath, parent });
      }
      canonicalWorkspacePath = Path.join(parent, name);
      if (canonicalWorkspacePath !== workspacePath) {
        return rejected("workspace-destination-not-canonical", { workspace_path: workspacePath, canonical_destination: canonicalWorkspacePath });
      }
    } else {
      if (workspaceKind !== "directory") {
        return rejected("workspace-not-an-existing-directory", { workspace_path: workspacePath, path_kind: workspaceKind });
      }
      canonicalWorkspacePath = await runtime.fileSystem.realpath(workspacePath);
      if (canonicalWorkspacePath !== workspacePath) {
        return rejected("workspace-path-alias", { workspace_path: workspacePath, canonical_workspace_path: canonicalWorkspacePath });
      }
    }
    const workspaceKey = missionWorkspaceKey(commonDirectory, canonicalWorkspacePath);
    const integrationKey = missionIntegrationTargetKey(commonDirectory, inspected.integrationTarget);
    if (workspaceKey !== inspected.localWorkspaceKey || integrationKey !== inspected.integrationTargetKey) {
      return rejected("derived-resource-key-mismatch", {
        common_directory: commonDirectory,
        workspace_path: canonicalWorkspacePath,
        expected_workspace_key: workspaceKey,
        saved_workspace_key: inspected.localWorkspaceKey,
        expected_integration_target_key: integrationKey,
        saved_integration_target_key: inspected.integrationTargetKey,
      });
    }
    return { commonDirectory, workspacePath: canonicalWorkspacePath, workspaceKey };
  } catch (error) {
    return rejected("workspace-identity-check-failed", {
      common_directory: commonDirectory,
      workspace_path: workspacePath,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

const preparedWorkspaceEffect = (
  inspected: InspectedMissionRepository,
  repository: GitRepository,
  state: "prepared" | "git-prepared-attachment-failed",
): Record<string, unknown> => ({
  repository_id: inspected.repositoryId,
  workspace_path: repository.root,
  workspace_id: inspected.localWorkspaceKey,
  branch: inspected.resolvedBranch,
  integration_target: inspected.integrationTarget,
  starting_checkpoint: inspected.startingCheckpoint,
  state,
});

const prepareRepositories = async (
  runtime: MissionWorkspaceRuntime,
  recordHome: string,
  missionId: MissionId,
  repositories: readonly InspectedMissionRepository[],
  context: MissionWorkspacePreparationContext,
  reconcile: boolean,
): Promise<MissionWorkspacePreparationResult> => {
  if (!uuidV4.test(missionId)) return failure("mission_identity_invalid", "Workspace preparation requires a valid mission identity.");
  const recordHomeRepository = await inspectGitRepository(runtime, recordHome);
  if ("kind" in recordHomeRepository) return recordHomeRepository;
  if (repositories.some((repository) => repository.recordHomeCommonDirectory !== recordHomeRepository.commonDirectory ||
      (reconcile && repository.recordHomePath !== recordHomeRepository.root))) {
    return failure("record_home_changed", "The selected record home no longer matches the saved mission identity.", {
      record_home_path: recordHomeRepository.root,
    }, "Preserve the mission facts and selected resources, then select the original record home before retrying.");
  }
  const canonicalCoordinates: CanonicalWorkspaceCoordinates[] = [];
  for (const inspected of repositories) {
    const coordinates = await verifyCanonicalWorkspaceCoordinates(runtime, inspected);
    if ("kind" in coordinates) {
      return failure(coordinates.code, coordinates.message, { ...coordinates.details, partial_effects: [] }, coordinates.recovery);
    }
    canonicalCoordinates.push(coordinates);
  }
  const prepared: PreparedMissionRepository[] = [];
  const partialEffects: Record<string, unknown>[] = [];
  for (let index = 0; index < repositories.length; index += 1) {
    const inspected = repositories[index]!;
    const coordinates = canonicalCoordinates[index]!;
    const ownerBase: Omit<MissionCoordinationOwner, "token"> = {
      machine_id: runtime.identity.machine_id,
      process_id: runtime.identity.process_id,
      process_incarnation_id: runtime.identity.process_incarnation_id,
      mission_id: missionId,
      resource_scope: `code-workspace:${coordinates.workspaceKey}`,
    };
    const acquired = await runtime.coordination.acquire({
      commonDirectory: coordinates.commonDirectory,
      location: { kind: "code-workspace" },
      resourceKey: coordinates.workspaceKey,
      owner: ownerBase,
    });
    if (acquired.kind === "failed") {
      return failure(acquired.code, acquired.message, { ...acquired.details, partial_effects: partialEffects }, acquired.recovery);
    }

    let repository: GitRepository | undefined;
    let attachmentWritten = false;
    let operationFailure: MissionStartupFailure | undefined;
    let releaseFailure: MissionStartupFailure | undefined;
    try {
      const preparation = reconcile
        ? await reconcileSavedRepository(runtime, inspected, recordHome, context)
        : await runBranchPreparation(runtime, inspected, recordHome, context);
      if ("kind" in preparation) {
        operationFailure = preparation;
      } else {
        repository = preparation;
        try {
          operationFailure = await writeAttachment(runtime, inspected, missionId, repository);
          attachmentWritten = operationFailure === undefined;
        } catch (error) {
          operationFailure = failure("workspace_attachment_write_failed", "Kepler could not inspect or record the prepared workspace attachment.", {
            repository_id: inspected.repositoryId,
            workspace_id: inspected.localWorkspaceKey,
            attachment_path: Path.join(inspected.recordHomeCommonDirectory, "kepler", "missions", missionId, "workspaces", `${inspected.localWorkspaceKey}.json`),
            message: error instanceof Error ? error.message : String(error),
          }, "Keep the prepared Git state and retry this same mission after resolving the local attachment error.");
        }
      }
    } catch (error) {
      operationFailure = failure("workspace_preparation_failed", "Git workspace preparation failed unexpectedly.", {
        repository_id: inspected.repositoryId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      try {
        const released = await acquired.lease.release();
        if (released.kind === "failed") releaseFailure = released;
      } catch (error) {
        releaseFailure = failure("coordination_release_failed", "The workspace coordination claim could not be released safely.", {
          resource_key: inspected.localWorkspaceKey,
          lock_path: acquired.lease.lockPath,
          message: error instanceof Error ? error.message : String(error),
        }, "Preserve the coordination owner artifact and reconcile it before retrying; do not remove another holder's lock.");
      }
    }

    if (operationFailure) {
      const nestedEffects = Array.isArray(operationFailure.details.partial_effects)
        ? operationFailure.details.partial_effects as Record<string, unknown>[]
        : [];
      const currentEffects = repository
        ? [preparedWorkspaceEffect(inspected, repository, attachmentWritten ? "prepared" : "git-prepared-attachment-failed")]
        : [];
      const recovery = releaseFailure
        ? `${operationFailure.recovery} The workspace coordination claim may remain held. ${releaseFailure.recovery}`
        : operationFailure.recovery;
      return failure(operationFailure.code, operationFailure.message, {
        ...operationFailure.details,
        partial_effects: [...partialEffects, ...nestedEffects, ...currentEffects],
        ...(releaseFailure ? { coordination_release: releaseFailure } : {}),
      }, recovery);
    }
    if (releaseFailure) {
      const currentEffects = repository && attachmentWritten
        ? [preparedWorkspaceEffect(inspected, repository, "prepared")]
        : [];
      return failure("coordination_release_failed", "The workspace was prepared, but its coordination claim could not be released safely.", {
        ...releaseFailure.details,
        coordination_release: releaseFailure,
        partial_effects: [...partialEffects, ...currentEffects],
      }, releaseFailure.recovery);
    }
    if (!repository || !attachmentWritten) {
      return failure("workspace_preparation_failed", "Workspace preparation did not produce a verified Git workspace and attachment.", {
        repository_id: inspected.repositoryId,
        partial_effects: partialEffects,
      });
    }
    partialEffects.push(preparedWorkspaceEffect(inspected, repository, "prepared"));
    prepared.push({
      repositoryId: inspected.repositoryId,
      context: inspected.context,
      branch: inspected.resolvedBranch,
      integrationTarget: inspected.integrationTarget,
      startingCheckpoint: inspected.startingCheckpoint,
      localWorkspaceKey: inspected.localWorkspaceKey,
      workspacePath: repository.root,
    });
  }
  return { kind: "prepared", repositories: prepared };
};

export const createMissionWorkspacePreparation = (
  runtime: MissionWorkspaceRuntime,
): MissionWorkspacePreparation => ({

  identifyRecordHome: async (recordHome: string): Promise<MissionRecordHomeIdentity | MissionStartupFailure> => {
    const repository = await inspectGitRepository(runtime, recordHome);
    if ("kind" in repository) return repository;
    return { root: repository.root, gitDirectory: repository.gitDirectory, commonDirectory: repository.commonDirectory };
  },
  inspect: async (recordHome, request: MissionStartupRequest) => {
    const recordHomeRepository = await inspectGitRepository(runtime, recordHome);
    if ("kind" in recordHomeRepository) return recordHomeRepository;
    const recordHomeCommonDirectory = recordHomeRepository.commonDirectory;
    const repositories: InspectedMissionRepository[] = [];
    const resourceKeys = new Set<string>();
    for (const selection of request.repositories) {
      const inspected = await inspectOne(runtime, recordHomeRepository.root, recordHomeCommonDirectory, request.recordHomeRepositoryId, selection);
      if ("kind" in inspected) return inspected;
      if (resourceKeys.has(inspected.localWorkspaceKey)) {
        return failure("duplicate_selected_workspace", "The request selects the same canonical Git worktree more than once.", {
          repository_id: selection.repositoryId,
          workspace_id: inspected.localWorkspaceKey,
        }, "Select each local worktree once and use distinct linked worktrees for concurrent mission contexts.");
      }
      resourceKeys.add(inspected.localWorkspaceKey);
      repositories.push(inspected);
    }
    return { kind: "inspected", repositories };
  },
  prepare: async (recordHome, missionId, repositories, context) =>
    await prepareRepositories(runtime, recordHome, missionId, repositories, context, false),
  reconcile: async (recordHome, missionId, repositories, context) =>
    await prepareRepositories(runtime, recordHome, missionId, repositories, context, true),
});
