# Implementer dispatch template

Use this to dispatch `kepler-code` for one exact active task, either for its first attempt or
after fresh task feedback requests changes. The task's root row is current state; its task-local
progress file is the only detailed implementation report.

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
    - Root ledger entry: [matching frontmatter task entry and Markdown row for Task N in <change-dir>/progress.md]
    - Task log: [<change-dir>/tasks/task-N/progress.md]
    - Task checkpoint: [<change-dir>/tasks/task-N/.base]
    - Canonical repository identity: [repository identity]
    - Latest committed plan revision: [full 40-hex commit]
    - Admitted dispatch HEAD: [DISPATCH_HEAD]
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
    - Execution selection: [legacy numeric order, or explicit order, selected slot, predecessor task ID, and predecessor fresh approval commit]

    Read only Task [N] from plan.md, its cited constraints, the root row named above, and this
    task's own evidence. Do not read or touch a sibling task. Follow the task's Steps exactly;
    do not redesign, reorder, or add work. Confirm the supplied plan commit is current, the task
    identity/digest and current input standing match, formal intent is authorized, and Task [N] is
    the current selected slot. For a legacy current confirmation, inspect only its exact current
    input scope and do not treat it as historic evidence or authorization. Execute kepler-code's
    **Dispatch identity readback** with these admitted values and independently observed current
    worker identity before checkpoint/status/code mutation and on resume. The readback proves the
    named source branch remains distinct from the resolved target by branch identity and configured
    local/remote mapping, never by tip SHA. For a route-bound change, compare current context's
    route-unit and route-source revision with the admitted binding and scan visible claims for the
    same unit. A competing or ambiguous claim, changed binding, or unavailable independent identity
    holds for owner adjudication. A local scan is not distributed exclusivity. A changed full HEAD,
    branch, target, repository, worktree, route binding, or worker invalidates dispatch even when
    plan/order are unchanged. If a binding is unavailable, remain read-only and request it from the
    driver. Stop before any mutation if a gate or revision differs; return for fresh admission.

    ## Task quality and decision evidence

    Before code generation, cross-check the task's applicable quality constraints, source and
    verified decision context against current approved intent and project standards. For a legacy
    task lacking these fields, use the verified task-scoped dispatch-supplied quality/decision record
    without rewriting its frozen block, Notes, or history and without expanding Files or Acceptance.
    New tasks carry these constraints in their own block. Use relevant
    memory only after validating it against those sources. In the task-local attempt, record which
    task-local constraint/decision shaped the implementation and its observed code/test evidence,
    or why it did not apply. Input hashes identify exact revisions; they do not establish semantic
    equivalence or authorization.

    ## TDD evidence

    The task-local report must carry the red/green/refactor evidence for this attempt: record the
    commands and observed results for the failing red check, smallest green implementation,
    behavior-preserving refactor, and relevant verification after any correction. If a conventional
    red check cannot be written, record the exception reason and a repeatable alternative
    verification; do not omit the evidence.

    ## Context

    [ONE_LINE_CONTEXT]
    [EARLIER_INTERFACES_OR_DECISIONS_NEEDED_BY_THIS_TASK]

    ## Feedback for this attempt

    [FIRST_ATTEMPT_OR_READ_THE_LATEST_PHYSICAL_PASS_AT_<change-dir>/tasks/task-N/feedback.md]

    ## Required outcome

    The orchestrator has already established the checkpoint. Validate and preserve the
    already-recorded task-local checkpoint; never create, reset, reconstruct, or replace it.
    Follow kepler-code completely: transition only Task [N]'s matching root metadata entry and
    Markdown row, execute and verify the task, append exactly one canonical attempt to the task
    log, and commit the implementation plus that synchronized evidence with the task's specified
    commit message. Preserve the root aggregate status as an implementation summary; `complete`
    never means feedback, whole-branch review, or finish-work passed. Leave plan.md, sibling
    evidence, and feedback untouched. This task range is handed to the existing
    `kepler-code-feedback` refactor-phase review. A `changes-requested` refactor-phase review
    returns the same Task [N] to `kepler-code`; relevant verification is required before a fresh
    `kepler-code-feedback` pass.

    The task log is the detailed report. Return only concise status and commit information:
    - Status: done | blocked
    - Commit created: full SHA and subject, or none
    - Test summary: one line
    - Concerns: one line, or none

    You are unattended. Do not ask whether to continue and do not invoke the next pipeline
    skill. If a specified step is impossible, use kepler-code's canonical blocked path.
```

## Placeholders

- `[MODEL]` is required for every dispatch.
- `[<change-dir>]`, `[N]`, and `[TASK_TITLE]` identify one exact active task.
- `[DISPATCH_HEAD]` is the exact full HEAD at admitted selection, not the latest plan commit.
- `[DISPATCH_BRANCH]` is its full `refs/heads/...` ref, not an alias or a same-tip substitute.
- `[DISPATCH_TARGET]` is the fully resolved `refs/heads/...` or `refs/remotes/...` delivery target from the route Shipping rules/map branch or project rules.
- `[DISPATCH_WORKTREE]` is the canonical absolute `git rev-parse --absolute-git-dir` path.
- `[DISPATCH_WORKER]` identifies the exact assigned run/session from the execution harness;
  compare it with independent current harness readback, never a role or copied expected value.
- `[ONE_LINE_CONTEXT]` supplies only scene-setting information the task cannot derive.
- `[TASK_INPUT_HANDOFF_OR_LEGACY_CONFIRMATION]` supplies either Task N's exact version-1 Notes
  JSON with current selected blobs or its committed scoped confirmation, current standing, and
  `historicalInputs: "unknown"`.
- `[EARLIER_INTERFACES_OR_DECISIONS_NEEDED_BY_THIS_TASK]` supplies only required established
  interfaces or decisions.
- `[FIRST_ATTEMPT_OR_READ_THE_LATEST_PHYSICAL_PASS_AT_<change-dir>/tasks/task-N/feedback.md]`
  says `First attempt; no feedback input` or directs a correction to the task's physically last,
  fresh `changes-requested` pass.
