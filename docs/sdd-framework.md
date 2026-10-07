# Spec-Driven Development Framework

> **Kepler is in ALPHA.** This document is the design of Kepler's **Assisted mode** — the
> working core (see [modes](./modes.md)). For a task-focused map of the skills and how
> to run them, see the [Skills reference](./skills.md); this page is the *why* behind them.

Kepler's spec-driven development (SDD) framework carries a change from idea to merge
through a fixed sequence of steps, each captured as a **skill** and backed by durable
**artifacts**. The same skills are used by a person working in an editor or by a coding agent —
a person authors the spec and hands execution to the agent.

See the **[Change state machine](./change-state-machine.md)** for lifecycle states,
skill ownership, and artifact-based transition guards.

## Philosophy

AI coding agents are capable but unanchored. Left with a broad prompt they drift, skip
verification, and produce work that looks right and collapses under the first edge case. The
fix is not a bigger prompt; it is structure that survives across steps and across sessions.

The framework rests on two ideas.

**The spec is the shared source of truth, and it accumulates.** Every change is described
before it is built — why (proposal), what (requirements), how (design) — and the decisions a
change commits to are folded back into a living per-project spec. Over time the project's
`specs/` directory becomes the consolidated truth, while each change keeps its own history.
This is how historical decisions are preserved without letting the current picture rot.

**Skills are portable knowledge; the harness is only a binding.** A skill encodes *how* to
plan, code, or review well, once. It never assumes Kepler mechanics, so the identical skill
guides a human in any editor and a coding agent. Whatever is
Kepler-specific — how an agent reports output, how context templates are rendered — lives
in a thin agent wrapper around the skill, not in the skill itself. The artifacts under a
project's `.kepler/` directory are the contract between authoring and execution.

## Principles

**Skills are the single, tool-agnostic source of truth.** Each pipeline step is one skill.
It names no tool, defines the terms it uses, and depends on no runtime internals — only on
the project's standards file (`AGENTS.md`) and the shared artifacts.

**Agents are thin wrappers.** A Kepler agent that runs a step loads the skill and adds only
the harness binding (output reporting, context, schemas). The skill is never duplicated into
the agent's instructions.

**Start at planning when appropriate.** `plan.md` is the required declarative artifact. Planning
also initializes the required root task ledger and task progress files. The heavyweight front door
— proposal, requirements, design — is optional; a tactical change starts at the plan step, which
uses richer upstream artifacts when present and otherwise works from the raw request.

**The orchestrator owns the loops.** Steps are linear on paper, but task feedback sends one task
back to code and whole-branch findings send the change back to planning. The person or workflow
driving the pipeline runs those loops; each skill does one job and returns. This mirrors Kepler's
existing retry-and-verify machinery.

**Changes accumulate into living specs.** A change proposes requirement *deltas*
(ADDED / MODIFIED / REMOVED / RENAMED) in structured form. The finish step folds them into the
canonical `specs/<capability>.md` — human-readable documentation at altitude that always describes
current behavior, with no delta markers and none of the change-side `SHALL`/scenario scaffolding.

**Right-sized rigor.** The documents borrow the *spirit* of established standards — testable
requirements, decisions with alternatives — without their ceremony. "29148-inspired," not
29148-conformant.

**Match the worker to the work.** The plan step does the sequencing thinking and writes
test-first steps; the code step follows those steps verbatim and adds no design of its own,
so it can run on a weak, cheap model. Task feedback provides the bounded tactical gate, while
whole-branch review uses the strongest model for integration and omission analysis. An
"ask first" decision is resolved by asking the requester, or — running unattended — by the
agent reflecting, deciding, and recording the reasoning.

## Inspirations

The framework is a synthesis, not an invention.

- **OpenSpec** — the capability-centric model: a durable spec of requirements, changed
  through deltas that are folded back in at the end. Kepler keeps this, triggered by the
  finish step rather than a separate sync command.
- **Superpowers** — the collaborative `brainstorming` skill (one question at a time, propose
  alternatives, gate on approval) shapes the propose step; `writing-plans` and
  `executing-plans` shape the plan and code steps.
