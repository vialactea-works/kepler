# Plan: Wayfinder branching and operation rules

## Overview

- Change: .hamilton/changes/2026-08-19-wayfinder-branching-and-operation-rules/
- Goal: land the six wayfinder improvements designed in design.md — map `branch:` field, prototype branch gate (script-backed), operation rules on the map, hardened prototype dispatch, route Shipping rules, and same-session resolution — across the two wayfinder skills, the two wayfinder templates, one new helper script, and the docs that mirror them.
- Test: `bun --bun vitest run` (single file: `bun --bun vitest run tests/scripts/prototype-branch.test.ts`)
- Build / typecheck: `bun run build`
- Context notes: see design.md (Architecture & Components table) and requirements/. Script style follows `bundle/scripts/hamilton-isolate.sh` (plain text out, load-bearing value on the last line, exit 0/1/2); script tests follow `tests/scripts/isolate.test.ts` using `tests/scripts/helpers.ts` (`run`, `makeRepo`, `git`, `field` — vitest drives bash in temp repos, no mocks). `hamilton setup` copies all of `bundle/scripts/`, so the new script needs no CLI change, but `tests/cli/setup.test.ts` enumerates expected script names and `docs/skills.md` has a "Helper scripts" section that counts and tables them. The upstream byte-fidelity invariant on the prototype skill is retired (see requirements/ticket-resolution.md REMOVED) — edit its text freely. Per design Constraints: the Map mechanics contract lives in two homes (`skills/hamilton-wayfinder/SKILL.md` and `CONTRIBUTING.md`) and both must change in the same commit; never touch `hamilton-isolate.sh`, frontier/claim semantics, ticket types, or map lifecycle values. All artifact prose flows unwrapped.
- Quality notes: task seams follow the design's component table — one task per unit (script+tests, install/docs wiring, each template, each skill region), with the two mechanics homes deliberately bundled in Task 6 to honor the lockstep-commit rule. Tasks 6 and 7 edit the same skill file but along disjoint sections (charting/mechanics vs work loop/route), ordered serially. No accepted smells.

## Tasks

### Task 1: Add hamilton-prototype-branch.sh with behavior tests

- Depends on: none
- Files:
  - Created: `bundle/scripts/hamilton-prototype-branch.sh`, `tests/scripts/prototype-branch.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - The script owns the prototype-branch question per design ("Prototype branch gate semantics"): `hamilton-prototype-branch.sh <map-name> <ticket-name>` creates `prototype/<map-name>/<ticket-name>` from the current branch and switches to it; `--standalone <slug>` creates `prototype/<slug>`; `--verify <expected-branch>` confirms the current branch matches. Covers requirements/ticket-resolution.md scenarios "Branch created before code" and "Standalone invocation".
  - Contract matches the sibling scripts: human-readable lines with the load-bearing value last (the branch name for create/resume modes), a `mode: created` / `mode: resumed` field line, exit codes 0 yes/success, 1 no (`--verify` mismatch), 2 usage or environment error.
  - An existing `prototype/...` branch is checked out and reported `mode: resumed`, not an error (design decision: the branch is the ticket's identity).
  - Uncommitted changes ride along (plain `git switch -c` / `git switch` behavior); outside a git repository the script exits 2 with an error on stderr.
- Steps:
  1. Write `tests/scripts/prototype-branch.test.ts` first, following the structure of `tests/scripts/isolate.test.ts` (import from `./helpers.js`, `afterEach(cleanupRepos)`). Cases: creates the branch from the current branch and switches to it (status 0, `field(result, "mode")` is `created`, `lastLine` is `prototype/<map>/<ticket>`, `git branch --show-current` in the repo returns it); a dirty file survives the switch (write a file, don't commit, run, assert file still present and status 0); rerun on the existing branch reports `mode: resumed` with status 0; `--standalone my-question` produces `prototype/my-question`; `--verify` returns status 0 when the current branch matches the argument and status 1 when it does not; running with no arguments exits 2; running in a non-repo temp dir exits 2. Run the file — expect failures (script absent).
  2. Implement `bundle/scripts/hamilton-prototype-branch.sh` in the style of `hamilton-isolate.sh`: `#!/usr/bin/env bash`, header comment with usage lines, `set -uo pipefail`, `usage()`, `die()` (printf to stderr, exit 2), a `require_repo` guard via `git rev-parse --show-toplevel`. Create/resume logic: compute the branch name from the mode's arguments; if `git show-ref --verify --quiet refs/heads/<name>` then `git switch <name>` and print `mode: resumed`, else `git switch -c <name>` and print `mode: created`; print the branch name as the last line. `--verify <expected>` compares `git branch --show-current` to the argument, printing a verdict line and exiting 0/1.
  3. Run `bun --bun vitest run tests/scripts/prototype-branch.test.ts` — expect green.
- Verify: `bun --bun vitest run tests/scripts/prototype-branch.test.ts` → all tests pass
- Commit: `feat(scripts): add hamilton-prototype-branch.sh branch gate`

