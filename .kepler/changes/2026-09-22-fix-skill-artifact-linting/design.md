---
artifact: design
change: 2026-09-22-fix-skill-artifact-linting
status: draft
created: 2026-09-22
author: "Caio Ferreira <caiorcferreira@gmail.com>"
decision: accepted
route_unit: null
---

# Design: Make Hamilton Artifact Authoring Lint-Valid

## Context

`hamilton-plan` copies `plan.md`, `progress.md`, and `task-progress.md` templates but does not specify concrete values for every required frontmatter field. Its task-log instructions correctly require an empty file before implementation, while `src/workbench/artifact-body.ts` currently requires at least one attempt for every task-progress artifact. The finish workflow also commits a pending Attempt before observing and appending its Outcome, a legitimate recovery state described by the execution contract but rejected by the generic body validator. Artifact-writing skills do not consistently invoke the available scoped lint command after authoring.

The workbench is already the single validator for these artifacts. The change will align its body rules with the existing lifecycles, make plan initialization explicit, and add lint calls at the artifact mutation boundaries. It will not add a new artifact format or invent history to satisfy a parser.

## Goals / Non-Goals

**Goals**

- Have `hamilton-plan` populate valid `plan.md`, root progress metadata and table rows, and task-progress metadata and identity headings; initial task logs have `pending` status and no attempts.
- Let lint accept only the empty or staged states that the existing lifecycle treats as valid, while preserving all other structural and evidence checks.
- Have every skill that creates or edits a workbench-recognized artifact run a scoped lint command after the mutation and resolve any findings before claiming success or committing.
- In every new artifact that requires an `author` field, use the repository's configured Git `user.name` and `user.email`; preserve existing author metadata when revising an artifact.
- Test the state transitions, author population, and skill command contracts, and update the canonical artifact-templates, execution, workbench, and framework-docs specs and skills reference.

**Non-Goals**

- No new workbench command, lint selector, auto-fix behavior, shared runtime, or artifact registry.
- No fake task attempts, weakened task completion/precondition gates, changes to artifact ownership, or legacy-format migration.
- No lint requirement for arbitrary code, documentation, research output, or throwaway prototype files that are not recognized Hamilton artifacts.

## Decisions

### Decision: Align lint with precise legitimate lifecycle states

- Choice: allow an attempt-free `task-progress` only when its metadata status is `pending`; allow a finish history to end in one unmatched, physically last Attempt only when both finish `status` and `result` are `pending`. Keep malformed records, invalid numbering, unmatched Outcomes, and empty non-pending task logs invalid.
- Alternatives considered: change only skills and require a fabricated attempt; defer lint until after task execution or finish outcome; or introduce a general state-machine/configuration layer for every artifact's partial states.
- Rationale: the existing templates and workflow explicitly create these states, so the validator should recognize them narrowly. Synthetic evidence would be false, deferring lint would leave legitimate persisted writes unchecked, and a general state model is unnecessary for the two concrete transitions.

### Decision: Instantiate every planning template as a live artifact

- Choice: have `hamilton-plan` replace every placeholder and instruction comment, populate all required frontmatter with real values, write the root `tasks` metadata and Markdown table from the same ordered task list, and create each task log with numeric task identity, `pending` status, current date, accepted decision, exact H1, and no attempt. The plan frontmatter includes `artifact`, `change`, a valid `status`, `created`, `author`, `decision`, and `route_unit`; root progress includes `artifact`, `change`, `status`, `updated`, `decision`, and `tasks`; each task log includes `artifact`, `change`, numeric `task`, `status`, `updated`, and `decision`. In re-plan mode, preserve the established stable-id and history rules while applying the same validation to newly created or changed artifacts.
- Alternatives considered: rely on template examples without stating field mapping; derive task identity or path from display titles; or create a seed Attempt for each new task.
- Rationale: concrete metadata is the linter's input contract, and numeric task identity is already the stable path identity. A single ordered task list avoids mismatched rows and YAML entries; an empty history remains truthful.

### Decision: Populate author metadata from the repository Git identity

- Choice: whenever a skill creates an artifact whose template requires `author`, read the effective `git config user.name` and `git config user.email` for the repository and write both as `Name <email>`. Do not substitute the agent name, an OS username, or a placeholder. If either value is missing, ask the user or stop with a blocker. When revising an existing artifact, preserve its recorded author rather than claiming authorship of the original artifact.
- Alternatives considered: use the agent or model name, use only `user.name`, or infer an email from a hosting account.
- Rationale: the Git identity is the configured attribution for work in this repository; inference or agent labels can misattribute the durable artifact.

### Decision: Validate each artifact at its owning skill's mutation boundary