- **GitHub Spec Kit** — the gated Specify → Plan → Tasks → Implement flow, where the spec
  drives implementation and each phase is validated before the next.
- **"How to write a good spec for AI agents" (Addy Osmani)** — the six core areas of a good
  project spec (commands, testing, structure, style, git workflow, boundaries), the
  three-tier boundary system (Always / Ask first / Never), spec-referenced self-verification,
  and keeping each step's context minimal.
- **IEEE / ISO standards** — 830 and 29148 for the requirements specification (SRS), 1016 for
  the software design description (SDD) — taken in spirit and right-sized.

## The pipeline

Seven core skills define the fixed order. Step 0 runs once per project, step 1 is optional per
change, and steps 2–6 form the per-change sequence. Wayfinder is an optional pre-change planning
stage, and `kepler-critique` is an optional design-phase gate; neither is counted in this core
sequence. Wayfinder clears fog by compiling a route: a stable destination-and-path handoff with
Point of departure, Destination, Path chosen, Shipping rules, and Units. Its frontmatter owns
mutable route and unit lifecycle metadata. Propose and plan turn units into implementation
artifacts; code and finish-work build and ship them.

| Step | Skill | Role |
| ------ | ------- | ------ |
| 0 | `kepler-init` | Set up the project: write `AGENTS.md`, scaffold `.kepler/` |
| 1 | `kepler-propose` | Idea → proposal (why), requirements (what), design (how) |
| 2 | `kepler-plan` | Design → `plan.md`: small, TDD-sized, independently verifiable tasks |
| 3 | `kepler-code` | Implement one task, then enter its `code` ↔ `code-feedback` loop |
| 4 | `kepler-code-feedback` | Judge that task's stable diff; approve it or loop back to `code` |
| 5 | `kepler-review` | Run the single whole-branch gate after every task loop passes |
| 6 | `kepler-finish-work` | Gate, sync specs, record intent, finish via merge / PR / no-op, verify, record outcome |

```
init ──▶ [ propose ] ──▶ plan ──▶ ( code ◀──▶ code-feedback ) ──▶ review ──▶ finish-work
  0        1 optional      2          3             4                5            6
                                     repeat per task              once per change
```

**kepler-init** explores the project read-only and writes `AGENTS.md` across the six
standing areas — the project's standards that every later step reads. It scaffolds
`.kepler/specs/` and `.kepler/changes/`. It is idempotent and never clobbers an existing
`AGENTS.md`.

**kepler-propose** is the optional front door. Through dialogue — clarifying questions one
at a time, then two or three alternative approaches with trade-offs — it produces the
proposal, the per-capability requirements, and the design, and gates on approval before any
implementation. A change that does not warrant this depth skips it.

**kepler-plan** produces the required declarative `plan.md` handoff contract. It explores the code
read-only, then decomposes the work into TDD-sized tasks, each with its files, acceptance criteria,
ordered steps, a verify command, and a commit message. It also initializes root `progress.md` as the
current task ledger and one `tasks/task-N/progress.md` history for each task. Because the coder
follows task steps verbatim, all sequencing happens here.

**kepler-code** implements exactly one task — identified either by reference (`plan.md` +
task id) or as an inline task block — following its steps as written. It never redesigns,
never touches sibling tasks, runs a code-quality self-review, and commits. It transitions only its
assigned row in root `progress.md` and appends detailed attempt evidence only to
`tasks/task-N/progress.md`. It never edits `plan.md`.

**kepler-code-feedback** is the per-task tactical gate. It reviews one stable task diff from the
task's unchanged checkpoint through the implementation Head, checks the task's acceptance and
latest attempt evidence, and appends an artifact-only verdict to `tasks/task-N/feedback.md`. Its
reviewed Head must contain the latest task-progress commit. The history is one append-only owning
file: only fully evidenced feedback and review passes carry their own `Base`, `Head`, and
`Verdict` fields, and no numbered `feedback-k.md` files are created. A `legacy-global` history
keeps structural legacy pass bodies and binds global provenance only to its physically last legacy
pass; a `transitioned` history has that structural prefix followed by a fully evidenced explicit
suffix; a `modern` history is fully explicit from the start. The physically latest evidenced pass
is authoritative. Structural legacy records are provenance-free, cannot supply a verdict, and remain
distinct from the authoritative latest evidenced record. `Base` and `Head` contain full commit
identifiers; `Verdict` contains an allowed verdict enum value (`approved` or `changes-requested`).
Requested changes return that same task to code; approval advances the driver.

