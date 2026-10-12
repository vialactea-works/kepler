# Design: Convert the map's own files to the mechanics contract

## Context

This map was charted and worked with loose `Key: value` header lines — upstream wayfinder's local-markdown convention. [Ticket 04](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md) then settled the contract: YAML frontmatter with `type`, `status`, and `blocked_by`. [Unit 3](../../maps/hamilton-wayfinder/route.md) landed the templates that fix the shape (`bundle/templates/wayfinder/map.md` carries `status` only; `ticket.md` carries `type` / `status` / `blocked_by`). [Unit 6](../../maps/hamilton-wayfinder/route.md) shipped the wayfinder skill, whose `## Map mechanics` section documents the contract at runtime. The canonical [`wayfinder`](../../specs/wayfinder.md) spec already requires frontmatter (its `### Map mechanics` table lists the fields and valid values).

So the contract is already decided and already documented in three places (the templates, the skill, the spec). What remains is dogfooding: this map's own files still carry loose lines because they predate the decision, and [ticket 04](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md) left one choice open — where the contract lives as a *contributor-facing* reference. That is the spec-level question propose settles here.

This is a mechanical, docs-and-markdown change. The design is sized to that — it fixes the one open choice with reasoning, names the conversion rules the coder follows verbatim, and does not invent structure the change does not need.

## Goals / Non-Goals

**Goals**

- Convert `map.md` (loose `Status:` → frontmatter `status:`) and all thirteen tickets (loose `Type:` / `Status:` / `Blocked by:` → frontmatter `type` / `status` / `blocked_by`), preserving existing values.
- Give the `## Map mechanics` contract a contributor-facing written home, settled by propose.
- Leave `route.md` untouched (out of scope per the route).

**Non-Goals**

- Add a `type` field to `map.md` (the template has `status` only; `type` is a ticket-type field).
- Edit `skills/hamilton-wayfinder/SKILL.md` (the agent-facing section is out of scope).
- Consolidate the contributor-facing and agent-facing contract homes (separate effort).
- Convert `route.md` or touch any code, CLI, template, or test.

## Approaches considered

### Approach A (recommended): `CONTRIBUTING.md` as the home

Add a self-contained `## Map mechanics` section to `CONTRIBUTING.md`, documenting the three frontmatter fields, valid values, and the swap boundary. Convert `map.md` and the thirteen tickets to frontmatter per the templates.

- **Trade-off:** the contract then lives in two places — the agent-facing `## Map mechanics` section in the wayfinder skill (unit 6) and the contributor-facing section in `CONTRIBUTING.md`. They can drift. This is accepted: the two serve different audiences (agent runtime vs human contributor), and consolidating them would mean editing the skill, which is out of scope. A cross-reference mitigates the drift risk.
- **Why recommended:** `CONTRIBUTING.md` is the repo's convention home — it already hosts the Documentation Conventions and Licensing and attribution sections, so a Map mechanics section joins an established pattern. It is discoverable: a contributor or future-backend implementer reads it. And `.hamilton/maps/` holds effort directories (`<effort>/map.md`, `route.md`, `tickets/`), not reference docs — a `MECHANICS.md` there would muddy the layout [ticket 01](../../maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md) settled.

### Approach B: a dedicated `MECHANICS.md` under `.hamilton/maps/`

Create `.hamilton/maps/MECHANICS.md` holding the contract. Convert the files as in A.

- **Trade-off:** maximally isolated — the whole file is the contract, so a backend swap is a file replacement. But it is buried: a contributor would find it only by browsing `.hamilton/maps/`. And it sits alongside effort directories, mixing reference docs with map data, which contradicts the clean layout ticket 01 specified (`.hamilton/maps/<effort>/` holding `map.md`, `route.md`, `tickets/`).
- **Why rejected:** discoverability and layout purity both lose. The isolation gain (whole-file swap) is real but marginal — a self-contained section in `CONTRIBUTING.md` is equally swappable in practice, and the review step confirms the section is genuinely isolated.

### Approach C: the skill's `## Map mechanics` section is already the home; add nothing

Declare the existing section in `skills/hamilton-wayfinder/SKILL.md` sufficient. Convert only the files.

