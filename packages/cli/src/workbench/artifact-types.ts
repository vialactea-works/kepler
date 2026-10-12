import type {
  ArtifactDiagnostic,
  RecognizedArtifact,
} from "./artifact-reader.js";

export type SupportedArtifact =
  | "proposal"
  | "design"
  | "requirements-change"
  | "requirements-spec"
  | "plan"
  | "progress"
  | "task-progress"
  | "feedback"
  | "review"
  | "finish"
  | "critique"
  | "map"
  | "ticket"
  | "route";

export type ArtifactContractDiagnosticCode =
  | "unsupported-artifact"
  | "missing-field"
  | "invalid-type"
  | "invalid-value"
  | "path-mismatch"
  | "missing-heading"
  | "missing-section"
  | "invalid-record"
  | "non-monotonic-record"
  | "legacy-unsupported";

export interface ArtifactContractDiagnostic {
  readonly _tag: "ArtifactContractDiagnostic";
  readonly code: ArtifactContractDiagnosticCode;
  readonly message: string;
  readonly sourcePath: string;
  readonly field?: string;
  readonly expected?: string;
  readonly actual?: unknown;
  readonly location?: { readonly line: number; readonly column?: number };
}

export interface ArtifactHeading {
  readonly level: number;
  readonly text: string;
  readonly line: number;
}

export type ReviewPassVerdict =
  | "approved"
  | "approved-remediation"
  | "changes-requested"
  | "skipped";

export type ReviewPassProvenance = "per-pass" | "legacy-global";

export type ReviewFindingKind =
  | "code-defect"
  | "evidence-gap"
  | "intent-defect";

export interface ReviewFinding {
  readonly id: string;
  readonly kind?: ReviewFindingKind;
  readonly text: string;
}

export interface ReviewFindingResolution {
  readonly finding: string;
  readonly evidence: readonly string[];
  readonly verification: string;
}

export type ReviewClearanceProvenance =
  | { readonly scope: "full"; readonly target: string }
  | {
      readonly scope: "remediation";
      readonly target: string;
      readonly parentPass: number;
      readonly parentCommit: string;
      readonly deltaBase: string;
      readonly resolutions: readonly ReviewFindingResolution[];
    };

export interface ReviewPassStructuralRecord {
  readonly provenance: "structural";
  readonly number: number;
  readonly date: string;
  readonly blocking: readonly string[];
  readonly suggestions: readonly string[];
  readonly line: number;
}

export interface ReviewPassEvidence {
  readonly number: number;
  readonly date: string;
  readonly provenance: ReviewPassProvenance;
  readonly base: string;
  readonly head: string;
  readonly verdict: ReviewPassVerdict;
  readonly blocking: readonly string[];
  readonly findings: readonly ReviewFinding[];
  readonly suggestions: readonly string[];
  readonly clearance?: ReviewClearanceProvenance;
  readonly line: number;
}

export type ReviewPassRecord = ReviewPassStructuralRecord | ReviewPassEvidence;

export interface ReviewPassParseResult {
  readonly passes: readonly ReviewPassRecord[];
  readonly diagnostics: readonly ArtifactContractDiagnostic[];
  readonly physicalLastPass?: number;
  readonly latest?: ReviewPassEvidence;
}

export type ArtifactWorkflowRecordKind =
  | "task"
  | "attempt"
  | "pass"
  | "outcome"
  | "unit";

export interface ArtifactWorkflowRecord {
  readonly kind: ArtifactWorkflowRecordKind;
  readonly number?: number;
  readonly date?: string;
  readonly title?: string;
  readonly line: number;
  readonly fields: Readonly<Record<string, string>>;
}

export interface RouteUnitContract {
  readonly id: number;
  readonly name: string;
  readonly depends_on: readonly number[];
}

export type ArtifactBodyClassification =
  | "supported"
  | "physical-last-pass"
  | "legacy-unsupported";

export interface PlanExecutionContract {
  readonly version: 1;
  readonly order: readonly number[];
}

export interface PlanInputImpactEntry {
  readonly path: string;
  readonly previousBlob: string | null;
  readonly currentBlob: string | null;
  readonly affectedTasks: readonly number[];
  readonly unaffectedTasks: readonly number[];
  readonly newTasks: readonly number[];
  readonly unresolvedIntent: boolean;
  readonly rationale: string;
}

export interface PlanInputImpactContract {
  readonly version: 1;
  readonly previousPlanCommit: string;
  readonly reviewReference: string;
  readonly changes: readonly PlanInputImpactEntry[];
}

export interface PlanExecutionTransitionContract {
  readonly version: 1;
  readonly previousPlanCommit: string;
  readonly previousOrder: readonly number[];
  readonly fullyGatedPrefix: readonly number[];
  readonly approval: string;
  readonly reason: string;
  readonly affected: string;
}

export interface IntentApprovalReference {
  readonly path: string;
  readonly reference: string;
  readonly commit: string;
}