### Task 2: Register the new script in setup expectations and docs

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `tests/cli/setup.test.ts`, `docs/skills.md`
  - Deleted: none
- Acceptance:
  - `tests/cli/setup.test.ts` includes `hamilton-prototype-branch.sh` in its expected-scripts list (alphabetical position among the existing four) and the suite passes, proving `hamilton setup` installs it executable.
  - The `## Helper scripts` section of `docs/skills.md` says five scripts (updating "installs four scripts" and "Three properties hold across all four"), and its table gains a row: `hamilton-prototype-branch.sh` — create/resume `prototype/<map-name>/<ticket-name>` from the current branch (`<map> <ticket>`, `--standalone <slug>`) or confirm the checkout landed (`--verify <branch>`) — called by `wayfinder-prototype`.
- Steps:
  1. Add the script name to the expected list in `tests/cli/setup.test.ts`; run `bun --bun vitest run tests/cli/setup.test.ts` — expect green.
  2. Update the counts and add the table row in `docs/skills.md`.
- Verify: `bun --bun vitest run tests/cli/setup.test.ts` → passes; `grep -c "hamilton-prototype-branch" docs/skills.md` → at least 1
- Commit: `docs: register hamilton-prototype-branch.sh in setup test and helper-scripts docs`

### Task 3: Add branch field and Operation rules section to the map template

- Depends on: none
- Files:
  - Created: none
  - Modified: `bundle/templates/wayfinder/map.md`
  - Deleted: none
- Acceptance:
  - Frontmatter carries `status: open` and `branch:` with an inline hint that it names the branch the effort works from and merges back into, set at map creation (requirements/artifact-templates.md scenario "Map template installed").
  - Body sections in order: Destination, Notes, Operation rules, Decisions so far, Not yet specified, Out of scope. The Operation rules hint states it holds prescriptive, per-session-binding rules on how working sessions operate (e.g. commit after resolving a ticket, delegate a job class to a named subagent), may be empty, and distinguishes itself from Notes' orienting context (scenario "Operation rules distinguished from Notes").
  - The header comment block and the existing hints' style (HTML comments, delete-before-finalizing idiom) are preserved.
- Steps:
  1. Edit the template: add the `branch:` line under `status:` in the frontmatter with a hint comment, and insert the `## Operation rules` section with its hint between Notes and Decisions so far.
  2. Inspect the result against the acceptance list.
- Verify: `grep -n "branch:\|Operation rules" bundle/templates/wayfinder/map.md` → both present, section between Notes and Decisions so far
- Commit: `feat(templates): map records working branch and operation rules`

### Task 4: Add Shipping rules section to the route template

- Depends on: none
- Files:
  - Created: none
  - Modified: `bundle/templates/wayfinder/route.md`
  - Deleted: none
