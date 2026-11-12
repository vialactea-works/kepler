# Recover interrupted work with your coding agent

A lost session or timeout does not prove that a worker stopped or that a command had no effect. Ask the agent to inspect the exact scope and effects before retrying. Keep partial work, Git checkpoints, evidence, locks, and history intact. Recovery does not authorize deletion, rollback, release, or deployment.

> Use kepler-resume to inspect [unit] in [record home] without changing state. Tell me what is complete, blocked, awaiting my decision, or safe to do next, with the next skill prompt.

If an operation stopped:

> Use kepler-resume to reconcile the interrupted startup, stage, task, Integration, or delivery operation. Confirm previous workers ended and inspect actual effects before any retry. Preserve the original identities and work, then return to the owning skill. Ask me only for missing authority or a consequential choice.

The agent should report the exact unit, attempt and evidence, known and unknown effects, next safe action, and any information only you can supply. It performs routine Kepler CLI operations itself. Complete selectors, input shapes, and failure cases are in [Recovery operations for agents and operators](cli/recovery-operations.md).

## Continue mission preparation

If mission creation stopped, give the agent the original mission ID and record home when available. It checks the original startup operation ended, inspects saved selections and partial workspace/branch effects, and continues the *same* mission. Repeating mission creation allocates another identity. An already recorded preparation response does not establish current workspace readiness. If the unit was created before a lost response, the agent must find and reuse it rather than create a duplicate.

**Agent operation example, not a developer instruction:** `kepler mission prepare --mission <original-id> --project <original-record-home>` performs only eligible missing preparation from saved choices. It does not start a stage or dispatch a worker. See [Mission preparation](cli/mission.md#mission-prepare).

## Resume Construction work

The agent selects the unit from the record home and checks the owning stage, task, Activity, and audit history. There is no global `status` command, and neither branch name nor chat history proves a current scope. Ask for a specific unit when several match. It confirms the exact previous worker ended before continuing work that could conflict.

A pause request records `pausing`; it does not stop the worker. Only after termination and effect reconciliation may the agent acknowledge a pause and resume the **same** attempt with the exact original inputs. A failed command does not require a new attempt. Resumption does not dispatch the worker; the host assigns the owning skill separately.

An upstream change may require a revision from the earliest affected stage. The orchestrator stops affected work, reconciles locks and effects, then uses the authorized revision route. Task-local correction is different from reopening a whole unit; Code Integration's eligible check retry uses the same attempt. After a new Implementation attempt, task prerequisites need applicable current proof. See [Construction recovery operations](cli/recovery-operations.md#resume-construction-work).

## Integration acceptance and release

If Integration stops, the agent inspects its exact token, captured target, prepared candidate, check evidence, accepted state, and actual target. It keeps an uncertain lock intact. A command can fail after acceptance was recorded; another acceptance or release without reconciliation could corrupt attribution. It never force-releases a lock or calls a failed/inconclusive check passed. See [Integration recovery operations](cli/recovery-operations.md#integration-acceptance-and-release).

## Interrupted installation or setup

An interrupted setup may leave files in the versioned home. The agent examines the metadata and selected release; it does not overwrite or delete unknown files. Setup can continue only for compatible pending metadata and the same release/digest. A completed home is preserved on repeat. Home initialization neither installs the CLI nor loads skills into the host. Ask before changing host configuration or installing software. See [Setup recovery operations](cli/recovery-operations.md#interrupted-installation-or-setup).

## Earlier change-based work

Earlier workbench artifacts and v3 mission records have separate owners. Do not use v3 recovery to adopt or convert legacy work. Preserve prior work and follow the [workbench recovery reference](cli/recovery-operations.md#earlier-change-based-work).
