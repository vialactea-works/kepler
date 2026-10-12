# Plan: Land the wayfinder artifact templates

## Overview

- Change: `.hamilton/changes/2026-08-05-wayfinder-artifact-templates/`
- Goal: Ship `bundle/templates/wayfinder/` holding `map.md`, `ticket.md` and `route.md`, so wayfinder's three artifact shapes live where every other Hamilton artifact shape lives, and make `hamilton setup` report the nested templates it has been installing silently.
- Test: `bun run test`
- Build / typecheck: `bun run build`
- Context notes: The why, the shape decisions and their rejected alternatives are in `proposal.md`, `requirements/artifact-templates.md` and `design.md` — read the requirement scenario each task cites rather than re-deriving it. Three project constraints govern every task. `AGENTS.md` forbids comments in code (this does not extend to markdown templates, whose comment blocks are the house idiom) and forbids `bun test` — always `bun --bun vitest run`, which `bun run test` wraps. `vitest.config.ts` sets `globals: false`, so `describe`/`it`/`expect` are already imported at the top of `tests/cli/setup.test.ts`; add nothing to those imports. Tests never mock the filesystem: `describe("setupHamilton")` already redirects `process.env.HOME` to a fresh temp dir in `beforeEach`, which is the only seam any task here needs.
- Quality notes: The seams follow `design.md`'s components — one task per template file (each a self-contained content artifact fixed by a different ticket), one for the report change in `copyTemplates`, one for the two documentation touches. Three deliberate exceptions are recorded rather than sliced away. First, Tasks 1–3 form a chain rather than running in parallel: each adds one entry to the same `WAYFINDER_TEMPLATE_FILES` array in the same test file, so parallel execution would conflict on that line. The coupling buys a genuine red→green loop per template instead of three files landing under one assertion. Second, Task 5 modifies two documentation files under one task; they are one cohesive unit ("describe the template set that actually ships"), carry no test between them, and splitting would produce two edits of three lines each. Third, `copyTemplates` and `copyGuidelineManifests` both take an `options?: { force?: boolean }` parameter neither reads. It is a pre-existing smell and explicitly out of scope — Task 4 must neither wire it up nor delete it.

## Tasks

### Task 1: Land the wayfinder map template

- Depends on: none
- Files:
  - Created: `bundle/templates/wayfinder/map.md`
  - Modified: `tests/cli/setup.test.ts`
  - Deleted: none
- Acceptance:
  - `hamilton setup` installs `~/.hamilton/templates/wayfinder/map.md` — requirement *Nested template installation*, scenario *Templates in a subdirectory are installed*.
  - The template opens with a comment block naming the artifact, its producing skill and where the artifact lives, and instructs the author to delete the block and every inline hint before finalizing — requirement *Wayfinder artifact template set*, scenario *Each template follows Hamilton's template idiom*.
  - The template's frontmatter carries `status` with the values `open` and `cleared`, and its body carries exactly five sections in order: Destination, Notes, Decisions so far, Not yet specified, Out of scope. There is no sixth section — requirement *Wayfinder artifact template set*, scenario *map template*. The route is linked from Destination once it exists, per [Map artifact layout](../../maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md); the live map carries an extra `## The route` section, which is that map's own drift from the settled layout and not a shape to copy.
  - The existing test `"copies artifact templates"` and `"returns installed template filenames"` still pass unchanged.
