# Mission

[Version 3 reference](README.md) | [Shared runtime contract](runtime.md) | [Standard workflow](workflows/standard/README.md)

**Status:** Accepted under SH45, SH68, SH86, and SH118-SH121.

This document owns the accepted mission, record-home, workspace, storage, checkpoint, recovery, and pre-mission contracts. Other specifications link here for these rules.

This approval does not implement or release these rules. It does not authorize mission execution, Unit of Work execution, workspace creation, code changes, installation, publication, deployment, or push.

## Purpose and terms

A mission is one durable execution context for a selected workflow and an identified request. It gives the work one record home across stages, sessions, workspaces, and authorized revisions.

| Term | Meaning |
| --- | --- |
| Workflow | A reusable definition that selects phase-owned stages and their routing. |
| Mission | An execution context that binds a workflow to requested work. |
| Unit of Work | An outcome that Construction can assess and deliver as a whole. |
| Workspace | The repositories, working contexts, branches, and integration targets available to the mission. |
| Record home | The Git repository and selected project root that own the mission's durable records. |
| Local attachment | This machine's mapping from recorded repository and workspace identities to actual paths and live ownership. |
| Attempt | An execution of a stage or Activity under its existing contract. |
| Session | An agent conversation or process that can participate in a mission. |

A mission does not replace unit, stage, Activity, attempt, or material identities. It is not another verification round or run floor.

Standard remains the Construction MVP workflow. It has one Unit of Work per mission. The container can support other agreed workflows. This MVP adds no Initialization or Inception stages.

## Identity, membership, and lifecycle

Use a lowercase, hyphenated UUIDv4 as the mission ID. Record a human-readable title in its creation facts. Do not derive identity from a title, branch, path, session, or current commit.

Use the full mission ID as its directory name. Keep it through pause, resume, relocation, handoff, completion, and authorized reopening.

Each new mission-owned unit belongs to one mission. Its `YYYY-MM-DD-<slug>` ID remains unique across the record-home project, including known unbound units. Keep the unit ID, document UUIDs, and original authors unchanged during revision. References to another mission's units do not transfer ownership. Cross-project references identify the record-home repository and unit.

| Boundary | Rule |
| --- | --- |
| Creation | Record identity, requested purpose, workflow binding, and proposed workspace arrangement. Creation does not start a stage. |
| Workspace preparation | Validate selections and prepare only authorized resources. Record the usable binding before execution. |
| Execution start | Start the first selected stage only after its entry conditions and workspace requirements hold. Its recorded start establishes mission execution start. |
| Pause or session change | Keep the mission identity. Existing attempt rules determine which work can continue. |
| Authorized revision | Keep the mission and historical bindings. End or restart affected attempts only under existing revision rules. |
| Completion | Complete the final selected stage under its contract. For Standard, this is Deliver. |
| Authorized reopening | Keep the same mission and record the reopening. Earlier completion no longer proves current completion. |
| Separate requested work | Create another mission instead of replacing or silently extending unrelated work. |

Workspace preparation is a startup operation, not a workflow stage. A preparation failure leaves the mission unstarted. Keep creation facts and known partial effects for recovery.

The first selected phase owns mission creation and initial workspace-binding facts. For Standard, Construction owns these facts. Phase journals remain authoritative. Mission creation and workspace preparation do not start Functional Design.

Construction unit creation records the `standard` binding. That binding must match the mission's workflow binding. Resume must not select another workflow or silently repair a mismatch.

Creating a mission does not grant implementation, publication, deployment, configuration, or cleanup permission. Existing stage approvals and operation authority still apply.

## Durable layout

All paths below are relative to the selected record-home working-tree root:

```text
.kepler/
  reference/
  missions/
    <mission-id>/
      history/
        <phase>/
          <journal-id>.jsonl
      construction/
        units-of-work/
          <unit-id>/
            unit-of-work.md
            design.md
            quality.md
            plan.md
            tasks-dag.json
            delivery.md
            details/
              <stage-or-activity>/
      evidence/
        <retained-output>
```

This tree shows permitted locations, not files to create at startup. Create artifacts only when their contracts need them. Create optional detail and evidence directories only when useful content exists.

Required Unit of Work documents stay at the unit root. Supporting documents keep their existing types and metadata rules. Do not add a required mission, execution, review, or workspace document.

