# Change-state-machine implementation handoff

## Current implementation continuation

The remaining A1–A18 source and resource work is implemented on top of checkpoint
`8de197a97609` on `fix/finish-work-gates`. This continuation preserves the earlier implementation
and the historical STPA plan. It does not complete the paused persistent goal or claim native
workflow acceptance. The older checkpoint observations and limits below remain historical evidence;
the current inventory supersedes their missing-implementation and current-checkout-only claims.

### Action inventory

| Action | Current implementation |
| --- | --- |
| A1 | Shared root metadata/table consistency, phase-sensitive handoff checks and coder-owned repair. |
| A2 | Unique terminal Outcome, durable task evidence and resolvable implementation; context now uses the same durability/checkpoint boundary. |
| A3 | Typed finding classification before freshness, useful-input retry rules and owner routing; removed unconditional feedback redispatch. |
| A4 | Modern full baseline, retained bounded history and complete resolution/correction coverage; context explicitly reports range freshness without claiming clearance. |
| A5 | Applicable quality, repository and optional-memory decisions in planner/code/reviewer handoffs. |
| A6 | Admission rechecks captured HEAD, branch and worktree; finish consumes the verified identity. |
| A7 | Journaled Attempt before effects, separate artifact-only pairs, immutable history, original admission revalidation, linked repair and changed retry evidence. |
| A8 | Historical canonical shipping qualification, paired-delivery compatibility, exact named route/map effects and sibling preservation. |
| A9 | Required full target ref and actual merge-base scope in ordinary admission; historical target for repair. |
| A10 | Focused mechanical regressions; native actor evaluation remains separate and requires approval for selected cases. |
| A11 | Revision-bound formal approval and critique disposition; tactical absence does not invent formal approval. |
| A12 | Feedback-bearing identity freeze, immutable done history and abandon-plus-new-ID planning rules. |
| A13 | Original pending/history-free initialization proof and missing-path-only recovery; staged scaffold/input/source/checkpoint state now holds for its owner. |
| A14 | Explicit current-input classification, retained obligations and reviewed impact amendments. |
| A15 | Route metadata/body graph coherence, canonical binding and owner-controlled dependency/causal checks. |
| A16 | Named source/target role, claims on visible local/remote refs and linked worktrees, and owner-controlled transfer/retention/cleanup. |
| A17 | Shared historical Base verification across diff, admission and context; no cropped or invented checkpoint. |
| A18 | Immutable IDs with validated serial execution order, gated prefix and prerequisite/partial-work handoffs. |

### Continuation changes and compatibility

- Finish admission refuses deleted or downgraded history, untyped modern suffixes, same-commit
  Attempt/Outcome pairs, and additions/removals of original task/intent/review evidence.
- Repair requires current route/map bytes to match their committed artifacts, observes already-persisted
  effects, rejects omitted pending route/map/history effects, and preserves sibling state. Visible claim discovery covers committed local/remote refs
  and linked worktree bytes. Same-change copies require admitted ref/worktree identities.
- The historical route must contain one matching `- Qualification: merge`,
  `- Qualification: request-open` or `- Qualification: no-op` line. Missing old provenance requires
  owner adjudication, not rewriting admitted history. Additional owner rules remain required.
- Later failed repairs require `Retry evidence`, copied from CLI `retry-evidence`: latest failed
  Outcome commit, entry HEAD, changed remaining paths and/or the original request's observed merge.
  The paired Outcome must retain that delivery evidence. Unverifiable external conditions hold.
- Request readback checks actual Head containment and its exact finish-owned mutation boundary;
  ancestry alone cannot admit added application work.
- Skills, templates and state-machine wording carry these predicates together. No dependency,
  installation, deployment, commit, push, real provider effect or real-user data change was made.

### Narrow checks performed in this continuation

| Check | Observed result |
| --- | --- |
| Finish records, route and visible-claim unit files | 39 passed |
| Context units selected by `initial recovery\|pending .*during initial\|physical\|feedback\|hybrid` | 21 passed, 28 skipped |
| Precondition units selected by `repair` | 17 passed, 163 skipped |
| `bun run build` | Core and CLI TypeScript builds passed |
| `git diff --check` | Passed |
| Protected historical prefix | First 174211 bytes retain SHA-256 `0772ea0009cc49ca5b41ab0a92d6f70a87ed23998b80804049a10a98a2c6e63a` |

