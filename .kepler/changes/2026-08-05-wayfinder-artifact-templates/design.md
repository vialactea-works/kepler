# Design: Land the wayfinder artifact templates

## Context

`bundle/templates/` holds nine flat template files and is copied wholesale to `~/.hamilton/templates/` by `hamilton setup`. The copy already handles depth — `copyTemplates` calls `Fs.cpSync(srcDir, destTemplates, { recursive: true, force: true })` — so a subdirectory installs correctly today with no change. What does not handle depth is the report: the function returns `Fs.readdirSync(destTemplates).filter(isFile).sort()`, a flat read that drops directories, and the `setup` command prints that array's length and entries. Adding `wayfinder/` would install twelve files and announce nine.

The three template shapes are not being invented here. [Map artifact layout](../../maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md) fixes the map body as upstream's five sections, verbatim, with `route.md` linked from Destination rather than earning a sixth section. [Map mechanics in files](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md) fixes the YAML frontmatter syntax and the status vocabularies. [route.md shape and the SDD join](../../maps/hamilton-wayfinder/tickets/06-route-shape-and-sdd-join.md) fixes the per-unit fields and the map's `cleared` → `shipping` → `shipped` lifecycle. [Template convention](../../maps/hamilton-wayfinder/tickets/05-template-convention.md) fixes the location and rules out a wayfinder-before-setup guard. The design's job is to transcribe those decisions into Hamilton's template idiom, not to relitigate them.

Two facts about the surrounding repo shape the work. `.hamilton/maps/hamilton-wayfinder/` is a live map still using loose `Status:` lines rather than frontmatter, and converting it is unit 10 — so the templates and the one live instance will disagree between this unit and that one. And the bundle archive ships `bundle/`'s contents verbatim at the tagged commit, so a new subdirectory reaches released binaries with no packaging change.

## Goals / Non-Goals

**Goals**

- Three wayfinder templates under `bundle/templates/wayfinder/`, each transcribing its backing decision and following Hamilton's template idiom.
- `hamilton setup` reports every file it installs, nested ones included, by path relative to the templates root.
- A test that fails when a wayfinder template stops installing.
- `bundle/templates/README.md` and `CONTRIBUTING.md` describing what actually ships.

**Non-Goals**

- Any `SKILL.md`. Units 4 through 7 own the skills that will read these templates.
- Converting `.hamilton/maps/hamilton-wayfinder/` to frontmatter — unit 10.
- Choosing a home for the `## Map mechanics` contract — unit 10.
- Any wayfinder prose in `docs/` — unit 9, per ticket 10.
- Any guard, warning, or fallback for running wayfinder before `hamilton setup` — ruled out by ticket 05.

## Decisions

### Decision: Report the installed set with a recursive directory read

- Choice: change `copyTemplates`'s final expression to `Fs.readdirSync(destTemplates, { recursive: true })`, keep the `isFile` filter, then normalize each surviving name's path separators to `/` before sorting. The filter runs on the native-separator name so `Path.join` stays correct; normalization happens after it and before the sort, so ordering is stable across platforms.
- Alternatives considered: a hand-rolled `listTemplateFiles(dir, prefix)` recursion — roughly ten lines reimplementing a platform call correctly, an abstraction with one caller and no second case asking for it; and walking the bundle source rather than the install destination — the same list whenever the copy succeeds, but it reports what was requested instead of what landed, so a dropped file would still be announced.
- Rationale: the smallest change that makes the report honest, and it preserves the function's existing contract of describing the destination. Node 24 and `@types/node` 22.16 both carry `recursive`, so no compatibility work is needed. Separator normalization matters because Hamilton ships cross-platform binaries and the reported name should match the path a skill would cite — `wayfinder/map.md`, not `wayfinder\map.md`.

### Decision: Templates encode frontmatter syntax, not the mechanics contract

- Choice: `map.md` and `ticket.md` carry the frontmatter fields and their allowed values as inline hints. Neither restates the `## Map mechanics` prose ticket 04 drafted — what claiming signifies, why a claimed ticket is still open, how blocking resolves.
- Alternatives considered: embedding the mechanics section in the map template, which would put the contract in every map ever created and make a future edit a rewrite of every instance.
- Rationale: ticket 04 deliberately left the contract's home open between `CONTRIBUTING.md` and a dedicated `MECHANICS.md`, and unit 10 settles it. A template that restates it would pre-empt that decision and create a second source of truth for it. The template needs the syntax so an author fills it in correctly; the contract is documentation.

### Decision: `route.md` carries no frontmatter and no route-level status

