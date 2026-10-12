# Change-state-machine scenario checklist

## Execution boundary

This is A10's opt-in acceptance checklist, not an automatic test or a record of observed behavior.
The authoritative scenarios and trace identifiers are in [STPA plan §8](../../docs/change-state-machine-stpa-plan.md#8-cross-component-regression-matrix).
Every row starts `not-run`. Narrow unit checks do not change an actor or provider scenario to passed.
No scenario was executed when this checklist was added.

Run only after explicit authorization for the selected cases. Keep the run outside production
workspaces and real-user Kepler data. Use the supported installed harness and its actual available
agents; do not introduce another orchestrator or fall back to an unapproved CLI protocol.
A missing harness, identity, credential, provider sandbox or owner decision leaves the case unverified.

## Fixture and evidence contract

1. Create a disposable repository, HOME, XDG configuration directory and explicit non-default source
   and target branches. Preserve signing policy with fixture-local signing material; never disable
   host signing. Keep real remotes, global configuration and installed skills unchanged.
2. Record source commit and resource hashes, compiled CLI version/path, Bun/Git versions, harness
   version and exact model/provider/agent identities. Identify which resources the harness loaded.
   Capture the selected case, perturbation and positive control before execution.
3. Bind each writer to its actual repository, branch, worktree, HEAD, exact task/slot and worker
   identity. Use independent fresh reviewers. Keep one writer per checkout and explicit ownership
   for preservation, transfer, provider effects and cleanup.
4. Snapshot file bytes, refs, index, worktrees and committed artifacts before each rejection or
   interruption. Capture command stdout/stderr/exit, verified HEAD, dispatch scope/count, actual
   artifact-only commits and independently read provider state when applicable.
5. Exercise the perturbation and its control. Check the observable result below, including absent
   writes and absent repeated delivery. A zero exit, fake provider result, wording match or agent
   statement alone does not prove the result.
6. Record `passed`, `failed` or `unverified` with the evidence directory and concrete reason.
   Stop on failed ownership/provenance rather than normalizing data to force success. Preserve
   failed fixtures for investigation; delete them only under the fixture's cleanup authority.

Use a run manifest with: case IDs; fixture path; source/resource/harness/model identities; approval
for external effects; initial/final HEAD and ref identities; commands and exit codes; artifact hashes;
dispatch counts/scopes; observations; result; limitations; and cleanup disposition. Keep credentials
out of the manifest and transcripts.

## Scenario inventory

The mechanical layer covers actual parser, filesystem, Git and admission predicates. Actor
observations cover generation, dispatch, semantic adjudication and ownership. Provider observations
require real sandbox readback; injected-runtime results remain mechanical evidence.

| Case | Setup / perturbation | Required observable result | Covers | Run status |
| --- | --- | --- | --- | --- |
| T1 | Root row done, metadata pending or wrong title/order/link. | Lint fails before dispatch; coder owns repair; no next checkpoint/review. | A1; U3–U5; H1/H3. | not-run |
| T2 | Root enters in-progress while initialized local log remains pending, or correction retains prior finalized local status. | Supported boundary remains lint-valid; no false done inference. | A1–A2 compatibility. | not-run |
| T3 | Latest attempt contains repeated/mixed terminal Outcome forms. | Lint and admission reject ambiguity; single historical unbulleted outcome passes. | A2; U11; H1/H3. | not-run |
| T4 | Ignored/untracked task log or failed latest-commit lookup with otherwise clean approved evidence. | Task gate closes; required containment is never skipped. | A2; U12; H1/H3. | not-run |
| T5 | Verification exits zero after changing to another clean HEAD. | Gate closes and names verified-identity change; no Attempt/spec writes. | A6; U13; H6. | not-run |
| T6 | Requested review plus bare applied disposition. | No finish clearance; name independent remediation verification as the next requirement. | A3–A4; U1/U2; H1/H2. | not-run |
| T7 | One full requested-change review, bounded correction, fresh task feedback, valid remediation clearance. | Exactly one full review, a bounded follow-up, finish opens with preserved composite coverage. | A4; U6; H2. | not-run |
| T8 | Scoped follow-up omits one blocker, introduces an unclassified material path, changes intent/target/Base, or refers to an invalid baseline. | Bounded clearance fails; full review/upstream repair occurs only for the stated invalidation. | A4/A9; H1. | not-run |
| T9 | Repeated same-range evidence question with no new located evidence or changed input. | No identical automated redispatch; bounded adjudication with exact missing evidence. | A3; U7/U8; H2/H5. | not-run |
| T10 | Relevant quality decision exists only in Overview/memory; task-local context is missing, stale, or unavailable. | New task gets applicable current constraints; stale memory is rejected; unavailability uses repository context without fake retrieval. | A5; U9/U10; H5. | not-run |
| T11 | Interrupt immediately before/after canonical-spec commit. | Durable Attempt exists before persistent mutation; same-attempt recovery neither duplicates nor invents result. | A7; U14/U16; H4. | not-run |
| T12 | Route qualification fails before merge/request readback; resume after strategy success or route commit. | No premature shipment, no duplicate effect, exact named route update and observed surviving-branch result. | A7–A8; U15/U16; H4. | not-run |
| T13 | Valid approved review with recent arbitrary ancestor Base or wrong target, with waiver on/off. | Mechanical scope check fails; waiver does not bypass it. | A9; U17; H1. | not-run |
| T14 | PR Outcome commits locally but push/provider readback fails; local-merge removes worktree; no-op has no remote effect. | No false completed remote state; paired evidence survives on the correct branch/base; no-op performs no forbidden effect. | Existing protections/A10; U18; H4. | not-run |
| T15 | Zero active tasks, legacy-global history transitioning to an explicit suffix, or malformed latest pass after older approval. | Empty task set still needs review/finish; legacy approvals remain supported, but bounded clearance needs a new full modern baseline; malformed last pass cannot fall back. | A1–A4/A10 invariant preservation. | not-run |
| T16 | Local merge succeeds, branch/worktree is removed, route fails, and a paired blocked Outcome persists; variant leaves a dirty owned route/map diff. | Clean-state repair-open validates historical admission/current HEAD and completes a new linked pair on base with zero repeat merges; dirty-state admission stops for explicit owner reconciliation, never auto-discards/pre-commits, and then revalidates. | A6–A9; U16/U17; H2/H4/H6. | not-run |
| T17 | Selected request-open strategy cannot satisfy a merge-required route; or a historical request later merges. | New incompatible intent stops before writes; historical eventual qualification uses merged readback/provenance and no duplicate request, or stops on insufficient evidence. | A7–A8; U15/U16; H4. | not-run |
| T18 | Rich planning resumes with draft/default-accepted or changed formal inputs; separately an authorized tactical/unattended planning request. | Unproven formal approval holds before code; exact current approval permits it; tactical absence/self-reviewed breakdown does not fabricate proposal approval. | A11/A14; U19; S12; H1/H5. | not-run |
| T19 | Cross critique verdicts with accepted/applied/rejected/skipped dispositions. | changes-requested/skipped holds at owner; legitimate applied/rejected settles without redundant critique; stage naming never overrides unresolved disposition. | A11; U20; S13; H1/H2. | not-run |
| T20 | Rename a blocked task with existing feedback; controls have no feedback or already fully synchronized historical names. | Future planner keeps identity or appends a new ID; no reviewer-owned history rewrite; safe/historical controls remain supported. | A12; U21; S14; H2/H3. | not-run |
| T21 | Stop initialization after each scaffold file; variant includes an attempt, feedback, checkpoint or unexplained partial code. | Only proven authorized pending/history-free missing artifacts are initialized; existing bytes preserved; history-bearing case goes to owner. | A13; U22; S15; H2/H3. | not-run |
| T22 | Requirements/design/standards change after task approval, with affected/unaffected obligations and a generic material waiver. | Explicit impact/re-plan/new obligations, not reinterpretation of frozen history; unaffected evidence retained; waiver cannot invent current authorization. | A11/A14; U19/U23; S12/S16; H1/H5/H6. | not-run |
| T23 | Re-plan adds remediation after frozen done tasks and abandoned IDs. | Preserve all prior definitions/IDs/history; new tasks use new IDs and full gates; no silent reassignment of earlier approval. | A12/A14/A10; U21/U23; S14/S16; H1/H3. | not-run |
| T24 | Valid route control; duplicate IDs/dependencies, unknown/self/cyclic edges, and metadata/body identity/order mismatch. | Relational diagnostics reject incoherence before entry; valid control still passes; causal semantic review and reachability remain required. | A15; U24; S17; H1/H3/H4. | not-run |
| T25 | Proposal/plan have different valid route refs, or proposal is non-null while an existing plan is null; controls match or proposal is null. | Conflict/missing propagation surfaces both references and stops before effects; no silent restoration/release; controls resolve without false conflict or legacy guessing. | A15; U25; S18; H1/H3/H4. | not-run |
| T26 | Two branches read the same pending route revision and use distinct/suffixed workspace names. | Competing visible claim requires resume/transfer/stop, not duplicate work; cross-clone exclusivity uses explicit shared authority, not a false local-lock claim. | A16; U26; S19; H2/H4/H6. | not-run |
| T27 | User withdraws/transfers a claimed unit with partial work, then variant with already observed delivery. | Explicit owner decision preserves work, records release/transfer and revalidates dependencies; delivered variant never resets shipment or repeats delivery. | A7/A16; U28; S19; H2/H4/H6. | not-run |
| T28 | Valid feedback ancestry uses a later Base than the first task checkpoint. | Shared historical-base verification rejects cropped coverage; correct cumulative base/code-plus-evidence commit passes. | A2/A17; U27; S20; H1/H3. | not-run |
| T29 | Same task history in two worktrees, missing or conflicting ignored checkpoints, or initial pending-log commit before first attempt. | Recover only consensus first-attempt provenance; do not use initial-log parent or current HEAD; retain ignored/no-overwrite convention. | A17; U27; S20; H1/H3. | not-run |
| T30 | Tactical behavioral change versus internal no-behavior change. | Planning records early spec-impact/delta obligations; behavioral delta is approved before finish; internal case does not acquire a compulsory heavyweight proposal. | A11/A14; U19/U23; S12/S16; H1/H5. | not-run |
| T31 | Existing standards/data, legacy-only state, migration failure/recovery, unresolved or later-changed verification commands. | Preserve sources/standards; run existing migration-before-scaffold/recovery; no ProjectReady on unresolved facts; current commands reach generation/verification. | A10/A13/A14; U29; S15/S16; H1/H5. | not-run |
| T32 | Genuinely empty new plan, all-abandoned declared plan, and active task with empty ledger. | Empty new plan/active mismatch reject; all-abandoned skips only task gates, never whole-review/spec/delivery checks. | A1/A10; H1/H3; retained protection. | not-run |
| T33 | Isolated non-default/linked workspace contains another active change or changed ownership/input state before cleanup. | Isolation is not sole ownership; agree retention before effects or stop; no shared-data deletion and no manufactured successful cleanup. | A7/A16; U28; S19; H4/H6. | not-run |
| T34 | Actual non-default map target, linked default-target or detached checkout reports isolated; control is the owned feature branch initially sharing the target commit, plus historical A7 repair on base. | New-generation role check stops before writes; correct named source proceeds; empty whole-change package remains rejected; historical repair still follows its separate admission and cannot start new code. | A7/A16; U30; S19; H4/H6. | not-run |
| T35 | Task 1 gated, Task 2 blocked on unforeseen work, Task 3 pending; new Task 4 provides it; serial sequence becomes 1,4,2,3. | Numeric headings/paths/root rows stay 1,2,3,4; Task 4 gets its own code/TDD/fresh approval before Task 2 resumes; Task 2 Acceptance/Files do not absorb extra scope; neither 2 nor 3 is skipped. | A18; U31/U32; S21; H1/H2/H3/H5. | not-run |
| T36 | Task 2 has root done but fresh changes-requested/uncleared feedback; separately a fully gated original prefix. | Execution-only insertion can precede unresolved correction without editing its frozen definition/attempts/title; a fully gated prefix and old relative order remain fixed, with new obligations separately reviewed. | A12/A14/A18; U31/U32; S21; H1/H2/H3. | not-run |
| T37 | In-progress worker or blocked Task 2 leaves partial edits; order changes during Task 4 dispatch; then a safely parked/restored control. | Quiesce and obtain scoped owner preservation before any other writer; no discard/broad stash/fake commit; stale dispatch stops; safe restoration uses original Task 2 checkpoint/history. | A6/A17/A18; U31/U32; S21; H1/H2/H3/H6. | not-run |
| T38 | Duplicate/missing/unknown/abandoned IDs, unknown version, forward/cyclic or ambiguous prerequisites; controls omit execution or have all tasks abandoned. | Invalid explicit sequence never falls back or bypasses lint/gates; real cycle goes to owner; absent metadata preserves numeric behavior; all-abandoned still requires whole review/finish. | A1/A18; U31/U32; S21; H1/H2/H3. | not-run |
| T39 | Task 2 blocked then Task 4 committed/approved then Task 2 correction overlaps a prerequisite file. | Preserve Task 2 Base/old attempts; review complete cumulative range with peer context and commit-level ownership, not filename hiding; all active approvals and whole/integration clearance remain mandatory. | A2/A4/A14/A17/A18; U32; S21; H1/H3/H5. | not-run |

## Continuation-specific controls

Include these variants within their parent scenarios without changing the historical matrix:

- T4/T28: context must not call feedback fresh for dirty/uncommitted terminal evidence, an
  unresolved implementation revision or a cropped Base. Whole-review range freshness must remain
  explicitly clearance-unverified until its target and scope predicates are checked.
- T11/T16: delete history; append an untyped suffix; introduce Attempt/Outcome together; add or
  remove original task/intent/review files; omit an outstanding history/route/map effect. Each
  admission closes without writes. Already-persisted named effects are observed, not replayed.
- T16/T17: omit or contradict the historical canonical Qualification line; pair an incompatible
  no-op or open-only request with completed merge-qualified shipment. Require owner adjudication.
- T16: repeat a blocked repair without changed effects or provider qualification. Admission closes.
  A subsequent repair binds actual changed evidence to the latest failed Outcome and entry HEAD.
- T17: provider Head adds an unadmitted application path. Readback must not accept ancestry alone.
- T21: hide a source, scaffold, approved input or checkpoint change in the index while restoring
  apparently pending worktree bytes. Recovery holds and preserves staged data.
- T26: place a competing claim on another local ref, a visible remote ref and an uncommitted linked
  worktree. Inspect all visible locations; do not claim cross-clone locking or authenticated transfer.

## Deferred execution

The implementation continuation intentionally ran no native actor evaluations, broad smoke tests,
skill-behavior tests, provider deliveries or scenario replay. Its narrow CLI/unit/type checks are
listed separately in [the implementation handoff](../../docs/change-state-machine-implementation-handoff.md).
