# Contributing to Kepler

## Documentation Conventions

When making changes to Kepler's own codebase, keep the documentation in `docs/`
synchronized. Every code change that affects user-facing behavior, APIs, configuration,
or CLI commands must include corresponding documentation updates.

### Mapping Code to Docs

| Code change area | Doc to update |
| ------------------ | --------------- |
| New/changed CLI command, flag, or argument | `docs/skills.md` (setup reference) |
| New/changed artifact template in `bundle/templates/` | `docs/sdd-framework.md` |
| New/changed Assisted-mode skill in `skills/kepler-*/` | `docs/skills.md` |
| New/changed wayfinder artifact template in `bundle/templates/wayfinder/` | `docs/skills.md` |
| New/changed map artifacts in `.kepler/maps/` | `docs/skills.md` |
| New/changed guideline in `bundle/guidelines/` | `docs/tutorials/custom-guidelines.md` |
| Changes to what `kepler setup` installs | `docs/modes.md` or `README.md` |

### Rules

1. **Documentation is not optional.** A code change is incomplete until the relevant docs are updated.
2. **Match the real behavior.** Documentation must reflect the actual code, not aspirations.
3. **Use the existing format.** Tables, code blocks, and section structures in each doc file are consistent -- follow them.
4. **Update the README.** If a change affects the quick-start flow or what the CLI does, update `README.md`.
5. **No stale content.** When deprecating or removing a feature, remove its documentation in the same changeset. Do not leave `(deprecated)` notes -- cut cleanly.

## Licensing and attribution

Kepler is licensed under the Apache License 2.0. When a skill directory is forked from another project, the skill directory — not the repo — is what users install. This means the upstream licence notice must travel inside the skill directory itself. Every forked skill directory therefore ships a sibling `NOTICE` file as the sole carrier of upstream attribution. The `SKILL.md` body carries no provenance or attribution text at all — it is a context cost paid on every skill load.

The licence text must appear in the sibling `NOTICE` rather than in `references/`, which in this repo is content the agent reads into context on every invocation.

### Per-skill NOTICE template

When forking a skill, create a `NOTICE` file in the skill directory by copying the template below, substituting the upstream skill and project names, and placing it at `skills/<skill>/NOTICE`:

```
This skill is adapted from the "<upstream skill name>" skill in
<upstream project> (<upstream project URL>), used under the MIT License.
Modifications and additions are Copyright 2026 Caio Ferreira, licensed
under the Apache License, Version 2.0.

Original work:

  MIT License
  
  Copyright (c) 2026 Matt Pocock
  
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:
  
  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.
  
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
```

## Map mechanics

This section is the file-native frontmatter contract for map artifacts under `.kepler/maps/`. It is the swappable surface a future tracker backend replaces: the backend swaps this section together with the `## Map mechanics` section in `skills/kepler-wayfinder/SKILL.md`, and no other content in this file needs to change.

| Frontmatter field | Valid values |
| ------------------- | -------------- |
| `type` (ticket) | `research` / `prototype` / `grilling` / `task` |
| `status` (ticket) | `open` / `claimed` / `resolved` |
| `status` (map) | `open` / `cleared` / `shipping` / `shipped` |
| `branch` (map) | the branch the effort works from and merges back into, set at map creation |
| `blocked_by` | YAML list of ticket numbers: `[]` for none, `[01]` for one, `[01, 04, 06, 09]` for several |

Ticket frontmatter is `type`, `status`, `blocked_by`, in that order. `map.md` carries `status` then `branch`, in that order — no `type` — matching the map template. A map created before the `branch` field existed falls back to the repository's default branch as its merge-back target. The map lifecycle is `cleared` → `shipping` → `shipped` once the route is written (ticket 06's three-stage lifecycle, superseding ticket 04's `open`/`cleared` for maps).

The route is Wayfinder's compiled destination-and-path handoff. Its stable synthesized body contains five sections — Point of departure, Destination, Path chosen, Shipping rules, and Units. Frontmatter owns mutable route status plus each unit's identity, lifecycle status, dependencies, and backing tickets; downstream processes update that metadata without rewriting the synthesized body. Wayfinder clears fog, propose and plan turn units into implementation artifacts, and code and finish-work build and ship them.
