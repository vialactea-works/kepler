# Capability: review

The pipeline behavior that gives one implemented task tactical feedback, gives the completed branch a broad final review, and makes both approvals independently visible to the finish gate without mixing either history into task execution progress.

## ADDED Requirements

### Requirement: Task-scoped code feedback is a distinct pipeline step

The system SHALL expose `hamilton-code-feedback` as core pipeline step 4. One invocation SHALL accept exactly one plan task identified as `Task N`, that task's diff package, task-local `tasks/task-N/progress.md` as the implementer's durable evidence, binding constraints, change directory, and project standards. The orchestration contract SHALL NOT require a separate detailed implementer report file; the implementer SHALL return only concise status and commit information outside the task log. A whole-branch request SHALL be outside this skill's contract and SHALL stop with direction to use `hamilton-review`.

- Priority: must
- Rationale: a distinct entry point prevents a tactical reviewer from accidentally acting as the merge gate and makes the scope clear before inspection begins.

#### Scenario: One task is submitted for feedback

- WHEN `hamilton-code-feedback` receives `Task 3` and the diff range recorded for that task
- THEN it reviews only Task 3 under the task-feedback contract, reads only Task 3's implementation evidence, and identifies its verdict artifact as `tasks/task-3/feedback.md`

#### Scenario: Implementer finishes a task

- WHEN the implementer has recorded changed paths, verification evidence, and concerns in `tasks/task-3/progress.md`
- THEN orchestration passes that file to code feedback as the detailed claim source and does not create or require a duplicate report file

#### Scenario: Whole-branch input is sent to code feedback

- WHEN `hamilton-code-feedback` receives a whole-branch diff without exactly one `Task N`
- THEN it stops without recording a verdict and directs the caller to `hamilton-review`

### Requirement: Task feedback remains diff-scoped

`hamilton-code-feedback` SHALL judge the task's implementation against that task's acceptance criteria, cited requirements and design constraints, task-local implementation claims, project standards, and changed lines. It SHALL treat the diff package as its inspection boundary and SHALL NOT crawl the broader repository except to check one concrete, named risk raised by the changed code. It SHALL report information that cannot be verified within that boundary as `cannot verify from diff` for the driver to adjudicate.

- Priority: must
- Rationale: bounded tactical feedback stays fast, attributable to one task, and suitable for the per-task loop.

#### Scenario: An unchanged consumer may be affected

- WHEN a task diff suggests an unchanged consumer may violate a concrete changed contract
- THEN code feedback may inspect that named consumer and no unrelated repository area, recording an unresolved broader impact as `cannot verify from diff`

#### Scenario: No concrete cross-file risk exists

- WHEN the task diff and supplied context establish no concrete risk outside the changed lines
- THEN code feedback completes without a repository-wide search

### Requirement: Task feedback has task-owned verdict history

Each `hamilton-code-feedback` pass SHALL append one dated section to `<change-dir>/tasks/task-N/feedback.md`, whose heading SHALL declare the same `Task N`, record the full base and head commit identifiers from the task diff package on `Base:` and `Head:` lines, use `Verdict: approved` or `Verdict: changes-requested`, separate blocking findings from suggestions, and locate each finding precisely. It SHALL commit that feedback file and no code or sibling task artifact in an artifact-only bookkeeping commit before handoff. The task directory segment SHALL encode `Task N` as lowercase `task-N`. The physically last pass in that file SHALL govern the task's feedback status only when the file identity, pass shape, verdict, findings, and reviewed range are valid and fresh; a malformed last pass SHALL fail closed and SHALL NOT fall back to an earlier approval. Code feedback SHALL NOT append a summary to root or task-local progress and SHALL NOT change the root task status.

- Priority: must
- Rationale: ownership by task and append-only passes make the feedback source unambiguous while retaining review history and keeping progress devoted to implementation state.

#### Scenario: Feedback requests changes and later approves

- WHEN `tasks/task-2/feedback.md` contains an earlier `changes-requested` pass followed by an `approved` pass with no blocking findings
- THEN Task 2's current feedback status is approved and both passes remain in the file

#### Scenario: Approved feedback contains a blocking finding

- WHEN the latest pass says `approved` but its Blocking section contains a finding
- THEN the feedback is contradictory and the finish gate treats Task N as unapproved

