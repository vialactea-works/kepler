# Proposal: Refactor propose and critique onto hamilton-grilling

| Field   | Value                                          |
|---------|------------------------------------------------|
| Change  | 2026-08-09-propose-critique-use-grilling       |
| Status  | approved                                       |
| Author  | agent (hamilton-propose)                       |
| Created | 2026-08-09                                     |

## Why

`hamilton-propose` embeds the one-question-at-a-time dialogue protocol inline at three separate steps — clarifying questions (step 4), approach choice (step 7), and the approval loop (step 10) — plus a protocol restatement in its Principles section and a label in its process flow diagram. `hamilton-grilling` shipped in unit 4 as the canonical owner of that protocol, so every protocol sentence left in propose is now duplication: a second source of truth that drifts the moment grilling evolves. `hamilton-critique` has no dialogue at all today, but [ticket 12](../../maps/hamilton-wayfinder/tickets/12-propose-and-critique-use-grilling.md) adds it deliberately on the `changes-requested` path — findings are walked with the author one at a time before `critique.md` is written, so a false positive can be rejected and a finding with several fixes can be resolved by the person who will act on them.

## Goals & Success Criteria

- Propose delegates its dialogue to `hamilton-grilling` at all three surfaces (steps 4, 7, 10), supplying question content and the exit condition at each call site.
- No dialogue-protocol instruction survives in propose that grilling already owns — one question at a time, leading with a recommendation, looking facts up rather than asking, never answering for the human.
- Critique invokes `hamilton-grilling` on the `changes-requested` path only, between the code-quality rubric and the report write, so `critique.md` is written from the validated set.
- "Judge, don't fix" survives untouched: critique still never edits `proposal.md`, `requirements/`, or `design.md`, and the revision loop stays with whoever runs the pipeline.
- Attendance is guarded at each call site: attended → invoke `hamilton-grilling`; unattended → fall back to the behaviour both skills already document.
- `hamilton-grilling` itself is unchanged — it never gains an unattended mode.
- `bun run build` and `bun --bun vitest run` stay green.

## Non-Goals

- **No changes to `hamilton-grilling`.** The protocol skill ships as-is; this change only adds call sites in its callers.
- **No test coverage.** `skills/` is not bundled, `hamilton setup` never installs it, and no test asserts on skill content — per [ticket 12](../../maps/hamilton-wayfinder/tickets/12-propose-and-critique-use-grilling.md).
- **No CLI or template changes.** The refactor touches only `skills/hamilton-propose/SKILL.md` and `skills/hamilton-critique/SKILL.md`.
- **No changes to the dialogue canonical spec.** `.hamilton/specs/dialogue.md` already documents the boundary this change implements; it is the spec working as intended.
- **No new canonical specs for propose or critique.** The skills exist without canonical specs; this change modifies their behaviour but does not introduce spec-level capability tracking for them beyond the requirements deltas below.

## Proposed Change

Two skill files are edited; no files are added or deleted.

**`skills/hamilton-propose/SKILL.md`** — three step-level edits and two cleanup edits:

- Step 4 (clarifying questions): the inline "one question at a time, multiple-choice when you can" instructions are replaced with a delegation call to `hamilton-grilling`, keeping the question content (purpose, constraints, success criteria) and the exit condition (intent is clear) at the call site. An attendance guard branches: attended → invoke grilling; unattended → record a reasonable choice as an assumption.
- Step 7 (approach choice): propose still builds the 2–3 approaches and their trade-offs; the ask is delegated to `hamilton-grilling` with "an approach is chosen" as the exit condition. Same attendance guard: unattended → pick the recommended approach and record the reasoning.
- Step 10 (approval loop): revision feedback is walked through `hamilton-grilling` one item at a time, with "artifacts approved" as the exit condition. Unattended → record open questions.
- Principles section: the "ask one question at a time, prefer multiple-choice" sentence is removed — it is protocol duplication now that grilling owns it.
- Process flow diagram: the step 4 label "Ask clarifying questions\n(one at a time)" is updated to remove the protocol label.

**`skills/hamilton-critique/SKILL.md`** — one step insertion and one diagram update:

- Between step 4 (code-quality rubric) and step 5 (verdict): on the `changes-requested` path, a grilling step validates each finding with the author one at a time. A false positive can be rejected; where a finding offers several fixes, the author picks one. Exit condition: every finding is validated. Attendance guard: attended → invoke grilling; unattended → name the next step and return. On the `approved` path, there are no findings, so grilling never runs.
- Process flow diagram: the `changes-requested` branch gains a grilling step between the rubric and the report write.
- "Judge, don't fix" is preserved by placement: grilling validates findings before the report exists, but critique still never edits the propose artifacts. The revision loop stays with whoever runs the pipeline.

## Capabilities

### New

None.

### Modified

- `propose`: dialogue at steps 4, 7, and 10 delegates to `hamilton-grilling` instead of being conducted inline; inline protocol instructions removed; attendance guarded at each call site.
- `critique`: gains `hamilton-grilling` on the `changes-requested` path between the rubric and the report, so findings are validated before `critique.md` is written; "Judge, don't fix" preserved; attendance guarded.

### Removed

None.

## Impact

Two `SKILL.md` files are edited. No code, no CLI, no templates, no tests. `bun run build` type-checks TypeScript (unaffected); `bun --bun vitest run` covers bundled templates and guidelines (unaffected). The change is verified by reading the edited steps end-to-end, not by automated tests — per ticket 12's test-coverage ruling.

One inheritance from [the grilling port](../2026-08-06-port-hamilton-grilling/proposal.md): `docs/skills.md` says in its `hamilton-review` notes that skills do not call each other. This change makes that false — propose and critique now call grilling. Correcting that sentence belongs to unit 9 (sync the framework docs), not here, since ticket 10 scopes unit 9 to `docs/skills.md` and `CONTRIBUTING.md`.

## Open Questions

None. [Ticket 12](../../maps/hamilton-wayfinder/tickets/12-propose-and-critique-use-grilling.md) resolves every decision this change implements: the protocol boundary, the three call sites in propose, the single call site in critique, the attendance guard, the "Judge, don't fix" preservation, and the test-coverage ruling.
