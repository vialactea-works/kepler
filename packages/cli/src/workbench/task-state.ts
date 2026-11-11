import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import * as Path from "node:path";
import { parseMarkdownFrontmatter } from "@vialactea-works/kepler-core";
import { parseDocument } from "yaml";
import { ContextService, contextEvidenceRuntime } from "./context.js";
import { inspectInitialScaffold, inspectIntentApprovals } from "./precondition-artifacts.js";
import { createArtifactReader } from "./artifact-reader.js";
import { validateArtifact } from "./artifact-contracts.js";
import { validateTaskAdmission, validateTaskAdmissionHistory, type TaskAdmission } from "./task-admission.js";
import { inspectTaskAdmissionHistory } from "./task-admission-history.js";
import { parseReviewPasses } from "./review-passes.js";
import { resolveTaskCheckpoint } from "./task-checkpoint.js";
import { TASK_STATE_RUNTIME, type TaskStateRuntime, type TaskWorkspace } from "./task-state-runtime.js";
import { validateScopeExpansions, type ScopeExpansionHistoryGit } from "./scope-expansions.js";
import { inspectScopeExpansionHistory } from "./scope-expansion-history.js";
import type { TaskPublication } from "./artifact-types.js";
import type { CliResult } from "../cli/nest/result-reporter.js";

export interface TaskStateArguments {
  readonly admit: boolean;
  readonly retry?: boolean;
  readonly reserve?: boolean;
  readonly publish?: boolean;
  readonly reservation?: string;
  readonly taskHead?: string;
  readonly verify?: string;
  readonly response?: "done" | "blocked" | "interrupted" | "unavailable";
  readonly task?: number;
  readonly changeDir?: string;
  readonly expectedHead?: string;
  readonly worker?: string;
  readonly worktree?: string;
  readonly targetBranch?: string;
}

export interface TaskStateResult extends CliResult {
  readonly operation: "admit" | "reserve" | "publish";
  readonly status: "admitted" | "reserved" | "published" | "rejected";
}

const failure = (message: string, exitCode: 1 | 2 = 1, operation: TaskStateResult["operation"] = "admit"): TaskStateResult => ({ operation, status: "rejected", stdout: "", stderr: `error: ${message}\n`, exitCode });
const fullCommit = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const digest = (source: string): string => createHash("sha256").update(source).digest("hex");
const within = (root: string, path: string): boolean => { const relative = Path.relative(root, path); return relative !== "" && !relative.startsWith("..") && !Path.isAbsolute(relative); };
const bodyAfterFrontmatter = (source: string): string => {
  const frontmatter = parseMarkdownFrontmatter(source);
  return frontmatter.kind === "present" ? frontmatter.body : source;
};

export const taskStateCheckpointGit = (runtime: TaskStateRuntime): ScopeExpansionHistoryGit => {
  const port = runtime.context.git;
  if (!port.pathHistory || !port.fileAt || !port.firstParent || !port.resolveCommit || !port.isAncestor || !port.changedPaths || !port.pathChanges) throw new Error("Admission history ports are unavailable");
  return { pathHistory: port.pathHistory, blobAt: port.fileAt, firstParent: port.firstParent, resolveCommit: port.resolveCommit, isAncestor: port.isAncestor, changedPaths: port.changedPaths, pathChanges: port.pathChanges };
};

export const updateTaskLedger = (source: string, task: number, status: "in-progress" | "blocked" | "done", fields: Readonly<Record<string, unknown>>): string => {
  const frontmatter = parseMarkdownFrontmatter(source);
  if (frontmatter.kind !== "present") throw new Error("Root ledger front matter is malformed");
  const document = parseDocument(frontmatter.value);
  if (document.errors.length > 0) throw new Error("Root ledger metadata is malformed");
  const metadata = document.toJS() as Record<string, unknown>;
  if (!Array.isArray(metadata.tasks)) throw new Error("Root task metadata is missing");
  const index = metadata.tasks.findIndex((entry: unknown) => typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).id === task);
  if (index < 0) throw new Error("Root task metadata is missing");
  document.setIn(["tasks", index, "status"], status);
  for (const [key, value] of Object.entries(fields)) document.setIn(["tasks", index, key], value);
  if (metadata.status === "pending") document.set("status", "in-progress");
  const body = frontmatter.body;
  const row = new RegExp(`^(\\| Task ${task}: [^\\r\\n]+? \\| )(pending|in-progress|blocked|done)( \\| [^\\r\\n]+\\|)$`, "m");
  if (!row.test(body)) throw new Error("Root task row is missing");
  return `---\n${document.toString()}---\n${body.replace(row, `$1${status}$3`)}`;
};

