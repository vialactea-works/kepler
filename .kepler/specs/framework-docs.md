---
artifact: requirements-spec
capability: framework-docs
status: current
updated: 2026-09-23
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: accepted
---

# Capability: framework-docs

## Overview

The documentation that presents Hamilton's SDD pipeline and its skills to a reader. Two surfaces carry it: `docs/skills.md`, the skills reference a contributor or user reads to learn what each skill does, where it sits, and how the pipeline runs; and the **Mapping Code to Docs** table in `CONTRIBUTING.md`, which tells a contributor changing a given code area which doc they must update in the same change. Together they are the map between the pipeline's behavior, its artifact ownership, and the prose a reader holds.

## Contract

Two document surfaces form the capability. Their filenames are the interface, not incidental paths — a contributor is sent to `docs/skills.md` or to `CONTRIBUTING.md` by name.

| surface | carries |
|---------|---------|
| `docs/skills.md` | the skills reference: the pipeline diagram and identity phrasing, then one entry per skill |
| `CONTRIBUTING.md` — Mapping Code to Docs table | one row per code change area, mapping it to the doc a contributor updates |

### Skill entry shape

Every skill entry in `docs/skills.md` follows one shape: a `### \`hamilton-...\`` heading carrying a short role plus a step tag (e.g. `*(step 1, optional)*`, `*(optional pre-change planning stage)*`), a one-to-two-sentence intro, then `- **When:**` / `- **Inputs:**` / `- **Produces:**` / `- **Notes:**` bullets, ending with a `- Source:` link to the skill's own `SKILL.md`. The shape is the contract a reader relies on to scan the reference; a new entry conforms to it rather than inventing its own structure.

### Pipeline identity

The pipeline is phrased as seven core skills in fixed sequence, plus optional stages outside the core count. The seven core skills are `init`, `propose`, `plan`, `code`, `code-feedback`, `review`, and `finish-work`. The per-task loop is `code` ↔ `code-feedback`; within `code`, an ordinary implementation follows red, green, and behavior-preserving refactor phases, while `code-feedback` is the refactor-phase gate. Whole-branch `review` follows only after active tasks have fresh approved feedback, and `finish-work` follows the final branch gate. Wayfinder remains the optional stage upstream of per-change work, and `hamilton-critique` remains an optional proposal gate.

### Artifact ownership

The framework names `plan.md` as the declarative task handoff. Planning initializes root `progress.md` as the current task ledger and creates `tasks/task-N/progress.md` for detailed implementation history. Code feedback owns `tasks/task-N/feedback.md`, whole-branch review owns root `review.md`, and finish-work owns root `finish.md` for paired intent and outcome history.

## Behavior

A reader who opens `docs/skills.md` finds the seven-stage pipeline diagram (`init ──▶ [ propose ] ──▶ plan ──▶ code ↔ code-feedback ──▶ review ──▶ finish-work`) followed by the identity phrasing, then one entry per skill in the fixed shape. The entries are ordered by lifecycle: the once-per-project setup skill (`init`), then the per-change stages beginning with the optional planner (`wayfinder`), the optional heavyweight front door (`propose`), and the required `plan`, `code`, `code-feedback`, `review`, and `finish-work` stages.

The Workbench section distinguishes `--file` for one recognized artifact from `--change-dir` for a coordinated change directory. Artifact-writing skills run the narrowest scoped lint immediately after each recognized-artifact mutation and resolve every finding before the next mutation, handoff, or commit; a nonzero result is a failed gate, not a warning to ignore. Unrelated outputs remain outside Hamilton lint, while a newly initialized pending task log is valid without a synthetic attempt.

`hamilton-wayfinder` is the optional pre-change planning stage. Its entry sits immediately before `hamilton-propose` and presents the route as Wayfinder's compiled destination-and-path handoff, not a lightweight unit index. The route body has five required sections — Point of departure, Destination, Path chosen, Shipping rules, and Units — and remains stable after synthesis; frontmatter owns mutable route and unit lifecycle metadata. Wayfinder clears fog, propose and plan turn units into implementation artifacts, and code and finish-work build and ship them. The entry also carries the skill's fork provenance in prose — it names the upstream (`mattpocock/skills`) and its licence (MIT) and links to `NOTICE` for the full legal credit, without reproducing the licence text inline.

A contributor changing a code area consults the **Mapping Code to Docs** table in `CONTRIBUTING.md` to find which doc to update. Wayfinder-related surfaces occupy two distinct rows: artifact *templates* shipped in `bundle/templates/wayfinder/` map to `docs/skills.md`, and *map artifacts* authored under `.hamilton/maps/` also map to `docs/skills.md`. The two are separate because they are different change areas — one ships with the repo, the other is authored per-project — and conflating them would misdirect a contributor.

