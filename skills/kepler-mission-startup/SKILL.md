---
name: kepler-mission-startup
description: "Create or recover a Standard mission and its single Unit of Work before Functional Design. Use when a developer asks to start a v3 mission."
---

# Start a mission

Use the CLI-owned mission operation to create and prepare a mission, then create its single Standard Unit of Work. Mission and unit creation are distinct operations; neither starts Functional Design or dispatches workers. Never write journals or local attachments by hand. The developer supplies intent and consequential selections; you run the commands, parse responses, retain IDs, and report the next skill prompt. Read [agent request and handoff recipes](references/agent-operations.md) before constructing requests. Do not present the commands below as developer instructions.

First inspect project instructions, Git status, selected CLI/versioned resources, available host capabilities, and existing mission/unit records. Do not install software or modify host configuration without authorization. Ask about consequential branch/workspace/Integration-target choices rather than assuming them. Limit the complete Standard walkthrough to one participating repository: current Code Integration does not support multi-repository units.

## Request

Collect the required selections before calling the CLI:

- A concise title and request.
- The `standard` workflow.
- One logical record-home repository identity and its selected Git working-tree root.
- Selected context references with a purpose for each.
- Each participating repository's stable caller-supplied identity, local workspace choice, branch choice, and Integration target.

Use one of these workspace choices:

- Existing checkout: `{ "kind": "existing", "path": "<repository-root>" }`.
- New worktree: `{ "kind": "new", "path": "<new-worktree-path>", "source": "<source-repository-root>" }`.
- Previous binding: `{ "kind": "previous", "workspace_id": "<saved-workspace-id>", "mission_id": "<source-mission-uuid>", "record_home_repository_id": "<source-record-home-id>", "record_home_path": "<source-record-home-root>" }`.

Select a branch explicitly as `{ "kind": "current" }`, `{ "kind": "default" }`, `{ "kind": "existing", "name": "<branch>" }`, or `{ "kind": "new", "name": "<branch>", "base": "<commit-or-ref>" }`. The default selection requires the repository's resolved local `origin/HEAD` branch. Never guess `main`, `master`, or a previous branch. Choose a local branch Integration target, such as `main` or `refs/heads/main`.

## Prepare the record home

Before project resolution, verify that the selected record-home path is the Git working-tree root and that `.kepler/` is a directory. If `.kepler/` is missing, create only that empty marker directory at the selected absolute path with `mkdir -- "<record-home-root>/.kepler"`. Do not ask the resolver to initialize it, create unrelated scaffolding, overwrite an existing path, or remove existing contents. If `.kepler/` exists as a file or symlink, stop and report the conflict.

Secondary code repositories do not need `.kepler/` solely to participate. Do not create a marker in them.

## Call and verify

Send exactly one strict JSON object using the `--request` option:

```sh
kepler mission create --project <record-home-root> --request '<json-object>'
```

The request fields are `title`, `request`, `workflow`, `recordHomeRepositoryId`, `contexts`, and `repositories`. Each repository has `repositoryId`, `workspace`, `branch`, and `integrationTarget`. Keep caller-supplied context references unchanged.

A success result returns the generated `mission_id`, record home, prepared workspace bindings, branch, Integration target, and starting commit or explicit `no-commit` condition. Confirm `execution_started` is `false`; this operation creates no stage attempt. Preserve the returned mission and workspace identities for later CLI operations. Read both process exit and the structured result; do not infer success from one alone.

On failure, inspect the structured `code`, `details`, and `recovery`. Preparation can leave a recorded mission and known partial effects. Preserve them, inspect the actual Git and filesystem state, and reconcile before retrying. Do not reset, stash, switch dirty work, delete, publish, or edit history to make a retry pass. An unrelated dirty workspace does not block a separate selected workspace.

## Continue an interrupted startup

Confirm that the original startup command has ended; do not infer this from a timeout. Keep its mission ID and original record home, then use:

```sh
kepler mission prepare --mission <mission-id> --project <original-record-home-root>
```

Use the exact full lowercase UUIDv4 from the original result. Do not repeat `mission create` as a retry; it allocates a new identity. The CLI uses saved resolved instructions and exact pending event envelopes, verifies canonical resource identities and fixed starting checkpoints under coordination, and completes only missing authorized work. Do not change the instructions, attachments, checkpoints, or history to make recovery pass. If facts are missing or conflict, preserve all material and report the failure instead of reconstructing the original choices.

Confirm `execution_started` is `false`. A success with `historical: true` returns recorded preparation facts and omits local workspace IDs and paths. It needs no local intent or attachments, does not recreate them, and does not establish current execution readiness. Fresh results omit `historical` and include verified local bindings. Check the owning operation's current prerequisites before starting execution.

## Create or recover the single Standard unit

After successful mission preparation, inspect `kepler workflow construction unit list --project <record-home-root>` and, for any likely existing membership, `unit show --unit <unit-id> --project <record-home-root>`. Use the returned mission identity and actual records. If that mission already owns its unit, reuse its exact ID and directory; do not invoke `unit create` again. Conflicting or unknown membership is a blocker to reconcile, not a reason to make another mission.

For a prepared mission without a unit, agree a lowercase hyphenated slug and effort (`standard` unless the requester selects another applicable effort), then call:

```text
kepler workflow construction unit create <slug> --mission <mission-id> --effort <level> --project <record-home-root>
```

The CLI returns `unit_id`, directory, membership, workflow binding, and `execution_started: false`. Read back `unit show`, verify the mission and `standard` binding and absence of a stage attempt, then hand off to `kepler-design`. If the unit-create response is lost or fails after effects, inspect unit inventory and history before considering a retry; a second unit cannot be attached to the mission. Do not edit membership, attachments, or journal data to force a retry. Preserve partial effects and route uncertain state through `kepler-resume`.

Report mission ID, exact unit ID/directory, record home, selected repository/workspace/branch/target, effort, current readiness/blockers, and the next prompt: “Use kepler-design for this unit. Draft Functional Design and show me the committed material for approval; do not advance without my decision.” Do not start the stage on the developer's behalf.