- Choice: add the existing `hamilton workbench lint` invocation to each skill that creates or edits a recognized artifact. Use `--change-dir <change-dir>` when a complete change tree was authored or synchronized, and `--file <file>` for a single artifact outside that scope. Run it after the write is structurally complete, including immediately after a supported pending state is persisted; fix and rerun on findings. If the command is unavailable or remains nonzero, report the blocker and do not claim compliance or make a commit that depends on the artifact.
- Alternatives considered: lint only at finish-work; scan the repository by default; or replace lint with skill-specific manual checks.
- Rationale: checking at the owner boundary localizes defects, existing selectors make scope explicit, and a shared CLI keeps all producers aligned with one contract. Lint is not a substitute for the skill's semantic, freshness, ancestry, or completion gates.

### Decision: Keep a direct command in each artifact-writing skill

- Choice: document the exact lint boundary in every skill that writes recognized artifacts: `hamilton-propose`, `hamilton-plan`, `hamilton-code`, `hamilton-code-feedback`, `hamilton-critique`, `hamilton-review`, `hamilton-finish-work`, `hamilton-compose-spec`, and `hamilton-wayfinder`. Wayfinder subskills (`hamilton-wayfinder-domain-modeling`, `hamilton-wayfinder-research`, and `hamilton-wayfinder-prototype`) lint a ticket only when they mutate that recognized artifact; `hamilton-grilling` does so only when it directly writes a recognized artifact, otherwise its caller lints after applying the answer. Use `--change-dir <change-dir>` for a complete change tree and `--file <file>` for one artifact outside that scope. Finish-work lints each recognized file after its valid persisted mutation. Skills that write no recognized artifact, such as init's `AGENTS.md` scaffolding and the orchestrator's coordination state, do not invoke lint.
- Alternatives considered: make one optional shared reference skill the sole holder of the command or require every skill to lint unrelated outputs too.
- Rationale: portable skills cannot assume another skill or shared instruction is loaded, and linting unrecognized output adds noise without validating a Hamilton contract.

## Architecture & Components

| Unit | Responsibility | Change |
|---|---|---|
| `src/workbench/artifact-body.ts` | Interpret required headings, tables, and append-only workflow records | Permit only the pending empty task-progress state and pending finish intent state; retain existing diagnostics for malformed histories |
| `tests/workbench/artifact-contracts.test.ts` and `tests/workbench/lint.test.ts` | Prove accepted and rejected lifecycle states through validators and scoped lint | Add fixtures for pristine pending logs, pending unmatched finish attempts, and invalid neighbors |
| `skills/hamilton-plan/SKILL.md` | Produce the declarative plan and initialize execution state | Specify concrete plan/root/task frontmatter, exact body identities, mirrored task rows, and post-scaffold/re-plan lint |
| Artifact-writing `skills/hamilton-*/SKILL.md` | Author or mutate recognized artifacts | Add scoped post-write lint at valid state boundaries; preserve each skill's existing ownership and gates |
| `tests/skills/` | Keep skill instructions executable and scoped | Assert plan initialization guidance and that every recognized-artifact writer documents lint while non-writers remain unburdened |
| `docs/skills.md` and `.hamilton/specs/` | Explain and define the durable contract | Document the lint gate and synchronize execution, workbench, and framework-docs capability specs |

No new abstraction is needed. The validator already receives the recognized artifact metadata and body, so the exceptions remain local to existing artifact-body validation. The skill checks use filesystem text assertions, consistent with the current skill-contract suite.

### Quality Lens

The workbench body validator owns structural acceptance, each skill owns its artifact mutation and lint timing, and tests exercise both the pure validator and the real scoped lint path. The only added branch is a narrow exception keyed by valid lifecycle metadata; no generic plugin or new command is warranted. Parallel skill wording is necessary because skills are independently loaded, so contract tests guard their shared invariant without introducing a runtime abstraction.

## Data & Flow

### Plan initialization

1. Read the plan template and project standards as today, then decompose active tasks with stable numeric ids.
2. Populate `plan.md` frontmatter with `artifact: plan`, the actual change slug, a valid plan status, `created`, `author`, `decision`, and `route_unit` set to the exact route reference or `null`. Set `author` to the effective `git config user.name` and `git config user.email` as `Name <email>`; if either is unavailable, ask the user or stop rather than inventing it. Remove template instructions and placeholders.
3. Populate root progress frontmatter with `artifact: progress`, the actual change slug, `status: pending`, the current `updated` date, `decision: accepted`, and one `tasks` entry per active task. Each entry has a positive integer `id`, a non-empty YAML-safe `title`, `status: pending`, and `progress: tasks/task-N/progress.md`. Construct the Markdown table from those same ordered values, using exactly `| Task | Status | Progress |`, a valid separator, one row per task, and `[details](tasks/task-N/progress.md)` in each link cell. Escape `|` in the displayed title without changing task identity.
4. Populate every new task-progress file with `artifact: task-progress`, the actual change slug, numeric `task: N`, `status: pending`, the current `updated` date, and `decision: accepted`. Remove authoring comments and placeholders, write exactly `# Task Progress: Task N — <title>` as its identity heading, and leave the body free of attempt records until code runs.
5. Run `hamilton workbench lint --change-dir <change-dir>`. A new pending empty task log is valid; any other finding is repaired and lint is rerun before handoff. Re-plan follows the same check without rewriting frozen task history.

