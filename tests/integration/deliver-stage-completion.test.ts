import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AuditContextResolver, AuditHistoryReadResult } from "../../packages/cli/src/audit/context.js";
import { CONSTRUCTION_PHASE, CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION, validateConstructionEvent, type ConstructionEventRecord, type StageAttemptId } from "../../packages/cli/src/construction/events.js";
import { DeliverStageCompletion, createNodeDeliverStageCompletionRuntime } from "../../packages/cli/src/construction/deliver-stage-completion.js";
import { missionWorkspaceKey } from "../../packages/cli/src/construction/mission-workspace.js";
import type { ScopeSelectors } from "../../packages/cli/src/cli/scope-selectors.js";
import type { ConstructionHistoryFact, ConstructionStageProjection } from "../../packages/cli/src/construction/projection.js";

const temporaryRoots: string[] = [];
const repositoryId = "repo-main";

const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, {
  cwd,
  encoding: "utf8",
  env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_COUNT: "0" },
}).trim();

const createEvent = (
  type: string,
  data: Record<string, unknown>,
  causedBy: readonly string[] = [],
  eventVersion = 1,
): ConstructionEventRecord => {
  const candidate = {
    id: randomUUID(),
    phase: CONSTRUCTION_PHASE,
    type,
    envelope_version: 1,
    event_version: eventVersion,
    journal_id: randomUUID(),
    recorded_at: "2026-10-22T15:00:00.000Z",
    producer: { name: "kepler-test", version: "0.10.3" },
    caused_by: [...new Set(causedBy)],
    data,
  };
  const validation = validateConstructionEvent(candidate);
  if (validation.status !== "valid") throw new Error(`Invalid ${type} fixture: ${JSON.stringify(validation)}`);
  return validation.event;
};

const fact = (event: ConstructionEventRecord): ConstructionHistoryFact => ({
  sourceId: `fixture/${event.journal_id}`,
  journalId: event.journal_id,
  line: 1,
  byteOffset: 0,
  event,
});

const record = (event: ConstructionEventRecord) => ({
  sourceId: `fixture/${event.journal_id}`,
  journalId: event.journal_id,
  line: 1,
  byteOffset: 0,
  byteLength: JSON.stringify(event).length,
  terminated: true,
  raw: JSON.stringify(event),
  event,
  issues: [],
});

const deliverySource = (unitId: string, artifactId: string): string => `---
id: ${artifactId}
type: delivery-plan
schema_version: 3
unit_id: ${unitId}
author: Ada Lovelace <ada@example.com>
---
# Delivery plan: Reviewed capability

## Outcome and destination

Hand the reviewed repository to the requester with the selected source checkpoint and acceptance conditions identified.

## Operations and prerequisites

No external operation is required for a repository handoff. The requester receives the reviewed material and delivery references.

## Verification and recovery

Verify that the recipient can identify the reviewed repository checkpoint and retained evidence. Preserve the handoff references if delivery is interrupted.

## Decisions and open questions

The repository handoff is the agreed outcome. No consequential delivery choice remains open.
`;

interface DeliverFixture {
  readonly root: string;
  readonly missionId: string;
  readonly unitId: string;
  readonly attemptId: string;
  readonly startEventId: string;
  readonly selectors: ScopeSelectors;
  readonly reviewCompletionId: string;
  readonly reviewCheckpoint: readonly { readonly repository_id: string; readonly commit: string }[];
  readonly currentCheckpoint: readonly { readonly repository_id: string; readonly commit: string }[];
  readonly artifactBindings: readonly { readonly artifact_id: string; readonly content_version: string }[];
  readonly evidenceIds: Readonly<Record<string, string>>;
  readonly evidenceEvents: readonly ConstructionEventRecord[];
  readonly operationEvidenceId: string;
  readonly operationRequestEventId: string;
  readonly approvalEventId?: string;
  readonly service: DeliverStageCompletion;
  readonly historyDirectory: string;
  readonly cleanup: () => Promise<void>;
}

