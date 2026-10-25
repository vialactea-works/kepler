import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ConstructionEventRecord } from "../../packages/cli/src/construction/events.js";
import type { DiffPackageComparisonBinding, DiffPackageResolvedSource } from "../../packages/cli/src/construction/diff-package-source.js";
import { GitDiffPackageAdapter, createNodeGitDiffPackageRuntime } from "../../packages/cli/src/workbench/git-diff-package.js";
import { renderGitDiffPackage } from "../../packages/cli/src/workbench/diff-package.js";

const temporaryRoots: string[] = [];
const repositories: { readonly path: string; readonly id: string; readonly base: string; readonly branch: string }[] = [];
const missionId = randomUUID();
const unitId = "2026-10-23-git-diff-package";
const taskId = "30000000-0000-4000-8000-000000000001";
const implementationAttemptId = "40000000-0000-4000-8000-000000000001";
const taskOutputAttemptId = "50000000-0000-4000-8000-000000000001";
const integrationAttemptId = "50000000-0000-4000-8000-000000000002";
const retainedAttemptId = "50000000-0000-4000-8000-000000000003";

const environment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0",
};

const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8", env: environment }).trim();

const withEnvironment = async <T>(values: Readonly<Record<string, string>>, action: () => Promise<T>): Promise<T> => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await action();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const commit = (cwd: string, message: string): string => {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
};

const createRepository = async (root: string, id: string): Promise<{ path: string; id: string; base: string; branch: string }> => {
  const path = Path.join(root, id);
  await Fs.mkdir(path, { recursive: true });
  git(path, "init", "-q", "-b", "main");
  git(path, "config", "user.name", "Kepler diff package test");
  git(path, "config", "user.email", "diff-package@example.invalid");
  await Fs.writeFile(Path.join(path, "README.md"), `Repository ${id}\n`, "utf8");
  const base = commit(path, "Create source baseline");
  git(path, "switch", "-q", "-c", "feature");
  return { path, id, base, branch: "feature" };
};

const record = (type: ConstructionEventRecord["type"], data: Record<string, unknown>): ConstructionEventRecord => ({
  id: randomUUID() as ConstructionEventRecord["id"],
  phase: "construction",
  type,
  envelope_version: 1,
  event_version: 1,
  journal_id: randomUUID() as ConstructionEventRecord["journal_id"],
  recorded_at: "2026-10-23T10:00:00.000Z",
  producer: { name: "kepler-test", version: "0.10.3" },
  caused_by: [],
  data,
});

const comparison = (
  role: string,
  repository: { readonly id: string },
  base: string,
  target: string,
  accepted: boolean | null = null,
): DiffPackageComparisonBinding => ({
  role,
  repositoryId: repository.id,
  base: { repositoryId: repository.id, commit: base },
  target: { repositoryId: repository.id, commit: target },
  sourceEventIds: [randomUUID()],
  accepted,
});

const snapshot = async (root: string): Promise<Readonly<Record<string, string>>> => {
  const result: Record<string, string> = {};
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await Fs.readdir(directory, { withFileTypes: true })) {
      const path = Path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result[Path.relative(root, path)] = createHash("sha256").update(await Fs.readFile(path)).digest("hex");
    }
  };
  await visit(root);
  return result;
};

afterEach(async () => {
  while (temporaryRoots.length > 0) await Fs.rm(temporaryRoots.pop()!, { recursive: true, force: true });
  repositories.length = 0;
});

