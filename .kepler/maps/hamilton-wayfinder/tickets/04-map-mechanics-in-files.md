---
type: grilling
status: resolved
blocked_by: [01]
---

# Map mechanics in files: claim, block, frontier, resolve

## Question

How do upstream wayfinder's tracker-native mechanics translate into file conventions, and what
exactly goes in the single `## Map mechanics` section that keeps them swappable?

Upstream leans on the tracker for five things Hamilton has no equivalent of:

| Upstream | Provided by | Needs a file answer |
|---|---|---|
| `wayfinder:map` label | tracker labels | how a map file is identified |
| Ticket type (`wayfinder:<type>`) | tracker labels | a `Type:` line? front matter? |
| Claim | issue assignee | a `Status: claimed` line — and who "you" is, solo |
| Blocking | **native** dependency edges | a `Blocked by:` line |
| Frontier | tracker query | a directory scan |

Settle:

- The exact field syntax — loose `Key: value` lines like upstream's local-markdown convention, or
  YAML front matter, which the rest of Hamilton does not use in artifacts but skills do.
- Whether **claiming survives at all.** Upstream claims because concurrent sessions share one
  tracker. A file-based map in one repo may not need it — and if two worktrees hold divergent
  copies, a `Status: claimed` line does not prevent anything. Dropping it is a legitimate answer;
  keeping it needs a reason.
- Open/closed representation — a `Status:` value, moving the file to a `resolved/` directory, or
  something else. It must make "closed" unambiguous, since out-of-scope tickets are *closed* to
  take them off the frontier.
- Where the resolution answer lands: appended under `## Answer` in the ticket, plus the one-line
  gist in the map's Decisions-so-far.
- The **cleared marker on `map.md`**. [Map artifact layout under .hamilton/](01-map-artifact-layout.md)
  decided a cleared map stays in place under `maps/` rather than being deleted or archived, which
  means `map.md` must carry a marker saying so. That it exists is settled; its syntax belongs with
  the other fields here.
- The boundary of the `## Map mechanics` section — precisely what a future tracker backend would
  replace, so the pluggability promise is real rather than aspirational.

Upstream's `issue-tracker-local.md` is prior art for most of this and worth reading first; the
question is which parts of it Hamilton adopts verbatim and which it changes.

## Answer

Maps and tickets use **YAML frontmatter** with three fields: `type`, `status`, and `blocked_by`. Tickets drop claiming; maps use `Status: cleared` when done. The `## Map mechanics` section documents the frontmatter contract so a future tracker backend can swap it in.

### Field syntax: YAML frontmatter

Hamilton already uses YAML frontmatter in skills; map artifacts adopt the same:

```yaml
---
type: grilling
status: open
blocked_by: [01]
---
```

Loose `Key: value` lines (upstream's convention) are only in this map so far, not established elsewhere. YAML gives Hamilton internal consistency: the skill definitions use it, the map definitions now do too.

### Claiming stays

Upstream claims to prevent concurrent sessions from stepping on each other in a shared tracker. File-based maps in git have the same need but different enforcement: git merge conflicts surface collisions. A `Status:` field does not prevent collision, but it signals intent — someone reading `Status: claimed` sees the ticket is being actively worked. Keep it.

But claiming does not change the frontier calculation: a claimed ticket is still open, not unblocked or resolved.

### Status values: open, resolved for tickets; open, cleared for maps

**Tickets:** `Status: open` or `Status: resolved`. Out-of-scope tickets are also `resolved` — closed-ness is unambiguous. No directory separation; one `tickets/` directory. YAML makes status queryable without walking the tree.

**Maps:** `Status: open` or `Status: cleared`. When all frontier tickets are resolved, the map itself closes.

### Map mechanics section: the stable contract

The map file structure — `## Destination`, `## Notes`, `## Decisions so far`, etc. — stays the same across tracker swaps. But the YAML frontmatter (`type`, `status`, `blocked_by`) is tracker-specific. 

A dedicated `## Map mechanics` section documents these three fields, their valid values, and examples:

```markdown
## Map mechanics

This section defines how the tracker represents maps and tickets. A future backend can swap the implementation without changing the rest of the file format.

- `type:` — Ticket type: `grilling`, `research`, `prototype`, `task`
- `status:` — Ticket status: `open`, `resolved`. Maps only: `cleared`
- `blocked_by:` — List of ticket numbers this ticket waits on. Empty list or omit if no blockers
```

This goes into `CONTRIBUTING.md` or a dedicated `MECHANICS.md` in `.hamilton/maps/` so new mappers and future backends both know what they're looking at.

### Consequences

- All existing map and ticket files need a one-time conversion from loose lines to YAML frontmatter
- The `## Map mechanics` section becomes a living spec document, not part of individual tickets
- Claiming is kept but does not affect frontier calculation
- The clearing marker (`Status: cleared`) applies to `map.md` itself, not individual tickets