The retry-evidence regression first reproduced acceptance of a regressed Outcome, then passed with
the fix and a matching merged control. Two new positive fixtures initially violated existing route
heading/current-format status contracts; the fixtures were corrected without weakening validation.
Active LSP probing reported no diagnostics but could not confirm five push-only files; the successful
TypeScript build supplies the compilation check.

No broad smoke/full suite, skill contract/behavior evaluation, native lifecycle scenario, compiled
repair replay or end-to-end provider delivery was run, as requested. T1–T39 remain `not-run` at the
actor/provider layer. Authentication, semantic adjudication, real preservation/transfer and native
dispatch behavior are not inferred from source, unit fixtures or inspection reports. No known
implementation action is intentionally omitted; those acceptance activities remain unperformed
because the current request excludes them. Earlier `.pi/verification/mv2elq7d-jczez0` outputs were
not available here and were not counted as current verification.

## Checkpoint and status

This is an unfinished implementation checkpoint, recorded on 2026-10-12. It accompanies [the STPA plan](change-state-machine-stpa-plan.md); it does not replace that plan or certify its acceptance criteria.

- Branch: `fix/finish-work-gates`.
- Previous committed baseline: `e753fab72193aabd80b5be16ce9d43886195b7a9`.
- Goal: `mv2elq7d-jczez0`, paused by the user, with **2 of 7 milestones complete**.
- Completed milestones: contract rollout and evidence gates.
- Unfinished milestones: planning/execution, review clearance, route ownership, finish/recovery, and integration verification.
- Last execution focus: finish/recovery (A7/A8). Switching focus did not complete the other milestones.

The checkpoint commit includes implementation, coordinated resources, tests, and this handoff. Local `.pi/` goal state, harnesses, logs, and runtime records are intentionally excluded. Those records remain in this worktree but will not accompany a fresh clone. The observations below therefore distinguish repository tests from locally retained evidence.

No installation, deployment, publishing, push, repository merge, real provider delivery, or modification of real-user `.kepler` data formed part of this work. Git merge and provider scenarios used isolated fixtures or substitutes.

## Implemented work

### Evidence and revision gates: A1, A2, A6, A17

Implemented coordinated readers and producers for replicated task state, unique terminal fields, committed task provenance, verification-HEAD binding, and historical checkpoint selection.

Important resources:

- `packages/cli/src/workbench/artifact-body.ts`, `artifact-schemas.ts`, and `artifact-types.ts`.
- `task-checkpoint.ts`, `precondition-artifacts.ts`, `precondition-git.ts`, `precondition-snapshot.ts`, `context.ts`, and `diff.ts`.
- Progress/task-progress templates and code, feedback, and orchestration skills/prompts.
- Workbench artifact, checkpoint, context, diff, precondition, and snapshot tests.

The checkpoint verifier retains the canonical historical Base rather than accepting a cropped later range or overwriting it from `.base`. Explicit malformed metadata fails rather than selecting a legacy fallback. Ignored, untracked, ambiguous, stale, and conflicting evidence has negative coverage. The evidence-gates milestone received bounded independent acceptance; integrated role behavior remains an A10 obligation.

### Review routing and clearance: A3, A4, A9

Implemented classification-first findings routing, useful-retry controls, explicit target/range checks, and bounded remediation clearance with full-review fallback.

Important resources: `review-passes.ts`, `precondition-reviews.ts`, `git-reference.ts`, the review template, review/code-feedback/orchestration skills and prompts, and their workbench/resource tests.

An earlier fresh-context review accepted a bounded A3/A4/A9 snapshot after seven repairs: resolution grammar/coverage, inspection by mode, historical scoped Head bounds, classification-first routing, normalized duplicate identities, structural first-occurrence identities, and committed suffix preservation. Its acceptance explicitly did not complete the milestone. It does not cover later edits or native independent-review behavior.

### Planning and execution: A5, A11, A12, A13, A14, A18

Implemented quality-context propagation, revision-bound formal approval and input impact, stable task identities, frozen completed definitions, initialization recovery admission, and explicit execution/dependency metadata.

Important resources:

- `plan-history.ts`, `legacy-input-confirmation.ts`, `context.ts`, `precondition-artifacts.ts`, and artifact schemas/body projections.
- Plan/proposal/requirements templates, planning/proposal/init/code/feedback/orchestration skills, and dispatch prompts.
- `tests/workbench/plan-contract.test.ts`, `legacy-input-confirmation.test.ts`, precondition/context tests, and planning/execution/dispatch resource contracts.