- Steps:
  1. In `tests/cli/setup.test.ts`, directly below the `TEMPLATE_FILES` array, add a second constant:
     ```ts
     const WAYFINDER_TEMPLATE_FILES = ["wayfinder/map.md"]
     ```
  2. Inside `describe("setupHamilton")`, immediately after the `it("copies artifact templates")` block, add:
     ```ts
     it("copies wayfinder artifact templates", async () => {
       const exit = await Effect.runPromiseExit(setupHamilton())
       expect(Exit.isSuccess(exit)).toBe(true)

       const templatesBase = Path.join(tmpHome, ".hamilton", "templates")
       for (const file of WAYFINDER_TEMPLATE_FILES) {
         expect(Fs.existsSync(Path.join(templatesBase, file))).toBe(true)
       }
     })
     ```
  3. Run `bun --bun vitest run tests/cli/setup.test.ts` and confirm the new test fails because `wayfinder/map.md` does not exist. Every other test must still pass.
  4. Create `bundle/templates/wayfinder/map.md` with exactly this structure. The headings, their order, and the frontmatter key and its values are fixed; the wording of the comment block and of each inline hint is yours to write, following the tone of `bundle/templates/proposal.md`. Copy the deletion sentence from `bundle/templates/proposal.md` verbatim so the whole template set reads alike.
     ```markdown
     <!--
       Map — the shared chart for one wayfinding effort.
       Produced by: hamilton-wayfinder
       Lives at: .hamilton/maps/<effort>/map.md
       <one or two lines: the map is an INDEX, not a store — it gists each closed ticket and
        links it, never restating the decision the ticket holds. Note that the frontmatter
        below becomes the first line of the file once this block is deleted.>
       Delete this comment block and every inline <!-- ... --> hint before finalizing.
     -->

     ---
     status: open
     ---

     # <Effort Name>

     ## Destination

     <!-- hint: what reaching the end of this map looks like, in one or two lines. Link
          route.md here once the map clears — the route does not get its own section. -->

     ## Notes

     <!-- hint: domain, the skills every session should consult, standing preferences -->

     ## Decisions so far

     <!-- hint: one line per resolved ticket — enough to judge relevance, then the link -->

     ## Not yet specified

     <!-- hint: in-scope fog you cannot state sharply enough to ticket yet -->

     ## Out of scope

     <!-- hint: work consciously ruled beyond the destination; it never graduates -->
     ```
     The comment block sits above the frontmatter rather than below it so that every Hamilton template opens the same way; deleting the block, as the block itself instructs, restores the frontmatter to the first line of the finished artifact. Nothing in the codebase parses this frontmatter, so nothing depends on its position in the template file.
  5. Run `bun --bun vitest run tests/cli/setup.test.ts` and confirm every test passes, including the new one.
  6. Run `bun run test` and `bun run build`.
- Verify: `bun --bun vitest run tests/cli/setup.test.ts` → all tests pass, including `copies wayfinder artifact templates`.
- Commit: `feat: add the wayfinder map template`

### Task 2: Land the wayfinder ticket template

- Depends on: Task 1
- Files:
  - Created: `bundle/templates/wayfinder/ticket.md`
  - Modified: `tests/cli/setup.test.ts`
  - Deleted: none
- Acceptance:
  - `hamilton setup` installs `~/.hamilton/templates/wayfinder/ticket.md` — requirement *Nested template installation*, scenario *Templates in a subdirectory are installed*.
  - The template's frontmatter carries `type` with the values `grilling`, `research`, `prototype` and `task`, `status` with the values `open` and `resolved`, and `blocked_by` as a list of ticket numbers, over a `## Question` body — requirement *Wayfinder artifact template set*, scenario *ticket template*. These three fields and their values come from [Map mechanics in files](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md).
  - The template carries **no `## Answer` section**. A ticket is created open and the answer is appended when it resolves; templating an empty Answer heading into every open ticket would invert that. The resolution mechanic belongs to the wayfinder skill (route unit 6), not to this template — see `design.md`, *Templates encode frontmatter syntax, not the mechanics contract*.
  - The template opens with the same comment-block idiom as Task 1 — requirement *Wayfinder artifact template set*, scenario *Each template follows Hamilton's template idiom*.
- Steps:
  1. In `tests/cli/setup.test.ts`, add `"wayfinder/ticket.md"` to the `WAYFINDER_TEMPLATE_FILES` array.
  2. Run `bun --bun vitest run tests/cli/setup.test.ts` and confirm `copies wayfinder artifact templates` now fails on the missing ticket template.
  3. Create `bundle/templates/wayfinder/ticket.md` with exactly this structure, writing the comment block and the hint in the same voice as the map template:
     ```markdown
     <!--
       Decision ticket — one question whose resolution is a decision.
       Produced by: hamilton-wayfinder
       Lives at: .hamilton/maps/<effort>/tickets/NN-slug.md
       <one or two lines: sized to a single agent session; the answer is appended and the
        status flipped to resolved when the ticket closes.>
       Delete this comment block and every inline <!-- ... --> hint before finalizing.
     -->

     ---
     type: grilling
     status: open
     blocked_by: []
     ---

     # <Ticket Title>

     ## Question

     <!-- hint: the decision or investigation this ticket resolves -->
     ```
     Carry the permitted values for `type` and `status`, and the meaning of `blocked_by` as a list of the ticket numbers that must resolve first (empty when nothing blocks it), in the comment block or as inline hints — whichever reads better — rather than inventing extra frontmatter keys to hold them.
  4. Run `bun --bun vitest run tests/cli/setup.test.ts` and confirm every test passes.
  5. Run `bun run test` and `bun run build`.
- Verify: `bun --bun vitest run tests/cli/setup.test.ts` → all tests pass.
- Commit: `feat: add the wayfinder ticket template`