- Choice: the route template opens with a title and preamble and holds status only per unit, as `pending`, `in-progress`, or `shipped`.
- Alternatives considered: giving route.md frontmatter mirroring `map.md` for surface consistency across the three artifacts; and templating the loose `Status:` line the live route currently carries.
- Rationale: ticket 04 scoped frontmatter to maps and tickets and never mentioned the route; ticket 06 put the effort's lifecycle on the map. A route-level status duplicates a value the map owns, and the one live instance already proves the duplication drifts — it reads `pending` while its map reads `shipping` and two of its units read `shipped`. Templating a field that is redundant by design and wrong in practice would propagate the defect. Reconciling the live file belongs to unit 10's conversion pass.

### Decision: A separate test for the wayfinder template set

- Choice: add a `WAYFINDER_TEMPLATE_FILES` constant and its own `it("copies wayfinder artifact templates")` block, rather than appending three nested paths to the existing `TEMPLATE_FILES` array.
- Alternatives considered: extending `TEMPLATE_FILES`, which works — `Path.join` handles the nested segment — and is one line shorter.
- Rationale: the existing test is named for the pipeline's artifact templates. A separate block names what broke when it fails, and mirrors how the guideline manifests already get their own assertion rather than being folded into the template loop.

### Decision: The new `CONTRIBUTING.md` row routes `bundle/templates/wayfinder/` at `docs/skills.md`

- Choice: add a row matching the `bundle/templates/wayfinder/` path specifically and pointing at `docs/skills.md`, leaving the existing `bundle/templates/` → `docs/sdd-framework.md` row untouched. Update `bundle/templates/README.md` — the index of the directory being changed, and itself an installed template — but write nothing into `docs/`.
- Alternatives considered: broadening the existing row to cover both, which would send a wayfinder template change to the one document ticket 10 rules out; and adding wayfinder prose to `docs/sdd-framework.md` so the mapping stays single-rowed.
- Rationale: [How the framework docs present the pre-SDD stage](../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) placed wayfinder's documentation in `docs/skills.md` and explicitly ruled out reshaping `docs/sdd-framework.md`, on the grounds that wayfinder is an optional skill rather than a philosophical addition to the framework. Two rows matching overlapping paths is the cost of that split; the more specific path makes the intended match unambiguous.

## Architecture & Components

| Unit | Responsibility | Interface | Depends on |
|------|----------------|-----------|------------|
| `bundle/templates/wayfinder/*.md` | Define the three wayfinder artifact shapes. Content, not code. | Read by wayfinder skills from `~/.hamilton/templates/wayfinder/` | Nothing at runtime |
| `copyTemplates` (`src/cli/commands/setup.ts`) | Copy the bundle's templates tree to `~/.hamilton/templates/` and report what is installed | `(bundleRoot, options?) => Effect<string[], SetupError>`, entries now relative paths with `/` separators | `Fs`, `templatesDir()` |
| `setupCommand` | Print the install summary | Consumes `copyTemplates`'s array | `copyTemplates` |
| `tests/cli/setup.test.ts` | Prove installation and reporting | vitest | Real temp dirs via `HOME` / `HAMILTON_BUNDLE_DIR` |

The only interface change in the whole diff is the *shape of the strings* `copyTemplates` returns: bare filenames become paths relative to the templates root. It has exactly two consumers — the console output in `setupCommand` and the existing test — and both are in the diff's blast radius by inspection.

### Quality Lens

**Responsibility.** `copyTemplates` keeps one reason to change: how templates get from the bundle to `~/.hamilton/templates/` and what that installation is reported as. Copying and reporting are one job here, not two — the report describes the copy's outcome and reading the destination is how it does that. The three template files are content with no behavior, so they carry no cohesion question.

**Boundaries and dependencies.** The return-type change is a real boundary edit, which is why both consumers are enumerated above rather than assumed. The report crosses the boundary as a list of plain strings, not a directory handle or a `Dirent[]`, so the caller learns nothing about how the listing was produced.

**Testable seam.** `setup.ts` names `Fs` and the filesystem directly, which would be a dependency-inversion smell in policy code — but this unit *is* the filesystem installer, and the seam already exists one level out: tests redirect `process.env.HOME` to a temp directory and override the bundle root through `HAMILTON_BUNDLE_DIR`. That is the seam the new assertions substitute at, and it is why no filesystem abstraction is being introduced. Naming it here so the plan tests against it rather than reaching for a mock.

**Right-sizing — what was deliberately not added.** No template-manifest file enumerating the set; the directory is the manifest. No per-namespace registry or template-resolution layer, though wayfinder is the first namespace — one namespace is not two. No `listTemplateFiles` helper, since the platform call covers the need. No guard for wayfinder-before-setup, per ticket 05. No mocking of `node:fs`, per the existing test conventions.