@Injectable()
export class TaskStateService {
  constructor(@Inject(TASK_STATE_RUNTIME) private readonly runtime: TaskStateRuntime) {}

  async execute(args: TaskStateArguments): Promise<TaskStateResult> {
    if ([args.admit, args.reserve === true, args.publish === true].filter(Boolean).length !== 1) return failure("Select exactly one --admit, --reserve, or --publish operation", 2);
    if (args.reserve) return this.reserve(args);
    if (args.publish) return this.publish(args);
    if (!args.admit || !Number.isSafeInteger(args.task) || (args.task ?? 0) < 1 || !args.changeDir || !fullCommit(args.expectedHead) || !args.worker?.trim() || !args.worktree || !args.targetBranch) return failure("--admit requires --task, --change-dir, --expected-head, --worker, --worktree, and --target-branch", 2);
    try {
      const root = await this.runtime.git.workspace(this.runtime.cwd());
      const changeDir = await this.runtime.files.realpath(Path.resolve(this.runtime.cwd(), args.changeDir));
      const lane = await this.runtime.git.workspace(Path.resolve(this.runtime.cwd(), args.worktree));
      if (!within(root.root, changeDir)) return failure("Change directory belongs to a foreign repository");
      const progressRelative = Path.relative(root.root, Path.join(changeDir, "progress.md"));
      const recovery = args.retry ? await inspectTaskAdmissionHistory(taskStateCheckpointGit(this.runtime), root.root, progressRelative, args.task as number, Path.basename(changeDir), root.head) : undefined;
      const preserving = recovery?.kind === "verified" && recovery.admission.worktree === lane.root && recovery.admission.gitDirectory === lane.gitDirectory && recovery.admission.lane === lane.ref && recovery.admission.commonDirectory === lane.commonDirectory;
      const invalid = await this.workspaceProblems(root, lane, args.expectedHead, args.targetBranch, preserving);
      if (invalid) return failure(invalid);
      const coordinator = this.runtime.worker();
      if (!coordinator?.trim() || coordinator !== coordinator.trim()) return failure("An independently observed coordinator session identity is required");
      const lockPath = Path.join(root.commonDirectory, "kepler-task-state.lock");
      let release: () => Promise<void>;
      try { release = await this.runtime.files.lock(lockPath); } catch { return failure("Task-state coordinator is already active; existing lock preserved"); }
      try {
        const current = await this.runtime.git.workspace(root.root);
        const currentLane = await this.runtime.git.workspace(lane.root);
        const currentProblem = await this.workspaceProblems(current, currentLane, args.expectedHead, args.targetBranch, preserving);
        if (currentProblem || current.ref !== root.ref || currentLane.ref !== lane.ref) return failure(currentProblem ?? "Workspace identity changed after coordinator lock");
        const result = await new ContextService(this.runtime.context).execute({ changeDir });
        const change = result.changes.find((entry) => entry.path === changeDir);
        const task = change?.planContractData?.tasks.find((entry) => entry.id === args.task);
        if (result.exitCode !== 0 || change?.execution?.version !== 2 || !task || (!change.readiness?.ready.includes(task.id) && !(args.retry && change.taskInputs?.find((input) => input.task === task.id)?.status === "current" && task.dependsOn.every((dependency) => change.readiness?.fullyGated.includes(dependency)) && (preserving && (await this.readRoot(changeDir, task.id)).entry.status === "in-progress" || await this.correctionEligible(current, changeDir, task.id, change.name))))) return failure("Task is not currently ready under a verified dependency-mode plan");
        if (task.recordedInputContext?.repository !== root.root) return failure("Task inputs belong to a different coordinator repository");
        const progressPath = Path.join(changeDir, "progress.md");
        const repoProgress = Path.relative(root.root, progressPath);
        const prior = await inspectTaskAdmissionHistory(taskStateCheckpointGit(this.runtime), root.root, repoProgress, task.id, change.name, current.head);
        if (prior.kind === "unverified") return failure(prior.reason);
        if (args.retry ? prior.kind !== "verified" : prior.kind !== "absent") return failure(args.retry ? "Retry requires existing verified admission authority" : "Task already has admission history; original Base cannot be reset");
        const source = await this.runtime.files.readFile(progressPath);
        const artifact = await createArtifactReader({ readFile: () => source })(progressPath);
        const contract = validateArtifact(artifact);
        if (contract._tag !== "valid" || contract.artifact !== "progress" || !Array.isArray(contract.metadata.tasks)) return failure("Root ledger is malformed");
        const entry = contract.metadata.tasks.find((candidate: unknown) => typeof candidate === "object" && candidate !== null && (candidate as Record<string, unknown>).id === task.id) as Record<string, unknown> | undefined;
        if (!entry || !(args.retry ? ["in-progress", "blocked", "done"] : ["pending", "blocked"]).includes(String(entry.status)) || (!args.retry && Object.hasOwn(entry, "admission"))) return failure("Root task state is no longer eligible");
        const planPath = Path.join(changeDir, "plan.md");
        const planSource = await this.runtime.files.readFile(planPath);
        for (const sibling of contract.metadata.tasks) {
          if (typeof sibling !== "object" || sibling === null) continue;
          const record = sibling as Record<string, unknown>;
          const parsed = validateTaskAdmission(record.admission);
          if (record.id !== task.id && record.status === "in-progress" && parsed.kind === "valid" && (parsed.admission.worktree === currentLane.root || parsed.admission.gitDirectory === currentLane.gitDirectory || parsed.admission.lane === currentLane.ref)) return failure("Worker lane is already bound to an active sibling");
        }
        for (const input of task.recordedInputContext?.inputs ?? []) {
          const committed = await this.runtime.context.git.headBlob(currentLane.root, input.path);
          const working = await this.runtime.context.git.worktreeBlob(currentLane.root, input.path);
          const staged = await this.runtime.context.git.stagedDiff(currentLane.root, input.path);
          if (committed.status !== 0 || working.status !== 0 || staged.status !== 0 || committed.stdout.trim() !== input.blob || working.stdout.trim() !== input.blob) return failure("Worker selected inputs are dirty or changed");
        }
        if (args.retry) {
          const read = await createArtifactReader({ readFile: () => planSource })(planPath);
          const plan = validateArtifact(read);
          const evidence = contextEvidenceRuntime(this.runtime.context);
          if (plan._tag !== "valid" || !evidence || change.executionTransitionStanding?.status !== "verified" || !["tactical", "approved-reference"].includes(change.intentStanding ?? "")) return failure("Recovery plan or intent is unverified");
          const intent = await inspectIntentApprovals(evidence, current.root, changeDir, plan);
          const scaffold = await inspectInitialScaffold(evidence, current.root, changeDir, plan, current.head, false);
          if (intent.problems.length > 0 || scaffold.length > 0) return failure("Recovery initialization or approved inputs are unverified");
        }
        const planCommit = await this.runtime.git.latest(root.root, Path.relative(root.root, planPath));
        if (!fullCommit(planCommit)) return failure("Plan revision is unresolved");
        const prerequisites: TaskAdmission["prerequisites"][number][] = [];
        for (const dependency of task.dependsOn) {
          if (!change.readiness?.fullyGated.includes(dependency)) return failure("A prerequisite approval is no longer usable");
          const feedbackCommit = await this.runtime.git.latest(root.root, Path.relative(root.root, Path.join(changeDir, "tasks", `task-${dependency}`, "feedback.md")));
          if (!fullCommit(feedbackCommit) || !(await this.runtime.git.ancestor(root.root, feedbackCommit, root.head))) return failure("Prerequisite approval is unresolved");
          prerequisites.push({ task: dependency, feedbackCommit });
        }
        const admission: TaskAdmission = { version: 1, base: prior.kind === "verified" ? prior.original.base : current.head, sourceHead: current.head, planCommit, planDigest: digest(planSource), taskDefinition: task.taskDefinitionDigest, worker: args.worker, lane: currentLane.ref, worktree: currentLane.root, gitDirectory: currentLane.gitDirectory, repository: current.root, commonDirectory: current.commonDirectory, coordinator, source: current.ref, target: args.targetBranch, prerequisites };
        const validAdmission = prior.kind === "verified" ? validateTaskAdmissionHistory([prior.admission, admission]) : validateTaskAdmission(admission);
        if (validAdmission.kind !== "valid") return failure(validAdmission.reason, 2);
        const next = updateTaskLedger(source, task.id, "in-progress", { admission });
        const nextRead = await createArtifactReader({ readFile: () => next })(progressPath);
        if (validateArtifact(nextRead)._tag !== "valid") return failure("Admission would invalidate the root ledger");
        const beforeWrite = await this.runtime.git.workspace(root.root);
        if (beforeWrite.head !== current.head || !(await this.runtime.git.clean(root.root)) || (!preserving && !(await this.runtime.git.clean(lane.root)))) return failure("Workspace changed before admission publication");
        await this.runtime.files.writeFile(progressPath, next);
        const commit = await this.runtime.git.commit(root.root, repoProgress, `kepler: admit task ${task.id}`);
        const advanced = await this.runtime.git.ancestor(root.root, currentLane.head, commit)
          ? await this.runtime.git.fastForward(lane.root, commit)
          : await this.runtime.git.merge(lane.root, commit);
        if (advanced.status !== 0) return failure(`Admission ${commit} is durable but lane synchronization failed: ${advanced.stderr.trim()}`);
        return { operation: "admit", status: "admitted", stdout: `Task ${task.id} admitted\nBase: ${admission.base}\nAdmission: ${commit}\n`, stderr: "", exitCode: 0 };
      } finally { await release(); }
    } catch (error) { return failure(error instanceof Error ? error.message : String(error)); }
  }