const createDeliverFixture = async (options: { readonly handoffIncludesVerification?: boolean; readonly withApproval?: boolean; readonly verificationFollowsOperation?: boolean } = {}): Promise<DeliverFixture> => {
  const parent = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-deliver-completion-"));
  temporaryRoots.push(parent);
  const root = Path.join(parent, "project");
  await Fs.mkdir(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Kepler Deliver test");
  git(root, "config", "user.email", "deliver-test@example.invalid");
  await Fs.mkdir(Path.join(root, ".kepler"));
  await Fs.writeFile(Path.join(root, ".kepler", "marker"), "v3\n", "utf8");
  await Fs.writeFile(Path.join(root, "README.md"), "Deliver integration fixture\n", "utf8");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "Initialize Deliver fixture");
  const reviewCommit = git(root, "rev-parse", "HEAD");
  const missionId = randomUUID();
  const unitId = "2026-10-22-deliver-fixture";
  const unitDirectory = `construction/units-of-work/${unitId}`;
  const persistedDirectory = `.kepler/missions/${missionId}/${unitDirectory}`;
  const unitRoot = Path.join(root, persistedDirectory);
  await Fs.mkdir(unitRoot, { recursive: true });
  const deliveryArtifactId = randomUUID();
  const source = deliverySource(unitId, deliveryArtifactId);
  await Fs.writeFile(Path.join(unitRoot, "delivery.md"), source, "utf8");
  git(root, "add", persistedDirectory);
  git(root, "commit", "-q", "-m", "Record delivery instructions");
  const deliveryCommit = git(root, "rev-parse", "HEAD");
  const reviewCheckpoint = [{ repository_id: repositoryId, commit: reviewCommit }];
  const currentCheckpoint = [{ repository_id: repositoryId, commit: deliveryCommit }];
  const deliveryBinding = {
    artifact_id: deliveryArtifactId,
    content_version: `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`,
  };
  const upstreamBindings = [{ artifact_id: randomUUID(), content_version: "sha256:reviewed-upstream" }];
  const artifactBindings = [...upstreamBindings, deliveryBinding];
  const commonDirectory = Path.resolve(root, ".git");
  const workspaceId = missionWorkspaceKey(commonDirectory, root);
  const startingCheckpoint = { kind: "commit", commit: reviewCommit };
  const attachmentDirectory = Path.join(commonDirectory, "kepler", "missions", missionId, "workspaces");
  await Fs.mkdir(attachmentDirectory, { recursive: true });
  await Fs.writeFile(Path.join(attachmentDirectory, `${workspaceId}.json`), `${JSON.stringify({
    format: "kepler.mission-workspace.v1",
    mission_id: missionId,
    record_home_repository_id: repositoryId,
    repository_id: repositoryId,
    workspace_id: workspaceId,
    workspace_path: root,
    repository_path: root,
    git_directory: commonDirectory,
    common_directory: commonDirectory,
    branch: "main",
    integration_target: "refs/heads/main",
    starting_checkpoint: startingCheckpoint,
  })}\n`, "utf8");
  const historyDirectory = Path.join(root, ".kepler", "missions", missionId, "history", CONSTRUCTION_PHASE);
  await Fs.mkdir(historyDirectory, { recursive: true });
  const contextInput = [{ reference: "request:delivery", purpose: "Requester-authorized delivery scope" }];
  const missionCreated = createEvent("construction.mission-created", {
    mission_id: missionId,
    title: "Deliver the reviewed capability",
    request: "Hand off the selected reviewed repository material.",
    workflow: "standard",
    record_home: { repository_id: repositoryId },
    contexts: contextInput,
    repositories: [{
      repository_id: repositoryId,
      context: { kind: "existing" },
      branch: { kind: "current" },
      integration_target: "refs/heads/main",
      starting_checkpoint: startingCheckpoint,
    }],
  });
  const workspacesPrepared = createEvent("construction.mission-workspaces-prepared", {
    mission_id: missionId,
    repositories: [{
      repository_id: repositoryId,
      context: { kind: "existing" },
      branch: "main",
      integration_target: "refs/heads/main",
      starting_checkpoint: startingCheckpoint,
    }],
  }, [missionCreated.id]);
  const unitCreated = createEvent("construction.unit-created", {
    mission_id: missionId,
    unit_id: unitId,
    directory: unitDirectory,
    workflow: "standard",
    initial_effort: { default: "standard", stage_overrides: {}, selected_by: "requester" },
  }, [missionCreated.id]);
  const allEvents: ConstructionEventRecord[] = [missionCreated, workspacesPrepared, unitCreated];
  const priorStages = ["functional-design", "quality-requirements", "implementation-planning", "implementation"] as const;
  const stageProjections: ConstructionStageProjection[] = [];
  let priorCompletionIds: string[] = [];
  let implementationCompletionId = "";
  for (const stage of priorStages) {
    const attemptId = randomUUID() as StageAttemptId;
    const start = createEvent("construction.stage-attempt-started", {
      mission_id: missionId,
      unit_id: unitId,
      stage,
      stage_attempt_id: attemptId,
      inputs: contextInput,
      checkpoints: reviewCheckpoint,
      authority_event_ids: priorCompletionIds,
    }, priorCompletionIds.length > 0 ? priorCompletionIds : [missionCreated.id, workspacesPrepared.id, unitCreated.id]);
    const completion = createEvent("construction.stage-attempt-completed", {
      mission_id: missionId,
      unit_id: unitId,
      stage,
      stage_attempt_id: attemptId,
      evidence_ids: [],
      checkpoints: reviewCheckpoint,
    }, [start.id]);
    allEvents.push(start, completion);
    stageProjections.push({
      stage,
      state: "completed",
      currentAttemptId: attemptId,
      attempts: [{ attemptId, state: "completed", facts: [fact(start), fact(completion)] }],
      facts: [fact(start), fact(completion)],
    });
    priorCompletionIds = [...priorCompletionIds, completion.id];
    if (stage === "implementation") implementationCompletionId = completion.id;
  }
  const reviewAttemptId = randomUUID() as StageAttemptId;
  const reviewStart = createEvent("construction.stage-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "unit-of-work-review",
    stage_attempt_id: reviewAttemptId,
    inputs: contextInput,
    checkpoints: reviewCheckpoint,
    authority_event_ids: priorCompletionIds,
  }, priorCompletionIds);
  const reviewEvidenceIds = [randomUUID(), randomUUID(), randomUUID()];
  const reviewEvidenceChecks = ["implementation-evidence-assessment", "unit-of-work-review", "unit-of-work-review-self-review"] as const;
  const reviewEvidenceEvents = reviewEvidenceChecks.map((check, index) => createEvent("construction.evidence-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "unit-of-work-review",
    stage_attempt_id: reviewAttemptId,
    evidence_id: reviewEvidenceIds[index],
    artifact_bindings: upstreamBindings,
    checkpoints: reviewCheckpoint,
    inputs: contextInput,
    check,
    executor: "agent:reviewer",
    result: { status: "passed", summary: "The validated historical Review evidence passed." },
    output_refs: [`review-output:${check}`],
    conditions: [],
  }, [reviewStart.id]));
  const reviewAssessment = {
    implementation_completion_event_id: implementationCompletionId,
    reviewed_material_bindings: upstreamBindings,
    final_checkpoints: reviewCheckpoint,
    reviewer: "agent:reviewer",
    implementation_authors: ["agent:builder"],
    implementation_evidence_assessment_id: reviewEvidenceIds[0],
    review_evidence_id: reviewEvidenceIds[1],
    self_review_evidence_id: reviewEvidenceIds[2],
    findings: { blocking: [], limitations: [] },
    additional_review: { requested: false },
    acceptance_required: false,
    handoff: { status: "ready", recipient: "deliver", summary: "The completed review is ready for Deliver." },
  };
  const reviewCompletion = createEvent("construction.stage-attempt-completed", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "unit-of-work-review",
    stage_attempt_id: reviewAttemptId,
    evidence_ids: reviewEvidenceIds,
    checkpoints: reviewCheckpoint,
    unit_of_work_review_assessment: reviewAssessment,
  }, [reviewStart.id, ...priorCompletionIds, ...reviewEvidenceEvents.map((event) => event.id)], CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION);
  allEvents.push(reviewStart, ...reviewEvidenceEvents, reviewCompletion);
  stageProjections.push({
    stage: "unit-of-work-review",
    state: "completed",
    currentAttemptId: reviewAttemptId,
    attempts: [{ attemptId: reviewAttemptId, state: "completed", facts: [fact(reviewStart), ...reviewEvidenceEvents.map(fact), fact(reviewCompletion)] }],
    facts: [fact(reviewStart), ...reviewEvidenceEvents.map(fact), fact(reviewCompletion)],
  });
  priorCompletionIds = [...priorCompletionIds, reviewCompletion.id];
  const attemptId = randomUUID() as StageAttemptId;
  const start = createEvent("construction.stage-attempt-started", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "deliver",
    stage_attempt_id: attemptId,
    inputs: contextInput,
    checkpoints: currentCheckpoint,
    authority_event_ids: priorCompletionIds,
  }, priorCompletionIds);
  allEvents.push(start);
  stageProjections.push({ stage: "deliver", state: "running", currentAttemptId: attemptId, attempts: [{ attemptId, state: "running", facts: [fact(start)] }], facts: [fact(start)] });
  const makeEvidence = (check: string, causes: readonly string[] = [start.id]) => {
    const evidenceId = randomUUID();
    const event = createEvent("construction.evidence-recorded", {
      mission_id: missionId,
      unit_id: unitId,
      stage: "deliver",
      stage_attempt_id: attemptId,
      evidence_id: evidenceId,
      artifact_bindings: artifactBindings,
      checkpoints: currentCheckpoint,
      inputs: contextInput,
      check,
      executor: "agent:delivery-owner",
      result: { status: "passed", summary: `${check} passed against current delivery material.` },
      output_refs: [`delivery-output:${check}`],
      conditions: [],
    }, causes);
    allEvents.push(event);
    return { evidenceId, event };
  };
  const preparation = makeEvidence("deliver-preparation");
  const selfReview = makeEvidence("deliver-self-review");
  const operationRequestEvent = createEvent("construction.interaction-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "deliver",
    stage_attempt_id: attemptId,
    participants: ["Requester"],
    content: "Deploy the reviewed material to the approved target.",
    references: ["request:deployment-target"],
  }, [start.id]);
  allEvents.push(operationRequestEvent);
  const operation = makeEvidence("deliver-operation-result", [start.id, operationRequestEvent.id]);
  const verification = makeEvidence("deliver-outcome-verification", options.verificationFollowsOperation === false ? [start.id] : [start.id, operation.event.id]);
  const handoffCauses = [start.id, reviewCompletion.id, preparation.event.id, selfReview.event.id, operation.event.id,
    ...(options.handoffIncludesVerification === false ? [] : [verification.event.id])];
  const handoff = makeEvidence("deliver-recipient-handoff", handoffCauses);
  const approvalEvent = options.withApproval ? createEvent("construction.approval-recorded", {
    mission_id: missionId,
    unit_id: unitId,
    stage: "deliver",
    stage_attempt_id: attemptId,
    artifact_bindings: artifactBindings,
    checkpoints: currentCheckpoint,
    requester: "Requester",
    inputs: contextInput,
    decision_reference: "approval:repository-handoff",
  }, [start.id]) : undefined;
  if (approvalEvent) allEvents.push(approvalEvent);
  const evidenceFacts = [preparation.event, selfReview.event, operationRequestEvent, operation.event, verification.event, handoff.event].map(fact);
  const factHistory = allEvents.map(record);
  const unit = {
    unitId,
    workflow: "standard",
    blocked: false,
    historyIssues: [],
    projectionIssues: [],
    created: fact(unitCreated),
    stages: stageProjections,
    evidence: evidenceFacts.filter((item) => item.event.type === "construction.evidence-recorded").map((item) => ({ fact: item })),
    interactions: evidenceFacts.filter((item) => item.event.type === "construction.interaction-recorded"),
    approvals: approvalEvent ? [{ fact: fact(approvalEvent) }] : [],
  };
  const loaded = {
    kind: "loaded",
    root,
    missionId,
    history: { missionId, events: factHistory, issues: [] },
    projection: { units: [unit] },
    unit,
  } as unknown as Extract<AuditHistoryReadResult, { kind: "loaded" }>;
  const contexts = { readUnit: async () => loaded } as unknown as AuditContextResolver;
  const service = new DeliverStageCompletion(contexts, createNodeDeliverStageCompletionRuntime({ name: "kepler-test", version: "0.10.3" }));
  const selectors = { unit: unitId, stage: "deliver", attempt: attemptId } as ScopeSelectors;
  return {
    root,
    missionId,
    unitId,
    attemptId,
    startEventId: start.id,
    selectors,
    reviewCompletionId: reviewCompletion.id,
    reviewCheckpoint,
    currentCheckpoint,
    artifactBindings,
    evidenceIds: {
      preparation: preparation.evidenceId,
      selfReview: selfReview.evidenceId,
      operation: operation.evidenceId,
      verification: verification.evidenceId,
      handoff: handoff.evidenceId,
    },
    evidenceEvents: evidenceFacts.filter((item) => item.event.type === "construction.evidence-recorded").map((item) => item.event),
    operationEvidenceId: operation.evidenceId,
    operationRequestEventId: operationRequestEvent.id,
    ...(approvalEvent ? { approvalEventId: approvalEvent.id } : {}),
    service,
    historyDirectory,
    cleanup: async () => Fs.rm(parent, { recursive: true, force: true }),
  };
};