- Acceptance:
  - A `## Shipping rules` section sits between the preamble and `## Units`, with a hint saying it describes how the units will be shipped — the branch units merge back into (seeded from the map's `branch:` field), commit and merge/PR conventions, and any standing shipping constraint every unit inherits, including shipping-relevant operation rules carried over from the map (requirements/artifact-templates.md scenario "Route template installed").
  - No frontmatter is added; the template idiom (comment block, inline hints) is preserved.
- Steps:
  1. Insert the `## Shipping rules` section with its hint after the preamble hint and before `## Units`.
  2. Inspect the result against the acceptance list.
- Verify: `grep -n "Shipping rules\|## Units" bundle/templates/wayfinder/route.md` → Shipping rules appears before Units
- Commit: `feat(templates): route carries shipping rules`

### Task 5: Gate the prototype skill on the prototype branch

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `skills/hamilton-wayfinder-prototype/SKILL.md`
  - Deleted: none
- Acceptance:
  - A new gate section (e.g. `## Branch gate`, placed before "Rules that apply to every prototype") instructs: before any prototype artifact is written, create/resume the prototype branch from the current branch by running `~/.hamilton/scripts/hamilton-prototype-branch.sh <map-name> <ticket-name>` when resolving a map ticket (`<map-name>` the effort slug, `<ticket-name>` the ticket file's `NN-slug`) or `--standalone <question-slug>` otherwise; the last line is the branch to confirm with `--verify`. A manual fallback is stated beside it (`git switch -c prototype/<map-name>/<ticket-name>`, or `git switch` if it exists) for when the script is not installed — the pattern hamilton-propose uses for isolate. The section states plainly: no prototype code before this gate has run (requirements/ticket-resolution.md "Branch gate" scenarios).
  - Rule 6 ("Capture it when done") is rewritten per requirements/ticket-resolution.md MODIFIED "Prototype capture at close": commit outstanding prototype work on the prototype branch, return to the starting branch, fold any validated decision into the real artifact there, record verdict in the ticket's `## Answer` and the branch pointer in the ticket body — no longer "commit it to a throwaway branch" as a closing move, since the code was born on its branch.
  - The process-flow digraph gains the gate node between "Pick the shape" and "Build throwaway" and the capture node's label reflects commit-and-return.
- Steps:
  1. Add the branch-gate section with the script invocation, the manual fallback, and the no-code-before-gate rule.
  2. Rewrite rule 6 to the commit-on-branch-and-return shape.
  3. Update the digraph accordingly.
- Verify: `grep -n "prototype-branch\|Branch gate\|prototype/<" skills/hamilton-wayfinder-prototype/SKILL.md` → gate section, script call, and branch format all present
- Commit: `feat(skills): prototype skill gates on prototype/<map>/<ticket> branch`

### Task 6: Wayfinder charting records branch and operation rules; mechanics gains the branch field

- Depends on: Task 3
- Files:
  - Created: none
  - Modified: `skills/hamilton-wayfinder/SKILL.md`, `CONTRIBUTING.md`
  - Deleted: none
- Acceptance:
  - "Chart the map" step 4 says the map is created with `branch:` set to the branch the charting session is on — the branch the effort works from and merges back into — and, on a detached HEAD, the repo's default branch is recorded and the user told (requirements/wayfinder.md "Map records its working branch", design edge case).
  - A charting step (after naming the destination, e.g. within step 1 or as its own numbered step before map creation) asks the user for operation rules — standing per-effort instructions on how working sessions operate, with the commit-after-resolution and subagent-delegation examples — and records them in the map's Operation rules section, which may be left empty (requirements/wayfinder.md "Charting asks for operation rules").
  - "The map" section's list of map sections includes Operation rules so the skill's description matches the template.
  - `## Map mechanics` frontmatter paragraph documents the map's `branch:` field (the branch the effort works from and merges back into; maps created before the field fall back to the repo's default branch), and the matching table row/prose is added to `CONTRIBUTING.md`'s `## Map mechanics` — both homes in this one commit (design constraint "Always").
- Steps:
  1. Update "The map" section, charting steps, and `## Map mechanics` in `skills/hamilton-wayfinder/SKILL.md`.
  2. Add the `branch` field to `CONTRIBUTING.md`'s Map mechanics contract (frontmatter table gains a `branch` (map) row with its meaning; note the legacy fallback).
  3. Update the charting side of the process-flow digraph if a new step was added.
- Verify: `grep -n "branch" skills/hamilton-wayfinder/SKILL.md CONTRIBUTING.md | grep -i "map\|merge"` → field documented in both files; `grep -n "Operation rules" skills/hamilton-wayfinder/SKILL.md` → present in charting and map description
- Commit: `feat(skills): wayfinder charting records working branch and operation rules`

### Task 7: Harden the wayfinder work loop and route writing

- Depends on: Task 4, Task 6
- Files:
  - Created: none
  - Modified: `skills/hamilton-wayfinder/SKILL.md`
  - Deleted: none
- Acceptance:
  - Work-loop step 1 ("Load the map") additionally reads the map's `branch:` and Operation rules, and states the session applies each rule to the actions it covers — commit-after-resolution produces a commit when a ticket resolves; a subagent-delegation rule routes the named job to the named subagent (requirements/wayfinder.md "Working sessions obey operation rules" scenarios).
  - Work-loop step 3 ("Claim it") states claiming is the start of resolution: the same session resolves the ticket, never a later one. The one-ticket-per-session sentence is extended to "a ceiling, not a deferral: the ticket you claim is the ticket you resolve, now" (requirements/wayfinder.md "A claimed ticket resolves in the claiming session").
  - Work-loop step 4 ("Resolve it") becomes imperative per type: the resolving skill MUST be loaded (SKILL.md read, or Skill tool) before any resolution work; for a prototype ticket, no prototype code before `hamilton-wayfinder-prototype` is loaded and its branch gate has run. The "Skill dispatch" section's intro sentence gains the same MUST framing (requirements/wayfinder.md "Ticket-type dispatch is imperative").
  - "The route" section instructs writing the `## Shipping rules` section from the map's `branch:` field (merge-back target) and shipping-relevant operation rules, so the route is self-contained for downstream processes (requirements/wayfinder.md "The route carries shipping rules").
  - The process-flow digraph reflects the imperative resolve step (e.g. node text "Load resolving skill, then resolve by type") and route writing with shipping rules.
- Steps:
  1. Rewrite work-loop steps 1, 3, 4 and the one-ticket-per-session sentence per the acceptance list.
  2. Strengthen the "Skill dispatch" intro to MUST language.
  3. Extend "The route" with the Shipping rules instruction.
  4. Update the digraph nodes touched.
- Verify: `grep -n "MUST\|Shipping rules\|ceiling" skills/hamilton-wayfinder/SKILL.md` → imperative dispatch, shipping-rules instruction, and same-session wording all present
- Commit: `feat(skills): wayfinder enforces same-session, rule-abiding, skill-loaded resolution`

## Done when

- All tasks implemented (recorded in progress.md)
- `bun --bun vitest run` passes; `bun run build` is clean
- All review feedback has been addressed