**Pre-existing smells left alone.** `copyTemplates` takes an `options?: { force?: boolean }` it never reads — `cpSync` is called with `force: true` unconditionally — and the same dead parameter sits on `copyGuidelineManifests`. Touching it would pull in `setupHamilton` and the `--force` flag's whole meaning, which is a separate change. Named here so the coder neither wires it up nor deletes it in passing.

**Accepted trade-offs.** One, cross-listed under Risks: the templates will contradict the one live map instance until unit 10 converts it. That is a scope boundary taken on purpose, not a structural smell in the design.

## Data & Flow

`setupCommand` → `setupHamilton` → `ensureHamiltonHome()`, `resolveBundleRoot()`, then `copyTemplates(bundleRoot)`: `cpSync` the whole templates tree recursively, then read the destination recursively, drop directories, normalize separators, sort, return. `setupHamilton` passes that array through unchanged; `setupCommand` prints its length and each entry. Guidelines and settings are untouched.

## Error Handling & Edge Cases

| Failure | Behavior |
|---------|----------|
| Bundle has no `templates` directory | `copyTemplates` returns `[]` before touching the destination — existing early return, preserved |
| `cpSync` fails (permissions, disk) | Wrapped in `SetupError` with the underlying message — existing, unchanged |
| `readdirSync` or `statSync` throws while listing | Currently unwrapped and would escape as a defect rather than a `SetupError`. Pre-existing; this change does not widen the window, and fixing it is not in scope |
| Setup run twice | `force: true` overwrites; the report is identical. Covered by the existing idempotence test |
| Empty `wayfinder/` directory | Directory installs, contributes nothing to the report — the `isFile` filter excludes it |

## Testing Strategy

Extend `tests/cli/setup.test.ts` only; it already runs against real temp directories with `HOME` redirected, which is the right level for a command whose entire job is filesystem effects. Add `WAYFINDER_TEMPLATE_FILES` listing the three nested paths and an `it` block asserting each exists under `~/.hamilton/templates/` after `setupHamilton()` succeeds. Extend the existing `"returns installed template filenames"` test with a single `toContain("wayfinder/map.md")` assertion, so the recursion of the report is covered directly rather than inferred from the files landing on disk. Its existing `toContain("plan.md")` line stays as it is and does double duty: a top-level template must still report as a bare name, which is what proves normalization did not prefix everything.

Verification is `bun run test` and `bun run build`. Per `AGENTS.md`, the test runner is `bun --bun vitest run`, never `bun test`.

## Constraints & Boundaries

- Always: run the full suite and the build before committing; write the templates in the established idiom — leading comment block naming artifact, producer and location, inline hints, and the instruction to delete both; keep code comment-free per `AGENTS.md`.
- Ask first: any change to the `setup` command's output format beyond nested names appearing in the existing list; adding a dependency; touching a file not named in this design.
- Never: edit anything under `.hamilton/maps/hamilton-wayfinder/` — the live map, its tickets, and its route belong to units 9, 10 and to each unit's own status flip; author or edit any `SKILL.md`; add wayfinder prose to `docs/sdd-framework.md` or `docs/skills.md`; introduce a filesystem mock.

## Risks / Trade-offs

- **Two of requirement 2's three scenarios stay unasserted** — *The report counts files, not top-level entries* and the empty-`wayfinder/` edge case are covered by the `isFile` filter but tested only through the scenarios that do have assertions. Accepted: a directory entry appearing in the report would break the `toContain("wayfinder/map.md")` and `toContain("plan.md")` pair's premise loudly enough in review, and constructing a fixture bundle to prove the negative would need a second `HAMILTON_BUNDLE_DIR` describe block for one filter call.
- **Templates disagree with the live map** until unit 10 converts `.hamilton/maps/hamilton-wayfinder/` from loose `Status:` lines to frontmatter → a reader comparing the two mid-flight sees a contradiction. Accepted: the templates lead and the instance follows, and the route already sequences that conversion.
- **`CONTRIBUTING.md` will carry two rows matching `bundle/templates/`** — the general one pointing at `docs/sdd-framework.md` and the wayfinder one pointing at `docs/skills.md` → a contributor could read the general row first and update the wrong doc. Mitigation: the new row names the `bundle/templates/wayfinder/` path specifically, so the more specific match is unambiguous.
- **Windows separator handling** is normalized but not exercised — CI and development are macOS/Linux. Low impact: the value is console output and a test string, not a filesystem path.

## Migration / Rollout

None required. `hamilton setup` is idempotent and copies with `force: true`, so an existing installation picks up `wayfinder/` on the next run. No existing artifact changes shape; no consumer reads the templates yet, because the skills that will are units 4 through 7.
