---
type: grilling
status: resolved
blocked_by: [07]
---

# Update propose and critique to use hamilton-grilling

## Question

How do `hamilton-propose` and `hamilton-critique` delegate their one-question-at-a-time dialogue to `hamilton-grilling` instead of embedding the pattern inline?

[Which siblings to port, and their Hamilton shape](07-which-siblings-to-port.md) decided to port grilling as a general-purpose dialogue primitive (`hamilton-grilling`), and to have propose and critique use it. This ticket decides the shape of that refactor; the edits themselves are a route unit.

Settle:

- What changes in propose's entrypoint and flow when it reaches for grilling instead of conducting dialogue itself?
- Same for critique.
- Are there any propose/critique-specific dialogue behaviors that don't fit grilling's generic pattern?
- Test coverage updates needed once the refactor lands.

## Answer

**Propose and critique call `hamilton-grilling` as a skill. Grilling is a near-verbatim upstream port that owns only the dialogue protocol; callers own question content and the exit condition. Propose delegates at all three of its dialogue surfaces; critique — which today has no dialogue at all — gains grilling on the `changes-requested` path, validating findings with the author before `critique.md` is written. The HITL boundary is enforced at the call site, not inside grilling. No test coverage needed.**

### Correction to ticket 07's premise

[Which siblings to port](07-which-siblings-to-port.md) states that "`hamilton-propose` and `hamilton-critique` already encode this dialogue internally." That holds for propose, but **not** for critique. Critique is explicitly *"Judge, don't fix"* — a one-shot reader that grounds references, writes a numbered report, and hands back. Its only question is a single handoff gate. There was no inline dialogue in critique to extract; what follows adds one deliberately.

### How grilling is invoked

As a **skill**, not an imported module or function. Both callers reach for it the way any Hamilton skill reaches for another.

### Grilling's boundary

`hamilton-grilling` is ported as close to upstream as possible and owns the **protocol only**:

- one question at a time, waiting for the answer before continuing
- lead with a recommended answer
- look facts up in the environment rather than asking
- never answer for the human — the decisions are theirs

It knows nothing about approaches, artifacts, findings, or the pipeline. The **caller** assembles each question fully-formed and decides when the loop terminates. This is what keeps grilling reusable outside the pipeline and small enough to stay near-verbatim to upstream.

Each caller therefore carries its own exit condition: intent is clear (propose step 4), an approach is chosen (step 7), the artifacts are approved (step 10), every finding is validated (critique).

### Propose's changes

All three dialogue surfaces delegate:

- **Step 4 — clarifying questions.** The direct match; this is where the duplicated one-at-a-time pattern lives today.
- **Step 7 — approach choice.** Propose still builds the 2–3 approaches and their trade-offs; grilling runs the ask. The choice is a human decision, so it gains the same attendance guard as the rest.
- **Step 10 — approval loop.** Revision feedback is walked one item at a time rather than presented as a block.

### Critique's changes

Critique gains grilling on the `changes-requested` path only, positioned **between the code-quality rubric and writing the report**. Findings are drafted, then walked with the author one at a time: a false positive can be rejected, and where a finding offers several fixes the author picks one. `critique.md` is then written from the validated set.

Placing it before the write is what preserves critique's two commitments. **"Judge, don't fix" survives untouched** — critique still never edits `proposal.md`, `requirements/`, or `design.md` — and the revision loop stays with whoever runs the pipeline. On the `approved` path there are no findings, so grilling never runs.

### Unattended operation

Unattended is first-class across the repo: every skill has an unattended branch, and `hamilton-orchestrate` dispatches subagents told there is no person in the loop. Grilling is strictly HITL, and [Ticket types in the Hamilton fork](08-ticket-types.md) keeps that rule.

**The call site guards it.** Propose and critique check for attendance: attended → invoke `hamilton-grilling`; unattended → fall back to the behavior they already document (propose records a reasonable choice as an assumption; critique names the next step and returns). Grilling itself keeps exactly one behavior and never gains an unattended mode.

This matches ticket 08's split cleanly — strict HITL for wayfinder's planning phase, Hamilton's three-tier model for SDD execution — and leaves the wayfinder-side and pipeline-side versions of grilling identical.

### Test coverage

**None needed.** `skills/` is not part of `bundle/`, `hamilton setup` never installs it, and no test in the repo asserts on skill content — `tests/cli/setup.test.ts` covers only bundled templates and guidelines. This refactor edits two `SKILL.md` files and adds a third; it is verified by reading.

The test impact recorded in [Template convention](05-template-convention.md) is a separate concern: it concerns `bundle/templates/wayfinder/`, which this refactor does not touch, and stays with its own route unit.

### Ticket type correction

This ticket was typed `task`, but its body is a `Settle:` list and it blocks [Compose route.md](11-compose-route.md) — route composition cannot begin until every decision is settled. That makes it a decision ticket, retyped `grilling`. The refactor it specifies is execution and becomes a route unit.
