# Progress — SDD framework

Working ledger for building Hamilton's spec-driven-development framework (skills +
artifacts). We are dogfooding: this change folder is itself the framework's first
change.

---

## Current state (top of ledger — read this first)

This section is the consolidated, accurate picture. Everything below it is the **historical,
append-only ledger** and may use pre-rename workflow names (`feature-dev`, `bug-fix`,
`quarantine-broken-tests`) or describe intermediate states (e.g. a workflow-local `reviewer`)
that this section supersedes.

**Skills** (`skills/hamilton-*`): init, propose, plan, code, review, finish-work — the
tool-agnostic source of truth for each pipeline step.

**Shared agents** (`bundle/agents/`): `setup` (variant-agnostic baseline: `current_branch`,
`baseline_sha`, build/test/ci), `planner` (→`hamilton-plan`), `reviewer` (→`hamilton-review`),
`verifier` (general-purpose goal-verifier, NOT tied to code/SDD; unified output
`{status: done|retry|failed, verified, issues[]}`), plus `pr`, `do`.

**Workflows** (`bundle/workflows/`):

| Workflow | Shape |
|----------|-------|
| `development` (was feature-dev) | plan → setup → applyPlan(forEach: code→test) → review → reworkIfNeeded (reuses implementTask) |
| `bugfix` (was bug-fix) | triage → investigate → setup → plan → applyPlan(forEach: fix via hamilton-code) → review |
| `security-audit` | scan → prioritize → setup → plan → applyPlan(forEach: fix-story via hamilton-code) → review → test |
| `fix-broken-tests` (was quarantine-broken-tests) | setup → quarantine → review |
| `scaffold` | scaffold → verify (general verifier) |
| `do` | single doer |
| `code-review` (new) | reviewer + codebase-wide TODO/FIXME scan |
| `increase-test-coverage` (new) | setup → plan → applyPlan(forEach: cover via hamilton-code) → review |
| `write-user-docs` (new) | draft (Diátaxis + coverage map) → verify |
| `write-release-docs` (new) | draft (sell-test + doc-drift) → verify |

**Skill bindings** (`agent.yml skills:`): planner→hamilton-plan; developer / fixer / sec-fixer
/ test-writer→hamilton-code; reviewer→hamilton-review.

**Resolved decisions:** co-author email → `hamilton@caioferreira.dev` (+ TODO to make it
config-driven); `verifier` kept general (NOT bound to hamilton-review) with a unified schema;
`fixer`/`sec-fixer` bound to hamilton-code behind a plan step + fix loop; `planner` and
`reviewer` promoted to shared; the three code workflows' review gate uses the shared `reviewer`.

**Live open items:**
- Wire `hamilton setup` to install `bundle/templates/` + the shared agents.
- Reconcile external `src/` + `tests/` references to the renamed workflows (engine/test code
  still names `feature-dev`, etc. — not changed here).
- Bare-ref convention ([B2]/[S2]) — are `{{severity}}`-style refs valid engine aliases?
- Decide `qa-verifier`'s fate ([N1]) — now unused after fix-broken-tests moved to `reviewer`.
- Whether `bugfix`/`security-audit` want a review→fix retry loop like `development`'s.
- Legacy spec systems (`openspec/`, `.superpowers/`) consolidation; `hamilton-finish-work`
  spec-sync; end-to-end dogfood run.

**Housekeeping leftovers** (sandbox mount blocks `rmdir`): `bundle/.trash/planner_emptied`,
unused `fix-broken-tests/agents/qa-verifier/`, unused `schemas/verify.json` in
bugfix/security-audit/fix-broken-tests. Delete when convenient (empty dirs aren't git-tracked).

---

## Core principles

- **Skills are the single source of truth** for how to do each step, and are
  **tool-agnostic** — usable by a human in Claude Code/Opencode, by a Hamilton
  agent, or a mix (human runs step 1, hands off the rest to Hamilton). A skill must
  never assume Hamilton mechanics.
- **Agent INSTRUCTIONS.md is a thin wrapper**: "load skill X, then emit
  `write_task_output` per this schema." Hamilton-specific concerns (write_task_output,
  context templates, output schemas) live in the agent/task prompt, never in the skill.
- **Start-anywhere**: the PRD/SRS/SDD front door is optional. Every downstream skill
  degrades gracefully — consumes the upstream artifact if present, else works from the
  raw change description. Only `plan.md` is required.
- **Orchestrator owns the loop** (human or Hamilton DAG). review→code retries are
  driven by review feedback, mirroring Hamilton's existing verifier/retry model.

## Decisions (2026-07-04)