describe("GitDiffPackageAdapter", () => {
  it("renders fixed multi-repository comparisons with binary objects, retained history, overlaps, and concurrent commits", async () => {
    const temporaryRoot = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-git-diff-package-"));
    temporaryRoots.push(temporaryRoot);
    const primary = await createRepository(temporaryRoot, "repo-primary");
    const secondary = await createRepository(temporaryRoot, "repo-secondary");
    repositories.push(primary, secondary);

    const history = Array.from({ length: 40 }, (_, index) => `line-${index + 1}`).join("\n") + "\n";
    await Fs.writeFile(Path.join(primary.path, "history.txt"), history, "utf8");
    await Fs.writeFile(Path.join(primary.path, "shared.txt"), "base version\n", "utf8");
    await Fs.mkdir(Path.join(primary.path, "assets"), { recursive: true });
    await Fs.writeFile(Path.join(primary.path, "assets", "payload.bin"), Buffer.from([7, 8, 9]));
    const primaryBase = commit(primary.path, "Add source history");
    git(primary.path, "switch", "-q", "-c", "task-output");
    const changedHistory = history.replace("line-20", "changed-line-20");
    await Fs.writeFile(Path.join(primary.path, "history.txt"), changedHistory, "utf8");
    await Fs.writeFile(Path.join(primary.path, "shared.txt"), "task version\n", "utf8");
    await Fs.writeFile(Path.join(primary.path, "task.txt"), "task output\n", "utf8");
    await Fs.mkdir(Path.join(primary.path, "assets"), { recursive: true });
    await Fs.writeFile(Path.join(primary.path, "assets", "payload.bin"), Buffer.from([0, 1, 2, 0, 255]));
    const taskOutput = commit(primary.path, "Record task output");

    git(primary.path, "switch", "-q", "-c", "peer", primaryBase);
    await Fs.writeFile(Path.join(primary.path, "shared.txt"), "peer version\n", "utf8");
    await Fs.writeFile(Path.join(primary.path, "peer.txt"), "peer contribution\n", "utf8");
    const peerCommit = commit(primary.path, "Record peer contribution");
    git(primary.path, "switch", "-q", "task-output");
    const merge = spawnSync("git", ["merge", "--no-commit", "--no-ff", "peer"], { cwd: primary.path, env: environment, encoding: "utf8" });
    expect(merge.status).toBe(1);
    await Fs.writeFile(Path.join(primary.path, "shared.txt"), "resolved integration version\n", "utf8");
    git(primary.path, "add", "shared.txt", "peer.txt");
    git(primary.path, "commit", "-q", "-m", "Integrate peer changes with conflict resolution");
    const integrationCandidate = git(primary.path, "rev-parse", "HEAD");
    await Fs.writeFile(Path.join(primary.path, "unrecorded.txt"), "Later work is outside the selected source checkpoint\n", "utf8");
    const currentHead = commit(primary.path, "Advance HEAD after source checkpoint");

    await Fs.writeFile(Path.join(secondary.path, "lib.txt"), "Secondary repository source output\n", "utf8");
    const secondaryOutput = commit(secondary.path, "Record secondary output");
    await Fs.writeFile(Path.join(secondary.path, "later.txt"), "Unrecorded secondary work\n", "utf8");
    commit(secondary.path, "Advance secondary HEAD");

    const missionDirectory = Path.join(git(primary.path, "rev-parse", "--path-format=absolute", "--git-common-dir"), "kepler", "missions", missionId, "workspaces");
    await Fs.mkdir(missionDirectory, { recursive: true });
    const workspaceBindings = [
      { repository: primary, base: primaryBase, workspaceId: "a".repeat(64) },
      { repository: secondary, base: secondary.base, workspaceId: "b".repeat(64) },
    ];
    for (const { repository, base, workspaceId } of workspaceBindings) {
      await Fs.writeFile(Path.join(missionDirectory, `${workspaceId}.json`), `${JSON.stringify({
        format: "kepler.mission-workspace.v1",
        mission_id: missionId,
        record_home_repository_id: primary.id,
        repository_id: repository.id,
        workspace_id: workspaceId,
        workspace_path: await Fs.realpath(repository.path),
        repository_path: await Fs.realpath(repository.path),
        git_directory: git(repository.path, "rev-parse", "--absolute-git-dir"),
        common_directory: git(repository.path, "rev-parse", "--path-format=absolute", "--git-common-dir"),
        branch: repository.branch,
        integration_target: "refs/heads/main",
        starting_checkpoint: repository.id === secondary.id ? { commit: base, kind: "commit" } : { kind: "commit", commit: base },
      })}\n`, "utf8");
    }

    const retained = record("construction.retained-scope-assessed", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      assessments: [{ task_id: taskId, activity: "code-generation", original_stage_attempt_id: "old-attempt", original_activity_attempt_id: retainedAttemptId, applicable: true, reason: "Source output retained", checkpoints: [{ repository_id: primary.id, commit: taskOutput }] }],
    });
    const integrationPrepared = record("construction.integration-prepared", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      task_id: taskId,
      activity: "code-integration",
      activity_attempt_id: integrationAttemptId,
      captured_inputs: [{ repository_id: primary.id, commit: taskOutput }, { repository_id: secondary.id, commit: secondaryOutput }],
      candidate_checkpoints: [{ repository_id: primary.id, commit: integrationCandidate }, { repository_id: secondary.id, commit: secondaryOutput }],
      source_evidence_ids: [randomUUID()],
    });
    const integrationAccepted = record("construction.integration-accepted", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      task_id: taskId,
      activity: "code-integration",
      activity_attempt_id: integrationAttemptId,
      candidate_checkpoints: [{ repository_id: primary.id, commit: integrationCandidate }, { repository_id: secondary.id, commit: secondaryOutput }],
      prepared_event_id: integrationPrepared.id,
    });
    const taskDefinition = record("construction.task-admitted", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "implementation",
      stage_attempt_id: implementationAttemptId,
      task_id: taskId,
      graph_ref: { graph_id: "graph-1", content_version: "graph-v1" },
      task_definition_ref: { graph_id: "graph-1", task_id: taskId, content_version: "task-v1" },
      task_contract: { outputs: ["history.txt", "shared.txt", "task.txt", "assets/payload.bin"], acceptance_criteria: ["Source output is recorded"], dependency_task_ids: [], implementation_prerequisites: [] },
    });
    const source: DiffPackageResolvedSource = {
      scope: { kind: "unit-review", unitId, implementationAttemptId },
      projectRoot: await Fs.realpath(primary.path),
      missionId,
      recordHomeRepositoryId: primary.id,
      workspaceRepositories: workspaceBindings.map(({ repository, base }) => ({
        repository_id: repository.id,
        context: { kind: "existing" },
        branch: repository.branch,
        integration_target: "refs/heads/main",
        starting_checkpoint: { kind: "commit", commit: base },
      })),
      comparisons: [
        comparison("validation-admission-to-generation-output", primary, primaryBase, taskOutput),
        comparison("validation-admission-to-generation-output", secondary, secondary.base, secondaryOutput),
        comparison("integration-captured-input-to-candidate", primary, taskOutput, integrationCandidate, true),
        comparison("integration-captured-input-to-candidate", secondary, secondaryOutput, secondaryOutput, true),
        comparison("retained-scope-original-admission-to-output", primary, primaryBase, taskOutput),
        comparison("unit-review-original-baseline-to-completion", primary, primaryBase, integrationCandidate),
        comparison("unit-review-original-baseline-to-completion", secondary, secondary.base, secondaryOutput),
      ],
      taskDefinitions: [taskDefinition],
      upstreamVersions: [taskDefinition],
      sourceAttempts: [{ taskId, activity: "code-generation", attemptId: taskOutputAttemptId, implementationAttemptId, eventIds: [String(taskDefinition.id)] }],
      activityEvidence: [],
      retainedScopes: [retained],
      integrationHistory: [integrationPrepared, integrationAccepted],
      sourceRecords: [taskDefinition, retained, integrationPrepared, integrationAccepted],
    };
    git(primary.path, "replace", taskOutput, primaryBase);
    const gitDirectorySnapshots = await Promise.all([primary.path, secondary.path].map((path) => snapshot(Path.join(path, ".git"))));
    const adapter = new GitDiffPackageAdapter(createNodeGitDiffPackageRuntime({ temporaryDirectory: temporaryRoot }));
    const roots = await adapter.resolveRepositoryRoots(source);
    expect(roots.kind).toBe("resolved");
    if (roots.kind !== "resolved") return;
    expect(roots.roots.get(primary.id)?.workspacePath).toBe(await Fs.realpath(primary.path));
    expect(roots.roots.get(secondary.id)?.workspacePath).toBe(await Fs.realpath(secondary.path));
    const renderedComparisons = await adapter.compare(source, roots.roots);
    expect("kind" in renderedComparisons).toBe(false);
    if ("kind" in renderedComparisons) return;
    const rendered = renderGitDiffPackage(source, renderedComparisons);
    const written = await adapter.write(source, rendered.content);
    expect(written.kind).toBe("written");
    if (written.kind !== "written") return;
    const packageText = await Fs.readFile(written.path, "utf8");
    const validation = renderedComparisons.find((item) => item.binding.role === "validation-admission-to-generation-output" && item.binding.repositoryId === primary.id)!;
    const integration = renderedComparisons.find((item) => item.binding.role === "integration-captured-input-to-candidate" && item.binding.repositoryId === primary.id)!;
    const review = renderedComparisons.find((item) => item.binding.role === "unit-review-original-baseline-to-completion" && item.binding.repositoryId === primary.id)!;
    const emptyIntegration = renderedComparisons.find((item) => item.binding.role === "integration-captured-input-to-candidate" && item.binding.repositoryId === secondary.id)!;

    expect(validation.files.map((file) => file.path)).toContain("assets/payload.bin");
    expect(validation.files.find((file) => file.path === "assets/payload.bin")).toMatchObject({ nontext: true, additions: null, deletions: null });
    expect(validation.files.find((file) => file.path === "assets/payload.bin")?.objectAccess).toHaveLength(2);
    expect(validation.patch).toContain("-line-20");
    expect(validation.patch).toContain("+changed-line-20");
    expect(validation.patch).toContain(" line-10");
    expect(validation.patch).toContain(" line-30");
    expect(validation.patch.split("\n")).not.toContain(" line-9");
    expect(integration.files.map((file) => file.path)).toContain("peer.txt");
    expect(integration.files.map((file) => file.path)).toContain("shared.txt");
    expect(integration.commits.some((entry) => entry.commit === peerCommit)).toBe(true);
    expect(review.commits.find((entry) => entry.commit === integrationCandidate)?.parents).toHaveLength(2);
    expect(review.commits.some((entry) => entry.commit === taskOutput)).toBe(true);
    expect(emptyIntegration.files).toHaveLength(0);
    expect(emptyIntegration.patch).toBe("");
    expect(rendered.empty).toBe(false);
    expect(packageText).toContain("retained-scope-original-admission-to-output");
    expect(packageText).toContain("conflict_effect_attribution");
    expect(packageText).toContain("uncertain");
    expect(packageText).toContain("shared.txt");
    expect(packageText).not.toContain("unrecorded.txt");
    expect(packageText).not.toContain("Later work is outside the selected source checkpoint");
    expect(currentHead).not.toBe(integrationCandidate);
    expect(await Promise.all([primary.path, secondary.path].map((path) => snapshot(Path.join(path, ".git"))))).toEqual(gitDirectorySnapshots);
  });

  it("resolves Gitlink object access through the exact recorded submodule repository", async () => {
    const temporaryRoot = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-git-diff-package-gitlink-"));
    temporaryRoots.push(temporaryRoot);
    const superproject = await createRepository(temporaryRoot, "repo-superproject");
    const submoduleSource = await createRepository(temporaryRoot, "repo-submodule-source");
    repositories.push(superproject, submoduleSource);
    await Fs.writeFile(Path.join(submoduleSource.path, "submodule.txt"), "Submodule object content\n", "utf8");
    const submoduleCommit = commit(submoduleSource.path, "Record submodule object");
    git(superproject.path, "-c", "protocol.file.allow=always", "submodule", "add", "-q", "-b", "feature", submoduleSource.path, "nested");
    const submoduleRoot = Path.join(superproject.path, "nested");
    expect(git(submoduleRoot, "rev-parse", "HEAD")).toBe(submoduleCommit);
    const candidate = commit(superproject.path, "Add recorded submodule link");
    const missionDirectory = Path.join(git(superproject.path, "rev-parse", "--path-format=absolute", "--git-common-dir"), "kepler", "missions", missionId, "workspaces");
    await Fs.mkdir(missionDirectory, { recursive: true });
    const submoduleRootReal = await Fs.realpath(submoduleRoot);
    const submoduleGitDirectory = git(submoduleRootReal, "rev-parse", "--absolute-git-dir");
    const attachment = (repositoryId: string, workspaceId: string, repositoryRoot: string, branch: string, startingCommit: string) => ({
      format: "kepler.mission-workspace.v1",
      mission_id: missionId,
      record_home_repository_id: superproject.id,
      repository_id: repositoryId,
      workspace_id: workspaceId,
      workspace_path: repositoryRoot,
      repository_path: repositoryRoot,
      git_directory: git(repositoryRoot, "rev-parse", "--absolute-git-dir"),
      common_directory: git(repositoryRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"),
      branch,
      integration_target: "refs/heads/main",
      starting_checkpoint: { kind: "commit", commit: startingCommit },
    });
    await Fs.writeFile(Path.join(missionDirectory, `${"a".repeat(64)}.json`), `${JSON.stringify(attachment(
      superproject.id,
      "a".repeat(64),
      await Fs.realpath(superproject.path),
      superproject.branch,
      superproject.base,
    ))}\n`, "utf8");
    await Fs.writeFile(Path.join(missionDirectory, `${"b".repeat(64)}.json`), `${JSON.stringify(attachment(
      "repo-submodule",
      "b".repeat(64),
      submoduleRootReal,
      "feature",
      submoduleCommit,
    ))}\n`, "utf8");
    const source: DiffPackageResolvedSource = {
      scope: { kind: "unit-review", unitId, implementationAttemptId },
      projectRoot: await Fs.realpath(superproject.path),
      missionId,
      recordHomeRepositoryId: superproject.id,
      workspaceRepositories: [
        {
          repository_id: superproject.id,
          context: { kind: "existing" },
          branch: superproject.branch,
          integration_target: "refs/heads/main",
          starting_checkpoint: { kind: "commit", commit: superproject.base },
        },
        {
          repository_id: "repo-submodule",
          context: { kind: "existing" },
          branch: "feature",
          integration_target: "refs/heads/main",
          starting_checkpoint: { kind: "commit", commit: submoduleCommit },
        },
      ],
      comparisons: [comparison("unit-review-original-baseline-to-completion", superproject, superproject.base, candidate)],
      taskDefinitions: [],
      upstreamVersions: [],
      sourceAttempts: [],
      activityEvidence: [],
      retainedScopes: [],
      integrationHistory: [],
      sourceRecords: [],
    };
    const gitBefore = await snapshot(Path.join(superproject.path, ".git"));
    const adapter = new GitDiffPackageAdapter(createNodeGitDiffPackageRuntime({ temporaryDirectory: temporaryRoot }));
    const tracePath = Path.join(temporaryRoot, "git-trace.log");
    const comparisons = await withEnvironment({
      GIT_DIR: Path.join(superproject.path, ".git", "invalid-git-dir"),
      GIT_WORK_TREE: Path.join(temporaryRoot, "invalid-work-tree"),
      GIT_COMMON_DIR: Path.join(superproject.path, ".git", "invalid-common-dir"),
      GIT_INDEX_FILE: Path.join(superproject.path, ".git", "invalid-index"),
      GIT_OBJECT_DIRECTORY: Path.join(temporaryRoot, "invalid-object-directory"),
      GIT_NO_REPLACE_OBJECTS: "0",
      GIT_ALTERNATE_OBJECT_DIRECTORIES: Path.join(temporaryRoot, "invalid-alternate-object-directory"),
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.bare",
      GIT_CONFIG_VALUE_0: "true",
      GIT_TRACE: tracePath,
    }, async () => {
      const roots = await adapter.resolveRepositoryRoots(source);
      expect(roots.kind).toBe("resolved");
      if (roots.kind !== "resolved") return roots;
      return adapter.compare(source, roots.roots);
    });
    expect("kind" in comparisons).toBe(false);
    if ("kind" in comparisons) return;
    const rendered = renderGitDiffPackage(source, comparisons);
    const gitlink = comparisons[0]?.files.find((file) => file.path === "nested");
    expect(gitlink).toMatchObject({
      nontext: true,
      oldObjectId: null,
      newMode: "160000",
      newObjectId: submoduleCommit,
      objectAccess: [{ command: "git", args: ["--no-replace-objects", "--git-dir", submoduleGitDirectory, "cat-file", "commit", submoduleCommit] }],
    });
    const access = gitlink?.objectAccess[0];
    expect(access).toBeDefined();
    const submoduleObject = spawnSync(access!.command, [...access!.args], { cwd: superproject.path, env: environment, encoding: "utf8" });
    expect(submoduleObject.status).toBe(0);
    const superprojectObject = spawnSync("git", ["cat-file", "-e", `${submoduleCommit}^{commit}`], { cwd: superproject.path, env: environment, encoding: "utf8" });
    expect(superprojectObject.status).not.toBe(0);
    expect(rendered.content).toContain(submoduleGitDirectory);
    expect(rendered.content).toContain(submoduleCommit);
    expect(await Fs.access(tracePath).then(() => true, () => false)).toBe(false);
    const sourceWithoutSubmoduleBinding = {
      ...source,
      workspaceRepositories: source.workspaceRepositories.filter((repository) => repository.repository_id !== "repo-submodule"),
    };
    const incompleteRoots = await adapter.resolveRepositoryRoots(sourceWithoutSubmoduleBinding);
    expect(incompleteRoots.kind).toBe("resolved");
    if (incompleteRoots.kind !== "resolved") return;
    const missingBinding = await adapter.compare(sourceWithoutSubmoduleBinding, incompleteRoots.roots);
    expect(missingBinding).toMatchObject({ kind: "failed", code: "diff_package_gitlink_repository_missing" });
    expect(await snapshot(Path.join(superproject.path, ".git"))).toEqual(gitBefore);

    git(superproject.path, "submodule", "deinit", "--force", "nested");
    expect(git(submoduleRootReal, "rev-parse", "--show-toplevel")).toBe(superproject.path);
    const gitBeforeUninitialized = await snapshot(Path.join(superproject.path, ".git"));
    const uninitializedRoots = await adapter.resolveRepositoryRoots(source);
    expect(uninitializedRoots.kind).toBe("resolved");
    if (uninitializedRoots.kind !== "resolved") return;
    const uninitializedComparisons = await adapter.compare(source, uninitializedRoots.roots);
    expect("kind" in uninitializedComparisons).toBe(false);
    if ("kind" in uninitializedComparisons) return;
    const uninitializedGitlink = uninitializedComparisons[0]?.files.find((file) => file.path === "nested");
    expect(uninitializedGitlink).toMatchObject({
      oldObjectId: null,
      newObjectId: submoduleCommit,
      objectAccess: [{ command: "git", args: ["--no-replace-objects", "--git-dir", submoduleGitDirectory, "cat-file", "commit", submoduleCommit] }],
    });
    const uninitializedAccess = uninitializedGitlink?.objectAccess[0];
    expect(uninitializedAccess).toBeDefined();
    expect(spawnSync(uninitializedAccess!.command, [...uninitializedAccess!.args], { cwd: superproject.path, env: environment, encoding: "utf8" }).status).toBe(0);
    expect(await snapshot(Path.join(superproject.path, ".git"))).toEqual(gitBeforeUninitialized);

    git(superproject.path, "rm", "-q", "-f", "nested");
    expect(await Fs.access(submoduleRootReal).then(() => true, () => false)).toBe(false);
    const deletedCandidate = commit(superproject.path, "Remove the submodule link");
    const deletionSource = {
      ...source,
      comparisons: [comparison("unit-review-original-baseline-to-completion", superproject, candidate, deletedCandidate)],
    };
    const gitBeforeDeletion = await snapshot(Path.join(superproject.path, ".git"));
    const deletionRoots = await adapter.resolveRepositoryRoots(deletionSource);
    expect(deletionRoots.kind).toBe("resolved");
    if (deletionRoots.kind !== "resolved") return;
    const deletionComparisons = await adapter.compare(deletionSource, deletionRoots.roots);
    expect("kind" in deletionComparisons).toBe(false);
    if ("kind" in deletionComparisons) return;
    const deletedGitlink = deletionComparisons[0]?.files.find((file) => file.path === "nested");
    expect(deletedGitlink).toMatchObject({
      oldMode: "160000",
      newMode: "000000",
      oldObjectId: submoduleCommit,
      newObjectId: null,
      objectAccess: [{ command: "git", args: ["--no-replace-objects", "--git-dir", submoduleGitDirectory, "cat-file", "commit", submoduleCommit] }],
    });
    const deletionAccess = deletedGitlink?.objectAccess[0];
    expect(deletionAccess).toBeDefined();
    expect(spawnSync(deletionAccess!.command, [...deletionAccess!.args], { cwd: superproject.path, env: environment, encoding: "utf8" }).status).toBe(0);
    expect(await snapshot(Path.join(superproject.path, ".git"))).toEqual(gitBeforeDeletion);

    const submoduleAttachmentPath = Path.join(missionDirectory, `${"b".repeat(64)}.json`);
    const storedAttachment = JSON.parse(await Fs.readFile(submoduleAttachmentPath, "utf8")) as Record<string, unknown>;
    await Fs.writeFile(submoduleAttachmentPath, `${JSON.stringify({ ...storedAttachment, repository_path: Path.join(temporaryRoot, "unverified-submodule") })}\n`, "utf8");
    const gitBeforeMismatchedBinding = await snapshot(Path.join(superproject.path, ".git"));
    const mismatchedRoots = await adapter.resolveRepositoryRoots(source);
    expect(mismatchedRoots).toMatchObject({ kind: "failed", code: "diff_package_workspace_identity_mismatch" });
    expect(await snapshot(Path.join(superproject.path, ".git"))).toEqual(gitBeforeMismatchedBinding);
  });

  it("creates a project-relative output exclusively when writers race", async () => {
    const temporaryRoot = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-git-diff-package-exclusive-"));
    temporaryRoots.push(temporaryRoot);
    const repository = await createRepository(temporaryRoot, "repo-exclusive");
    repositories.push(repository);
    const source: DiffPackageResolvedSource = {
      scope: { kind: "unit-review", unitId, implementationAttemptId },
      projectRoot: await Fs.realpath(repository.path),
      missionId,
      recordHomeRepositoryId: repository.id,
      workspaceRepositories: [],
      comparisons: [],
      taskDefinitions: [],
      upstreamVersions: [],
      sourceAttempts: [],
      activityEvidence: [],
      retainedScopes: [],
      integrationHistory: [],
      sourceRecords: [],
    };
    const gitBefore = await snapshot(Path.join(repository.path, ".git"));
    const adapter = new GitDiffPackageAdapter(createNodeGitDiffPackageRuntime());
    const results = await Promise.all([
      adapter.write(source, "first complete package\n", "package.md"),
      adapter.write(source, "second complete package\n", "package.md"),
    ]);
    const successes = results.filter((result) => result.kind === "written");
    const failures = results.filter((result) => result.kind === "failed");

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ kind: "failed" });
    const packageContent = await Fs.readFile(Path.join(repository.path, "package.md"), "utf8");
    expect(["first complete package\n", "second complete package\n"]).toContain(packageContent);
    expect(await snapshot(Path.join(repository.path, ".git"))).toEqual(gitBefore);
  });

  it("reports an empty package when every recorded repository comparison is empty", async () => {
    const temporaryRoot = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-git-diff-package-empty-"));
    temporaryRoots.push(temporaryRoot);
    const repository = await createRepository(temporaryRoot, "repo-empty");
    repositories.push(repository);
    const missionDirectory = Path.join(git(repository.path, "rev-parse", "--path-format=absolute", "--git-common-dir"), "kepler", "missions", missionId, "workspaces");
    await Fs.mkdir(missionDirectory, { recursive: true });
    await Fs.writeFile(Path.join(missionDirectory, `${"c".repeat(64)}.json`), `${JSON.stringify({
      format: "kepler.mission-workspace.v1",
      mission_id: missionId,
      record_home_repository_id: repository.id,
      repository_id: repository.id,
      workspace_id: "c".repeat(64),
      workspace_path: await Fs.realpath(repository.path),
      repository_path: await Fs.realpath(repository.path),
      git_directory: git(repository.path, "rev-parse", "--absolute-git-dir"),
      common_directory: git(repository.path, "rev-parse", "--path-format=absolute", "--git-common-dir"),
      branch: repository.branch,
      integration_target: "refs/heads/main",
      starting_checkpoint: { kind: "commit", commit: repository.base },
    })}\n`, "utf8");
    const source: DiffPackageResolvedSource = {
      scope: { kind: "unit-review", unitId, implementationAttemptId },
      projectRoot: await Fs.realpath(repository.path),
      missionId,
      recordHomeRepositoryId: repository.id,
      workspaceRepositories: [{
        repository_id: repository.id,
        context: { kind: "existing" },
        branch: repository.branch,
        integration_target: "refs/heads/main",
        starting_checkpoint: { kind: "commit", commit: repository.base },
      }],
      comparisons: [comparison("unit-review-original-baseline-to-completion", repository, repository.base, repository.base)],
      taskDefinitions: [],
      upstreamVersions: [],
      sourceAttempts: [],
      activityEvidence: [],
      retainedScopes: [],
      integrationHistory: [],
      sourceRecords: [],
    };
    const adapter = new GitDiffPackageAdapter(createNodeGitDiffPackageRuntime({ temporaryDirectory: temporaryRoot }));
    const roots = await adapter.resolveRepositoryRoots(source);
    expect(roots.kind).toBe("resolved");
    if (roots.kind !== "resolved") return;
    const result = await adapter.compare(source, roots.roots);
    expect("kind" in result).toBe(false);
    if ("kind" in result) return;
    const rendered = renderGitDiffPackage(source, result);
    expect(rendered.empty).toBe(true);
    expect(rendered.content).toContain("Diff is empty: yes");
    expect(result[0]?.files).toEqual([]);
  });
});