  private async reserve(args: TaskStateArguments): Promise<TaskStateResult> {
    const reject = (message: string, code: 1 | 2 = 1) => failure(message, code, "reserve");
    if (!Number.isSafeInteger(args.task) || (args.task ?? 0) < 1 || !args.changeDir || !fullCommit(args.expectedHead) || !args.reservation) return reject("--reserve requires --task, --change-dir, --expected-head, and --reservation", 2);
    try {
      const root = await this.runtime.git.workspace(this.runtime.cwd());
      if (root.head !== args.expectedHead) return reject("Expected HEAD is stale");
      const changeDir = await this.runtime.files.realpath(Path.resolve(this.runtime.cwd(), args.changeDir));
      if (!within(root.root, changeDir)) return reject("Change directory belongs to a foreign repository");
      const progress = await this.readRoot(changeDir, args.task as number);
      const parsed = Object.hasOwn(progress.entry, "admission") ? validateTaskAdmission(progress.entry.admission) : undefined;
      if (parsed && parsed.kind !== "valid") return reject(parsed.reason);
      const owner = parsed?.kind === "valid" ? await this.runtime.git.workspace(parsed.admission.repository) : root;
      const release = await this.runtime.files.lock(Path.join(owner.commonDirectory, "kepler-task-state.lock"));
      try {
        const current = await this.runtime.git.workspace(root.root);
        if (current.head !== args.expectedHead) return reject("Expected HEAD changed after lock");
        if (!this.runtime.worker()?.trim()) return reject("Observed actor identity is unavailable");
        const checkpointGit = taskStateCheckpointGit(this.runtime);
        let originalBase: string | undefined;
        if (parsed?.kind === "valid") {
          const history = await inspectTaskAdmissionHistory(checkpointGit, owner.root, Path.relative(root.root, Path.join(changeDir, "progress.md")), args.task as number, progress.contract.metadata.change as string, owner.head);
          if (history.kind !== "verified") return reject(history.kind === "unverified" ? history.reason : "Admission authority is absent");
          const admission = history.admission;
          if (admission.worker !== this.runtime.worker() || admission.worktree !== current.root || admission.gitDirectory !== current.gitDirectory || admission.lane !== current.ref || admission.commonDirectory !== current.commonDirectory || owner.ref !== admission.source || owner.commonDirectory !== current.commonDirectory) return reject("Reservation actor/worktree does not match current admission");
          const ownerLedger = await this.readRoot(Path.join(owner.root, Path.relative(root.root, changeDir)), args.task as number);
          if (ownerLedger.entry.status !== "in-progress" || !(await this.runtime.git.clean(owner.root))) return reject("Coordinator state is not active and clean");
          originalBase = history.original.base;
        } else {
          if (!(await this.runtime.git.clean(root.root)) || !args.targetBranch || root.ref === args.targetBranch || !(await this.runtime.git.validateRef(root.root, args.targetBranch))) return reject("Pre-admission reservation requires a clean isolated coordinator and explicit target");
          const context = await new ContextService(this.runtime.context).execute({ changeDir });
          const change = context.changes.find((entry) => entry.path === changeDir);
          if (context.exitCode !== 0 || !change?.readiness?.ready.includes(args.task as number) || change.planContractData?.tasks.find((entry) => entry.id === args.task)?.recordedInputContext?.repository !== root.root) return reject("Task is not eligible for an owner seed reservation");
        }
        const taskPath = Path.join(changeDir, "tasks", `task-${args.task}`, "progress.md");
        const repoPath = Path.relative(root.root, taskPath);
        const source = await this.runtime.files.readFile(taskPath);
        const committed = await this.runtime.git.blob(root.root, current.head, repoPath);
        if (committed.status !== 0 || committed.stdout !== source) return reject("Task-local reservation metadata must be committed exactly before mutation");
        const read = await createArtifactReader({ readFile: () => source })(taskPath);
        const contract = validateArtifact(read);
        if (contract._tag !== "valid" || contract.artifact !== "task-progress" || contract.metadata.task !== args.task || contract.metadata.change !== progress.contract.metadata.change) return reject("Task-local identity or history is malformed");
        const entries = contract.body.workflow.scopeExpansions ?? [];
        const history = await inspectScopeExpansionHistory(checkpointGit, root.root, repoPath, args.task as number, progress.contract.metadata.change as string, current.head, entries, originalBase);
        if (history.kind === "unverified") return reject(history.reason);
        const payload: unknown = JSON.parse(args.reservation);
        const expanded = validateScopeExpansions([...entries, payload]);
        if (expanded.kind !== "valid") return reject(expanded.reason);
        const nextEntry = expanded.entries.at(-1);
        if (!nextEntry) return reject("Reservation is empty", 2);
        const lastAttempt = contract.body.workflow.records.filter((entry) => entry.kind === "attempt").at(-1);
        if (nextEntry.attempt !== (lastAttempt?.number ?? 0) + 1) return reject("Reservation does not bind the next attempt");
        if (!checkpointGit.pathChanges || !this.runtime.context.git.blobIdAt || !this.runtime.context.git.worktreeBlob) return reject("Reservation before-edit evidence ports are unavailable");
        const taskHistory = await checkpointGit.pathHistory(root.root, repoPath);
        const first = taskHistory.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        const base = originalBase ?? first;
        if (!fullCommit(base)) return reject("Reservation material baseline is unavailable");
        const earlier = await checkpointGit.pathChanges(root.root, base, current.head, nextEntry.paths);
        if (earlier.status !== 0 || earlier.stdout.trim() !== "") return reject("Reserved production paths were already edited after original Base");
        for (const path of nextEntry.paths) {
          const atHead = await this.runtime.context.git.blobIdAt(root.root, current.head, path);
          const working = await this.runtime.context.git.worktreeBlob(root.root, path);
          if ((atHead.status === 0) !== (working.status === 0) || (atHead.status === 0 && atHead.stdout.trim() !== working.stdout.trim())) return reject("Reserved production paths have uncommitted edits");
        }
        const frontmatter = parseMarkdownFrontmatter(source);
        if (frontmatter.kind !== "present") return reject("Task front matter is malformed");
        const document = parseDocument(frontmatter.value);
        document.set("scope_expansions", expanded.entries);
        const next = `---\n${document.toString()}---\n${frontmatter.body}`;
        const nextRead = await createArtifactReader({ readFile: () => next })(taskPath);
        if (validateArtifact(nextRead)._tag !== "valid") return reject("Reservation would invalidate the task artifact");
        if ((await this.runtime.git.workspace(root.root)).head !== current.head) return reject("Task HEAD changed before reservation");
        await this.runtime.files.writeFile(taskPath, next);
        const commit = await this.runtime.git.commit(root.root, repoPath, `kepler: reserve prerequisite ${nextEntry.id} for task ${args.task}`);
        return { operation: "reserve", status: "reserved", stdout: `Reservation ${nextEntry.id} committed: ${commit}\n`, stderr: "", exitCode: 0 };
      } finally { await release(); }
    } catch (error) { return reject(error instanceof Error ? error.message : String(error)); }
  }