export interface InitialScaffoldProof {
  readonly version: 1;
  readonly base: string;
  readonly authority: string;
  readonly breakdown: string;
  readonly taskIds: readonly number[];
}

export interface TaskInputBlob {
  readonly path: string;
  readonly blob: string;
}

export interface TaskInputContext {
  readonly version: 1;
  readonly repository: string;
  readonly intentCommit: string;
  readonly taskDefinition: string;
  readonly inputs: readonly TaskInputBlob[];
  readonly impactPlanCommit?: string;
}

export interface LegacyInputConfirmation {
  readonly version: 1;
  readonly task: number;
  readonly repository: string;
  readonly taskDefinition: string;
  readonly intentCommit: string;
  readonly inputs: readonly TaskInputBlob[];
  readonly historicalInputs: "unknown";
  readonly owner: string;
  readonly ownerReference: string;
  readonly reviewer: string;
  readonly reviewReference: string;
  readonly rationale: string;
}

export interface PlanTaskContract {
  readonly id: number;
  readonly title: string;
  readonly dependsOn: readonly number[];
  readonly filesDeclared: boolean;
  readonly files: readonly string[];
  readonly definitionDigest: string;
  readonly inputContext?: TaskInputContext;
}

export interface TaskOrderEntry {
  readonly id: number;
  readonly dependsOn: readonly number[];
}

export interface PlanContractProjection {
  readonly identityOrder: readonly number[];
  readonly executionOrder: readonly number[];
  readonly execution?: PlanExecutionContract;
  readonly executionTransition?: PlanExecutionTransitionContract;
  readonly inputImpact?: PlanInputImpactContract;
  readonly legacyInputConfirmations?: readonly LegacyInputConfirmation[];
  readonly initialization?: InitialScaffoldProof;
  readonly intentApprovals: readonly IntentApprovalReference[];
  readonly tasks: readonly PlanTaskContract[];
}

export type CritiqueDisposition =
  | "settled"
  | "application-required"
  | "owner-decision-required"
  | "no-clearance";

export interface FinishAdmissionIdentity {
  readonly verifiedHead: string;
  readonly targetRef: string;
  readonly targetCommit: string;
  readonly reviewBase: string;
  readonly reviewHead: string;
  readonly reviewCommit: string;
  readonly materialWaiver: string | null;
  readonly inputs: readonly TaskInputBlob[];
}

export interface FinishRouteIdentity {
  readonly path: string;
  readonly mapPath: string;
  readonly unit: number;
  readonly sourceBlob: string;
  readonly previousStatus: "in-progress";
  readonly shipping: "merge" | "request-open" | "no-op";
  readonly owner: string;
  readonly change: string;
  readonly sourceRef: string;
  readonly targetRef: string;
  readonly baseCommit: string;
}

export type FinishDeliveryIdentity =
  | { readonly strategy: "local-merge"; readonly targetRef: string; readonly commit: string }
  | {
      readonly strategy: "pull-request";
      readonly provider: "github" | "gitlab";
      readonly repository: string;
      readonly url: string;
      readonly head: string;
      readonly targetRef: string;
      readonly state: "open" | "merged";
      readonly mergeCommit: string | null;
    }
  | { readonly strategy: "no-op"; readonly sourceRef: string; readonly worktree: string; readonly commit: string };

export interface FinishRemainingEffect {
  readonly kind: "canonical-spec" | "route" | "map" | "history";
  readonly path: string;
}

export interface FinishRecoveryReference {
  readonly attempt: number;
  readonly outcomeCommit: string;
  readonly previousRepairCommit: string | null;
}

export interface FinishSourceIdentity {
  readonly repository: string;
  readonly root: string;
  readonly sourceRef: string;
  readonly worktree: string;
}

export interface FinishRecordProjection {
  readonly source: FinishSourceIdentity;
  readonly number: number;
  readonly strategy: "local-merge" | "pull-request" | "no-op" | "reconcile-delivery";
  readonly admission: FinishAdmissionIdentity;
  readonly route: FinishRouteIdentity | null;
  readonly recovery?: FinishRecoveryReference;
  readonly delivery?: FinishDeliveryIdentity | null;
  readonly remaining?: readonly FinishRemainingEffect[];
  readonly outcome?: {
    readonly result: "completed" | "blocked";
    readonly synchronization: { readonly paths: readonly string[]; readonly commit: string | null };
    readonly delivery: FinishDeliveryIdentity | null;
    readonly remaining: readonly FinishRemainingEffect[];
  };
}

export interface ArtifactWorkflowState {
  readonly finish?: readonly FinishRecordProjection[];
  readonly classification: ArtifactBodyClassification;
  readonly records: readonly ArtifactWorkflowRecord[];
  readonly passes?: readonly ReviewPassEvidence[];
  readonly physicalLastPass?: number;
  readonly lastPass?: number;
  readonly plan?: PlanContractProjection;
  readonly critiqueDisposition?: CritiqueDisposition;
}