### Task 3: Land the wayfinder route template

- Depends on: Task 2
- Files:
  - Created: `bundle/templates/wayfinder/route.md`
  - Modified: `tests/cli/setup.test.ts`
  - Deleted: none
- Acceptance:
  - `hamilton setup` installs `~/.hamilton/templates/wayfinder/route.md` — requirement *Nested template installation*, scenario *Templates in a subdirectory are installed*.
  - The template carries **no frontmatter and no top-level status line** — requirement *Wayfinder artifact template set*, scenario *route template*. Status belongs to the map's frontmatter and to each unit individually; see `design.md`, *`route.md` carries no frontmatter and no route-level status*.
  - The `## Units` section templates a unit as a name, a `Status` of `pending`, `in-progress` or `shipped`, its dependencies, links to the decisions backing it, and a goal paragraph — same scenario, and the field set comes from [route.md shape and the SDD join](../../maps/hamilton-wayfinder/tickets/06-route-shape-and-sdd-join.md). That ticket also specified a per-unit "suggested entry" field; do **not** template it. [Boundary with hamilton-propose and hamilton-critique](../../maps/hamilton-wayfinder/tickets/09-boundary-with-propose-and-critique.md) made propose a required gate, collapsing that field into a constant an effort states once in its preamble.
  - The body is a title, a preamble, and `## Units`. There is no `## After the route` section and no other section; the live route's extra section is one effort's choice, not part of the shape.
  - The template opens with the same comment-block idiom as Tasks 1 and 2.
- Steps:
  1. In `tests/cli/setup.test.ts`, add `"wayfinder/route.md"` to the `WAYFINDER_TEMPLATE_FILES` array.
  2. Run `bun --bun vitest run tests/cli/setup.test.ts` and confirm `copies wayfinder artifact templates` now fails on the missing route template.
  3. Create `bundle/templates/wayfinder/route.md` with exactly this structure:
     ```markdown
     <!--
       Route — the handoff from a cleared map to the SDD loop.
       Produced by: hamilton-wayfinder
       Lives at: .hamilton/maps/<effort>/route.md
       <one or two lines: written once when the map clears; it points at the decisions that
        back each unit and does not restate them. Each unit runs the SDD loop once and flips
        its own status on its own branch.>
       Delete this comment block and every inline <!-- ... --> hint before finalizing.
     -->

     # Route — <Effort Name>

     <!-- hint: the preamble — the constants that would otherwise repeat on every unit
          below, stated once. What the route is, and any standing rule every unit inherits. -->

     ## Units

     ### 1. <Unit name>

     Status: pending
     Depends on: —
     Backed by: [<ticket title>](tickets/NN-slug.md)

     <!-- hint: the goal, as a paragraph rather than one line, so the context a proposer
          needs survives. Orientation, not specification — the backing tickets hold the
          detail. -->
     ```
  4. Run `bun --bun vitest run tests/cli/setup.test.ts` and confirm every test passes.
  5. Run `bun run test` and `bun run build`.
- Verify: `bun --bun vitest run tests/cli/setup.test.ts` → all tests pass; `WAYFINDER_TEMPLATE_FILES` now holds all three wayfinder templates.
- Commit: `feat: add the wayfinder route template`

### Task 4: Report nested templates from setup

- Depends on: Task 3
- Files:
  - Created: none
  - Modified: `src/cli/commands/setup.ts`, `tests/cli/setup.test.ts`
  - Deleted: none
- Acceptance:
  - `setupHamilton` returns the wayfinder templates in its installed list, named by their path relative to the templates root with `/` separators — requirement *Complete installation report*, scenario *Nested templates appear in the report*.
  - Top-level templates keep their bare names, with no prefix — same requirement, scenario *Top-level templates keep their bare names*. The existing `"returns installed template filenames"` assertion on `"plan.md"` is what proves this and must keep passing.
  - Directory entries are still excluded from the list, so `"wayfinder"` never appears as an entry on its own — same requirement, scenario *The report counts files, not top-level entries*.
  - A bundle with no `templates` directory still succeeds and reports nothing — requirement *Nested template installation*, scenario *A bundle with no templates directory installs nothing*. The existing early return covers this; leave it alone.
  - Nothing else in `copyTemplates` changes. In particular the unused `options?: { force?: boolean }` parameter stays exactly as it is — it is a pre-existing smell on both `copyTemplates` and `copyGuidelineManifests`, and neither wiring it up nor removing it belongs to this change.