  private async publish(args: TaskStateArguments): Promise<TaskStateResult> {
    const reject = (message: string, code: 1 | 2 = 1) => failure(message, code, "publish");
    if (!Number.isSafeInteger(args.task) || (args.task ?? 0) < 1 || !args.changeDir || !fullCommit(args.expectedHead) || !fullCommit(args.taskHead)) return reject("--publish requires --task, --change-dir, --expected-head, and --task-head", 2);
    try {
      const root = await this.runtime.git.workspace(this.runtime.cwd());
      if (root.head !== args.expectedHead || !(await this.runtime.git.clean(root.root))) return reject("Coordinator HEAD is stale or dirty");
      const changeDir = await this.runtime.files.realpath(Path.resolve(this.runtime.cwd(), args.changeDir));
      if (!within(root.root, changeDir)) return reject("Change directory belongs to a foreign repository");
      const release = await this.runtime.files.lock(Path.join(root.commonDirectory, "kepler-task-state.lock"));
      try {
        const current = await this.runtime.git.workspace(root.root);
        if (current.head !== args.expectedHead || current.ref !== root.ref || !(await this.runtime.git.clean(root.root))) return reject("Coordinator changed after lock");
        const progress = await this.readRoot(changeDir, args.task as number);
        const history = await inspectTaskAdmissionHistory(taskStateCheckpointGit(this.runtime), root.root, Path.relative(root.root, Path.join(changeDir, "progress.md")), args.task as number, progress.contract.metadata.change as string, current.head);
        if (history.kind !== "verified") return reject(history.kind === "unverified" ? history.reason : "Admission authority is absent");
        const admission = history.admission;
        if (admission.repository !== current.root || admission.commonDirectory !== current.commonDirectory || admission.source !== current.ref || admission.coordinator !== this.runtime.worker() || progress.entry.status !== "in-progress") return reject("Only the bound active coordinator may publish this task");
        const lane = await this.runtime.git.workspace(admission.worktree);
        if (lane.head !== args.taskHead || lane.ref !== admission.lane || lane.gitDirectory !== admission.gitDirectory || lane.commonDirectory !== admission.commonDirectory || lane.root !== admission.worktree) return reject("Worker HEAD or lane identity is stale");
        const planPath = Path.join(changeDir, "plan.md");
        const planSource = await this.runtime.files.readFile(planPath);
        const planRead = await createArtifactReader({ readFile: () => planSource })(planPath);
        const plan = validateArtifact(planRead);
        const task = plan._tag === "valid" ? plan.body.workflow.plan?.tasks.find((entry) => entry.id === args.task) : undefined;
        if (!task || task.definitionDigest !== admission.taskDefinition || digest(planSource) !== admission.planDigest || !task.verify) return reject("Publication task/plan binding is stale");
        const relativeChange = Path.relative(root.root, changeDir);
        const lanePlanPath = Path.join(lane.root, relativeChange, "plan.md");
        const lanePlan = await this.runtime.files.readFile(lanePlanPath);
        if (lanePlan !== planSource) return reject("Worker used a stale or modified plan");
        for (const input of task.inputContext?.inputs ?? []) {
          const committedInput = await this.runtime.context.git.headBlob(lane.root, input.path);
          const workingInput = await this.runtime.context.git.worktreeBlob(lane.root, input.path);
          const stagedInput = await this.runtime.context.git.stagedDiff(lane.root, input.path);
          if (committedInput.status !== 0 || committedInput.stdout.trim() !== input.blob || workingInput.status !== 0 || workingInput.stdout.trim() !== input.blob || stagedInput.status !== 0) return reject("Worker selected inputs are dirty or changed");
        }
        for (const prerequisite of admission.prerequisites) {
          const approval = await this.runtime.git.latest(root.root, `${relativeChange}/tasks/task-${prerequisite.task}/feedback.md`);
          if (approval !== prerequisite.feedbackCommit) return reject("Bound prerequisite approval changed since admission");
        }
        const context = await new ContextService(this.runtime.context).execute({ changeDir });
        const standing = context.changes.find((entry) => entry.path === changeDir);
        if (context.exitCode !== 0 || standing?.taskInputs?.find((entry) => entry.task === task.id)?.status !== "current" || task.dependsOn.some((dependency) => !standing.readiness?.fullyGated.includes(dependency))) return reject("Current task inputs or prerequisite approvals are unusable");
        const repoTask = `${relativeChange}/tasks/task-${args.task}/progress.md`;
        const taskPath = Path.join(lane.root, repoTask);
        const taskSource = await this.runtime.files.readFile(taskPath);
        const committed = await this.runtime.git.blob(root.root, lane.head, repoTask);
        if (committed.status !== 0 || committed.stdout !== taskSource) return reject("Worker terminal artifact is not committed exactly");
        const taskRead = await createArtifactReader({ readFile: () => taskSource })(taskPath);
        const terminal = validateArtifact(taskRead);
        const last = terminal._tag === "valid" ? terminal.body.workflow.records.filter((record) => record.kind === "attempt").at(-1) : undefined;
        const outcome = last?.fields.Outcome;
        if (terminal._tag !== "valid" || terminal.artifact !== "task-progress" || terminal.metadata.task !== args.task || terminal.metadata.change !== progress.contract.metadata.change || (outcome !== "done" && outcome !== "blocked") || terminal.metadata.status !== outcome) return reject("Worker terminal outcome is incomplete or contradictory");
        const admittedProgress = await this.runtime.git.blob(root.root, admission.sourceHead, repoTask);
        const oldBody = admittedProgress.status === 0 ? bodyAfterFrontmatter(admittedProgress.stdout).trimEnd() : undefined;
        const newBody = bodyAfterFrontmatter(taskSource);
        if (oldBody === undefined || !newBody.startsWith(oldBody)) return reject("Worker rewrote admitted task evidence instead of appending");
        if ((args.response === "done" || args.response === "blocked") && args.response !== outcome) return reject("Worker response contradicts committed outcome");
        const terminalCommit = await this.runtime.git.latest(lane.root, repoTask);
        if (!fullCommit(terminalCommit) || terminalCommit === history.commit || !(await this.runtime.git.ancestor(root.root, history.commit, terminalCommit))) return reject("Terminal outcome predates current admission");
        const checkpointGit = taskStateCheckpointGit(this.runtime);
        const scopeHistory = await inspectScopeExpansionHistory(checkpointGit, lane.root, repoTask, task.id, progress.contract.metadata.change as string, lane.head, terminal.body.workflow.scopeExpansions, history.original.base);
        if (scopeHistory.kind === "unverified") return reject(scopeHistory.reason);
        for (const commit of await this.runtime.git.uniqueCommits(root.root, lane.head, current.head)) {
          const paths = await this.runtime.git.changedPaths(root.root, commit);
          if (paths.some((path) => path.startsWith(`${relativeChange}/`) && path !== repoTask)) return reject("Worker edited coordinator, reviewer, plan, or sibling artifacts");
          if (outcome === "blocked" && paths.some((path) => path !== repoTask)) return reject("Blocked work committed partial production; state preserved");
        }
        if (outcome === "done" && !(await this.runtime.git.clean(lane.root))) return reject("Completed worker has uncommitted material work");
        const verify = task.verify.replace(/^`([\s\S]+)`$/, "$1");
        if (outcome === "done" && args.verify !== verify) return reject("Publication must execute the exact task Verify command", 2);
        if (!(await this.runtime.git.ancestor(root.root, lane.head, current.head))) {
          const integrated = await this.runtime.git.merge(root.root, lane.head);
          if (integrated.status !== 0) return reject(`Integration failed; conflict and original work preserved: ${integrated.stderr.trim()}`);
        }
        const integrated = await this.runtime.git.workspace(root.root);
        if (!(await this.runtime.git.ancestor(root.root, lane.head, integrated.head))) return reject("Original implementation ancestry was not retained");
        let verification: TaskPublication["verification"] = null;
        if (outcome === "done") {
          const verified = await this.runtime.process.run("sh", ["-lc", verify], root.root);
          if (verified.status !== 0) return reject(`Integrated Verify failed; root implementation remains in-progress. Integration: ${integrated.head}\n${verified.stdout.trim()}\n${verified.stderr.trim()}`);
          verification = { command: verify, exitCode: 0 };
        }
        if ((await this.runtime.git.workspace(root.root)).head !== integrated.head || !(await this.runtime.git.clean(root.root))) return reject("Verification changed integrated source; root implementation remains in-progress");
        const finalLane = await this.runtime.git.workspace(lane.root);
        if (finalLane.head !== lane.head || finalLane.ref !== lane.ref || finalLane.gitDirectory !== lane.gitDirectory || finalLane.commonDirectory !== lane.commonDirectory) return reject("Worker identity or HEAD changed during integrated verification");
        const publication: TaskPublication = { version: 1, taskHead: lane.head, integratedHead: integrated.head, outcome, verification };
        const source = await this.runtime.files.readFile(Path.join(changeDir, "progress.md"));
        const next = updateTaskLedger(source, task.id, outcome, { publication });
        const nextRead = await createArtifactReader({ readFile: () => next })(Path.join(changeDir, "progress.md"));
        if (validateArtifact(nextRead)._tag !== "valid") return reject("Publication would invalidate the root ledger");
        await this.runtime.files.writeFile(Path.join(changeDir, "progress.md"), next);
        const commit = await this.runtime.git.commit(root.root, `${relativeChange}/progress.md`, `kepler: publish task ${task.id} ${outcome}`);
        return { operation: "publish", status: "published", stdout: `Task ${task.id} implementation ${outcome}\nIntegration: ${integrated.head}\nPublication: ${commit}\nFeedback clearance is separate.\n`, stderr: "", exitCode: 0 };
      } finally { await release(); }
    } catch (error) { return reject(error instanceof Error ? error.message : String(error)); }
  }

