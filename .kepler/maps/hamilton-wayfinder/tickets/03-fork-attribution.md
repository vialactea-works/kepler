---
type: grilling
status: resolved
blocked_by: []
---

# Fork attribution and licensing

## Question

How does Hamilton credit the upstream skills it forks, and where does that credit live?

Established facts: [mattpocock/skills](https://github.com/mattpocock/skills) is MIT licensed and
its README explicitly invites copying and adapting. MIT requires the copyright notice and licence
text to travel with substantial portions of the work — so the question is form and placement, not
permission.

Settle:

- Does Hamilton carry a `NOTICE`/`THIRD-PARTY.md`, an attribution line in each forked `SKILL.md`,
  a credit in `README.md`, or some combination?
- Hamilton's own licence — check what `package.json` and the repo declare, and whether it is
  MIT-compatible.
- `docs/sdd-framework.md` already has an **Inspirations** section crediting OpenSpec, Superpowers,
  Spec Kit and others in prose. Is a fork materially different from an inspiration, and does it
  belong in that section or somewhere more formal?
- Whether this applies once (a repo-level notice) or per forked skill.

Small ticket. It blocks nothing structurally, but the answer has to exist before anything ships.

## Answer

Hamilton adopts **Apache 2.0**. Upstream credit is **formal, not prose**, and lands at two levels —
repo root and inside each forked skill directory.

```
LICENSE                              # Apache 2.0, full text
NOTICE                               # Apache §4(d) — one entry per forked upstream
skills/hamilton-wayfinder/
  SKILL.md                           # one-line "adapted from …, see NOTICE"
  NOTICE                             # Matt Pocock's copyright + full MIT permission text
```

### Hamilton had no licence at all

The starting fact, and it reframed the ticket: there is **no `LICENSE` file, no `license` field in
`package.json` (`"private": true`), and no licence statement anywhere** — the only match for
"licence" in the repo outside this ticket is an unrelated line in a TypeScript guideline. Hamilton is
publicly distributed (`install.sh` curls from `raw.githubusercontent.com`, the README instructs
`npx skills add`) while granting recipients nothing.

So the fork did not create this problem, but it makes it acute: shipping an unlicensed repo that
redistributes someone else's MIT-licensed text is incoherent in both directions. Settling Hamilton's
own licence here rather than deferring it was therefore in scope.

### Hamilton's licence: Apache 2.0

MIT → Apache 2.0 is one-way compatible, and this is the permitted direction: MIT-licensed text may be
incorporated into an Apache-2.0 work provided the MIT copyright and permission notice travel with the
portions derived from it. Upstream's file stays MIT; the combined work ships under Apache 2.0.

Chosen over MIT because this effort specifically needs an **attribution surface**, and Apache ships
one with a defined, must-be-propagated meaning:

- **§4(d) `NOTICE`** — a standardised home for third-party credit, rather than a bespoke
  `THIRD-PARTY.md` whose conventions would have to be invented and explained.
- **§4(b) change notices** — "state that You changed the files" maps precisely onto a forked
  `SKILL.md`, which is exactly the artifact this fork produces.
- **§3 patent grant** with retaliation termination; **§6** trademark disclaimer. MIT is silent on both.

Costs accepted: ~200 lines of `LICENSE` in a mostly-markdown repo, and GPLv2 incompatibility
(GPLv3 is fine) — which only bites if someone vendors Hamilton into a GPLv2 project.

One precision worth recording: §4(b) and §4(d) bind derivatives of *Apache-licensed* material.
Upstream is MIT, so Apache's machinery does not legally compel anything here — MIT's own terms do.
Adopting Apache means adopting `NOTICE` as the **convention** for that credit.

### Credit lives at both levels, with different jobs

The decisive fact is that **the unit of distribution is the skill directory, not the repo**.
`AGENTS.md` says skills install via `npx skills add`; `docs/skills.md` says there is no install
command at all and the skills are "plain Markdown, portable across any agent that can load a
`SKILL.md`". Every skill directory is `SKILL.md` + optional `references/`, and `bundle/` carries only
templates and guidelines — no skills. A forked `SKILL.md` therefore lands on a user's machine fully
detached from the repo root, and a root-level `NOTICE` never follows it. MIT's requirement attaches
to "all copies or substantial portions"; that copy is one.

| Location | Content | Job |
|---|---|---|
| `LICENSE` | Apache 2.0 full text | Hamilton's own grant |
| `NOTICE` | one entry per forked upstream | the repo-as-distributed; aggregate view |
| `skills/<forked>/NOTICE` | upstream copyright + full MIT text | travels with the detached copy — **this is what discharges MIT** |
| `skills/<forked>/SKILL.md` | one line: adapted from upstream, MIT, see `NOTICE` | human- and agent-visible; satisfies §4(b) |

**A sibling `NOTICE`, not `references/upstream-license.md`.** In this repo `references/` means
*content the agent is expected to read* — `code-quality.md`, `spec-altitude.md`, `reviewer-prompt.md`.
A licence is not that, and filing it there puts legal text in the agent's reading path.

**The full MIT text is not inside `SKILL.md`.** A skill body enters context on every invocation, so a
licence block there is a permanent context tax on every session. The one-line pointer costs nothing;
the text sits next door.

Rejected: **repo-root `NOTICE` only**, accepting that detached copies shed the notice. Common in
practice, and upstream's README explicitly invites copying so the practical risk is near zero — but
it is knowingly deficient, and the second file is cheap.

**This is a rule, not a one-off.** Every forked skill gets its own `NOTICE` by the same reasoning,
because each travels independently. Whichever siblings survive
[Which siblings to port, and their Hamilton shape](07-which-siblings-to-port.md) inherit it.

### Not the Inspirations section

`docs/sdd-framework.md`'s **Inspirations** section stays untouched. Two independent reasons:

- **Different kind of debt.** Inspirations credits ideas absorbed and re-expressed in Hamilton's own
  words — the section's own framing is "The framework is a synthesis, not an invention." No legal
  obligation attaches. A fork is copied text under someone else's terms. Listing it as a sixth bullet
  beside "IEEE 830 and 29148, taken in spirit" would blur that distinction, and would imply the other
  five entries carry legal weight they do not.
- **Wrong document.** `docs/sdd-framework.md` describes the SDD pipeline; wayfinder is explicitly the
  pre-SDD stage. It is not an inspiration *for the SDD framework* under any reading.

The real cost: provenance becomes invisible in the narrative docs, discoverable only by opening
`NOTICE`. That gap is handed to
[How the framework docs present the pre-SDD stage](10-framework-docs-presentation.md) rather than
patched here — this ticket settles that the credit is **formal**; where the fork is **introduced in
prose** is that ticket's business.

### What the notices say

**Copyright line: `Copyright 2026 Caio Ferreira`.** Single year, not a range — the repo opens
2026-06-05 and a range needs annual maintenance nobody performs. Sole authorship (803 of 807 commits;
the rest are `Claude`, not a copyright holder) means no "the Hamilton authors" fudge; Apache §5
already places incoming contributions under the same terms without editing this line.

**No per-file Apache headers.** The appendix boilerplate is *recommended*, not required — §4 is
discharged by `LICENSE` + `NOTICE`. The cost is asymmetric the wrong way: Hamilton's most-copied
artifacts are the markdown skills, and a header cannot sit above `SKILL.md`'s YAML frontmatter without
breaking it, or below without the context tax rejected above. Headers would cover the five TypeScript
files nobody detaches and miss the nine skill directories that travel. Headered `.ts` beside
headerless `.md` is worse than neither.

**The per-skill `NOTICE` carries both copyrights**, because a forked skill is a derivative work —
upstream's text is MIT and Matt Pocock's; the adaptations are Apache 2.0 and Caio Ferreira's:

```
This skill is adapted from the "wayfinder" skill in mattpocock/skills
(https://github.com/mattpocock/skills), used under the MIT License.
Modifications and additions are Copyright 2026 Caio Ferreira, licensed
under the Apache License, Version 2.0.

Original work:

  MIT License
  Copyright (c) <year> Matt Pocock
  <full permission text>
```

A single-copyright notice would either understate upstream's claim or overstate Hamilton's.

### Consequences

- **The route gains a licensing unit**, already anticipated by
  [Compose route.md — the change-sized units](11-compose-route.md). It covers: `LICENSE`,
  root `NOTICE`, `"license": "Apache-2.0"` in `package.json`, and the per-skill `NOTICE` for every
  forked skill. Verbatim upstream copyright year and permission text must be copied from upstream's
  own `LICENSE`, not reconstructed.
- **The per-forked-skill `NOTICE` rule needs a written home** so future forks follow it —
  `CONTRIBUTING.md` is the natural place, since it already maps change areas to doc files. Small
  enough to ride in the licensing unit rather than earn its own ticket.
- **Ticket 10 inherits a constraint**: introducing the fork's provenance in prose, since Inspirations
  will not carry it.
- Nothing here blocks another ticket. The answer simply has to exist before anything ships, and now
  does.