1. **Living specs + sync at finish.** `.hamilton/specs/<capability>.md` is durable
   truth. Requirements inside a change use delta headers (ADDED/MODIFIED/REMOVED/
   RENAMED); `hamilton-finish-work` folds them into the canonical spec. No separate
   sync skill.
2. **Standards mapping:** proposal = PRD (why), requirements = SRS (what,
   ISO/IEC/IEEE 29148-inspired), design = SDD (how, IEEE 1016-inspired). The
   normative "what" lives in requirements/, not design.
3. **29148-inspired, not conformant** — take the spirit (testable, unambiguous,
   normative requirements + scenarios), drop the heavy section apparatus.
4. **Pipeline:** propose → plan → code → review → finish-work. Loops handled by the
   orchestrator, not encoded as linear steps.
5. **Skills invoked by agents/tasks** — agents and task prompts still exist and matter;
   they bind skills to Hamilton.

## Decisions (2026-07-04, cont.)

6. **progress.md is the execution ledger.** Each change has a `progress.md`; the code step
   appends an entry per task (what changed, verify result, notes). Skills NEVER write status
   into plan.md — plan.md stays declarative and its tasks have no status field. This
   resolves the earlier status-ownership open question: the answer is progress.md.
7. **hamilton-code takes the task in one of two forms, never both:** by reference
   (plan.md + task id) or inline (task block as text/JSON).
8. **hamilton-code is a faithful executor for weak models (e.g. haiku).** It follows a
   task's Steps verbatim and does no design. TDD sequencing is the plan step's
   responsibility — the plan writes test-first steps; the coder just runs them.

## Skill authoring conventions

Learned while writing hamilton-plan; apply to every skill:

- **No tool names.** Never cite Claude Code, Opencode, or any host in descriptions or
  body. Skills are tool-agnostic; the human/agent binding is not the skill's concern.
- **Self-explanatory.** Define terms the skill uses (e.g. "the pipeline") — an agent
  loading the skill cold has no other reference.
- **No Hamilton-internal mechanisms.** Do not reference guideline files, write_task_output,
  the DAG, etc. Project standards = `AGENTS.md` only. Hamilton specifics live in the agent
  wrapper, not the skill.

## Pipeline (target)

| Step | Skill                  | Consumes                    | Produces            |
|------|------------------------|-----------------------------|---------------------|
| 0    | `hamilton-init`        | existing project            | AGENTS.md + `.hamilton/` scaffold (one-time) |
| 1    | `hamilton-propose`     | idea / prompt               | proposal, design, requirements |
| 2    | `hamilton-plan`        | design (or prompt)          | plan.md             |
| 3    | `hamilton-code`        | one task from plan.md       | code + self-review  |
| 4    | `hamilton-review`      | code changes                | review feedback     |
| 5    | `hamilton-finish-work` | approved work               | merge/PR/no-op + spec sync |

## Artifacts produced

- `.hamilton/templates/` — document templates (provisional location; move into skill
  package later). **Awaiting review.**
  - `proposal.md` (PRD), `design.md` (SDD)
  - `requirements-change.md` (SRS delta, lives in changes/) +
    `requirements-spec.md` (SRS canonical, lives in specs/) — split per review
  - `plan.md` (required handoff contract — TDD-sized tasks, one-task-at-a-time
    consumption, depends-on for DAG parallelism, done-when block)
  - `README.md` (index)
- `skills/hamilton-plan/` — `SKILL.md` (tool-agnostic: plan-first read-only exploration,
  TDD-sized decomposition, graceful degradation from design or raw request, self-review) +
  `references/plan-template.md`. **Reviewed.**
  - Note: the plan template now exists both in `.hamilton/templates/plan.md` and in the
    skill's references. Reconcile under the "final home for templates" task — likely the
    skill is canonical and hamilton-init copies into `.hamilton/templates/`.
- `skills/hamilton-code/SKILL.md` — faithful executor: takes one task (by reference OR
  inline, never both), follows its Steps verbatim, verifies, spec-referenced acceptance
  check, code-quality self-review, commits, and appends to progress.md. Never edits
  plan.md. Supports re-invocation with review feedback. **Awaiting review.**
- `.hamilton/templates/progress.md` — execution-ledger template. plan.md templates updated:
  Status field removed; "Done when" points to progress.md.
- `skills/hamilton-review/SKILL.md` — the quality gate (judge, never fixes): reviews the
  diff against plan/requirements/standards across correctness, tests, security, idioms,
  scope, boundaries; emits a verdict + located, actionable, blocking-vs-suggestion feedback
  block (consumable by hamilton-code). Writes the full verdict + feedback to a dedicated
  `review.md` in the change directory (newest pass at bottom) and a one-line summary to
  progress.md. **Awaiting review.**
