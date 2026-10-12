# Design: Wayfinder branching and operation rules

## Context

The wayfinding stage is implemented entirely as prose contracts: two SKILL.md files (`skills/hamilton-wayfinder/SKILL.md`, `skills/hamilton-wayfinder-prototype/SKILL.md`), three templates under `bundle/templates/wayfinder/`, and a mechanics contract mirrored in `CONTRIBUTING.md`. The map records nothing about branches; the prototype skill defers branch discipline to a closing "capture" step; operation preferences have no home; and the dispatch wording ("delegate to the skill the ticket's type promises") is advisory enough that some models skip loading `hamilton-wayfinder-prototype` or defer a claimed prototype ticket to a future session. The repo recently gained a deliberate helper-script idiom — four bash scripts in `bundle/scripts/`, installed to `~/.hamilton/scripts/`, that own mechanical questions (workspace isolation, precondition checks) so skills stop re-deriving them — and skills are written to fall back to manual git when a script is not installed.

Constraints that must stay true: the `## Map mechanics` section of the wayfinder skill is the only place in that skill body defining file-native mechanics, and `CONTRIBUTING.md`'s `## Map mechanics` mirrors it; templates are the single source of truth for artifact shapes and the skill never reproduces them. The ticket-resolution spec's upstream byte-fidelity invariant is not a constraint here: it governed only the initial fork of the ported skills, and this change removes it.

## Goals / Non-Goals

**Goals**

- Record the working branch on the map and use it as the merge-back reference everywhere downstream (route shipping rules, worktree orientation).
- Make prototype work branch-gated, mechanically checkable, and same-session.
- Give operation rules a solicited, recorded, and obeyed home on the map.
- Give the route a Shipping rules section seeded from the map.
- Harden ticket-type dispatch wording so weaker models cannot skip it.

**Non-Goals**

- No CLI command changes, no map migration tooling, no enforcement hooks.
- No change to frontier, claim, ticket types, or map lifecycle values.

## Decisions

### Decision: Overall shape — prose edits plus one small helper script

- Choice: implement improvements 1, 3, 4, 5, 6 as edits to the two SKILL.md files, the two templates, and `CONTRIBUTING.md`; implement improvement 2 (the prototype branch gate) with a new bundled helper script `hamilton-prototype-branch.sh` that the prototype skill calls, with a documented manual-git fallback when the script is not installed.
- Alternatives considered: (A) prose-only for everything — smallest diff, but the branch gate is exactly the kind of mechanical, must-not-be-skipped step the models are already fumbling, and prose alone is what failed; (C) extend `hamilton-isolate.sh` with a `--prototype` mode — reuses plumbing but overloads a script whose contract is "isolation for a change worktree" with a second, different question (plain branch from current, no worktree), coupling two evolution paths.
- Rationale: the script gives the gate a verifiable outcome (the branch exists and is checked out) and matches the project's fresh helper-script idiom; keeping it separate from `hamilton-isolate.sh` keeps each script with one reason to change. Accepted trade-off: one more file in the install surface.

### Decision: `branch:` map frontmatter field, set at charting

- Choice: the map frontmatter gains `branch:`, set at map creation to the branch the charting session is on; it names the branch the effort works from and merges back into. Legacy maps without the field fall back to the repo's default branch.
- Alternatives considered: a body section (Notes line) — not machine-matchable and outside the mechanics contract; recording per-session branches or a branch history — YAGNI, downstream only ever needs the merge-back target.
- Rationale: frontmatter is the parsed interface the mechanics contract already governs; one field, one meaning. Both mechanics homes (skill section and `CONTRIBUTING.md`) gain the row in the same change.

### Decision: Operation rules as a dedicated map section

- Choice: a new `Operation rules` body section on the map, after Notes; charting asks for rules explicitly (grilling question) and records them; the work loop's "Load the map" step reads them and the session applies them.
- Alternatives considered: folding into Notes — Notes is orienting context and its hint says "durable preferences", but rules are prescriptive and per-session-binding; burying them in Notes is how they get ignored. A per-map config file (`rules.yaml`) — machinery with no consumer; the reader is an agent, prose serves it.
- Rationale: a section with a normative name creates a checkable obligation ("did the session read Operation rules?") and mirrors the route's Shipping rules. This deliberately revises the artifact-templates contract from "five sections and no sixth" to six sections.

