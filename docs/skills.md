# Skills reference (Assisted mode)

## Dependency-aware task execution

In dependency-mode v2, readiness is a derived projection, admission is guarded, implementation done is not feedback approval, and fully gated requires fresh approved task feedback. Every task states Goal, Acceptance, Depends on, Steps, Verify, and Commit; Files is optional guidance, not an allowlist. Necessary goal-serving unlisted edits are allowed within approved intent and project policy. Preserve strict Red → Green → Refactor and repeat the complete cycle for corrections.

Each task may reserve at most two lifetime expansions, each naming at most four concrete paths; reserve before edits. Quota is not reset or refunded by removing/revising records or reverting edits. Re-plan when the bounded scope is insufficient; do not add dependencies implicitly or weaken public/security policies. A pending ready task enters a lane only through guarded admission; in-progress and implementation-done-but-uncleared prerequisites keep descendants held while independent ready work can use isolated compatible lanes. A single coordinator serializes original-commit integration, executes the exact integrated Verify command, and performs guarded root publication. In v2 workers own task-local evidence and original commits, not root publication. `kepler workbench context` derives state; it does not schedule work.

Keep v1 and unversioned plans serial. Unknown modes fail closed; do not promise distributed scheduling. Preserve original-Base admission across retries, rebinds, and cache loss. Actor observation is not signer identity; owner-held intent references do not replace fresh artifact-only feedback. `done` and `blocked` are actor outcomes; `interrupted` and `unavailable` are neutral observations. Whole-branch review starts only after every active task is fully gated. See the [dependency execution example](examples/dependency-task-execution.md).

> **Kepler is in ALPHA.** These skills are the one layer you can rely on today — but the shape
> of the artifacts and the pipeline can still change without notice.

The skills are Kepler's **Assisted mode**: a portable, tool-agnostic bundle that carries a change
from idea to merge through a fixed sequence of steps. Each step is a self-contained `SKILL.md` that
names no tool and depends on no engine internals — only on the project's standards (`AGENTS.md`) and
the shared artifacts under the project's `.kepler/` directory. The same skill guides a person in an
editor and a coding agent.

For the design rationale behind the pipeline, see **[SDD framework](./sdd-framework.md)**. For how
this layer is installed and what the CLI does, see **[modes](./modes.md)**.
The **[canonical workflow reference](workflow_v2/README.md)** defines steps, internal states, transitions, gates, and artifact contracts.
Change that reference before you change workflow behavior.

## The pipeline

```
init ──▶ [ propose ] ──▶ plan ──▶ ( code ◀──▶ code-feedback ) ──▶ review ──▶ finish-work
  0        1 optional      2          3             4                5            6
                                     repeat per task              once per change
```

Seven core skills run in fixed sequence, with an optional pre-change planning stage (Wayfinder).
`kepler-init` runs once per project. `kepler-propose` is the optional heavyweight front door;
a tactical change starts at `kepler-plan`. If planning finds a bounded behavior change that needs
a requirements delta, `kepler-propose` handles only that approved delta, then returns the exact
committed revision for planning to revalidate. For every task, `code` and `code-feedback` loop until
that task passes; one whole-branch
`review` follows after all tasks pass, then `finish-work` closes the change. `kepler-orchestrate`
drives that sequence in one session using subagents. `kepler-critique` is an optional design-phase
gate before planning. Neither Wayfinder nor critique is part of the seven-skill core line.

`kepler-compose-spec` sits outside this per-change line: it authors canonical specs
(`.kepler/specs/`) directly — reformatting existing specs into the current human-readable shape,
or writing them from the application code — for projects adopting Kepler or migrating an old spec
format. The pipeline never needs it; it is a maintenance and bootstrap tool.

**Start at planning when appropriate.** `plan.md` is the required declarative artifact; planning
also initializes the required root ledger and task progress files. The planning step uses richer
proposal, requirement, and design artifacts when present and otherwise works from the raw request.

## Setup

Assisted mode needs two things in place:

