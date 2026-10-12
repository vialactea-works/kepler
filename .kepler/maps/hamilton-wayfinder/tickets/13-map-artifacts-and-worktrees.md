---
type: grilling
status: resolved
blocked_by: [01, 04, 06, 09]
---

# Where map artifacts live relative to per-unit worktrees

## Question

`hamilton-propose` builds each change in its own worktree on its own branch. A map is long-lived and
spans many such changes. When unit N is built on branch `unit-n`, where does the route.md status flip
get committed?

The tension is concrete. [route.md shape and the SDD join](06-route-shape-and-sdd-join.md) gave
`route.md` a per-unit status (`pending` → `in-progress` → `shipped`) and the map a lifecycle
(`cleared` → `shipping` → `shipped`). [Boundary with hamilton-propose and hamilton-critique](09-boundary-with-propose-and-critique.md)
has propose read `route.md` to find the next pending unit. But propose's step 1 creates a worktree at
`.worktrees/<title>` and **hard-gates** on `git rev-parse --show-toplevel` ending in that path before
writing anything — precisely so no artifact lands on the default branch by accident.

So the shared planning artifact is read and written by sessions that are structurally forbidden from
touching anything outside their own worktree.

Settle:

- Does the status flip ride the unit's branch, or does `route.md` move only on the default branch?
- What happens to `route.md` on the default branch between merges?
- Does the map's own `cleared` / `shipping` / `shipped` transition follow the same rule?

## Answer

**The status flip rides the unit's own branch and lands on the default branch when the unit merges.
`.hamilton/maps/` is ordinary repo content and follows the same branching rules as everything else —
no exception, no special case, no second home for planning state.**

### Why the unit's branch

Three things carry it.

**It keeps the claim honest.** Marking a unit `shipped` in the same diff that ships it means
`route.md` on the default branch never claims `shipped` for something that isn't on the default
branch. Status and reality merge atomically because they merge together.

**It preserves propose's worktree gate.** The alternative — committing status to the default branch
from inside a worktree session — is exactly the failure `hamilton-propose` step 1 exists to prevent.
Carving out an exception for `route.md` would mean the one artifact allowed to escape the worktree is
the one tracking whether the worktree's work is done.

**It is already how this works.** This map was charted and worked across worktrees on non-default
branches, and its ticket resolutions merged the ordinary way. The convention is being followed before
it was written down.

### Staleness between merges

Accepted, with eyes open. Between merges, `route.md` on the default branch lags: two concurrent units
each read the other as `pending`.

This is the same staleness [Map mechanics in files](04-map-mechanics-in-files.md) already accepted for
claiming — the mechanic signals intent, it does not prevent collision. A file-native map in a
distributed VCS cannot offer stronger consistency without a coordination point outside the repo, which
charting ruled out.

Merge conflicts are bounded: one status word per unit, on distinct rows of the units table. Two units
shipping concurrently conflict only if their rows are adjacent, and the resolution is to keep both.

### The map's own lifecycle

Same rule. `cleared` is written by the session that composes `route.md`, on that session's branch.
`shipping` and `shipped` ride whichever unit's branch triggers the transition — `shipped` lands with
the final unit, so the map declares itself done in the same merge that makes it true.

### What this constrains downstream

`skills/hamilton-wayfinder/SKILL.md` states the rule in its `## Map mechanics` section: map artifacts
are repo content, versioned and branched like source. The wayfinder-side of
[Boundary with hamilton-propose and hamilton-critique](09-boundary-with-propose-and-critique.md) —
propose reading `route.md` for the next pending unit — reads it from the branch it was started on, and
propose does not need to reach for the default branch's copy.