**kepler-review** is the whole-branch merge gate. After all tasks have fresh approved feedback,
it starts from the complete branch diff and inspects broader affected consumers, cross-task
composition, omissions, and repository assumptions. It appends passes to the single owning
`<change>/review.md` history; only fully evidenced feedback and review passes carry their own
`Base`, `Head`, and `Verdict` fields, and no numbered `review-k.md` files are created. A
`legacy-global` history binds global provenance only to its physically last legacy pass; a
`transitioned` history has a structural prefix and an explicit suffix; a `modern` history is
fully explicit. Structural legacy records are provenance-free, cannot supply a verdict, and remain
distinct from the authoritative latest evidenced record. `Base` and `Head` contain full commit
identifiers; `Verdict` contains an allowed verdict enum value (`approved` or `changes-requested`).
The first modern append validates the old history, preserves every existing pass body byte-for-byte,
removes exactly the global provenance fields, and appends the next pass-local record atomically.
Later appends remain pass-local. The physically latest evidenced pass is authoritative, and
malformed transitions or latest evidence fail closed. The reviewed Head must
contain the latest material change commit. Implementation findings return to planning as
remediation tasks rather than directly to code.

**kepler-finish-work** closes the change. It checks the completion gate (clean tree, full tests
and build, exact task ledger complete, every task's fresh feedback approved, and fresh whole-branch
review approved), folds the change's requirement deltas into the canonical specs, and finishes via
local merge, a pull request, or no-op. It persists paired intent and observed outcome records in
root `finish.md`, reconciling any dangling attempt before starting another. Folding is a *distill
and translate* step: the change-side deltas are structured (`SHALL` + `WHEN`/`THEN`), but the
canonical spec is human-readable documentation — a light universal skeleton (Overview / Contract
/ Behavior + Examples / Invariants / Decisions) written at altitude — so finish-work rewrites each
delta into the section it belongs to rather than copying requirement blocks by name.

**kepler-compose-spec** sits outside the per-change pipeline. It authors canonical specs
directly, in two modes: *reformat* an existing spec into the current skeleton, or write specs
*from the application code*. It is the front door for canonical specs — every pipeline path
produces a spec only as a by-product of finishing a change — and the tool a project uses to
bootstrap specs on adoption or migrate an older spec format.

## Artifacts and layout

**Templates are global.** The canonical set lives in the repository's `bundle/templates/` and
is copied to `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/` by the `kepler setup` command. Every step reads the
installed copy, so there is one definition of each artifact's shape.

**Artifacts are per-project**, under the project's `.kepler/` directory:

```
.kepler/
  specs/                              # canonical capability truth (living)
    <capability>.md                   # no delta markers — current behavior
  changes/
    <YYYY-MM-DD-title>/
      proposal.md                     # optional — PRD (why)
      design.md                       # optional — SDD (how)
      requirements/<capability>.md    # optional — SRS delta (what)
      plan.md                         # required — the handoff contract
      progress.md                     # required — current task ledger
      tasks/
        task-N/
          progress.md                 # implementation attempt history
          feedback.md                 # task-feedback verdict history
      review.md                       # whole-branch review history
      finish.md                       # finish attempt and outcome history
```

The document set and the standards it borrows from:

| Artifact | Document | Owns | Inspiration |
| ---------- | ---------- | ------ | ------------- |
| `proposal.md` | PRD | Why | — |
| `requirements/<capability>.md` | SRS (delta) | What | ISO/IEC/IEEE 29148 |
| `specs/<capability>.md` | SRS (canonical) | What | ISO/IEC/IEEE 29148 |
| `design.md` | SDD | How | IEEE 1016 |
| `plan.md` | Plan | Steps | — |
| `progress.md` | Task ledger | Current implementation status and task-history links | — |
| `tasks/task-N/progress.md` | Task progress | Implementation attempts | — |
| `tasks/task-N/feedback.md` | Code feedback | Task verdicts and reviewed ranges | — |
| `review.md` | Whole-branch review | Change verdicts and reviewed ranges | — |
| `finish.md` | Finish history | Intended and verified finish outcomes | — |