#### Scenario: Code feedback records a verdict

- WHEN either feedback verdict is appended for Task 2
- THEN code feedback commits only `tasks/task-2/feedback.md` before handoff, and neither root `progress.md` nor `tasks/task-2/progress.md` receives a feedback summary or status change

#### Scenario: Latest feedback pass is malformed

- WHEN an earlier pass is approved but the physically last Task 2 pass omits a required field or declares another task
- THEN Task 2 feedback is malformed and consumers do not fall back to the earlier approval

#### Approved bootstrap disposition for this change

For `.hamilton/changes/2026-09-04-split-hamilton-review/` only, whole-branch re-review MAY accept the existing artifact-only feedback commits for Tasks 1–13 even though later task implementation preceded those commits. This disposition accepts only that already-incurred chronology. Each pass remains subject to every identity, grammar, verdict, finding, reviewed-range, freshness, and tracked-at-HEAD requirement, and Task 14 and every new remediation task SHALL follow the ordinary feedback-before-next-checkpoint sequence. Existing commits SHALL NOT be rewritten or reordered to simulate compliance.

The approved change artifacts carry this disposition; no producer, parser, orchestrator, or finish gate receives a compatibility branch. The disposition resolves only the chronology finding. The legacy-parser finding remains among whole-branch review Pass 1's other 17 blocking findings and still requires fallback removal plus exact Task 1 and Task 4 normalization. No other finding or gate is waived.

### Requirement: Unverified task impact is resolved before approval

A `cannot verify from diff` item SHALL remain a blocking unresolved item under `changes-requested`; code feedback SHALL NOT issue `approved` while such an item remains. The driver SHALL inspect only the concrete named risk with its cross-task context. If the risk reveals a code gap, it SHALL return the task to code; if the risk is satisfied, it SHALL provide the located evidence and re-dispatch code feedback so a new append-only pass can approve the reviewed head without the unresolved item.

- Priority: must
- Rationale: preserving two verdict values requires an unverified acceptance criterion to block advancement until evidence or code resolves it; silently treating it as a suggestion would launder an unknown through the task gate.

#### Scenario: Reviewer cannot establish a requirement from the task diff

- WHEN code feedback cannot verify a named requirement within its bounded diff and concrete-risk allowance
- THEN it records `changes-requested` with a blocking `cannot verify from diff` item and the driver does not advance the task

#### Scenario: Driver finds confirming cross-task evidence

- WHEN the driver locates evidence that resolves the named item without a code change
- THEN it re-dispatches code feedback with that evidence and only a new valid pass without the unresolved item may approve

#### Scenario: Driver confirms a behavior gap

- WHEN the concrete inspection confirms the requirement is not satisfied
- THEN the task returns to code with the located gap before another feedback pass

### Requirement: Task feedback freshness follows task implementation

The system SHALL resolve the latest implementation commit for a task as the latest commit that touched `tasks/task-N/progress.md` and SHALL treat the latest feedback pass as fresh only when its recorded base and head are valid full commit identifiers, the base is an ancestor of the head, the head is an ancestor of current `HEAD`, and the head contains that implementation commit. A later code attempt that touches the task progress file SHALL make every earlier feedback pass stale regardless of verdict. Stale feedback SHALL require a new `hamilton-code-feedback` pass and SHALL NOT authorize advancement or finish. The whole-branch freshness waiver SHALL NOT waive task feedback freshness.

- Priority: must
- Rationale: verdict value alone cannot distinguish unresolved requested changes from a corrected task awaiting re-review; binding each pass to its reviewed head makes resume and finish deterministic.

#### Scenario: Correction follows changes-requested feedback

- WHEN feedback requests changes at head A and a correction commit B later updates the task progress file
- THEN the pass at A is stale and orchestration dispatches code feedback for B rather than immediately dispatching another code correction

#### Scenario: Approved feedback predates later task code

- WHEN feedback approves a head that does not contain the task's latest progress commit
- THEN the approval is stale and neither orchestration nor finish treats the task as feedback-approved

#### Scenario: Unrelated later task commits exist

