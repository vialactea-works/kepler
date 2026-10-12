---
type: grilling
status: resolved
blocked_by: [01]
---

# Template convention: inline vs bundle/templates/

## Question

Do the map, ticket and route artifact shapes become Hamilton templates in `bundle/templates/`, or
stay embedded in `hamilton-wayfinder/SKILL.md` the way upstream embeds them?

The two conventions genuinely conflict. `docs/sdd-framework.md` states: "Templates are global. The
canonical set lives in the repository's `bundle/templates/` and is copied to `~/.hamilton/templates/`
by the `hamilton setup` command. Every step reads the installed copy, so there is one definition of
each artifact's shape." Upstream wayfinder instead carries its map and ticket bodies inline, which
is what makes it self-contained and installable anywhere.

Settle:

- Inline, templated, or split (map templated because it is long-lived; tickets inline because they
  are one heading)?
- If templated: which files — `map.md`, `ticket.md`, `route.md`? And does a user who installed the
  skill but never ran `hamilton setup` get a broken skill? That is a new failure mode for a stage
  that runs *before* `hamilton-init`.
- If inline: is the divergence from the stated convention acknowledged in the docs, or does the
  convention itself get amended to "per-change artifacts are templated; planning artifacts are not"?
- Knock-on effects to name for the fog: `tests/cli/setup.test.ts` asserts what `hamilton setup`
  installs, and `CONTRIBUTING.md` maps `bundle/templates/` changes to `docs/sdd-framework.md`.

## Answer

**All three shapes — `map.md`, `ticket.md`, `route.md` — go into `bundle/templates/wayfinder/`.** Wayfinder depends on `hamilton setup` having been run first.

### Template over inline

The decision hinges on when templates are available. Pre-SDD describes the stage in the workflow, not the project lifecycle — a user runs `hamilton setup` to initialize the project, then uses wayfinder to plan. Upstream wayfinder embeds templates inline to be completely self-contained, but Hamilton's architecture standardizes on `bundle/templates/` as the single source of truth for artifact shapes.

Choosing templating keeps wayfinder consistent with the rest of Hamilton. The tradeoff (dependency on `hamilton setup`) is acceptable because it's the normal project setup order anyway. Users who try to run wayfinder before setup will hit a clear error pointing them to `hamilton setup` — documentation is sufficient; no guard is needed in the code.

### Which shapes are templated

All three:

- **`map.md`** — the long-lived container for the entire effort's decisions. Templating ensures consistent structure across different planning efforts.
- **`ticket.md`** — the decision ticket body. Minimal, but templating keeps shape consistent.
- **`route.md`** — the output of resolved decisions, bridging to the SDD loop. Templated for consistency.

### Knock-on effects

Two areas of Hamilton change:

1. **`tests/cli/setup.test.ts`** — currently verifies what `hamilton setup` installs. The test suite gains assertions for wayfinder's three templates so regressions are caught.

2. **`CONTRIBUTING.md`** — currently maps changes to `bundle/templates/` entries to updates in `docs/sdd-framework.md`. A row is added mapping template changes for wayfinder.

Both updates ride in the "land the artifact templates" route unit rather than earning separate tickets.

Note the ordering problem either way: this stage precedes `hamilton-init`, so it cannot assume the
project has been initialised.
