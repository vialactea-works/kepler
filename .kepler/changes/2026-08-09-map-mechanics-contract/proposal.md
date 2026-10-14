# Proposal: Convert the map's own files to the mechanics contract

| Field   | Value                                      |
|---------|--------------------------------------------|
| Change  | 2026-08-09-map-mechanics-contract          |
| Status  | approved                                   |
| Author  | agent (hamilton-propose)                   |
| Created | 2026-08-09                                 |

## Why

This map was charted and worked with loose `Key: value` header lines (`Type:`, `Status:`, `Blocked by:`) — the local-markdown convention upstream wayfinder uses. [Ticket 04](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md) settled the contract afterward: YAML frontmatter with `type`, `status`, and `blocked_by`. [Unit 3](../../maps/hamilton-wayfinder/route.md) then landed the templates that fix the shape (`bundle/templates/wayfinder/map.md`, `ticket.md`), and [unit 6](../../maps/hamilton-wayfinder/route.md) shipped the wayfinder skill whose `## Map mechanics` section documents the contract at runtime. The canonical [`wayfinder`](../../specs/wayfinder.md) spec already requires frontmatter. Every map artifact *created* since the contract landed carries frontmatter; this map's own files still do not, because they predate the decision. This is the last unit in the route: dogfooding cleanup that converts `map.md` and all thirteen tickets to the contract the rest of the system already speaks, and gives the `## Map mechanics` contract a written home for contributors and future tracker backends.

One choice [ticket 04](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md) deliberately left open is settled here, not by the implementer: where the `## Map mechanics` contract lives as a contributor-facing reference — `CONTRIBUTING.md` or a dedicated `MECHANICS.md` under `.hamilton/maps/`. The route names this a spec-level question and routes it through propose.

## Goals & Success Criteria

- `map.md`'s loose `Status: shipping` line is replaced by YAML frontmatter (`status: shipping`), matching the `bundle/templates/wayfinder/map.md` shape (which carries `status` only).
- All thirteen `tickets/NN-slug.md` files' loose `Type:` / `Status:` / `Blocked by:` lines are replaced by YAML frontmatter (`type`, `status`, `blocked_by`), matching the `bundle/templates/wayfinder/ticket.md` shape. Each ticket's existing resolved values are preserved; `Blocked by: —` becomes `blocked_by: []`.
- No loose `Type:` / `Status:` / `Blocked by:` header lines remain in `map.md` or any ticket file (verified by grep).
- `route.md` is **not** converted — its `Status:` lines are inline per-unit markers, not header metadata, and the route explicitly scopes it out.
- A `## Map mechanics` section is written to the home propose settles (`CONTRIBUTING.md`), documenting the three frontmatter fields, their valid values, and the boundary a future tracker backend would swap — genuinely isolated so a backend can replace that one section without touching the rest of the file.
- `bun run build` and `bun --bun vitest run` stay green.

## Non-Goals

- **No `route.md` conversion.** The route scopes route.md out of this conversion. Its per-unit `Status:` lines are inline content (one per unit row), not header metadata, and do not fit the frontmatter contract.
- **No `type` field on `map.md`.** The map template (`bundle/templates/wayfinder/map.md`) carries `status` only, and [ticket 04](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md)'s mechanics section defines `type` as a ticket-type field (`research` / `prototype` / `grilling` / `task`). A map's role is determined by its filename (`map.md`), not a frontmatter type. The playbook's coder-dispatch note suggested `type: map`; propose overrules it in favour of the template, which is the shape authority unit 3 landed.
- **No edits to `skills/hamilton-wayfinder/SKILL.md`.** The skill's `## Map mechanics` section (shipped by unit 6) is the agent-facing runtime contract and is out of scope. This unit adds a *contributor-facing* reference; it does not consolidate the two (that would be a separate effort touching the skill).
- **No code, CLI, or test changes.** The conversion touches only markdown map artifacts and `CONTRIBUTING.md`; `src/`, `bundle/templates/`, and `tests/` are untouched. (The templates already fix the target shape; this unit converts existing files *to* it, not the templates themselves.)
- **No tracker backend.** Map-mechanics pluggability stays aspirational; this unit only documents the swap boundary so a future backend knows what to replace.

## Proposed Change

**`map.md`** — the loose `Status: shipping` line (line 3) is replaced by a YAML frontmatter block at the very top of the file:

```yaml
---
status: shipping
---
```

The `# Fork wayfinder into Hamilton` heading and everything below it are unchanged. (The status flips to `shipped` at finish-work, since this is the last unit.)

**Thirteen `tickets/NN-slug.md` files** — each file's loose `Type:` / `Status:` / `Blocked by:` block (lines 3–5 of each) is replaced by a YAML frontmatter block at the very top:

```yaml
---
type: grilling
status: resolved
blocked_by: [01]
---
```

`blocked_by` is a YAML list. `Blocked by: —` becomes `blocked_by: []`. Multi-blocker tickets (e.g. ticket 13's `Blocked by: 01, 04, 06, 09`) become `blocked_by: [01, 04, 06, 09]`. Each ticket's `type` and `status` values are preserved as-is (all thirteen are `resolved`; types vary per ticket).

**`CONTRIBUTING.md`** — a `## Map mechanics` section is added, documenting the frontmatter contract (the three fields, valid values, and the swap boundary) as the contributor-facing reference. This is the home propose settles; see design for the reasoning and the rejected alternative (`MECHANICS.md` under `.hamilton/maps/`).

## Capabilities

### New

None.

### Modified

- `wayfinder`: the `## Map mechanics` contract gains a contributor-facing written home in `CONTRIBUTING.md` (a self-contained `## Map mechanics` section), complementing the agent-facing section in the wayfinder skill. This map's own artifacts — `map.md` and the thirteen ticket files — are converted to the YAML frontmatter the contract already requires, bringing them into conformance with the canonical spec.

### Removed

None.

## Impact

Fourteen markdown map artifacts are edited (frontmatter conversion, bodies unchanged) and one markdown doc (`CONTRIBUTING.md`) gains a section. No code, no CLI, no templates, no tests. `bun run build` type-checks TypeScript (unaffected); `bun --bun vitest run` covers bundled templates and guidelines (unaffected — the templates are not edited, only existing map files are converted to match them). The change is verified by grep (no loose header lines remain), by reading the converted files and the new CONTRIBUTING.md section end-to-end, and by confirming the diff touches only the fifteen files in scope.

## Open Questions

None. [Ticket 04](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md) fixes the frontmatter contract (fields, valid values, claiming, the mechanics-section boundary). [Ticket 06](../../maps/hamilton-wayfinder/tickets/06-route-shape-and-sdd-join.md) supersedes ticket 04's map status values with the three-stage `cleared` / `shipping` / `shipped` lifecycle. The templates (unit 3) fix the target shape. The one open choice — the home for the contributor-facing contract — is settled in the design: `CONTRIBUTING.md`, with reasoning. Running unattended, the assumptions above are recorded as decisions in the design.
