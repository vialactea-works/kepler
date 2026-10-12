# Design: Refactor propose and critique onto hamilton-grilling

## Context

`hamilton-grilling` shipped in unit 4 as the canonical dialogue protocol — one question at a time, recommendation-led, facts looked up rather than asked, never answering for the human, no action before confirmed shared understanding. The [dialogue spec](../../specs/dialogue.md) fixes the boundary: the protocol owns *how* a question is asked; the caller owns *what* is asked and *when* to stop.

`hamilton-propose` currently embeds that protocol inline at three steps (4, 7, 10), restates it in its Principles section, and labels it in its process flow diagram. Every protocol sentence in propose is now duplication. `hamilton-critique` has no dialogue today; [ticket 12](../../maps/hamilton-wayfinder/tickets/12-propose-and-critique-use-grilling.md) adds grilling on the `changes-requested` path, positioned between the rubric and the report so findings are validated before `critique.md` exists.

Neither skill has a canonical spec (`.hamilton/specs/`); both are tracked only as skill files under `skills/`.

## Goals / Non-Goals

**Goals**

- Remove all dialogue-protocol duplication from propose — steps 4, 7, 10 delegate to grilling; the Principles restatement and diagram label go.
- Add grilling to critique's `changes-requested` path between the rubric and the report.
- Guard attendance at each call site so grilling (strictly HITL) is never invoked unattended.
- Preserve "Judge, don't fix" — critique still never edits artifacts.

**Non-Goals**

- Modify `hamilton-grilling` — it ships as-is.
- Add tests — `skills/` is not bundled and no test asserts on skill content.
- Create canonical specs for propose or critique — the requirements deltas are the first formal tracking; finish-work will fold them if and when specs are introduced.
- Update `docs/skills.md` — the "skills do not call each other" sentence becomes false, but correcting it belongs to unit 9.

## Decisions

### Decision: Surgical extraction at each call site

- Choice: at each of the three call sites in propose and the one in critique, replace the inline dialogue instructions with a delegation call to `hamilton-grilling`, keeping the question content and exit condition at the call site. Each call site carries its own attendance guard.
- Alternatives considered: (1) a shared "Delegating to grilling" section per skill, referenced from each call site — rejected because the skills are procedural documents read top-to-bottom, and a shared section forces a reader at step 4 to jump elsewhere to understand what happens. (2) A parameterized call-site template — not meaningfully different from surgical extraction with a consistent wording pattern.
- Rationale: each call site is self-contained — a reader at step 4 understands the delegation, the exit condition, and the attendance guard without leaving the step. The attendance guard is short; repeating it at each site is clearer than abstracting it behind a shared section that breaks the procedural flow.

### Decision: Step 7 retains approach-building

- Choice: propose still builds the 2–3 approaches and their trade-offs at step 7; only the ask delegates to grilling.
- Alternatives considered: delegate the entire step including approach-building — rejected because building approaches is propose's domain expertise, not dialogue protocol. Grilling owns *how* to ask; propose owns *what* to ask (the approaches).
- Rationale: ticket 12 is explicit — "Propose still builds the 2–3 approaches and their trade-offs; grilling runs the ask."

### Decision: Grilling positioned between rubric and report in critique

- Choice: on the `changes-requested` path, grilling runs after the code-quality rubric (step 4) and before the verdict/report (step 5/6).
- Alternatives considered: (1) after the report is written — rejected because the report should reflect the validated set, not a pre-validation draft. (2) before the rubric — rejected because the rubric produces the findings grilling walks; running grilling before findings exist has no content.
- Rationale: ticket 12 fixes this position — "between the code-quality rubric and writing the report." Placing it before the write is what preserves "Judge, don't fix": the report is the artifact the author acts on, so it must reflect the validated set.

### Decision: Attendance guard at the call site, not in grilling

- Choice: each call site checks attendance: attended → invoke grilling; unattended → fall back (propose records an assumption; critique names the next step and returns).
- Alternatives considered: add an unattended mode to grilling — rejected by ticket 12 and the dialogue spec ("One behavior, and no unattended fallback"). The attendance check belongs to the caller.
- Rationale: the dialogue spec's invariant is explicit — the protocol never gains a second mode. Pushing the check to the call site keeps grilling near-verbatim to upstream and leaves the caller in control of its own degradation path.

## Architecture & Components

Two files are edited; no new files, no new dependencies.

| Component | Responsibility | Change |
|-----------|---------------|--------|
| `skills/hamilton-propose/SKILL.md` | The proposing skill | Steps 4, 7, 10: inline dialogue → delegation to grilling. Principles: remove protocol restatement. Process flow diagram: remove protocol label. |
| `skills/hamilton-critique/SKILL.md` | The critiquing skill | Insert grilling step on `changes-requested` path between rubric and report. Update process flow diagram. |
| `skills/hamilton-grilling/SKILL.md` | The dialogue protocol | Unchanged. |

### Quality Lens

| Principle | Verdict | Notes |
|-----------|---------|-------|
| Single responsibility | ✅ | Each skill keeps one responsibility; grilling owns the protocol, callers own content and exit conditions. |
| DRY / single source of truth | ✅ | The protocol lives in one place (grilling). Removing the inline copies eliminates the duplication. |
| Low coupling | ✅ | Callers depend on grilling's interface (invoke by name), not its internals. The dialogue spec fixes the boundary. |
| Right-sized abstraction | ✅ | No new abstraction layer — a delegation call is a sentence, not a framework. The attendance guard is repeated rather than abstracted, because abstracting it would break the procedural flow. |

## Testing Strategy

No automated tests. `skills/` is not bundled, `hamilton setup` never installs it, and no test asserts on skill content — per [ticket 12](../../maps/hamilton-wayfinder/tickets/12-propose-and-critique-use-grilling.md). Verification is by reading the edited steps end-to-end: no leftover half-instructions, no step that reads as a non-sequitur, no duplication between what propose says about dialogue and what grilling owns.

The repo gates — `bun run build` and `bun --bun vitest run` — must stay green. They type-check TypeScript and run the vitest suite, neither of which touches `skills/`.

## Constraints & Boundaries

- Always: read the edited steps end-to-end after the edit, not just the diff — the craft focus is what the deletions leave behind.
- Never: modify `hamilton-grilling/SKILL.md` — it ships as-is.
- Never: add an unattended mode to grilling — the attendance check belongs at the call site.
- Never: break "Judge, don't fix" — critique still never edits `proposal.md`, `requirements/`, or `design.md`.

## Risks / Trade-offs

- [Sediment after removal] → The main risk is leftover half-instructions in propose: a sentence that referenced the now-removed protocol, a diagram label that still says "(one at a time)", a Principles bullet that restates what grilling owns. Mitigation: read the edited steps end-to-end, not just the diff. The `writing-great-skills` pass (later task in the playbook) catches this.
- [Attendance guard repetition] → The guard appears at four call sites (three in propose, one in critique). Repetition is accepted over abstraction to preserve the procedural flow.
- [`docs/skills.md` staleness] → The "skills do not call each other" note becomes false. Mitigation: recorded in the grilling port's impact section; correcting it belongs to unit 9.
