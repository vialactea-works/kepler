# Plan: Port the three wayfinder siblings

## Overview

- Change: `.hamilton/changes/2026-08-07-port-wayfinder-siblings/`
- Goal: Fork `research`, `prototype` and `domain-modeling` from [mattpocock/skills](https://github.com/mattpocock/skills) into `skills/hamilton-wayfinder-*/`, re-homing each skill's artifact destinations onto Hamilton's map so nothing writes to an issue tracker, a root `CONTEXT.md`, or `docs/adr/`. Route unit 5.
- Test: `bun run test`
- Build / typecheck: `bun run build`
- Context notes: See [design.md](design.md) for the decisions; nothing here restates them. Three facts govern every task. **The verbatim rule** — upstream text is copied byte-for-byte, and edits are confined to the adaptation surface: frontmatter, description, invocation mode, naming, the provenance line, and the re-homed paths. **The commit split** — each skill lands in two commits, verbatim first, adaptation second, so `git show` on the second commit is the complete departure list. **No automated tests cover `skills/`** — it is not bundled and no test asserts on skill content, so every task's Verify is a structural shell check, and `bun run test` / `bun run build` are regression guards only. `skills/hamilton-grilling/` is the worked precedent for the `NOTICE` text and the provenance line; copy its `NOTICE` and substitute the upstream skill name.
- Quality notes: The six port tasks follow the design's boundaries exactly — one task per commit in the verbatim-then-adapt split, one skill per pair, no task touching two skills. Task 6 is the largest (three files, ~15 edits) and stays whole deliberately: splitting `SKILL.md` from the two guides it points at would leave an intermediate commit whose pointers resolve to unre-homed prose, and the re-homing check cannot run until all three files are done. Four accepted trade-offs are carried from [design.md](design.md) and are **not** defects to fix here: (1) the `.hamilton/maps/<effort>/` path convention is duplicated across three directories with no shared file, because a skill directory installs alone; (2) three full-length upstream descriptions sit in context every turn with trigger phrasing broad enough to fire outside wayfinder; (3) `ticket-resolution` carries the verbatim-fidelity rule, which governs authoring rather than runtime behaviour; (4) the re-homing patches in `ADR-FORMAT.md` are the widest departure from upstream — `## Numbering` states something upstream does not say, because there is no second numbering sequence to point at. **One requirement gap is open and MUST be closed, not accepted.** `requirements/ticket-resolution.md` does not state that `hamilton-wayfinder-domain-modeling` reads from *both* glossary levels — canonical `.hamilton/specs/glossary.md` and the map's working `glossary.md` — while writing only to the map's. Ticket 07 fixed this behaviour; the requirement does not yet capture it, and Task 6 ports prose whose closing line ("infer which one the current topic relates to") is a faithful re-point of upstream rather than a statement of Hamilton's actual two-level read. This is a blocking gap in the requirements artifact to be addressed in a follow-up, not a smell to live with.

## Tasks

### Task 1: Land hamilton-wayfinder-research verbatim

- Depends on: none
- Files:
  - Created: `skills/hamilton-wayfinder-research/SKILL.md`, `skills/hamilton-wayfinder-research/NOTICE`
  - Modified: none
  - Deleted: none
- Acceptance:
  - `SKILL.md` is byte-identical to `https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/research/SKILL.md` as fetched during this task — frontmatter, body, and trailing newline included.
  - `NOTICE` names the `"research"` skill and its MIT permission block is byte-identical to the block already in `skills/hamilton-grilling/NOTICE`.
  - No `references/` directory exists — upstream `research` ships no reference files.
- Steps:
  1. Fetch the upstream file as raw text and write it unmodified to `skills/hamilton-wayfinder-research/SKILL.md`. Use `curl`, not a summarising fetcher — a paraphrase is indistinguishable from a faithful copy at read time and destroys the invariant invisibly.
  2. Copy `skills/hamilton-grilling/NOTICE` to `skills/hamilton-wayfinder-research/NOTICE` and change only the quoted skill name on line 1 from `"grilling"` to `"research"`. Do not retype the MIT text.
  3. Confirm the two files are the only ones created, then run the Verify command.
- Verify: `diff <(curl -sS https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/research/SKILL.md) skills/hamilton-wayfinder-research/SKILL.md` → no output, exit 0. Then `diff <(sed 1,2d skills/hamilton-grilling/NOTICE) <(sed 1,2d skills/hamilton-wayfinder-research/NOTICE)` → no output.
- Commit: `feat: port the research skill verbatim`

### Task 2: Re-home research findings onto the map

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `skills/hamilton-wayfinder-research/SKILL.md`
  - Deleted: none
- Acceptance:
  - Frontmatter `name` reads `hamilton-wayfinder-research`. The `description` field is unchanged from upstream — it is deliberately not narrowed.
  - Numbered item 3 names `.hamilton/maps/<effort>/research/` as the destination and no longer defers to "where the repo already keeps such notes" or offers a "somewhere sensible" fallback.
  - A provenance line closes the file, matching the shape of the last line of `skills/hamilton-grilling/SKILL.md` with `"research"` substituted.
  - `git show --stat HEAD` lists exactly one file.
- Steps:
  1. Change the frontmatter `name` from `research` to `hamilton-wayfinder-research`. Leave `description` untouched.
  2. Replace numbered item 3 — currently `Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.` — with a single sentence sending the file to `.hamilton/maps/<effort>/research/`, where `<effort>` is the map being worked. Keep it one sentence in upstream's register; this is a destination swap, not a rewrite.
  3. Append the provenance line, adapting `skills/hamilton-grilling/SKILL.md`'s closing line: `Adapted from the "research" skill in [mattpocock/skills](https://github.com/mattpocock/skills), used under the MIT License — see the `NOTICE` file beside this one.`
  4. Run the Verify command; every hit it reports is an unfinished re-homing.
- Verify: `grep -rnE "docs/adr|CONTEXT\.md|issue|where the repo already keeps" skills/hamilton-wayfinder-research/` → no output, exit 1. Then `git show --stat HEAD` → one file changed.
- Commit: `feat: re-home research findings onto the map`

### Task 3: Land hamilton-wayfinder-prototype verbatim

- Depends on: none
- Files:
  - Created: `skills/hamilton-wayfinder-prototype/SKILL.md`, `skills/hamilton-wayfinder-prototype/references/LOGIC.md`, `skills/hamilton-wayfinder-prototype/references/UI.md`, `skills/hamilton-wayfinder-prototype/NOTICE`
  - Modified: none
  - Deleted: none
- Acceptance:
  - Each of the three Markdown files is byte-identical to its upstream counterpart under `skills/engineering/prototype/`.
  - `LOGIC.md` and `UI.md` sit inside `references/`, not flat beside `SKILL.md`. Their *contents* are untouched by the move — the pointers in `SKILL.md` still read `(LOGIC.md)` and `(UI.md)` at this commit and are fixed in Task 4.
  - `NOTICE` names the `"prototype"` skill, permission block byte-identical to `skills/hamilton-grilling/NOTICE`.
- Steps:
  1. Fetch `SKILL.md`, `LOGIC.md` and `UI.md` from `https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/prototype/` as raw text. Use `curl`, not a summarising fetcher.
  2. Write `SKILL.md` at the directory root and the other two into `references/`, all unmodified.
  3. Copy `skills/hamilton-grilling/NOTICE` and change only the quoted skill name to `"prototype"`.
  4. Run the Verify command.
- Verify: `for f in SKILL.md references/LOGIC.md references/UI.md; do diff <(curl -sS "https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/prototype/$(basename $f)") "skills/hamilton-wayfinder-prototype/$f" || echo "MISMATCH $f"; done` → no output at all.
- Commit: `feat: port the prototype skill verbatim`

### Task 4: Re-home prototype capture onto the ticket

- Depends on: Task 3
- Files:
  - Created: none
  - Modified: `skills/hamilton-wayfinder-prototype/SKILL.md`
  - Deleted: none
- Acceptance:
  - Frontmatter `name` reads `hamilton-wayfinder-prototype`; `description` unchanged.
  - Both branch pointers resolve into `references/` — `[LOGIC.md](references/LOGIC.md)` and `[UI.md](references/UI.md)`.
  - Rule 6 no longer mentions an issue. The context pointer to the throwaway branch goes in the resolving ticket's body, and the verdict plus the question it settled go in that ticket's `## Answer`.
  - `references/LOGIC.md` and `references/UI.md` are **not** modified — they contain no re-homing terms and stay byte-identical to upstream.
- Steps:
  1. Change the frontmatter `name` from `prototype` to `hamilton-wayfinder-prototype`. Leave `description` untouched.
  2. Fix the two branch pointers in `## Pick a branch`: `[LOGIC.md](LOGIC.md)` → `[LOGIC.md](references/LOGIC.md)`, and `[UI.md](UI.md)` → `[UI.md](references/UI.md)`. Change nothing else on those two bullets.
  3. In rule 6 of `## Rules that apply to both`, re-point the two destinations. `leave a context pointer to that branch on the implementation issue` becomes a pointer left in the resolving ticket's body; `Capture the answer too — the verdict and the question it settled — in the issue or a commit` becomes capture in that ticket's `## Answer`. Keep the rest of the rule — the throwaway-branch commit, "The main branch keeps only the validated decision" — exactly as upstream wrote it.
  4. Append the provenance line with `"prototype"` substituted, matching `skills/hamilton-grilling/SKILL.md`'s closing line.
  5. Run the Verify command.
- Verify: `grep -rnE "docs/adr|CONTEXT\.md|issue|where the repo already keeps" skills/hamilton-wayfinder-prototype/` → no output, exit 1. Then `git show --stat HEAD` → exactly one file changed, `SKILL.md`.
- Commit: `feat: re-home prototype capture onto the ticket`

### Task 5: Land hamilton-wayfinder-domain-modeling verbatim

- Depends on: none
- Files:
  - Created: `skills/hamilton-wayfinder-domain-modeling/SKILL.md`, `skills/hamilton-wayfinder-domain-modeling/references/CONTEXT-FORMAT.md`, `skills/hamilton-wayfinder-domain-modeling/references/ADR-FORMAT.md`, `skills/hamilton-wayfinder-domain-modeling/NOTICE`
  - Modified: none
  - Deleted: none
- Acceptance:
  - Each of the three Markdown files is byte-identical to its upstream counterpart under `skills/engineering/domain-modeling/`.
  - Both format guides sit inside `references/`; contents untouched at this commit.
  - `NOTICE` names the `"domain-modeling"` skill, permission block byte-identical to `skills/hamilton-grilling/NOTICE`.
- Steps:
  1. Fetch `SKILL.md`, `CONTEXT-FORMAT.md` and `ADR-FORMAT.md` from `https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/domain-modeling/` as raw text. Use `curl`, not a summarising fetcher.
  2. Write `SKILL.md` at the directory root and the two guides into `references/`, all unmodified.
  3. Copy `skills/hamilton-grilling/NOTICE` and change only the quoted skill name to `"domain-modeling"`.
  4. Run the Verify command.
- Verify: `for f in SKILL.md references/CONTEXT-FORMAT.md references/ADR-FORMAT.md; do diff <(curl -sS "https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/domain-modeling/$(basename $f)") "skills/hamilton-wayfinder-domain-modeling/$f" || echo "MISMATCH $f"; done` → no output at all.
- Commit: `feat: port the domain-modeling skill verbatim`

### Task 6: Re-home the domain model onto the map

- Depends on: Task 5
- Files:
  - Created: none
  - Modified: `skills/hamilton-wayfinder-domain-modeling/SKILL.md`, `skills/hamilton-wayfinder-domain-modeling/references/CONTEXT-FORMAT.md`, `skills/hamilton-wayfinder-domain-modeling/references/ADR-FORMAT.md`
  - Deleted: none
- Acceptance:
  - No file under `skills/hamilton-wayfinder-domain-modeling/` mentions `CONTEXT.md`, `CONTEXT-MAP.md`, or `docs/adr`.
  - The glossary is two-level everywhere it appears: `.hamilton/specs/glossary.md` is canonical and read from; the map's `.hamilton/maps/<effort>/glossary.md` is the working glossary and the only thing written to during a session.
  - Every ADR destination is the resolving ticket's `## Answer`. No section instructs a reader to create a directory.
  - Every upstream section survives. Nothing is deleted except the `CONTEXT-MAP.md` example document, which is dropped because it documents a file Hamilton does not have (see Step 6).
  - `git show --stat HEAD` lists exactly three files.
- Steps:
  1. In `SKILL.md`, change the frontmatter `name` from `domain-modeling` to `hamilton-wayfinder-domain-modeling`. Leave `description` untouched.
  2. In `SKILL.md`'s opening paragraph, re-point the parenthetical `(Merely *reading* \`CONTEXT.md\` for vocabulary is not this skill …)` to the glossary. One term swap; the sentence's shape does not change.
  3. Replace `SKILL.md`'s two `## File structure` ASCII trees. The single-context tree becomes:

     ```
     .hamilton/
     ├── specs/
     │   └── glossary.md
     └── maps/
         └── <effort>/
             ├── map.md
             ├── glossary.md
             └── tickets/
                 ├── 01-event-sourced-orders.md
                 └── 02-postgres-for-write-model.md
     ```

     and the multi-context tree — upstream's "if a `CONTEXT-MAP.md` exists" branch — becomes several efforts side by side under one canonical glossary:

     ```
     .hamilton/
     ├── specs/
     │   └── glossary.md                    ← canonical language
     └── maps/
         ├── ordering/
         │   ├── glossary.md                ← working language
         │   └── tickets/                   ← decisions
         └── billing/
             ├── glossary.md
             └── tickets/
     ```

     Re-point the prose introducing the second tree so it keys off several live maps rather than the presence of a `CONTEXT-MAP.md` file.
  4. Re-point `SKILL.md`'s lazy-creation line. `If no \`CONTEXT.md\` exists, create one when the first term is resolved` becomes the map's `glossary.md`; `If no \`docs/adr/\` exists, create it when the first ADR is needed` becomes a decision written into the resolving ticket's `## Answer`, which already exists — so there is nothing to create lazily.
  5. In `SKILL.md`, re-point `### Challenge against the glossary` to read against **both** levels — the canonical `.hamilton/specs/glossary.md` and the map's working `glossary.md`. Rename the heading `### Update CONTEXT.md inline` to `### Update the glossary inline`, and re-point its body: terms are written to the map's `glossary.md`, and the two sentences beginning `\`CONTEXT.md\` should be totally devoid of implementation details` apply to that same working glossary. Update the pointer `[CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md)` to `[CONTEXT-FORMAT.md](references/CONTEXT-FORMAT.md)`, and in `### Offer ADRs sparingly` update `[ADR-FORMAT.md](./ADR-FORMAT.md)` to `[ADR-FORMAT.md](references/ADR-FORMAT.md)` and name the ticket's `## Answer` as the destination.
  6. In `references/CONTEXT-FORMAT.md`, change the title `# CONTEXT.md Format` to `# glossary.md Format`, then replace the body of `## Single vs multi-context repos` with:

     ```md
     **Single context (most repos):** One `glossary.md` at `.hamilton/specs/`.

     **Multiple contexts:** Each effort under `.hamilton/maps/` keeps its own working
     `glossary.md`, holding that effort's language while it is worked. The canonical
     `.hamilton/specs/glossary.md` holds the language the project has committed to.

     The skill infers which structure applies:

     - If a map's `glossary.md` exists, read it for the working language of this effort
     - If only `.hamilton/specs/glossary.md` exists, single context
     - If the map has no `glossary.md`, create one lazily when the first term is resolved

     When both exist, infer which one the current topic relates to. If unclear, ask.
     ```

     Upstream's fenced `# Context Map` example document is dropped along with its `## Relationships` list. This is the one place the re-homing removes content instead of relocating it: `CONTEXT-MAP.md` is a pointer file listing where each glossary lives, and Hamilton's top level is `.hamilton/specs/glossary.md`, which holds terms rather than pointers — so there is no counterpart document to exhibit. Leave `## Structure` and `## Rules` untouched.
  7. In `references/ADR-FORMAT.md`, re-point four passages and nothing else. Line 3, `ADRs live in \`docs/adr/\` and use sequential numbering`, becomes the resolving ticket's `## Answer`. Line 5, `Create the \`docs/adr/\` directory lazily`, becomes writing into the ticket lazily — only when the first ADR is needed. In `## Optional sections`, `superseded by ADR-NNNN` becomes superseded by a ticket number. Under `## Numbering`, `Scan \`docs/adr/\` for the highest existing number and increment by one` becomes a statement that the resolving ticket's own number identifies the decision, so there is no separate sequence to scan. Leave `## Template`, `## When to offer an ADR` and `### What qualifies` byte-identical.
  8. Run the Verify command. Any hit is an unfinished re-homing — the check carries no exemption.
- Verify: `grep -rnE "docs/adr|CONTEXT-MAP|CONTEXT\.md|issue|where the repo already keeps" skills/hamilton-wayfinder-domain-modeling/` → no output, exit 1. Then `git show --stat HEAD` → exactly three files changed.
- Commit: `feat: re-home the domain model onto the map`

### Task 7: Flip route unit 5 to shipped

- Depends on: Task 2, Task 4, Task 6
- Files:
  - Created: none
  - Modified: `.hamilton/maps/hamilton-wayfinder/route.md`
  - Deleted: none
- Acceptance:
  - Unit 5's status line reads `Status: shipped`, matching the exact form units 2 and 4 already use.
  - No other unit's status changes, and no prose elsewhere in `route.md` is touched.
- Steps:
  1. Read unit 5's entry in `.hamilton/maps/hamilton-wayfinder/route.md` together with a already-shipped unit, to copy the status line's exact form.
  2. Change unit 5's status to `shipped`.
  3. Run the Verify command.
- Verify: `git diff --stat` → one file, one insertion and one deletion.
- Commit: `docs: flip route unit 5 to shipped`

## Done when

- All tasks implemented (recorded in progress.md)
- `bun run test` passes; `bun run build` is clean
- `grep -rnE "docs/adr|CONTEXT-MAP|CONTEXT\.md|issue|where the repo already keeps" skills/hamilton-wayfinder-*/` returns nothing
- Each skill's second commit, shown with `git show`, touches only frontmatter, the provenance line, a `references/` pointer, or a re-homed destination
- All review feedback has been addressed