Specific changes:

- Existing plan/proposal route bindings take precedence over pending-first selection.
- Tactical planning records a `Spec impact` decision. Bounded behavioral changes may use a requirements-only approval path, bound to the committed delta revision, without inventing proposal/design artifacts or route ownership. Internal-only changes need no requirements delta. Unresolved classification holds planning.
- Init readiness requires resolved migration, required project facts, standards, and verification commands. Scaffolding alone and unattended assumptions cannot imply readiness. The process graph now matches that contract.
- Execution amendments preserve physical task IDs and historical definitions. Prerequisites can be inserted without renumbering or rewriting completed work.

Signed composed CLI fixtures exercised blocked and done-but-uncleared Task 2 cases. Both retained identity order `1,2,3,4` while using fixture-authored execution/clearance order `1,4,2,3`. Twenty-four controls checked preserved original Base, overlapping-file scope, missing prerequisite feedback, inherited approval refusal, pending Task 3, and mandatory whole review. This was mechanical evidence, not observed native TDD or independent semantic approval.

### Route coherence and ownership: A15, A16

Implemented route graph/body/binding validation, existing-binding-first planner selection, source/target identity checks, and serialized claim/release/transfer/retention instructions.

Important resources: `artifact-body.ts`, `artifact-registry.ts`, `context.ts`, `git-reference.ts`, route templates, planning/code/finish/orchestration resources, `route-relations.test.ts`, context tests, and `dispatch-preflight.test.ts`.

Public context CLI controls rejected ten malformed routes, accepted valid and 10,000-unit acyclic routes, and exercised six binding cases. Conflicts exposed both references. Direct relation tests also cover a 20,000-unit acyclic graph. A narrow reviewer accepted the binding-selection repair, not full A15/A16 behavior.

Native competing claims, authenticated release/transfer, safe retention, and role admission before writes remain unverified.

### Finish journaling and recovery: A7, A8

This is the newest implementation and has not received independent acceptance.

New modules:

- `finish-records.ts`: strict modern finish provenance parsing/projection, using existing dependencies. It rejects duplicate JSON keys/bullets, missing or unknown fields, malformed identities, unsafe effect paths, contradictory completion, and invalid repair links. Legacy history remains untyped; the reader does not invent provenance.
- `precondition-source.ts`: immutable historical artifact reads through surviving Git objects without checking out or changing refs.
- `finish-repair.ts`: ordinary refusal to redeliver, historical admission revalidation, original record/commit/input preservation, delivery reobservation, and linked repair admission.
- `finish-route.ts`: original route binding/source/base checks, current intent/structure checks, named-unit advancement checks, aggregate shipment constraints, and visible competing-claim refusal.

The existing precondition command now accepts `--recover-finish <attempt>`. A successful repair emits `admission: finalization-repair`, its original attempt reference, exact remaining effects, current verified HEAD, and **`gate: repair-open`**. It does not emit ordinary `gate: open`.

The finish skill/template/state-machine documentation now prescribe:

1. Validate ordinary admission and compatible strategy/shipping intent without writes.
2. Commit the Attempt before canonical-spec effects.
3. Synchronize within that Attempt.
4. Observe qualifying delivery before advancing route/map state.
5. Recover a delivered-but-blocked finish using a new linked `reconcile-delivery` pair, without repeating merge, request creation, or cleanup.
6. Hold automated repair on dirty surviving trees, including owned partial writes. Require owner-authorized reconciliation rather than discarding/staging/pre-committing bytes to manufacture cleanliness.

Mechanical recovery fixtures cover actual isolated local merges, source branch/worktree removal, refusal to repeat delivery, dirty preservation, forged admission fields, and invalid attempt numbers. The latest route cases additionally cover exact remaining effects, already-persisted unit advancement, sibling preservation, changed condition/status refusal, premature aggregate shipment, and competing visible claims.

Important limits of the current code:

- The route helper inspects competing claims in the current visible change directory; that is not proof of complete known-branch/worktree ownership inspection.
- Peer unit statuses are excluded from structural comparison. Authority and semantic qualification of peer transitions still need review and behavioral evidence.
- GitHub/GitLab read-only reobservation code exists, but current provider recovery behavior has not been exercised end to end.
- Current repair-positive evidence uses the service API. A compiled-CLI positive repair replay remains required.
- Fixture test commands use `true` and compatibility review evidence. They establish mechanical admission, not meaningful project verification or authenticated approval.