- WHEN Task 1 feedback reviewed a head containing Task 1's latest progress commit and later commits touch only other tasks
- THEN Task 1 feedback remains fresh because its reviewed head still contains Task 1's latest implementation commit

### Requirement: Whole-branch review is a distinct pipeline gate

The system SHALL expose `hamilton-review` as core pipeline step 5 and SHALL accept only the complete branch change against its merge base, the change-level proposal, requirements, design, plan and root task ledger that exist, every active task's latest implementation attempt and feedback concerns, project standards, and the complete branch diff. It MAY open older task attempts or feedback passes when the latest evidence identifies a concrete historical question. A task-scoped invocation SHALL stop without recording a verdict and direct the caller to `hamilton-code-feedback`.

- Priority: must
- Rationale: the final gate must identify itself as broader than any task and must not preserve the dual-scope behavior that caused the ambiguity.

#### Scenario: Complete branch is submitted for review

- WHEN `hamilton-review` receives the whole branch diff from the merge base through current HEAD
- THEN it runs the whole-branch contract and records its verdict in `<change-dir>/review.md`

#### Scenario: Task diff is sent to whole-branch review

- WHEN `hamilton-review` receives `Task 3` or a task-only diff range
- THEN it stops without recording a verdict and directs the caller to `hamilton-code-feedback`

### Requirement: Whole-branch review always inspects repository impact beyond the diff

`hamilton-review` SHALL use the complete branch diff as its starting evidence rather than its inspection boundary. Every pass SHALL inspect the broader repository for affected consumers and assumptions, cross-task integration, requirement and design completeness, missing documentation or specification updates, scope and boundary violations, and behavior that should have changed but did not appear in the diff. Findings SHALL identify both the changed cause and the affected location when they differ.

- Priority: must
- Rationale: the whole-branch gate exists to catch interactions and omissions that no isolated task diff can prove.

#### Scenario: Changed interface has an unchanged consumer

- WHEN the branch changes a public interface and an unchanged consumer still relies on the prior contract
- THEN whole-branch review inspects that consumer and records a located blocking finding even though the consumer is absent from the diff

#### Scenario: Tasks pass independently but fail to compose

- WHEN every task feedback artifact is approved but the combined branch violates a cross-task design invariant
- THEN whole-branch review records `changes-requested` with the integration failure and required correction

### Requirement: Whole-branch review runs focused verification only when warranted

`hamilton-review` SHALL evaluate the implementers' task-local test evidence and the adequacy of changed tests, and MAY run a focused check when repository inspection raises a concrete doubt. It SHALL NOT require a full test-suite or build run as part of every review pass; `hamilton-finish-work` SHALL remain responsible for mandatory full verification.

- Priority: must
- Rationale: review needs enough execution to resolve specific uncertainty without duplicating the deterministic final verification gate on every pass.

#### Scenario: Inspection raises a concrete behavioral doubt

- WHEN whole-branch inspection finds a specific path whose behavior is uncertain from code and existing evidence
- THEN the reviewer may run the narrowest focused test that resolves that doubt and records the result

#### Scenario: No concrete doubt remains

- WHEN the branch diff, broader inspection, and supplied evidence establish the verdict without execution
- THEN the reviewer does not rerun the full suite or build and leaves that mandatory verification to finish-work

### Requirement: Whole-branch review has a change-owned verdict history

Each `hamilton-review` pass SHALL append one dated whole-branch section to `<change-dir>/review.md`, record the full merge base and head commit identifiers from the branch diff package on `Base:` and `Head:` lines, use `Verdict: approved` or `Verdict: changes-requested`, separate blocking findings from suggestions, and locate each finding precisely. It SHALL commit `review.md` and no code or task artifact in an artifact-only bookkeeping commit before handoff. For freshness, the latest material change commit SHALL mean the latest current-branch commit touching any tracked path except this change's root `progress.md`, `tasks/task-N/progress.md`, `tasks/task-N/feedback.md`, root `review.md`, and root `finish.md` bookkeeping paths. Proposal, requirements, design, plan, canonical specs, maps, application code, tests, skills, templates, scripts, and documentation SHALL remain material regardless of whether their paths are under `.hamilton/`. The physically last pass SHALL govern whole-branch status only when its shape, verdict, findings, and range are valid, the base is an ancestor of the head, the head is an ancestor of current `HEAD`, and the head contains that latest material change commit; a malformed last pass SHALL fail closed and SHALL NOT fall back to an earlier approval. Whole-branch review SHALL NOT append a summary to root progress or any task-local progress file and SHALL NOT change task implementation statuses.

