# Design: Adopt Apache 2.0 and the attribution convention

## Context

Hamilton has no licence artifact of any kind: no `LICENSE`, no `license` field in `package.json`, no
statement in `README.md` or `CONTRIBUTING.md`. It is nonetheless publicly distributed — `install.sh`
curls from `raw.githubusercontent.com`, and the README instructs `npx skills add`.

[Fork attribution and licensing](../../maps/hamilton-wayfinder/tickets/03-fork-attribution.md) settled
the substance. This change is its execution, and inherits four constraints from it:

- **Apache 2.0**, full unmodified text, with `Copyright 2026 Caio Ferreira` — a single year, single
  named holder (803 of 807 commits are Caio's).
- **Credit is formal, not prose.** `LICENSE` and `NOTICE` artifacts, not a paragraph in a doc.
- **Two levels.** The repo root, and a sibling `NOTICE` inside each forked skill directory — because
  the unit of distribution is the skill directory, not the repo. Someone who runs `npx skills add` on
  one forked skill receives that directory and nothing else; a root-only `NOTICE` never reaches them.
- **No per-file headers.** Apache's boilerplate is recommended rather than required, and it cannot sit
  above a `SKILL.md`'s YAML frontmatter without breaking the parse.

Two things are true of the repo right now that shape the work. First, **none of the five forked skill
directories exist yet** — they land in units 4, 5 and 6. Second, **no test or source file reads
`package.json`, `LICENSE` or `NOTICE`**: `tests/` holds `paths.test.ts`, `cli/bundle-root.test.ts` and
`cli/setup.test.ts`, and none of them touch these paths. This is a docs-and-config change with no code
path behind it.

Upstream's licence is MIT. MIT text may be incorporated into an Apache-2.0 work provided the copyright
notice and permission notice travel with it — which is exactly what the `NOTICE` artifacts carry.

## Goals / Non-Goals

**Goals**

- Land the four artifacts ticket 03 named at the repo root level: `LICENSE`, `NOTICE`, the
  `package.json` field, and the README declaration.
- Write the per-forked-skill rule down in `CONTRIBUTING.md` in a form that units 4, 5 and 6 can follow
  mechanically — substituting names into a template rather than re-deriving wording from a ticket.
- Keep every artifact true on the day it lands: nothing asserts the existence of a directory that has
  not shipped.

**Non-Goals**

- Per-skill `NOTICE` files (each skill-authoring unit lands its own).
- Prose provenance for the fork — [How the framework docs present the pre-SDD
  stage](../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md), unit 9, owns that.
- Any change to build, packaging, or distribution. `"private": true` stays.

## Decisions

### Decision: The root `NOTICE` carries one un-enumerated upstream entry

- Choice: a single attribution entry for `mattpocock/skills` — the project URL, Matt Pocock's
  copyright line, the full MIT permission text, and one sentence stating that each forked skill
  directory ships its own sibling `NOTICE`. It names no individual skill directory.
- Alternatives considered: **enumerate all five forked directories up front**, which ticket 03's
  sketch implies — rejected because none of the five exist until unit 6, so the file would assert
  something false for the whole stretch between this unit and that one, in the one document whose
  entire value is being accurate. **Enumerate incrementally**, each skill-authoring unit appending its
  directory — rejected because it buys nothing the sibling `NOTICE` does not already provide, while
  adding a root-file edit to five separate units and a merge conflict surface on the same lines.
- Rationale: the legal obligation is per-upstream-project, not per-directory. Recipients of the whole
  repo get the terms from this entry; recipients of one skill directory get them from its sibling. An
  enumeration serves neither, and can be wrong.

### Decision: `README.md` gains a short `## License` section

- Choice: two or three lines at the end of the README — Hamilton is Apache-2.0, see `LICENSE`; forked
  skills carry upstream MIT notices, see `NOTICE`.
- Alternatives considered: **`LICENSE` and `package.json` only**, letting GitHub's sidebar badge carry
  it — rejected because the badge is a GitHub artifact, absent from a clone or a tarball, and a reader
  arriving at the README to run `npx skills add` should not have to leave it to learn what they are
  being granted. **A fuller section explaining the fork** — rejected as a scope collision: ticket 10
  reserved the fork's narrative for `docs/skills.md`, and this section is the licence *declaration*,
  not that introduction.
- Rationale: cheapest possible statement at the one page every reader actually opens, kept narrow
  enough that unit 9's prose has somewhere to land without contradicting it.

### Decision: `CONTRIBUTING.md` carries the rule plus a worked template

- Choice: a new `## Licensing and attribution` section holding the rule in prose, the two placement
  constraints that give it its shape, and a copy-pasteable per-skill `NOTICE` block with `<skill>` and
  `<upstream>` placeholders — roughly fifteen lines, the shape ticket 03 already sketched.
- Alternatives considered: **prose-only rule** ("each forked skill directory ships a `NOTICE` with
  both copyrights") — rejected because the text it governs must be verbatim, and three units each
  re-deriving wording from a prose description produces three slightly different notices. **Ship the
  template in `bundle/templates/`** — rejected because `bundle/` holds SDD artifact templates that
  Hamilton's *users* consume via `hamilton setup`; this is contribution boilerplate for this repo, and
  putting it in the bundle would install it into every user's project.
- Rationale: units 4, 5 and 6 substitute two names and are done, so all notices come out identical.
  The constraints are recorded next to the rule, so a future contributor learns *why* the notice is a
  sibling file rather than rediscovering the reasoning.

### Decision: the MIT text is fetched raw from upstream at implementation time

- Choice: the coder obtains upstream's permission text by fetching
  `https://raw.githubusercontent.com/mattpocock/skills/main/LICENSE` directly — `curl` or equivalent —
  and copies the bytes. It is not typed from memory, not reproduced from a model's recollection of the
  MIT template, and not re-read out of a summarising tool.
- Alternatives considered: **write the standard MIT text from the well-known template and fill in the
  name and year** — rejected because "the standard MIT text" has several circulating variants
  (trailing-whitespace and line-break differences, "THE SOFTWARE IS PROVIDED" casing), and ticket 03's
  mandate is verbatim reproduction of *upstream's own file*, not of a template that resembles it.
- Rationale: this is the one part of the change where being approximately right is being wrong. A
  fetch is cheap and removes the failure mode entirely.

## Architecture & Components

Five files, no code. Each has one job:

| File | Responsibility |
|------|----------------|
| `LICENSE` | The grant. Full unmodified Apache 2.0 text with appendix; Hamilton's copyright line. |
| `NOTICE` | Attribution for redistributed upstream material — Apache §4(d). One entry per upstream project. |
| `package.json` | Machine-readable declaration: SPDX `Apache-2.0` in the top-level `license` field. |
| `README.md` | Human-readable declaration at the entry point, pointing at the two files above. |
| `CONTRIBUTING.md` | The rule future forks follow, and the template they instantiate. |

The seam that matters is the one between the root `NOTICE` and the per-skill notices that units 4–6
will write: `CONTRIBUTING.md` is the interface between them. This change writes the interface; the
later units implement against it. That is why the template lives there rather than being described
in a change directory or a map ticket — neither is a place a contributor looks, and both are
history rather than convention.

### Quality Lens

Docs and config only — no units added, no seams introduced, no dependency to invert, nothing to
substitute in a test. The rubric's structural principles do not engage.

The one principle that does is **single source of truth**. Upstream's permission text will exist in
several places once units 4–6 land: the root `NOTICE`, and a sibling `NOTICE` in each forked skill
directory. That duplication is not incidental — it is the point, since each copy travels with a
different unit of distribution, and a shared reference would defeat the requirement. What this design
does instead is give the duplicated text one *authoritative* origin: upstream's own `LICENSE`, fetched
raw, with the `CONTRIBUTING.md` template as the single wording every copy instantiates. No copy is
derived from another copy.

No accepted smells. No structural risk to record.

## Testing Strategy

There is nothing behavioral to test. Verification is:

- `bun run build` passes (the project's only real gate).
- `bun --bun vitest run` passes — expected untouched, since no test reads any file in the diff.
- `package.json` remains valid JSON with `"license": "Apache-2.0"` and `"private": true` intact.
- The MIT permission text in `NOTICE` diffs clean against upstream's `LICENSE` body, modulo the
  uniform indentation applied when nesting it under the attribution entry.

That last one is the only check with any teeth, and it is done by diffing against the fetched file,
not by reading it over.

## Constraints & Boundaries

- Always: fetch upstream's `LICENSE` raw before writing `NOTICE`; run `bun run build` before
  committing.
- Ask first: any wording in `LICENSE` that departs from Apache's published text, including the
  appendix.
- Never: create a `NOTICE` inside a skill directory (units 4–6 own those); modify `"private": true`;
  edit the Inspirations section in `docs/sdd-framework.md`, which ticket 03 ruled untouched.

## Risks / Trade-offs

- **The MIT text is reproduced inexactly** → the sole failure mode with legal weight. Mitigated by
  fetching raw and diffing rather than reading, per the fourth decision.
- **GPLv2 incompatibility** → accepted in ticket 03. Apache 2.0 is one-way incompatible with GPLv2;
  it bites only if someone vendors Hamilton into a GPLv2 project. GPLv3 is fine.
- **The root `NOTICE` under-informs a whole-repo recipient once forks land** → they see the upstream
  project named but not which directories came from it. Accepted: the sentence pointing at sibling
  notices tells them where to look, and `git log` tells them the rest.
- **Units 4–6 ignore the `CONTRIBUTING.md` rule** → each is a separate SDD change with its own review
  pass, and the rule is short and adjacent to the conventions those units already read. Not mitigated
  further; a convention that must be enforced mechanically is a different change.

## Open Questions

None.
