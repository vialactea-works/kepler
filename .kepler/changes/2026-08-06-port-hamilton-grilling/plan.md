# Plan: Port hamilton-grilling

## Overview

- Change: `.hamilton/changes/2026-08-06-port-hamilton-grilling/`
- Goal: land `skills/hamilton-grilling/` — the upstream grilling protocol ported verbatim as a general-purpose dialogue primitive, with the attribution that has to travel with it — so units 6, 7 and 8 have something to call. See [design.md](design.md) for the decisions and [requirements/dialogue.md](requirements/dialogue.md) for the acceptance scenarios.
- Test: `bun run test`
- Build / typecheck: `bun run build`
- Context notes:

  This change adds no TypeScript. Both gates are run for each task anyway, to confirm nothing was touched that should not have been — neither exercises the new files, and `skills/` is outside `bundle/` so `hamilton setup` never installs it.

  **The upstream source is `~/.claude/skills/grilling/SKILL.md`.** Copy from it; do not retype it. Its body is four paragraphs separated by single blank lines, LF endings, no trailing whitespace, and an em dash (`—`) in the third paragraph. Retyping is how the em dash silently becomes a hyphen.

  **The NOTICE template is the fenced block in `CONTRIBUTING.md` (lines 37–66).** Copy it; do not retype it. The blank lines inside the indented MIT block carry **two trailing spaces**, and `.hamilton/specs/licensing.md` makes that significant: a reproduced permission notice must be byte-for-byte, with uniform indentation the only permitted alteration. Editors that strip trailing whitespace on save will break this — Task 2's verify command is what catches it. Copy from `CONTRIBUTING.md` specifically, never from the root `NOTICE`; the spec's decision is that every copy instantiates the one template and no copy is derived from another copy.

  **Frontmatter is quoted, matching all nine existing skills.** Every `skills/*/SKILL.md` in this repo wraps its `description` value in double quotes; upstream's is bare. The string itself is unchanged — this is YAML style, inside the adaptation surface the design names, and it is the one thing here not settled upstream or by a ticket. If the intent was that the frontmatter line be byte-identical too, drop the quotes; nothing else in the plan depends on it.

  **The change directory is currently untracked.** Commit it before Task 1 as its own `docs:` commit, matching `7eb61a9` in the previous unit, so the proposal, requirements, design, and this plan land ahead of the work they describe.

- Quality notes: the task seams follow the design's component table one-for-one — one task per file, each a leaf with no inbound or outbound edges, each independently verifiable. Task 3 is route bookkeeping, which the design separates from the capability, so it is not bundled into either file's task. **No unit tests, by design, not by omission:** ticket 12 records that `skills/` is outside `bundle/`, `hamilton setup` never installs it, and no test in the repository asserts on skill content; adding a markdown-assertion harness for one file would be a larger change than the port. Each task's Verify is therefore a real red→green check — it fails before the file exists and passes after — rather than a test file. Two deliberate deviations ride along, both recorded in the design's Quality Lens and cross-listed under its Risks: the description ports unpruned against the route's craft focus, and the skill ships undocumented pending unit 9. Neither is a structural smell; no unit gains a second reason to change.

## Tasks

### Task 1: Port the grilling protocol into `skills/hamilton-grilling/SKILL.md`

- Depends on: none
- Files:
  - Created: `skills/hamilton-grilling/SKILL.md`
  - Modified: none
  - Deleted: none
- Acceptance:
  - The four instruction paragraphs are byte-identical to `~/.claude/skills/grilling/SKILL.md` (requirement *The protocol text is upstream's, unmodified* → scenario *Diffed against upstream*).
  - Frontmatter carries `name` and `description` only. `name` is `hamilton-grilling`; `description` is upstream's string unchanged. There is no `disable-model-invocation` key (requirement *Reachable by other skills* → scenario *Another skill reaches for it*).
  - The file's last line is the one-line provenance pointer, naming the upstream skill, the licence, and the `NOTICE` — per `CONTRIBUTING.md` line 29. The full permission text does not appear in this file.
  - The body mentions no approach, artifact, finding, pipeline step, or wayfinder term (requirement *The protocol is caller-agnostic* → scenario *An unrelated caller invokes it*).
  - Upstream's `agents/openai.yaml` is **not** ported (requirement *The protocol text is upstream's, unmodified* → scenario *Non-protocol upstream material*).