- Priority: must
- Rationale: one file owns the final branch-level decision while preserving the history of fixes and re-reviews without polluting execution state.

#### Scenario: Whole-branch findings are fixed and re-reviewed

- WHEN `review.md` contains an earlier `changes-requested` pass followed by an `approved` pass with no blocking findings
- THEN the current whole-branch status is approved and both passes remain in the file

#### Scenario: Whole-branch review is absent

- WHEN no `review.md` exists for a completed change
- THEN the finish gate reports that whole-branch review is missing and remains closed

#### Scenario: Whole-branch review records a verdict

- WHEN either whole-branch verdict is appended
- THEN review commits only root `review.md` before handoff while root progress and every task-local progress file remain unchanged

### Requirement: Orchestration runs both review contracts in order

`hamilton-orchestrate` SHALL dispatch `hamilton-code-feedback` after a `hamilton-code` attempt leaves the task row `done` and SHALL loop the same task through code and feedback until that task is `done` and its latest feedback is both `approved` and fresh before advancing. After every active task satisfies that pair, it SHALL dispatch `hamilton-review` on the complete branch. If whole-branch review requests implementation changes consistent with the approved requirements and design, the orchestrator SHALL invoke `hamilton-plan` in re-plan mode with the complete findings, append one or more numbered remediation tasks, initialize their ledger rows and task progress files, and run each through the ordinary code and code-feedback loop before repeating whole-branch review. If a finding requires changing approved requirements or design, the orchestrator SHALL stop and return the artifacts to `hamilton-propose` rather than planning around the defect. It SHALL NOT run an ownerless final fix wave, assign the findings retroactively to frozen completed tasks, or create a synthetic task absent from `plan.md`. Each dispatch SHALL use a scope-specific prompt and artifact destination.

On start or resume after all active tasks are done with fresh approved feedback, orchestration SHALL inspect the latest physical whole-branch review pass before acting. An absent, malformed, or stale pass SHALL route to whole-branch review; a fresh `changes-requested` pass SHALL route its findings through re-plan or the upstream-defect stop; and only a fresh `approved` pass with no blocking findings SHALL hand off to finish-work. Orchestration SHALL NOT rerun approved current work merely because conversation history was lost.

- Priority: must
- Rationale: explicit orchestration is the executable boundary between implementation state, tactical feedback, and the final merge gate.

#### Scenario: Task feedback requests changes

- WHEN Task 2 is `done` and receives `changes-requested`
- THEN the orchestrator re-dispatches `hamilton-code` on Task 2 with `tasks/task-2/feedback.md`, the task returns through `in-progress` to `done` or `blocked`, and code feedback repeats before Task 3 begins

#### Scenario: All task feedback is approved

- WHEN every active plan task is `done` and its latest feedback verdict is approved and fresh for its latest task progress commit
- THEN the orchestrator packages the whole branch and dispatches `hamilton-review` exactly once for the next pass

#### Scenario: A future task advances to the next checkpoint

- WHEN task feedback is recorded for Task N after this bootstrap disposition
- THEN its artifact-only feedback commit exists before the next task checkpoint is recorded, whether Task N is a remediation task in this change or belongs to any future planned change

#### Scenario: Whole-branch review requests changes

- WHEN the final review reports one or more blocking findings
- THEN the orchestrator invokes re-plan mode with the complete finding set, appends appropriately sized numbered remediation tasks, runs each through code and code feedback, and reruns whole-branch review

#### Scenario: Final findings span independent fixes

- WHEN the final review findings require more than one independently verifiable correction
- THEN re-plan appends more than one remediation task rather than bundling them into one fix wave, and every new task receives its own progress and feedback files

#### Scenario: Final finding invalidates approved design

- WHEN the final review identifies a defect that cannot be corrected without changing an approved requirement or design decision
- THEN orchestration stops and returns to `hamilton-propose` for artifact revision and approval instead of asking re-plan or code to deviate

#### Scenario: Resume after all tasks but before whole-branch review

