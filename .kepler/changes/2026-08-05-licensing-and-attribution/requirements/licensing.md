# Capability: licensing

The licence Hamilton grants its recipients, the attribution notices that travel with forked upstream
material, and the rule every future fork follows.

## ADDED Requirements

### Requirement: Project licence grant

Hamilton SHALL be distributed under the Apache License, Version 2.0, with the complete and unmodified
licence text present at `LICENSE` in the repository root.

- Priority: must
- Rationale: Hamilton is publicly distributed via `install.sh` and `npx skills add` while granting
  recipients nothing; absent an explicit grant the default is all rights reserved. Apache 2.0 is
  chosen over MIT because this repo needs an attribution surface, and Apache ships one — `NOTICE`
  (§4(d)) with a defined, must-be-propagated meaning — rather than requiring a bespoke convention to
  be invented and explained.

#### Scenario: Licence text present

- WHEN a recipient opens `LICENSE` at the repository root
- THEN they find the complete Apache License 2.0 text, unmodified, including its appendix

#### Scenario: Copyright line

- WHEN a reader looks for the copyright holder of Hamilton's own work
- THEN it reads `Copyright 2026 Caio Ferreira` — a single year, not a range, and a single named
  holder rather than a collective form

### Requirement: Machine-readable licence declaration

`package.json` SHALL declare Hamilton's licence with the SPDX identifier `Apache-2.0`.

- Priority: must
- Rationale: tooling and downstream consumers read the manifest, not the `LICENSE` file. The field is
  a declaration only — `"private": true` stays, and this change is not a step toward npm publication.

#### Scenario: Manifest field

- WHEN `package.json` is parsed
- THEN it contains a top-level `"license"` field whose value is exactly `"Apache-2.0"`, and its
  existing `"private": true` field is unchanged

### Requirement: Licence stated at the entry point

`README.md` SHALL state Hamilton's licence and direct the reader to both `LICENSE` and `NOTICE`.

- Priority: should
- Rationale: the README is where a prospective user arrives, and the gap this change closes is that
  a recipient cannot currently tell what they are permitted to do. A pointer to `NOTICE` alongside
  the grant is what makes the forked material discoverable to a reader who never opens the tree.

#### Scenario: Licence section

- WHEN a reader reaches the end of `README.md`
- THEN they find a section stating that Hamilton is licensed under Apache 2.0, pointing at `LICENSE`
  for the grant, and noting that forked skills carry upstream notices in `NOTICE`

#### Scenario: Declaration, not provenance

- WHEN the README licence section is read alongside `docs/`
- THEN it states the licence and points at the notice files, and does not narrate where the forked
  wayfinder skills came from — that introduction belongs to `docs/skills.md`

### Requirement: Upstream attribution notice

The repository root SHALL carry a `NOTICE` file recording, for each upstream project Hamilton forks
material from, that project's copyright line and its full permission text.

- Priority: must
- Rationale: MIT requires the copyright and permission notice to travel with substantial portions of
  the work. `NOTICE` is Apache §4(d)'s standardised home for third-party credit, so adopting Apache
  means adopting it as the convention for that credit rather than inventing a `THIRD-PARTY.md`.

#### Scenario: Upstream entry

- WHEN a reader opens `NOTICE`
- THEN they find Hamilton's own copyright line and an entry for `mattpocock/skills` giving its
  project URL, Matt Pocock's copyright line, and the full MIT permission text

#### Scenario: Reproduced verbatim

- WHEN the MIT block in `NOTICE` is compared against the `LICENSE` file published by
  `mattpocock/skills`
- THEN the copyright line and permission text match it exactly, save for uniform indentation applied
  when nesting the block, and were copied from that file rather than reconstructed from memory

#### Scenario: No enumeration of skill directories

- WHEN `NOTICE` is read at any point before every forked skill has shipped
- THEN it names no individual skill directory, and instead states that each forked skill directory
  carries its own sibling `NOTICE`, so the file asserts nothing false about what the repo contains

### Requirement: Forked skill attribution rule

`CONTRIBUTING.md` SHALL state the rule that a skill directory forked from an upstream project ships
its own sibling `NOTICE` and a provenance pointer in its `SKILL.md`.

- Priority: must
- Rationale: the unit of distribution is the skill directory, not the repo — skills are plain Markdown
  installed individually, so a forked `SKILL.md` lands on a user's machine detached from the repo root
  and a root-level `NOTICE` never follows it. Three later units fork skills, and each needs a repo
  convention to follow rather than a resolved ticket to re-read.

#### Scenario: Rule is written down

- WHEN a contributor preparing to fork an upstream skill reads `CONTRIBUTING.md`
- THEN they find the rule that the forked directory gets a sibling `NOTICE` carrying both the
  upstream copyright and permission text and Hamilton's own modification copyright, and that its
  `SKILL.md` gets a one-line pointer naming the upstream skill, its licence, and the `NOTICE`

#### Scenario: Placement constraints stated

- WHEN that rule is read
- THEN it states that the licence text goes in the sibling `NOTICE` rather than in `references/`,
  which in this repo means content the agent is expected to read, and rather than in the `SKILL.md`
  body, which enters context on every invocation

#### Scenario: Template is instantiable

- WHEN a contributor reaches the rule with a specific skill and upstream project in hand
- THEN they find a copy-pasteable `NOTICE` block with placeholders for the skill and upstream names,
  so every forked skill's notice differs only in those names rather than in wording

#### Scenario: A later fork follows it

- WHEN a subsequent change adds a forked skill directory
- THEN following `CONTRIBUTING.md` alone is sufficient to produce a compliant `NOTICE` and provenance
  line, with no reference to the change directory or map ticket that originally decided it

## MODIFIED Requirements

None — `licensing` is a new capability.

## REMOVED Requirements

None.

## RENAMED Requirements

None.
