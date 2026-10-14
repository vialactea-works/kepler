---
artifact: requirements-spec
capability: artifact-templates
status: current
updated: 2026-09-23
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: accepted
---

# Capability: artifact-templates

## Overview

Every artifact shape Hamilton produces is defined once, as a template that ships inside the distribution's bundle and installs globally. `hamilton setup` copies the bundle's templates tree to `~/.hamilton/templates/`, and the step that produces an artifact reads its shape from there rather than carrying a copy in its own body. This capability covers the shapes themselves, the installation that puts them on a user's machine, and the report that tells the user what landed.

## Contract

### Layout and naming

The templates tree **is** the manifest; there is no separate index file enumerating the set. A template's path relative to the templates root is its identity — the name a skill cites, the name the install report prints, and the name preserved through installation. Depth is free: shapes belonging to one producer are grouped in a subdirectory named for it, so `wayfinder/map.md` in the bundle installs to `~/.hamilton/templates/wayfinder/map.md`, while the pipeline's own templates sit at the root and are named bare (`plan.md`).

Names are reported with `/` as the separator on every platform, so the name a user reads is the name a skill or document would cite.

### The wayfinder artifact shapes

Three shapes serve the pre-pipeline wayfinding stage. Their frontmatter is a parsed interface, not decoration — the fields and their vocabularies are what a reader or a skill matches on.

| template | frontmatter | body |
| ---------- | ------------- | ------ |
| `wayfinder/map.md` | `status`: `open` \| `cleared` \| `shipping` \| `shipped`; `branch`: the branch the effort works from and merges back into, set at map creation | the sections Destination, Notes, Operation rules, Decisions so far, Not yet specified, Out of scope — in that order, and no seventh |
| `wayfinder/ticket.md` | `type`: `grilling` \| `research` \| `prototype` \| `task`; `status`: `open` \| `claimed` \| `resolved`; `blocked_by`: a list of ticket numbers | a `## Question` section |
| `wayfinder/route.md` | `artifact`: `route`; `effort`: the effort name; `status`: `open` \| `shipping` \| `shipped`; `created` and `updated`: dates; `decision`: `accepted` \| `rejected` \| `skipped`; `units`: nested records owning each unit's `id`, `name`, `status`, `depends_on`, and `backed_by` ticket paths | `# Route — <Effort Name>`, then `## Point of departure`, `## Destination`, `## Path chosen`, `## Shipping rules`, and `## Units` — with destination subheadings, causal decisions, shipping rules, and coarse unit contributions |

A map links its route from Destination once one exists; the route compiles the current destination and causal path while tickets remain the detailed evidence and decision-record source. The map's Operation rules section holds prescriptive, per-session-binding rules on how working sessions operate and may be empty; its hints distinguish it from Notes, which holds orienting context. A ticket templates only the question — the answer is appended when the ticket resolves, so there is no empty Answer heading to invert that order. Route-level lifecycle and unit metadata remain authoritative in frontmatter, while the body preserves the five destination-first sections and keeps Shipping rules self-contained for processes that never open the map.

### The pipeline execution and review shapes

The pipeline uses distinct shapes for current task state, task evidence, task feedback, whole-branch review, and finish history. Their source names stay at the templates root even when their live instances are nested or owned at change scope.

| template | live instance | owner | durable content |
| ---------- | --------------- | ------- | ----------------- |
| `progress.md` | `<change>/progress.md` | planning and code | one plan-ordered row per active task, with `Task N: <title>`, status `pending` / `in-progress` / `blocked` / `done`, and a link to the task log |
| `task-progress.md` | `<change>/tasks/task-N/progress.md` | code | one task identity and append-only numbered implementation attempts with outcome, changed paths, verification, and notes |
| `feedback.md` | `<change>/tasks/task-N/feedback.md` | code feedback | one task identity and one append-only file of passes; each fully evidenced pass carries its own `Base:`, `Head:`, and `Verdict:` (`approved` or `changes-requested`), blocking findings, and suggestions |
| `review.md` | `<change>/review.md` | whole-branch review | one append-only file of whole-branch passes; each fully evidenced pass carries its own `Base:`, `Head:`, and `Verdict:` (`approved` or `changes-requested`), blocking findings, and suggestions |
| `finish.md` | `<change>/finish.md` | finish-work | paired numbered attempts and observed outcomes for the change's finishing strategy |