const deliveryRequest = (fixture: DeliverFixture, operationStatus: "succeeded" | "partial" = "succeeded") => ({
  review_completion_event_id: fixture.reviewCompletionId,
  outcome: "deployment",
  requested_outcome: "Deploy the reviewed material to the approved target.",
  destination: "environment:staging",
  recipient: "Release operator",
  artifact_bindings: fixture.artifactBindings,
  reviewed_checkpoints: fixture.reviewCheckpoint,
  preparation_evidence_id: fixture.evidenceIds.preparation,
  self_review_evidence_id: fixture.evidenceIds.selfReview,
  operation_results: [{
    operation: "Deploy the reviewed material",
    status: operationStatus,
    evidence_id: fixture.operationEvidenceId,
    source_checkpoints: fixture.reviewCheckpoint,
    authority: { kind: "requester-instruction", event_id: fixture.operationRequestEventId },
  }],
  verification_evidence_ids: [fixture.evidenceIds.verification],
  handoff_evidence_id: fixture.evidenceIds.handoff,
  additional_review: { requested: false },
  approval_required: false,
  handoff: { status: "ready", summary: "The recipient received the actual deployment reference, evidence, and recovery information." },
});

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => Fs.rm(root, { recursive: true, force: true })));
});

describe("Deliver stage completion", () => {
  it("rejects a completion request for the wrong Deliver attempt", async () => {
    const fixture = await createDeliverFixture();
    const request = deliveryRequest(fixture);
    const before = (await Fs.readdir(fixture.historyDirectory)).sort();

    const result = await fixture.service.execute({ ...fixture.selectors, attempt: randomUUID() }, request);

    expect(result).toMatchObject({ kind: "failed", data: { code: "stage_attempt_not_current" } });
    expect((await Fs.readdir(fixture.historyDirectory)).sort()).toEqual(before);
  });

  it("denies completion when required preparation evidence is missing", async () => {
    const fixture = await createDeliverFixture();
    const request = { ...deliveryRequest(fixture), preparation_evidence_id: randomUUID() };
    const before = (await Fs.readdir(fixture.historyDirectory)).sort();

    const result = await fixture.service.execute(fixture.selectors, request);

    expect(result).toMatchObject({ kind: "failed", data: { code: "deliver_preparation_evidence_invalid" } });
    expect((await Fs.readdir(fixture.historyDirectory)).sort()).toEqual(before);
  });

  it("completes an authorized deployment with verified outcome and recipient-handoff provenance", async () => {
    const fixture = await createDeliverFixture();
    const request = deliveryRequest(fixture);
    expect(fixture.evidenceEvents.filter((event) => event.data.stage === "deliver").map((event) => event.data.evidence_id)).toEqual(Object.values(fixture.evidenceIds));
    for (const check of ["deliver-preparation", "deliver-self-review", "deliver-recipient-handoff"] as const) {
      const evidence = fixture.evidenceEvents.find((event) => event.data.check === check);
      expect(evidence).toBeDefined();
      expect(evidence?.data.artifact_bindings).toEqual(request.artifact_bindings);
      expect(evidence?.data.checkpoints).toEqual(fixture.currentCheckpoint);
      expect(evidence?.caused_by).toContain(fixture.startEventId);
    }
    const result = await fixture.service.execute(fixture.selectors, request);

    expect(result.kind, JSON.stringify(result)).toBe("success");
    if (result.kind !== "success") return;
    expect(result.data).toMatchObject({ stage: "deliver", attempt_id: fixture.attemptId, outcome: "deployment" });
    const journalPath = Path.join(fixture.historyDirectory, `${String(result.data.journal_id)}.jsonl`);
    const records = (await Fs.readFile(journalPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as unknown);
    expect(records).toHaveLength(1);
    expect(validateConstructionEvent(records[0]).status).toBe("valid");
    expect(records[0]).toMatchObject({
      type: "construction.stage-attempt-completed",
      event_version: CONSTRUCTION_STAGE_COMPLETION_EVENT_VERSION,
      data: { stage: "deliver", deliver_assessment: { outcome: "deployment" } },
    });
  });

  it("rejects an operation that identifies source material newer than the reviewed checkpoint", async () => {
    const fixture = await createDeliverFixture();
    const request = deliveryRequest(fixture);
    request.operation_results[0]!.source_checkpoints = fixture.currentCheckpoint;
    const before = (await Fs.readdir(fixture.historyDirectory)).sort();

    const result = await fixture.service.execute(fixture.selectors, request);

    expect(result).toMatchObject({ kind: "failed", data: { code: "deliver_source_provenance_invalid" } });
    expect((await Fs.readdir(fixture.historyDirectory)).sort()).toEqual(before);
  });

  it("rejects outcome verification that predates its delivery operation", async () => {
    const fixture = await createDeliverFixture({ verificationFollowsOperation: false });
    const before = (await Fs.readdir(fixture.historyDirectory)).sort();

    const result = await fixture.service.execute(fixture.selectors, deliveryRequest(fixture));

    expect(result).toMatchObject({ kind: "failed", data: { code: "deliver_verification_provenance_invalid" } });
    expect((await Fs.readdir(fixture.historyDirectory)).sort()).toEqual(before);
  });

  it("keeps a partial deployment incomplete and does not append a completion", async () => {
    const fixture = await createDeliverFixture();
    const before = (await Fs.readdir(fixture.historyDirectory)).sort();

    const result = await fixture.service.execute(fixture.selectors, deliveryRequest(fixture, "partial"));

    expect(result).toMatchObject({ kind: "failed", data: { code: "deliver_operation_incomplete" } });
    expect((await Fs.readdir(fixture.historyDirectory)).sort()).toEqual(before);
  });

  it("rejects an operation whose requester authority is absent from current history", async () => {
    const fixture = await createDeliverFixture();
    const request = deliveryRequest(fixture);
    request.operation_results[0]!.authority.event_id = randomUUID();
    const before = (await Fs.readdir(fixture.historyDirectory)).sort();

    const result = await fixture.service.execute(fixture.selectors, request);

    expect(result).toMatchObject({ kind: "failed", data: { code: "deliver_operation_authority_invalid" } });
    expect((await Fs.readdir(fixture.historyDirectory)).sort()).toEqual(before);
  });

  it("rejects delivery evidence after delivery instructions change", async () => {
    const fixture = await createDeliverFixture();
    const deliveryPath = Path.join(fixture.root, ".kepler", "missions", fixture.missionId, "construction", "units-of-work", fixture.unitId, "delivery.md");
    await Fs.appendFile(deliveryPath, "\nThe target changed after evidence was recorded.\n", "utf8");
    const before = (await Fs.readdir(fixture.historyDirectory)).sort();

    const result = await fixture.service.execute(fixture.selectors, deliveryRequest(fixture));

    expect(result).toMatchObject({ kind: "failed", data: { code: "deliver_material_binding_invalid" } });
    expect((await Fs.readdir(fixture.historyDirectory)).sort()).toEqual(before);
  });

  it("completes a repository handoff with its applicable requester approval", async () => {
    const fixture = await createDeliverFixture({ withApproval: true });
    const request = {
      ...deliveryRequest(fixture),
      outcome: "repository-handoff",
      operation_results: [],
      approval_required: true,
      approval_event_id: fixture.approvalEventId,
    };

    const result = await fixture.service.execute(fixture.selectors, request);

    expect(result.kind, JSON.stringify(result)).toBe("success");
    if (result.kind !== "success") return;
    expect(result.data).toMatchObject({ stage: "deliver", outcome: "repository-handoff", approval_event_id: fixture.approvalEventId });
  });

  it("rejects a recipient handoff that omits outcome-verification provenance", async () => {
    const fixture = await createDeliverFixture({ handoffIncludesVerification: false });
    const request = { ...deliveryRequest(fixture), outcome: "repository-handoff", operation_results: [] };
    const before = (await Fs.readdir(fixture.historyDirectory)).sort();

    const result = await fixture.service.execute(fixture.selectors, request);

    expect(result).toMatchObject({ kind: "failed", data: { code: "deliver_handoff_provenance_invalid" } });
    expect((await Fs.readdir(fixture.historyDirectory)).sort()).toEqual(before);
  });

  it("requires the applicable approval record when the typed assessment says approval is required", async () => {
    const fixture = await createDeliverFixture();
    const request = {
      ...deliveryRequest(fixture),
      outcome: "repository-handoff",
      operation_results: [],
      approval_required: true,
      approval_event_id: randomUUID(),
    };
    const before = (await Fs.readdir(fixture.historyDirectory)).sort();

    const result = await fixture.service.execute(fixture.selectors, request);

    expect(result).toMatchObject({ kind: "failed", data: { code: "deliver_approval_missing" } });
    expect((await Fs.readdir(fixture.historyDirectory)).sort()).toEqual(before);
  });
});