### Artifact mutation

A skill completes its owned artifact mutation, invokes the narrowest workbench lint selector over that artifact or complete change tree, and proceeds only on exit `0`. The finish skill may lint a persisted pending Attempt before the external effect and lint again after the matching Outcome is persisted. The code skill lints only after task evidence and its root-row transition are finalized. A skill does not treat skipped unrelated files as errors, but lint warnings or errors block its success path. Existing semantic gates remain in force after lint.

## Error Handling & Edge Cases

| State or failure | Expected behavior |
|---|---|
| Pending task-progress has valid identity and no attempts | Lint succeeds; no synthetic record is added |
| Task-progress has no attempt but status is not `pending` | Lint reports the missing attempt |
| Pending finish history has one complete final Attempt and no matching Outcome | Lint succeeds only when status and result are both `pending` and earlier records are properly paired and ordered |
| Finish history has an unmatched Outcome, an invalid status/result, malformed numbering, or a non-final unmatched Attempt | Lint fails closed |
| Root progress frontmatter and task table are authored with the same task sequence | Lint validates their required shapes; the skill/test contract keeps values synchronized |
| Lint returns findings | The skill repairs and reruns; if unresolved or unavailable, it reports a blocker and does not claim a valid artifact |
| A skill writes only an unrecognized research/prototype/documentation file | No Hamilton artifact lint is required unless it also mutates a recognized artifact such as a ticket |

## Testing Strategy

- Add focused body-contract tests for a pending empty task log, an empty non-pending task log, a valid pending finish Attempt, and malformed/unmatched finish neighbors.
- Exercise the public lint scope on real temporary files so the required frontmatter, path identity, and exit code are verified together; preserve tests for completed histories and finish gates.
- Add skill-contract assertions for `hamilton-plan`'s filled frontmatter and attempt-free initialization, scoped lint calls in every artifact writer, and absence of required lint in skills with no recognized artifact writes.
- Update and read back `docs/skills.md` plus the three changed specs; validate the proposal/design/requirements change directory with `hamilton workbench lint --change-dir <change-dir>` after authoring.
- Add skill-contract assertions that author-bearing creation skills read the configured Git name and email, use both in the author field, and preserve existing authors when revising artifacts.
- During implementation, run focused `bun --bun vitest run` tests for the changed workbench/skill files, then `bun run build` and the full `bun run test` suite as the project gates. Smoke-test `hamilton workbench lint` against a fully populated plan output, a fresh pending task log, and a pending finish attempt using the built CLI.

## Constraints & Boundaries

- Always: preserve numeric task ids, template ownership, append-only attempt history, explicit lint scopes, and all existing finish/task semantic gates; never invent an attempt; run lint after each owned recognized-artifact mutation.
- Ask first: any change that broadens the accepted partial-artifact states beyond pristine pending task logs and a pending finish intent awaiting its outcome.
- Never: accept an empty task log after work has started, accept malformed or unmatched terminal evidence, scan the repository implicitly, or mark a lint-failing artifact as compliant.

## Risks / Trade-offs

- A lifecycle exception could become too permissive if keyed only to record absence. Require exact `pending` metadata, correct artifact identity, valid title and full structure, and a narrowly valid physical-last Attempt for finish history; add negative tests for adjacent invalid states.
- A skill can name an incorrect selector, lint too early, or misattribute a new artifact. Add contract tests for lint scope and Git identity population; resolve both identity values from the current repository and block rather than guessing if they are unavailable.
- Lint only checks structural contracts and cannot replace semantic task completion, task-feedback freshness, ancestry, or external finish verification. Keep all existing stage gates unchanged and state this distinction in the skill guidance.

## Migration / Rollout

No migration is needed. Existing valid artifacts retain their shape; previously rejected pristine pending task logs and persisted pending finish intents become valid. Update the bundled skills and workbench together, rebuild/install the CLI generation, and reload skills before starting new work, following the existing between-changes generation policy.