  private async correctionEligible(root: TaskWorkspace, changeDir: string, task: number, change: string): Promise<boolean> {
    const path = Path.join(changeDir, "tasks", `task-${task}`, "feedback.md");
    if (!(await this.runtime.context.fileSystem.pathExists(path))) return false;
    const source = await this.runtime.files.readFile(path);
    const artifact = await createArtifactReader({ readFile: () => source })(path);
    const contract = validateArtifact(artifact);
    if (artifact._tag !== "recognized" || contract._tag !== "valid" || contract.artifact !== "feedback" || contract.metadata.task !== task || contract.metadata.change !== change) return false;
    const parsed = parseReviewPasses(artifact);
    const pass = parsed.latest;
    if (parsed.diagnostics.length > 0 || !pass || pass.verdict !== "changes-requested") return false;
    const commit = await this.runtime.git.latest(root.root, Path.relative(root.root, path));
    if (!fullCommit(commit) || !(await this.runtime.git.ancestor(root.root, pass.head, commit)) || !(await this.runtime.git.ancestor(root.root, commit, root.head))) return false;
    const blob = await this.runtime.git.blob(root.root, commit, Path.relative(root.root, path));
    const files = await this.runtime.git.changedPaths(root.root, commit);
    if (blob.status !== 0 || blob.stdout !== source || files.length !== 1 || files[0] !== Path.relative(root.root, path)) return false;
    const checkpoint = await resolveTaskCheckpoint(taskStateCheckpointGit(this.runtime), root.root, Path.relative(root.root, Path.join(changeDir, "tasks", `task-${task}`, "progress.md")), task, change, root.head, parsed.passes.flatMap((entry) => entry.provenance === "structural" ? [] : [{ base: entry.base, head: entry.head }]));
    return checkpoint.kind === "verified" && checkpoint.base === pass.base;
  }

