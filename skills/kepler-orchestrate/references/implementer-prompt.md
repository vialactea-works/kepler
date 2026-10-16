# Implementer dispatch template

Use this template to dispatch `kepler-code` for one exact active task, either on its first attempt or after fresh task feedback requests changes. The root row records current state; the task-local progress file contains the only detailed implementation report.

Fill every `[BRACKET]`. Choose the model according to the orchestrator's model roles.

```
Subagent:
  description: "Implement Task [N]: [TASK_TITLE]"
  model: [MODEL]
  prompt: |
    Run the kepler-code skill for exactly one planned task.

    ## Task

    - Change directory: [<change-dir>]
    - Task id: Task [N]
    - Root ledger entry: [matching root metadata entry and Markdown row for Task N in <change-dir>/progress.md]
    - Task log: [<change-dir>/tasks/task-N/progress.md]
    - Task checkpoint: [<change-dir>/tasks/task-N/.base]
    - Canonical repository identity: [repository identity]
    - Latest committed plan revision: [full 40-hex commit]
    - Immutable Task Base: [TASK_BASE]
    - Coordinator source HEAD: [COORDINATOR_SOURCE_HEAD]
    - Admission commit: [ADMISSION_COMMIT]
    - Attempt start HEAD: [ATTEMPT_START_HEAD]
    - Next coordinator HEAD: [NEXT_COORDINATOR_HEAD]
    - Admitted full source branch ref: [DISPATCH_BRANCH]
    - Resolved full delivery-target ref: [DISPATCH_TARGET]
    - Route ownership binding, when applicable: [owner, change, canonical route/unit, route-source revision, base/input revision; otherwise none]
    - Admitted canonical worktree Git directory: [DISPATCH_WORKTREE]
    - Assigned exact worker/run/session identity: [DISPATCH_WORKER]
    - Independent observed worker identity source: [harness-supported identity readback]
    - Task definition digest: [SHA-256]
    - Task input/context handoff: [TASK_INPUT_HANDOFF_OR_LEGACY_CONFIRMATION]
    - Formal intent authority: [approved-reference commit and requester-held reference, or tactical authority reference]
    - Quality/decision constraints: [applicable constraints with source and verified current decision, or why not applicable]
    - Coordinator admission: [verified ready/held projection, original Base, admitted worker identity, isolated lane/worktree, repository and plan/task/input bindings, prerequisite approval commits]

    Read only Task [N] from plan.md, its cited constraints, the named root row, and this task's evidence. Do not read or touch a sibling task. Require `execution: {version: 2, mode: dependencies}`; older plans are read-only context and must not be executed.

    Implement the Goal/Acceptance/Depends on/Steps/Verify/Commit contract with bounded judgment. The Files field provides optional guidance, not an allowlist. Preserve binding intent, design, and standards. Make necessary goal-serving edits, including to unlisted files, without unrelated work. Keep TDD cycles in Red → Green → Refactor order. Do not impose a design absent from binding context or expand approved intent.

    Confirm that the supplied plan commit is current, the task identity/digest and input standing match, and formal intent is authorized. Validate the verified ready projection, coordinator admission, immutable Task Base, coordinator source HEAD, admission commit, attempt start HEAD, observed worker, isolated lane, repository/plan/task/input bindings, and prerequisite approvals. `Attempt start HEAD` is the expected lane HEAD for dispatch identity readback and must be recorded as this attempt's `Start HEAD`; never substitute Task Base or coordinator source HEAD. Readiness alone is not admission. For a legacy current confirmation, inspect only its exact current input scope and do not treat it as historic evidence or authorization.

    Before checkpoint, status, or code mutation, and on resume, run kepler-code's **Dispatch identity readback** with `Attempt start HEAD`, the admitted lane/target/worktree values, and independently observed current worker identity. The readback proves that the lane remains at the exact attempt start and the named source branch remains distinct from the resolved target by branch identity and configured local/remote mapping, never by tip SHA. Task Base and Coordinator source HEAD are separate provenance values, not readback substitutes.

    For a route-bound change, compare the current context's route-unit and route-source revision with the admitted binding, then scan visible claims for the same unit. A competing or ambiguous claim, changed binding, or unavailable independent identity requires owner adjudication. A local scan does not establish distributed exclusivity. A changed full HEAD, branch, target, repository, worktree, route binding, or worker invalidates dispatch even when the plan is unchanged.

    If a binding is unavailable, remain read-only and request it from the driver. Stop before any mutation if a gate or revision differs; return for fresh admission.

    ## Task quality and decision evidence

    Before code generation, check the task's applicable quality constraints, source, and verified decision context against current approved intent and project standards. For a legacy task without these fields, use the verified, task-scoped, dispatch-supplied quality/decision record. Do not rewrite its frozen block, Notes, or history, or expand Files or Acceptance. New tasks carry these constraints in their own block. Validate relevant memory against those sources before using it. In the task-local attempt, record the constraint or decision that shaped the implementation and its observed code/test evidence, or explain why it did not apply. Input hashes identify exact revisions; they do not establish semantic equivalence or authorization.

    ## TDD evidence

    The task-local report must include red/green/refactor evidence for this attempt. Record the commands and observed results for the failing red check, smallest green implementation, behavior-preserving refactor, and relevant verification after any correction. If a conventional red check cannot be written, explain why and provide repeatable alternative verification; do not omit the evidence.

    ## Context

    [ONE_LINE_CONTEXT]
    [EARLIER_INTERFACES_OR_DECISIONS_NEEDED_BY_THIS_TASK]

    ## Feedback for this attempt

    [FIRST_ATTEMPT_OR_READ_THE_LATEST_PHYSICAL_PASS_AT_<change-dir>/tasks/task-N/feedback.md]

    ## Required outcome

    Validate coordinator admission and preserve its immutable Task Base across retries, corrections, and cache loss. Record the exact `Attempt start HEAD` as `Start HEAD` in this new task-local attempt; retain every earlier Start HEAD unchanged. Never create, reset, or replace the admitted checkpoint. Commit only this task's isolated original changes. Leave shared root metadata and rows, plan.md, sibling evidence, and feedback untouched. Return truthful done/blocked/interrupted/unavailable evidence.

    The coordinator alone uses guarded publication to integrate original commits, run exact Verify on integrated work, and commit root status. Root publication is separate from independent feedback clearance; aggregate `complete` means only implementation completion. Never fabricate an attempt or terminal outcome from a missing response.

    The existing `kepler-code-feedback` refactor-phase review receives this task range. A `changes-requested` refactor-phase review returns the same Task [N] to `kepler-code`; require relevant verification before a fresh `kepler-code-feedback` pass.

    The task log is the detailed report. Canonical artifact terminal outcomes remain `done` or `blocked`. Return only concise status and commit information:
    - Worker response: done | blocked | interrupted | unavailable; `interrupted` and `unavailable` are nonterminal worker responses/observations, not root/result/feedback/review/finish statuses.
    - Commit created: full SHA and subject, or none
    - Test summary: one line
    - Concerns: one line, or none

    You are unattended. Do not ask whether to continue and do not invoke the next pipeline skill. If a specified step is impossible, use kepler-code's canonical blocked path.
```

