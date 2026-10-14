import type { PlanExecutionContract, PlanTaskContract } from "./artifact-types.js";

export type TaskReadinessStatus = "pending" | "blocked" | "in-progress" | "done";

export interface TaskReadinessEvidence {
  readonly task: number;
  readonly status: TaskReadinessStatus;
  readonly currentInputs: boolean;
  readonly checkpoint: boolean;
  readonly history: boolean;
  readonly implementation: {
    readonly committed: boolean;
    readonly done: boolean;
    readonly consistent: boolean;
    readonly baseHead: boolean;
    readonly reachable: boolean;
  };
  readonly feedback: {
    readonly physicallyLast: boolean;
    readonly approved: boolean;
    readonly fresh: boolean;
    readonly durable: boolean;
    readonly independent: boolean;
    readonly noBlockers: boolean;
    readonly baseHead: boolean;
    readonly reachable: boolean;
  };
  readonly response?: "done" | "blocked" | "interrupted";
}

export interface TaskReadinessInput {
  readonly execution?: PlanExecutionContract;
  readonly tasks: readonly PlanTaskContract[];
  readonly evidence: readonly TaskReadinessEvidence[];
}

export interface TaskReadinessHold {
  readonly task: number;
  readonly dependencies: readonly number[];
  readonly reasons: readonly string[];
}

export interface TaskReadinessProjection {
  readonly version: 1;
  readonly ready: readonly number[];
  readonly fullyGated: readonly number[];
  readonly held: readonly TaskReadinessHold[];
}

const implementationReasons = (evidence: TaskReadinessEvidence): string[] => {
  const reasons: string[] = [];
  if (evidence.status !== "done") reasons.push("root implementation status is not done");
  if (!evidence.currentInputs) reasons.push("current inputs are unverified");
  if (!evidence.checkpoint) reasons.push("checkpoint is unverified");
  if (!evidence.history) reasons.push("history is unverified");
  if (!evidence.implementation.committed) reasons.push("implementation is not committed");
  if (!evidence.implementation.done) reasons.push("implementation is not done");
  if (!evidence.implementation.consistent) reasons.push("implementation evidence is inconsistent");
  if (!evidence.implementation.baseHead) reasons.push("implementation Base/Head is invalid");
  if (!evidence.implementation.reachable) reasons.push("implementation evidence is unreachable");
  return reasons;
};

const feedbackReasons = (evidence: TaskReadinessEvidence): string[] => {
  const reasons: string[] = [];
  if (!evidence.feedback.physicallyLast) reasons.push("feedback is not physically last");
  if (!evidence.feedback.approved) reasons.push("feedback is not approved");
  if (!evidence.feedback.fresh) reasons.push("feedback is stale");
  if (!evidence.feedback.durable) reasons.push("feedback is not durable");
  if (!evidence.feedback.independent) reasons.push("feedback is not independent");
  if (!evidence.feedback.noBlockers) reasons.push("feedback has blockers");
  if (!evidence.feedback.baseHead) reasons.push("feedback Base/Head is invalid");
  if (!evidence.feedback.reachable) reasons.push("feedback evidence is unreachable");
  return reasons;
};

const responseReasons = (evidence: TaskReadinessEvidence): string[] =>
  evidence.response === "blocked" && evidence.implementation.done
    ? ["response contradicts implementation evidence"]
    : evidence.response === "done" && !evidence.implementation.done
      ? ["response contradicts implementation evidence"]
      : [];

const fullyGatedReasons = (evidence: TaskReadinessEvidence): string[] => [
  ...implementationReasons(evidence),
  ...feedbackReasons(evidence),
  ...responseReasons(evidence),
];

const admissionReasons = (evidence: TaskReadinessEvidence): string[] => [
  ...(!evidence.currentInputs ? ["current inputs are unverified"] : []),
  ...(!evidence.checkpoint ? ["checkpoint is unverified"] : []),
  ...(!evidence.history ? ["history is unverified"] : []),
  ...(evidence.status !== "done" && evidence.implementation.done ? ["root status contradicts implementation evidence"] : []),
  ...(evidence.feedback.approved && !evidence.implementation.done ? ["feedback approval contradicts implementation evidence"] : []),
  ...responseReasons(evidence),
];

export const projectTaskReadiness = (input: TaskReadinessInput): TaskReadinessProjection => {
  if (input.execution?.version !== 2 || input.execution.mode !== "dependencies")
    return { version: 1, ready: [], fullyGated: [], held: input.tasks.map((task) => ({ task: task.id, dependencies: [...task.dependsOn], reasons: ["dependency execution is not selected"] })) };
  const evidenceByTask = new Map(input.evidence.map((evidence) => [evidence.task, evidence]));
  const fullyGated = new Set<number>();
  for (const task of input.tasks) {
    const evidence = evidenceByTask.get(task.id);
    if (evidence && fullyGatedReasons(evidence).length === 0) fullyGated.add(task.id);
  }

  let removed: boolean;
  do {
    removed = false;
    for (const task of input.tasks)
      if (fullyGated.has(task.id) && task.dependsOn.some((dependency) => !fullyGated.has(dependency))) {
        fullyGated.delete(task.id);
        removed = true;
      }
  } while (removed);
  const ready: number[] = [];
  const held: TaskReadinessHold[] = [];
  for (const task of input.tasks) {
    const evidence = evidenceByTask.get(task.id);
    const dependencies = [...task.dependsOn];
    if (!evidence) {
      held.push({ task: task.id, dependencies, reasons: ["authoritative evidence is missing"] });
      continue;
    }
    if (fullyGated.has(task.id)) continue;
    const reasons = admissionReasons(evidence);
    if (evidence.status === "in-progress" || evidence.status === "done")
      reasons.push("task is already admitted or implementation-complete", ...fullyGatedReasons(evidence));
    const unclearedDependencies = dependencies.filter((dependency) => !fullyGated.has(dependency));
    if (unclearedDependencies.length > 0)
      reasons.push(`dependencies are not fully gated: ${unclearedDependencies.join(", ")}`);
    if (reasons.length === 0 && (evidence.status === "pending" || evidence.status === "blocked"))
      ready.push(task.id);
    else held.push({ task: task.id, dependencies, reasons });
  }
  return { version: 1, ready, fullyGated: input.tasks.map((task) => task.id).filter((task) => fullyGated.has(task)), held };
};
