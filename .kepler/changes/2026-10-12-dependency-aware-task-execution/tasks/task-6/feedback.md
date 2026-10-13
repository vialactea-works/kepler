---
artifact: feedback
change: 2026-10-12-dependency-aware-task-execution
task: 6
created: 2026-10-13
status: open
decision: rejected
---

# Code Feedback: Task 6 — Document and exercise the new task contract

## Pass 1 — 2026-10-13

Base: 5a6472d329b54459cc9f63aa1b1cb70f7713969b
Head: c8dee97e9ca17ed31a7a0d7a0b450ee179a78a56
Verdict: changes-requested

### Blocking

- [`.kepler/changes/2026-10-12-dependency-aware-task-execution/tasks/task-6/progress.md:47`] The cited `task-6-docs-source-green.log` is not a passing Green run: its captured result is 1 failed and 74 passed (75 total), failing the example artifact-contract test. The later reader cycle did pass 78 tests (`task-6-reader-docs-green.log`), but that does not make the cited 75-pass claim true. Append a factual correction with the correct run reference and preserve the original attempt text (violates Task 6 acceptance 3, 5, and 7: append-only historical evidence, actual native-agent evidence, and truthful verification).
- [`.kepler/changes/2026-10-12-dependency-aware-task-execution/tasks/task-6/progress.md:55`] The native detail evidence is cited as `task-6-native-details-*` and summarized as “13/18 files,” but the actual corresponding log is `task-6-native-records-details-green.log`, which reports 131 tests across 8 files. Correct this claim append-only, using the located log and keeping observed outcomes distinct from inference. The scenario artifact itself records actual actor/session and artifact references; the task progress claims must agree with that evidence (violates Task 6 acceptance 3 and 5).
- [`.kepler/changes/2026-10-12-dependency-aware-task-execution/tasks/task-6/progress.md:5`] Task-local frontmatter remains `status: in-progress`, while the root ledger at `.kepler/changes/2026-10-12-dependency-aware-task-execution/progress.md:43` publishes Task 6 as `done`; the only task attempt says `Outcome: done` at task progress line 67, but the handoff documents a later interrupted checkpoint-recovery candidate that is not in this reviewed Head. Reconcile the task and root states with the actual completed/interrupted work before claiming this task implementation is done, and retain truthful attempt history (violates Task 6 acceptance 7 and the task-ledger completion contract).

### Suggestions

- None.

## Pass 2 — 2026-10-13

Base: 5a6472d329b54459cc9f63aa1b1cb70f7713969b
Head: bdf1b181664404095695fa929327e7e95a1d0c67
Verdict: changes-requested

### Blocking

- [`tests/workbench/context.test.ts:843-865`] The new context regression commits `.kepler/changes/reserved-preparation/src/reserved.ts` before it writes and commits that exact path's `scope_expansions` reservation, yet expects `format: split`. [`packages/cli/src/workbench/context.ts:1787-1801`] routes any reservation through `resolveTaskCheckpoint`; [`packages/cli/src/workbench/task-checkpoint.ts:209-224,278-287`] then treats the reservation commit's first parent as the recovered Base, so [`packages/cli/src/workbench/scope-expansions.ts:118-151`] checks only the cropped parent-to-reservation range and accepts the earlier production change. The direct inspector control at `tests/workbench/scope-expansion-history.test.ts:119-130` does reject this chronology only when no recovered Base crops it. Restore fail-closed before-edit chronology and add a real Git/CLI context negative regression for production committed before its reservation; preserve legitimate pre-attempt recovery without relaxing the two/four limits. (violates Task 6 acceptance 6; `requirements/execution.md` Bounded prerequisite expansions and `requirements/workbench.md` Invalid graph or evidence.)

### Suggestions

- None.

## Pass 3 — 2026-10-13

Base: 5a6472d329b54459cc9f63aa1b1cb70f7713969b
Head: 2d0f9f3b333ae5172bc4b4a6ee236c7b7d8c31a5
Verdict: changes-requested

### Blocking