1. **Artifact templates, guidelines, and the workbench CLI**, installed for the current Kepler
   generation:

   ```bash
   bun run install-local     # build + symlink the `kepler` CLI
   kepler setup            # installs bundle/{templates,guidelines}/ → ${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/
   kepler workbench --help
   ```

   The skills read the installed templates from `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/<name>.md` and use the
   distributed `kepler workbench` command for workflow mechanics.

2. **The skills available to your coding agent.** The pipeline skills live in `skills/kepler-*/`.
   Make them discoverable to your agent — for Claude Code, copy or symlink the `skills/kepler-*`
   directories into a skills directory it loads (e.g. `~/.claude/skills/`), or point the agent at the
   `SKILL.md` paths directly. There is no CLI command that installs these into a coding agent; the
   skills are plain Markdown, portable across any agent that can load a `SKILL.md`.

Then, once per project, run the `kepler-init` skill (below) to scaffold `.kepler/` and write
`AGENTS.md`.

Treat the CLI and agent-loaded skills as one installed generation. Finish an active change before
updating either side, update both from the same release, run `kepler setup`, and verify
`kepler workbench --help` before starting new work. Setup does not delete stale helper files from
an older generation. `bun run purge` removes the local CLI symlink and `~/.kepler-dist/`, but
preserves Kepler's global data. The complete migration guidance is in [Upgrading to the split
workflow](./sdd-framework.md#upgrading-to-the-split-workflow).

## Workbench

The distributed `kepler workbench` command is the supported workflow-mechanics surface used by
these skills. Its subcommands are:

- `kepler workbench isolate` — check, create, or verify an isolated workspace.
- `kepler workbench diff` — record checkpoints and package task or change diffs. Whole-change packaging requires an explicit `--target-branch refs/remotes/<remote>/<branch>` or `refs/heads/<branch>`.
- `kepler workbench precondition` — evaluate finish-work gates against the explicit `--target-branch` reference; the command never infers a default branch.
- `kepler workbench context` — inspect change artifacts and lifecycle state.
- `kepler workbench task-state` — guard task admission (`--admit`), before-edit reservations (`--reserve`), and integrated publication (`--publish`).
- `kepler workbench prototype` — create, resume, or verify prototype branches.
- `kepler workbench lint` — validate one file or one change directory.

Lint requires exactly one scope selector:

```bash
kepler workbench lint --file <file>
kepler workbench lint --change-dir <dir>
```

Artifact-writing skills choose the narrowest selector for the mutation. Use `--file` when one
recognized artifact is created or edited, such as a canonical spec, map, ticket, route, feedback,
review, critique, or finish history. Use `--change-dir` when a skill creates or updates a
coordinated change directory, such as proposal artifacts or the plan, progress, and task-log
scaffold. Run the selected lint after the mutation boundary and before the next mutation, handoff,
or commit.

A nonzero lint result is a failed gate: resolve every warning or error, rerun the same scoped
command, and do not hand off or commit until it succeeds. Lint stays within the explicit selector;
unrelated outputs such as research notes and prototype files remain outside Kepler artifact lint,
and skipped unrelated files do not affect success. A newly initialized pending task log is valid
with its task identity and heading but no attempt record, so planning must not invent a synthetic
attempt merely to satisfy lint. Conventional artifact filenames without frontmatter produce
warnings, while malformed recognized artifacts fail closed; lint returns success only when no errors
or warnings remain. For artifacts that already exist, lint's exit status is the sole authority
on format and schema validity. Skill templates describe how to author new content; they must not
reject a lint-valid artifact because it includes additional frontmatter or body content, uses a
different accepted layout, or differs from the installed template. A missing file, wrong task,
uncommitted feedback, stale review, or unmet acceptance criterion remains a separate workflow
or evidence gate; lint does not check those conditions.

### Task-state

Select exactly one of `--admit`, `--reserve`, or `--publish`. Each operation takes
`--task <number>` and `--expected-head <full-commit>`; use `--change-dir <directory>`
when running outside the change directory.

- `--admit` requires `--worker <identity>`, `--worktree <directory>`, and an explicit
  `--target-branch refs/heads/<branch>` or `refs/remotes/<remote>/<branch>`. Optional
  `--retry` rebinds eligible recovery without resetting the original Base.
- `--reserve` requires `--reservation '<json>'` containing `id`, `attempt`, `prerequisite`,
  `necessity`, `evidence`, `paths`, and `verify`. An owner reservation before admission also
  requires `--target-branch <ref>`. Commit the reservation before editing its paths.
- `--publish` requires `--task-head <full-commit>`. A `done` implementation also requires
  `--verify '<exact task Verify command>'`; the coordinator executes it after integration
  before publishing root status. Optional `--response` accepts `done`, `blocked`,
  `interrupted`, or `unavailable`; neutral responses do not publish an implementation outcome.

Admission binds eligible dependency-mode work to an isolated lane and reports distinct full identifiers for immutable Task Base, coordinator source HEAD, admission commit, attempt start HEAD, and next coordinator HEAD. Workers record only the attempt start as that attempt's `Start HEAD`; they do not replace Task Base with a retry's newer HEAD. Stale expected-head refresh is allowed only across a first-parent chain of verified admission-only ledger commits from the same independently observed coordinator and exact repository/source/target refs. Material edits, publications, and feedback commits are not refresh events. Guarded v2 publication records versioned review coverage for each covered attempt, original task-owned commits and paths, and the exact integration delta. Review packages retain verified integration deltas from every publication across corrections. Feedback `Coverage:` must identify that v2 publication commit; verified v1 history remains readable with a conservative broad Base-to-Head package. These operations guard local state transitions; they do not schedule work or grant feedback clearance.

## The skills

Each `SKILL.md` supplies the execution procedure for its skill. This table is a navigation aid.
The [canonical workflow reference](workflow_v2/README.md) defines the required workflow behavior.

### `kepler-init` — set up a project *(step 0, once per project)*

Prepares an existing repository for the pipeline.

- **When:** once, before the first change.
- **Inputs:** an existing git repository; anything you want emphasized in the standards.
- **Produces:** `AGENTS.md` at the project root (the standing standards every later step reads,
  covering commands, testing, structure, code style, git workflow, and boundaries) and the
  `.kepler/` workspace (`specs/`, `changes/`) and canonical `.kepler/specs/glossary.md`.
- **Notes:** read-only exploration first; idempotent; preserves existing standards and glossary content, including migrated language. Init seeds sourced, context-scoped terms, lints the glossary and holds readiness on material ambiguity.
- Source: [`skills/kepler-init/SKILL.md`](../skills/kepler-init/SKILL.md)

### `kepler-wayfinder` — chart the route before a change *(optional pre-change planning stage)*

Compiles a cleared map into a destination-and-path handoff for a goal too big for one session.
The route is not a lightweight unit index: it gives downstream work the stable synthesized context
needed to understand what will be true, why this path was chosen, and how delivery is bounded.

- **When:** before `kepler-propose`, for a goal too big for one change session — one that needs
  its way found before the SDD loop begins.
- **Inputs:** a complex goal; the project's `AGENTS.md`.
- **Produces:** a map at `.kepler/maps/<effort>/` (`map.md`, `tickets/`, and `route.md` once the
  map clears). New routes use five core sections — Point of departure, Destination, Path chosen,
  Shipping rules, and Units — while frontmatter owns the
  route status and each unit's identity, lifecycle status, dependencies, and backing tickets.
- **Notes:** Wayfinder clears fog and compiles the destination and causal path; it does not execute
  the units. `kepler-propose` and `kepler-plan` turn units into implementation artifacts,
  while `kepler-code` and `kepler-finish-work` build and ship them. Downstream processes may
  update mutable lifecycle metadata without rewriting the stable synthesized body. A non-code
  effort — a presentation, an RFC, a strategy — binds its own executing process to the same
  contract. `kepler-wayfinder` is a fork of upstream `mattpocock/skills` (MIT); see
  [`NOTICE`](../NOTICE) for the full legal credit.
- Source: [`skills/kepler-wayfinder/SKILL.md`](../skills/kepler-wayfinder/SKILL.md)

### `kepler-propose` — idea → proposal, requirements, design *(step 1, optional)*

The heavyweight front door. Turns an idea into a well-formed change through collaborative dialogue,
gating on approval before any implementation. Tactical changes start at `kepler-plan`; when planning
finds a bounded behavior change that needs a requirements delta, this skill also supports a
requirements-only approval path with no proposal or design, then returns the committed delta to
planning for revalidation.

- **When:** for a change that warrants a spec; skip it for a tactical change.
- **Inputs:** a change idea; the canonical glossary and existing specs (`.kepler/specs/`); relevant domain and architecture documentation; `AGENTS.md`.
- **Produces**, in `.kepler/changes/<YYYY-MM-DD-title>/`: `proposal.md` (why, sourced language, domain scope and boundary impact), `requirements/<capability>.md` (what, in delta form), `design.md` (domain model, architectural realization and supporting decisions). New full-path proposals name involved subdomains and bounded contexts and identify each capability's represented scope. Older projects may use sourced project documentation when the glossary is absent.
- **Notes:** one question at a time; proposes 2–3 approaches with trade-offs; design explains affected package roles, ports/adapters and code attribution using sourced language, with relevant commands, states and invariants. It must clear semantic coverage and a code-quality self-review before the gate opens. On handoff it discloses the worktree it created
  and, when working with a person, asks before proceeding to `kepler-plan`.
- Source: [`skills/kepler-propose/SKILL.md`](../skills/kepler-propose/SKILL.md)

### `kepler-critique` — review the propose artifacts *(optional design-phase gate)*

Critiques a change's `proposal.md`, `requirements/`, and `design.md` before planning — the
design-phase counterpart to `kepler-review`. Returns a numbered findings report and a verdict.
**Reviews only; never edits the artifacts.**

- **When:** on demand, after `kepler-propose` and before `kepler-plan`, to catch design defects
  while nothing has been built yet.
- **Inputs:** the change directory; `proposal.md` / `requirements/` / `design.md`; the actual
  codebase (to ground every reference); the canonical specs (`.kepler/specs/`); `AGENTS.md`.
- **Produces:** a verdict (`approved` / `changes-requested`) and a numbered, located findings list —
  printed to chat and persisted to `critique.md` in the change directory.
- **Notes:** checks scoped terminology, domain-model coverage, package roles, ports/adapters, code attribution and boundary ownership alongside logical consistency. Existing references must match the codebase; clearly proposed additions need supported ownership and contracts, and surviving consumers must not depend on removed code. Checks scale to relevant responsibilities rather than requiring every optional table. Applies the same `references/code-quality.md`
  rubric `kepler-propose` self-reviews against, capturing a Quality Lens. Its single `decision`
  field records whether the user accepted an approval, applied requested changes, rejected the
  critique, or skipped the decision. Accepted, applied, and rejected critiques are settled and do
  not require another critique pass. On handoff the skill names the applicable next core stage and,
  working with a person, asks before proceeding.
- Source: [`skills/kepler-critique/SKILL.md`](../skills/kepler-critique/SKILL.md)

### `kepler-plan` — change → executable task contract *(step 2, required)*

Decomposes the work into small, TDD-sized, independently verifiable tasks. `plan.md` is the required
declarative handoff contract between planning and coding. **This skill never writes production code.**

- **When:** always — the pipeline's mandatory step. Plans from an existing design/requirements when
  present, or straight from a request.
- **Inputs:** a change directory (created if missing); `design.md` / `requirements/` if they exist;
  `AGENTS.md`.
- **Produces:** the declarative `plan.md` task contract; root `progress.md`, initialized as the
  current-status ledger with one linked row per active task; and one initialized
  `tasks/task-N/progress.md` implementation-history file per task.
- **Notes:** all sequencing happens here because code follows each task's steps verbatim. Each task
  runs Red before production edits, reruns the same check to Green, verifies behavior after Refactor,
  and then runs its Verify command: related tests, project type checking and linting when configured.
  Projects without linting record `lint: not configured`; configured checks must pass.
  If a failing check is technically impossible, the task specifies
  a reason and repeatable pre-change/post-change observation. Corrections stay in the same task;
  the serial driver, not the task Steps, dispatches feedback and awaits fresh approval. Re-plan
  preserves done tasks byte-for-byte and stable numeric identities, appends remediation tasks,
  and reconciles the root ledger without rewriting task histories. A renamed non-done task
  synchronizes its unescaped title across the plan heading, root metadata, and task-local heading
  while escaping the root table display; its status, path, link, and attempts stay unchanged.
  After the amendment, run `kepler workbench lint --change-dir <change-dir>`. On handoff it names
  `kepler-code` or `kepler-orchestrate`.
- Source: [`skills/kepler-plan/SKILL.md`](../skills/kepler-plan/SKILL.md)

### `kepler-code` — implement one task *(step 3)*

Implements exactly one active planned task, records its execution state, then self-reviews and
commits.

- **When:** for each task's first implementation attempt, and again when fresh task feedback requests
  changes.
- **Inputs:** one exact active `Task N`; its root ledger metadata entry, row, and linked
  `tasks/task-N/progress.md`; its stable `tasks/task-N/.base` checkpoint; `AGENTS.md`; and, on a
  correction, that task's `feedback.md`.
- **Produces:** for a successful attempt, the task's tests and code plus one implementation commit
  that includes the appended `tasks/task-N/progress.md` attempt and the assigned root metadata entry
  and row's transition through `in-progress` to `done`. For a graceful blocker, an artifact-only
  bookkeeping commit contains the appended blocked attempt and the assigned entry and row set to
  `blocked`; partial production edits remain uncommitted.
- **Notes:** `kepler-plan` initializes the root ledger and task progress file; `kepler-code` changes
  only its assigned root metadata entry and row, and appends to that task-local history among
  execution artifacts. The empty task log stays `pending` until an attempt exists; a previously
  finalized log retains its latest `done` or `blocked` local status during a correction and is
  never made locally `in-progress` before an attempt exists. Finalization sets its local status
  to `done` or `blocked` before synchronizing the root metadata entry and row. It never edits
  `plan.md`, sibling task state, feedback, root review, or finish history. The checkpoint stays
  fixed across corrections so code feedback always receives the complete task diff.

For each task, `kepler-code` follows a red → green → refactor cycle: establish a failing test in red,
make it pass in green, then refactor while keeping the test green. The refactor phase uses
`kepler-code-feedback` as its gate; green alone does not complete a task. A `changes-requested` result
returns the same task to a fresh correction cycle, with verification before advancement. When a task has
no conventional failing test, it must record the justification and use repeatable alternative verification.

- Source: [`skills/kepler-code/SKILL.md`](../skills/kepler-code/SKILL.md)

### `kepler-code-feedback` — review one task diff *(step 4, tactical gate)*

Reviews exactly one implemented task within its stable diff and records a tactical verdict.
**Reviews only; never edits code, plan artifacts, or task status.**

- **When:** after every `kepler-code` attempt that leaves its task `done`.
- **Inputs:** one exact `Task N`; the stable diff from `tasks/task-N/.base` through the supplied
  implementation Head; the task's acceptance criteria and cited constraints; its physical latest
  `tasks/task-N/progress.md` attempt; and `AGENTS.md`.
- **Produces:** an `approved` or `changes-requested` pass appended to
  `tasks/task-N/feedback.md`, committed in an artifact-only bookkeeping commit.
- **Notes:** the task diff is the inspection boundary, except for one named outside risk. The
  single owning feedback file is append-only; only fully evidenced feedback and review passes carry
  their own `Base`, `Head`, and `Verdict` fields, and no numbered `feedback-k.md` files are used.
  Histories may be `legacy-global` with structural bodies and global provenance bound only to the
  physically last legacy pass, `transitioned` with a structural prefix and explicit suffix, or
  `modern` with explicit evidence throughout. Structural legacy records are provenance-free, cannot
  supply a verdict, and remain distinct from the authoritative latest evidenced record. `Base` and
  `Head` contain full commit identifiers; `Verdict` contains an allowed verdict enum value
  (`approved` or `changes-requested`). The physically latest evidenced pass is authoritative, and a
  pass is fresh only when its reviewed Head contains the latest task-progress commit. Requested
  changes return the same task to `kepler-code`; approval advances to the next task or the whole
  review.
- Source: [`skills/kepler-code-feedback/SKILL.md`](../skills/kepler-code-feedback/SKILL.md)

### `kepler-review` — inspect the whole branch *(step 5, merge gate)*

Reviews how every implemented task composes across the complete branch and records the final
inspection verdict before finish-work. **Reviews only; never edits implementation or task state.**

- **When:** once all active tasks are `done` with fresh approved task feedback, and again after any
  remediation tasks complete.
- **Inputs:** the complete branch range from its actual target-branch merge base through a supplied
  full Head; all change artifacts, the root ledger, every active task's latest implementation and
  feedback evidence; the complete diff; and `AGENTS.md`.
- **Produces:** an `approved` or `changes-requested` pass appended to the single owning
  `<change>/review.md` history, committed in an artifact-only bookkeeping commit.
- **Notes:** inspection starts with the diff but must trace affected consumers, cross-task
  composition, omissions, and repository-wide assumptions. Only fully evidenced feedback and review
  passes carry their own `Base`, `Head`, and `Verdict` fields; the physically latest evidenced pass
  governs, and no numbered `review-k.md` files are used. Histories may be `legacy-global`,
  `transitioned`, or `modern`; structural legacy records are provenance-free, cannot supply a
  verdict, and remain distinct from the authoritative latest evidenced record. `Base` and `Head`
  contain full commit identifiers; `Verdict` contains an allowed verdict enum value (`approved` or
  `changes-requested`). The first modern append preserves all legacy pass bodies, removes exactly the
  global provenance, and appends an explicit pass-local suffix atomically. Later appends remain
  pass-local, and malformed transitions fail closed. The reviewed Head must contain the latest
  material change commit. Requested implementation changes return to `kepler-plan` in re-plan mode;
  an approved fresh pass hands off to finish-work.
- Source: [`skills/kepler-review/SKILL.md`](../skills/kepler-review/SKILL.md)

### `kepler-finish-work` — close the change *(step 6)*

Gates the change, folds approved requirement deltas into canonical specs, records finish history,
and executes the selected finish strategy.

- **When:** after every task is `done` with fresh approved task feedback and root `review.md` has a
  fresh approved whole-branch pass.
- **Inputs:** the plan and root task ledger; every task's latest progress and feedback; the latest
  root review; approved proposal, design, and requirement deltas; existing `finish.md`; the finish
  strategy (`local-merge`, `pull-request`, or `no-op`); and `AGENTS.md`.
- **Produces:** synchronized `.kepler/specs/<capability>.md` files, the verified merge / request /
  no-op result, and a paired `Attempt N` and `Outcome N` history in root `finish.md`.
- **Notes:** the hard gate treats these as separate requirements: the exact root ledger has every
  row `done`; every row links to `tasks/task-N/progress.md`, where the exact matching H1 is
  `# Task Progress: Task N — <title>` and the physical latest attempt has `Outcome: done`; every task
  has fresh approved feedback; the whole branch has a fresh approved review; the tree is clean; and
  full tests and build pass. It commits intent before external effects and records only observed
  results afterward; a dangling attempt is reconciled from actual repository and provider state
  before any new attempt.
- Source: [`skills/kepler-finish-work/SKILL.md`](../skills/kepler-finish-work/SKILL.md)

### `kepler-orchestrate` — run a whole plan *(driver)*

Drives an entire `plan.md` through task implementation, task feedback, and one whole-branch review.
**Coordinates only; never edits code or stage-owned evidence itself.**

- **When:** to execute a full plan unattended instead of driving each task's code↔code-feedback loop
  and the final whole review by hand.
- **Inputs:** a change directory containing the plan, root task ledger, linked task histories and
  checkpoints, any task feedback and root review, approved design context, and `AGENTS.md`.
- **Produces:** every task committed with `done` status and fresh approved feedback, followed by one
  committed, fresh, approved whole-branch review and a clean handoff to `kepler-finish-work`.
- **Notes:** its resume matrix combines each root status with the physical latest feedback verdict
  and reviewed-Head freshness; after all tasks pass, a second matrix governs root review freshness.
  Whole-review implementation findings return to `kepler-plan` for numbered remediation tasks,
  which traverse the ordinary task loop before review runs again.
- Source: [`skills/kepler-orchestrate/SKILL.md`](../skills/kepler-orchestrate/SKILL.md)

### `kepler-compose-spec` — author canonical specs directly *(out-of-band)*

Writes or rewrites `.kepler/specs/<capability>.md` outside the change pipeline, in two modes:
**reformat** (an existing spec → the human-readable skeleton) and **from-code** (explore the
application read-only and write specs from what it does). The front door for canonical specs — every
other capability-behavior path creates a spec when `kepler-finish-work` distills a completed change. Init establishes the separate canonical glossary.

- **When:** adopting Kepler on an existing codebase (bootstrap specs from code), or migrating specs
  written in the older `Requirement:` / `Scenario:` form into the current shape.
- **Inputs:** the mode and its target (spec files to reformat, or the code to document); existing `.kepler/specs/`, the canonical glossary and authoritative domain/architecture documentation; `AGENTS.md`.
- **Produces:** canonical specs in the skeleton (`## Overview` / `## Contract` / `## Behavior` +
  Examples / `## Invariants` / `## Decisions`), at altitude, in human-readable prose.
- **Notes:** reads code and writes specs only — never edits application code, never creates a change
  directory. Reformat preserves every durable fact; from-code documents what the code actually does,
  flagging inferred behavior rather than inventing guarantees. Both modes retain supported responsibility, public model contracts, invariant ownership and durable boundary policies in the five canonical sections. Private wiring and code attribution remain in design, and a proposed design is not proof of current behavior.
- Source: [`skills/kepler-compose-spec/SKILL.md`](../skills/kepler-compose-spec/SKILL.md)

## Domain language and capability scope

`.kepler/specs/glossary.md` is the main source of project language, established by init. Terms have definitions, context scope, aliases or terms to avoid, and source references. Established project documentation supplements missing meanings; a conflict requires requester resolution, not a silent rewrite. Working map glossaries remain effort-local and are created lazily. Closing an effort promotes confirmed language by context without replacing a committed meaning merely because a working term is newer.

A capability is a cohesive, durable responsibility with a clear boundary and observable contract. It may represent a domain, subdomain or bounded context, including infrastructure responsibilities. A subdomain describes a problem area; a bounded context delimits a model and language. Capability is the specification unit, not a synonym for either. Name the represented scope and avoid duplicate parent/child contracts.

For example, `rest-api` may represent an infrastructure context that owns the external model and translation into domain operations while domain contexts retain business rules. REST alone does not establish a bounded context; an HTTP adapter may belong within an existing one. A package or endpoint is not automatically a context or capability.

New proposals add Domain Context (Ubiquitous Language; Subdomains and Bounded Contexts) and Affected Boundaries under Impact. Goals use the sourced meanings, capability entries identify scope and responsibility, and Impact explains ownership, contract, trust and coordination changes. Design explains the domain model and architecture: affected packages, provided/required contracts, ports and adapters, code attribution, relevant model behavior and supporting decisions. Distinguish existing, proposed and removed references; cite ownership and language sources instead of deriving contexts from folders. Keep the seven lint-required design headings concise and omit optional tables or sections when prose or upstream references provide coverage. Material unknown language, ownership or contracts remain approval blockers. These semantic authoring checks are not new schema gates; historical lint-valid designs are not invalid for missing the new model or mapping sections. Historical proposals and specs remain valid and unchanged. Capability slugs, metadata and `requirements/<capability>.md` → `specs/<capability>.md` mappings stay stable. The requirements-only path still creates no proposal or design.

Canonical specs express responsibility and related contexts in Overview, public ports/commands/events in Contract, observable transitions in Behavior, lasting rules and owners in Invariants, and reusable boundary policies in Decisions. Preserve durable facts during reformat and verify current behavior in from-code; private wiring and code attribution are not canonical requirements. See [design examples](./sdd-framework.md#design-examples) for a multi-context change and a small change with intact boundaries.

## Artifacts and layout

Templates are global; artifacts are per-project. The canonical templates ship in the repository's
`bundle/templates/` and are installed to `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/` by `kepler setup`. Every change's
artifacts live under the project's `.kepler/` directory:

```text
.kepler/
  specs/                              # canonical capability truth and project language
    glossary.md                       # context-scoped ubiquitous language, established by init
    <capability>.md
  changes/
    <YYYY-MM-DD-title>/
      proposal.md                     # optional — why
      design.md                       # optional — domain model and architecture
      requirements/<capability>.md    # optional — what (delta form)
      critique.md                     # optional — design-phase review of the propose artifacts
      plan.md                         # required — the handoff contract
      progress.md                     # required — current task ledger
      tasks/
        task-N/
          progress.md                 # implementation attempt history
          feedback.md                 # task-feedback verdict history
      review.md                       # whole-branch review history
      finish.md                       # finish attempt and outcome history
```

**Changes are ephemeral; specs are durable.** A change directory records one unit of work and its
history, with requirements written as deltas (ADDED / MODIFIED / REMOVED / RENAMED). When the change
finishes, those deltas are folded into `specs/`, the project's consolidated, always-current
requirements truth.

`plan.md` remains the declarative task contract. Planning initializes the required root
`progress.md` ledger and linked task progress files; code updates current status in the root and
keeps detailed attempts under the task. Feedback, whole-branch review, and finish history each live
in their separate owner artifact rather than being mixed into progress.

Only fully evidenced feedback and review passes carry `Base`, `Head`, and `Verdict`; structural
legacy records are provenance-free, cannot supply a verdict, and remain distinct from the
authoritative latest evidenced record. `Base` and `Head` contain full commit identifiers; `Verdict`
contains an allowed verdict enum value (`approved` or `changes-requested`). Feedback and review
evidence is per-pass and append-only. The three supported modes are `legacy-global` structural
history whose global provenance binds only to the physically last legacy pass, `transitioned`
structural prefix plus explicit suffix, and `modern` all-explicit history. The first modern append
preserves every existing pass body byte-for-byte, removes exactly the global provenance, and appends
the next complete pass-local record atomically; later appends remain pass-local. Lint, context,
precondition, and finish-work share the physically latest evidenced pass and fail closed when a
transition or latest pass is malformed. Ownership stays in the single feedback or review file
rather than numbered pass files.

## The task loop and whole-branch gate

The pipeline reads as a line but contains two distinct review scopes. For each task,
`kepler-code` implements against one stable checkpoint and `kepler-code-feedback` judges that
complete task diff. A fresh `changes-requested` pass sends the same task back to code; a fresh
approval lets the driver select the next task. The skills never call each other — a person or
`kepler-orchestrate` owns the loop. The physical latest parsed feedback pass is the shared
decision point, so malformed latest evidence cannot revive an earlier approval.

After every active task is `done` with fresh approved feedback, `kepler-review` inspects the whole
branch and its broader repository impact once. Implementation findings return to `kepler-plan`
in re-plan mode, become numbered remediation tasks, and pass through the same task loop before the
whole review repeats. Only a fresh approved whole-branch review reaches `kepler-finish-work`,
whose final gate also requires a clean tree, full tests and build, an exact completed root ledger,
and fresh approved task feedback.
