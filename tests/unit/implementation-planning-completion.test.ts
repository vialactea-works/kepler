import { describe, expect, it } from "vitest";
import { validateImplementationPlanningCompletionRequest } from "../../packages/cli/src/construction/implementation-planning-completion.js";

const graphId = "81000000-0000-4000-8000-000000000001";
const taskId = "82000000-0000-4000-8000-000000000001";

const request = () => ({
  assessments: {
    artifact_validation: {
      evidence_id: "83000000-0000-4000-8000-000000000001",
      summary: "The current plan and linked support pass artifact validation.",
    },
    task_graph_validation: {
      evidence_id: "83000000-0000-4000-8000-000000000002",
      summary: "The current task graph passes schema and dependency validation.",
    },
    self_review: {
      status: "passed",
      evidence_id: "83000000-0000-4000-8000-000000000003",
      reviewer: "Implementation Planning owner",
      summary: "Rationale, coverage, consistency, and verification feasibility were reviewed.",
      checks: [
        "decision-rationale", "obligation-coverage", "consistency", "dependency-reasons",
        "prerequisite-conditions", "verification-feasibility", "input-relevance", "blocking-decisions",
      ],
      decision_rationales: [{ decision: "Separate data access from presentation", rationale: "The boundary keeps security policy testable." }],
      task_reviews: [{
        task_id: taskId,
        inputs_relevant: true,
        outputs_explicit: true,
        acceptance_testable: true,
        dependency_reasons_justified: true,
        prerequisites_conditioned: true,
        verification_feasible: true,
        rationale: "The task has explicit obligations and feasible checks.",
      }],
      obligation_coverage: [{
        reference: "quality.md#security",
        disposition: "planned",
        task_ids: [taskId],
        rationale: "The task implements the owning-user access rule.",
      }],
      unresolved_consequential_decisions: [],
      unsupported_assumptions: [],
    },
    external_review: { requested: false },
    approval_requirement: { required: false, rationale: "No authority rule or requester instruction requires plan approval." },
    handoff: {
      status: "ready",
      summary: "The current plan is ready for Implementation.",
      recipient: "implementation",
      unit_directory: ".kepler/missions/mission/construction/units-of-work/example",
      artifacts: ["plan.md", "tasks-dag.json"],
      input_bindings: [{ artifact_id: "83000000-0000-4000-8000-000000000005", content_version: "sha256:upstream" }],
      graph_ref: { graph_id: graphId, content_version: "sha256:graph-content" },
      task_ids: [taskId],
      verification_obligations: ["Run the focused unit tests."],
      prerequisite_conditions: ["Start after the task's declared input is available."],
      coordination_constraints: ["Serialize repository integration per unit."],
      approval_required: false,
    },
  },
});

describe("Implementation Planning completion request", () => {
  it("accepts typed task-by-task review, obligation coverage, graph identity, and handoff", () => {
    expect(validateImplementationPlanningCompletionRequest(request()).kind).toBe("valid");
  });

  it("requires task-level semantic review and no unresolved consequential decisions", () => {
    const valid = request();
    const falseFeasibility = {
      ...valid,
      assessments: {
        ...valid.assessments,
        self_review: {
          ...valid.assessments.self_review,
          task_reviews: [{ ...valid.assessments.self_review.task_reviews[0], verification_feasible: false }],
        },
      },
    };
    expect(validateImplementationPlanningCompletionRequest(falseFeasibility).kind).toBe("invalid");
    const unresolved = {
      ...valid,
      assessments: {
        ...valid.assessments,
        self_review: { ...valid.assessments.self_review, unresolved_consequential_decisions: ["Choose the data retention model."] },
      },
    };
    expect(validateImplementationPlanningCompletionRequest(unresolved).kind).toBe("invalid");
  });

  it("requires an exact approval event when approval is applicable and forbids an unnecessary approval binding", () => {
    const valid = request();
    const required = {
      assessments: {
        ...valid.assessments,
        approval_requirement: {
          required: true,
          rationale: "The requester explicitly requires approval of the plan.",
          basis: { kind: "requester-instruction", request_event_id: "84000000-0000-4000-8000-000000000001" },
        },
        handoff: { ...valid.assessments.handoff, approval_required: true },
      },
    };
    expect(validateImplementationPlanningCompletionRequest(required).kind).toBe("invalid");
    expect(validateImplementationPlanningCompletionRequest({
      ...required,
      approval_event_id: "85000000-0000-4000-8000-000000000001",
    }).kind).toBe("valid");
    expect(validateImplementationPlanningCompletionRequest({
      ...valid,
      approval_event_id: "85000000-0000-4000-8000-000000000001",
    }).kind).toBe("invalid");
  });

  it("requires requested external review to finish without blocking findings", () => {
    const valid = request();
    const requested = {
      ...valid,
      assessments: {
        ...valid.assessments,
        external_review: {
          requested: true,
          request_event_id: "86000000-0000-4000-8000-000000000001",
          evidence_id: "83000000-0000-4000-8000-000000000004",
          reviewer: "Independent reviewer",
          summary: "The plan review found no blocking issues.",
          findings: [],
        },
      },
    };
    expect(validateImplementationPlanningCompletionRequest(requested).kind).toBe("valid");
    expect(validateImplementationPlanningCompletionRequest({
      ...requested,
      assessments: { ...requested.assessments, external_review: { ...requested.assessments.external_review, findings: ["A blocking dependency is unjustified."] } },
    }).kind).toBe("invalid");
  });

  it("rejects unknown fields and duplicate evidence identities", () => {
    const valid = request();
    expect(validateImplementationPlanningCompletionRequest({ ...valid, extra: true }).kind).toBe("invalid");
    const duplicate = {
      ...valid,
      assessments: {
        ...valid.assessments,
        task_graph_validation: { ...valid.assessments.task_graph_validation, evidence_id: valid.assessments.artifact_validation.evidence_id },
      },
    };
    expect(validateImplementationPlanningCompletionRequest(duplicate).kind).toBe("invalid");
  });
});
