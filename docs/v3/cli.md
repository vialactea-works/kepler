# Kepler v3 CLI draft

[Version 3 reference](README.md) | [CLI infrastructure](runtime.md)

**Status:** Draft for discussion.

## Purpose and status

This document defines a human-readable draft of the Kepler v3 command line interface. It separates accepted policy from proposed command details. Saving this draft does not approve its proposals or implement CLI behavior.

The command placements marked **Accepted** follow the requester's decisions. The command names, arguments, output fields, and detailed operation rules marked **Proposed** need review. The [runtime contract](runtime.md) defines the agreed event and execution rules. This document does not replace those rules.

The current CLI does not implement this v3 command tree. Its root has `setup` and `workbench` commands. The proposed v3 `setup` command retains the installation role. It is not the Initialization phase. This reference does not remove or migrate existing commands.

## Accepted policy

The following decisions are accepted. They do not accept every command detail in this draft.

- Use `kepler workflow <phase>` for phase-owned workflow operations. Construction commands belong under `kepler workflow construction`.
- Use descriptive root capabilities, such as `git`, `lint`, and `audit`. Do not add generic `util` or `commons` groups.
- Use `kepler git diff-package` for the three source-scoped inspection packages defined in [diff-package](diff-package.md). This capability and its placement under `git` are accepted; it does not accept other proposals in this draft.
- Keep shared artifact checks under root `kepler lint`. Keep Construction task-graph checks under `kepler workflow construction lint`.
- Record approvals, evidence, and interactions, and query history under `kepler audit`. The `record`, `list`, and `show` verb names remain proposed. Do not add separate Construction evidence, approval, or interaction namespaces.
- Treat audit as both a record operation and a history query. It is not a read-only feature.
- Use `kepler workflow construction unit create`, `unit list`, and `unit show` for unit operations. Set initial effort at creation and inspect it through `unit show`. Do not add effort commands. Preserve the requester's effort authority and the agreed adjustment rules.
- Use a direct `kepler workflow construction revise` operation. Do not add a revision namespace.
- Use typed, phase-validated operations to record events. Do not expose raw journal append.
- Let each lifecycle operation record its own event. Do not ask a caller to issue a second audit write for that transition.
- Distinguish command-operation success from workflow completion. A failed operation returns a nonzero status. A successful command does not imply that the whole workflow is complete.
- On recovery, reconcile actual effects, preserve attempt history, and avoid duplicate acceptance. Do not claim success for an interrupted or uncertain operation.
- Keep `list`, `show`, and `lint` read-only. They do not write events, advance workflow state, or create audit records. Do not infer one global event order from timestamps.
- Return structured machine-readable output by default, for both results and errors. Do not require `--json` or mix progress text and prose into machine-readable output.
- Build help and argument parsing from the same CLI-framework definitions. Do not maintain a separate command grammar for help.