Task identity is encoded by the exact numeric identifier in `task-N`, not by a title. The root progress table is a current-state index; detailed attempts, feedback, review, and finish history remain in their owning artifacts. The task and review shapes use physical-last-pass semantics so a malformed latest pass cannot silently revive an earlier approval.

`Base`, `Head`, and `Verdict` are per-pass feedback and review evidence, not ordinary global state for the file. Only fully evidenced feedback and review passes carry `Base`, `Head`, and `Verdict`; structural legacy records are provenance-free, cannot supply a verdict, and remain distinct from the authoritative latest evidenced record. `Base` and `Head` contain full commit identifiers; `Verdict` contains an allowed verdict enum value (`approved` or `changes-requested`). Each history owns its complete lifecycle in one append-only file: code feedback appends only to `tasks/task-N/feedback.md`, and whole-branch review appends only to `<change>/review.md`. Numbered `feedback-k.md` and `review-k.md` files are not part of the model.

Review histories have three supported modes. A `legacy-global` history has structural legacy pass bodies and global `base`, `head`, and `verdict` provenance bound only to its physically last legacy pass; earlier structural passes do not receive an invented verdict. A `transitioned` history has a structural legacy prefix followed by a fully evidenced explicit suffix. A `modern` history has fully evidenced per-pass records from its first pass onward. Structural legacy history is preserved body history without a verdict record, while explicit records carry complete verdict provenance. The first modern append performs one atomic transition: it validates the legacy-global history, preserves every existing pass body byte-for-byte, removes exactly the global provenance fields, and appends the next complete pass-local record. Once an explicit suffix begins, every later pass is pass-local and no fieldless pass or global provenance may follow it. The physically latest evidenced pass remains authoritative, and malformed transitions or latest evidence fail closed.

### The template idiom

Every template, wayfinder's included, opens with a comment block naming the artifact, the skill that produces it, and where instances of it live, and instructs the author to delete that block and every inline hint before finalizing. The hints are inline comments in the body, so a half-filled artifact still parses as the document it will become.

## Behavior

`hamilton setup` installs the bundle's entire templates tree into `~/.hamilton/templates/`, at any depth, and overwrites what is already there — so an existing installation picks up new templates on the next run without any migration. It then reports the set it installed, naming every file by its path relative to the templates root and no directories.

The report describes what landed on disk rather than what the bundle asked for, so a file that failed to arrive is not announced as installed. A bundle carrying no templates directory at all is not an error: setup succeeds and reports an empty set.

For a split-pipeline installation, setup also installs the task progress, task feedback, and finish-history shapes. Planning instantiates the root task index and one task-progress file per active task from those shapes. New author-bearing artifacts record configured `user.name` and `user.email` as `Name <email>`; if either value is missing, the authoring skill asks for it or reports a blocker rather than inventing an identity. Edits to any existing author-bearing artifact preserve its recorded author exactly. A newly initialized pending task log contains only its identity and heading; it has no synthetic attempt and is a valid creation state. Code appends implementation attempts to the task-owned shape; code feedback and whole-branch review append only to their respective single-file verdict histories; and finish-work creates or appends paired finish history after the gates pass. Each producer leaves the other owners' artifacts unchanged.

**Examples**

