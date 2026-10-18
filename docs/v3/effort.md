# Effort

[Workflow phase index](README.md)

## Purpose

Effort controls the detail of analysis and documentation across stages. It does not remove required information or weaken verification.

Each stage uses this shared definition and can explain how to apply each effort level. Activities inherit the effort of their owning stage; they have no separate effort settings.

## Levels

| Effort | Expected detail |
| --- | --- |
| Minimal | Supply required information with concise explanations. Add supporting files only where needed to resolve material ambiguity. |
| Standard | Explain significant decisions, interactions, and risks. Add focused supporting documents when the required document would become difficult to read. |
| Comprehensive | Analyze complex behavior, alternatives, failure conditions, and concerns across boundaries in detail. Maintain explicit links to the required documents. |

Effort does not prescribe a file count or page length. A complex Unit of Work at Minimal effort can need a model document. A simple Unit of Work at Comprehensive effort does not need invented complexity.

Effort does not determine which stages execute. It does not change required information, acceptance criteria, verification requirements, or approval authority. It does not change review triggers or turn requester-triggered external review into an automatic gate.

## Selection rules

| Subject | Rule |
| --- | --- |
| Scope | Set one default effort for the Unit of Work. Stages inherit it unless an explicit stage override exists. Activities inherit their owning stage's effort. Do not set an Activity override or a separate effort for each document. |
| Default | Use Standard when the requester has not selected another level. |
| Authority | The agent recommends adjustments with a short rationale. The requester decides whether to accept them. |
| Selection criteria | Consider uncertainty, domain complexity, interactions, consequences of incorrect decisions, and available references. Code size alone is insufficient. |
| Recording | Record the unit default and explicit stage overrides as journal events through the `kepler` CLI, not artifact frontmatter. Derive current selections from those events. Exact payloads and operations remain open. |
| Changes during work | Reassess effort when new findings change the analysis needed. Changes apply to current and future work. Revisiting completed work follows the shared revision rules. |

## Selection procedure

1. Start with the requester's selected effort, or Standard.
2. Assess whether the known uncertainty and complexity justify another level.
3. Present any recommended adjustment and its rationale. The requester decides whether to accept it.
4. Record the agreed selection and any stage override through the `kepler` CLI.
5. Reassess when new findings materially change the analysis needed.

Use the shared [Revision procedure](revision.md#revision-procedure) if completed work must be revisited. An effort selection does not replace stage completion conditions.

### Illustrative example

A walking skeleton can need Comprehensive Implementation Planning because deployment and integration assumptions are unproven. Its narrow, familiar domain behavior can need only Minimal Functional Design.

These are possible selections, not required settings for walking skeletons. Small functional scope does not automatically make every stage Minimal.

## Required documents and supporting detail

Required Unit of Work documents live directly under `.kepler/units-of-work/<unit-id>/`. Each required document has a defined set of required sections.

Each required section contains the essential information needed to understand and use its contract. A section can link to a supporting file for additional detail. The section must identify what that file explains.

Supporting files live under `.kepler/units-of-work/<unit-id>/details/`. Use a stage subdirectory for stage-specific detail. Functional Design uses `details/functional-design/`.

Use supporting files instead of optional inline sections. Create a supporting file only when its content is useful. Do not create empty files or links to files that do not exist.

A supporting file is optional to create. Its location does not make an approved requirement optional to follow.

## Content rules

- Document new or changed information. Refer to unchanged Project references.
- Keep one authoritative location for each definition. Use summaries and references elsewhere.
- Add diagrams, tables, and model descriptions only when they explain relevant information.
- Keep required documents concise. Do not require a reader to inspect unlinked files to discover a material obligation.
- Supply enough information for another agent to implement and verify the result without guessing a material decision.

## Decisions still required

Stage contracts select required documents. The [Functional Design contract](phases/construction/functional-design.md#artifacts) requires `unit-of-work.md` and `design.md`. That contract defines the required sections of both documents for Functional Design. The [Quality Requirements contract](phases/construction/quality-requirements.md#required-sections) defines the required sections of `quality.md`. Implementation Planning requires `plan.md` and `tasks-dag.json`; its [accepted contract](phases/construction/implementation-planning.md#required-sections) defines the plan sections. The [Implementation](phases/construction/implementation.md#artifacts-and-records) and [Review](phases/construction/unit-of-work-review.md#artifacts-and-records) contracts require no additional Markdown document. The [accepted Deliver contract](phases/construction/deliver.md#required-sections) requires `delivery.md` with outcome, operations, verification and recovery, and decision sections. These contracts do not add document-level effort settings.

The shared [execution-state representation](runtime.md#execution-state-representation) derives current selections from journal events. Event payloads, projection fields, and CLI operations for the unit default and stage overrides remain undecided. These are changing execution settings, not artifact identity metadata. This definition does not implement persistence or CLI options.
