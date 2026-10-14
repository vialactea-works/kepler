---
type: grilling
status: resolved
blocked_by: [09]
---

# How the framework docs present the pre-SDD stage

## Question

How do Hamilton's docs present a stage that sits *before* the pipeline they currently describe as
starting at `init`?

`CONTRIBUTING.md` makes documentation non-optional and maps change areas to doc files, so this is a
required decision, not a nicety. The current picture has no room for a pre-SDD stage: `README.md`,
`docs/skills.md` and `docs/sdd-framework.md` all open with the same diagram.

```
init ──▶ [ propose ] ──▶ plan ──▶ code ──▶ review ──▶ finish-work
```

Settle:

- **The diagram.** Does wayfinder enter it — and if so, before `init` (it precedes project setup) or
  before `propose` (it precedes a change)? Or does it stay off the line entirely, the way
  `hamilton-compose-spec` does as a skill that "sits outside the per-change pipeline"? That is
  existing precedent worth weighing.
- **Which docs change and how much.** A `docs/skills.md` entry in the established format is the
  floor. Does `docs/sdd-framework.md` gain a section — it is the *why* document, and a pre-SDD
  planning stage is a philosophical addition, not just another skill?
- **The pipeline's identity.** The framework calls itself six skills in a fixed sequence with the
  plan as the only required artifact. A seventh, optional, upstream stage either extends that story
  or contradicts it. Which, and how is it phrased?
- **`CONTRIBUTING.md`'s mapping table** — does it gain a row for map artifacts?
- **Introducing the fork's provenance in prose.** Inherited from
  [Fork attribution and licensing](03-fork-attribution.md), which ruled that a fork is a different
  kind of debt from an inspiration and kept it out of `docs/sdd-framework.md`'s **Inspirations**
  section. The legal credit is settled — it lives in `NOTICE` files. What is left is narrative: a
  reader asking "where did wayfinder come from?" currently finds nothing in the docs. Where that
  sentence goes, and whether it names upstream at all, belongs with the rest of the docs shape here.

Decides the shape of the docs work; the writing itself is a route unit.

## Answer

**Diagram:** Wayfinder sits before `propose` (optional, upstream of per-change work):
```
wayfinder (optional) ──▶ init ──▶ [ propose ] ──▶ plan ──▶ code ──▶ review ──▶ finish-work
```

**Docs scope:** Update `docs/skills.md` (wayfinder entry) and `CONTRIBUTING.md` (mapping table row) only. No reshape to `docs/sdd-framework.md` — wayfinder is an optional skill in the pipeline, not a philosophical addition to the framework.

**Pipeline identity:** "Six core skills in fixed sequence, plus an optional pre-change planning stage (wayfinder)." This phrasing preserves the existing pipeline identity while acknowledging the optional stage.

**CONTRIBUTING.md mapping:** Add row: `New/changed map artifacts in .hamilton/maps/` → `docs/skills.md`. Follows the existing pattern (CLI commands and artifact templates also map to `docs/skills.md`).

**Fork provenance:** Narrative goes in the `docs/skills.md` wayfinder entry — brief note that it's a fork of upstream work, with a link to `NOTICE` for full legal credit.
