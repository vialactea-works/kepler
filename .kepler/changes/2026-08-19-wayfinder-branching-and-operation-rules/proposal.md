# Proposal: Wayfinder branching and operation rules

| Field      | Value                                          |
|------------|------------------------------------------------|
| Change     | 2026-08-19-wayfinder-branching-and-operation-rules |
| Status     | draft                                          |
| Author     | Claude (hamilton-propose, unattended)          |
| Created    | 2026-08-19                                     |

## Why

Wayfinder's map knows *what* is being decided but not *where the work lives*: nothing records the branch an effort works from, so a session in a worktree cannot tell where to return or merge back, and prototype code has no defined branch discipline until the closing "capture" step — by which point some models have already skipped the `hamilton-wayfinder-prototype` skill entirely, or deferred the prototype to "the next session" on a misreading of the one-ticket-per-session budget. Separately, users have standing preferences about how sessions should operate (commit after each ticket, delegate certain jobs to a specific subagent) and how route units should ship, but the map and route give those rules no home and charting never asks for them.

## Goals & Success Criteria

- A map records the branch it was charted on, and any session (including one in a worktree) can determine from the map alone which branch to return to or merge back into.
- A prototype ticket cannot produce code outside a branch named `prototype/<map-name>/<ticket-name>`, created from the current branch *before* the first line of prototype code is written.
- Charting asks the user for operation rules and records them in the map; every working session reads and obeys them.
- `route.md` carries a "Shipping rules" section describing how the units will be shipped.
- The wayfinder work loop states unambiguously that a claimed ticket is resolved in the same session that claimed it, and that a prototype ticket MUST be resolved by invoking `hamilton-wayfinder-prototype` before any prototype work — wording strong enough that weaker models do not skip the dispatch or defer the resolution.

## Non-Goals

- No tracker backend, no git automation in the CLI: branch recording and branch gating are skill/template behavior, not new `hamilton` CLI commands.
- No change to the four ticket types, the frontier calculation, the claim semantics, or the map lifecycle values.
- No enforcement tooling (hooks, scripts) that mechanically blocks a session from disobeying operation rules — the rules are normative instructions, enforced the way the rest of the skill contract is.
- No retrofit of existing maps; the new fields and sections apply to maps and routes created after this change (an existing map may be upgraded by hand).

## Proposed Change

Six user-visible improvements, all within the wayfinding stage:

1. **The map records its working branch.** Map frontmatter gains a `branch:` field, set at charting time to the branch the effort works from and merges back into. Sessions — especially ones running in linked worktrees or on prototype branches — use it to know where "home" is.
2. **Prototype work is branch-gated.** `hamilton-wayfinder-prototype`, when resolving a map ticket, creates a branch `prototype/<map-name>/<ticket-name>` from the current branch as a gate before building anything. The existing closing rule ("capture to a throwaway branch") becomes redundant for the code — the code is already on its branch — leaving only the answer capture. Standalone (map-less) invocations use `prototype/<question-slug>`.
3. **Charting asks for operation rules.** When creating the map, wayfinder explicitly asks the user for operation rules — standing instructions on how sessions operate, e.g. "always commit after resolving a ticket", "use subagent X for job Y" — and records them in a dedicated **Operation rules** section of the map. The work loop's "load the map" step reads them and every session obeys them.
4. **Prototype dispatch is made model-proof.** The work loop's resolve step becomes imperative per type: a prototype ticket MUST be resolved by invoking `hamilton-wayfinder-prototype` (loading its SKILL.md) before any prototype work begins; acting in the skill's spirit without loading it is a contract violation, stated as an invariant.
5. **The route gets Shipping rules.** `route.md` gains a `## Shipping rules` section between the preamble and `## Units`, written at route-writing time, describing how the units will be shipped: the branch they merge back into (from the map's `branch:` field), commit/PR conventions, and any per-unit shipping constraints — seeded from the map's operation rules where they concern shipping.
6. **Same-session resolution is spelled out.** The one-ticket-per-session budget is clarified: claiming and resolving are one session's work. A ticket claimed this session is resolved this session — a prototype ticket does not get deferred to "the next session" because it was claimed in this one.

## Capabilities

### New

*(none)*

### Modified

- `wayfinder`: the map mechanics contract gains the map-level `branch:` frontmatter field; charting gains the operation-rules question and records the branch; the work loop reads operation rules, dispatches per ticket type imperatively, and resolves a claimed ticket in the claiming session; route writing produces the Shipping rules section.
- `ticket-resolution`: the prototype procedure gains the branch gate (`prototype/<map-name>/<ticket-name>` from the current branch, before any code) and the closing capture is adjusted accordingly; the upstream-fidelity invariant is retired — it governed the initial fork only, and the skill text now evolves freely.
- `artifact-templates`: `wayfinder/map.md` gains the `branch:` frontmatter field and an `Operation rules` section (the "five sections and no sixth" contract becomes six); `wayfinder/route.md` gains the `## Shipping rules` section.

### Removed

*(none)*

## Impact

- `skills/hamilton-wayfinder/SKILL.md` — charting steps, work-loop steps, The route, Map mechanics, process-flow graph.
- `skills/hamilton-wayfinder-prototype/SKILL.md` — new branch gate, adjusted capture rule, process-flow graph.
- `bundle/templates/wayfinder/map.md` and `bundle/templates/wayfinder/route.md` — new frontmatter field and sections (installed copies at `~/.hamilton/templates/wayfinder/` update on next `hamilton setup`).
- `CONTRIBUTING.md` `## Map mechanics` — the contract's second home must gain the `branch` field in the same change, or the two homes drift.
- Canonical specs `wayfinder`, `ticket-resolution`, `artifact-templates` — folded at finish-work from this change's requirement deltas.
- No source-code or test impact expected: `tests/cli/setup.test.ts` exercises template *installation*, not template contents. Existing maps keep working — a map without `branch:` simply predates the field.

## Open Questions

- Should operation rules live in the existing Notes section (which already holds "durable preferences") instead of a new section? This proposal chooses a dedicated section because rules are prescriptive and per-session-checkable, while Notes is orienting context; recorded as an assumption, reversible at approval.
- For a standalone prototype invocation with no map, the branch format `prototype/<map-name>/<ticket-name>` has no map name; the assumed fallback is `prototype/<question-slug>`.

*(Resolved: the upstream byte-fidelity invariant applied only to the initial fork of the ported skills; the owner has confirmed the skill text may now change freely, so this change removes the invariant rather than amending it.)*
