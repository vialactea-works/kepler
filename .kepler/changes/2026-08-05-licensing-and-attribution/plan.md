# Plan: Adopt Apache 2.0 and the attribution convention

## Overview

- Change: `.hamilton/changes/2026-08-05-licensing-and-attribution/`
- Goal: land the licence Hamilton grants its recipients (`LICENSE`, the `package.json` field, the README declaration), the attribution notice that discharges upstream's MIT terms (`NOTICE`), and the written rule that every future forked skill directory follows (`CONTRIBUTING.md`). See [proposal.md](proposal.md) for why and [design.md](design.md) for the decisions behind each.
- Test: `bun run test`
- Build / typecheck: `bun run build`
- Context notes:
  - **Docs and config only.** Nothing under `src/` or `tests/` changes. The three test files (`tests/paths.test.ts`, `tests/cli/bundle-root.test.ts`, `tests/cli/setup.test.ts`) read none of the files in this diff, so the suite is expected to stay green untouched throughout.
  - **`LICENSE` is byte-verbatim; the copyright line lives in `NOTICE`.** [requirements/licensing.md](requirements/licensing.md) says the Apache text is present "unmodified, including its appendix", and filling the appendix's `[yyyy] [name of copyright owner]` placeholder would modify it. `Copyright 2026 Caio Ferreira` therefore goes at the top of `NOTICE`, which is where Apache §4(d) puts attribution anyway. This resolves the one ambiguity between the two artifacts; flag it at review if the reading is wrong.
  - **Two files must carry byte-verbatim upstream MIT text**: `NOTICE` (Task 2) and the copy-pasteable template in `CONTRIBUTING.md` (Task 5). Task 2 establishes it by fetching upstream's own `LICENSE`; Task 5 copies from Task 2's result rather than re-fetching, so there is one origin and one verified copy path. Never type this text from memory — see the fourth decision in [design.md](design.md).
  - Existing conventions to follow: `CONTRIBUTING.md` uses `##` sections with `###` subsections and a numbered Rules list; `README.md` ends with the Development section, so the licence section appends after it. `AGENTS.md` forbids `bun test` — use `bun run test`.
- Quality notes: The seams are one file per task, which is also the design's structure — each file has one job (grant / attribution / machine declaration / entry-point declaration / the rule). No task needs "and" to describe. **No tests are added**, deliberately: nothing in the codebase reads `LICENSE`, `NOTICE`, or the `license` field, so a test asserting on them would assert a constant, and the one property with real weight — that the MIT text is verbatim — is a diff against the live upstream file, which does not belong in a test suite that must run offline. Each task therefore carries a concrete shell verify instead of a red-green loop. The MIT text is duplicated across Tasks 2 and 5 on purpose (each copy travels with a different unit of distribution); the plan keeps a single authoritative origin by having Task 5 copy from Task 2's verified block. No accepted structural smells.

## Tasks

### Task 1: Add the Apache 2.0 licence text

- Depends on: none
- Files:
  - Created: `LICENSE`
  - Modified: none
  - Deleted: none
- Acceptance:
  - `LICENSE` holds the complete Apache License 2.0 text as published by Apache, byte-for-byte, including the appendix (requirements/licensing.md — *Project licence grant* / *Licence text present*).
  - The appendix's `Copyright [yyyy] [name of copyright owner]` placeholder is left exactly as published — this file is not where Hamilton's copyright line goes.
- Steps:
  1. Fetch the canonical text: `curl -fsSL https://www.apache.org/licenses/LICENSE-2.0.txt -o LICENSE`. Do not retype or reformat it.
  2. Confirm the fetch landed a complete file, not an error page: it opens with `                                 Apache License` / `                           Version 2.0, January 2004`, and its tail contains `APPENDIX: How to apply the Apache License to your work.`
  3. Do not edit the file after fetching.
- Verify: `head -2 LICENSE && grep -c 'APPENDIX: How to apply' LICENSE && wc -l LICENSE` → the Apache License / Version 2.0 header lines, a count of `1`, and roughly 200 lines
- Commit: `docs: add the Apache 2.0 licence text`

### Task 2: Add the root NOTICE with upstream attribution

- Depends on: none
- Files:
  - Created: `NOTICE`
  - Modified: none
  - Deleted: none
