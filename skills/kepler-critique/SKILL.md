---
name: kepler-critique
description: "Review a change's propose-phase artifacts — proposal.md, requirements/, design.md — for logical consistency, semantic coherence, code-reference validity, and design/plan code quality, returning a numbered findings report and a verdict. Reviews only; never edits the artifacts."
---

# Critiquing a change's artifacts

Review the proposal, requirements, and design a change committed to — before any code is
planned — and return a numbered findings report a person or agent can act on without
guessing which item you mean.

The **seven-stage core pipeline** is Kepler's fixed spec-driven sequence: init → propose → plan → code →
code-feedback → review → finish-work. This skill is an **optional design-phase gate outside the
seven-step core pipeline**: it critiques the proposal, requirements, and design produced by
`kepler-propose` before `kepler-plan` turns them into tasks. Unlike `kepler-review`, which
is the final whole-branch inspection gate, critique judges propose-phase artifacts before
implementation. Wayfinder is likewise optional and outside the core count.

**Judge, don't fix.** You produce a verdict and located findings. You never modify
`proposal.md`, `requirements/`, or `design.md`. The single `decision` field records what the
user did with the critique. Apply the supported settlement matrix in **Handoff**; a recorded
`skipped` decision or `accepted` changes-requested verdict is not settled. Preserve settled
dispositions and do not work them again unless the user requests a new critique pass.

## Inputs

- The change directory path (`.kepler/changes/<change>/`).
- The propose artifacts under review: `proposal.md` (why), `requirements/<capability>.md`
  (what), `design.md` (how). Any subset that exists — a change may skip some.
- **The actual codebase.** Every reference the artifacts make — a type, function, file, or
  code example — must be checked against the real repository, not taken on trust.
- The project's canonical specs (`.kepler/specs/`) — the current requirement truth each
  MODIFIED capability builds on.
- The change's `route_unit` frontmatter field (in the proposal), if present — follow it to the
  route unit's `backed_by` tickets; their Answers are committed decisions the artifacts
  must honor.
- The canonical glossary (`.kepler/specs/glossary.md`), when present, is the main source of context-scoped project language. Read established domain and architecture documentation for supplementary definitions, boundaries and the sources cited by the proposal. For an older project without a glossary, verify the documented fallback meanings.
- Project standards (`AGENTS.md`): idioms, ubiquitous language, boundaries.

## References

This skill ships with a `references/` folder. Read reference files using the Read tool on
the skill's own directory — they are co-located with this SKILL.md, **not** at
`${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/` or `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/`.

- `references/code-quality.md` — the design/plan-altitude rubric for judging structural
  quality, the same one `kepler-propose` self-reviews against.

## Principles

- **Evidence over claims.** Trust the codebase, not the artifact's description of it. A
  design that says a type "is satisfied structurally" means nothing until you read the type
  and confirm the signatures line up.
- **Ground every reference.** The sharpest defect a design carries is a reference to code
  that does not exist, or no longer will. Verify each named type/function/file/example
  against the repository, and confirm nothing is planned against code the same change
  removes. This is a required step, not an optional pass.
- **Specific and located.** Every finding names the artifact and place, says what is wrong
  and what to change, and cites the criterion or standard it violates. "`design.md:126`
  claims `RapClient` satisfies `RAPStatusChecker`, but their `IsDone` return types differ"
  is useful; "the design is inconsistent" is not.
- **Numbered, most-severe first.** Findings are one continuous numbered list so any reply
  can pick an item by its number. Order the list by severity, tag each item, and keep the
  numbering stable within a pass.
- **Proportionate.** Scale scrutiny to the change (`references/code-quality.md` says how).
  Separate what blocks the gate from what is a suggestion; don't gold-plate a small change.
- **Scope-aware.** Flag speculative surface — unused methods, interfaces with one caller,
  extension points no requirement asks for — as YAGNI, the same way you would in code.

## Process

1. **Establish scope.** Run `kepler workbench context <change-dir>` to
   learn which propose artifacts are present and which capabilities the change carries (if the
   Kepler CLI/workbench is unavailable, list the directory yourself), then read every one of them
   (`proposal.md`, `requirements/`, `design.md`) and the canonical specs the change builds on.
   Note which capabilities are new vs modified vs removed — the removed set drives the cleanup
   check.
2. **Ground every reference in the codebase.** This is the load-bearing step. For each
   type, function, file, or code example the artifacts cite, read the real code and confirm
   it exists with the shape claimed — signatures, return types, field names, table names.
   Then check the other direction: nothing may be planned to modify, call, subclass, or
   use-as-example any code the change itself removes. A phantom reference or a change
   against deleted code is a blocking finding.