- `.hamilton/templates/review.md` — review artifact template.
- `skills/hamilton-finish-work/SKILL.md` — the finish step: gate (clean tree, tests green,
  all tasks done, review approved), fold requirement deltas (ADDED/MODIFIED/REMOVED/RENAMED)
  into canonical `.hamilton/specs/`, finish via local-merge / pull-request / no-op, record a
  finish entry in progress.md. **Awaiting review.**

- `skills/hamilton-init/SKILL.md` — step 0: explore the project (read-only), write AGENTS.md
  covering the six standing areas (+ three-tier boundaries), scaffold `.hamilton/`
  (specs/, changes/). Does not create templates (those are global). Idempotent; won't
  clobber an existing AGENTS.md. **Awaiting review.**
- `bundle/templates/` — canonical template set; copied to `~/.hamilton/templates/` by
  `hamilton setup`.

- `skills/hamilton-propose/SKILL.md` — reworked: collaborative front door producing
  proposal (PRD) + requirements (SRS delta per capability) + design (SDD) in
  `.hamilton/changes/<YYYY-MM-DD-title>/` from the global templates. Fixed spelling, paths,
  and templates; dropped the old "every change needs a design" stance (tactical changes skip
  to hamilton-plan); removed stale references/ and README. **Awaiting review.**

Skills status: all six drafted — init (0), propose (1), plan (2), code (3), review (4),
finish-work (5). The pipeline skill set is complete.

## Decisions (2026-07-04, cont.)

9. **Template home: global, in the bundle.** Canonical templates live in `bundle/templates/`
   and are copied to `~/.hamilton/templates/` by the `hamilton setup` command; the pipeline
   steps read `~/.hamilton/templates/<name>.md`. Templates are NOT per-project. `hamilton-init`
   sets up a project (AGENTS.md + `.hamilton/specs` + `.hamilton/changes`) but does not create
   templates. Removed the duplicate plan-template from hamilton-plan's references; it now
   reads `~/.hamilton/templates/plan.md`.

## Article takeaways — "How to write a good spec for AI agents" (Addy Osmani)

Source: `~/.folio/capture/how-to-write-a-good-spec-for-ai-agents.md`

Validated (already in our design): changes accumulate → consolidate into living specs;
optional heavyweight front door / start-anywhere; code self-review; reviewer-as-judge;
scale detail to task complexity.

Adopted:

- **Three-tier boundaries (Always / Ask-first / Never).** Added to design.md as a
  change-scoped section. "Ask first" is NOT `escalate_to` (that's an unimplemented early
  artifact — ignore it): a skill resolves an ask-first item by asking the user, or, when
  running unattended, the agent auto-reflects — answers the question itself and records
  the reasoning before proceeding.
- **Six core areas are project-level, not per-change.** Commands, testing, project
  structure, code style, git workflow, boundaries belong in project standards
  (AGENTS.md / guidelines / memory), consumed by hamilton-code and hamilton-review —
  never in proposal/design. A new **`hamilton-init`** skill should create AGENTS.md and
  scaffold the `.hamilton/` folder following this six-area pattern — it is the
  project-standards source.
- **Spec-referenced self-verification.** hamilton-code and hamilton-review must check
  each requirement/scenario against the output and list any unaddressed — scenarios
  (WHEN/THEN) are proto-conformance tests.