## Placeholders

- `[MODEL]` is required for every dispatch.
- `[<change-dir>]`, `[N]`, and `[TASK_TITLE]` identify one exact active task.
- `[TASK_BASE]` is the immutable original task Base, unchanged across retries.
- `[COORDINATOR_SOURCE_HEAD]` and `[ADMISSION_COMMIT]` are the exact root-side event bindings printed by guarded admission.
- `[ATTEMPT_START_HEAD]` is the lane HEAD after admission synchronization; use it for Dispatch identity readback and this attempt's `Start HEAD`.
- `[NEXT_COORDINATOR_HEAD]` is the root HEAD after the admission event and may differ from the attempt start HEAD.
- `[DISPATCH_HEAD]` is no longer used as a substitute for these distinct revisions.
- `[DISPATCH_BRANCH]` is its full `refs/heads/...` ref, not an alias or a same-tip substitute.
- `[DISPATCH_TARGET]` is the fully resolved `refs/heads/...` or `refs/remotes/...` delivery target from the route Shipping rules/map branch or project rules.
- `[DISPATCH_WORKTREE]` is the canonical absolute `git rev-parse --absolute-git-dir` path.
- `[DISPATCH_WORKER]` identifies the exact assigned run/session from the execution harness; compare it with independent current harness readback, never a role or copied expected value.
- `[ONE_LINE_CONTEXT]` supplies only scene-setting information the task cannot derive.
- `[TASK_INPUT_HANDOFF_OR_LEGACY_CONFIRMATION]` supplies either Task N's exact version-1 Notes JSON with current selected blobs or its committed scoped confirmation, current standing, and `historicalInputs: "unknown"`.
- `[EARLIER_INTERFACES_OR_DECISIONS_NEEDED_BY_THIS_TASK]` supplies only required established interfaces or decisions.
- `[FIRST_ATTEMPT_OR_READ_THE_LATEST_PHYSICAL_PASS_AT_<change-dir>/tasks/task-N/feedback.md]` says `First attempt; no feedback input` or directs a correction to the task's physically last, fresh `changes-requested` pass.

## Admission and scope

Provide the immutable Task Base, coordinator source HEAD, admission commit, attempt start HEAD, next coordinator HEAD, verified ready projection, lane, and target branch as distinct bindings. The worker records the supplied attempt start as `Start HEAD` in its new task-local attempt and records only task-local attempts and commits; it never mutates root status. It may use an already committed scope reservation only within its paths and intent. Missing admission, stale identity, or unavailable evidence requires a hold without a manufactured outcome.
