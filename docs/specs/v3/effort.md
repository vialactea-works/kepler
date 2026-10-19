# Effort

[Workflow phase index](README.md)

## Purpose

Effort controls the detail of analysis and documentation across stages. It does not remove required information or weaken verification.

Each stage uses this shared definition and can explain how to apply each effort level. Activities inherit the effort of their owning stage. They have no separate effort settings.

## Levels

| Effort | Expected detail |
| --- | --- |
| Minimal | Give necessary information with concise explanations. Add supporting files only when necessary to resolve material ambiguity. |
| Standard | Explain significant decisions, interactions, and risks. Add focused supporting documents when the required document would become difficult to read. |
| Comprehensive | Analyze complex behavior, alternatives, failure conditions, and concerns across boundaries in detail. Keep explicit links to the necessary documents. |

Effort does not prescribe a file count or page length. A model document can be necessary for a complex Unit of Work at Minimal effort. Do not add invented complexity to a simple Unit of Work at Comprehensive effort.

Effort does not select which stages execute. It does not change required information, acceptance criteria, verification requirements, or approval authority. It does not change review triggers or turn requester-triggered external review into an automatic gate.

## Selection rules

| Subject | Rule |
| --- | --- |
| Scope | Set one default effort for the Unit of Work. Stages inherit it unless an explicit stage override exists. Activities inherit their owning stage's effort. Do not set an Activity override or a separate effort for each document. |
| Default | Use Standard when the requester has not selected another level. |
| Authority | The agent recommends adjustments with a short rationale. The requester selects whether to accept them. |
| Selection criteria | Compare uncertainty, domain complexity, interactions, consequences of incorrect decisions, and available references with the selected level. Code size alone is insufficient. |
| Recording | Record the unit default and explicit stage overrides as journal events through the `kepler` CLI, not artifact frontmatter. Calculate current selections from those events. Exact payloads and operations stay open. |
| Changes during work | Compare the current effort with the analysis necessary for new findings. Changes apply to current and future work. Revisiting completed work follows the shared revision rules. |

## Selection procedure

1. Start with the requester's selected effort, or Standard.
2. Compare the known uncertainty, complexity, interactions, impact of incorrect decisions, and references with the selected level. Select another level if the selected level is not sufficient or includes detail that is not necessary.
3. If you recommend an adjustment, state it and its rationale. The requester selects whether to accept it.
4. Record the selected level and each stage override through the `kepler` CLI.
5. Compare the current effort with the analysis necessary for new findings. Select another level when the current level is not sufficient or has detail that is not necessary.

Use the shared [Revision procedure](revision.md#revision-procedure) if completed work must be revisited. An effort selection does not replace stage completion conditions.

### Illustrative example

Comprehensive Implementation Planning can be necessary for a walking skeleton because deployment and integration assumptions are unproven. Its narrow, familiar domain behavior can make only Minimal Functional Design necessary.

These are possible selections, not necessary settings for walking skeletons. Small functional scope does not automatically make every stage Minimal.

## Required documents and supporting detail

Required Unit of Work documents live directly under `.kepler/missions/<mission-id>/construction/units-of-work/<unit-id>/`. Paths are relative to the selected record-home working-tree root. Each required document has required sections.

Each required section contains the information necessary to understand and use its contract. A section can link to a supporting file for additional detail. The section must identify what that file explains.

Supporting files live under `.kepler/missions/<mission-id>/construction/units-of-work/<unit-id>/details/`. Use a stage subdirectory for stage-specific detail. Functional Design uses `details/functional-design/`.

Use supporting files instead of optional inline sections. Create a supporting file only when its content is useful. Do not create empty files or links to files that do not exist.

A supporting file is optional. Its location does not make an approved requirement optional.

## Content rules

- Document new or changed information. Refer to unchanged Project references.
- Keep one authoritative location for each definition. Use summaries and references elsewhere.
- Add diagrams, tables, and model descriptions only when they explain relevant information.
- Keep required documents concise. Keep material obligations in required sections or linked files. Do not make a reader search unlinked files to find an obligation.
- Give sufficient information for another agent to implement and verify the result without guessing a material decision.

## Decisions still required

Stage contracts select required documents. For Functional Design, use `unit-of-work.md` and `design.md`. The [Functional Design contract](phases/construction/functional-design.md#artifacts) gives their required sections.

For Quality Requirements, use `quality.md`. The [Quality Requirements contract](phases/construction/quality-requirements.md#required-sections) gives its required sections.

For Implementation Planning, use `plan.md` and `tasks-dag.json`. Its [accepted contract](phases/construction/implementation-planning.md#required-sections) gives the plan sections. No extra Markdown document is part of [Implementation](phases/construction/implementation.md#artifacts-and-records) or [Review](phases/construction/unit-of-work-review.md#artifacts-and-records).

For Deliver, use `delivery.md` with sections for outcome, operations, verification and recovery, and decisions. Use the [accepted Deliver contract](phases/construction/deliver.md#required-sections). These contracts do not add a document-level effort setting.

The shared [execution-state representation](runtime.md#execution-state-representation) calculates current selections from journal events. Event payloads, projection fields, and CLI operations for the unit default and stage overrides stay undecided. These are changing execution settings, not artifact identity metadata. This definition does not set persistence or CLI options.
