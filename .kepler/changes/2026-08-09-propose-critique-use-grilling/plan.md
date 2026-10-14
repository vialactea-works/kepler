# Plan: Refactor propose and critique onto hamilton-grilling

## Overview

- Change: `.hamilton/changes/2026-08-09-propose-critique-use-grilling/`
- Goal: Remove propose's inline dialogue protocol (steps 4, 7, 10 + Principles + diagram) and replace it with delegation calls to `hamilton-grilling`; add grilling to critique's `changes-requested` path between the rubric and the report so findings are validated before `critique.md` exists.
- Test: `bun --bun vitest run`
- Build / typecheck: `bun run build`
- Context notes: Two `SKILL.md` files are edited; no code, no CLI, no templates, no tests. `skills/` is not bundled and no test asserts on skill content (per [ticket 12](../../../maps/hamilton-wayfinder/tickets/12-propose-and-critique-use-grilling.md)). Verification is by reading edited steps end-to-end — the route's craft focus is *what the deletions leave behind*: leftover half-instructions, non-sequiturs, and protocol duplication are the rot to catch. `hamilton-grilling/SKILL.md` is unchanged. See [design.md](design.md) for the four structural decisions (surgical extraction, step 7 retains approach-building, grilling between rubric and report, attendance guard at call site) and [requirements/propose.md](requirements/propose.md) + [requirements/critique.md](requirements/critique.md) for the SHALL statements and scenarios each task satisfies.
- Quality notes: Task seams follow the design's file boundary — propose tasks are sequential (same file), critique is independent (different file, no dependency on propose), and a final cross-file sediment check catches rot the individual edits leave behind. No structural smells accepted.

## Tasks

### Task 1: Delegate propose's three dialogue surfaces to grilling (steps 4, 7, 10)

- Depends on: none
- Files:
  - Created: none
  - Modified: `skills/hamilton-propose/SKILL.md`
  - Deleted: none