## Action acceptance ledger

“Implemented” below means code/resources exist, not that the whole action is accepted.

| Action | Checkpoint state | Outstanding acceptance |
|---|---|---|
| A1 | Evidence-gates milestone accepted at its bounded snapshot | Integrated controller/coder holds and evidence-owner repair |
| A2 | Evidence-gates milestone accepted at its bounded snapshot | Native handoff/interruption and cumulative evidence behavior |
| A3 | Earlier bounded review-clearance snapshot accepted | Current-source native classification and useful-retry behavior |
| A4 | Earlier bounded review-clearance snapshot accepted | Distinct independent bounded/full/fallback actors and invocation counters |
| A5 | Quality propagation implemented and resource-tested | Actual generation against applicable quality context and memory limitations |
| A6 | Evidence-gates milestone accepted at its bounded snapshot | Native stale-dispatch refusal before mutation |
| A7 | New journal/provenance/repair implementation; focused tests pass | Interruption matrix, repair chains, compiled CLI, independent review |
| A8 | Delivery-before-shipment resources and route repair checks implemented | Provider/no-op workflows, real controlled role ordering, semantic qualification |
| A9 | Earlier bounded target/range snapshot accepted | Current native fallback and historical recovery carve-out |
| A10 | Coordination and evidence infrastructure present | Integrated T1–T39, current full gate, final independent review and report |
| A11 | Revision-bound approval/impact implemented | Authenticated owner approval and legitimate settlement behavior |
| A12 | Stable identities and frozen history implemented | Native re-planning/feedback ownership and preservation |
| A13 | Initialization admission/readiness controls implemented | Interrupted scaffold writes, bounded resume, owner routing |
| A14 | Input impact/history and requirements-only path implemented | Independent semantic impact and native init/approval behavior |
| A15 | Graph/binding controls implemented; narrow selection repair accepted | Full route causal/reachability and owner-entry behavior |
| A16 | Source-role and ownership/retention resources implemented | Known competing claims, authorized transfer, conservative retention before writes |
| A17 | Evidence-gates milestone accepted at its bounded snapshot | Native standalone/checkpoint recovery and full overlap feedback |
| A18 | Execution amendments and composed prerequisite mechanics implemented | Actual role order, quiescence/parking/restoration, independent overlap judgment |

## Observed verification

Local evidence root: `.pi/verification/mv2elq7d-jczez0/`. Logs are retained locally, not committed with this handoff.

| Snapshot | Observed result | Interpretation |
|---|---|---|
| Planning/init/composed prerequisites, before finish implementation | Bare full suite **874/874 across 50 files**, 319.53 seconds; core/CLI build passed | Last full-suite pass; does not cover current finish changes |
| Initial finish parser/schema/template checks | **133/133 across 4 files** | Earlier finish snapshot |
| First finish recovery behavior | **11 passed, 163 skipped** | Isolated service/Git controls |
| Expanded finish focused run | **344/345 across 8 files** | One resource wording assertion failed; all 174 precondition tests passed |
| Corrected resource/parser/Nest/docs run | **67/67 across 5 files** | Corrected assertion tests actual compatibility guard |
| Latest finish/route recovery selection | **17 passed, 163 skipped** in `precondition.test.ts` | Current focused recovery behavior, not the complete precondition suite |
| Latest finish records/resources | **31/31 across 2 files** | Current parser/resource checks |
| Handoff checkpoint | `bun run build` passed for core and CLI; `git diff --check` passed | Current compilation/whitespace, not full behavioral acceptance |
| Historical STPA prefix at handoff | **174211 bytes**, SHA-256 `0772ea0009cc49ca5b41ab0a92d6f70a87ed23998b80804049a10a98a2c6e63a` preserved | Original approved investigation bytes retained |

Relevant logs:

- `parent-planning-composed-current-full.log`, `parent-planning-composed-current-build.log`.
- `parent-finish-records-red.log`, `parent-finish-records-green.log`.
- `parent-finish-repair-first-behavior.log`, `parent-finish-recovery-focused-v2.log`.
- `parent-finish-recovery-resources-v3.log`, `parent-finish-recovery-build-v3.log`.
- `parent-finish-route-boundary-first.log`, `parent-finish-route-records-resources.log`.
- `parent-handoff-current-build.log`.

Earlier bare/default-timeout failures remain unresolved historical evidence, despite subsequent passing bare suites. Do not change Vitest defaults, assertions, or concurrency to erase them. Direct Bun execution of `packages/cli/src/cli/main.ts` also failed in Nest's legacy decorator transform; CLI smoke tests use the built `packages/cli/dist/cli/main.js`.

