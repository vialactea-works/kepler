# Code-feedback dispatch template

Use this to dispatch `kepler-code-feedback` for one exact active task after its root row is
`done` and the driver has admitted initial absent-feedback review, changed coverage input or new
located evidence. Invalid/undurable feedback needs owner diagnosis and a corrected useful protocol
input before retry; freshness does not discard requested findings.
The stable cumulative task range, task log, bounded peer approval context, and optional located
risk evidence are the complete handoff. The
review dispatch supplies task acceptance, the stable task diff, project standards, task-local TDD
evidence, and bounded located-risk context.

Fill every `[BRACKET]`. Choose the model according to the orchestrator's model roles.

```
Subagent:
  description: "Review Task [N]: [TASK_TITLE]"
  model: [MODEL]
  prompt: |
    Run the kepler-code-feedback skill for exactly one planned task.

    ## Task

    - Change directory: [<change-dir>]
    - Task id: Task [N]
    - Task log: [<change-dir>/tasks/task-N/progress.md]
    - Feedback destination: [<change-dir>/tasks/task-N/feedback.md]
    - Project standards: [PROJECT_STANDARDS]
    - Task-local TDD evidence: [TDD_EVIDENCE]
    - Current task input standing: [CURRENT_TASK_INPUT_STANDING]
    - Task quality/decision context: [TASK_QUALITY_DECISION_CONTEXT]

    Read only Task [N] from plan.md, its cited constraints, its latest physical implementation
    attempt, the supplied package, project standards, and kepler-code-feedback's local rubric.

    ## Stable task diff

    - Base: [BASE_SHA]
    - Head: [HEAD_SHA]
    - Diff package: [DIFF_FILE]

    Run `kepler workbench lint --change-dir <change-dir>` before interpreting existing artifacts;
    only lint decides whether their format is valid. Require the package Base to equal Task [N]'s
    CLI-verified historical checkpoint, not only the ignored `.base` cache. Follow
    kepler-code-feedback's evidence, review, append, and commit rules;
    do not impose a second template or pass-shape validator on a lint-valid history. Treat the
    package as the bounded inspection boundary. Inspect one concrete named outside risk only under
    kepler-code-feedback's rules.

    ## Peer-approved commit/path context

    [PEER_APPROVED_COMMIT_PATH_CONTEXT_OR_NONE]

    Use `none` only when no prerequisite/peer context applies. Otherwise supply exact peer task
    IDs, full reviewed Base/Head, feedback approval commit/path and approval boundary, and covered
    production commits with their changed paths. Independently read those immutable approvals,
    verify artifact-only commits and range coverage at their named boundary, and enumerate the
    complete Base..Head commit sequence. Preserve the original Base and full cumulative package.
    Inspect overlapping files by commit attribution and resulting code; never exclude whole
    filenames or let peer approval conceal new unapproved Task [N] changes. Missing or invalid peer
    evidence is not approval. Read only this named peer context, not sibling progress or unrelated
    artifacts. Located-risk evidence below is a separate handoff and cannot replace peer attribution.

    ## TDD refactor handoff

    This dispatch is the task's refactor-phase review. Judge the supplied task-local
    red/green/refactor evidence, or its justified exception and repeatable alternative
    verification, as part of the behavior-preserving review. A legacy current confirmation is scoped
    to the present inputs and task definition, not proof of historical input bytes or approval; judge
    the actual current contract and implementation rather than trusting its references or hashes.
    For a legacy task lacking quality fields, verify the same dispatch-supplied task-scoped
    quality/decision record used by code and its latest attempt's criterion/check evidence against
    the unchanged contract and cited sources. Do not require rewriting frozen Notes or
    Acceptance/Files, and do not waive quality review. A correction must include relevant
    verification before a fresh feedback pass can approve it.

    ## Binding constraints

    [TASK_ACCEPTANCE_AND_CITED_CONSTRAINTS]

    ## Located evidence

    This is bounded located-risk context, supplied only when the driver has adjudicated a named
    risk under the feedback rules.

    [LOCATED_EVIDENCE_OR_NONE]

    Use `none` for an ordinary feedback pass. A populated value is exact named located evidence
    supplied by the driver after bounded adjudication of a typed `evidence-gap`, or a legacy
    `cannot verify from diff` Blocking item. Treat it only as supplementary evidence for the
    same supplied `Base` and `Head`; it does not move the reviewed range or authorize broader
    search. Independently judge the item in a new physical pass rather than inheriting the verdict.

    ## Required outcome

    Judge without fixing. Preserve and classify all Blocking findings before freshness routing.
    A `changes-requested` refactor-phase review with a confirmed code-defect returns the same Task [N]
    to `kepler-code`; relevant verification is required before fresh feedback. An evidence-gap needs
    independent located-evidence adjudication on the same Base and Head, without invented code;
    an intent-defect returns to the owning proposal/design stage for approval. Adjudicate ambiguous
    legacy kinds, retaining cannot verify from diff as the evidence-gap fallback. Unchanged useful
    inputs do not justify an identical retry. Append one complete pass to
    <change-dir>/tasks/task-N/feedback.md, then create and verify an artifact-only bookkeeping
    commit containing only that feedback file. Do not change code, plan.md, either progress file,
    the root task status, or a sibling artifact.

    Return only the task id, full reviewed Base and Head, verdict, finding counts, and feedback
    commit id. You are unattended; do not ask whether to continue or invoke another skill.
```

## Placeholders

- `[MODEL]` is required for every dispatch.
- `[<change-dir>]`, `[N]`, and `[TASK_TITLE]` identify one exact active task.
- `[BASE_SHA]` and `[HEAD_SHA]` are the full range printed by the task diff package.
- `[DIFF_FILE]` is the scratch package produced for Task `[N]`.
- `[TASK_ACCEPTANCE_AND_CITED_CONSTRAINTS]` is copied verbatim from that task and its cited
  requirements or design sections.
- `[PROJECT_STANDARDS]` supplies the applicable project standards for the task.
- `[TDD_EVIDENCE]` supplies the task-local red/green/refactor evidence or justified exception.
- `[TASK_QUALITY_DECISION_CONTEXT]` is the exact task-local context, or for a legacy task lacking
  these fields, the verified dispatch-supplied record used by code with the latest attempt's
  criterion/check evidence and cited sources. It cannot expand the frozen contract.
- `[CURRENT_TASK_INPUT_STANDING]` supplies the context status and, for legacy confirmation,
  the scoped record and current input blobs with `historicalInputs: "unknown"`.
- `[PEER_APPROVED_COMMIT_PATH_CONTEXT_OR_NONE]` supplies exact peer task IDs, reviewed Base/Head,
  approval feedback commit/path and boundary, covered production commits and changed paths,
  or `none` when no peer context applies. It never crops the original cumulative range.
- `[LOCATED_EVIDENCE_OR_NONE]` is `none` for an ordinary pass or exact named evidence adjudicating
  a typed evidence gap or legacy canonical unresolved item for same-Base/Head re-feedback.
