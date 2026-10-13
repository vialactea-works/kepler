import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { readSkill, section } from "./helpers.js"

const plan = readSkill("kepler-plan")
const code = readSkill("kepler-code")
const propose = readSkill("kepler-propose")
const critique = readSkill("kepler-critique")
const orchestrate = readSkill("kepler-orchestrate")
const feedback = readSkill("kepler-code-feedback")
const finish = readSkill("kepler-finish-work")
const dispatch = readFileSync("skills/kepler-orchestrate/references/implementer-prompt.md", "utf8")
const planTemplate = readFileSync("bundle/templates/plan.md", "utf8")
const progressTemplate = readFileSync("bundle/templates/progress.md", "utf8")
const taskProgressTemplate = readFileSync("bundle/templates/task-progress.md", "utf8")
const changeStateMachine = readFileSync("docs/change-state-machine.md", "utf8")

describe("planning and resource gate contracts", () => {
  it("keeps bundled plan root ownership mode-scoped", () => {
    const consumption = planTemplate.split("Consumption contract:")[1]?.split("The initial `status:")[0] ?? ""

    expect(consumption).toMatch(/historical serial.*kepler-code.*root.*row/is)
    expect(consumption).toMatch(/v2.*task-local evidence.*original commit.*coordinator.*guarded root publication/is)
  })

  it("carries applicable quality and verified decision context into the exact task before generation", () => {
    const decomposition = (section(plan, "## Process")
      .split("7. **Decompose.**")[1]
      ?.split("8. **Specify each task.**")[0] ?? "").replace(/\s+/g, " ")
    const inputContext = section(plan, "## Input impact and task-local decision context").replace(/\s+/g, " ")
    const codeProcess = section(code, "## Process").replace(/\s+/g, " ")
    const generationGate = codeProcess.indexOf("Task quality and decision pre-generation gate")
    const firstAttempt = codeProcess.indexOf("**Begin the attempt.**")
    const prompt = section(dispatch, "## Task quality and decision evidence")

    expect(decomposition).toMatch(/applicable structural quality constraint and verified decision\/source in that task block/is)
    expect(inputContext).toMatch(/task definition.*selected relevant approved requirements\/design\/specs/is)
    expect(planTemplate).toContain("taskDefinitionDigest")
    expect(inputContext).toMatch(/quality constraints.*source.*verified decision context/i)
    expect(codeProcess).toMatch(/before production edits.*Task quality and decision pre-generation gate/is)
    expect(generationGate).toBeGreaterThanOrEqual(0)
    expect(generationGate).toBeLessThan(firstAttempt)
    expect(prompt).toMatch(/task-local constraint\/decision.*observed code\/test evidence/is)
    expect(section(feedback, "## Process").replace(/\s+/g, " ")).toMatch(/Verify the attempt's quality\/decision evidence.*located implementation\/tests/is)
    expect(taskProgressTemplate).toContain("task quality constraint and decision context")
    expect(taskProgressTemplate).toContain("implementation or check shaped by it")
  })

  it("preserves existing proposal and plan route bindings before new-unit selection", () => {
    const routeSelection = (
      section(plan, "## Process")
        .split("1. **Detect map-aware mode and preserve existing bindings.**")[1]
        ?.split("2. **Resolve visible claims")[0] ?? ""
    ).replace(/\s+/g, " ");
    const scenarios = [
      { mode: "rich path", proposalUnit: 1, planUnit: null, unitOne: "in-progress", unitTwo: "pending", expected: 1 },
      { mode: "re-plan", proposalUnit: 1, planUnit: 1, unitOne: "in-progress", unitTwo: "pending", expected: 1 },
    ];

    expect(scenarios).toHaveLength(2);
    for (const scenario of scenarios) {
      expect(scenario.unitOne).toBe("in-progress");
      expect(scenario.unitTwo).toBe("pending");
      expect(scenario.expected).toBe(1);
    }
    expect(routeSelection).toMatch(/Before selecting a unit, resolve any existing\s+change's `proposal\.md` and `plan\.md` bindings through `kepler workbench context`/is);
    expect(routeSelection).toMatch(/If `plan\.md` exists, its `route_unit` owns the selection; any non-null proposal reference must match it, including when the plan reference is null/is);
    expect(routeSelection).toMatch(/If no plan exists and the proposal has a non-null `route_unit`, preserve that proposal-bound unit/is);
    expect(routeSelection).toMatch(/For an existing binding, resume that exact unit for its owning change; never replace it with another pending unit/is);
    expect(routeSelection).toMatch(/Only a new, unbound change selects the first `pending` unit/is);
    expect(routeSelection.indexOf("Before selecting a unit")).toBeLessThan(routeSelection.indexOf("Only a new, unbound change"));
    expect(routeSelection).toMatch(/If that first pending unit is blocked, report the exact prerequisite and stop rather than selecting a later unit/is);
    expect(routeSelection).toMatch(/a later-unit choice needs explicit owner authorization/is);
    expect(routeSelection).toMatch(/each selected unit dependency is `shipped`.*reachable from the actual delivery base/is);
  });

  it("keeps formal intent approval revision-bound and critique disposition separate", () => {
    const proposalProcess = section(propose, "## Process").replace(/\s+/g, " ")
    const critiqueHandoff = section(critique, "## Handoff").replace(/\s+/g, " ")
    const planProcess = section(plan, "## Process").replace(/\s+/g, " ")
    const orchestration = section(orchestrate, "## Process").replace(/\s+/g, " ")
    const finishPreconditions = section(finish, "## Preconditions").replace(/\s+/g, " ")

    expect(proposalProcess).toMatch(/exact final candidate bytes.*status: approved.*decision: accepted/is)
    expect(proposalProcess).toMatch(/explicit requester decision approving those exact candidate bytes/is)
    expect(proposalProcess).toMatch(/Unattended.*keep formal inputs draft.*do not pass the gate/is)
    expect(critiqueHandoff).toMatch(/`approved`.*`accepted`, `applied`, or `rejected`.*settled/is)
    expect(critiqueHandoff).toMatch(/changes-requested.*settled only when.*`decision: applied`.*`decision: rejected`/is)
    expect(critiqueHandoff).toMatch(/A skipped decision means no owner disposition/is)
    expect(critiqueHandoff).toMatch(/critique disposition never substitutes for explicit revision-bound requester approval/is)
    expect(planProcess).toMatch(/formal proposal\/design\/requirements input.*full commit ID/is)
    expect(planProcess).toMatch(/lint-valid draft.*does not authorize formal intent/is)
    expect(orchestration).toMatch(/formal-intent:[\s\S]*`critique-disposition`[\s\S]*require `settled`/)
    expect(finishPreconditions).toMatch(/explicit `approved` \/ `accepted` metadata.*full-commit plan reference.*requester-held approval reference/is)
    expect(finishPreconditions).toMatch(/optional `critique\.md` exists.*disposition must be settled/is)
    expect(planTemplate).toContain("intent_approvals")
  })

  it("approves a bounded behavioral delta without proposal artifacts and preserves the internal-only path", () => {
    const planProcess = section(plan, "## Process").replace(/\s+/g, " ");
    const planningContext = (
      planProcess
        .split("5. **Gather context.**")[1]
        ?.split("6. **Ask clarifying questions.**")[0] ?? ""
    );
    const tacticalApproval = section(propose, "## Tactical requirements-only approval").replace(/\s+/g, " ");
    const proposalOutput = section(propose, "## Output").replace(/\s+/g, " ");
    const proposalFlow = section(propose, "## Process flow").replace(/\s+/g, " ");

    expect(planningContext).toMatch(/compare the requested externally observable behavior with the canonical spec for each touched capability/i);
    expect(planningContext).toMatch(/record a `Spec impact` decision in the plan `Overview`/i);
    expect(planTemplate).toContain("Spec impact:");
    expect(planningContext).toMatch(/approved minimal `requirements\/<capability>\.md` delta/i);
    expect(planningContext).toMatch(/explicit requester approval tied to the exact committed revision before code dispatch/i);
    expect(planningContext).toMatch(/Internal implementation changes that leave the canonical contract unchanged need no delta or heavyweight proposal/i);
    expect(planningContext).not.toMatch(/behavior-changing tactical task.*does not require `kepler-propose`/i);
    expect(planProcess).toMatch(/If approval is missing or stale, return to `kepler-propose`/i);
    expect(planProcess).toMatch(/requirements-only tactical path.*bounded behavior delta.*no broader proposal or design/i);
    expect(tacticalApproval).toMatch(/called from an explicit `kepler-plan` handoff.*bounded externally observable behavior change/i);
    expect(tacticalApproval).toMatch(/draft or revise only the required `requirements\/<capability>\.md` files.*do not create or edit `proposal\.md`, `design\.md`/i);
    expect(tacticalApproval).toMatch(/exact final candidate bytes.*explicit approval.*commit them/i);
    expect(tacticalApproval).toMatch(/never creates or transfers a route claim.*`kepler-plan` revalidates/i);
    expect(proposalOutput).toMatch(/Requirements-only path: only the approved and committed `requirements\/.*requester-held reference.*No proposal or design is created/i);
    expect(proposalFlow).toContain('"kepler-plan handoff\\n(bounded behavior delta)" -> "Requirements-only tactical path (explicit kepler-plan handoff)"');
    expect(planningContext).toMatch(/If classification is unresolved, stop and ask the requester before finalizing the plan/i);
    expect(changeStateMachine).toContain("PrePlan --> Planned: kepler-plan after spec-impact check; no delta is pending");
    expect(changeStateMachine).toContain("PrePlan --> TacticalDeltaPending: bounded behavior change needs an approved requirements delta");
    expect(changeStateMachine).not.toContain("no delta needed");
  });

  it("blocks init readiness on unresolved migration, facts, standards, or verification commands", () => {
    const initProcess = section(readSkill("kepler-init"), "## Process").replace(/\s+/g, " ");

    expect(initProcess).toMatch(/Check for legacy project data before scaffolding.*run `kepler workbench context --all`.*Stop on any other migration error/is);
    expect(initProcess).toMatch(/verify documented build\/test\/lint commands against current repository evidence or requester input/is);
    expect(initProcess).toMatch(/Do not declare the project ready while migration or any required project fact, standard, or verification command remains unresolved/is);
    expect(initProcess).toMatch(/Unattended assumptions may cover only non-blocking details/is);
    const init = readSkill("kepler-init");
    const initFlow = section(init, "## Process flow");
    const initOutput = section(init, "## Output").replace(/\s+/g, " ");

    expect(initFlow).toContain('"Write AGENTS.md\\n(six standing areas)" -> "Resolve legacy migration"');
    expect(initFlow).toContain('"Resolve legacy migration" -> "Scaffold .kepler/\\n(specs, changes)" [label="resolved"]');
    expect(initFlow).toContain('"Required facts, standards and commands resolved?" -> "Project ready for the pipeline" [label="yes"]');
    expect(initFlow).toContain('"Required facts, standards and commands resolved?" -> "Hold: report gap and preserve work" [label="no"]');
    expect(initFlow).not.toContain('"Record assumptions" -> "Project ready for the pipeline"');
    expect(initOutput).toMatch(/unresolved.*not ready.*preserve.*report/i);
    expect(changeStateMachine).toMatch(/\*\*ProjectReady\*\*.*migration.*required project facts, standards, and verification commands.*resolved/);
  });

  it("preserves task identity and admits only provable initial scaffold recovery", () => {
    const replanning = section(plan, "## Re-plan mode").replace(/\s+/g, " ")
    const recovery = section(plan, "## Initial scaffold recovery").replace(/\s+/g, " ")
    const process = section(plan, "## Process").replace(/\s+/g, " ")

    expect(replanning).toMatch(/Before renaming, inspect.*feedback\.md/is)
    expect(replanning).toMatch(/If it exists, preserve the task title, ID, path, task-progress heading and every feedback pass/is)
    expect(replanning).toMatch(/incomplete or ambiguous, stop for owner diagnosis/is)
    expect(recovery).toContain("scaffold-recovery: eligible")
    expect(recovery).toMatch(/original full pre-scaffold `HEAD`.*authorized breakdown digest\/task IDs/is)
    expect(recovery).toMatch(/no attempt\/feedback\/checkpoint or task-owned work exists since the base/is)
    expect(recovery).toMatch(/Fill only missing files.*preserve every present byte/is)
    expect(recovery).toMatch(/Never synthesize an Attempt/is)
    expect(process).not.toContain("scaffold-recovery: recoverable")
  })

  it("classifies changed-input obligations without treating hashes as authorization", () => {
    const impact = section(plan, "## Input impact and task-local decision context").replace(/\s+/g, " ")
    const driver = section(orchestrate, "## Process").replace(/\s+/g, " ")
    const finishPreconditions = section(finish, "## Preconditions").replace(/\s+/g, " ")

    expect(impact).toMatch(/record `input_impact` with prior\/current blobs, affected unfinished tasks, unaffected tasks, new obligations/is)
    expect(impact).toMatch(/Require an independent review of the impact reasoning and preserve its owner-held reference/is)
    expect(impact).toMatch(/A completed task cannot be rewritten or reclassified as affected/is)
    expect(impact).toMatch(/Commit the impact classification first.*bind affected\/new task Notes to that plan commit/is)
    expect(impact).toMatch(/hashes identify revisions; they do not judge semantic equivalence or authorize work/is)
    expect(driver).toMatch(/`input-impact-history`.*require `verified`/is)
    expect(finishPreconditions).toMatch(/input-impact classification is committed and verified/is)
  })

  it("keeps legacy current confirmation scoped, versioned, and distinct from historical inputs", () => {
    const impact = section(plan, "## Input impact and task-local decision context").replace(/\s+/g, " ")
    const driver = section(orchestrate, "## Process").replace(/\s+/g, " ")
    const finishPreconditions = section(finish, "## Preconditions").replace(/\s+/g, " ")

    expect(impact).toMatch(/committed plan at that task's implementation also has no versioned input context/is)
    expect(impact).toMatch(/`legacy_input_confirmations`.*`historicalInputs: "unknown"`/is)
    expect(impact).toMatch(/keep its existing task block, Notes, IDs, attempts, feedback, and approvals frozen/is)
    expect(impact).toMatch(/Never reconstruct historical hashes/is)
    expect(impact).toMatch(/not authentication or semantic review/is)
    expect(driver).toMatch(/`legacy-current-confirmed`.*not an old snapshot/is)
    expect(finishPreconditions).toMatch(/`legacy_input_confirmations`.*`historicalInputs: "unknown"`.*not historical proof/is)
    expect(dispatch).toContain("[TASK_INPUT_HANDOFF_OR_LEGACY_CONFIRMATION]")
  })

  it("keeps historical execution scheduling serial and independent from numeric task identity", () => {
    const execution = section(plan, "## Serial execution order and prerequisite insertion").replace(/\s+/g, " ")
    const driverPrinciples = section(orchestrate, "## Principles").replace(/\s+/g, " ")
    const driverProcess = section(orchestrate, "## Process").replace(/\s+/g, " ")
    const codeProcess = section(code, "## Process").replace(/\s+/g, " ")

    expect(planTemplate.replace(/\s+/g, " ")).toMatch(/headings, task directories and both root-ledger representations in numeric identity order/is)
    expect(progressTemplate.replace(/\s+/g, " ")).toMatch(/execution sequence is separate from this ledger's physical order/is)
    expect(execution).toMatch(/one serial lane, not a DAG or parallel scheduler/is)
    expect(execution).toMatch(/New task IDs are max\+1/is)
    expect(driverPrinciples).toMatch(/validated explicit version-1 `execution\.order` when present.*otherwise numeric identity order/is)
    expect(driverProcess).toMatch(/historical version-1 serial execution metadata.*validated serial order/is)
    expect(driverProcess).toMatch(/first slot that is not fully gated/is)
    expect(driverProcess).toMatch(/previous sequence-slot task ID and that task's durable fresh approval evidence/is)
    expect(codeProcess).toMatch(/selected slot in the current validated order/is)
    expect(codeProcess).toMatch(/stop without writing or recording a checkpoint/is)
  })

  it("specifies quiescence, scoped partial-work preservation and stale-dispatch rejection", () => {
    const execution = section(plan, "## Serial execution order and prerequisite insertion").replace(/\s+/g, " ")
    const driver = section(orchestrate, "## Process").replace(/\s+/g, " ")
    const code = section(readSkill("kepler-code"), "## Inputs").replace(/\s+/g, " ")

    expect(execution).toMatch(/First quiesce every current task writer/is)
    expect(execution).toMatch(/exact paths and method.*verify the preserved bytes/is)
    expect(execution).toMatch(/do not stage or commit them.*do not use a broad stash.*never discard/is)
    expect(execution).toMatch(/reconcile the preserved work through its original task owner/is)
    expect(driver).toMatch(/required quiescence and exact partial-work preservation\/restoration authority/is)
    expect(code).toMatch(/validated sequence.*selected slot.*prior-slot gate result.*full committed plan revision/is)
  })

  it("binds dispatch identity and admits legacy quality context without rewriting frozen tasks", () => {
    const driver = section(orchestrate, "## Process").replace(/\s+/g, " ")
    const codeProcess = section(code, "## Process").replace(/\s+/g, " ")
    const legacy = section(code, "## Legacy task quality context").replace(/\s+/g, " ")

    expect(dispatch).toContain("[DISPATCH_HEAD]")
    expect(dispatch).toContain("[DISPATCH_BRANCH]")
    expect(dispatch).toContain("[DISPATCH_WORKTREE]")
    expect(dispatch).toContain("[DISPATCH_WORKER]")
    expect(codeProcess).toMatch(/Dispatch identity readback.*before.*checkpoint/is)
    expect(driver).toMatch(/admitted dispatch.*full `HEAD`.*branch.*worktree.*worker/is)
    expect(legacy).toMatch(/dispatch-supplied.*quality.*decision context/is)
    expect(legacy).toMatch(/preserve.*task definition.*Notes.*history/is)
    expect(legacy).toMatch(/does not add acceptance criteria.*change.*Files/is)
    expect(legacy).toMatch(/new tasks.*task block/is)
    const feedbackInputs = section(feedback, "## Inputs").replace(/\s+/g, " ")
    const feedbackPrompt = readFileSync("skills/kepler-orchestrate/references/code-feedback-prompt.md", "utf8")
    expect(feedbackInputs).toMatch(/legacy task.*same verified dispatch-supplied quality and decision context used by code/is)
    expect(feedbackInputs).toMatch(/never require rewriting the frozen block.*legacy compatibility never waives/is)
    expect(feedbackPrompt).toContain("[TASK_QUALITY_DECISION_CONTEXT]")
    expect(driver).toMatch(/same verified quality\/decision context used by code.*latest attempt's criterion\/check evidence/is)
  })

  it("supplies commit-attributed peer approval without hiding overlapping task changes", () => {
    const prompt = readFileSync("skills/kepler-orchestrate/references/code-feedback-prompt.md", "utf8")
    const bounded = section(feedback, "## Bounded inspection").replace(/\s+/g, " ")
    const process = section(feedback, "## Process").replace(/\s+/g, " ")
    const driver = section(orchestrate, "## Process").replace(/\s+/g, " ")

    expect(prompt).toContain("[PEER_APPROVED_COMMIT_PATH_CONTEXT_OR_NONE]")
    expect(driver).toMatch(/peer-approved.*commit.*path.*approval/is)
    expect(bounded).toMatch(/full cumulative range.*commit-attributed/is)
    expect(bounded).toMatch(/Never exclude whole filenames/is)
    expect(bounded).toMatch(/overlapping.*unapproved.*changes/is)
    expect(process).toMatch(/verify.*peer.*feedback.*commit.*paths/is)
  })

  it("covers T35–T39 scheduling, freeze, recovery, malformed-order, and cumulative-range controls", () => {
    const execution = section(plan, "## Serial execution order and prerequisite insertion").replace(/\s+/g, " ")
    const replanning = section(plan, "## Re-plan mode").replace(/\s+/g, " ")
    const recovery = section(plan, "## Initial scaffold recovery").replace(/\s+/g, " ")
    const driver = section(orchestrate, "## Task resume matrix").replace(/\s+/g, " ")
    const feedback = section(readSkill("kepler-code-feedback"), "## Bounded inspection").replace(/\s+/g, " ")
    const checkpoints = section(readSkill("kepler-code"), "## Process").replace(/\s+/g, " ")

    expect(execution).toMatch(/Task 4 receives its own exact code\/TDD\/feedback cycle before Task 2 resumes/is)
    expect(execution).toMatch(/cannot expand Task 2's Acceptance or Files/is)
    expect(replanning).toMatch(/done.*frozen.*do not alter their task definition, title, status row, identifier, link, directory, or task-local history/is)
    expect(execution).toMatch(/Preserve every old task definition\/title\/path\/history and existing fully gated prefix/is)
    expect(recovery).toMatch(/any task has begun.*stop for owner diagnosis/is)
    expect(execution).toMatch(/Unknown versions, malformed explicit order, forward\/cyclic dependencies.*hold without numeric fallback/is)
    expect(driver).toMatch(/earliest active task that is not fully gated/is)
    expect(checkpoints).toMatch(/canonical Base from the first parent/is)
    expect(feedback).toMatch(/stable task diff package is the inspection boundary/is)
    expect(feedback).toMatch(/stable task diff package is the inspection boundary.*Judge the changed lines against the task's acceptance criteria/is)
    expect(execution).toMatch(/Task 4 receives its own exact code\/TDD\/feedback cycle/is)
  })
})