## Scenario gaps: T1–T39

The STPA plan defines the exact oracles. These groups cover all 39 identifiers; no group below represents completed integrated acceptance.

| Cases | Evidence already available | Required continuation |
|---|---|---|
| T1–T5 | Ledger, terminal-field, provenance and verified-HEAD tests/CLI controls | Actual controller/coder no-dispatch/no-write decisions |
| T6–T9 | Bounded review snapshot, routing/clearance/range controls | Distinct full/bounded/fallback/evidence-only actors and counters |
| T10 | Quality propagation/resource controls | Generation and independent quality judgment |
| T11, T12, T14, T16, T17 | Finish parser/service/Git controls and prepared effect/provider substitutes | Actual finish/recovery ordering, provider/no-op cases, interruption and zero redelivery |
| T13 | Explicit target/range controls | Current native fallback and recovery boundaries |
| T15, T32 | Zero-active/all-abandoned/latest/legacy contracts | Actual whole-review/finish requirement and zero invalid dispatch |
| T18–T23 | Approval, identity, scaffold, impact and historical-freeze controls | Authenticated approvals, semantic impact, interrupted native planning and preservation |
| T24–T27, T33, T34 | Route graph/binding CLI and source-role shell checks | Causal/reachability judgment, competing claims, transfer, retention and role-before-write admission |
| T28, T29 | Historical checkpoint/diff/admission controls | Actual standalone guard and two-worktree owner recovery |
| T30 | Spec-impact and requirements-only approval resources | Native classification and authenticated requirements-only approval |
| T31 | Migration CLI and init-readiness resource controls | Actual init ordering, interruption, unresolved facts/commands and readiness |
| T35–T39 | Execution/history controls and 24 composed prerequisite CLI controls | Actual `1→4→2→3` roles, overlap feedback, partial-work parking/restoration, malformed-dispatch refusal |

## Resume order

Do not resume the paused goal automatically. The user must authorize continuation, normally with `/goal-resume`.

1. Read this handoff, STPA acceptance/compatibility requirements, current source/tests, and local working-state/coverage records if available. Some local coverage rows and STPA section 11 still describe A7/A8 as future work; this document records the newer, unaccepted implementation.
2. Finish A7/A8 behavioral gaps: interrupted intent/spec writes, owned dirty partial effects, authorized clean reconciliation, failed linked-repair chains, no-op, legacy refusal/recovery, provider reobservation/forgery, and compiled-CLI positive repair. Challenge route ownership/peer transitions and ordinary-history downgrade prevention.
3. Obtain fresh-context independent finish-scope review and resolve blocking findings. Do not treat earlier review acceptance as current acceptance. Observe the current authorization boundary before launching actors or delegation.
4. Complete native planning/execution and route ownership scenarios, including quality generation, scaffold recovery, requester authority, competing claims/transfer, prerequisite re-planning, parking/restoration, and overlapping-file judgments.
5. Reconcile A1–A18/T1–T39 with concrete assertions and actual results. Run focused tests, then **`bun --bun vitest run`** and **`bun run build`** without modified defaults. Perform current-source CLI/workflow checks and fresh integration review.
6. Update only the STPA plan's implementation/evidence section with final results. Preserve its historical prefix and distinguish prior investigation, mechanical fixtures, native behavior, and acceptance. Inspect the final resource/diff consistency before recording milestone or goal completion.

Local continuation records, when available:

- `.pi/verification/mv2elq7d-jczez0/working-state.md`.
- `.pi/verification/mv2elq7d-jczez0/accepted-mechanical-coverage.md`.
- `.pi/verification/mv2elq7d-jczez0/parent-route-ownership-checklist.md`.
- `.pi/verification/mv2elq7d-jczez0/precondition-timeout-causal-diagnosis.md`.

Some local audit harnesses pin the previous HEAD or expect an empty index/uncommitted implementation. After this authorized checkpoint commit, adjust only those checkpoint-specific expectations. Do not relax the historical-prefix digest, behavioral assertions, or acceptance requirements.

Keep one writer per checkout/worktree. Preserve stable identities, frozen definitions, historical evidence, independent clearance, legacy data, and Git signing. Do not weaken gates or infer approval from a fixture reference. Keep external effects isolated; real delivery and cross-clone coordination remain out of scope.
