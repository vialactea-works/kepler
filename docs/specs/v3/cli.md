# Kepler v3 CLI draft

[Version 3 reference](README.md) | [CLI infrastructure](runtime.md)

**Status:** Draft for discussion.

## Purpose and status

This document gives a human-readable draft of the Kepler v3 command line interface. It separates accepted policy from proposed command details. Saving this draft does not approve its proposals or add CLI behavior.

The command placements marked **Accepted** follow the requester's decisions. The command names, arguments, output fields, and detailed operation rules marked **Proposed** are open for review. The [runtime contract](runtime.md) sets shared event and execution rules. The accepted [Mission contract](mission.md) sets mission policy, not command syntax. This document does not replace those rules.

The current CLI does not have this v3 command tree. Its root has `setup` and `workbench` commands. The v3 `setup` contract keeps the installation role. It is not the Initialization phase. This reference does not remove or migrate existing commands.

## Accepted policy

The following decisions are accepted. They do not accept every command detail in this draft.

- Use `kepler workflow <phase>` for phase-owned workflow operations. Construction commands belong under `kepler workflow construction`.
- Use descriptive root capabilities, such as `git`, `lint`, and `audit`. Do not add generic `util` or `commons` groups.
- Use `kepler git diff-package` for the three source-scoped inspection packages in [diff-package](diff-package.md). This capability and its placement under `git` are accepted. It does not accept other proposals in this draft.
- Use the accepted [shared lint interface](#kepler-lint) under root `kepler lint`. Use the accepted [Construction lint interface](#kepler-workflow-construction-lint) for task-graph checks.
- Use the accepted [setup interface](#kepler-setup) for Kepler's bundled resources and default settings. Native hosts or skill managers own [agent resource installation](installation.md#agent-resource-ownership).
- Use the accepted [UUID interface](#kepler-uuid) to generate one UUIDv4 without creating an artifact or task.
- Apply the accepted [Standard workflow binding](#workflow-binding) to each Construction unit and its mission.
- Apply the accepted [Mission contract](mission.md) for mission identity, record-home selection, workspace facts, membership, and pre-mission boundaries. Do not infer mission membership or add command options from that policy.
- Record approvals, evidence, and interactions, and query history under `kepler audit`. The [evidence recording interface](#kepler-audit-record-evidence) and [audit queries](#kepler-audit-list) are accepted. Approval and interaction interfaces stay proposed. Do not add separate Construction evidence, approval, or interaction namespaces.
- Treat audit as both a record operation and a history query. It is not a read-only feature.
- Use `kepler workflow construction unit create`, `unit list`, and `unit show` for unit operations. Set initial effort at creation and read it through `unit show`. Do not add effort commands. Keep the requester's effort authority and the agreed adjustment rules.
- Use a direct `kepler workflow construction revise` operation. Do not add a revision namespace.
- Use typed, phase-validated operations to record events. Do not expose raw journal append.
- Let each lifecycle operation record its own event. Do not ask a caller to issue a second audit write for that transition.
- Distinguish command-operation success from workflow completion. A failed operation returns a nonzero status. A successful command does not imply that the whole workflow is complete.
- On recovery, compare actual effects with the recorded state, keep attempt history, and avoid duplicate acceptance. Do not claim success for an interrupted or uncertain operation.
- Keep `list`, `show`, and `lint` read-only. They do not write events, advance workflow state, or create audit records. Do not infer one global event order from timestamps.
- Return structured machine-readable output by default, for both results and errors. Do not make `--json` necessary or mix progress text and prose into machine-readable output.
- Build help and argument parsing from the same CLI-framework definitions. Do not keep a separate command grammar for help.
- Apply the shared [project selection rules](#project-selection) to every project-scoped command, including unit creation.
- Use the shared [scope selectors](#scope-and-selectors) for unit, stage, task, Activity, and attempt identities.
- Use the shared [result envelope](#machine-readable-output) with required `status` and `data` fields.
- Use the shared [failure result fields](#failure-and-recovery-rules) when `status` is `failed`.
- Use the shared [exit-code contract](#exit-codes) for CLI-controlled results.
- Use the shared [output stream contract](#output-streams) for default machine-readable output.
- Use [JSON-only operation results](#human-output) for the MVP.

Construction owns its transition rules. A workflow selects stage order. The [Standard workflow](workflows/standard/README.md#stages) selects the Construction MVP order. Stage-specific policies stay proposals where their owning contracts say so.

## Proposed interface rules

The command inventory below lists proposed interfaces and accepted command interfaces. Accepted interfaces include three `kepler git diff-package` commands, evidence recording, audit queries, and shared lint. Setup, UUID generation, Construction lint, and the Standard workflow binding are also accepted. It does not add commands for future Initialization or Inception phases. It adds no workflow engine, state registry, or utility registry. It also excludes generic status changes, force operations, migrations, and public lock manipulation.

### Scope and selectors

**Accepted under [SH103](authoring_progress.md#completed-shared-decisions).** Use explicit long flags for scope selectors.

Every command that reads or changes unit state must identify its scope. An operation on one task must identify its Unit of Work and task. An Activity operation must identify its occurrence and enclosing Implementation attempt. A mutation of an existing attempt must identify that attempt. Do not attach an earlier result to whichever attempt is current. Do not select an implicit active or latest scope.

| Selector | Meaning |
| --- | --- |
| `--unit <unit-id>` | Full Unit of Work ID. |
| `--stage <stage>` | Named Construction stage. |
| `--task <task-id>` | Full task UUIDv4 from `tasks-dag.json`. |
| `--activity <activity>` | Named Construction Activity. |
| `--attempt <attempt-id>` | Existing attempt targeted by the operation. |
| `--implementation-attempt <attempt-id>` | Enclosing Implementation attempt for task-scoped work. |

Each selector takes one value. Reject duplicate selectors. Use complete, exact IDs, without prefixes, aliases, or titles.

Use these Construction stage values for `--stage`: `functional-design`, `quality-requirements`, `implementation-planning`, `implementation`, `unit-of-work-review`, and `deliver`.

Use these Construction Activity values for `--activity`: `code-generation`, `code-validation`, and `code-integration`.

Activity operations use `--unit`, `--task`, `--activity`, and `--implementation-attempt`. Mutations of an existing Activity attempt also use `--attempt`. Do not add a task-attempt identity.

Validate all selected scope and ownership relationships. Return a structured error and a nonzero exit status for a mismatch. Do not select another scope.

Unit-based operations may resolve mission context only from unique recorded membership. Mission-aware queries must identify unbound units. Creation and selection syntax remains open under SH53, SH54, and SH59. This policy adds no `--mission` or `--repo` selector.

Keep the accepted [diff-package source selectors and signatures](#kepler-git-diff-package) unchanged. Their `--generation-attempt` and `--integration-attempt` selectors identify source attempts, not consumer attempts.

Attempt IDs follow the accepted shared [attempt identity rules](runtime.md#attempt-identity-and-active-scope). Other query and operation interfaces stay under SH53, SH54, and SH57-SH60. Use the accepted [failure result fields](#failure-and-recovery-rules) and [exit-code contract](#exit-codes). Other operation-specific arguments, input-path rules, and quoting stay open.

### Project selection

**Accepted under [SH102](authoring_progress.md#completed-shared-decisions).** Each project-scoped command has an optional `--project <path>` selector. Global commands, such as `setup` and `uuid`, do not use project selection.

Resolve a relative `--project` path from the working directory at command invocation. Without `--project`, select that working directory itself. Do not search ancestor directories or silently select a different project root.

The selected directory must be a Git working-tree root with an existing local `.kepler/` directory. Use Git to validate the root. Accept linked worktrees whose `.git` entry is a file. Reject bare repositories and paths inside a worktree that are not its root.

For mission operations, `--project` selects the record-home working copy. Participating code repositories come from explicit workspace bindings. A secondary repository does not replace the record home.

If either condition fails, return a structured error and a nonzero exit status. Do not run setup, initialize a Git repository, or create `.kepler/` during project resolution. Use the accepted [failure result fields](#failure-and-recovery-rules) and [exit-code contract](#exit-codes).

These requirements also apply to unit creation. Prepare `.kepler/` explicitly before creating the first unit. Completed Initialization is not a prerequisite. Project resolution does not create the marker or infer a mission.

### Machine-readable output

**Accepted policy.** Return structured machine-readable output by default. Agents are the main CLI callers. Do not make `--json` necessary, and do not mix progress text or prose with the JSON result.

**Accepted under [SH104](authoring_progress.md#completed-shared-decisions).** Return a JSON object with exactly two top-level fields:

| Field | Contract |
| --- | --- |
| `status` | Required string. Use `success` or `failed`. |
| `data` | Required JSON object. Put command-specific result fields here. |

The following example shows the common success envelope:

```json
{
  "status": "success",
  "data": {}
}
```

Return `success` only when the requested operation meets its success conditions. Use `failed` for a failed operation. Failed, incomplete, or uncertain operations must not return `success`.

These values describe the command operation. A query can succeed and report an incomplete stage. A completion claim must identify its task, stage, unit, or workflow scope. Its completion conditions must hold.

Use `{}` when the command has no result fields. Put collection results inside `data`. Success fields, error-code values, and `details` schemas stay command-specific.

Use the accepted [failure result fields](#failure-and-recovery-rules) inside `data` when `status` is `failed`. Apply the accepted [exit-code contract](#exit-codes). Apply the accepted [output stream contract](#output-streams). Apply the accepted [MVP result formatting](#human-output). A failed operation still returns a nonzero exit status.

The following example shows proposed unit-creation fields inside `data`. These fields are not an accepted command-specific schema.

```json
{
  "unit_id": "2026-10-18-order-cancellation",
  "path": ".kepler/missions/<mission-id>/construction/units-of-work/2026-10-18-order-cancellation/",
  "effort": "standard"
}
```

Apply the accepted [MVP result formatting](#human-output). Help must use the same command definitions as the parser. Its layout is an implementation choice.

### Output streams

**Accepted under [SH107](authoring_progress.md#completed-shared-decisions).** In default machine-readable output, use these streams for both success and failure:

| Stream | Content |
| --- | --- |
| `stdout` | One JSON result object, followed by a newline. |
| `stderr` | Optional diagnostic or progress text. Do not write a second result envelope. |

Write the JSON result when the operation ends. Do not write intermediate result objects.

Keep banners, logs, progress, and child-process output out of `stdout`.

Callers use the JSON result and [exit code](#exit-codes) to identify the outcome. Diagnostic text is not a stable interface.

Forced termination can prevent a complete response. Apply the existing [exit-code and recovery rules](#exit-codes). Apply the accepted [MVP result formatting](#human-output).

### Human output

**Accepted under [SH108](authoring_progress.md#completed-shared-decisions).** The MVP has JSON-only operation results.

Use the same JSON result format in terminals, pipes, and agent calls. Do not add `--human`, a result-format selector, or automatic terminal-based switching.

Generate help from the parser definitions. Its layout is an implementation choice.

Apply the existing [output stream contract](#output-streams), including optional diagnostics and progress on `stderr`.

Any later human result mode must be opt-in.

### Command inventory

| Command | Placement | Purpose |
| --- | --- | --- |
| `kepler setup` | Accepted root interface | Install compatible bundled resources and missing default settings. |
| `kepler uuid` | Accepted root interface | Return one UUIDv4 in `data.uuid`. |
| `kepler git author` | Proposed command under accepted `git` namespace | Return the effective Git author identity. |
| `kepler git diff-package validation` | Accepted under `git` | Package a task's generated output for Code Validation. |
| `kepler git diff-package integration` | Accepted under `git` | Package a prepared combined candidate for Code Integration inspection. |
| `kepler git diff-package unit-review` | Accepted under `git` | Package the complete unit's integrated changes for Review. |
| `kepler lint` | Accepted root interface | Validate shared Markdown metadata for explicit file paths. |
| `kepler audit record evidence` | Accepted under `audit` | Record evidence from one typed JSON request on stdin. |
| `kepler audit record <kind>` | Proposed approval and interaction interfaces | Record an approval or interaction fact. |
| `kepler audit list` | Accepted under `audit` | Query compact audit-event projections with explicit field selection and pagination. |
| `kepler audit show` | Accepted under `audit` | Read one complete audit event by its journal and event identities. |
| `kepler workflow construction unit create` | Accepted placement | Create one Construction Unit of Work. |
| `kepler workflow construction unit list` | Accepted placement | List Units of Work. |
| `kepler workflow construction unit show` | Accepted placement | Read one Unit of Work and its state. |
| `kepler workflow construction lint` | Accepted phase interface | Validate the selected unit's canonical task graph without changing it. |
| `kepler workflow construction stage <operation>` | Proposed group under accepted phase namespace | Control or read one unit-scoped stage attempt. |
| `kepler workflow construction task <operation>` | Proposed group under accepted phase namespace | Read task readiness, admit a task, and integrate its result. |
| `kepler workflow construction activity <operation>` | Proposed group under accepted phase namespace | Control or read one task-scoped Activity attempt. |
| `kepler workflow construction revise` | Accepted placement. Detailed operation proposed. | Apply an authorized unit-stage cascade or task-local Activity return. |

Here, `<kind>` is `approval` or `interaction`. Stage operations are `start`, `show`, `complete`, `pause`, and `resume`. Task operations are `list`, `show`, `ready`, `admit`, and `integrate`. Activity operations are `start`, `show`, `complete`, `pause`, and `resume`.

The entries name the requested operations. Apply the accepted [scope selectors](#scope-and-selectors). The accepted [evidence interface](#kepler-audit-record-evidence) fixes its stdin request and success identity fields. The [audit query interfaces](#kepler-audit-list) fix history selection and results. Other operation arguments and result fields stay open where their contracts say so.

## Root capabilities

### `kepler setup`

**Accepted under [SH114](authoring_progress.md#completed-shared-decisions).** Use the following interface:

```text
kepler setup
```

Use no command-specific options. Remove `--force` from the v3 interface. This global command does not use `--project`.

Select the bundle locally in this order:

- If `KEPLER_BUNDLE_DIR` is set, use that explicit override. Fail if it is missing or incompatible. Do not silently select another bundle.
- Otherwise, check the sidecar `bundle/` next to the installation's `bin/` directory. Resolve executable symlinks before this lookup.
- If no sidecar exists, check the source checkout's `bundle/` relative to the CLI module.
- If no bundle exists, fail. Validate the selected bundle's declared compatibility and digest before copying its resources.

The release installer selects the CLI release and supplies its compatible bundle. Setup does not download or select a latest release. Keep development overrides subject to the same compatibility rules.

Copy compatible templates and guideline manifests into Kepler's existing global home. Create default settings only when they do not exist. Keep existing settings and unknown or modified resources. Update only verified, unmodified installer-managed resources. Report necessary-path conflicts without overwriting or merging them. Apply the [installation preservation rules](installation.md#setup-contract).

On success, identify the installed generation and resource-check results inside `data`. Setup success does not show agent behavior or unchecked host readiness. Exact receipt fields and installation-record encoding are implementation details within these accepted rules.

On failure, keep the prior usable generation. Report available partial-write facts in `data.details` under the existing [failure and recovery rules](#failure-and-recovery-rules). Remove only temporary or partial resources that the operation can identify as its own. Keep uncertain or unrelated material.

Setup does not create units, prepare project markers, run Initialization, dispatch agents, or change workflow state. It does not install native agent definitions or skills. Apply the accepted [resource ownership](installation.md#agent-resource-ownership).

### `kepler uuid`

**Accepted under [SH113](authoring_progress.md#completed-shared-decisions).** Use the following interface:

```text
kepler uuid
```

Return one lowercase, hyphenated UUIDv4 in the required string field `data.uuid`. Use `success` and exit `0` when generation succeeds. Use the shared [failure and recovery rules](#failure-and-recovery-rules) if generation fails.

Use no generation or batch options. This global command does not use `--project`. Do not add a global allocation registry or duplicate-lookup service.

Use the value for artifact or task fields whose contracts specify UUIDv4. Follow the shared [artifact identity rules](metadata.md#identity-and-content-versions) and [task identity rules](phases/construction/task-graph.md#task-identity). Generation does not create an artifact, task, unit, or journal record.

Do not use a UUID as the readable unit ID. Attempt and event IDs follow their own contracts.

### `kepler git author`

**Proposed operation.** Return `user.name` and `user.email` from the effective Git configuration for the selected project. This operation supplies the values for the shared [author identity rules](metadata.md#author-identity). It returns the current Git identity, not the stored author of an existing artifact.

Do not replace an artifact's original author during later edits.

**Accepted failure policy under [SH61](authoring_progress.md#completed-shared-decisions).** An absent, empty, or whitespace-only name or email makes lookup fail. Return a nonzero result identifying each missing key. Do not prompt inside the CLI, change Git configuration automatically, or invent a fallback identity.

Callers must make sure that both identity values are present before writing an artifact with an `author` field. Do not write incomplete author metadata or record successful creation or completion after this failure. The calling agent explains the problem and retries after the appropriate identity is configured. Keep existing authors and continue unaffected work. Apply the [shared identity policy](metadata.md#missing-identity) and existing metadata validation rules.

Command-specific error codes and success fields stay implementation choices under [SH60](authoring_progress.md#mvp-implementation-choices). This accepted failure policy does not accept the other command proposal.

### `kepler git diff-package`

**Accepted capability and signatures.** Use exactly these three commands:

```text
kepler git diff-package validation --unit <unit-id> --task <task-id> --implementation-attempt <attempt-id> --generation-attempt <attempt-id> [--project <path>] [--out <path>]
kepler git diff-package integration --unit <unit-id> --task <task-id> --implementation-attempt <attempt-id> --integration-attempt <attempt-id> [--project <path>] [--out <path>]
kepler git diff-package unit-review --unit <unit-id> --implementation-attempt <attempt-id> [--project <path>] [--out <path>]
```

`--implementation-attempt` selects the source Implementation context, not a consumer attempt. Validate unit, task, and source-attempt ownership. Each task ID is a UUIDv4 string. Do not infer a unit, task, attempt, or candidate. Do not accept arbitrary range overrides. A new Validation or Review attempt is not necessary for package generation.

Resolve repository-qualified checkpoint sets from the recorded workspace and source facts. Keep these signatures and selectors unchanged. Add no repository, batch, mission, or format option.

Apply the accepted [project selection rules](#project-selection) for `--project` and its default. Necessary records and Git objects must be available. Do not create units.

`--out` selects a new file. Resolve a relative path from the selected project root. Refuse to overwrite an existing file. Without `--out`, make a fresh local temporary package.

Return the shared [result envelope](#machine-readable-output). Its `data` identifies the scope, resolved source and material bindings, and output location. Include the complete package-content fingerprint and show whether the diff is empty.

On failure, return a structured error and nonzero status without a package-success claim. Package creation does not modify tracked application content or Git metadata, journals, projections, or lifecycle state. It does not create attempts or commits, dispatch work, run checks, record approval, or accept a candidate. See [diff-package](diff-package.md) for scope, package content, attribution, and retention requirements.

### `kepler lint`

**Accepted scope.** Validate shared artifact rules only. Use the [metadata contract](metadata.md#field-validation) for common Markdown metadata. Do not run Construction task-graph validation here. Explicit-file metadata lint does not require mission adoption.

**Accepted under [SH111](authoring_progress.md#completed-shared-decisions).** Use the following interface:

```text
kepler lint <path>... [--project <path>]
```

For the MVP, require one or more explicit Markdown file paths. Resolve relative paths from the selected project root under the accepted [project selection rules](#project-selection).

Do not scan directories implicitly or migrate data. Do not repair content, add fields, generate identifiers, or change workflow state. Do not write events or audit records.

Report findings from the selected files. Each finding has the following required fields:

| Field | Type | Finding contract |
| --- | --- | --- |
| `path` | String | Identifies the selected artifact file. |
| `field` | String or `null` | Metadata field concerned. Use `null` for a file-level problem. |
| `code` | String | Stable validation error identifier. |
| `message` | String | Explanation of the problem. |

Return diagnostics, not complete file contents. Specific finding codes and message text are implementation choices.

When the selected files satisfy the shared metadata rules, return `success` and exit `0`. Set `data.findings` to `[]`.

On metadata validation failure, return `failed` and exit `1`. Put findings in `data.details.findings` under the accepted [failure result fields](#failure-and-recovery-rules). Keep the required `code`, `message`, `details`, and `recovery` fields. Other input and operation failures follow the existing [failure and recovery rules](#failure-and-recovery-rules).

## Audit operations

Audit records keep structured lifecycle facts, evidence, approvals, and interactions in phase-owned event history. Current views come from recorded events. Follow the [event envelope](runtime.md#event-envelope-choices), [evidence and approval bindings](runtime.md#evidence-and-approval-bindings), and [audit ownership rules](runtime.md#audit-ownership).

### `kepler audit record <approval|evidence|interaction>`

**Accepted operation types.** Record an approval, evidence result, or interaction through a typed operation that validates the owning phase's rules. Do not accept an arbitrary event type or raw event payload.

A record must name the affected phase and scope, and bind evidence or approval to the material and attempt that it concerns. An approval records the requester's explicit decision. A commit, an artifact, or a successful process exit does not show that the requester approved.

Use this operation for facts that do not belong to another lifecycle transition. A command that starts, completes, pauses, resumes, admits, accepts, or revises work records its own lifecycle event. Do not issue a second audit write for that action.

The shared evidence and approval record requirements are accepted under SH49 and SH50. Detailed phase-owned payload types remain implementation work. Material-reference encodings remain under SH51. Approval authority proof and actor details, plus the public approval interface, remain under SH55. The public interaction interface remains under SH56.

The [evidence interface](#kepler-audit-record-evidence) is accepted under SH109. Approval and interaction interfaces stay under SH55-SH56. Do not invent an approval protocol or claim that a record alone completes a stage.

### `kepler audit record evidence`

**Accepted under [SH109](authoring_progress.md#completed-shared-decisions).** Use `kepler audit record evidence` with the accepted [scope selectors](#scope-and-selectors). Apply the accepted [project selection rules](#project-selection) to project-scoped records. Keep the applicable unit, task, stage or Activity, and attempt bindings.

Read one typed JSON request object from stdin. Validate it against the owning phase and selected scope. Do not accept raw journal events.

Use one `inputs` array for the checked material and other relevant inputs. Do not add a separate `material` field to this request. Each entry has `reference` and `purpose`. The reference identifies the input. The purpose explains how the check or review used it.

For repository material, the references identify the repository and exact checked commit. Apply the shared [evidence record minimum](runtime.md#evidence-and-approval-bindings), including one `inputs` array in the accepted shape. Detailed phase-owned payload types and event catalog details remain implementation work.

This fragment shows only the accepted `inputs` structure, not a complete evidence request:

```json
{
  "inputs": [
    {
      "reference": "<Code Generation result reference>",
      "purpose": "Generated task material checked by the suite."
    }
  ]
}
```

The operation records an existing check or review result. It does not run checks, grant approval, or complete workflow work. Keep the actual executor and supporting evidence under the existing binding rules.

On successful recording, return `success` and exit `0`. Include the following required fields inside `data`:

| Field | Successful recording result |
| --- | --- |
| `id` | The recorded event's ID, not the evidence identity. |
| `journal_id` | The recorded event's originating journal ID. |
| `evidence_id` | The phase-owned evidence identity, distinct from the event ID. |

Successfully recording a failed check does not make the check pass. Apply the existing [failure and recovery rules](#failure-and-recovery-rules).

The receipt's `data.id` and `data.journal_id` identify the event and its originating journal. `data.evidence_id` identifies the phase-owned evidence result. Apply the shared minimum under SH49. Detailed phase payload types remain implementation work. Reference encodings remain under SH51. This decision does not accept approval or interaction interfaces under SH55-SH56.

### `kepler audit list`

**Accepted under [SH110](authoring_progress.md#completed-shared-decisions).** Return compact audit-event projections for an explicit unit scope.

```text
kepler audit list --unit <unit-id> [--stage <stage>] [--task <task-id>] [--activity <activity>] [--attempt <attempt-id>] [--implementation-attempt <attempt-id>] [--type <event-type>] [--fields <field-list>] [--limit <n>] [--cursor <token>] [--project <path>]
```

Require `--unit`. Apply the accepted [project selection](#project-selection) and [scope selector](#scope-and-selectors) rules, including ownership checks. Use applicable scope selectors as filters. Match event types and IDs exactly.

By default, each entry contains `id`, `journal_id`, `phase`, `type`, and `recorded_at`.

Use `--fields` for a comma-separated list of top-level [event envelope fields](runtime.md#event-envelope-choices). It replaces the default projection, but always keeps `id` and `journal_id`. Match field names exactly. Field selection affects each event entry, not the outer CLI result envelope.

Event payload `data`, `caused_by`, and other metadata are opt-in. These entries are query projections, not complete stored events. Omitted fields mean unrequested, not empty or absent. Keep the full stored event envelope unchanged. Use [audit show](#kepler-audit-show) for a complete original event.

Return the following fields inside `data`:

| Field | Audit list result |
| --- | --- |
| `events` | Array of matching event projections for the page. |
| `next_cursor` | Opaque continuation token. Use `null` when no further page exists. |

Use a positive integer for `--limit`. The default is `20` records per page, with a maximum of `1000`.

Bind each continuation cursor to the original query view and filters. Reject invalid or expired cursors. Do not silently restart the query. Cursor format and query-view retention are implementation choices.

Group events by their originating journal. Keep each journal's stored local order. Cross-journal display order has no causal meaning. Keep recorded `caused_by` values when that field is selected. Do not infer a global event order from timestamps.

For no matching events, return `success` with `events: []` and `next_cursor: null`. This query does not write events or advance workflow state. Apply the existing [failure and recovery rules](#failure-and-recovery-rules).

### `kepler audit show`

**Accepted under [SH110](authoring_progress.md#completed-shared-decisions).** Return one complete original event by its journal and event identities.

```text
kepler audit show --unit <unit-id> --journal <journal-id> --id <event-id> [--project <path>]
```

Require `--unit`, `--journal`, and `--id`. Use full, exact identities and validate unit ownership. Apply the accepted [project selection rules](#project-selection). Do not substitute a current or latest event.

Return the complete original event in `data.event`, including its stored scope, bindings, and causes. Field selection applies only to `audit list`. A timestamp alone does not show causality.

A missing event returns failure under the existing [failure and recovery rules](#failure-and-recovery-rules). This query does not write events or advance workflow state.

## Construction commands

Construction uses the [accepted Unit of Work identity rules](unit-of-work.md#identity-and-directory), the [effort rules](effort.md), the [accepted task graph format](phases/construction/task-graph.md), and its [Implementation contract](phases/construction/implementation.md). The Standard workflow selects the stage order. These references keep their own approval status.

### Workflow binding

**Accepted under [SH115](authoring_progress.md#completed-shared-decisions).** Mission creation records its selected workflow. Construction unit creation records the matching `standard` binding through the CLI-owned journal. Keep the binding out of artifact frontmatter and the authored task graph.

Later operations and resume read that recorded binding. Expose it through `unit show`. Reject unsupported bindings instead of silently selecting another workflow.

The MVP has no per-command workflow selector, workflow switching, or generic workflow registry. Binding Standard does not start a stage, grant execution authority, or approve a Unit of Work.

Exact event payload and response-field encoding remain implementation details under the existing runtime and query decisions. This choice does not accept the complete unit-creation interface.

### `kepler workflow construction unit create`

**Interface remains open under SH59.** No complete command signature is selected. The earlier proposed form does not establish mission selection and is not a complete contract. Apply the accepted [project selection rules](#project-selection): `--project` selects the record home. Apply the accepted [workflow binding](#workflow-binding) at creation. Do not infer arguments from this policy.

Unit creation records mission identity, the `standard` workflow binding, the unit identity, and the initial effort. Use the ID format `YYYY-MM-DD-<slug>`, the machine-local date at creation, and the exact ID as the directory name. Its path is `.kepler/missions/<mission-id>/construction/units-of-work/<unit-id>/`, relative to the record-home root. The complete ID must be unique across that project, including known unbound units. Do not change it during revision or resume.

**Proposed input rules:**

- Use lowercase words separated by single hyphens for `<slug>`. Reject invalid input. Do not normalize it silently. The exact valid characters stay open.
- Select Minimal, Standard, or Comprehensive at creation. Use Standard if the requester has not selected another level. The input syntax remains open.
- Do not choose an active Unit of Work implicitly. A newly created unit is not automatically selected for later commands.

On success, make the unit directory and record mission membership, workflow binding, and initial effort facts. These are necessary effects, not a general exactly-once replay protocol. Do not write `unit-of-work.md`, placeholders, requirements, plans, or task files. Do not start a stage or attempt, launch agents, approve work, create branches or worktrees, or make commits. Do not run setup or migration.

A create failure must not report success. Reject invalid input before writing. If the record home cannot be resolved, fail without running setup. If the ID is registered, including to an unbound unit, or its destination exists, refuse without overwriting or adopting it. Under concurrent requests for the same ID, at most one request succeeds.

If a write fails or the process stops partway through, compare actual directory and journal effects with the requested operation. Do this before retrying. Keep uncertain or unrelated material. Do not promise general exactly-once replay. A caller that loses the success response can use `unit list` or `unit show` to read the result. A new request after local midnight can receive a different ID.

The earlier unit-creation example shows proposed fields inside `data`, not an accepted command-specific schema.

A proposed `--stage-effort <stage>=<level>` option is an open question. Do not treat it as accepted or remove the existing stage-override policy.

### `kepler workflow construction unit list`

**Proposed query.** List Units of Work in an explicit record-home scope. Read directory identity and derived execution state. Distinguish mission-owned and known unbound units. Do not create a unit, select an active unit, hide unbound work, or write history. Do not infer a single global order from event timestamps.

Apply the accepted [project selection rules](#project-selection). Filters, ordering, and response fields stay open.

### `kepler workflow construction unit show`

**Proposed query.** Show one Unit of Work by its explicit identity. Include its current effort default and stage overrides. The CLI calculates the current overrides from recorded events. Also show scoped stage and task progress without changing it.

Activities inherit their stage's effort. They do not have their own override. Do not add effort commands. The requester decides stage overrides and later adjustments under the accepted [Effort policy](effort.md#selection-rules). The CLI inputs and operation placement for those decisions stay open.

Use `--unit <unit-id>` under the accepted [scope selectors](#scope-and-selectors). Resolve mission context from unique recorded membership. For an unbound unit, report the missing binding. Do not adopt it.

Expose the accepted [workflow binding](#workflow-binding). Exact response fields stay open under the existing query decisions. This query must not select a unit for later commands.

### `kepler workflow construction lint`

**Accepted scope.** Run Construction-specific task-graph validation here, not in root `kepler lint`.

**Accepted under [SH112](authoring_progress.md#completed-shared-decisions).** Use the following interface:

```text
kepler workflow construction lint --unit <unit-id> [--project <path>]
```

Apply the accepted [project selection rules](#project-selection) and [scope selectors](#scope-and-selectors). Read the explicit unit's `tasks-dag.json` under its mission-owned path from the [Mission contract](mission.md#durable-layout). Resolve membership only from recorded facts. The MVP has no alternate-graph path or per-task lint mode.

Apply the [task graph validation rules](phases/construction/task-graph.md#validation-rules) that software can check. Check strict JSON, schema, UUIDs, unit identity, dependencies, duplicate edges, cycles, and relevant local paths and fragments. Use the selected unit, `plan.md`, and relevant upstream documents as context. Do not infer graph edges from task order, titles, or free-form prose.

Keep Planning's assessment of the graph against `plan.md` and upstream requirements. Lint success does not prove free-form coverage, technical correctness, or external availability. It does not replace Planning's validation and evidence obligations.

Reuse the [shared lint finding fields and result placement](#kepler-lint). Each finding has `path`, `field`, `code`, and `message`. Use JSON Pointers for graph fields and `null` for file-level problems. Do not include complete file contents.

On successful validation, return `success`, exit `0`, and `data.findings: []`. On validation failure, return `failed`, exit `1`, and findings in `data.details.findings` under the shared error envelope. Other failures follow the [failure and recovery rules](#failure-and-recovery-rules).

Keep lint read-only. Do not repair, migrate, generate identifiers, write events, or change workflow state. Keep invalid files and unsupported versions for correction.

## Stage operations

The commands below apply to one explicit Unit of Work and one Construction stage. They use the recorded [Standard workflow binding](#workflow-binding). Construction owns transitions. Standard selects the sequence.

Use `--unit <unit-id>` and `--stage <stage>` under the accepted [scope selectors](#scope-and-selectors). Mutations of an existing stage attempt also use `--attempt <attempt-id>`.

| Operation | Proposed contract |
| --- | --- |
| `stage start` | Start the authorized stage in its unit scope. Create a distinct stage attempt when the stage executes. Enforce the one-active-attempt limit for that fixed scope. Do not start a second active attempt. |
| `stage show` | Read the selected stage's derived state, attempt, effort, and relevant evidence. Do not write or advance state. |
| `stage complete` | Record completion only when the owning phase's completion conditions hold for the current attempt and material. Completing one stage does not complete the workflow. |
| `stage pause` | Pause the current stage attempt without ending it or freeing its active scope. Keep its identity and history. |
| `stage resume` | Resume the same paused attempt. Do not create a second active attempt. Make sure recovery rules are clear before work resumes. |

Each successful lifecycle command records its own typed event. Starting a stage does not launch an agent. A failed or partial transition returns a nonzero operation result. Do not mark a stage complete from a successful process exit alone.

The detailed guards, status vocabulary, event payloads, and recovery of interrupted transitions stay open. Stage details are subject to the owning contract. See the [stage catalog](phases/construction/README.md#stage-catalog).

## Task operations

Task operations use `--unit <unit-id>`. An operation on one task also uses `--task <task-id>` from `tasks-dag.json`. Apply the accepted [scope selectors](#scope-and-selectors). Task IDs identify authored tasks, not attempts. Use the [task graph contract](phases/construction/task-graph.md#task-identity) and [admission rules](runtime.md#task-admission-and-baselines).

| Operation | Proposed contract |
| --- | --- |
| `task list` | List authored tasks and their derived execution state for one unit. Do not edit the graph or write history. |
| `task show` | Show one task definition, current scope, attempt links, evidence, and progress. Do not change state. |
| `task ready` | Report graph dependencies, predecessor outputs known in the unit's integrated state, and known prerequisite facts. Do not admit or start the task. |
| `task admit` | Admit one ready task and capture the current repository-qualified unit integration set as its fixed baseline. Show predecessor-output inclusion from history or provenance, not timestamps alone. Do not create an extra admission commit or task attempt. |
| `task integrate` | Acquire the unit integration lock. Read the current repository-qualified checkpoint set and prepare the combined candidate set. Run typechecking, the project build, and the full application test suite across the required repositories. Accept only the checked candidate set and record each necessary repository result. Release the lock when the operation ends. |

`task ready` cannot interpret free-form acceptance criteria or show external availability without evidence. It reports graph facts and known conditions. The orchestrator compares the criteria and external prerequisites with available facts, then reports whether the task is ready under the task contract.

Do not integrate a task until Code Validation succeeds and its independent non-author feedback is complete. Keep the lock across checkpoint-set capture, candidate preparation, required checks, and acceptance. Record the necessary repository results. A failed check or changed candidate prevents acceptance until the candidate passes again. The task's admitted baseline stays fixed. Record actual Integration inputs separately. Repository commits do not form an atomic cross-repository commit.

Successful acceptance is distinct from requester approval, whole-unit completion, review, or delivery. Do not add unrestricted `task complete`. Generic `activity complete` must not bypass Integration acceptance. The [Code Integration contract](phases/construction/activities/code-integration.md#integration-procedure) owns the check and acceptance rules.

Phase-owned evidence payload details, lock implementation, and the operation result schema remain implementation choices beyond the shared evidence minimum. The task's Activity attempts and evidence stay bound to their occurrences and enclosing Implementation attempt. A task does not have a separate attempt identity.

## Activity operations

Activities are fixed, task-scoped parts of the unit's Implementation stage: Code Generation, Code Validation, then Code Integration. They are not stages. Follow the [Construction Activity rules](phases/construction/activities/README.md#shared-execution-rules) and [attempt rules](runtime.md#activity-attempts).

Use `--unit <unit-id>`, `--task <task-id>`, `--activity <activity>`, and `--implementation-attempt <attempt-id>` under the accepted [scope selectors](#scope-and-selectors). Mutations of an existing Activity attempt also use `--attempt <attempt-id>`.

| Operation | Proposed contract |
| --- | --- |
| `activity start` | Start one Activity occurrence for an admitted task under the active Implementation attempt. Enforce at most one active attempt for that occurrence. Start the next Activity only when its predecessor's conditions hold, unless an authorized return changes the route. |
| `activity show` | Read one Activity occurrence and its attempts, evidence bindings, and current state. Do not write or advance state. |
| `activity complete` | Record completion only when that Activity's conditions and evidence hold for its current attempt. Code Integration can complete only with a matching accepted candidate from `task integrate`. |
| `activity pause` | Pause the current Activity attempt without ending it. Keep its identity and active scope. |
| `activity resume` | Resume the same paused Activity attempt after making sure that earlier workers stopped and its inputs stay valid. |

Code Generation owns implementation, typechecking, related tests, and self-review. Code Validation owns necessary typechecking, the project build, the full application test suite, and independent non-author feedback. Code Integration owns combined-candidate checks and acceptance. These check duties stay binding. The detailed Activity contracts mark other proposals separately.

A local correction, failed command, pause, resume, or new session keeps the current unended attempt. An authorized return creates a new Activity attempt when that Activity executes again. An Integration-only retry stays within its current Code Integration attempt. Do not add task-coding or protocol-run attempt identities.

Phase-owned event payload details, completion guards, and evidence payload types beyond the shared [record minimum](runtime.md#evidence-and-approval-bindings) remain implementation work. An Activity completion does not complete the enclosing Implementation stage or Unit of Work.

## Revision operation

### `kepler workflow construction revise`

**Accepted placement.** Use this direct operation for an authorized revision. Do not add `kepler workflow construction revision` or another revision namespace.

**Proposed scope.** This proposal has two cases:

1. A unit-stage cascade from the orchestrator-selected earliest affected stage through every downstream Standard stage in the authorized unit scope.
2. A task-local return to an authorized Activity, then each later Activity for that task in the accepted order.

The command records the authorized decision and reason through a typed phase operation. It must identify the selected unit, scope, and boundary. Do not invent an authorization proof protocol. A worker's finding or proposed boundary does not authorize revision.

For a unit-wide upstream revision, stop new admissions and active Implementation work for that unit. End affected Implementation and Activity attempts. Keep their history and work. Prevent ended attempts from accepting candidates or completing tasks. Independent units continue when their inputs stay valid.

For a task-local code correction, the orchestrator can return the task to Code Generation. The task must pass Code Validation and Code Integration again. A return starts a new Activity attempt when the Activity executes. An Integration-only retry stays in the current Integration attempt and does not become a revision.

Compare affected evidence and artifacts with the revised contracts under the shared [revision procedure](revision.md#revision-procedure). Update them when they no longer meet those contracts. Do not delete prior artifacts, transfer old completion into a new attempt, or reopen unrelated scopes without authorization. Exact boundary arguments, evidence inputs, cascade events, and partial-failure recovery stay open.

## Record portability

Apply the accepted [SH74 policy](runtime.md#record-portability) to authored artifacts, event journals, derived views, live coordination data, and evidence. Version authoritative history. Keep projections and live runtime coordination data unversioned.

Give relevant journals, necessary causal records, checkpoint material, and accessible evidence for cross-checkout or cross-machine handoff. Missing necessary material blocks only the affected handoff or work. Apply existing recovery and revision rules. Do not infer success or new consent from history transfer.

Current durable journals and unfinished work can help with recovery in the same checkout. No new commit is necessary solely for recording an event, dispatching a worker, or resuming a session. Keep existing checkpoint and unit Integration lock requirements.

This policy does not accept proposed CLI syntax or set publication and synchronization protocols.

## Failure and recovery rules

**Accepted under [SH105](authoring_progress.md#completed-shared-decisions).** When `status` is `failed`, use the following four required fields inside `data`:

| Field | Type | Contract |
| --- | --- | --- |
| `code` | String | Stable error identifier, separate from the numeric exit code. |
| `message` | String | Short explanation of the failure. |
| `details` | Object | Error-specific facts, relevant IDs, paths, or validation findings. Use `{}` when empty. |
| `recovery` | String | Guidance for the next safe action, without granting authority. |

Do not add separate `scope` or `effects` fields to failed `data`. Do not add an effects classifier inside `details`.

An operation can report known partial changes in `details` when those facts are available. A failed response does not prove that nothing changed. Apply the existing recovery rules before retrying.

Recovery guidance does not authorize configuration changes, retries, or discarding work. Individual error-code values and `details` schemas stay command-specific.

This example shows the failure structure, not agreed error-code values or `details` fields:

```json
{
  "status": "failed",
  "data": {
    "code": "missing_git_identity",
    "message": "Git user.email is missing.",
    "details": {
      "missing_keys": ["user.email"]
    },
    "recovery": "Configure the missing Git identity before retrying."
  }
}
```

These rules apply to the proposed command contracts. They do not select a storage or lock implementation.

- Validate inputs and authorization before changing state.
- Return a nonzero status when the requested operation fails. Do not return a successful transition result for an incomplete write.
- If an operation stops after a partial effect, examine the actual journal, projection, directory, candidate, and lock state before retry. Keep uncertain work and history.
- Use stable event identities and phase validation to resolve duplicate or interrupted requests. Do not claim general exactly-once replay until the write protocol is set.
- Never let a late result from an earlier attempt change a newer attempt or show its completion.
- Keep query and lint commands read-only. Projection rebuilds and history queries do not rerun checks or create approvals.
- Keep local journal order. Use causal links for cross-journal causes. Do not use timestamps to invent a global ordering.

The event write protocol, projection rebuild behavior, lock ownership and recovery, and physical storage stay implementation decisions under [CLI infrastructure](runtime.md#execution-state-representation).

### Exit codes

**Accepted under [SH106](authoring_progress.md#completed-shared-decisions).** For CLI-controlled results, use the following exit codes:

| Exit code | Result status |
| --- | --- |
| `0` | `success` |
| `1` | `failed` |

Return `1` for invalid arguments, validation failures, unsupported input, operation failures, and uncertain outcomes. Identify the cause in `data.code` and `data.details`.

These codes describe the command operation. A successful query can exit `0` while reporting an incomplete stage.

Forced termination can produce other exit codes or prevent a JSON response. A missing response does not prove success. Apply existing recovery rules.

## Open decisions

Accepted command placements, structured-output default, and typed lifecycle writes stay in force. The accepted [project selection](#project-selection), [scope selectors](#scope-and-selectors), [result envelope](#machine-readable-output), [failure result fields](#failure-and-recovery-rules), [exit-code contract](#exit-codes), [output stream contract](#output-streams), and [MVP result formatting](#human-output) also stay in force. The exact three [diff-package signatures](#kepler-git-diff-package) also stay in force. The [evidence recording interface](#kepler-audit-record-evidence), [audit queries](#kepler-audit-list), and [shared lint interface](#kepler-lint) also stay in force. The accepted [Construction lint](#kepler-workflow-construction-lint), [UUID](#kepler-uuid), [setup](#kepler-setup), and [workflow binding](#workflow-binding) interfaces also stay in force.

Apply the accepted [resource ownership](installation.md#agent-resource-ownership) and [intended MVP targets](installation.md#intended-mvp-targets). These targets do not claim tested or certified agent behavior. The remaining technical answers do not create requester approval gates.

Other shared runtime and Construction implementation choices stay under SH46, SH51, SH62-SH67, SH69-SH70, SH72, SH84-SH85, SH87, DF14-DF17, and existing SH53-SH60. The [Mission contract](mission.md) settles SH45 storage paths, SH68 workspace policy, and SH86 retained-evidence locations. Remaining choices include journal writes, projections, attempts, locks, workspace allocation, effort changes, task and Activity guards, and recovery. Exact actor and authorization fields stay open under SH55-SH56. Do not invent approval proof or interaction protocols.

Migration commands and future Initialization or Inception commands stay outside this inventory. The agreed [effort policy](effort.md#selection-rules), [revision authority](revision.md#authority-and-escalation), [Construction structure](phases/construction/README.md#implementation), and [Standard stage order](workflows/standard/README.md#stages) stay in force. This CLI draft does not accept other proposals in those contracts.