### Decision: Prototype branch gate semantics

- Choice: `hamilton-prototype-branch.sh <map-name> <ticket-name>` creates `prototype/<map-name>/<ticket-name>` from the current branch and switches to it; standalone mode `hamilton-prototype-branch.sh --standalone <question-slug>` creates `prototype/<question-slug>`. If the branch already exists, it is checked out and reported as resumed — a HITL prototype often spans interruptions, and resuming the same ticket's branch is the correct default. A `--verify` mode confirms the current branch matches, mirroring the isolate script's contract. Uncommitted changes ride along (plain `git switch -c` behavior), which is acceptable for throwaway work.
- Alternatives considered: refusing to run on a dirty tree — would block the common case of a session already mid-flight; suffixing on existing branch (like isolate does) — wrong here because the branch *is* the ticket's identity, not a scratch name.
- Rationale: branch-per-ticket gives the ticket body a stable pointer and turns "did the prototype skill run" into an observable fact.

### Decision: The gate lives in the prototype skill; the upstream-fidelity invariant is retired

- Choice: the branch gate is added to the prototype SKILL.md as a discrete step before "Build throwaway", and rule 6 ("Capture it when done") is adjusted to commit-on-branch-and-return rather than move-to-branch. The ticket-resolution invariant requiring byte-identity with upstream is removed: it governed only the initial fork, which is complete, and the owner has confirmed the skill text now evolves freely.
- Alternatives considered: putting the gate only in the wayfinder dispatch step, leaving the prototype skill untouched — breaks the standalone invocation path (the procedure must behave the same whichever way it is reached, per ticket-resolution's "no second mode" contract); amending the invariant to fold the gate into the adaptation surface — needless contortion once the invariant itself is obsolete.
- Rationale: the gate belongs to the procedure, not the dispatcher, and the obsolete invariant is removed openly rather than worked around.

### Decision: Dispatch and same-session wording hardened in the work loop

- Choice: rewrite work-loop steps 3–4 of the wayfinder skill: step 3 ("Claim it") states that claiming is the start of resolution — the same session resolves the ticket, never a later one; step 4 ("Resolve it") becomes imperative per type, with an explicit "MUST load the resolving skill before any resolution work; for prototype tickets, no prototype code before `hamilton-wayfinder-prototype` is loaded and its branch gate has run". The one-ticket-per-session sentence gains "a ceiling, not a deferral: the ticket you claim is the ticket you resolve, now". The dispatch table and process-flow graph are updated to match.
- Alternatives considered: only strengthening the table — tables read as reference, not instruction, and are what some models already skim past.
- Rationale: the misreadings quoted in the request are wording failures; the fix is normative language at the point of action, backed by the mechanical gate for the prototype case.

### Decision: Route `## Shipping rules` between preamble and Units

- Choice: the route template gains a `## Shipping rules` section; the wayfinder route-writing step fills it from the map's `branch:` field (merge-back target) plus any shipping-relevant operation rules, so the route is self-contained for downstream processes that never open the map.
- Alternatives considered: leaving shipping conventions in the preamble prose — unlabeled, so downstream readers cannot reliably find them; per-unit shipping lines — repetition of constants the preamble rule already forbids.
- Rationale: one labeled home, written once at route time, mirroring how Decisions lines already work.

## Architecture & Components

| Unit | Responsibility | Interface | Depends on |
|---|---|---|---|
| `bundle/scripts/hamilton-prototype-branch.sh` | Own the prototype-branch question: create/resume and verify `prototype/...` branches | `<map> <ticket>` \| `--standalone <slug>` \| `--verify <expected-branch>`; last line is the branch name (create) or verdict (verify); exit 0/1/2 | git CLI only |
| `skills/hamilton-wayfinder-prototype/SKILL.md` | Prototype procedure: gate on branch, build, capture verdict | invoked by name (Skill tool) or via wayfinder dispatch | the script, with manual-git fallback |
| `skills/hamilton-wayfinder/SKILL.md` | Charting (branch + operation rules recorded), work loop (rules obeyed, imperative dispatch, same-session), route writing (shipping rules), mechanics contract (`branch` field) | user-invoked | templates, resolving skills |
| `bundle/templates/wayfinder/map.md` | Map shape: `branch:` frontmatter, `Operation rules` section | read at map creation | — |
| `bundle/templates/wayfinder/route.md` | Route shape: `## Shipping rules` section | read at route writing | — |
| `CONTRIBUTING.md` `## Map mechanics` | Contributor-facing mirror of the mechanics contract | — | must change in lockstep with the skill's section |

### Quality Lens

- Responsibility: each unit above has one reason to change; the new script answers exactly one question and is deliberately not folded into `hamilton-isolate.sh`, whose contract is a different question.
- Boundaries & dependencies: skills depend on the script's documented last-line/exit-code contract, never its internals — the same seam the existing four scripts established; the script's testable seam is "run it in a temp git repo", matching the project's no-mocks testing pattern. Templates remain the single source of artifact shape; the skill points, never reproduces.
- Right-sizing: deliberately not added — a CLI subcommand, a map migration tool, a rules config format, branch-history tracking, and dirty-tree protection in the gate script. Each has no present consumer.
- Accepted smells: (1) the mechanics contract still lives in two homes (skill + CONTRIBUTING.md) and both must gain the `branch` row — a pre-existing, documented duplication this change extends rather than fixes; (2) prose obligations ("obey operation rules", "load the skill first") remain unenforceable by tooling — mitigated for the highest-failure case (prototype) by the mechanical branch gate.

## Data & Flow

Charting: name destination → grill operation rules → create map with `branch:` = current branch and `Operation rules` filled → tickets as today. Working: load map → read `branch:` + Operation rules → claim frontier ticket → resolve in-session (prototype: load `hamilton-wayfinder-prototype` → run branch gate → build on `prototype/<map>/<ticket>` → verdict → commit, return to starting branch) → record answer, gist, apply commit-style rules. Route: map clears → write route with `## Shipping rules` naming the map's `branch:` as merge-back target plus shipping-relevant operation rules.

## Error Handling & Edge Cases

| Failure | Behavior |
|---|---|
| Script not installed | Skill falls back to manual git (`git switch -c prototype/<map>/<ticket>`), same names, same order — the pattern hamilton-propose already uses for isolate |
| `prototype/...` branch already exists | Checked out and reported as resumed; not an error |
| Not inside a git repository | Script exits 2 with a message; skill surfaces it and stops the gate |
| Map lacks `branch:` (legacy) | Sessions fall back to the repo's default branch as merge-back target |
| User gives no operation rules | Section present and empty; work loop reads it and finds nothing to apply |
| Session on a detached HEAD at charting | Record the default branch and tell the user; do not write a SHA into `branch:` |

## Testing Strategy

The script follows whatever test pattern the four existing bundle scripts use (verify at plan time); at minimum: shell-driven tests in a temp git repo covering create, resume, standalone, `--verify` mismatch, and not-a-repo. Template installation is already covered by `tests/cli/setup.test.ts` (tree copy, not contents) — no new code tests. Prose and template edits are verified by self-review against the requirements' scenarios and by `hamilton-critique`/`hamilton-review` downstream.

## Constraints & Boundaries

- Always: update both mechanics homes (skill + CONTRIBUTING.md) in the same commit.
- Ask first: any change to the mechanics vocabulary beyond adding the `branch` row; renaming existing map sections.
- Never: touch frontier/claim semantics, ticket types, map lifecycle values, or `hamilton-isolate.sh`.

## Risks / Trade-offs

- [Prose obligations can still be skipped by weak models] → the prototype path — the reported failure — gets a mechanical gate; the rest gets MUST-wording at the point of action, and failures remain visible in review.
- [Template shape change vs existing maps] → additive only; documented legacy fallback (default branch, no Operation rules to obey).
- [Two mechanics homes drift] → lockstep-commit rule recorded in Constraints; pre-existing risk, not new.

## Open Questions

- Confirm the section name `Operation rules` and its position (after Notes) — assumed here; trivially movable at approval.
- Confirm resuming an existing `prototype/...` branch (rather than erroring) is the desired collision behavior.