Construction owns its transition rules. A workflow selects stage order. The [Standard workflow](workflows/standard/README.md#stages) selects the Construction MVP order. Stage-specific policies remain proposals where their owning contracts say so.

## Proposed interface rules

The command inventory below lists the proposed commands in this draft and the separately defined `kepler git diff-package` family. It does not add commands for future Initialization or Inception phases. It adds no workflow engine, state registry, or utility registry. It also excludes generic status changes, force operations, migrations, and public lock manipulation.

### Scope and selectors

Every command that reads or changes unit state must identify its scope. A task operation must identify its Unit of Work and task. An Activity operation must also identify the Activity occurrence and enclosing stage attempt. A mutation of an existing attempt must identify that attempt. Do not attach an earlier result to whichever attempt is current. Do not select an implicit active or most-recent unit.

The placeholders `<unit-id>`, `<task-id>`, `<stage>`, and `<activity>` show the required scope. They do not define final argument syntax. Exact selectors, path rules, defaults, and quoting remain open for other commands. The [diff-package family](#kepler-git-diff-package) defines its exact selectors, path rules, and signatures below.

The project root used by a command also needs a defined selector. If a command cannot resolve its project, it must fail. It must not run setup or silently create a project.

### Machine-readable output

**Accepted policy.** Return structured machine-readable output by default. Agents are the main CLI callers. Do not require `--json`, and do not mix progress text or prose with command output.

The exact result envelope, error envelope, exit-code map, and stdout/stderr placement remain open. A failure must still return a structured result and a nonzero exit status. A success result must not claim workflow completion unless the operation establishes that fact.

This example shows proposed fields for unit creation. It does not define the common result envelope or all required fields.

```json
{
  "unit_id": "2026-10-18-order-cancellation",
  "path": ".kepler/units-of-work/2026-10-18-order-cancellation/",
  "effort": "standard"
}
```

The exact human-output flag is unchosen. Help must use the same command definitions as the parser. Its rendering format remains open.

### Command inventory

| Command | Placement | Purpose |
| --- | --- | --- |
| `kepler setup` | Proposed retention of an existing command | Bootstrap the Kepler installation. |
| `kepler uuid` | Proposed root command | Return one UUIDv4. |
| `kepler git author` | Proposed command under accepted `git` namespace | Return the effective Git author identity. |
| `kepler git diff-package validation` | Accepted under `git` | Package a task's generated output for Code Validation. |
| `kepler git diff-package integration` | Accepted under `git` | Package a prepared combined candidate for Code Integration inspection. |
| `kepler git diff-package unit-review` | Accepted under `git` | Package the complete unit's integrated changes for Review. |
| `kepler lint` | Accepted root placement | Check shared artifact rules. |
| `kepler audit record <kind>` | Proposed verb under accepted `audit` namespace | Record a typed audit fact. |
| `kepler audit list` | Proposed verb under accepted `audit` namespace | Query audit history. |
| `kepler audit show` | Proposed verb under accepted `audit` namespace | Read one audit record. |
| `kepler workflow construction unit create` | Accepted placement | Create one Construction Unit of Work. |
| `kepler workflow construction unit list` | Accepted placement | List Units of Work. |
| `kepler workflow construction unit show` | Accepted placement | Read one Unit of Work and its state. |
| `kepler workflow construction lint` | Accepted placement | Check Construction's task graph. |
| `kepler workflow construction stage <operation>` | Proposed group under accepted phase namespace | Control or inspect one unit-scoped stage attempt. |
| `kepler workflow construction task <operation>` | Proposed group under accepted phase namespace | Inspect readiness, admit a task, and integrate its result. |
| `kepler workflow construction activity <operation>` | Proposed group under accepted phase namespace | Control or inspect one task-scoped Activity attempt. |
| `kepler workflow construction revise` | Accepted placement; detailed operation proposed | Apply an authorized unit-stage cascade or task-local Activity return. |

Here, `<kind>` is `approval`, `evidence`, or `interaction`. Stage operations are `start`, `show`, `complete`, `pause`, and `resume`. Task operations are `list`, `show`, `ready`, `admit`, and `integrate`. Activity operations are `start`, `show`, `complete`, `pause`, and `resume`.

The entries name the requested operations. They do not decide final argument grammar or response schemas.

## Root capabilities

### `kepler setup`

**Proposed retention.** Keep this command as the installation bootstrap. It installs Kepler's bundled templates and guideline manifests and writes default settings when they do not exist. It does not create a Unit of Work or run the Initialization phase.

The v3 result must follow the accepted machine-readable output policy. The output fields, compatibility with existing setup options, and exact behavior when a copy or write fails remain open.

### `kepler uuid`

**Proposed operation.** Return one lowercase, hyphenated UUIDv4. Use it for artifact or task fields whose contracts require that format. Follow the shared [artifact identity rules](metadata.md#identity-and-content-versions) and [task identity rules](phases/construction/task-graph.md#task-identity). Generating a value does not create an artifact or task record.

Do not use a UUID as the readable unit ID. Attempt and event IDs follow their own contracts. This draft does not add a global allocation or duplicate-lookup service. The command's exact arguments and response shape remain open.

### `kepler git author`

**Proposed operation.** Return `user.name` and `user.email` from the effective Git configuration for the selected project. This supports the shared [author identity rules](metadata.md#author-identity). It returns the current Git identity, not the stored author of an existing artifact.

Do not replace an artifact's original author during later edits.

**Accepted failure policy under [SH61](authoring_progress.md#completed-shared-decisions).** An absent, empty, or whitespace-only name or email makes lookup fail. Return a nonzero result identifying each missing key. Do not prompt inside the CLI, change Git configuration automatically, or invent a fallback identity.

Callers must check identity before writing an artifact that requires `author`. Do not write incomplete author metadata or record successful creation or completion after this failure. The calling agent explains the problem and retries after the appropriate identity is configured. Preserve existing authors and continue unaffected work. Apply the [shared identity policy](metadata.md#missing-identity) and existing metadata validation rules.

Exact error codes and response fields remain implementation choices under [SH60](authoring_progress.md#mvp-implementation-choices). This accepted failure policy does not accept the remaining command proposal.

### `kepler git diff-package`

**Accepted capability and signatures.** Use exactly these three commands:

```text
kepler git diff-package validation --unit <unit-id> --task <task-id> --implementation-attempt <attempt-id> --generation-attempt <attempt-id> [--project <path>] [--out <path>]
kepler git diff-package integration --unit <unit-id> --task <task-id> --implementation-attempt <attempt-id> --integration-attempt <attempt-id> [--project <path>] [--out <path>]
kepler git diff-package unit-review --unit <unit-id> --implementation-attempt <attempt-id> [--project <path>] [--out <path>]
```

`--implementation-attempt` selects the source Implementation context, not a consumer attempt. Validate unit, task, and source-attempt ownership. Each task ID is a UUIDv4 string. Do not infer a unit, task, attempt, or candidate; do not accept arbitrary range overrides. Package generation does not require a new Validation or Review attempt.

`--project` selects the Git project or worktree; otherwise discover it from the current directory. Fail if the root does not resolve to a Git project or worktree. Required records and Git objects must be available. Do not run setup or create units. `--out` selects a new file; resolve a relative path from the selected project root. Refuse to overwrite an existing file. Without `--out`, create a fresh local temporary package.

Return structured output that identifies the scope, resolved source and material bindings, and output location. Include the complete package-content fingerprint and indicate whether the diff is empty. On failure, return a structured error and nonzero status without a package-success claim. Package creation does not modify tracked application content or Git metadata, journals, projections, or lifecycle state. It does not create attempts or commits, dispatch work, run checks, record approval, or accept a candidate. See [diff-package](diff-package.md) for scope, package content, attribution, and retention requirements.

### `kepler lint`

**Accepted scope.** Validate shared artifact rules only. Use the [metadata contract](metadata.md#field-validation) for common Markdown metadata. Do not run Construction task-graph validation here.

**Proposed operation.** Read the selected shared artifacts and report findings. Do not repair content, add fields, generate identifiers, or change workflow state. The accepted scope does not define the path selector, support for non-Markdown artifacts, or the result schema.

## Audit operations

Audit records preserve structured lifecycle facts, evidence, approvals, and interactions in phase-owned event history. Current views come from recorded events. Follow the [event envelope](runtime.md#event-envelope-choices), [evidence and approval bindings](runtime.md#evidence-and-approval-bindings), and [audit ownership rules](runtime.md#audit-ownership).

### `kepler audit record <approval|evidence|interaction>`

**Accepted operation types.** Record an approval, evidence result, or interaction through a typed operation that validates the owning phase's rules. Do not accept an arbitrary event type or raw event payload.

A record must name the affected phase and scope, and bind evidence or approval to the material and attempt that it concerns. An approval records the requester's explicit decision. A commit, an artifact, or a successful process exit does not establish approval.

Use this operation for facts that do not belong to another lifecycle transition. A command that starts, completes, pauses, resumes, admits, accepts, or revises work records its own lifecycle event. Do not issue a second audit write for that action.

The authorization proof, actor fields, evidence DTOs, material selectors, and record schemas remain open. Do not invent an approval protocol or claim that a record alone completes a stage.

### `kepler audit list`

**Proposed query.** Return matching history records for an explicit scope. Do not change workflow state or write an event. Do not sort unrelated journals into a global causal order by timestamp. Preserve each journal's local order and use recorded causal references where available.

The filters, pagination, and ordering contract remain open.

### `kepler audit show`

**Proposed query.** Return one identified record and its recorded scope, bindings, and causes. Do not write an audit event or change current state. A timestamp alone does not establish causality.

The record selector and response schema remain open.

## Construction commands

Construction uses the [accepted Unit of Work identity rules](unit-of-work.md#identity-and-directory), the [effort rules](effort.md), the [accepted task graph format](phases/construction/task-graph.md), and its [Implementation contract](phases/construction/implementation.md). The Standard workflow selects the stage order. These references retain their own approval status.

### `kepler workflow construction unit create`

**Proposed syntax:**

```text
kepler workflow construction unit create <slug> [--effort minimal|standard|comprehensive] [--project <path>]
```

This signature is a draft, not an accepted complete contract. The user has not approved all of its selectors or creation mechanics.

The command creates one Unit of Work directory under `.kepler/units-of-work/<unit-id>/`. Use the ID format `YYYY-MM-DD-<slug>`, the machine-local date at creation, and the exact ID as the directory name. The complete ID must be unique in the selected project. Do not change it during revision or resume.

**Proposed input rules:**

- Use lowercase words separated by single hyphens for `<slug>`. Reject invalid input; do not normalize it silently. The exact allowed characters remain open.
- Use `--effort` to select Minimal, Standard, or Comprehensive. Use Standard if the requester has not selected another level.
- Treat `--project <path>` as an explicit project selector. The project used when this option is absent remains unresolved.
- Do not choose an active Unit of Work implicitly. A newly created unit is not automatically selected for later commands.

On success, create the unit directory and record the creation and initial effort facts exactly once. These are required effects of this draft; they do not define the storage schema or a general exactly-once replay protocol. Do not write `unit-of-work.md`, placeholders, requirements, plans, or task files. Do not start a stage or attempt, launch agents, approve work, create branches or worktrees, or make commits. Do not run setup or migration.

A create failure must not report success. Reject invalid input before writing. If the project cannot be resolved, fail without running setup. If the ID is already registered or its destination exists, refuse without overwriting or adopting the existing unit. Under concurrent requests for the same ID, at most one request succeeds.

If a write fails or the process stops partway through, inspect and reconcile actual directory and journal effects before retrying. Preserve uncertain or unrelated material. Do not promise general exactly-once replay. A caller that loses the success response can use `unit list` or `unit show` to inspect the result. A new request after local midnight can receive a different ID.

The earlier JSON example shows proposed unit-create fields, not an accepted result schema.

A proposed `--stage-effort <stage>=<level>` option is an open question. Do not treat it as accepted or remove the existing stage-override policy.

### `kepler workflow construction unit list`

**Proposed query.** List Units of Work in an explicit project scope. Read directory identity and derived execution state. Do not create a unit, select an active unit, write history, or infer a single global order from event timestamps.

Project selection, filters, ordering, and response fields remain open.

### `kepler workflow construction unit show`

**Proposed query.** Show one Unit of Work by its explicit identity. Include its current effort default and any explicit stage overrides, derived from recorded events. Also show scoped stage and task progress without changing it.

Activities inherit their stage's effort. They do not have their own override. Do not add effort commands. The requester decides stage overrides and later adjustments under the accepted [Effort policy](effort.md#selection-rules). The CLI inputs and operation placement for those decisions remain open.

The unit selector and response fields remain open. This query must not select a unit for later commands.

### `kepler workflow construction lint`

**Accepted scope.** Run Construction-specific task-graph validation here, not in root `kepler lint`.

**Proposed operation.** Read the selected unit's authored graph and the inputs required by the [task graph contract](phases/construction/task-graph.md#validation-rules). Report structural errors, invalid dependency references or cycles, unsupported fields, and relevant local-reference or unit-identity mismatches. Do not infer graph edges from task order, titles, or free-form prose.

Readiness facts do not prove that free-form acceptance criteria are satisfied. The command cannot establish that an external service or resource is available without current evidence. Lint is read-only: preserve invalid files and do not repair them.

The project and unit selectors, full check coverage, and finding schema remain open.

## Stage operations

The commands below apply to one explicit Unit of Work and one Construction stage. They use the Standard workflow order where that workflow is selected. Construction owns transitions; Standard selects the sequence. Exact stage selectors and active-workflow selection remain open.

| Operation | Proposed contract |
| --- | --- |
| `stage start` | Start the authorized stage in its unit scope. Create a distinct stage attempt when the stage executes. Enforce the one-active-attempt limit for that fixed scope. Do not start a second active attempt. |
| `stage show` | Read the selected stage's derived state, attempt, effort, and relevant evidence. Do not write or advance state. |
| `stage complete` | Record completion only when the owning phase's completion conditions hold for the current attempt and material. Completing one stage does not complete the workflow. |
| `stage pause` | Pause the current stage attempt without ending it or freeing its active scope. Preserve its identity and history. |
| `stage resume` | Resume the same paused attempt. Do not create a second active attempt. Confirm recovery rules before work resumes. |

Each successful lifecycle command records its own typed event. Starting a stage does not launch an agent. A failed or partial transition returns a nonzero operation result. Do not mark a stage complete from a successful process exit alone.

The detailed guards, status vocabulary, event payloads, and recovery of interrupted transitions remain open. Stage details remain subject to the owning contract; see the [stage catalog](phases/construction/README.md#stage-catalog).

## Task operations

Task operations identify a Unit of Work. An operation on one task also identifies its UUIDv4 task ID from `tasks-dag.json`. Task IDs identify authored tasks; they do not identify attempts. Follow the [task graph contract](phases/construction/task-graph.md#task-identity) and [admission rules](runtime.md#task-admission-and-baselines).

| Operation | Proposed contract |
| --- | --- |
| `task list` | List authored tasks and their derived execution state for one unit. Do not edit the graph or write history. |
| `task show` | Show one task definition, current scope, attempt links, evidence, and progress. Do not change state. |
| `task ready` | Report graph dependencies, predecessor outputs known in the unit's integrated state, and known prerequisite facts. Do not admit or start the task. |
| `task admit` | Admit one ready task and capture the unit's current integration checkpoint as its fixed baseline. Establish predecessor-output inclusion from history or provenance, not timestamps alone. Do not create an extra admission commit or task attempt. |
| `task integrate` | Acquire the unit integration lock. Read the current checkpoint and prepare the combined candidate. Run typechecking, the project build, and the full application test suite. Accept only the exact checked candidate and record the Integration outcome. Release the lock when the operation ends. |

`task ready` cannot interpret free-form acceptance criteria or prove external availability without evidence. It reports graph facts and known conditions. The orchestrator assesses criteria and external prerequisites under the task contract.

`task integrate` requires successful Code Validation and its independent non-author feedback. Keep the lock across the current-checkpoint read, candidate preparation, all three checks, and acceptance. A failed check or changed candidate prevents acceptance until the candidate is checked again. The task's admitted baseline remains fixed; record actual Integration inputs separately.

Successful acceptance is distinct from requester approval, whole-unit completion, review, or delivery. Do not add unrestricted `task complete`. Generic `activity complete` must not bypass Integration acceptance. The [Code Integration contract](phases/construction/activities/code-integration.md#integration-procedure) owns the check and acceptance rules.

The task selectors, evidence inputs, lock implementation, and result schema remain open. The task's Activity attempts and evidence remain bound to their occurrences and enclosing Implementation attempt. A task does not have a separate attempt identity.

## Activity operations

Activities are fixed, task-scoped parts of the unit's Implementation stage: Code Generation, Code Validation, then Code Integration. They are not stages. Follow the [Construction Activity rules](phases/construction/activities/README.md#shared-execution-rules) and [attempt rules](runtime.md#activity-attempts).

| Operation | Proposed contract |
| --- | --- |
| `activity start` | Start one Activity occurrence for an admitted task under the active Implementation attempt. Enforce at most one active attempt for that occurrence. Start the next Activity only when its predecessor's conditions hold, unless an authorized return changes the route. |
| `activity show` | Read one Activity occurrence and its attempts, evidence bindings, and current state. Do not write or advance state. |
| `activity complete` | Record completion only when that Activity's conditions and evidence hold for its current attempt. Code Integration also requires a matching accepted candidate from `task integrate`. |
| `activity pause` | Pause the current Activity attempt without ending it. Keep its identity and active scope. |
| `activity resume` | Resume the same paused Activity attempt after confirming that earlier workers stopped and its inputs remain valid. |

Code Generation owns implementation, typechecking, related tests, and self-review. Code Validation owns required typechecking, the project build, the full application test suite, and independent non-author feedback. Code Integration owns combined-candidate checks and acceptance. These check duties remain binding; the detailed Activity contracts mark other proposals separately.

A local correction, failed command, pause, resume, or new session keeps the current unended attempt. An authorized return creates a new Activity attempt when that Activity executes again. An Integration-only retry stays within its current Code Integration attempt. Do not add task-coding or protocol-run attempt identities.

Exact Activity selectors, event payloads, completion guards, and evidence schemas remain open. An Activity completion does not complete the enclosing Implementation stage or Unit of Work.

## Revision operation

### `kepler workflow construction revise`

**Accepted placement.** Use this direct operation for an authorized revision. Do not add `kepler workflow construction revision` or another revision namespace.

**Proposed scope.** Support two cases:

1. A unit-stage cascade from the orchestrator-selected earliest affected stage through every downstream Standard stage in the authorized unit scope.
2. A task-local return to an authorized Activity, followed by the required later Activities for that task.

The command records the authorized decision and reason through a typed phase operation. It must identify the selected unit, scope, and boundary. Do not invent an authorization proof protocol. A worker's finding or proposed boundary does not authorize revision.

For a unit-wide upstream revision, stop new admissions and active Implementation work for that unit. End affected Implementation and Activity attempts, preserve their history and work, and prevent ended attempts from accepting candidates or completing tasks. Independent units continue when their inputs remain valid.

For a task-local code correction, the orchestrator can return the task to Code Generation and require Code Validation and Code Integration again. A return starts a new Activity attempt when the Activity executes. An Integration-only retry remains in the current Integration attempt and does not become a revision.

Reconsider affected evidence and artifacts under the shared [revision procedure](revision.md#revision-procedure). Do not delete prior artifacts, transfer old completion into a new attempt, or reopen unrelated scopes without authorization. Exact boundary arguments, evidence inputs, cascade events, and partial-failure recovery remain open.

## Record portability

Apply the accepted [SH74 policy](runtime.md#record-portability) to authored artifacts, event journals, derived views, live coordination data, and evidence. Version authoritative history; keep projections and live runtime coordination data unversioned.

Provide relevant journals, required causal records, checkpoint material, and accessible evidence for cross-checkout or cross-machine handoff. Missing required material blocks only the affected handoff or work. Apply existing recovery and revision rules; do not infer success or new consent from history transfer.

Current durable journals and preserved unfinished work can support same-checkout recovery. No new commit is required solely for recording an event, dispatching a worker, or resuming a session. Keep existing checkpoint and unit Integration lock requirements.

This policy does not accept proposed CLI syntax or define publication and synchronization protocols.

## Failure and recovery rules

These rules apply to the proposed command contracts. They do not define a storage or lock implementation.

- Validate inputs and authorization before changing state.
- Return a nonzero status when the requested operation fails. Do not return a successful transition result for an incomplete write.
- If an operation stops after a partial effect, inspect the actual journal, projection, directory, candidate, and lock state before retry. Keep uncertain work and history.
- Use stable event identities and phase validation to reconcile duplicate or interrupted requests. Do not claim general exactly-once replay until the write protocol is defined.
- Never let a late result from an earlier attempt change a newer attempt or establish its completion.
- Keep query and lint commands read-only. Projection rebuilds and history queries do not rerun checks or create approvals.
- Preserve local journal order. Use causal links for cross-journal causes. Do not use timestamps to invent a global ordering.

The event write protocol, projection rebuild behavior, lock ownership and recovery, and physical storage remain implementation decisions under [CLI infrastructure](runtime.md#execution-state-representation).

## Open decisions

The accepted command placements, structured-output default, typed lifecycle writes, and exact three [diff-package signatures](#kepler-git-diff-package) remain in force. The following interface details remain open implementation choices. Their technical answers do not create requester approval gates.

| ID | Open interface detail | Existing contract boundary |
| --- | --- | --- |
| SH102 | Project selection, path resolution, absent-selector behavior, and unresolved or ambiguous project errors. | Progress, transition, unit-create, and author interfaces remain under SH53, SH54, SH59, and SH60. The accepted diff-package project selector remains fixed under SH101. |
| SH103 | Shared unit, stage, task, Activity, parent, and attempt selector grammar, including ownership-mismatch errors. Do not select an implicit active or latest scope. | Existing query and transition choices remain under SH53, SH54, and SH57-SH60. Preserve the exact source selectors under SH101. |
| SH104 | Common success-result fields and the distinction between operation success and workflow completion. | Keep the accepted structured-output default. Preserve SH101's logical result requirements. |
| SH105 | Typed error fields for causes, partial effects, uncertainty, and recovery. Never report false success. | Keep accepted failure behavior. SH61 still requires nonzero failure and missing-key identification for absent Git author values. |
| SH106 | Exit codes for success, failure, usage, unsupported input, and uncertain outcomes. | Preserve the accepted nonzero-on-failure rule and SH61's nonzero missing-identity result. |
| SH107 | Separation of stdout and stderr and one machine-readable result without mixed prose. | Preserve structured machine-readable output by default. Do not add progress prose to it. |
| SH108 | Whether to offer optional human rendering and how to select it. | Structured machine-readable output remains the default. This row does not require a new human-output feature. |
| SH109 | Typed evidence inputs and bindings for audit recording. | Reuse SH49-SH51 record and material choices, accepted SH52 evidence coverage, and SH55-SH56 approval and interaction interfaces. Do not add raw append. |
| SH110 | Audit query selectors, filters, pagination, and local or causal ordering presentation. | Preserve SH44's envelope, SH53's query interface, SH92-SH94 producer and causal-order rules, and no timestamp-derived global order. |
| SH111 | Shared `kepler lint` input paths and complete read-only finding format. | Keep its accepted shared-metadata scope and the metadata validation rules in SH18, SH19, and SH21. Do not move task-graph checks to root lint. |
| SH112 | Construction lint selectors, required context, validation coverage, and finding format. | Keep the accepted `kepler workflow construction lint` placement and task graph contract under IP26. Do not change the graph schema. |
| SH113 | Arguments and result fields for the proposed root UUID operation. | Preserve the accepted artifact UUID rules in SH13 and task UUID rules in IP22. Do not add a global allocation registry. |
| SH114 | Setup inputs, compatible bundle selection, existing `--force` handling, result fields, and partial-write effects. | See the [installation contract draft](installation.md). Do not add force authority, automatic migration, or overwrite permission. |
| SH115 | How current phase operations identify and select the Standard workflow binding. | Preserve accepted workflow composition under SH98 and the [Standard stage order](workflows/standard/README.md#stages). Do not add a generic workflow registry. |
| SH117 | Which skill and profile installation writes belong to setup and which belong to a native host or skill manager. | See the [installation contract draft](installation.md) and [skill responsibilities](skills.md). Do not change accepted role contracts. |

[SH116](authoring_progress.md#mvp-decisions) is an open first-MVP host and platform release-scope decision, not a CLI syntax choice. The [installation contract draft](installation.md) records it without selecting a host.

Other shared runtime and Construction implementation choices remain under SH45-SH51, SH62-SH70, SH72, SH84-SH87, DF14-DF17, and existing SH53-SH60. These include journal writes, projections, attempts, locks, workspaces, effort changes, task and Activity guards, and recovery. Exact actor and authorization fields remain open under SH55-SH56. Do not invent approval proof or interaction protocols.

Migration commands and future Initialization or Inception commands remain outside this inventory. The agreed [effort policy](effort.md#selection-rules), [revision authority](revision.md#authority-and-escalation), [Construction structure](phases/construction/README.md#implementation), and [Standard stage order](workflows/standard/README.md#stages) remain in force. This CLI draft does not accept remaining proposals in those contracts.