- Steps:
  1. In `tests/cli/setup.test.ts`, inside `it("returns installed template filenames")`, add one assertion directly below the existing `expect(exit.value).toContain("plan.md")`:
     ```ts
     expect(exit.value).toContain("wayfinder/map.md")
     ```
  2. Run `bun --bun vitest run tests/cli/setup.test.ts` and confirm that test now fails: the templates are installed but the report is built from a flat directory read, so the nested ones are missing from it.
  3. In `src/cli/commands/setup.ts`, replace the return expression at the end of `copyTemplates` with:
     ```ts
     return Fs.readdirSync(destTemplates, { recursive: true })
       .filter((name) => Fs.statSync(Path.join(destTemplates, name)).isFile())
       .map((name) => name.split(Path.sep).join("/"))
       .sort()
     ```
     The order of these operations matters and is not free to rearrange. The `isFile` filter still runs on the platform-separator name so that `Path.join` resolves correctly, and it is still needed because a recursive read lists directory entries too. Normalizing to `/` happens after the filter and before the sort, so the sort orders the strings that are actually reported.
  4. Run `bun --bun vitest run tests/cli/setup.test.ts` and confirm every test passes.
  5. Run `bun run test` and `bun run build`. The build is the only typecheck gate in this project, and it is what confirms `readdirSync` with `{ recursive: true }` types as `string[]` under the pinned `@types/node`.
- Verify: `bun run build && bun run test` → build clean, all tests pass including the new `wayfinder/map.md` assertion.
- Commit: `fix: report nested templates installed by setup`

### Task 5: Document the wayfinder template set

- Depends on: Task 3
- Files:
  - Created: none
  - Modified: `bundle/templates/README.md`, `CONTRIBUTING.md`
  - Deleted: none
- Acceptance:
  - `bundle/templates/README.md` names all three wayfinder templates, what each produces, and that their artifacts live under `.hamilton/maps/<effort>/`.
  - `CONTRIBUTING.md`'s mapping table routes changes under `bundle/templates/wayfinder/` to `docs/skills.md` — see `design.md`, *The new `CONTRIBUTING.md` row routes `bundle/templates/wayfinder/` at `docs/skills.md`*. The existing `bundle/templates/` → `docs/sdd-framework.md` row stays exactly as it is; it remains correct for the nine pipeline templates, and [How the framework docs present the pre-SDD stage](../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) rules out describing wayfinder in `docs/sdd-framework.md` at all.
  - No file under `docs/` is touched. Wayfinder prose in `docs/` is route unit 9, and `design.md` marks it off-limits here.
  - The existing SDD table in `bundle/templates/README.md`, and its `.hamilton/` directory tree, are left unchanged. The tree is introduced as what `hamilton-init` creates, and [Map artifact layout](../../maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md) settled that `hamilton-init` does not scaffold `maps/` — adding it there would state the opposite.
- Steps:
  1. In `bundle/templates/README.md`, add a new `## Wayfinder templates` section immediately before the existing `## Where these templates live` section, so the "these templates are global" paragraph that follows covers the wayfinder set too. The section holds a short lead sentence saying these are not SDD pipeline artifacts — they belong to the optional pre-change wayfinding stage — followed by a table using the same pipe-table style as the SDD table above it, with the columns Template, Artifact, and Produced by, and one row each for `wayfinder/map.md`, `wayfinder/ticket.md` and `wayfinder/route.md`, all produced by `hamilton-wayfinder`.
  2. Close that section with one or two sentences stating that the artifacts these produce live under `.hamilton/maps/<effort>/` — `map.md` and `route.md` at the root, tickets at `tickets/NN-slug.md` — and that unlike `specs/` and `changes/`, this directory is not scaffolded by `hamilton-init`; the wayfinder skill creates it on first chart. Do not add `maps/` to the existing tree diagram.
  3. In `CONTRIBUTING.md`, add one row to the mapping table directly below the existing `bundle/templates/` row, so the more specific path reads as the exception to the general one:
     ```
     | New/changed wayfinder artifact template in `bundle/templates/wayfinder/` | `docs/skills.md` |
     ```
  4. Run `bun run test` and `bun run build`. `bundle/templates/README.md` is itself an installed template, so the suite must stay green after editing it.
- Verify: `bun run test` → all tests pass; `bundle/templates/README.md` and `CONTRIBUTING.md` both describe the template set that actually ships, and `git status` shows no file under `docs/` modified.
- Commit: `docs: document the wayfinder template set`

## Done when

- All tasks implemented (recorded in progress.md)
- `bun run test` passes; `bun run build` is clean
- All review feedback has been addressed
