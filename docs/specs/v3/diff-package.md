# Git diff packages

[Version 3 reference](README.md) | [CLI commands](cli.md) | [CLI infrastructure](runtime.md)

## Purpose and status

A diff package is generated inspection material for an existing Construction scope. It binds a readable manifest, changed paths, statistics, and a text patch to phase-owned records and Git checkpoints. It is not a stage, Activity, lifecycle milestone, authored artifact type, workflow authority, or general packaging framework.

These contracts set version 3 behavior. The current CLI does not have these commands.

The `kepler git diff-package` command family has three fixed inspection scopes: Code Validation, Code Integration, and Unit of Work Review. It selects existing material-producer context. It does not start the consuming Validation or Review attempt. See the [CLI contract](cli.md#kepler-git-diff-package) for signatures.

## Scope and source bindings

Construction reads its phase-owned records to get source bindings. The Git capability renders the resolved checkpoints. It does not own Construction transitions. Do not infer sources from `.base`, Markdown checkboxes, an implicit current unit, a guessed `HEAD`, or authored task-graph fields. Resolve necessary bindings and commit IDs once. Use those fixed bindings for the manifest, path list, statistics, patch, and fingerprint.

| Inspection scope | Comparison | Required context |
| --- | --- | --- |
| Code Validation | The task's fixed admission baseline to its generated task-output checkpoint. | Include the task definition, relevant upstream-input versions, original Generation attempt, and task output. Include history that distinguishes task changes from peer or prerequisite contributions. This package is available before Code Integration. |
| Code Integration | Compare the lock-captured unit checkpoint with the immutable prepared combined candidate. The owning Integration operation captures these inputs. | Include validated task output and original Generation and Validation evidence. Keep these separate from the fixed admission baseline. Include Integration-only changes, conflict-resolution effects, and relevant Integration deltas across corrections. |
| Unit of Work Review | Compare the unit's original initial integration checkpoint with the final checkpoint identified by the selected Implementation attempt's completion assessment. Capture the initial checkpoint before the unit's first task admission. | Include current cumulative unit changes and relevant original contributions or contributions kept from earlier attempts, with Integration history. Keep the original baseline across returns. |

### Code Validation

The Validation package compares the fixed task admission baseline with the generated task output. Include the task definition, relevant upstream-input versions, and original Generation attempt. Include task-owned commit, parent, and path attribution, with history that distinguishes peer or prerequisite changes. The task's fixed baseline stays unchanged after later integrations.

You can make this package before Code Integration. An accepted integrated publication, successful Integration, and a new Validation attempt are not necessary to make it. The package does not change Validation's existing entry conditions, checks, independent-feedback rule, or completion conditions.

### Code Integration

The owning Integration operation captures the current unit checkpoint after it acquires the unit lock and prepares the combined candidate. It records those immutable bindings. Package rendering consumes those recorded bindings. It does not read moving unit `HEAD` or acquire, release, or take over a lock. It neither prepares nor accepts a candidate. Integration completion is not necessary for package rendering.

Keep the validated task output and its original Generation and Validation evidence distinct from the fixed admission baseline. Show Integration-only changes, conflict-resolution changes, and relevant prior Integration deltas across corrections. Keep task-owned commit, parent, and path attribution separate from Integration effects.

### Unit of Work Review

The Review package starts at the unit's initial integration checkpoint from before its first task admission. It ends at the final integrated checkpoint that the selected Implementation attempt's completion assessment identifies. Keep the original baseline across later attempts and reviews. Do not substitute a remote target merge base or current `HEAD`.

Include cumulative unit changes and relevant task contributions kept from earlier attempts and Integration history. Do not hide earlier unit work after a return or narrow whole-unit review to changed lines. The package is an aid for review of the complete outcome, including relevant unchanged behavior, current contracts, and applicable evidence.

## Selectors and resolution

Each command must have its listed unit and source-attempt selectors. Task-scoped commands must also have the task ID and their Generation or Integration attempt selector. `--implementation-attempt` identifies the source Implementation context, not a consumer context. Each task ID is a UUIDv4 string. Use the existing implementation choice for attempt ID format.

Apply the accepted [scope selector rules](cli.md#scope-and-selectors) without replacing these source-specific selectors. Validate unit, task, and source-attempt ownership. Do not infer a unit, task, attempt, or candidate. Do not accept an arbitrary range override. A Validation or Review attempt selector is not necessary merely to make its input package.

Apply the accepted [project selection rules](cli.md#project-selection) for `--project <path>` and its default. Necessary scope records must be available. Do not create a Unit of Work. Different worktree roots can refer to the same repository only when the recorded material and phase context agree.

Fail when a necessary binding is missing or ambiguous, or a necessary Git object is unavailable. Do not invent a narrower package or silently fall back to a broad or global range. Compare the declared ancestry or provenance relationship with the existing rules. Compare ancestry only within the declared provenance.

## Package content

The generated file contains a readable manifest, complete changed-path list, diff statistics, and full text patch. Use ten lines of patch context. The manifest identifies:

- Inspection scope and repository identity.
- Unit and applicable task identities.
- Original source Implementation and applicable Activity attempt identities.
- Each comparison's role and full, resolved checkpoint IDs.
- Relevant task definitions, input versions, evidence references, and source-applicability records for kept sources.

Identify binary and other nontext changes, and keep access to their actual Git objects. A text patch does not archive all material. Examine necessary non-Git material separately under the consuming contract.

Do not truncate or silently omit overlapping, peer, or journal changes that the selected comparison must explain. Keep original task-owned commit, parent, and path attribution distinct from Integration effects. Show additional changes with unresolved attribution and mark that uncertainty. Do not label such changes task-owned, peer-approved, or validated without evidence.

Do not reject a valid unchanged checkpoint or empty diff. Do not create a commit to make a package nonempty. A new consumer attempt must still do its necessary fresh work when the package bytes do not change.

## Output and effects

The CLI returns structured output for success and failure. Success identifies the inspection scope, resolved source and material bindings, and output location. It also gives the complete package-content fingerprint and shows whether the diff is empty. These are logical result requirements. Return these values inside `data` under the accepted [CLI result envelope](cli.md#machine-readable-output).

Use the accepted [failure result fields](cli.md#failure-and-recovery-rules) for errors. Apply the accepted [exit-code contract](cli.md#exit-codes). Command-specific success field names, error-code values, and `details` schemas stay implementation choices.

`--out <path>` selects a new output file. Resolve a relative path against the selected project root. Refuse to overwrite an existing file or modify tracked application content. Without `--out`, create a fresh local temporary package.

The package-creation rule limits writes to the new output and its necessary temporary container. It does not update Git configuration, ignore rules, the index, refs, journals, or projections. It does not change lifecycle state, create an attempt or commit, or dispatch work. It does not run checks, record approval, accept a candidate, or complete a phase.

On failure, return a structured error and nonzero status without a package-success claim. A partial file is not a complete package. Remove only partial output owned by the failed operation. Keep existing files. Do not add a force option.

## Evidence, retention, and authority

A diff package is a derived view and possible inspection input. It does not show check success, approval, provenance authority, task completion, or content for kept sources. Original scope, material, and attempt bindings stay authoritative. The current contract still governs stage-owned named evidence.

The manifest keeps source attempts' original identities. The consuming check or review result binds to its own current attempt through existing CLI-owned evidence operations. The command can read ended or historical source contexts. Reading them does not show that they are eligible inputs to current work.

Under [IE22](authoring_progress.md#completed-implementation-decisions), a new Implementation attempt can use applicable scopes kept from an older parent without reparenting them. Render those scopes with their original parent, attempt, and material bindings. The consuming phase compares the kept scopes with its context, then reports whether each one applies. Do not assign the new parent ID to input evidence from an older parent or transfer prior completion to the new attempt.

Keep necessary inspection input and supporting evidence under [record portability and retention](runtime.md#record-portability). Keep the package content or the inputs necessary to make it again. A temporary path or hash alone is not durable retention. A portable handoff must make necessary records, Git objects, and evidence available.

This capability adds no per-event, per-dispatch, or per-resume commits, global `HEAD` matching, unrelated clean-workspace gates, or task serialization. It does not change admission baselines, phase procedures, correction authority, lock responsibilities, named evidence, or existing approval triggers.
