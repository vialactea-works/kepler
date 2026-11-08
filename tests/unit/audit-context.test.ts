import { describe, expect, it } from "vitest";
import { AuditContextResolver, type AuditContextRuntime, type AuditHistoryReadResult } from "../../packages/cli/src/audit/context.js";
import type { ConstructionHistoryFact } from "../../packages/cli/src/construction/projection.js";
import type { ScopeSelectors } from "../../packages/cli/src/cli/scope-selectors.js";
import type { EventJournal } from "../../packages/cli/src/history/journal.js";
import type { ProjectResolver } from "../../packages/cli/src/cli/project-selection.js";

const unitId = "10000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000002";
const priorAttemptId = "30000000-0000-4000-8000-000000000003";
const currentAttemptId = "40000000-0000-4000-8000-000000000004";
const stageStartId = "50000000-0000-4000-8000-000000000005";

const historyFact = (id: string, type: string, data: Readonly<Record<string, unknown>>): ConstructionHistoryFact => ({
  event: { id, type, data },
} as unknown as ConstructionHistoryFact);

const stageStart = historyFact(stageStartId, "construction.stage-attempt-started", {
  stage: "implementation",
  stage_attempt_id: currentAttemptId,
});

const admission = (attemptId: string): ConstructionHistoryFact => historyFact(
  `60000000-0000-4000-8000-${attemptId.slice(-12)}`,
  "construction.task-admitted",
  { stage_attempt_id: attemptId },
);

const loadedUnit = (options: {
  readonly admissions?: readonly ConstructionHistoryFact[];
  readonly parentState?: string;
  readonly currentAttemptId?: string;
  readonly attempts?: readonly { readonly attemptId: string; readonly state: string; readonly facts: readonly ConstructionHistoryFact[] }[];
} = {}): AuditHistoryReadResult => ({
  kind: "loaded",
  root: "/virtual",
  missionId: "70000000-0000-4000-8000-000000000007",
  history: {} as AuditHistoryReadResult extends { readonly history: infer H } ? H : never,
  projection: {} as AuditHistoryReadResult extends { readonly projection: infer P } ? P : never,
  unit: {
    unitId,
    initialized: true,
    blocked: false,
    tasks: [{ taskId, stageAttemptId: priorAttemptId, admissions: options.admissions ?? [], activities: [] }],
    stages: [{
      stage: "implementation",
      state: options.parentState ?? "running",
      currentAttemptId: options.currentAttemptId ?? currentAttemptId,
      attempts: options.attempts ?? [{ attemptId: currentAttemptId, state: "running", facts: [stageStart] }],
    }],
    interactions: [],
    evidence: [],
  },
} as unknown as AuditHistoryReadResult);

class StubAuditContextResolver extends AuditContextResolver {
  constructor(private readonly loaded: AuditHistoryReadResult, taskExists = true) {
    const runtime: AuditContextRuntime = {
      projects: {} as ProjectResolver,
      fileSystem: {} as AuditContextRuntime["fileSystem"],
      journals: { create: () => ({}) as EventJournal },
      identities: { next: () => "80000000-0000-4000-8000-000000000008" },
      taskExists: async () => taskExists,
    };
    super(runtime);
  }

  override async readUnit(_unitId: string, _project?: string): Promise<AuditHistoryReadResult> {
    return this.loaded;
  }
}

const selectors: ScopeSelectors = { unit: unitId, task: taskId, implementationAttempt: currentAttemptId };

const resolve = (loaded: AuditHistoryReadResult, taskExists = true, selected = selectors) =>
  new StubAuditContextResolver(loaded, taskExists).resolve(selected, undefined, "evidence", undefined, undefined, true);

describe("AuditContextResolver pre-admission task prerequisite scope", () => {
  it("allows fresh evidence after an earlier-attempt admission", async () => {
    const result = await resolve(loadedUnit({ admissions: [admission(priorAttemptId)] }));

    expect(result).toMatchObject({
      kind: "resolved",
      context: {
        scope: {
          stage: "implementation",
          stageAttemptId: currentAttemptId,
          taskId,
          causedBy: [stageStartId],
        },
      },
    });
  });

  it.each([
    ["current-attempt admission", loadedUnit({ admissions: [admission(currentAttemptId)] }), true, selectors],
    ["paused parent", loadedUnit({ parentState: "paused", admissions: [admission(priorAttemptId)] }), true, selectors],
    ["noncurrent parent attempt", loadedUnit({ admissions: [admission(priorAttemptId)] }), true, { ...selectors, implementationAttempt: priorAttemptId }],
    ["wrong parent stage", loadedUnit({ admissions: [admission(priorAttemptId)] }), true, { ...selectors, stage: "functional-design" }],
    ["missing graph task", loadedUnit({ admissions: [admission(priorAttemptId)] }), false, selectors],
    ["Activity scope", loadedUnit({ admissions: [admission(priorAttemptId)] }), true, { ...selectors, activity: "code-generation", attempt: "90000000-0000-4000-8000-000000000009" }],
  ] as const)("rejects %s without weakening the pre-admission boundary", async (_name, loaded, taskExists, selected) => {
    expect(await resolve(loaded, taskExists, selected)).toMatchObject({ kind: "failed", code: "invalid_audit_scope" });
  });
});