- Steps:
  1. Run the Verify command below. It fails — `skills/hamilton-grilling/SKILL.md` does not exist. This is the red state.
  2. Create the directory `skills/hamilton-grilling/`.
  3. Copy `~/.claude/skills/grilling/SKILL.md` to `skills/hamilton-grilling/SKILL.md` unmodified. Copy the file; do not retype its contents.
  4. In the copy's frontmatter, change the `name` value from `grilling` to `hamilton-grilling`. Leave the `description` value's text exactly as it is, and wrap it in double quotes to match the sibling skills. Add no other keys.
  5. Append to the end of the file a blank line followed by this single line, exactly as written between the fences below (the fences are not part of it):

     ```
     Adapted from the "grilling" skill in [mattpocock/skills](https://github.com/mattpocock/skills), used under the MIT License — see the `NOTICE` file beside this one.
     ```

     Note the em dash, and the backticks around `NOTICE`. The file ends with a newline after this line.
  6. Run the Verify command below — expect it to print `OK`.
  7. Run `bun run build` and `bun run test` — both green.
- Verify: `diff <(grep -vE '^(---|name:|description:|Adapted from |$)' ~/.claude/skills/grilling/SKILL.md) <(grep -vE '^(---|name:|description:|Adapted from |$)' skills/hamilton-grilling/SKILL.md) && ! grep -q 'disable-model-invocation' skills/hamilton-grilling/SKILL.md && echo OK` → prints `OK` and nothing else. Any diff output means the protocol text drifted from upstream.
- Commit: `feat: port the grilling dialogue skill`

### Task 2: Add the sibling `NOTICE` for `hamilton-grilling`

- Depends on: none
- Files:
  - Created: `skills/hamilton-grilling/NOTICE`
  - Modified: none
  - Deleted: none
- Acceptance:
  - The permission block from `Original work:` to the closing `  SOFTWARE.` is byte-identical to the template in `CONTRIBUTING.md`, trailing whitespace included (`.hamilton/specs/licensing.md`, invariant: a reproduced upstream permission notice MUST be copied byte-for-byte).
  - No `<upstream …>` placeholder survives: the skill name reads `grilling`, the project `mattpocock/skills`, and the URL `https://github.com/mattpocock/skills`.
  - Hamilton's own modification copyright line is present, as the template carries it.
  - The file asserts the existence of no skill directory other than the one it sits in (`.hamilton/specs/licensing.md`, invariant: a notice file MUST NOT assert the existence of a skill directory that has not shipped).
  - The file ends with a newline.
- Steps:
  1. Run the Verify command below. It fails — `skills/hamilton-grilling/NOTICE` does not exist. This is the red state.
  2. Copy the contents of the fenced block in `CONTRIBUTING.md` (lines 37–66, between the fence markers and excluding them) into a new file `skills/hamilton-grilling/NOTICE`. Copy the text; do not retype it, and do not let an editor strip trailing whitespace — the blank lines inside the indented MIT block each carry two trailing spaces.
  3. In the first two lines only, substitute the three placeholders: `<upstream skill name>` becomes `grilling`, `<upstream project>` becomes `mattpocock/skills`, and `<upstream project URL>` becomes `https://github.com/mattpocock/skills`. Change nothing from `Original work:` onward.
  4. Run the Verify command below — expect it to print `OK`.
  5. Run `bun run build` and `bun run test` — both green.
- Verify: `diff <(sed -n '/^Original work:$/,/^  SOFTWARE\.$/p' CONTRIBUTING.md) <(sed -n '/^Original work:$/,/^  SOFTWARE\.$/p' skills/hamilton-grilling/NOTICE) && ! grep -q '<upstream' skills/hamilton-grilling/NOTICE && echo OK` → prints `OK` and nothing else. Diff output means the permission text was altered — most likely trailing whitespace stripped on save.
- Commit: `docs: add the hamilton-grilling NOTICE`

### Task 3: Flip route unit 4 to shipped

- Depends on: Task 1, Task 2
- Files:
  - Created: none
  - Modified: `.hamilton/maps/hamilton-wayfinder/route.md`
  - Deleted: none
- Acceptance:
  - Under the heading `### 4. Port hamilton-grilling`, the `Status:` line reads `shipped` rather than `pending`.
  - No other unit's status changes, and no other line of `route.md` changes.
- Steps:
  1. Run the Verify command below. It shows `Status: pending`. This is the red state.
  2. In `.hamilton/maps/hamilton-wayfinder/route.md`, under `### 4. Port hamilton-grilling`, change `Status: pending` to `Status: shipped`. Change nothing else.
  3. Run the Verify command below — expect `Status: shipped`.
  4. Run `git diff --stat` — expect exactly one file changed, one insertion, one deletion.
  5. Run `bun run build` and `bun run test` — both green.
- Verify: `grep -A 2 '^### 4\. Port hamilton-grilling$' .hamilton/maps/hamilton-wayfinder/route.md` → the `Status:` line reads `shipped`.
- Commit: `docs: flip route unit 4 to shipped`

## Done when

- All tasks implemented (recorded in progress.md)
- `bun run test` passes; `bun run build` is clean
- All review feedback has been addressed
