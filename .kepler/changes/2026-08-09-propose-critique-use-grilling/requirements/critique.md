# Capability: critique

The skill that reviews a change's propose-phase artifacts — proposal, requirements, design — for logical consistency, semantic coherence, code-reference validity, and design quality, returning a numbered findings report and a verdict.

## ADDED Requirements

### Requirement: Grilling on the changes-requested path

The critiquing skill SHALL invoke `hamilton-grilling` on the `changes-requested` path, between the code-quality rubric and writing the report, to validate each finding with the author one at a time.

- Priority: must
- Rationale: findings drafted in isolation may include false positives or offer several fixes where the author's preference matters. Walking them with the author before the report exists ensures `critique.md` is written from the validated set.
- Reference: [Update propose and critique to use grilling](../../../maps/hamilton-wayfinder/tickets/12-propose-and-critique-use-grilling.md)

#### Scenario: Attended changes-requested

- WHEN the verdict is `changes-requested` and the skill runs attended
- THEN it invokes `hamilton-grilling` with the findings as content and "every finding is validated" as the exit condition, before writing `critique.md`

#### Scenario: A false positive is identified

- WHEN the author rejects a finding during the grilling walk
- THEN that finding is removed from the set written into `critique.md`

#### Scenario: A finding offers several fixes

- WHEN a finding has multiple valid fixes and the author picks one
- THEN the chosen fix is recorded in `critique.md` and the alternatives are noted

### Requirement: No grilling on the approved path

The critiquing skill SHALL NOT invoke `hamilton-grilling` on the `approved` path, where there are no findings to validate.

- Priority: must
- Rationale: on the `approved` path the verdict is clean — there is nothing to walk with the author. Running grilling with no content would stall a HITL primitive for no purpose.

#### Scenario: Approved verdict

- WHEN the verdict is `approved`
- THEN `hamilton-grilling` is not invoked, and `critique.md` is written directly from the verified set

### Requirement: Report written from the validated set

The critiquing skill SHALL write `critique.md` from the findings that survived the grilling validation, not from the pre-grilling draft.

- Priority: must
- Rationale: placing grilling before the write is what makes the validation meaningful — the report is the artifact the author acts on, so it must reflect the validated set.

#### Scenario: Findings after validation

- WHEN grilling has validated the findings
- THEN `critique.md` is written from the validated set, with rejected findings excluded

### Requirement: Attendance guarded at the grilling call site

The critiquing skill SHALL guard attendance at the grilling call site: attended → invoke `hamilton-grilling`; unattended → name the next step and return.

- Priority: must
- Rationale: `hamilton-grilling` is strictly HITL and never gains an unattended mode. The attendance check belongs to the caller.

#### Scenario: Grilling invoked attended

- WHEN the verdict is `changes-requested` and the skill runs attended
- THEN it invokes `hamilton-grilling`

#### Scenario: Grilling not invoked unattended

- WHEN the verdict is `changes-requested` and the skill runs unattended
- THEN it does not invoke `hamilton-grilling`, names the next step, and returns

### Requirement: "Judge, don't fix" preserved

The critiquing skill SHALL NOT edit `proposal.md`, `requirements/`, or `design.md` — the "Judge, don't fix" commitment survives the grilling addition untouched. The revision loop stays with whoever runs the pipeline.

- Priority: must
- Rationale: grilling validates findings by walking them with the author; it does not fix them. Placing grilling before the report write preserves both of critique's commitments: the skill never edits the propose artifacts, and the revision loop stays external.

#### Scenario: Grilling validates but does not fix

- WHEN grilling walks a finding with the author
- THEN the finding may be rejected or a fix preferred, but the propose artifacts are not modified

## MODIFIED Requirements

None. No canonical spec exists for the `critique` capability; the requirements above are the first formal tracking of the grilling behaviour.

## REMOVED Requirements

None.

## RENAMED Requirements

None.