- Acceptance:
  - `NOTICE` opens with Hamilton's own copyright line, `Copyright 2026 Caio Ferreira` — a single year, not a range, and a single named holder (requirements/licensing.md — *Project licence grant* / *Copyright line*).
  - It carries one attribution entry for `mattpocock/skills` giving the project URL, Matt Pocock's copyright line, and the full MIT permission text (*Upstream attribution notice* / *Upstream entry*).
  - The MIT block matches upstream's own `LICENSE` exactly, save for a uniform two-space indent (*Reproduced verbatim*).
  - It names no individual skill directory, and instead states that each forked skill directory carries its own sibling `NOTICE` (*No enumeration of skill directories*).
- Steps:
  1. Fetch upstream's licence file raw — this is the authoritative source for the permission text, and it must not be reconstructed from memory or from a summarising tool: `curl -fsSL https://raw.githubusercontent.com/mattpocock/skills/main/LICENSE -o /tmp/upstream-mit.txt`
  2. Confirm it is the MIT text and note the copyright line it actually carries: `cat /tmp/upstream-mit.txt`
  3. Write `NOTICE` in this shape, pasting the fetched file's contents in place of the placeholder block and indenting every one of its lines by exactly two spaces (blank lines stay blank):

     ```
     Hamilton
     Copyright 2026 Caio Ferreira

     This product includes software developed by third parties, listed below.

     ---

     Portions of this work are adapted from mattpocock/skills
     (https://github.com/mattpocock/skills), used under the MIT License. Each
     forked skill directory in this repository carries its own sibling NOTICE
     reproducing these terms, because a skill directory is installed on its own
     and travels detached from this file.

     Original work:

       <the contents of /tmp/upstream-mit.txt, every line indented two spaces>
     ```
  4. Do not name any skill directory in this file — the sentence about sibling notices is what covers them.
- Verify:
  ```bash
  sed -n '/^  MIT License$/,/SOFTWARE\.$/p' NOTICE | sed 's/^  //' > /tmp/notice-mit.txt
  diff /tmp/upstream-mit.txt /tmp/notice-mit.txt
  ```
  → no output (a trailing-newline-only note is acceptable). Also `grep -c 'Copyright 2026 Caio Ferreira' NOTICE` → `1`.
- Commit: `docs: add root NOTICE with upstream MIT attribution`

### Task 3: Declare the licence in package.json

- Depends on: none
- Files:
  - Created: none
  - Modified: `package.json`
  - Deleted: none
- Acceptance:
  - `package.json` has a top-level `"license"` field whose value is exactly `"Apache-2.0"`, and its existing `"private": true` field is unchanged (requirements/licensing.md — *Machine-readable licence declaration* / *Manifest field*).
  - The file remains valid JSON and no other field is touched.
- Steps:
  1. Add `"license": "Apache-2.0"` to the top-level object, immediately after `"private": true`, keeping the file's two-space indentation.
  2. Confirm nothing else moved: `git diff package.json` shows exactly one added line.
- Verify: `node -e 'const p=require("./package.json"); if(p.license!=="Apache-2.0"||p.private!==true) process.exit(1); console.log("ok")'` → prints `ok`
- Commit: `chore: declare Apache-2.0 in package.json`

### Task 4: State the licence in the README

- Depends on: Task 1, Task 2
- Files:
  - Created: none
  - Modified: `README.md`
  - Deleted: none
- Acceptance:
  - `README.md` ends with a `## License` section stating that Hamilton is licensed under Apache 2.0, pointing at `LICENSE` for the grant, and noting that forked skills carry upstream notices in `NOTICE` (requirements/licensing.md — *Licence stated at the entry point* / *Licence section*).
  - The section states the licence and points at the notice files; it does not narrate where the forked wayfinder skills came from (*Declaration, not provenance*). That prose belongs to `docs/skills.md` and is a later unit's work.
  - It is two or three sentences — a declaration, not an essay.
- Steps:
  1. Append a `## License` section after the Development section, at the end of the file.
  2. Write it as a declaration: Hamilton is licensed under the Apache License 2.0 (link `LICENSE`); some skills are adapted from other projects and their original licences are reproduced in `NOTICE` and in a `NOTICE` beside each forked skill (link `NOTICE`).
  3. Use relative markdown links in the style the README already uses for `AGENTS.md` and `CONTRIBUTING.md`.
- Verify: `tail -8 README.md` → shows the `## License` section with links to both `LICENSE` and `NOTICE`, and no sentence describing the origin of the wayfinder skills
- Commit: `docs: state the licence in the README`

### Task 5: Write the forked-skill attribution rule into CONTRIBUTING.md