  private async readRoot(changeDir: string, task: number) {
    const path = Path.join(changeDir, "progress.md");
    const source = await this.runtime.files.readFile(path);
    const read = await createArtifactReader({ readFile: () => source })(path);
    const contract = validateArtifact(read);
    if (contract._tag !== "valid" || contract.artifact !== "progress" || !Array.isArray(contract.metadata.tasks)) throw new Error("Root ledger is malformed");
    const entry = contract.metadata.tasks.find((candidate: unknown) => typeof candidate === "object" && candidate !== null && (candidate as Record<string, unknown>).id === task) as Record<string, unknown> | undefined;
    if (!entry) throw new Error("Root task identity is missing");
    return { source, contract, entry };
  }

  private async workspaceProblems(root: TaskWorkspace, lane: TaskWorkspace, expectedHead: string, target: string, preserving = false): Promise<string | undefined> {
    if (root.head !== expectedHead) return "Expected HEAD is stale";
    if (!(await this.runtime.git.clean(root.root)) || (!preserving && !(await this.runtime.git.clean(lane.root)))) return "Source or lane has uncommitted work; state preserved";
    if (root.root === lane.root || root.gitDirectory === lane.gitDirectory || root.commonDirectory !== lane.commonDirectory) return "Worker lane must be an isolated linked worktree of this repository";
    if (root.ref === lane.ref || root.ref === target || lane.ref === target) return "Source, worker lane and target refs must differ";
    for (const ref of [root.ref, lane.ref, target]) if (!(await this.runtime.git.validateRef(root.root, ref))) return "Branch reference is unsafe";
    if (!fullCommit(await this.runtime.git.resolve(root.root, target))) return "Target branch is unresolved";
    if (!preserving && !(await this.runtime.git.ancestor(root.root, lane.head, root.head))) return "Worker lane contains unrelated committed work; state preserved";
    return undefined;
  }
}