- [`packages/cli/src/workbench/context.ts:1804-1812`] `formatChange` validates scope-expansion chronology before checkpoint recovery and supplies only `feedbackRanges.at(-1)?.base`. At the first Task 6 reservation commit `3d8de5c0b7eb2df2f6778ef521be90dc09801466`, no feedback artifact exists, so the inspector falls back to the earliest Task 6 progress snapshot and treats Task 2's legitimate predecessor change to the shared reserved `packages/cli/src/workbench/scope-expansions.ts` at `e1637cf91c0aa6b723e6cf6a37a53c982ee5c6f9` as Task 6 production before its reservation. Reproduced with the current source CLI against a disposable clone at `3d8de5c0b7eb2df2f6778ef521be90dc09801466`: it exits 0 with `format: invalid` and `artifact-diagnostic: Task 6 scope history: reserved path changed before its reservation`. This holds a first-run actor before independent feedback can exist, despite the reservation itself being Task-6-progress-only and its parent being the original Base. Restore a verified original-Base chronology source for the no-feedback first-reservation case without cropping actual Task-owned earlier production; add real Git/CLI coverage for this legitimate predecessor positive case and retain the existing production-before-reservation negative case. (violates Task 6 acceptance 6; `requirements/execution.md` Bounded prerequisite expansions and Stable checkpoint authority; `requirements/workbench.md` Invalid graph or evidence.)

### Suggestions

- None.

## Pass 4 — 2026-10-13

Base: 5a6472d329b54459cc9f63aa1b1cb70f7713969b
Head: ea782df7205a673842893005ed152a1d310ce24d
Verdict: changes-requested

### Blocking

- [`packages/cli/src/workbench/task-checkpoint.ts:146-229,268-354`] `legacyScopePreparationBase` returns the first parent of a scope-only reservation as the task Base even when a later no-attempt task-progress-only commit lies between task-owned production and that reservation. In an independent disposable source-CLI fixture, `src/reserved.ts` changed in task-owned production, then task progress received a metadata-only commit, then the reservation and Attempt 1 were committed; `workbench diff --task 2` exited 0 and packaged the metadata commit as Base, omitting the pre-reservation production from chronology. `formatChange`'s new serial baseline catches the equivalent context call, but the checkpoint/diff caller still fails open. Preserve a verified pre-production serial baseline for checkpoint recovery and add a real Git/source-CLI regression for this intervening task-progress history, so the command rejects `reserved path changed before its reservation` rather than emitting a cropped package. (violates Task 6 acceptance 6; `requirements/execution.md` Bounded prerequisite expansions and Stable checkpoint authority; `requirements/workbench.md` Invalid graph or evidence); id: pass-4-blocking-1; kind: code-defect
- [`docs/skills.md:7`] The reader-facing dependency-mode guidance assigns the two-expansion limit to an entire plan, but `requirements/execution.md` Bounded prerequisite expansions and the implementation impose it independently on each task. State the two/four lifetime bound per task so this public contract does not forbid valid multi-task plans or misdescribe the enforced behavior. (violates Task 6 acceptance 1 and 8; `requirements/execution.md` Bounded prerequisite expansions); id: pass-4-blocking-2; kind: code-defect

### Suggestions

- None.

## Pass 5 — 2026-10-13

Base: 5a6472d329b54459cc9f63aa1b1cb70f7713969b
Head: cd6f2032117660fca6277e6cf33cf856a9148e89
Verdict: changes-requested

### Blocking

- [`packages/cli/src/workbench/task-checkpoint.ts:205-240`] `legacySerialApprovalBase` walks prior feedback commits and continues past a newer pass unless that commit's latest verdict is approved; it can therefore select an older approved pass after a physically later `changes-requested` or malformed feedback commit. `resolveTaskCheckpoint` then treats that older commit as the serial pre-production baseline, allowing `workbench diff --task` to rely on approval that is no longer physically latest. Use only the physically latest durable feedback state at the reservation boundary and verify it against the latest predecessor implementation; if it is not fresh and approved, fail closed or use the conservative earliest verified task-log baseline. Add a real-Git/source-CLI regression where an older approved pass is followed by a newer `changes-requested` pass before the reservation, preserving the approved-predecessor positive and task-owned-production negative cases. (violates Task 6 acceptance 6; `requirements/workbench.md` Invalid graph or evidence; `requirements/review.md` Full task clearance); id: pass-5-blocking-1; kind: code-defect

### Suggestions

- None.