- Depends on: Task 2
- Files:
  - Created: none
  - Modified: `CONTRIBUTING.md`
  - Deleted: none
- Acceptance:
  - `CONTRIBUTING.md` carries a `## Licensing and attribution` section stating that a forked skill directory gets a sibling `NOTICE` carrying both the upstream copyright and permission text and Hamilton's own modification copyright, and that its `SKILL.md` gets a one-line pointer naming the upstream skill, its licence, and the `NOTICE` (requirements/licensing.md — *Forked skill attribution rule* / *Rule is written down*).
  - The section states both placement constraints: the licence text goes in the sibling `NOTICE` rather than in `references/`, which in this repo means content the agent is expected to read, and rather than in the `SKILL.md` body, which enters context on every invocation (*Placement constraints stated*).
  - It includes a copy-pasteable `NOTICE` block with placeholders for the skill and upstream names, so every forked skill's notice differs only in those names rather than in wording (*Template is instantiable*).
  - Following the section alone is sufficient to produce a compliant notice, with no reference to this change directory or to the map ticket that decided it (*A later fork follows it*).
- Steps:
  1. Add a `## Licensing and attribution` section after the existing `## Documentation Conventions` section.
  2. State the rule in prose: Hamilton is Apache-2.0; when a skill directory is forked from another project, the skill directory — not the repo — is what users install, so the upstream notice has to travel inside it. Every forked skill directory therefore ships a sibling `NOTICE`, and its `SKILL.md` carries a one-line provenance pointer naming the upstream skill, its licence, and that `NOTICE`.
  3. State the two placement constraints and why each holds, in one sentence each: not `references/`, which in this repo means material the agent reads on invocation; not the `SKILL.md` body, which is a context cost paid every time the skill loads.
  4. Add the template under a `### Per-skill NOTICE template` subsection, as a fenced block. Take the MIT text from the root `NOTICE` you wrote in Task 2 — copy it, do not re-fetch and do not retype — preserving its two-space indent, and leave only the skill and upstream names as `<...>` placeholders:

     ```
     This skill is adapted from the "<upstream skill name>" skill in
     <upstream project> (<upstream project URL>), used under the MIT License.
     Modifications and additions are Copyright 2026 Caio Ferreira, licensed
     under the Apache License, Version 2.0.

     Original work:

       <the same two-space-indented MIT block that appears in the root NOTICE>
     ```
  5. Add one line telling the contributor what to do with it: drop it at `skills/<skill>/NOTICE` and substitute the two names.
- Verify:
  ```bash
  sed -n '/^  MIT License$/,/SOFTWARE\.$/p' CONTRIBUTING.md | sed 's/^  //' > /tmp/contributing-mit.txt
  sed -n '/^  MIT License$/,/SOFTWARE\.$/p' NOTICE | sed 's/^  //' > /tmp/notice-mit.txt
  diff /tmp/notice-mit.txt /tmp/contributing-mit.txt
  ```
  → no output; the template's MIT text is identical to the root `NOTICE`'s
- Commit: `docs: add the forked-skill attribution rule to CONTRIBUTING.md`

### Task 6: Flip unit 2 to shipped in the route

- Depends on: Task 1, Task 2, Task 3, Task 4, Task 5
- Files:
  - Created: none
  - Modified: `.hamilton/maps/hamilton-wayfinder/route.md`
  - Deleted: none
- Acceptance:
  - Unit 2's `Status:` line reads `shipped`, so the claim and the work merge together as [Where map artifacts live relative to per-unit worktrees](../../maps/hamilton-wayfinder/tickets/13-map-artifacts-and-worktrees.md) requires.
  - No other unit's status line and no other part of `route.md` changes.
- Steps:
  1. In `.hamilton/maps/hamilton-wayfinder/route.md`, under `### 2. Adopt Apache 2.0 and the attribution convention`, change `Status: pending` to `Status: shipped`.
  2. Confirm the diff is one line.
- Verify: `git diff --stat .hamilton/maps/hamilton-wayfinder/route.md` → 1 insertion, 1 deletion
- Commit: `docs: flip route unit 2 to shipped`

## Done when

- All six tasks implemented (recorded in `progress.md`)
- `bun run test` passes and `bun run build` is clean — both expected unchanged, since no source or test file is touched
- The MIT permission text in `NOTICE` and in the `CONTRIBUTING.md` template both diff clean against upstream's own `LICENSE`
- All review feedback has been addressed