- bundle templates root contains `wayfinder/map.md` -> `~/.hamilton/templates/wayfinder/map.md` exists with the bundled file's contents
- run setup a second time -> every template, nested or top-level, matches the bundle and the command succeeds
- bundle root has no templates directory -> setup succeeds, installs nothing, reports an empty set
- templates root holds nine files plus one subdirectory of three -> the report holds twelve entries, and the subdirectory's own name is not among them
- a template at the templates root -> reported as `plan.md`, with no directory prefix
- a template one level down -> reported as `wayfinder/map.md`, with `/` on every platform
- a split-pipeline setup -> `progress.md`, `task-progress.md`, `feedback.md`, `review.md`, and `finish.md` are installed and reported as separate file entries
- a task receives another implementation or feedback pass -> its existing history remains and one new dated pass is appended to the owning task artifact
- a feedback or review file has a requested-change pass followed by an approval -> both pass records remain in that one file and the approval is the physical latest evidence
- a multi-pass feedback or review file has malformed physical-last evidence -> lint and every evidence consumer fail closed instead of using the earlier approval
- finish-work begins after the gates pass -> `finish.md` records an intent before the external action and a matching observed outcome afterward

## Invariants

- Every file the bundle's templates tree carries MUST install, at any depth, with its path relative to the templates root preserved.
- The install report MUST name every file installed and NEVER a directory, so its entry count equals the number of files written.
- An artifact shape MUST be defined exactly once, in the bundle's templates tree. A shape is NEVER reverse-engineered from a live instance, which cannot distinguish the required from the incidental.
- The repository MUST NOT retain or consult a project-local `.hamilton/templates/` mirror.
- Root `progress.md` MUST contain only the current task index; task attempts, task feedback, whole-branch review, and finish history MUST remain in their owning artifacts.
- Every fully evidenced feedback and review pass MUST identify its own full commit identifiers in `Base:` and `Head:` and its allowed verdict value in `Verdict:`, and histories MUST fail closed when the physically last pass or a transition is malformed.
- Feedback and review histories MUST remain append-only in their single owning files; numbered `feedback-k.md` and `review-k.md` files MUST NOT be introduced.
- Legacy-global provenance MUST apply only to the physically last legacy pass, MUST never seed historical structural passes, and MUST be removed atomically before an explicit suffix is appended.

## Decisions

- **The directory is the manifest.** The set of shipped shapes is whatever the templates tree contains — no manifest file, no per-producer registry, and no template-resolution layer. A grouping subdirectory is a path, not a namespace to be registered; the first one does not justify machinery for a second.
- **The report reads the destination, not the request.** Enumerating what was written, rather than replaying what was asked for, is what makes the report evidence. A report derived from the source would name a file that never arrived.
- **A template encodes the artifact's syntax, not the contract that governs it.** Fields and their allowed values belong in the template so an author fills them in correctly; the prose explaining what a value *signifies* belongs in documentation, which has one copy and can be revised. Restating a contract inside a template would stamp it into every instance ever created and make a future edit a rewrite of all of them.
- **A status field belongs to exactly one artifact.** Where two artifacts describe the same lifecycle, the one that owns it carries the status and the other links to it. A mirrored status is a value with two sources that drift apart, and templating one propagates the drift.
- **A shape templates only what exists at creation time.** A section filled in at a later stage of the artifact's life is not stubbed out in advance; an empty heading invites it to be filled in the wrong order.
- **Documentation for a template set follows the producer, not the directory.** A change to the pipeline's templates is documented with the framework; a change under a producer's subdirectory is documented with that producer's skill. `CONTRIBUTING.md`'s mapping table carries the more specific path so the intended match is unambiguous.
- **Ownership is visible in the artifact path.** Current task status, task evidence, tactical feedback, whole-branch review, and finish outcomes are different lifecycles, so each has one owner and one unambiguous instance path rather than a mixed stream.
- **The split is adopted between changes.** Existing mixed-format changes are finished with the Hamilton version that created them; new execution does not infer, migrate, or accept their old artifact layout.
