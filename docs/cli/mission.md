# Mission commands

Use this reference to create a Standard mission or continue its preparation. A mission records a request, selected repositories, and workspace choices. It does not run workers. See the [operator walkthrough](standard-walkthrough.md) for complete CLI mechanics or the [developer tutorial](../missions/tutorial.md) for agent prompts.

## `mission create`

```text
kepler mission create --request <json> [--project <path>]
```

`--request` is required exactly once. `--project` selects the record home and defaults to the invocation directory. The project must be a Git working-tree root with an existing local `.kepler/` directory. `-h, --help` prints help.

### Request fields

All six top-level fields are required. Unknown fields fail. Note the camelCase request names. Response and history field names often use snake_case instead.

| Field | Type and constraints |
| --- | --- |
| `title` | Non-empty mission title. |
| `request` | Non-empty request facts. |
| `workflow` | Exactly `standard`. |
| `recordHomeRepositoryId` | Logical ID of the selected record-home repository. |
| `contexts` | Array of `{reference, purpose}` objects. Both values are non-empty strings. The array can be empty. |
| `repositories` | Non-empty array of repository selections with unique `repositoryId` values. |

Each repository selection has exactly `repositoryId`, `workspace`, `branch`, and `integrationTarget`.

| Field | Meaning |
| --- | --- |
| `repositoryId` | Non-empty logical repository identity. |
| `workspace` | One explicit selection from the table below. |
| `branch` | One explicit branch choice. |
| `integrationTarget` | Local branch target. A branch name is normalized to `refs/heads/<name>`. Other ref namespaces are rejected. |

### Workspace choices

| `kind` | Other required fields | Behavior |
| --- | --- | --- |
| `existing` | `path` | Use an existing local Git workspace. |
| `new` | `path`, `source` | Create the requested workspace from a local source repository. The destination and branch choices must pass preparation checks. This is not a general remote-clone command. |
| `previous` | `workspace_id`, `mission_id`, `record_home_repository_id`, `record_home_path` | Reuse an explicitly identified saved workspace binding. `mission_id` is a full lowercase UUIDv4. Other identities and paths must match saved facts. |

Workspace paths and source paths must resolve to the intended local resources. Preparation checks canonical paths, Git directories, ownership, branches, checkpoints, and conflicting attachments. Do not use a guessed workspace ID. Retain the result of the original creation operation.

### Branch choices

| `kind` | Other fields | Meaning |
| --- | --- | --- |
| `current` | None. | Use the current attached local branch. An explicitly unborn current branch can record a `no-commit` starting checkpoint. |
| `default` | None. | Resolve the local `refs/remotes/origin/HEAD` selection, then require its corresponding local branch. There is no assumed `main` or `master` fallback. |
| `existing` | `name` | Select an existing valid local branch. |
| `new` | `name`, `base` | Create a valid new branch from an explicitly resolvable commit/base. Reject an existing destination branch. |

There is no implicit repository, workspace, or branch selection in the JSON request.

### Example

Create `mission-request.json` for an existing project root:

```json
{
  "title": "Owner access policy",
  "request": "Deny access for different or empty identifiers.",
  "workflow": "standard",
  "recordHomeRepositoryId": "repo-main",
  "contexts": [],
  "repositories": [{
    "repositoryId": "repo-main",
    "workspace": {"kind": "existing", "path": "/absolute/path/to/project"},
    "branch": {"kind": "current"},
    "integrationTarget": "refs/heads/main"
  }]
}
```

Replace the path and target with the selected project's actual values:

```bash
kepler mission create --project "$PROJECT" --request "$(cat mission-request.json)"
```

### Result and effects

Success exits 0 and returns `mission_id`, `workflow`, `record_home`, `workspaces`, and `execution_started: false`. Each fresh workspace result includes its logical repository ID, context, local workspace ID/path, branch, Integration target, and starting checkpoint.

The operation allocates a new mission ID, records mission history, and prepares only the selected resources. It can create workspaces or branches and local recovery/attachment files. It does not create a Unit of Work, write stage artifacts, start a stage, or dispatch agents.

Invalid requests, project mismatch, branch or workspace conflicts, unavailable checkpoints, and uncertain preparation fail with exit 1. Preserve the reported mission ID and partial effects. Repeating `mission create` allocates another mission; it is not a recovery retry.

Mission preparation can select multiple repositories. Current Code Integration supports one repository per unit. Use one repository for the complete tutorial. Do not infer multi-repository completion support from startup success.

## `mission prepare`

```text
kepler mission prepare --mission <mission-id> [--project <path>]
```

`--mission` is required exactly once and must be a full lowercase UUIDv4. Use the original record home. `-h, --help` prints help. No request object, alternative workspace choices, or force option is accepted.

```bash
kepler mission prepare --mission "$MISSION" --project "$PROJECT"
```

The operation continues missing work from saved startup instructions. It checks original selections, checkpoints, resources, and event identities under scoped coordination. It preserves existing resources and refuses conflicting facts.

If preparation was already recorded, success includes `historical: true`. That historical result omits local workspace IDs and paths. It does not inspect current readiness or repair missing attachments. Fresh preparation omits the `historical` field; it does not emit `historical: false` in the public projection.

Preparation does not start a stage, restore workers, reset Git, remove another owner's lock, or infer choices from current refs. Missing intent, changed checkpoints, uncertain history, or conflicting local state fail with exit 1. If lock release also fails, retain the primary failure and reported partial effects. See [startup recovery](../recovery.md#continue-mission-preparation).

## Next operations and sources

Create the single unit with [Construction `unit create`](construction.md#unit-create). Inspect progress with `unit show` and [audit queries](audit.md#query-history). There is no public mission list, mission show, mission run, or mission finish command.

Implementation: [mission startup](../../packages/cli/src/construction/mission-startup.ts), [workspace selection](../../packages/cli/src/construction/mission-workspace.ts), [CLI adapters](../../packages/cli/src/cli/nest/capability.commands.ts), and [public six-stage E2E](../../tests/e2e/stage-completion.test.ts). Supporting contract: [Mission](../specs/v3/mission.md).