- Acceptance:
  - Step 4 delegates to `hamilton-grilling` with clarifying questions as content and "intent is clear" as the exit condition (req: propose #1, scenario: Attended clarifying questions)
  - Step 7 still builds the 2–3 approaches and their trade-offs; only the ask delegates to grilling with "an approach is chosen" as the exit condition (req: propose #2, scenario: Attended approach choice)
  - Step 10 delegates revision feedback to `hamilton-grilling` with "artifacts approved" as the exit condition (req: propose #3, scenario: Attended approval loop)
  - Each call site guards attendance: attended → invoke grilling; unattended → fall back (record assumption / pick recommended / record open questions) (req: propose #4, scenarios: Grilling invoked attended / Grilling not invoked unattended)
  - No protocol instructions (one-at-a-time, multiple-choice, recommendation-led, "lead with your recommendation") remain in steps 4, 7, or 10 (req: propose #5)
- Steps:
  1. Read `skills/hamilton-propose/SKILL.md` step 4 (the `4. **Ask clarifying questions.**` paragraph). Replace it with:

     ```
     4. **Ask clarifying questions.** Draw out purpose, constraints, and success criteria from
        the requester (a person, or the calling agent). Attended, invoke `hamilton-grilling`
        with those questions as content and "intent is clear" as the exit condition.
        Unattended, record a reasonable choice as an assumption. Do not start drafting until
        the intent is clear.
     ```

  2. Read step 7 (the `7. **Propose 2–3 approaches.**` paragraph). Replace it with:

     ```
     7. **Propose 2–3 approaches.** Before designing, lay out two or three ways to build it
        with their trade-offs and a recommendation. Attended, invoke `hamilton-grilling` with
        the approaches as content and "an approach is chosen" as the exit condition.
        Unattended, pick the recommended approach and record the reasoning.
     ```

  3. Read step 10 (the `10. **Get approval.**` paragraph). Replace it with:

     ```
     10. **Get approval.** Present the artifacts for review. Attended, invoke
         `hamilton-grilling` with the revision feedback as content and "artifacts approved"
         as the exit condition. Unattended, record open questions. Do not pass the gate
         until approved.
     ```

  4. Read steps 4 through 10 in context. Confirm: each call site names grilling, supplies content and exit condition, and carries the attendance guard. Confirm no protocol instruction (one-at-a-time, multiple-choice, "lead with your recommendation", "get the requester's choice") survives in these three steps.
- Verify: read `skills/hamilton-propose/SKILL.md` lines ~94–151 → steps 4, 7, 10 each delegate to grilling with content + exit condition + attendance guard; no protocol duplication.
- Commit: `MAESTRO: delegate propose steps 4/7/10 dialogue to hamilton-grilling`

### Task 2: Remove protocol duplication from propose Principles and diagram

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `skills/hamilton-propose/SKILL.md`
  - Deleted: none
- Acceptance:
  - Principles section: no sentence restates a protocol behaviour that `hamilton-grilling` owns (req: propose #5, scenario: Principles section after edit)
  - Process flow diagram: no node label references the one-at-a-time protocol or any grilling-owned behaviour (req: propose #5, scenario: Process flow diagram after edit)
- Steps:
  1. Read the Principles section (the `- **Collaborate.**` bullet). Replace:

     ```
     - **Collaborate.** Refine through dialogue — ask one question at a time, prefer
       multiple-choice, and confirm each section before moving on.
     ```

     with:

     ```
     - **Collaborate.** Refine through dialogue — confirm each section before moving on.
     ```

  2. Read the process flow diagram (the `digraph hamilton_propose` block). In the node declaration, replace:

     ```
         "Ask clarifying questions\n(one at a time)" [shape=box];
     ```

     with:

     ```
         "Ask clarifying questions" [shape=box];
     ```

  3. In the same diagram, update every edge that references the old node label. There are three edges to change. Replace each occurrence of `"Ask clarifying questions\n(one at a time)"` with `"Ask clarifying questions"`. The three edges are:

     ```
         "Explore context (read-only)" -> "Ask clarifying questions\n(one at a time)";
     ```
     →
     ```
         "Explore context (read-only)" -> "Ask clarifying questions";
     ```

     ```
         "Ask clarifying questions\n(one at a time)" -> "Proposal — why\n(problem, goals, capabilities)";
     ```
     →
     ```
         "Ask clarifying questions" -> "Proposal — why\n(problem, goals, capabilities)";
     ```

     ```
         "Approved?" -> "Ask clarifying questions\n(one at a time)" [label="changes requested"];
     ```
     →
     ```
         "Approved?" -> "Ask clarifying questions" [label="changes requested"];
     ```

  4. Read the Principles section and the diagram in context. Confirm: no protocol language survives outside the three step-level delegation calls.
- Verify: read `skills/hamilton-propose/SKILL.md` Principles section and process flow diagram → no protocol duplication remains.
- Commit: `MAESTRO: remove protocol duplication from propose Principles and diagram`

### Task 3: Add grilling to critique's changes-requested path

- Depends on: none (different file, independent of Tasks 1–2)
- Files:
  - Created: none
  - Modified: `skills/hamilton-critique/SKILL.md`
  - Deleted: none
- Acceptance:
  - New step 6 invokes `hamilton-grilling` on the `changes-requested` path, between the rubric (step 4) and the report write, with "every finding is validated" as the exit condition (req: critique #1, scenario: Attended changes-requested)
  - A false positive can be rejected; where a finding offers several fixes, the author picks one (req: critique #1, scenarios: A false positive is identified / A finding offers several fixes)
  - No grilling on the `approved` path (req: critique #2, scenario: Approved verdict)
  - Report written from the validated set, not the pre-grilling draft (req: critique #3, scenario: Findings after validation)
  - Attendance guarded: attended → invoke grilling; unattended → name the next step and return (req: critique #4, scenarios: Grilling invoked attended / Grilling not invoked unattended)
  - "Judge, don't fix" preserved: propose artifacts not modified, revision loop stays external (req: critique #5, scenario: Grilling validates but does not fix)
  - Process flow diagram updated: `changes-requested` branch shows a grilling step between the verdict and the findings write
- Steps:
  1. Read `skills/hamilton-critique/SKILL.md` steps 5 and 6 (the `5. **Decide a verdict:**` and `6. **Write the report**` lines). Insert a new step 6 between them, and renumber the old step 6 to step 7. Replace:

     ```
     5. **Decide a verdict:** `approved` or `changes-requested`.
     6. **Write the report** — the numbered format below — printed to chat **and** persisted to
        `critique.md` in the change directory.
     ```

     with:

     ```
     5. **Decide a verdict:** `approved` or `changes-requested`.
     6. **Validate findings with the author (changes-requested only).** When the verdict is
        `changes-requested`, invoke `hamilton-grilling` with the findings as content and
        "every finding is validated" as the exit condition, before writing the report. A
        false positive can be rejected; where a finding offers several fixes, the author
        picks one. Unattended, name the next step and return. On the `approved` path there
        are no findings, so grilling never runs. This step validates findings — it does not
        fix them: the propose artifacts are not modified, and the revision loop stays with
        whoever runs the pipeline.
     7. **Write the report** — the numbered format below — printed to chat **and** persisted to
        `critique.md` in the change directory, written from the findings that survived
        validation.
     ```

  2. Read the process flow diagram (the `digraph hamilton_critique` block). Add a grilling node on the `changes-requested` branch and reroute the edge through it. Replace:

     ```
         "Verdict?" -> "Write numbered findings" [label="changes-requested"];
         "Verdict?" -> "State what was verified" [label="approved"];
         "Write numbered findings" -> "Write critique.md + print to chat";
     ```

     with:

     ```
         "Verdict?" -> "Validate findings with author\n(hamilton-grilling)" [label="changes-requested"];
         "Validate findings with author\n(hamilton-grilling)" -> "Write numbered findings";
         "Verdict?" -> "State what was verified" [label="approved"];
         "Write numbered findings" -> "Write critique.md + print to chat";
     ```

     And add the node declaration alongside the existing nodes:

     ```
         "Validate findings with author\n(hamilton-grilling)" [shape=box];
     ```

  3. Read the critique Process section and diagram in context. Confirm: grilling runs only on `changes-requested`, between the rubric and the report; the `approved` path bypasses it; the attendance guard is present; "Judge, don't fix" is stated in the new step and unchanged in the intro.
- Verify: read `skills/hamilton-critique/SKILL.md` process (steps 5–7) and diagram → grilling on changes-requested path only; attendance guarded; "Judge, don't fix" preserved; report written from validated set.
- Commit: `MAESTRO: add hamilton-grilling to critique changes-requested path`

### Task 4: End-to-end sediment check on both skills + run gates

- Depends on: Task 2, Task 3
- Files:
  - Created: none
  - Modified: `skills/hamilton-propose/SKILL.md`, `skills/hamilton-critique/SKILL.md` (only if sediment is found and fixed)
  - Deleted: none
- Acceptance:
  - `skills/hamilton-propose/SKILL.md` reads cleanly end-to-end: no leftover half-instructions that referenced the now-removed protocol, no step that reads as a non-sequitur after the dialogue is extracted, no duplication between what propose still says about dialogue and what grilling owns (route craft focus, lines 213–220)
  - `skills/hamilton-critique/SKILL.md` reads cleanly end-to-end: no leftover half-instructions, no non-sequiturs, no contradiction between the new step 6 and the existing "Judge, don't fix" intro or the Handoff section
  - `bun run build` succeeds
  - `bun --bun vitest run` — all tests pass
- Steps:
  1. Read `skills/hamilton-propose/SKILL.md` in full, start to finish — not just the edited sections. Look for: a sentence that referenced the old protocol and now dangles; a step whose flow breaks because the dialogue instructions it leaned on are gone; any protocol language that survived outside the three delegation calls; the Handoff section, which may still describe dialogue behaviour that grilling now owns.
  2. If sediment is found, fix it in place. Delete the sentence — do not word-trim it (per `writing-great-skills`: when a sentence fails the no-op test, delete the whole sentence).
  3. Read `skills/hamilton-critique/SKILL.md` in full. Look for: a contradiction between the new step 6 and the "Judge, don't fix" intro (lines 18–20) or the Handoff section (lines 160–166); a diagram edge that doesn't match the new flow; the Report format section, which may need to acknowledge that findings are validated before the report is written.
  4. If sediment is found, fix it in place.
  5. Run `bun run build` — expect it to succeed (TypeScript typecheck, unaffected by skill edits).
  6. Run `bun --bun vitest run` — expect all tests to pass (test suite, unaffected by skill edits).
- Verify: `bun run build && bun --bun vitest run` → build succeeds, all tests pass.
- Commit: `MAESTRO: sediment check on propose and critique skills, gates green`

## Done when

- All tasks implemented (recorded in progress.md)
- `bun run build` passes; `bun --bun vitest run` passes
- All review feedback has been addressed
