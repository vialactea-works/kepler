# Recover interrupted work with your coding agent

A lost session or timeout does not prove that a worker stopped or that a command had no effect. Ask the agent to inspect the exact scope and effects before retrying. Keep partial work, Git checkpoints, evidence, locks, and history intact. Recovery does not authorize deletion, rollback, release, or deployment.

> Use kepler-resume to inspect [unit] in [record home] without changing state. Tell me what is complete, blocked, awaiting my decision, or safe to do next, with the next skill prompt.

If an operation stopped:

> Use kepler-resume to reconcile the interrupted startup, stage, task, Integration, or delivery operation. Confirm previous workers ended and inspect actual effects before any retry. Preserve the original identities and work, then return to the owning skill. Ask me only for missing authority or a consequential choice.

The agent should report the exact unit, attempt and evidence, known and unknown effects, next safe action, and any information only you can supply. It performs routine Kepler CLI operations itself. Complete selectors, input shapes, and failure cases are in [Recovery operations for agents and operators](cli/recovery-operations.md).

## Deprecated formats and lifecycle migration

Use `kepler-lifecycle-migration` when an upgrade requires a documented file or contract migration.
It selects a dated guide, checks runtime support, and presents an exact manifest for your approval.
A planned guide permits inspection and planning only. It does not authorize manual journal conversion.
The first [history-layout guide](../bundle/skills/kepler-lifecycle-migration/referenses/migrations/2026-11-13-mission-history-generations.md) is planned.
The development source implements generation-aware recovery commands. This does not establish release availability. The migration command rejects a planned guide; inspect the selected binary and matching resources before any operation. See [Mission-history recovery commands](cli/history-recovery.md).
Normal interruption recovery remains separate from format migration and from a decision to reconstruct damaged history.

## Generation recovery safety

The accepted recovery contract requires a compatible-client operational gate before migration, reset activation, or reconstruction publication. Inventory affected clients, adapters, automations, runs, and known working copies, including external or offline copies. Stop incompatible or unverified clients through their supported controls, reconcile effects, and retain exact client-status and source evidence. An external copy can be identified without inventing a physical origin or granting membership. Repeat the real state check before apply; static evidence cannot detect an unsupported client restarted outside Kepler.

The pinned legacy Kepler 3.1.0 build `d2a9f5037c227765818e220443f426303bef4b45` does not enforce the generation guard. It can report an incorrect empty projection or append deprecated journals. A matching version string alone does not establish support. Keep unsupported clients stopped until an actual compatible build or adapter can complete verified preparation. Do not test them against live records.

Reconstruction must preserve the exact original request text. An event or context alias is not text proof. A supported original creation in verified raw bytes can establish the text without a healthy old projection. If the original is unavailable or conflicting records need correction, retain the specific requester assertion and its canonical source statement under the [accepted amendments](specs/v3/mission-history-reset-recovery.md#13-accepted-amendments). Generic restart or action approval is insufficient. Rendering a statement supplies no requester consent and does not authenticate a person.

These are implementation requirements, not release availability or approval of any actual inventory, statement, or operation. Each actual reset and reconstruction needs its own exact manifest decision. Ordinary selected-history reads and verified joins must not acquire a local old-archive dependency for repeating the historical request check; required portable current material must still be available. A completed historical retry must not reactivate an old selection or stop later valid work.

## Continue mission preparation

If mission creation stopped, give the agent the original mission ID and record home when available. It checks the original startup operation ended, inspects saved selections and partial workspace/branch effects, and continues the *same* mission. Repeating mission creation allocates another identity. An already recorded preparation response does not establish current workspace readiness. If the unit was created before a lost response, the agent must find and reuse it rather than create a duplicate.

**Agent operation example, not a developer instruction:** `kepler mission prepare --mission <original-id> --project <original-record-home>` performs only eligible missing preparation from saved choices. It does not start a stage or dispatch a worker. See [Mission preparation](cli/mission.md#mission-prepare).

## Resume Construction work

The agent selects the unit from the record home and checks the owning stage, task, Activity, and audit history. There is no global `status` command, and neither branch name nor chat history proves a current scope. Ask for a specific unit when several match. It confirms the exact previous worker ended before continuing work that could conflict.

A pause request records `pausing`; it does not stop the worker. Only after termination and effect reconciliation may the agent acknowledge a pause and resume the **same** attempt with the exact original inputs. A failed command does not require a new attempt. Resumption does not dispatch the worker; the host assigns the owning skill separately.

An upstream change may require a revision from the earliest affected stage. The orchestrator stops affected work, reconciles locks and effects, then uses the authorized revision route. Task-local correction is different from reopening a whole unit; Code Integration's eligible check retry uses the same attempt. After a new Implementation attempt, task prerequisites need applicable current proof. See [Construction recovery operations](cli/recovery-operations.md#resume-construction-work).

### Unordered revision transitions

A revision-ending event records both its authorization and the exact affected attempt's latest state-transition event as direct causes. An Implementation ending also names its child Activities' latest transitions as causes. Reopening depends on that ending and authorization. These links preserve order when stages and Activities write separate journals; a shared ancestor or an attempt ID alone does not establish event order.

If a previous CLI appended revision transitions without those links, the unit can become blocked with `unordered-transitions`. The revision reports `revision_transition_confirmation_failed` when it cannot re-read history, or `revision_transition_projection_blocked` when the re-read succeeds but the projection is blocked. Preserve the authorization, transition journals, and original artifacts. Updating the writer prevents new incomplete links but does not repair existing records. Do not edit journals, infer order from timestamps or `affected_scopes`, create a replacement mission, or start replacement work to bypass the failure. The prevention fix cannot attest the missing order. Report the exact events, inspect raw history with a compatible recovery CLI, and obtain separate exact reset and reconstruction decisions under [mission-history recovery](cli/history-recovery.md). Do not apply a migration or infer an order merely to bypass the failure.

## Integration acceptance and release

If Integration stops, the agent inspects its exact token, captured target, prepared candidate, check evidence, accepted state, and actual target. It keeps an uncertain lock intact. A command can fail after acceptance was recorded; another acceptance or release without reconciliation could corrupt attribution. It never force-releases a lock or calls a failed/inconclusive check passed. See [Integration recovery operations](cli/recovery-operations.md#integration-acceptance-and-release).

## Interrupted installation or setup

An interrupted setup may leave files in the versioned home. The agent examines the metadata and selected release; it does not overwrite or delete unknown files. Setup can continue only for compatible pending metadata and the same release/digest. A completed home is preserved on repeat. Home initialization neither installs the CLI nor loads skills into the host. Ask before changing host configuration or installing software. See [Setup recovery operations](cli/recovery-operations.md#interrupted-installation-or-setup).

## Earlier change-based work

Earlier workbench artifacts and v3 mission records have separate owners. Do not use v3 recovery to adopt or convert legacy work. Preserve prior work and follow the [workbench recovery reference](cli/recovery-operations.md#earlier-change-based-work).