Project references remain shared at `.kepler/reference/`. Application code stays in its selected repositories. The mission records references to shared context and source material instead of copying everything into its directory.

Suitable evidence can live under `evidence/`. Keep large or sensitive material externally when necessary. Keep durable references and accessible content. A temporary path or digest alone does not retain evidence.

Do not place changing status, attempt pointers, approvals, or workspace ownership in authored Markdown or the task graph. Do not add `mission_id` to common frontmatter.

## Record home and project selection

Each mission has one logical record home: a Git repository and a selected working-tree root. The record home can also be a code repository. Multi-repository work does not require a separate metadata repository.

Apply the accepted [project selection rules](cli.md#project-selection). The selected root must be a Git working-tree root with an explicitly prepared local `.kepler/` directory. Keep selection exact. Do not search ancestors, fall back silently, initialize Git, or create the marker during resolution.

For mission operations, `--project` selects the record-home working copy. When a command runs from another code checkout, supply that record home under the existing project-selection rules. This contract adds no public command or selector grammar.

Linked working copies share one logical record-home identity. Concurrent writers use isolated checkouts and effective shared coordination. Collect relevant current history before state-dependent operations. A working copy does not become an independent history authority.

The workspace identifies code repositories separately. A secondary code repository does not need its own mission or `.kepler/` directory solely to participate. Keep any existing Kepler data there separate. Participation does not adopt or merge that repository's missions.

A receiving checkout can become the local record home through a validated handoff. That transfer does not create another mission or history authority.

## Journals and authority

Phase-owned append-only JSON journals remain the authoritative workflow history. Mission grouping changes their physical parent, not phase ownership or transition authority.

The first selected phase owns mission creation and initial workspace-binding facts. Each later operation records its facts under its owning phase. Mission queries combine those facts with the selected workflow's routing.

Record mission identity and necessary scope bindings in phase-owned payloads. Keep the existing ten-field event envelope unchanged. Detailed payload schemas remain under their existing decisions.

Record the workflow binding with mission creation. Construction unit creation also records the accepted `standard` binding. The bindings must agree. Resume must not select another workflow or silently repair a mismatch.

Use an initial request reference or necessary request facts. Do not require a full conversation transcript or copy secrets into history.

Do not add an independently authoritative mission state file or mission registry. Derive progress, lists, workspace information, and unit-to-mission lookup indexes from recorded facts.

Agents and skills use CLI-owned operations. They do not edit journals or projections directly. Live ownership records describe local coordination. They do not replace workflow history.

## Portable workspace facts and local attachments

A workspace is a set of bindings, not one branch or directory. A new workspace can combine existing checkouts and newly created working contexts.

| Portable facts | Machine-local attachment |
| --- | --- |
| Participating repository identities and roles | Actual repository and worktree paths |
| Selected branch strategy and requested base references | Current checked-out branch and observed filesystem state |
| Resolved initial repository commits, when they exist | Local Git-directory and worktree mappings |
| Intended working contexts and integration targets | Process IDs, worker sessions, locks, and ownership claims |
| Authorized workspace changes and their material consequences | Local preparation progress and available diagnostic output |

Record repository identity in the portable workspace binding. Do not derive it from free-form material-reference text or rely only on an absolute path or mutable remote URL. Keep credentials out of portable records.

Portable history records intended bindings and observed material facts. A stored branch name does not prove its current target. Validate current paths, branch state, and ownership locally.

Record later authorized changes instead of overwriting the original binding. A local path change that identifies the same material does not invalidate evidence by itself. Material or input changes follow existing applicability and revision rules.

## Workspace selection and preparation

Resolve these choices before the first stage starts:

| Choice | Supported arrangement |
| --- | --- |
| Repositories | One repository or an explicit set of repositories. |
| Working context | Existing checkout, new Git worktree, or an identified previous workspace. |
| Branch | Current branch, resolved default branch, another existing branch, or a new branch. |
| Starting point | The selected reference and resolved commit for each repository, or its explicit no-commit condition. |
| Record home | The one working tree that owns durable mission records. |

For isolated code changes, propose a new worktree and branch from the selected base. The requester can choose an existing context. Do not create resources merely because they are the suggested default.

A default branch can supply the starting base. Direct edits to that branch require an explicit selection. Do not guess `main`, `master`, or an implicit previous branch.

A previous workspace means an identified saved binding. It does not mean the last directory, session, or Git checkout shortcut.

Preparation must:

1. Resolve repository identities, branches, base commits, record home, and requested local locations.
2. Check relevant existing work, ownership, permissions, and conditions for the selected mode.
3. Obtain any missing consequential choice or operation authority.
4. Create or attach only selected resources, without overwriting existing work.
5. Verify the actual result and make the usable binding available through CLI-owned records and local attachments.
6. Start the first stage only when its entry conditions and required workspace are satisfied.

An unrelated dirty workspace must not block independent work. Do not silently stash, reset, switch branches, move uncommitted changes, overwrite paths, or delete resources.

A fresh checkout from a commit does not include uncommitted work. If that work is needed, identify it and obtain an explicit transfer choice.

A greenfield repository can have no commit yet. Record that condition without inventing a checkpoint. A preparation mode that needs an existing commit cannot proceed until a suitable setup is selected. Project resolution itself does not initialize repositories.

On preparation failure, report known created resources and partial changes in the common error `details`. Keep uncertain or unrelated material. Do not claim readiness or reverse changes automatically.

## Local storage and concurrency

Keep mission-local runtime data under the record repository's Git common directory:

```text
<record-repository-git-common-directory>/kepler/
  missions/<mission-id>/
    workspaces/
    coordination/
```

`workspaces/` contains this machine's attachments and preparation observations. `coordination/` contains live mission and unit coordination. Neither is versioned workflow authority.

Shared checkout ownership must also cover writers from other missions or record homes. Keep those claims within the code repository's local Git coordination domain:

```text
<code-repository-git-common-directory>/kepler/workspaces/<local-workspace-key>/
```

The local key and claim format are implementation choices. Claims must identify the actual working context, not only a branch label. Do not assume coordination with arbitrary unmanaged processes.

All supported concurrent participants must share effective coordination for resources they can mutate. If safe ownership cannot be established, do not reuse that working context. Choose isolation or resolve the ownership conflict.

A mission workspace does not force workers into one checkout. Isolate concurrent writers and interfering check resources. Keep Generation and independent Validation contexts separate.

Use the shared [short scoped coordination contract](runtime.md#short-scoped-coordination). Keep the existing long unit Integration lock through candidate preparation, required checks, and acceptance. Do not make either lock a global mission, project, or repository test gate.

Distinct units or missions that contend for an actual checkout or integration target must isolate or coordinate that resource. Unrelated scopes continue.

## Multi-repository checkpoints and integration

A Git checkpoint is a commit in one repository. A multi-repository operation uses a repository-qualified checkpoint set. Include unchanged participating repositories when they are relevant inputs.

Use recorded workspace bindings to identify each selected repository. Do not infer repository membership by parsing free-form task-graph input references. Resolve actual file paths within the selected repository and reject real paths that escape its root. Keep the task graph's closed schema unchanged.

Keep these checkpoint roles separate:

| Checkpoint role | Meaning |
| --- | --- |
| Mission starting set | Repository snapshots selected during startup. |
| Original unit Review baseline | The unit's integration set before its first task admission. Keep it across authorized returns for whole-unit Review. |
| Task admission baseline | The current unit integration set when a task is admitted, including required predecessor outputs. Keep that task's binding fixed. |
| Integration inputs and candidate | Actual inputs captured after taking the unit lock, and the immutable combined candidate set checked for acceptance. |

Startup snapshots do not replace later admission baselines. Later unrelated commits do not invalidate a fixed admission. Keep every check and approval bound to its actual material.

Validation, Integration, Review, and diff packages must identify the repositories and exact comparisons they cover. Preserve each repository's required provenance, patch content, binary-object access, and original attempt bindings. Do not silently omit a participating repository.

Repository-owned snapshots are not one atomic cross-repository commit. Unit Integration holds its lock through preparation, checks, and acceptance of the combined candidate set. Acceptance requires confirmation of every necessary repository result.

If publication of local integration targets is partial or uncertain, do not report successful acceptance. Block affected state-dependent work while reconciling actual targets and records. Keep known successful and partial effects. Do not reset repositories automatically or claim cross-repository rollback.

This storage contract grants no push, merge, release, or deployment permission. Remote publication remains subject to its applicable authority.

## Evidence, transfer, and recovery

Keep authoritative journals and suitable authored artifacts versioned in the record repository. A new commit is not required solely for an event, dispatch, or session resume.

Separate writer journals remain permitted. Preserve event identities, originating journal identities, local order, original producer values, causes, attempts, and material bindings. Do not create a timestamp-based global order.

Keep required checkpoint commits reachable through retained references in each repository. A JSON commit reference alone does not keep its objects. Reference naming and publication mechanisms remain under their existing decisions.

A handoff must include relevant mission history, authored artifacts, necessary repository objects, and accessible evidence. Copying the mission directory alone may not supply code checkpoints from other repositories.

Validate received history before using it for authority. Keep unsupported, conflicting, or interrupted input for reconciliation. Missing or uncertain history blocks affected work. Widen the blocked scope only when safe isolation cannot be shown.

On resume:

1. Select the explicit mission or its unambiguous unit membership within the record home.
2. Reconcile relevant history, actual material, and recorded progress.
3. Resolve local repository mappings and verify required branches and checkpoints.
4. Confirm that the assignment is current and earlier conflicting workers have stopped.
5. Re-establish local attachments and ownership without restoring copied locks.
6. Continue unended attempts and repeat only missing or invalid work under existing contracts.

Verify material required by the operation. Normal branch advancement does not require a return to startup commits.

If a checkout is unavailable, first reconcile unfinished work. Recreate or replace it only under applicable authority. Do not repeat startup creation automatically.

A timeout, missing session, Git snapshot, or copied ownership file does not prove that an old worker stopped.

Concurrent use of independent record-home clones or machines requires effective shared coordination or an explicit safe handoff. Git transfer alone does not provide live synchronization or distributed ownership.

## Completion, cleanup, and pre-mission data

Mission completion retains its directory, documents, history, and necessary evidence. Completion does not authorize deleting branches, worktrees, local records, or external resources.

Authorized reopening uses the same mission and unit identities. Existing revision rules determine affected attempts, downstream work, and fresh evidence.

Reconcile ownership records with live processes before recovery. An old modification time does not authorize lock takeover or resource deletion.

Existing `.kepler/units-of-work/` data and its history remain untouched. A unit without a mission binding is unbound. Do not infer its mission from a branch, directory, or current selection.

Project-wide listings must distinguish known unbound units from mission-owned units. Mission-aware lookup or resume of an unbound unit must report the missing binding. It must not silently adopt the unit or hide known unfinished work.

Unbound units remain outside mission-aware execution until separately authorized migration or adoption. Reserve their known unit IDs when checking project-wide uniqueness. A new mission must not overwrite or replace them.

No migration mechanism or command is selected here. Existing shared metadata remains valid under its contract. Read-only metadata lint of explicit files does not require mission adoption.

Retention periods, archive operations, and automatic cleanup remain outside this contract.

## Implementation boundaries

This contract settles policy, not interfaces or mechanisms. This batch selects no mission-create command. SH54 selects `--mission <mission-id>` when a mission-scoped operation lacks unit context; unit-scoped operations use unique recorded membership. The full unit-create syntax remains under SH59.

Event payload schemas and journal transactions remain implementation choices. Material references follow SH51 and do not supply repository or checkpoint bindings by themselves. Lock mechanisms, claim formats, branch allocation, checkpoint reference names, and publication remain under their existing decisions. Retention and cleanup remain separate.

Unit-based existing operations may resolve a mission from unique recorded membership. Mission-aware queries must handle unbound units explicitly. This Mission contract added no `--mission`, `--repo`, batch, or format selector. SH54 later adds `--mission <mission-id>` only when a mission-scoped operation lacks unit context. Unit-based operations do not need that selector. This extension does not change diff-package signatures or existing audit-list/show signatures.

Keep the existing ten-field event envelope, task graph schema, artifact identities, authors, and types. Do not add an authoritative mission registry, mutable mission state, or authored mission, workspace, execution, or review documents. Do not add per-event commits, global serialization gates, unsafe lock takeover, or automatic rollback.

Remote effects keep their separate permissions. This approval does not authorize changes to authentication, publication, installation, or execution.