- **Trade-off:** no duplication, no drift. But [ticket 04](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md) explicitly asked for a home "so new mappers and future backends both know what they're looking at" — a human reading `CONTRIBUTING.md` does not think to open a `SKILL.md` inside `skills/`. And the route unit 10 description, written *after* unit 6 shipped, knowingly asks for a written home despite the skill section existing.
- **Why rejected:** the route and ticket 04 both ask for it. The skill section is agent-facing (loaded at runtime by the agent running wayfinder); a contributor or backend implementer is a different reader.

**Chosen: Approach A.** The contract gains a contributor-facing home in `CONTRIBUTING.md`; the skill section stays as the agent-facing runtime contract.

## Decisions

### Decision: `CONTRIBUTING.md` is the home; no `MECHANICS.md`

- Choice: a `## Map mechanics` section is added to `CONTRIBUTING.md`.
- Alternatives considered: Approach B (`MECHANICS.md` under `.hamilton/maps/`) — rejected on discoverability and layout-purity grounds (see above). Approach C (skill-only) — rejected because the route and ticket 04 both ask for a contributor-facing home.
- Rationale: `CONTRIBUTING.md` is where a contributor looks for repo conventions. It already hosts convention sections. A self-contained `## Map mechanics` section is genuinely isolated (the review confirms it references nothing else in the file and nothing else references it), so the swap promise holds. `.hamilton/maps/` stays a directory of effort directories, not reference docs.

### Decision: `map.md` carries `status` only, no `type`

- Choice: `map.md`'s frontmatter is `status: shipping` — a single field, matching `bundle/templates/wayfinder/map.md`.
- Alternatives considered: (1) `type: map` alongside `status` — the playbook's coder-dispatch note suggested this. Rejected: the map template (unit 3, the shape authority) carries `status` only, and [ticket 04](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md)'s mechanics section defines `type` as a ticket-type field (`research` / `prototype` / `grilling` / `task`). The route says this unit "should follow the templates that fix the shape it converts to." A map's role is determined by its filename (`map.md`), not a frontmatter type. (2) `type` and `blocked_by` on `map.md` — rejected for the same reason; maps have no type and no blockers.
- Rationale: the template is the shape authority. Propose follows it rather than the coder-dispatch suggestion, which is exactly the spec-level settlement the route asks propose to make.

### Decision: `blocked_by` as a YAML list, `—` becomes `[]`

- Choice: `blocked_by` is a YAML list in every ticket — `[]` for no blockers (`Blocked by: —`), `[01]` for one, `[01, 04, 06, 09]` for several.
- Alternatives considered: (1) a comma-separated string (`blocked_by: "01, 04"`) — rejected; the ticket template uses `blocked_by: []` (list syntax), and [ticket 04](../../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md)'s example uses `blocked_by: [01]`. (2) Omit `blocked_by` when empty — rejected; the template includes the field as `[]`, so preserving it keeps every ticket's frontmatter shape identical and queryable.
- Rationale: match the template exactly. A list is the natural YAML representation of "ticket numbers this ticket waits on," and keeping the field present (even when empty) makes the frontmatter shape uniform across all thirteen tickets.

### Decision: `route.md` excluded from the conversion

- Choice: `route.md` is not converted. Its loose top-level `Status:` line and per-unit `Status:` lines stay as-is.
- Alternatives considered: (1) convert route.md's top-level `Status:` to frontmatter — rejected; the route explicitly scopes route.md out. (2) Convert the per-unit `Status:` lines too — rejected; they are inline content (one per unit row in the body), not header metadata, and frontmatter is a single block at the top of a file. Converting inline markers to frontmatter is not possible without restructuring the file.
- Rationale: the route and ticket 04's contract both concern maps and tickets. `route.md`'s status lines are a different kind of marker — inline, per-unit, in the body — and the route knowingly excludes them.

## Architecture

The change touches fifteen markdown files; no structural architecture is introduced or modified.

**`map.md`** — a YAML frontmatter block is inserted at the very top (before the `#` heading), and the loose `Status: shipping` line (currently line 3) is removed. The frontmatter carries `status: shipping` only:

```yaml
---
status: shipping
---
```

**Thirteen `tickets/NN-slug.md` files** — for each, a YAML frontmatter block is inserted at the very top (before the `#` heading), and the loose `Type:` / `Status:` / `Blocked by:` lines (currently lines 3–5) are removed. The frontmatter carries the ticket's preserved values. Example (ticket 04):

```yaml
---
type: grilling
status: resolved
blocked_by: [01]
---
```

The ticket's `## Question` heading and body below are unchanged. Each ticket's existing values are mapped:

| loose line | frontmatter |
|---|---|
| `Type: grilling` | `type: grilling` |
| `Status: resolved` | `status: resolved` |
| `Blocked by: 01` | `blocked_by: [01]` |
| `Blocked by: 01, 04, 06, 09` | `blocked_by: [01, 04, 06, 09]` |
| `Blocked by: —` | `blocked_by: []` |

**`CONTRIBUTING.md`** — a `## Map mechanics` section is added after the existing `## Licensing and attribution` section (the natural position: both are convention sections; Map mechanics follows licensing so the doc flows from contribution rules → licensing → artifact mechanics). The section documents the three fields, valid values, and the swap boundary, and is self-contained — it references no other `CONTRIBUTING.md` content.

## Testing strategy

No automated tests. The change is verified by:

- **Grep for loose lines:** `rg -n '^Type:|^Status:|^Blocked by:' .hamilton/maps/hamilton-wayfinder/map.md .hamilton/maps/hamilton-wayfinder/tickets/*.md` returns nothing after the conversion (every loose header line is gone).
- **Grep for frontmatter presence:** every converted file begins with `---`.
- **Read the converted files end-to-end:** confirm each ticket's `type` / `status` / `blocked_by` values match its pre-conversion loose lines, and that bodies are unchanged.
- **Read the `CONTRIBUTING.md` section:** confirm it documents all three fields, valid values, and the swap boundary, and is genuinely isolated (no cross-references to other `CONTRIBUTING.md` content).
- **Inspect `git diff --name-only`:** confirm only the fifteen in-scope files appear (`map.md`, thirteen tickets, `CONTRIBUTING.md`).
- **Run `bun run build` and `bun --bun vitest run`:** confirm both stay green (no code or test regression).

## Risks / Trade-offs

- **Two homes for the contract (DRY).** After this unit, the `## Map mechanics` contract lives in both the wayfinder skill (agent-facing, unit 6) and `CONTRIBUTING.md` (contributor-facing, this unit). They can drift if one is updated without the other. **Mitigation:** the `CONTRIBUTING.md` section is the concise reference (fields, values, swap boundary); the skill section is the fuller agent instructions. They serve different audiences and are not a copy. Consolidating them — making the skill point at `CONTRIBUTING.md` as the single source — is a deliberate future effort that touches the skill, which is out of scope here. The risk is accepted because the route and ticket 04 both ask for the contributor-facing home.
- **Spec table says "comma-separated ticket slugs" for `blocked_by`.** The canonical [`wayfinder`](../../specs/wayfinder.md) spec's Map mechanics table describes `blocked_by` as "comma-separated ticket slugs," while the template and this conversion use YAML list syntax (`[01, 04]`). These are not in conflict — a YAML list is the structured form of "comma-separated values" — but finish-work should reconcile the wording if it reads as a mismatch. **Mitigation:** the conversion follows the template (the shape authority), and the `CONTRIBUTING.md` section will state `blocked_by` as a YAML list explicitly.
- **`map.md` status flips twice.** This unit sets `status: shipping` (the current reality). The finish-work task (last unit) flips it to `shipped` in the same diff that merges the unit. The intermediate `shipping` value is correct at propose/code/review time and is not a defect.

## Quality Lens

Mechanical, markdown-and-docs change — no units, boundaries, or dependencies introduced. The code-quality rubric ("scale scrutiny to the change; a mechanical or one-file change trips few of these") applies at minimum. The one structural concern is DRY (the contract in two homes), which is accepted and recorded under Risks / Trade-offs with a clear mitigation and a named future effort. No gate failure.
