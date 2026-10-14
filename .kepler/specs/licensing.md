# Capability: licensing

## Overview

The licence Hamilton grants the people who receive it, the attribution notices that travel with material forked from other projects, and the rule every future fork follows. Hamilton is publicly distributed — `install.sh` fetches a binary over the network and skills are installed individually — so recipients need an explicit grant, and the upstream projects Hamilton borrows from need their terms carried forward. This capability covers both directions: what Hamilton gives away, and what it passes on.

## Contract

Six artifacts make up the licensing surface. The filenames are the interface, not incidental paths — `LICENSE` and `NOTICE` are the conventional names tooling, hosting platforms, and Apache §4(d) itself look for.

| artifact | carries |
|----------|---------|
| `LICENSE`, repository root | the complete Apache License 2.0 text as published, unmodified, including its appendix |
| `NOTICE`, repository root | Hamilton's own copyright line, then one entry per upstream project Hamilton forks material from: that project's URL, its copyright line, and its full permission text |
| `license` field in `package.json` | the SPDX identifier `Apache-2.0` |
| `README.md` licence section | the grant in prose at the entry point, pointing at both `LICENSE` and `NOTICE` |
| `CONTRIBUTING.md` licensing section | the forked-skill rule, the two placement constraints behind it, and a copy-pasteable `NOTICE` template |
| `NOTICE` beside a forked skill directory | that upstream project's copyright and permission text, plus Hamilton's own modification copyright |

Hamilton's copyright line reads `Copyright 2026 Caio Ferreira` — a single year rather than a range, and a single named holder rather than a collective form. It lives at the top of `NOTICE`; the appendix placeholder inside `LICENSE` is left exactly as Apache publishes it.

The manifest's `license` field is a declaration for tooling and downstream consumers, which read the manifest rather than the licence file. It is not a step toward publication — the package stays private.

## Behavior

Hamilton is distributed under Apache 2.0, and a recipient of the repository gets that grant from `LICENSE`, stated again at the entry point in the README and machine-readably in the manifest.

Material forked from an upstream project keeps its own licence; the combined work ships under Apache 2.0. Because upstream's terms require its copyright and permission notice to travel with substantial portions of the work, those notices are reproduced at **two levels**: once at the repository root, covering the repo as distributed, and once inside each forked skill directory. The second level is what makes the scheme work — a skill directory is installed on its own and arrives on a user's machine detached from the repo, so a root-level notice never reaches whoever took just that directory.

The root `NOTICE` is organised by upstream project, not by directory. It names no individual skill directory and instead states that each forked directory carries its own sibling notice, so it stays true at every point in the repository's life rather than only after every fork has landed.

Whenever an upstream permission text is reproduced — in the root notice, in a sibling notice, or in the template contributors instantiate — it is copied from that project's own licence file rather than written from a remembered template, because the circulating variants of a permission text differ in whitespace and casing and approximate reproduction is the one failure here with legal weight.

A contributor forking an upstream skill finds the rule in `CONTRIBUTING.md`: create a sibling `NOTICE` from the template by substituting the upstream skill and project names, and add a one-line provenance pointer to the skill's `SKILL.md` naming the upstream skill, its licence, and that notice. The licence text belongs in the sibling notice specifically — not in a skill's `references/`, which in this repository means material the agent is expected to read on invocation, and not in the `SKILL.md` body, which is a context cost paid on every load.

**Examples**

- open `LICENSE` at the root -> the complete Apache 2.0 text, unmodified, appendix included
- parse `package.json` -> `license` is exactly `Apache-2.0`; the package remains private
- read `README.md` to the end -> the licence stated, linking `LICENSE` for the grant and `NOTICE` for upstream terms
- open the root `NOTICE` -> Hamilton's copyright line, then one entry per upstream project with its URL, copyright, and full permission text
- read the root `NOTICE` before every fork has shipped -> no individual skill directory named; it states that each forked directory carries its own sibling notice
- install a single forked skill directory and nothing else -> the upstream notice arrives with it, sitting beside the `SKILL.md`
- diff a reproduced permission block against the upstream project's own licence file -> identical, save for uniform indentation applied when nesting it
- fork an upstream skill following `CONTRIBUTING.md` alone -> a compliant sibling notice and provenance pointer, with no change directory or planning ticket consulted

## Invariants

- The Apache text in `LICENSE` MUST be the published text, unmodified — including the appendix placeholder, which is NEVER filled in. Hamilton's copyright line lives in `NOTICE` instead.
- A reproduced upstream permission notice MUST be copied byte-for-byte from that project's own licence file, NEVER reconstructed from memory or from a licence template. Uniform indentation applied when nesting the block is the only permitted alteration.
- Every skill directory forked from an upstream project MUST ship a sibling `NOTICE`. A root-level notice alone is NEVER sufficient, because the directory travels detached from the root.
- A notice file MUST NOT assert the existence of a skill directory that has not shipped.

## Decisions

- **Apache 2.0 rather than MIT**, because this repository redistributes third-party material and therefore needs an attribution surface. Apache ships one — `NOTICE`, with a defined meaning under §4(d) and an obligation to propagate it — so adopting Apache means adopting a standard convention instead of inventing and explaining a bespoke `THIRD-PARTY.md`. The accepted cost is one-way incompatibility with GPLv2, which bites only if Hamilton is vendored into a GPLv2 project; GPLv3 is unaffected.
- **Attribution is formal, not prose.** Credit is discharged by `LICENSE` and `NOTICE` artifacts, never by a paragraph in a document. Introducing a fork's provenance in narrative prose is a separate concern from declaring the licence, and the two do not substitute for each other.
- **The unit of distribution decides where a notice goes.** Because skills are installed individually, anything that must travel with a skill lives inside its directory. This is the reasoning to apply to any future artifact with the same property, not a fact about notices alone.
- **The root notice carries one un-enumerated entry per upstream project.** The obligation is per-project, not per-directory: whole-repo recipients get the terms from the project entry, and single-directory recipients get them from the sibling notice. An enumeration of directories serves neither, needs an edit from every change that adds a fork, and is false in the interval before those forks land.
- **Wording is templated once so every copy is identical.** The template lives with the contribution conventions, where a contributor already looks, rather than in a change directory or planning ticket — both of which are history rather than convention. Duplication of the permission text across copies is deliberate, since each copy travels with a different unit of distribution, but every copy instantiates the one template and traces back to the upstream file as its authoritative origin. No copy is derived from another copy.
- **No per-file licence headers.** Apache's boilerplate is recommended rather than required, and it cannot sit above a `SKILL.md`'s YAML frontmatter without breaking the parse. Headering the source files nobody detaches while missing the skill directories that do travel would be worse than headering neither.