- **Plan-first, read-only exploration** in hamilton-plan before any code.
- **Small, independently-testable tasks; pull only the relevant slice** ("curse of
  instructions"). Directly shapes the plan.md schema.

## Deferred / open tasks

## Deferred / open tasks

- [x] **plan.md schema** — drafted at `.hamilton/templates/plan.md`. Awaiting review.
- [x] Fix `requeriments` → `requirements` in `hamilton-propose` — done via the rework.
- [x] Decide final home for templates — canonical in `bundle/templates/`, copied to
  `~/.hamilton/templates/` by `hamilton setup` (global, not per-project).
- [ ] Wire `hamilton setup` to copy `bundle/templates/` → `~/.hamilton/templates/` (code
  change in the setup command; not yet implemented).
- [~] **Skill↔agent unification** — `feature-dev` DONE (see "Bundle refactor" below):
  planner→hamilton-plan, developer→hamilton-code, new reviewer→hamilton-review as thin
  agent.yml `skills:` bindings + slim INSTRUCTIONS. Remaining: the other six workflows
  (bug-fix, security-audit, quarantine-broken-tests, scaffold, do, script-example) —
  prompt-quality pass; no matching skills to unify onto yet.
- [ ] **Shared `setup` reconciliation** — `setup` was reshaped to be variant-agnostic
  (records `current_branch` + `baseline_sha` + build/test/ci + baseline; no branch
  creation — variants own that). feature-dev is aligned to the new contract. bug-fix,
  quarantine-broken-tests, and security-audit still have inline setup prompts using the old
  uppercase `Reply with:` format and reference `setup.outputs.branch`/`repo` keys the new
  contract doesn't emit. Reconcile each to the reshaped contract during rollout.
- [ ] Implement the spec-sync behavior inside `hamilton-finish-work`.
- [ ] **Consolidate legacy spec systems** — `openspec/`, `.superpowers/`,
  `docs/superpowers/` all coexist. Pick canonical home (`.hamilton/`), decide
  migration/deprecation.
- [ ] Author skills one at a time, dogfooding each on a small real Hamilton change.
- [ ] End-to-end validation: run one roadmap item through the full human→Hamilton
  pipeline; log friction.
- [x] Author **`hamilton-init`** skill — done. Creates AGENTS.md (six core areas) and
  scaffolds `.hamilton/` (specs/, changes/, templates). The project-standards source that
  hamilton-code / hamilton-review load. Note: bridges to the guidelines/memory work later.
- [ ] Encode **spec-referenced self-verification** in hamilton-code and hamilton-review
  (check each requirement/scenario, list unaddressed).
- [ ] hamilton-plan: **plan-first read-only exploration**; plan.md tasks small and
  independently testable.

## Bundle refactor (2026-07-04) — feature-dev

Reference implementation of skill↔agent unification, done first; pattern rolls out to the
other workflows next.

- **DAG:** `plan → setup → applyPlan(forEach task: code → test) → review → reworkIfNeeded`.
  Removed the per-story `verifyImplementation`/`applyVerificationFeedback`.
- **Skill bindings** via `agent.yml` `spec.settings.skills`: planner→`hamilton-plan`,
  developer→`hamilton-code`, new local reviewer→`hamilton-review`. Each `INSTRUCTIONS.md`
  reduced to the Hamilton binding (input + `write_task_output` per schema); methodology
  lives in the skill. Dropped the developer's branch/PR contradiction (local-only) and the
  planner's embedded/duplicate plan schema + `requeriments`/`runs` bugs.
- **Review = single change-level gate** after the loop; diffs `baseline_sha..HEAD`
  (`baseline_sha` now captured by setup). New `schemas/review.json` + `schemas/setup.json`.
- **Rework loop reuses `implementTask`.** `reworkIfNeeded` (when verdict is
  changes-requested) re-invokes the `implementTask` template with the review feedback as
  `validation_feedback` — no separate rework template. `implementTask`'s code step handles
  both modes (a plan `current_task`, or review feedback).
- **Open judgment:** rework is a single pass — no automatic re-review to `approved` inside
  feature-dev. The `hamilton-finish-work` gate (requires review approved) is the backstop.
  If iterate-to-approved is wanted here, restore a review inside `implementTask`'s recursion.
- **tester/setup**: no matching skill — prompt-quality only. setup fix is shared (see the
  reconciliation task above).

## Bundle refactor pattern (apply to every workflow)

The generalized, reusable pattern derived from feature-dev. Apply it verbatim when refactoring
the other workflows.

### Layer division — one owner per concern

- **`SKILL.md`** (in `skills/hamilton-*`) — *how to do the step well*, tool-agnostic. The
  single source of truth for methodology. Never duplicated into an agent or a prompt.
- **`SOUL.md`** — the agent's *persona* only. No process, no output mechanics.
- **`INSTRUCTIONS.md`** — the *Hamilton binding*, and nothing else: which skill the agent
  has, what its input is (where it comes from in the workflow), and how to report output
  (`write_task_output` per the task's schema). Keep it short. If methodology is creeping in,
  it belongs in the skill.
- **`workflow.yml` prompt `content`** — *per-run context injection* only: interpolated
  inputs (`{{inputs...}}`) plus "following your instructions and the `<skill>` skill, then
  set your task output." No methodology, no re-stated steps.

Rule of thumb: the refactor is mostly *deletion* — pull methodology out of INSTRUCTIONS and
the workflow prompt, leave a pointer to the skill.

### Skill binding mechanism

Add the skill to the agent, not the prompt:

```yaml
# agent.yml
spec:
  settings:
    model: <thinking|default>
    skills: [hamilton-<step>]
```

The registry resolves each name against `skills/<name>/` (frontmatter `name:` must match the
dir). The resolved skill is injected into the agent, so INSTRUCTIONS can just say "you have
the `hamilton-<step>` skill; follow it."

### Which agents unify vs. get a prompt-only pass

- **Unify onto a skill** only when a matching `hamilton-*` step exists: planner→`hamilton-plan`,
  developer→`hamilton-code`, reviewer→`hamilton-review`. (propose/init/finish-work exist too.)
- **Prompt-quality only** when there is no matching skill (e.g. tester, setup, scanner,
  triager, quarantiner). Tighten wording, enforce the layer division, fix schema drift — but
  do not invent a skill.

### Shared agents are off-limits to repurposing

`bundle/agents/*` (setup, verifier, pr, do) are shared across workflows. Never rebind or
reshape a shared agent for one workflow's needs. If a workflow needs different behavior, add
a **workflow-local** agent (as feature-dev's `reviewer` was added) and leave the shared one
alone. Genuine shared bugs (e.g. setup's circular `cd`) may be fixed, but only as a
cross-cutting fix, and flagged.

### DAG shape — compose from primitives, don't copy a fixed sequence

There is no canonical step list. Each workflow's DAG should be the *smallest control flow
that solves its problem*. Design it from these primitives, then let the problem dictate the
shape:

- **Linear dependency** (`dependencies: [a, b]`) — order steps and fan-in: a task waits for
  all its dependencies (including an expanded `forEach` — that's how you run something once
  after a whole loop finishes).
- **forEach loop** (`template: T` + `arguments.forEach` over a collection, bound `as: x`) —
  map the same sub-DAG over N items (e.g. per plan task, per finding, per story). The items
  usually come from an upstream task's output.
- **Recursion loop** (a task whose `template:` is the template it lives in, gated by `when`)
  — iterate-until-condition: retry/rework cycles that repeat until a verdict passes or
  `max_recursion_depth` (set in `spec.run`) is hit. This is the only loop-to-condition
  construct; use it for review→fix→review, quarantine retries, etc.
- **Conditional task** (`when: '<expr on inputs...>'`) — run a step only when it applies:
  skip rework when approved, skip E2E when there's no UI, branch on a triage verdict.
- **Parameter passing** (`arguments.parameters` + `valueFrom.ref: inputs...`) — thread data
  into a template or a recursion iteration. Mind the scope: top-level tasks read
  `inputs.tasks.<t>.outputs.*`; inside a template, sibling outputs are
  `inputs.currentIteration.tasks.<t>.outputs.*` and template inputs are
  `inputs.parameters.*`.
- **Reliability** (`on_failure.max_retries`, `escalate_to`) per task; `entrypoint`,
  `timeout`, `max_recursion_depth`, and `variants` in `spec.run`.

Design guidance:

- **Reuse a template for structurally-identical work** instead of writing a second one. If a
  "fix" pass is really "implement + validate" again, point it at the implement template and
  make the shared prompts **dual-mode** with `{{#if inputs.parameters.<x>}}` (one branch per
  invocation context) rather than duplicating the machinery.
- **Match the loop to the check.** A per-item quality check that gates a retry belongs
  *inside* the forEach template (recurse the template). A whole-artifact check that runs once
  belongs *after* the loop (a top-level task depending on the expanded forEach), with its own
  recursion if it must iterate to a verdict.
- **Keep conditions and scope explicit** — every `when` reads a concrete upstream output, and
  every rework/retry loop is bounded by `max_recursion_depth`.

*feature-dev as one instance:* `plan → setup → applyPlan(forEach task: implementTask=[code→test])
→ review → reworkIfNeeded`. Review is a single change-level gate diffing
`{{setup.outputs.baseline_sha}}..HEAD`; `reworkIfNeeded` reuses `implementTask` with the
review feedback as `validation_feedback` (dual-mode code/test), rather than a bespoke rework
template. A different workflow (e.g. a triage-then-branch bug fix, or a per-finding security
loop) will compose these primitives differently — that's expected.

### Schemas & outputs

- One `schemas/<step>.json` per task with an output; wire it via the task's `output.schema.file`.
- Setup's contract is variant-agnostic: `status`, `current_branch`, `baseline_sha`,
  `build_cmd`, `test_cmd`, `ci_notes`, `baseline`. Branching is the variant's job, not setup's.

### Self-check before calling a workflow done

YAML/JSON parse; every `template:` and `executorRef:` resolves; `skills:` names match a
`skills/` dir; interpolated output keys are consistent producer→consumer; no orphaned
references to removed steps.

## Bundle refactor — other workflows (2026-07-04)

Applied the pattern (prompt-quality half) to every remaining workflow: slimmed inline
workflow prompts to context + "following your instructions" (methodology stays in the
already-detailed INSTRUCTIONS.md, since these agents have no matching `hamilton-*` skill),
reconciled consumers to the reshaped `setup` contract (`{{inputs.tasks.setup.outputs.repo}}`
→ `{{inputs.project_dir}}`, `.branch` → `.current_branch`), and fixed the circular setup
refs. Verified: all YAML/JSON parse, all `executorRef`s resolve, no broken setup refs.

Note: `bundle/workflows/script-example/` no longer exists on disk (was in an earlier
listing). The two remaining `Reply with:` blocks (bug-fix `verify`, security-audit
`verify-story`/`test`) are intentional — those tasks have no output schema, so the prompt is
their only output contract; see open questions about giving them schemas.

### Open questions — global / shared agents

- **[G1] Canonical Co-Authored-By email.** Three values coexist: `hamilton@hamiltonai.dev`
  (was in quarantine workflow.yml, now slimmed out), `hamilton@ifood.com.br` (quarantiner
  INSTRUCTIONS), and a literal `EMAIL_REDACTED` placeholder (bug-fix `fixer`, security-audit
  `sec-fixer`, and feature-dev `developer` INSTRUCTIONS). `EMAIL_REDACTED` would be committed
  verbatim — a real bug. Pick one canonical footer and apply everywhere. *Not changed —
  awaiting your call.*
- **[G2] Shared `verifier` output contract.** Field names differ per consumer (feature-dev
  used verified/feedback; bug-fix & security-audit use `VERIFIED`/`ISSUES`; scaffold uses
  verified/issues), and the verify tasks have no output schema. Should the shared verifier
  get one schema + consistent field names?
- **[G3] Shared `verifier` → `hamilton-review`?** It is the natural review step, but it is
  shared (bug-fix, security-audit, scaffold) and deliberately lightweight ("checkpoint, not a
  deep code review"). Binding it globally is a behavior change across three workflows —
  decide, don't default.

### Open questions — bug-fix

- **[B1] `fixer` → `hamilton-code`?** It implements from a root-cause + fix-approach, not a
  `plan.md` task with verbatim Steps. hamilton-code's contract is "follow the task's Steps
  exactly," so the fit is loose. Bind (and reshape inputs), or keep prompt-only?
- **[B2] Bare vs full var refs.** `{{severity}}`, `{{affected_area}}`, `{{root_cause}}`,
  `{{fix_approach}}`, `{{problem_statement}}`, `{{changes}}`, `{{regression_test}}` are used
  bare, while others use `{{inputs.tasks.X.outputs.Y}}`. Are the bare forms valid engine
  aliases or latent bugs? Preserved as-is pending confirmation.
- **[B3] `verify` retry + no schema.** The verify task has no output schema; its retry
  relies on the `Reply with: STATUS: retry / ISSUES` text. Confirm the engine's retry trigger
  and whether a schema (+ an explicit review→fix loop like feature-dev's) is wanted.
- **[B4] Branch creation.** `triager` only *names* a branch; with setup no longer creating
  one, confirm the variant (branchout/worktree/github_pr) creates it — and what `merge` does.

### Open questions — security-audit

- **[S1] `sec-fixer` → `hamilton-code`?** Same loose-fit question as [B1].
- **[S2] Bare var refs.** `{{vulnerability_count}}`, `{{findings}}`, `{{changes}}`,
  `{{regression_test}}` — same as [B2].
- **[S3] `verify-story` / `test` retry + no schema.** `verify-story` has no output schema;
  same concern as [B3].
- **[S4] `progress` vs `progress_file`.** I standardized `fix-story` on `{{inputs.progress_file}}`
  and dropped the injected `{{inputs.progress}}` log dump. Confirm agents should read the
  ledger file themselves (consistent with the rest of the bundle).
- **[S5] `{{completed_stories}}` / `{{stories_remaining}}`.** These forEach-context params
  aren't obviously wired to any producer. Confirm they're engine-provided, or remove them.

### Open questions — quarantine-broken-tests

- **[Q1] Branch handling.** quarantiner/qa-verifier now `cd {{inputs.project_dir}}` and work
  on the current branch (variant owns branching). Confirm no explicit checkout is needed.
- **[Q2] Co-author email** — see [G1] (quarantiner INSTRUCTIONS uses `ifood.com.br`).
- **[Q3] Bare refs** `{{disabled}}`, `{{summary}}`, `{{retry_feedback}}` — valid?
- **[Q4] Retry wiring.** qa-verifier emits `STATUS: retry` + ISSUES, but no explicit
  re-invocation task feeds it back to the quarantiner. Confirm how the retry loop closes.

### Open questions — scaffold

- **[Sc1] Verifier fit.** `verify` uses the shared `verifier`, whose INSTRUCTIONS target
  code-diff review (git diff, tests), not project-scaffold structure — so the prompt carries
  its own checklist. Give scaffold a dedicated verifier, or accept the generic one?
- **[Sc2] No schema** on `verify` — same as [B3]/[S3].

### Open questions — do

- **[D1] Task input.** The `execute` prompt no longer restates steps and does not interpolate
  the task text (the original didn't either — it relied on the harness supplying the run
  prompt). Confirm the doer actually receives the task description; if not, wire an explicit
  input var.

## Bundle refactor — resolutions (2026-07-04, cont.)

Decisions taken and applied (supersede the matching open questions above):

- **[G1] Co-author email → `hamilton@caioferreira.dev`.** Applied across fixer, sec-fixer,
  quarantiner. Added a TODO.md task to make the footer configurable via
  `~/.hamilton/config.yaml` (injected into committing agents instead of hardcoded).
- **[G2/G3] Verifier stays a general goal-verifier — NOT bound to `hamilton-review`.**
  Unified its output schema to `{status: done|retry|failed, verified, issues[]}` (updated
  `bundle/agents/verifier/schemas/output.json` + INSTRUCTIONS), and normalized every verify
  task to it (scaffold, bug-fix, security-audit now wire a `schemas/verify.json`; quarantine's
  `qa-verifier` was already conformant). If a real code-review gate is needed elsewhere,
  promote feature-dev's `reviewer` to a shared agent rather than overloading `verifier`.
- **[B1/S1] Added a `plan` step before fixer/sec-fixer; both now bind to `hamilton-code` and
  run in a `forEach` loop over `plan.md` tasks.** bug-fix: `… → setup → plan → applyPlan
  (forEach task: fix) → verify`. security-audit: `… → setup → plan → applyPlan(forEach task:
  fix-story) → verify → test` (replaced the per-story fix/verify forEach with a planned loop +
  single change-level verify). Each gained `schemas/plan.json`, `schemas/setup.json`,
  `schemas/verify.json`; fixer/sec-fixer INSTRUCTIONS slimmed to the hamilton-code binding.
- **Promoted `planner` to a shared agent** (`bundle/agents/planner`) so feature-dev, bug-fix,
  and security-audit all reuse it. feature-dev's local copy was moved out; verified no
  duplicate-name conflict and every agent dir still has an `agent.yml`.

Verified after these changes: all YAML/JSON parse; every `template:`, `executorRef:`, and
`skills:` reference resolves; no duplicate agent names; no empty agent dirs; fixer/sec-fixer
output fields (`tests`) match their schemas.

**Housekeeping:** the emptied `feature-dev/agents/planner` dir could not be deleted (the
workspace mount blocks `rmdir`); it was moved to `bundle/.trash/planner_emptied`. Empty dirs
aren't tracked by git, so it won't be committed — but delete `bundle/.trash/` manually if it
lingers.

### Still open (unchanged)

- **[B2]/[S2]** bare vs full var refs (`{{severity}}`, `{{findings}}`, …) — valid engine
  aliases or latent bugs?
- **[B3]/[S3]/[Sc2]** verify tasks now have a schema, but there is still no review→fix retry
  loop in bug-fix/security-audit (single verify pass; the finish/verify verdict is terminal).
  Add a `reworkIfNeeded`-style loop (as in feature-dev) if iterate-to-pass is wanted.
- **[S4]** confirm agents read `progress.md` themselves (injected `{{inputs.progress}}` dumps
  were dropped).
- **[Q1]/[Q4]** quarantine branch handling + retry wiring.
- **[Sc1]** scaffold uses the generic verifier with a scaffold-specific checklist in-prompt —
  dedicated verifier or keep?
- **[D1]** confirm the `do` doer receives the run's task text.

## Bundle refactor — renames, reviewer, verifier split, new workflows (2026-07-04, cont.)

- **Workflow renames** (dir + `metadata.name`): `bug-fix`→`bugfix`, `feature-dev`→`development`,
  `quarantine-broken-tests`→`fix-broken-tests`. In-bundle prose references updated.
- **Promoted `reviewer` to a shared agent** (`bundle/agents/reviewer`, moved the whole dir so
  no empty leftover). `development` now resolves `reviewer` (and `planner`) to the shared copies.
- **Migrated the review gate to `reviewer` in bugfix, security-audit, fix-broken-tests.** Each
  `verify` task became a `review` task using `reviewer` (`hamilton-review`), wired to a
  `schemas/review.json` verdict (`approved` | `changes-requested`). security-audit's `test` now
  depends on `review`; fix-broken-tests' `review` replaces the `qa-verifier` step (which is now
  unused — see housekeeping).
- **Generalized `verifier` into a domain-agnostic goal-verifier.** Rewrote its SOUL +
  INSTRUCTIONS: given a goal + acceptance criteria and the produced artifacts (code, docs, a
  file, a config, anything), it confirms the goal was met from real evidence and returns the
  unified `{status: done|retry|failed, verified, issues[]}`. No longer tied to git/tests/SDD.
  Now used by scaffold and the two docs workflows below.
- **Four new workflows:**
  - `code-review` — single `review` task on the shared `reviewer`; on-demand review of the
    current branch's diff. (reuses reviewer; `schemas/review.json`.)
  - `increase-test-coverage` — `setup → plan → applyPlan(forEach task: cover) → review`. New
    local `test-writer` agent bound to `hamilton-code`; reuses shared setup/planner/reviewer.
  - `write-user-docs` — `draft → verify`. New local `user-docs-writer` (no skill, full
    INSTRUCTIONS); verifier confirms docs match the code and examples run.
  - `write-release-docs` — `draft → verify`. New local `release-writer`; verifier confirms the
    notes match the commit range and flag breaking changes.

Verified: all `metadata.name` match dir names; all YAML/JSON parse; every `executorRef`,
`template:`, `skills:`, and `output.schema.file` resolves; no duplicate or empty agent dirs.

**Housekeeping / leftovers (mount blocks `rmdir`, so some dead files remain — harmless, not
git-tracked if empty):**

- `bundle/.trash/planner_emptied` (from the earlier planner promotion).
- `fix-broken-tests/agents/qa-verifier` is now **unused** (review uses the shared reviewer).
  Delete the dir when possible, or repurpose it.
- `schemas/verify.json` in bugfix / security-audit / fix-broken-tests is now unused (they emit
  `review.json`). Safe to delete.

**Flag — external references to old names (OUTSIDE the bundle, not changed here):** `src/` and
`tests/` reference the old workflow names (e.g. `feature-dev`). Renaming the bundle dirs does
not update engine/test code. Grep `feature-dev|bug-fix|quarantine-broken-tests` under `src/`
and `tests/` and reconcile before relying on the renamed workflows.

### New open questions

- **[N1] fix-broken-tests review fit.** `reviewer` runs `hamilton-review`, which expects a
  `plan.md`; quarantine has none, so it reviews against the in-prompt intent (only test files
  disabled). Works, but if a stricter contract is wanted, keep the specialized `qa-verifier`
  instead. Decide whether to delete qa-verifier.
- **[N2] code-review diff base.** The `code-review` workflow lets the reviewer infer the
  branch's base. If runs need an explicit base/ref input, wire one.
- **[N3] test-writer double-binding.** `test-writer` duplicates `developer`'s hamilton-code
  binding with a test-only persona. If more workflows need a coder, consider one shared
  `developer` rather than per-workflow copies.

## Workflow prompt improvements from external references (2026-07-04, cont.)

Extracted ideas (not copied) and applied:

- **`write-user-docs`** (ex gstack `document-generate`): adopt the **Diátaxis** four-type model
  (tutorial / how-to / reference / explanation), research-first, and a **coverage map** that
  surfaces which types exist vs. are missing. Added `coverage_map` to `docs.json` and the
  verify checks.
- **`write-release-docs`** (ex gstack `document-release`): a **sell-test rubric** (every entry
  must communicate user value), **doc-drift detection** (cross-reference the diff against
  existing docs; fix or record as `doc_debt`), explicit breaking-change section, optional
  VERSION bump. Added `doc_debt` to `notes.json` and the verify checks.
- **`code-review`** (ex superpowers `requesting-code-review`): **severity calibration**
  (Critical / Important / Minor, no inflation), **strengths-first** output, an **assessment
  verdict with reasoning**, `file:line` + why + how-to-fix. Plus a codebase-wide
  **TODO/FIXME/HACK/XXX/BUG scan** surfaced as opportunities; added `todos_found` to the
  code-review `review.json`.
- **Reminder hook** (`bundle/hooks/reminder.ts`): rewrote the `write_task_output` nudge to be
  firm and specific — conform to the task's output schema, fill required fields when done, and
  still report a failed/retry status (with the blocker) rather than exiting silently.

## Next step

Reconcile external `src/`+`tests/` references to the renamed workflows; confirm the bare-ref
convention ([B2]/[S2]); decide qa-verifier's fate ([N1]); wire `hamilton setup` to install
`bundle/templates/` and the shared agents.