3. **Review across dimensions** (checklist below).
4. **Apply the structural rubric.** Run `design.md` and `requirements/` against
   `references/code-quality.md`, scaled to the change, and capture the outcome as a Quality
   Lens table (one row per principle you exercised).
5. **Decide a verdict:** `approved` or `changes-requested`.
6. **Validate findings with the author (changes-requested only).** When the verdict is
   `changes-requested`, invoke `kepler-grilling` with the findings as content and
   "every finding is validated" as the exit condition, before writing the report. A
   false positive can be rejected; where a finding offers several fixes, the author
   picks one. Unattended, skip the validation; the report is written from the unvalidated findings, and the handoff names the next step.
7. **Write the report** — the numbered format below — printed to chat **and** persisted to
   `critique.md` in the change directory, written from the findings that survived
   validation. Record `created`, `verdict`, and `decision` (`accepted`, `applied`, `rejected`,
   or `skipped`) in frontmatter; do not duplicate these fields as body metadata. Use
   `accepted` only when the user accepts an `approved` verdict that needs no remediation,
   `applied` when the user accepts and applies `changes-requested` findings, `rejected` when the
   user explicitly dismisses those findings, and `skipped` when no user decision is collected.
   `decision: accepted` on a `changes-requested` verdict does not settle its application. Never add a second resolution field. After you write the report, run
   `kepler workbench lint --file <change-dir>/critique.md` before printing it or handing it off.
   A nonzero lint result is a failed gate: correct the report and rerun lint, or stop with the
   exact finding without declaring the critique compliant.

## Review dimensions

- **Logical consistency:** No artifact contradicts another or itself. Every described flow
  is complete — each step's inputs exist and line up with the previous step's outputs, and
  no step depends on a branch the design says can't happen.
- **Semantic coherence:** One term per concept within each bounded context, used consistently across artifacts. Verify definitions and sources against the canonical glossary and supplementary project documentation. The same word may have distinct meanings across contexts; check explicit translations rather than demanding a global definition. Verify mappings to code names, including documented legacy aliases. An unsupported meaning or conflict with canonical language is a located finding.
- **Domain scope:** For new full-path proposals, check Domain Context names the involved subdomains and bounded contexts, their responsibilities, involvement and language sources. Each capability must identify a cohesive scope (domain, subdomain or bounded context), responsibility and relation to that context. Infrastructure responsibilities qualify when their model, boundary and contract support the claim; REST alone does not establish a context. A package or endpoint name is insufficient evidence. Flag overlapping parent/child contracts and independent goals bundled into one capability. Existing lint-valid historical proposals missing Domain Context are not invalid for that omission alone; do not demand retroactive backfill of approved history. Requirements-only changes need no proposal.
- **Boundary impact:** Verify ownership and contract changes across the named contexts, including data ownership, translation, trust, compatibility, migration and coordination obligations. Check that business rules remain with their stated owner rather than leaking into an infrastructure context. If the proposal says no boundary changes, verify its explanation against the stated change. A material unresolved ownership or meaning blocks approval; structural lint cannot establish semantic completeness.
- **Code-reference validity:** Every referenced type/function/file/example exists in the
  codebase with the claimed signature and shape. No phantom references; no example that
  contradicts the real API it stands on.
- **Cleanup consistency:** Nothing is planned to modify, call, or use-as-example any
  type/function/code the change removes. When the change is a cleanup, list what it deletes
  and confirm no surviving step still leans on it — and that the deletion list is complete.
- **Structural quality:** Cohesion, coupling, testable seams, dependency direction,
  right-sized abstraction, intention-revealing names — judged against
  `references/code-quality.md`, scaled to the change. A smell baked into the design is a
  design defect to fix now, before it is inherited by every line of code.
- **Scope & YAGNI:** Unused methods, one-caller interfaces, speculative extension points,
  config knobs no requirement asks for. Cut now, add the seam when the second case arrives.
- **Completeness:** Placeholders, TODOs, ambiguity, and unresolved contradictions that
  would leave the planner or coder guessing.

## Report format

Write the report to `.kepler/changes/<change>/critique.md`, following the
`${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/critique.md` format, and print the same content to chat. Findings are
**one continuous numbered list, ordered most-severe first**, each tagged
`[Critical]` (blocks the gate — a defect that would cause implementation confusion or a
runtime failure), `[Significant]` (a factual error or YAGNI violation to correct before the
gate), or `[Minor]` (a documentation or naming gap):