export interface ArtifactBodyValidation {
  readonly headings: readonly ArtifactHeading[];
  readonly sections: readonly string[];
  readonly workflow: ArtifactWorkflowState;
  readonly diagnostics: readonly ArtifactContractDiagnostic[];
}

export interface ValidArtifactContract {
  readonly _tag: "valid";
  readonly artifact: SupportedArtifact;
  readonly sourcePath: string;
  readonly metadata: Record<string, unknown>;
  readonly body: ArtifactBodyValidation;
  readonly diagnostics: readonly [];
}

export interface InvalidArtifactContract {
  readonly _tag: "invalid";
  readonly sourcePath: string;
  readonly diagnostics: readonly (
    | ArtifactContractDiagnostic
    | ArtifactDiagnostic
  )[];
}

export interface SkippedArtifactContract {
  readonly _tag: "skipped";
  readonly sourcePath: string;
}

export type ArtifactContractResult =
  | ValidArtifactContract
  | InvalidArtifactContract
  | SkippedArtifactContract;

export interface ArtifactContract {
  readonly artifact: SupportedArtifact;
  readonly requiredFields: readonly string[];
  readonly validate: (
    artifact: RecognizedArtifact,
  ) => readonly ArtifactContractDiagnostic[];
  readonly validateBody: (
    artifact: RecognizedArtifact,
  ) => ArtifactBodyValidation;
}

export const supportedArtifacts: readonly SupportedArtifact[] = [
  "proposal",
  "design",
  "requirements-change",
  "requirements-spec",
  "plan",
  "progress",
  "task-progress",
  "feedback",
  "review",
  "finish",
  "critique",
  "map",
  "ticket",
  "route",
];

export const requiredFields: Record<SupportedArtifact, readonly string[]> = {
  proposal: [
    "artifact",
    "change",
    "status",
    "decision",
    "author",
    "created",
    "route_unit",
  ],
  design: [
    "artifact",
    "change",
    "status",
    "created",
    "author",
    "decision",
    "route_unit",
  ],
  "requirements-change": [
    "artifact",
    "capability",
    "change",
    "status",
    "created",
    "author",
    "decision",
  ],
  "requirements-spec": [
    "artifact",
    "capability",
    "status",
    "updated",
    "author",
    "decision",
  ],
  plan: [
    "artifact",
    "change",
    "status",
    "created",
    "author",
    "decision",
    "route_unit",
  ],
  progress: ["artifact", "change", "status", "updated", "decision", "tasks"],
  "task-progress": [
    "artifact",
    "change",
    "task",
    "status",
    "updated",
    "decision",
  ],
  feedback: [
    "artifact",
    "change",
    "task",
    "created",
    "status",
    "decision",
  ],
  review: [
    "artifact",
    "change",
    "created",
    "status",
    "decision",
  ],
  finish: [
    "artifact",
    "change",
    "status",
    "created",
    "updated",
    "strategy",
    "result",
    "decision",
  ],
  critique: ["artifact", "change", "created", "verdict", "decision", "scope"],
  map: [
    "artifact",
    "effort",
    "status",
    "branch",
    "created",
    "updated",
    "decision",
  ],
  ticket: [
    "artifact",
    "effort",
    "ticket",
    "type",
    "status",
    "blocked_by",
    "created",
    "updated",
    "decision",
  ],
  route: [
    "artifact",
    "effort",
    "status",
    "created",
    "updated",
    "decision",
    "units",
  ],
};

export const enumValues: Partial<
  Record<SupportedArtifact, Partial<Record<string, readonly string[]>>>
> = {
  proposal: { status: ["draft", "approved", "implemented"] },
  design: { status: ["draft"] },
  "requirements-change": { status: ["draft"] },
  "requirements-spec": { status: ["current"] },
  plan: { status: ["draft", "approved", "in-progress", "complete", "blocked"] },
  progress: { status: ["pending", "in-progress", "blocked", "complete"] },
  "task-progress": { status: ["pending", "in-progress", "blocked", "done"] },
  feedback: {
    status: ["open", "resolved"],
    verdict: ["approved", "changes-requested", "skipped"],
  },
  review: {
    status: ["open", "complete"],
    verdict: ["approved", "approved-remediation", "changes-requested", "skipped"],
  },
  finish: {
    status: ["pending", "completed", "blocked"],
    strategy: ["local-merge", "pull-request", "no-op", "reconcile-delivery"],
    result: ["completed", "blocked", "pending"],
  },
  critique: { verdict: ["approved", "changes-requested", "skipped"] },
  map: { status: ["open", "cleared", "shipping", "shipped"] },
  ticket: {
    type: ["research", "prototype", "grilling", "task"],
    status: ["open", "claimed", "resolved"],
  },
  route: { status: ["open", "shipping", "shipped"] },
};