Only fully evidenced feedback and review passes carry `Base`, `Head`, and `Verdict`; structural
legacy records are provenance-free, cannot supply a verdict, and remain distinct from the
authoritative latest evidenced record. `Base` and `Head` contain full commit identifiers; `Verdict`
contains an allowed verdict enum value (`approved` or `changes-requested`). Three history modes are
supported: `legacy-global` structural history with global provenance bound only to the physical last
legacy pass, `transitioned` structural prefix plus explicit suffix, and `modern` all-explicit
history. The first modern append is atomic: it preserves every existing pass body byte-for-byte,
removes exactly the global provenance, and appends the next pass-local record. Later appends remain
pass-local. The physically latest evidenced pass is the shared source for lint, context, precondition,
and finish gates; malformed transitions or latest evidence fail closed. Ownership stays in the single
feedback or review file rather than numbered pass files.

**Changes are ephemeral; specs are durable.** A change directory records one unit of work and
its history. The requirements inside it are deltas. When the change finishes, those deltas are
folded into `specs/`, which is the project's consolidated, always-current requirements truth.

`plan.md` is the declarative task contract. Planning initializes the required root `progress.md`
ledger and task-local progress files; execution updates those operational artifacts without turning
them into a second plan. Task feedback, whole-branch review, and finish history remain separate so
each stage has one durable owner.

### Artifact authorship and authoring-boundary lint

For a newly created workbench-recognized artifact whose template requires an `author` field, a skill
reads the effective repository Git identity from `git config user.name` and `git config user.email`
and writes both values as `Name <email>`. If either configured value is missing, the skill asks the
user or stops with a blocker; it never substitutes an agent name, operating-system username, or an
unresolved template placeholder. When editing an existing artifact, the skill preserves that
artifact's recorded author rather than replacing the original attribution.

Every skill that creates or edits a workbench-recognized Kepler artifact runs the scoped workbench
lint command after the mutation. For a coordinated change tree, validate the complete tree with:

```bash
kepler workbench lint --change-dir <change-dir>
```

For one recognized artifact, validate only that file with:

```bash
kepler workbench lint --file <file>
```

After the mutation, inspect every lint finding and resolve it before handoff or commit. The explicit selector
keeps unrelated outputs outside Kepler artifact scope; research notes and prototype files are not
linted as Kepler artifacts. A newly initialized pending task log is valid with its task identity
and heading but no attempt record, so it does not need a fabricated attempt to pass lint. Lint is an
artifact-shape and lifecycle check, not a substitute for semantic gates, tests, or review.

## Upgrading to the split workflow

Treat this artifact split as a clean break between changes. Finish every active old-format change
with the Kepler generation that created it. Only then, between changes:

1. Update the Kepler CLI and the skills loaded by your agent together from the same release or
   checkout.
2. Run `kepler setup` even when the release installer already ran it. This installs that
   generation's templates and guidelines into `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/`.
3. Verify the supported CLI surface against the installed generation:

   ```bash
   test -f ${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/task-progress.md
   test -f ${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/feedback.md
   test -f ${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/review.md
   test -f ${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/finish.md
   kepler workbench --help
   ```

   Reload the coding-agent session and confirm it exposes the matching skill generation. A missing
   template, failed workbench check, or older skill definition means the generation is not installed;
   stop before planning.
4. `kepler setup` copies global data from the previous hidden path `${XDG_CONFIG_HOME:-$HOME/.config}/.vialactea-works/kepler/` or legacy `~/.hamilton/` into `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/`. If both old global paths exist, the previous hidden path takes precedence. Before scaffolding an existing project that has `.hamilton/` but no `.kepler/`, run `kepler workbench context --all` from the project root to copy project data. Both copies leave their sources unchanged. A `no .kepler/changes/` result with exit code `1` means the project has no changes to list. If a canonical path already exists, Kepler uses it without merging or modifying legacy data.
5. Start the next change with the verified generation.