The core diagrams and narrative in `README.md`, `docs/skills.md`, `docs/sdd-framework.md`, and `docs/modes.md` agree on the seven-stage identity, the per-task code-feedback loop, and the whole-branch review gate. The public task-loop description identifies red as a failing behavioral check, green as the smallest passing implementation, and refactor as behavior-preserving cleanup; green alone does not complete a task. It also directs requested feedback back to the same task for a fresh correction cycle with verification, and requires a concrete justification plus repeatable alternative verification when a conventional failing test is unavailable. Wayfinder and critique remain outside that count. Migration guidance tells users to update the CLI and agent-loaded skills together between changes, rerun setup, and use `hamilton workbench`; existing helper files are left in place but are no longer used. Old mixed review and root-progress layouts are finished with their existing version rather than converted or resumed under the split contract.

**Examples**

- open `docs/skills.md` for a skill -> an entry in the fixed shape: heading + role/step tag, intro, When/Inputs/Produces/Notes, Source link to the skill's `SKILL.md`
- read the pipeline paragraph -> seven core skills in fixed sequence with `code` ↔ `code-feedback` followed by whole-branch `review`; Wayfinder and critique are not counted among the seven
- read the task-loop guidance -> red failing check, green smallest passing implementation, behavior-preserving refactor, refactor-phase feedback, and correction verification are explicit; green alone is not completion
- encounter a task without a conventional failing test -> the documentation requires a concrete reason and repeatable alternative verification
- look up `hamilton-wayfinder` -> entry immediately before `hamilton-propose`, carrying the one-sentence rule and the fork provenance with a `NOTICE` link; no licence text reproduced inline
- change a map artifact under `.hamilton/maps/` -> the mapping table sends the contributor to `docs/skills.md`, on a row distinct from the `bundle/templates/wayfinder/` templates row
- inspect a new change artifact tree -> root `progress.md` is the current task ledger, task history and feedback sit under `tasks/task-N/`, and root `review.md` and `finish.md` own change-level history
- read migration guidance before a new change -> the CLI and agent-loaded skills are updated together, setup is rerun, and old helper files remain unused while old mixed-format changes stay on the version that created them

## Invariants

- The pipeline identity counts exactly seven core skills: `init`, `propose`, `plan`, `code`, `code-feedback`, `review`, and `finish-work`. Wayfinder and critique are NEVER counted as core stages.
- A forked skill's provenance in `docs/skills.md` is prose naming the upstream and its licence with a link to `NOTICE`. The licence text is NEVER reproduced inline in the skills reference — legal credit stays in `NOTICE`.
- `hamilton-wayfinder`'s entry MUST sit immediately before `hamilton-propose`, naming it as the optional pre-change planning stage.
- The Wayfinder entry MUST describe a compiled destination-and-path handoff with the five body sections Point of departure, Destination, Path chosen, Shipping rules, and Units; route and unit lifecycle state belongs in frontmatter.
- The documented boundary MUST say that Wayfinder clears fog; propose and plan turn units into implementation artifacts; and code and finish-work build and ship them.
- The documented pipeline MUST show code feedback before whole-branch review and finish-work, and the artifact tree MUST distinguish task-local history from root review and finish history.
- Public workflow documentation MUST describe the ordered red, green, and behavior-preserving refactor cycle, MUST state that green alone is insufficient, and MUST direct requested feedback through a verified correction cycle.
- Public workflow documentation MUST require a concrete justification and repeatable alternative verification when a conventional failing test is unavailable.

## Decisions

- **Entry order groups by lifecycle, not conceptual flow.** The pipeline diagram shows conceptual flow (wayfinder before `init`); the entry order groups by lifecycle — the once-per-project `init` first, then the per-change stages starting with the optional planner. The two orderings are different concerns and need not match.
- **Provenance lives in the Notes bullet, not a subsection.** The established entry shape has no subsections; ancillary facts live in Notes. A dedicated provenance subsection would over-structure a single sentence.
- **The public pipeline names the tactical gate.** Code feedback is a first-class step because its task-scoped approval and the whole-branch review are different contracts; the diagrams make the loop visible instead of hiding it inside orchestration.
- **Public documentation mirrors the executable task contract.** The reader-facing workflow preserves the red/green/refactor order, the green-only prohibition, the feedback correction loop, and the justified alternative-verification path.
- **Related mapping rows stay adjacent but distinct.** Map artifacts (`.hamilton/maps/`) and artifact templates (`bundle/templates/wayfinder/`) are different change areas that point at the same doc; they sit together for scanning but are never merged into one row.
- **Optional planning remains outside the core count.** Wayfinder and critique add useful gates without changing the seven-stage implementation and shipping identity.
- **Migration is atomic between changes.** A clean break avoids compatibility rules in every parser and keeps one artifact contract authoritative; users update the CLI and agent-loaded skills together, rerun setup, and use the workbench while context inventory can identify unsupported historical layouts without interpreting them.
- **Docs are verified by reading, not by automated tests.** No test asserts on `docs/` content; `bun run build` and `bun --bun vitest run` guard code and bundled templates, and a docs change is verified by reading the edited sections and inspecting `git diff --name-only`.
