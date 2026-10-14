---
type: grilling
status: resolved
blocked_by: []
---

# Map artifact layout under .hamilton/

## Question

Where do maps and their tickets live under `.hamilton/`, and what is the file and directory
naming convention?

Hamilton's existing artifacts are per-change and ephemeral (`.hamilton/changes/<YYYY-MM-DD-title>/`)
or durable and per-capability (`.hamilton/specs/<capability>.md`). A map is neither: it spans
multiple changes, outlives any one of them, and dies when its destination is reached.

Settle:

- The directory — `.hamilton/maps/<effort>/` (this map's provisional guess), something under
  `changes/`, or a third shape.
- Effort slug convention — dated like changes (`2026-08-04-title`) or undated (`hamilton-wayfinder`)?
  Changes are dated because they are ephemeral; maps are longer-lived.
- Ticket files — one file per ticket in a `tickets/` subdirectory, numbered from `01`, matching
  upstream's local-markdown convention? Or a different split?
- What lives in the map body versus the ticket body, given Hamilton's "map is an index, not a
  store" inheritance.
- Whether `hamilton-init` scaffolds the map directory the way it scaffolds `specs/` and `changes/`.
- What happens to a map when its destination is reached — deleted, archived, folded into `specs/`?

Resolving this may relocate this very map. That is expected.

## Answer

Maps are a third kind of artifact under `.hamilton/`, with their own top-level directory:

```
.hamilton/
  specs/                          # unchanged — durable, per-capability
  changes/                        # unchanged — ephemeral, dated
  maps/                           # new third sibling
    <effort>/                     # undated slug, e.g. hamilton-wayfinder/
      map.md                      # five upstream sections verbatim
      route.md                    # appears when the map clears
      tickets/
        NN-slug.md                # one file per ticket
```

### The directory

`.hamilton/maps/` sits alongside `specs/` and `changes/` rather than inside either. A map spans
several changes and outlives all of them, so it is not ephemeral-per-change; it dies when its
destination is reached and is full of open questions, so it is not durable-per-capability. Forcing
it into `changes/` would claim it is one unit of work when it produces several, and `finish-work`'s
semantics for a change directory do not apply to it. Forcing it into `specs/` would put delta-laden
work tracking into a directory defined as "no delta markers, current behavior".

### The effort slug

Undated — `maps/hamilton-wayfinder/`, not `maps/2026-08-04-hamilton-wayfinder/`. The effort name is
the identity, the way a capability name is in `specs/`. Changes are dated because they are ephemeral
and numerous; a map is typed into prompts and linked from tickets across many sessions, and a date
prefix is noise on every reference. The cost accepted: no chronological sort, and two similarly named
efforts could collide.

### Ticket files

One file per ticket at `tickets/NN-slug.md`, numbered from `01` — upstream's local-markdown
convention adopted as-is. One file is one agent session's working target, so a session opens exactly
what it claims. Numbers give stable identity and reading order; slugs make links legible; the
frontier is a single `grep` across the directory.

Rejected: a single `tickets.md` with one section per ticket (two concurrent sessions editing
different tickets would collide on one file, which is exactly what claiming exists to prevent, and
resolution answers bloat it fast); and `tickets/open/` + `tickets/resolved/` with the file moved on
close (renaming breaks every inbound link and turns a one-line status diff into git churn).

### Assets

There is no asset directory. A map directory holds `map.md`, `tickets/` and `route.md`, nothing else.
Assets produced while resolving a ticket go inline under the ticket's answer, or wherever the
producing skill already puts them.

This deliberately does **not** close upstream's gap: `research` says to save findings "where the repo
already keeps such notes" and names no fallback. With no asset directory here, the ported skill has
to answer that itself — handed to
[Which siblings to port, and their Hamilton shape](07-which-siblings-to-port.md).

`route.md` sits at the map root. Its *shape* remains with
[Route shape and the SDD join](06-route-shape-and-sdd-join.md); only its location is fixed here.

### hamilton-init

`hamilton-init` does **not** scaffold `maps/`. The wayfinder skill creates the directory on first
chart. `hamilton-init` is step 0 of the SDD pipeline and wayfinder sits outside that loop by design,
so coupling them would drag an optional pre-loop skill into the loop's setup step and give every
project a `maps/` directory whether or not it ever wayfinds. (Empty scaffolded directories do not
survive a clone anyway — already true of `specs/` and `changes/`.)

The cost accepted: `.hamilton/`'s full shape is no longer described by a single skill.

### A cleared map

Stays in place under `maps/`, with its status flipped to cleared. No archive directory, no deletion.
Zero new mechanism, and the decision rationale stays readable next to the route it produced —
`specs/` will not carry it, since map decisions are mostly about the effort rather than a capability.
Reversible: if `maps/` ever gets crowded, a later effort can add archiving.

This requires `map.md` to carry a cleared marker. That the marker exists is decided here; its syntax
belongs with the other fields in
[Map mechanics in files](04-map-mechanics-in-files.md).

### Map body versus ticket body

The map body keeps upstream's five sections verbatim — Destination, Notes, Decisions so far, Not yet
specified, Out of scope. The fork's premise is relocation, not redesign, and these five held up
through a full charting session plus two resolutions without friction.

`route.md` is linked from **Destination** once it exists, rather than getting a sixth section: the
route is the destination made concrete, and a dedicated section would sit empty for nearly the whole
life of the map.

### Consequences

- **No relocation.** This map already sits at `.hamilton/maps/hamilton-wayfinder/` with an undated
  slug and `tickets/NN-slug.md`. The provisional guess is now the convention; nothing moves.
- The fog patch **"Existing skills' awareness"** is half-cleared. The `hamilton-init` half is
  decided; whether `hamilton-propose` should mention an upstream map remains fog.
