# Mission state and artifacts

Use this explanation to inspect mission records or integrate a tool with the CLI. Start with the [tutorial](tutorial.md) if you are new to Kepler.

## Identify the scope

| Identifier | Meaning |
| --- | --- |
| Mission ID | Full lowercase UUIDv4 allocated by mission creation. |
| Unit ID | Machine-local creation date and lowercase slug, such as `2026-11-10-owner-access`. Use the returned value. |
| Repository ID | Explicit non-empty logical name, such as `repo-main`. It is not a filesystem path. |
| Task or graph ID | UUIDv4 in the authored task graph. |
| Stage or Activity attempt ID | UUIDv4 allocated when that execution starts. |
| Artifact ID | UUIDv4 in Markdown frontmatter. |
| Event ID | Identity of a fact in history. |
| Evidence ID | Identity of a named check result. It differs from the event ID that records it. |
| Journal ID | Identity of the JSON Lines stream containing events. |

Do not abbreviate selectors. Use the exact unit and attempt returned by the operation. A stage name alone does not select an active attempt for mutation.

## Durable project records

```text
.kepler/
  reference/
  missions/<mission-id>/
    history/construction/<journal-id>.jsonl
    construction/units-of-work/<unit-id>/
      unit-of-work.md
      design.md
      quality.md
      plan.md
      tasks-dag.json
      delivery.md
      details/<stage>/...
```

`reference/` holds shared project references. Stage owners can link supporting documents from their primary artifacts. The material reader checks those links and current contents. A filename alone is not sufficient identity.

Mission creation records the request and workspace preparation. Unit creation makes its directory and membership record. Neither operation writes the authored stage documents or task graph. The stage owner creates those files with the required metadata and content.

## Markdown material

Each primary stage artifact has shared frontmatter. For example:

```yaml
id: 11111111-1111-4111-8111-111111111111
type: functional-design
schema_version: 3
unit_id: 2026-11-10-owner-access
author: Your Name <you@example.com>
```

Use fresh IDs and the actual unit and author in real work. Artifact types include `unit-of-work`, `functional-design`, `non-functional-requirements`, `implementation-plan`, `delivery-plan`, and `supporting-document`.

An artifact binding contains `artifact_id` and `content_version`. The latter uses `sha256:<hex>` for the exact file bytes. A repository checkpoint contains `repository_id` and a full Git commit ID. The content and checkpoint must agree when the operation requires committed material.

The task graph is JSON with `format: "kepler-task-dag"` and `version: 1`. It has a graph ID, owning unit, and tasks. Its version is separate from Markdown `schema_version`. See the [Construction reference](../cli/construction.md) and [task graph contract](../specs/v3/phases/construction/task-graph.md).

## Local workspace data

Prepared workspace attachments and startup recovery instructions are under the record home's Git common directory:

```text
<git-common-directory>/kepler/missions/<mission-id>/workspaces/
<git-common-directory>/kepler/missions/<mission-id>/workspaces/startup/intent.json
```

These local facts bind workspace paths, Git directories, branches, and starting checkpoints. They do not replace durable workflow authority. Copying history to another directory does not recreate those local bindings.

Coordination and Integration locks also depend on exact scope and owner identity. Do not infer ownership from a filename, age, or process number alone. Do not edit or delete local coordination files to force a transition.

## Derived state

Kepler collects history and derives a **projection**, which is a current view of recorded facts. It does not treat a manually edited status file as authority.

Stage and Activity states are `not_started`, `running`, `pausing`, `paused`, `waiting`, `completed`, `reopened`, and `ended_by_revision`. A query can report `unknown` when reliable state cannot be established.

Task states are `blocked`, `ready`, `admitted`, `generating`, `validating`, `integrating`, `waiting`, `complete`, and `reopened`. Note the distinction between task `complete` and stage `completed`. Inspect the returned blockers and evidence. Do not derive task state from a stage state.

Set `$UNIT` to the returned unit ID. Set `$PROJECT` to its record-home root:

```bash
kepler workflow construction unit show --unit "$UNIT" --project "$PROJECT"
kepler workflow construction stage show --unit "$UNIT" --stage implementation --project "$PROJECT"
kepler workflow construction task list --unit "$UNIT" --project "$PROJECT"
```

`unit show` reports directory and membership status, workflow binding, progress, stage/task summaries, blockers, and unknowns. Unreliable progress can use `null` counts. A successful query means that the query ran; it does not mean the unit is ready or complete.

Read [CLI conventions](../cli.md) for selectors and outputs. Read [Audit](../cli/audit.md) for event queries.

## Evidence and authority

A check result can be `passed`, `failed`, or `inconclusive`. Evidence binds exact inputs, scope, and checkpoints. Some operations also require artifact bindings, worker context, output references, or causal links to a requester interaction.

Record actual observations. A successful check in another attempt or against different bytes is not current proof. The caller runs the checks; recording an evidence object does not execute its command.

Approval records an explicit requester decision for exact material. An interaction records a request, discussion, or supported selection. Kepler does not infer approval from silence, a commit, or an agent's summary.

## Completion and recovery

The implemented public completion path ends with Deliver. There is no separate mission-finished event or `mission complete` command. Verify that all six current stages report `completed` and that the unit is not blocked. Inspect the delivery assessment and reviewed checkpoints.

New history records can remain uncommitted after a successful operation. Stage completion is not a promise of a clean working tree or remote publication. Preserve the journals and follow the project's authorized commit and handoff procedure.

A failed response can follow a partial effect. Inspect exact history and current material before retrying. Use [Recovery](../recovery.md) for paused attempts, revisions, changed prerequisites, and Integration locks.

## Sources

Implemented record and query behavior: [events](../../packages/cli/src/construction/events.ts), [projection](../../packages/cli/src/construction/projection.ts), [unit queries](../../packages/cli/src/construction/unit-queries.ts), [mission workspace](../../packages/cli/src/construction/mission-workspace.ts), and [material reader](../../packages/cli/src/construction/node-material-reader.ts).

Supporting specifications: [mission](../specs/v3/mission.md), [unit](../specs/v3/unit-of-work.md), [metadata](../specs/v3/metadata.md), and [runtime](../specs/v3/runtime.md). These links do not change the specifications or establish that deferred requirements are implemented.