- WHEN every active task is done with fresh approved feedback and `review.md` is absent or its latest pass is stale
- THEN orchestration dispatches `hamilton-review` rather than reimplementing a task or handing off to finish-work

#### Scenario: Resume after fresh whole-branch changes requested

- WHEN every active task is done with fresh approved feedback and the latest whole-branch pass is fresh `changes-requested`
- THEN orchestration routes its complete findings through re-plan or the upstream-defect stop before another review

#### Scenario: Resume after fresh whole-branch approval

- WHEN every active task is done with fresh approved feedback and the latest whole-branch pass is fresh `approved` with no blocking findings
- THEN orchestration preserves the existing work and hands off to `hamilton-finish-work`

### Requirement: Finish requires current implementation and both approval classes

`hamilton-finish-work` SHALL keep the gate closed unless root progress structurally matches the active plan and marks every active task `done`, every active `Task N` has a corresponding `tasks/task-N/feedback.md` whose latest verdict is `approved` with no blocking findings and whose valid reviewed range is on the current branch and contains that task's latest progress commit, and `<change-dir>/review.md` has a latest whole-branch verdict of `approved` with no blocking findings whose valid reviewed range is on the current branch and contains the latest material change commit. The existing whole-branch freshness waiver SHALL bypass only the requirement that the final review head contain the latest material change commit; it SHALL NOT waive malformed or off-branch range metadata and SHALL NOT satisfy invalid progress, a non-done task, stale task feedback, or missing, contradictory, or unapproved feedback or whole-branch review.

Freshness SHALL be evaluated immediately before finish-work opens its gate. After it opens, finish-work MAY apply only its specified deterministic mutations derived from the approved change artifacts: canonical spec synchronization, route and map completion state, and numbered finish history. Those finish-owned mutations SHALL NOT retroactively stale the gate. Any other material edit before the finish strategy completes SHALL abort the attempt and require a fresh whole-branch review before retry.

- Priority: must
- Rationale: split storage must preserve or strengthen the guarantee that implementation claims or tactical approvals alone never authorize finish.

#### Scenario: One task is not done

- WHEN all feedback and whole-branch verdicts are approved but root progress marks Task 3 `blocked`
- THEN finish-work names Task 3 as incomplete and keeps the gate closed

#### Scenario: One task feedback file is missing

- WHEN every task is `done` and whole-branch review is approved but `tasks/task-3/feedback.md` is absent
- THEN finish-work names Task 3 as never approved and keeps the gate closed

#### Scenario: One task feedback approval is stale

- WHEN every task is `done` but Task 3's latest approved feedback head does not contain Task 3's latest progress commit
- THEN finish-work names Task 3's feedback as stale and keeps the gate closed without applying the whole-branch freshness waiver

#### Scenario: Task feedback passes but whole-branch review is stale

- WHEN all task rows and feedback are approved but code changed after the latest approved `review.md` pass
- THEN finish-work reports stale whole-branch review and keeps the gate closed

#### Scenario: User explicitly waives stale-review freshness

- WHEN the progress ledger is valid, all task feedback and whole-branch verdicts are approved without blocking findings, a material change is newer than the reviewed head, and the user explicitly invokes the existing freshness waiver
- THEN only the ancestry freshness check is waived and finish-work records the waiver in `finish.md` while evaluating every other precondition normally

#### Scenario: All review gates are current

- WHEN the valid root ledger marks every active task `done`, every latest task feedback is approved without blocking findings, and the latest whole-branch review is approved without blocking findings and its reviewed head contains the latest material change commit
- THEN the implementation and review preconditions pass and finish-work may continue to its remaining gates

#### Scenario: Finish-work synchronizes approved specs after gate entry

- WHEN the review gate opens and finish-work changes canonical specs and route state only as derived from the approved artifacts
- THEN those specified finish-owned mutations do not require another whole-branch review before the same finish attempt continues

#### Scenario: Unrelated material edit appears after gate entry

- WHEN any other material path changes before the finish strategy completes
- THEN finish-work aborts the attempt and requires a new whole-branch review before retrying

## MODIFIED Requirements

*(none)*

## REMOVED Requirements

*(none)*

## RENAMED Requirements

*(none)*
