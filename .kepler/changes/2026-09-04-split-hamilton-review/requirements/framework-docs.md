# Capability: framework-docs

The maintained documentation that presents Hamilton's pipeline, each skill's role, the artifact layout, and the contributor mapping needed to keep those descriptions synchronized; this change makes task execution, task feedback, whole-branch review, and finish history explicit.

## ADDED Requirements

### Requirement: Migration guidance makes the artifact split a between-changes upgrade

The documentation SHALL tell users adopting the split to update the Hamilton skills, templates, and helper scripts as one compatible set between changes; replace every task-scoped `hamilton-review` invocation with `hamilton-code-feedback`; use root `progress.md` only as the task index and ledger; use `tasks/task-N/progress.md` and `tasks/task-N/feedback.md` for new task histories; reserve root `review.md` for the final whole-branch gate; and use root `finish.md` for finish history. It SHALL state that legacy mixed `review.md` and monolithic root-progress change directories are not converted, resumed, or accepted by new execution and finish contracts; context inventory may label them `legacy-unsupported` without parsing their state.

- Priority: must
- Rationale: the selected clean break keeps each contract simple, but users need an actionable boundary that prevents mixing incompatible artifact generations inside one change.

#### Scenario: User upgrades before starting a change

- WHEN a user reads the migration guidance and updates the complete Assisted-mode bundle before creating a new change
- THEN the documented pipeline uses the seven-step skill set, task index, nested task histories, and change-level review and finish artifacts end to end

#### Scenario: User has an active change in the old format

- WHEN a user reads the migration guidance while a change still stores detailed attempts in root progress or task verdicts in root review
- THEN the guidance tells them to finish that change with its existing Hamilton version rather than switch formats mid-change

## MODIFIED Requirements

### Requirement: Pipeline identity presents seven core skills in fixed sequence

The framework documentation SHALL present seven core skills in the fixed sequence `init`, `propose`, `plan`, `code`, `code-feedback`, `review`, and `finish-work`. `hamilton-init` SHALL remain step 0, `hamilton-propose` step 1, `hamilton-plan` step 2, `hamilton-code` step 3, `hamilton-code-feedback` step 4, `hamilton-review` step 5, and `hamilton-finish-work` step 6. Pipeline diagrams and narrative SHALL show the per-task `code` ↔ `code-feedback` loop followed by one whole-branch `review` before finish-work. The optional Wayfinder stage and optional critique gate SHALL remain outside the core count.

- Priority: must
- Rationale: the user explicitly chose to promote task feedback into the public pipeline rather than hide it as an orchestration helper.

#### Scenario: Reader opens a pipeline overview

- WHEN a reader opens `README.md`, `docs/skills.md`, `docs/sdd-framework.md`, or `docs/modes.md`
- THEN the core count, sequence, step numbers, loop, and final whole-branch gate agree on the seven-skill identity

#### Scenario: Reader distinguishes optional stages

- WHEN the pipeline overview mentions Wayfinder or `hamilton-critique`
- THEN neither is counted as an eighth core skill or inserted into the fixed seven-step sequence

### Requirement: Skill reference documents execution and review ownership

Every skill entry in `docs/skills.md` SHALL retain the established heading, role and step tag, introduction, When, Inputs, Produces, Notes, and Source shape. `hamilton-plan` SHALL document that it initializes root progress and each task progress file; `hamilton-code` SHALL document its assigned-row status transitions and task-local attempt log; `hamilton-code-feedback` SHALL have a step-4 entry describing one-task diff scope, reviewed-head freshness, and `tasks/task-N/feedback.md`; `hamilton-review` SHALL have a step-5 entry describing mandatory broader repository inspection, reviewed-head freshness, and root `review.md`; `hamilton-orchestrate` SHALL document its combined progress, verdict, and freshness resume matrix and whole-review-to-re-plan loop; and `hamilton-finish-work` SHALL appear as step 6, name all completion, freshness, and approval gates, and document paired attempt/outcome persistence and dangling-attempt recovery in `finish.md` rather than a root-progress entry.

- Priority: must
- Rationale: scan-friendly peer entries expose each lifecycle owner at the same surface where users discover every other pipeline skill.

#### Scenario: Reader looks up task execution

- WHEN a reader opens the plan or code entry
- THEN they learn that plan initializes the root task ledger and task files while code updates only its assigned root row and task-local progress history

#### Scenario: Reader looks up task feedback

- WHEN a reader opens the skills reference after a task implementation
- THEN the `hamilton-code-feedback` entry directs them to the task diff, task-local implementation evidence, and `tasks/task-N/feedback.md`, not to `hamilton-review` or a root-progress summary

#### Scenario: Reader looks up the merge gate

- WHEN a reader opens the `hamilton-review` entry
- THEN it describes the whole branch, broader repository impact inspection, root `review.md`, and step 5 without advertising task-diff behavior or a progress summary

#### Scenario: Reader looks up completion

- WHEN a reader opens the finish-work entry
- THEN it describes root progress as the implementation ledger, task feedback and root review as separate gates, and root `finish.md` as the finish history

### Requirement: Artifact and contributor documentation tracks the split surfaces

The framework artifact layouts SHALL show root `progress.md` as the task index; `tasks/task-N/progress.md` as detailed implementation history; `tasks/task-N/feedback.md` as tactical verdict history; root `review.md` as whole-branch review; and root `finish.md` as finish history. They SHALL explain that `plan.md` remains the declarative task contract while progress is a required operational ledger initialized by planning. `CONTRIBUTING.md` SHALL map new or changed Assisted-mode skills to `docs/skills.md`, and SHALL continue mapping template changes to `docs/sdd-framework.md`; the README SHALL change whenever the quick-start sequence or artifact tree changes.

- Priority: must
- Rationale: the split crosses skill and template surfaces, so contributors need deterministic documentation destinations and readers need the same artifact tree the helpers enforce.

#### Scenario: Contributor changes an Assisted-mode skill

- WHEN a contributor consults the Mapping Code to Docs table for a change under `skills/hamilton-*/`
- THEN the table directs them to update `docs/skills.md`

#### Scenario: Reader inspects an artifact tree

- WHEN a maintained framework document shows a change directory
- THEN it places task execution and feedback under the same `tasks/task-N/` owner, labels root progress as the current task ledger, and reserves root review and finish for their change-level histories

#### Scenario: Reader asks which artifact is declarative

- WHEN the documentation contrasts plan and progress
- THEN it identifies `plan.md` as the task handoff contract and root progress plus linked task logs as execution state and evidence rather than a second plan

## REMOVED Requirements

### Requirement: Pipeline identity presents six core skills

- Reason: `hamilton-code-feedback` is promoted to core step 4, shifting review and finish-work to steps 5 and 6.
- Migration: replace six-step diagrams and task-scoped review language with the seven-step pipeline and explicit code-feedback loop.

### Requirement: README and SDD framework diagrams remain unchanged when skill inventory grows

- Reason: that prior constraint applied to Wayfinder's optional pre-change status; this change deliberately alters the core pipeline identity and therefore must update every core diagram.
- Migration: preserve Wayfinder outside the core line while redrawing the line itself for `code-feedback` and the whole-branch review gate.

### Requirement: Root progress is the append-only history for every execution stage

- Reason: root progress becomes a compact task index, while task attempts, task feedback, whole-branch review, and finish outcomes each have their own owner artifact.
- Migration: update examples and skill entries to follow root task links and consult `feedback.md`, `review.md`, or `finish.md` for the relevant history.

## RENAMED Requirements

*(none)*