```
# Critique: <change> — <YYYY-MM-DD>

## Scope
<N artifacts cross-referenced against the codebase, the code-quality rubric, and each other>

The frontmatter `verdict` is `approved`, `changes-requested`, or `skipped`, and `decision` records
whether the critique was accepted, applied, rejected, or skipped.

## Findings
1. **[Critical]** <title>
   - Where: <artifact:loc>, <artifact:loc>
   - Problem: <what is wrong and why>
   - Fix: <what to change; sub-number 1./2. when there are options, marking the author's choice>
2. **[Significant]** <title>
   - Where: ...
   - Problem: ...
   - Fix: ...
3. **[Minor]** <title>
   - ...

## Quality Lens
| Principle | Verdict | Notes |
| --- | --- | --- |
| <principle from code-quality.md> | ✅ / ⚠️ (→ finding N) / ❌ | <one line> |

## Summary
| Severity | Count | Items |
| --- | --- | --- |
| Critical | <n> | <finding numbers> |
| Significant | <n> | <finding numbers> |
| Minor | <n> | <finding numbers> |

**Recommendation:** <which findings block the gate; what can be deferred>
```

When the verdict is `approved`, replace the Findings list with a short note of what you
verified (artifacts cross-referenced, references confirmed against the codebase, rubric
clean).

## Output

`critique.md` written to the change directory and the same report printed to chat, with a
verdict and a numbered findings list. This skill does not modify `proposal.md`,
`requirements/`, `design.md`, or any code.

## Handoff

- **Require a settled disposition before handoff.** An `approved` critique with decision
  `accepted`, `applied`, or `rejected` is settled under the shared supported matrix. New approved
  reports normally use `accepted`; preserve legitimate historical applied/rejected dispositions
  rather than forcing a replacement critique. A `changes-requested` critique is settled only when the requester records
  `decision: applied` after applying the findings, or `decision: rejected` after explicitly
  dismissing them. `changes-requested` with `accepted` or `skipped` holds at the artifact owner;
  `approved` with `skipped` and any `verdict: skipped` supply no clearance. A skipped decision
  means no owner disposition was collected. Never infer one from a named next stage, formal
  artifact status, template default, or unattended authorization. Return unresolved findings to
  `kepler-propose` for revision/reapproval or request the missing owner decision; do not dispatch
  planning/code while this hold remains. Applied/rejected critique decisions are settled: preserve
  them and never rerun `kepler-critique` merely to replace them with `approved`.
- **Name the next step only after the hold clears.** A settled critique may continue to the next
  applicable core stage. Critique remains optional; when no critique artifact exists, do not
  manufacture one. A critique disposition never substitutes for explicit revision-bound requester
  approval of formal proposal/design/requirements inputs.
- **Choose the applicable core stage.** With no `plan.md`, the next stage is
  `kepler-plan`. With an existing plan that remains valid after the revisions, the user may
  continue with `kepler-code` for one task or `kepler-orchestrate` for the whole plan. If
  the revisions invalidate an existing plan, hand off to `kepler-plan` in re-plan mode.
- **Hand back the decision.** Working with a person, state the verdict and ask whether to
  proceed rather than declaring readiness — and never invoke the next skill yourself.
  Running unattended, name the next step and return; the driver owns the loop.

## Process flow

```dot
digraph kepler_critique {
    "Establish scope\n(proposal + requirements + design + specs)" [shape=box];
    "Ground every reference\n(verify code exists; nothing uses removed code)" [shape=box];
    "Review across dimensions\n(consistency, coherence, references, cleanup)" [shape=box];
    "Apply code-quality rubric\n(-> Quality Lens)" [shape=box];
    "Verdict?" [shape=diamond];
    "Validate findings with author\n(kepler-grilling)" [shape=box];
    "Write numbered findings" [shape=box];
    "State what was verified" [shape=box];
    "Write critique.md + print to chat" [shape=doublecircle];

    "Establish scope\n(proposal + requirements + design + specs)" -> "Ground every reference\n(verify code exists; nothing uses removed code)";
    "Ground every reference\n(verify code exists; nothing uses removed code)" -> "Review across dimensions\n(consistency, coherence, references, cleanup)";
    "Review across dimensions\n(consistency, coherence, references, cleanup)" -> "Apply code-quality rubric\n(-> Quality Lens)";
    "Apply code-quality rubric\n(-> Quality Lens)" -> "Verdict?";
    "Verdict?" -> "Validate findings with author\n(kepler-grilling)" [label="changes-requested"];
    "Validate findings with author\n(kepler-grilling)" -> "Write numbered findings";
    "Verdict?" -> "State what was verified" [label="approved"];
    "Write numbered findings" -> "Write critique.md + print to chat";
    "State what was verified" -> "Write critique.md + print to chat";
}
```
