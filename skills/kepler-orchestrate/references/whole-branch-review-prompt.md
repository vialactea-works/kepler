# Whole-branch review dispatch template

Use this template to dispatch `kepler-review` only after every active task is `done` and has fresh approved feedback. It supplies the complete branch and change evidence for the final inspection gate.

Fill every `[BRACKET]`. Choose the most capable available model for this dispatch.

```
Subagent:
  description: "Review the whole branch"
  model: [MODEL]
  prompt: |
    Run the kepler-review skill on the complete branch.

    ## Change

    - Change directory: [<change-dir>]
    - Review mode: [full | remediation]
    - Target branch: [FULL_TARGET_BRANCH_REFERENCE]
    - Full-review baseline pass: [BASELINE_PASS_OR_NONE]
    - Full-review baseline artifact-only commit: [BASELINE_REVIEW_COMMIT_OR_NONE]
    - Remediation delta base: [BASELINE_HEAD_OR_NONE]
    - Root ledger: [<change-dir>/progress.md]
    - Review destination: [<change-dir>/review.md]

    Read the proposal, requirements, design, plan, root ledger, every active task's latest implementation attempt and feedback concerns, project standards, and kepler-review's local rubric.

    In remediation mode, also read every blocker from the full baseline and scoped suffix, the immutable baseline artifact, and each appended remediation task's implementation and feedback.

    ## Complete branch diff

    - Base: [MERGE_BASE_SHA]
    - Head: [HEAD_SHA]
    - Complete whole-change diff package: [FULL_DIFF_FILE]
    - Cumulative correction delta package: [DELTA_DIFF_FILE_OR_NONE]

    Run `kepler workbench lint --change-dir <change-dir>` before interpreting existing artifacts; only lint determines whether their format is valid. Resolve the explicit Target branch. Verify that Base is its actual merge base and Head is reachable from current HEAD. Follow kepler-review's evidence, inspection, append, and commit rules; do not impose a second template or pass-shape validator on a lint-valid history.

    In full mode, treat the complete branch diff as starting evidence, not an inspection boundary. Inspect the broader repository for affected consumers, integration, omissions, and boundary violations.

    In remediation mode, verify the full baseline's immutable artifact-only commit and preserve all prior full-review coverage. Inspect the cumulative correction delta from its reviewed Head, every baseline/suffix blocker, located resolution evidence, and affected consumers; do not repeat a full inspection. Resolve every scoped Head within cumulative bounds and verify retained scoped pass bodies against committed history. Fall back to full review for invalid provenance, changed intent, unclassified correction paths, erased history, or unbounded integration impact.

    ## Binding change intent

    [COMPLETE_APPROVED_REQUIREMENTS_AND_DESIGN_CONSTRAINTS]

    ## Required outcome

    Judge without fixing. Classify Blocking findings as code-defect, evidence-gap, or intent-defect; preserve stable pass-N-blocking-M identities when carrying findings forward. Append one complete pass to <change-dir>/review.md, then create and verify an artifact-only bookkeeping commit containing only root review.md. Do not change code, plan.md, progress, task evidence, or task status.

    Return only the full reviewed Base and Head, verdict, complete findings, finding counts, focused verification, and review commit id. For `changes-requested`, preserve and classify every finding before routing by freshness: send code-defects to numbered re-plan tasks, evidence-gaps for independent located-evidence adjudication on the unchanged range without invented tasks, and intent-defects for approved proposal revision. Unchanged inputs do not justify an identical retry. Never dispatch code yourself. You are unattended; do not ask whether to continue or invoke another skill.
```

## Placeholders

- `[MODEL]` is required and names the most capable available reviewer model.
- `[<change-dir>]` identifies the complete change.
- `[FULL_TARGET_BRANCH_REFERENCE]`, `[MERGE_BASE_SHA]`, and `[HEAD_SHA]` identify the full branch range.
- `[FULL_DIFF_FILE]` is the whole-change scratch package. Remediation mode also supplies the cumulative delta package from the retained full-review Head.
- `[BASELINE_PASS_OR_NONE]`, `[BASELINE_REVIEW_COMMIT_OR_NONE]`, and `[BASELINE_HEAD_OR_NONE]` identify the immutable full-review baseline, or `none` for full mode.
- `[COMPLETE_APPROVED_REQUIREMENTS_AND_DESIGN_CONSTRAINTS]` carries the complete approved change intent rather than task-local excerpts.

## Task clearance

Enter whole-branch review only when every active task has committed implementation evidence and fresh, independent, approved feedback. Root `done` alone, skipped feedback, and unavailable responses do not clear a task.