New work uses the seven-stage pipeline, skipping only the optional propose stage when appropriate,
with root `progress.md` only as the task index and ledger, `tasks/task-N/progress.md` and
`tasks/task-N/feedback.md` for task histories, root `review.md` for the whole-branch gate, and root
`finish.md` for finish history. Replace task-scoped `kepler-review` invocations with
`kepler-code-feedback`.

Setup does not delete stale helper files left by an older generation. `bun run purge` removes the
local CLI symlink and `~/.kepler-dist/`, but preserves Kepler's global data. Do not replace only the
CLI or only the skills while a change is active.

## Control flow

The pipeline reads as a line but runs a per-task loop followed by one change-level gate.

**The code–feedback loop** is driver-owned. `kepler-code` implements one task against its stable
checkpoint and `kepler-code-feedback` judges that task's complete diff. A fresh
`changes-requested` pass re-invokes code for the same task; a fresh approval advances to the next
task. The feedback parser and every downstream consumer use the physically latest parsed pass;
malformed latest evidence cannot revive an earlier approval. The skills do not call each other — a
person or `kepler-orchestrate` owns the loop.

The installed `plan.md` template makes that handoff explicit: each task runs Red before production
edits, reruns the same check to Green, and verifies behavior after Refactor before its final Verify
command. If a failing check is technically impossible, the task gives a reason and a repeatable
pre-change/post-change observation. Its Steps allow same-task corrections but never dispatch
feedback; the driver obtains fresh approval before advancing.

For each task, `kepler-code` follows a red → green → refactor cycle: establish a failing test in red,
make it pass in green, then refactor while keeping the test green. The refactor phase uses
`kepler-code-feedback` as its gate; green alone does not complete a task. A `changes-requested` result
returns the same task to a fresh correction cycle, with verification before advancement. When a task has
no conventional failing test, it must record the justification and use repeatable alternative verification.

**The whole-branch review gate** begins only after every task is `done` with fresh approved
feedback. `kepler-review` inspects the complete branch plus broader affected consumers and
composition. Implementation findings return to `kepler-plan` in re-plan mode, become numbered
remediation tasks, and traverse the ordinary code↔code-feedback loop before one new whole review.

**The finish gate** is where quality accumulates into a go/no-go. `kepler-finish-work` refuses to
complete unless the tree is clean, full tests and build pass, every task and task-history outcome is
done, every task feedback pass is fresh and approved, and the whole-branch review is fresh and
approved. Only then does it sync specs, record finish intent, execute the selected strategy, verify
the result, and persist the matching outcome.

**Standing boundaries** live in `AGENTS.md` and steer every step; change-specific boundaries
live in the design's three-tier list. An "Always" action proceeds without asking; a "Never"
action is a hard stop; an "Ask first" action is resolved by asking the requester or, unattended,
by the agent deciding and recording the reasoning.

## Concrete implementation

Four locations hold the framework:

- `bundle/templates/` — the canonical artifact templates, shipped with Kepler and installed
  to `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/` by `kepler setup`.
- `packages/cli/src/workbench/` — the workflow-mechanics implementation distributed through the CLI.
- `skills/kepler-*/` — the seven core pipeline skills and their optional companion skills, each a
  self-contained `SKILL.md`.
- a project's `.kepler/` — the per-project specs and change artifacts, created by
  `kepler-init`.

A typical run: a person invokes `kepler-propose` in their editor to shape the change with
Kepler's help, reviews and approves the artifacts, then hands off — the agent runs
`kepler-plan`, loops `kepler-code` and `kepler-code-feedback` over the tasks, runs one
`kepler-review` over the whole branch, and calls `kepler-finish-work`. Each step loads the
matching skill from `~/.claude/skills/` (or wherever
your agent reads `SKILL.md` files) and follows it against the artifacts.

## Status

The seven core pipeline skills, the `kepler-orchestrate` driver, and the distributed workbench
are the maintained workflow in this repository. `kepler setup` installs the versioned templates
and guidelines under `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/`; users install the portable skills separately for their coding
agent. The test suite covers the setup CLI, workbench operations, artifact templates, and skill
contracts.
