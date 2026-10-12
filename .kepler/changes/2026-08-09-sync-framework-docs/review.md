## Unit-9 docs diff (`docs/skills.md` + `CONTRIBUTING.md`) — 2026-08-09

Verdict: approved

### Verified

Reviewed the full unit diff `d57c01f..193f34c` (merge-base `d57c01f` on `port-wayfinder-siblings`)
against `plan.md`, `requirements/framework-docs.md`, and `design.md`. The diff's production surface
is exactly two files — `docs/skills.md` and `CONTRIBUTING.md` — plus this change's own
`.hamilton/changes/` artifacts. All six requirements satisfied; scope held literally.

- **Req 1 — wayfinder entry in the skills reference** (`docs/skills.md:79-95`): the
  `### \`hamilton-wayfinder\`` heading sits at line 79, between `hamilton-init` (line 67) and
  `hamilton-propose` (line 97). It follows the established structure exactly — heading with role +
  step tag (`*(optional pre-change planning stage)*`), 1–2 sentence intro, `When` / `Inputs` /
  `Produces` / `Notes` bullets, and a `- Source:` link to `../skills/hamilton-wayfinder/SKILL.md`.
  When/Inputs/Produces are grounded in the SKILL.md (map at `.hamilton/maps/<effort>/`; goal too big
  for one session; produces a static handoff of change-sized units).

- **Req 2 — one-sentence rule stated** (`docs/skills.md:91-93`): the Notes bullet carries the
  ticket-09 boundary sentence — "use wayfinder to break a complex goal into clear, realizable units.
  Use `hamilton-propose` to transform each route unit into a concrete change spec ready for
  autonomous implementation." Substance is verbatim; the leading "Use" is lowercased to "use" as a
  grammatical continuation after the `**Notes:**` colon, and `hamilton-propose` is wrapped in
  backticks to match the document's convention (every other skill name in the file is backticked).
  Both adaptations preserve meaning and follow the doc's own formatting rules — accepted, not a
  defect.

- **Req 3 — fork provenance in prose with NOTICE link** (`docs/skills.md:93-94`): the Notes bullet
  names the upstream (`mattpocock/skills`) and its licence (MIT) and links to
  [`NOTICE`](../NOTICE) for the full legal credit. No licence text or full notice reproduced inline.
  `NOTICE` confirmed present at the repo root; the `../NOTICE` relative path resolves correctly from
  `docs/`.

- **Req 4 — pipeline identity phrasing adjusted** (`docs/skills.md:24`): "Seven skills." replaced
  with "Six core skills in fixed sequence, plus an optional pre-change planning stage (wayfinder)."
  `grep 'Seven skills'` → 0 matches; `grep 'Six core skills'` → 1 match (line 24). The count is
  arithmetically sound — the six map to the pipeline diagram's main line
  (`init → propose → plan → code → review → finish-work`, unchanged at lines 17-22); wayfinder is
  the +1 optional pre-change stage, not a seventh core skill. The rest of the paragraph
  (`hamilton-init` once, `hamilton-propose` optional, code/review loop, orchestrate driver,
  critique optional gate) is unchanged.

- **Req 5 — CONTRIBUTING.md mapping row** (`CONTRIBUTING.md:16`): the new row
  `| New/changed map artifacts in `.hamilton/maps/` | `docs/skills.md` |` is added at line 16,
  immediately after the existing wayfinder-templates row (line 15,
  `bundle/templates/wayfinder/`). Both rows present and distinct — `bundle/` (shipped templates) ≠
  `.hamilton/maps/` (per-project authored artifacts) — not merged. Path surfaces wrapped in
  backticks, matching every other row in the table (CONTRIBUTING.md rule 3).

- **Req 6 — scope held literally**: `git diff --name-only d57c01f..HEAD` → `CONTRIBUTING.md`,
  `docs/skills.md`, and this change's `.hamilton/changes/` artifacts only. `README.md` and
  `docs/sdd-framework.md` confirmed absent from the diff (grep exit 1). The six-skill diagram in
  both files is untouched.

### Gates (re-run by reviewer, not trusted from progress.md)

- `bun run build` → exit 0
- `bun --bun vitest run` → 24/24 passed (3 files)

### Structural quality

Mechanical docs-only change — three coordinated edits across two files, each mapping to a distinct
requirement and independently verifiable by read-and-inspect. No code, so the
`references/code-quality.md` rubric trips no smell: DRY holds (pipeline identity stated once in
prose, not duplicated in the diagram), no dead code, no stubs, no scope creep. Boundaries the design
marked off-limits (`README.md`, `docs/sdd-framework.md`) were not touched.
