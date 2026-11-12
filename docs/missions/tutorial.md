# Complete a Standard mission with a coding agent

Work through one mission, from creation to verified delivery, by asking your coding agent to use the named skills. Kepler records attempts, approvals, evidence, and checkpoints; your agent performs the CLI operations and project work. You make consequential choices and approve the exact material when required. This guide assumes a single repository and a local repository handoff. For the complete executable CLI/JSON exercise, see the [agent and operator walkthrough](../cli/standard-walkthrough.md).

The entry and recovery skills in this guide are in the current source candidate; a previously published release might not contain them. Check the selected package manifest before following these prompts, or wait for a release that includes them. The example goal is an owner access policy: allow access only when the non-empty owner and requester identifiers match. Substitute your own outcome and repository in the prompts. Use a coding-agent host that has loaded the matching version's Kepler skills and role definitions. Kepler setup seeds resources but does not register them with the host, install the CLI, dispatch workers, or prove agent behavior. See [Installation](../installation.md#resources-and-host-ownership) and [Skills and roles](../skills.md). The source-only legacy `kepler-init`/workbench pipeline is not a v3 entry path.

## 0. Prepare the agent session

> Check that this session can use the selected Kepler CLI and its matching resources. Verify that Kepler skills and the architect, orchestrator, coder, and independent reviewer roles are loaded and usable. Check the repository rules and Git identity. Report any missing setup; ask before installing software or changing host configuration.

The agent should distinguish resources found on disk from those loaded by the host. It must confirm the dispatch and independent-context capability needed during Implementation and Review. If a host cannot provide it, choose another configured host or resolve the capability before promising to complete the workflow. Do not paste credentials into chat.

## 1. Create the mission and unit: `kepler-mission-startup`

> Use kepler-mission-startup for an owner access policy in this repository. Propose the record home, workspace, branch, and Integration target after inspecting Git; ask me to confirm consequential choices. Create one Standard mission and its single Unit of Work, then stop before Functional Design.

The orchestrator verifies the selected project, creates only the missing local `.kepler/` marker when safe, and submits the strict mission request. It then creates the unit in a separate operation. Expect its exact mission and unit IDs, directory, repository/workspace/branch/target bindings, effort, and blockers. Neither creation starts a stage. Use the returned unit and record home in later prompts; your agent keeps the IDs so you do not have to copy them into commands. One unit belongs to each Standard mission. The complete example uses one repository because Code Integration does not currently support multi-repository units.

**Agent operation example, not a developer instruction:** `kepler mission create --project <record-home> --request '<selected-request-JSON>'` records mission preparation; `kepler workflow construction unit create <slug> --mission <returned-id> --project <record-home>` records the single unit. Both require actual selections. See the [mission](../cli/mission.md) and [Construction](../cli/construction.md#units) references.

## 2. Define behavior: `kepler-design`

> Use kepler-design for this unit. Investigate observable owner-access behavior and failures. Write the unit definition and Functional Design, validate and self-review them, and show me the exact committed material for approval. Do not implement or advance to Quality Requirements.

The architect writes `unit-of-work.md` and `design.md`, records real validation and self-review evidence, then presents the current material and checkpoint. Resolve functional questions before approval. After inspecting it, respond:

> I approve the Functional Design material you identified at this checkpoint. Record my decision and complete Functional Design if the material is still current.

Approval binds the exact committed material and attempt. A changed document needs applicable fresh evidence and a new decision. The agent records your explicit response, completes the stage, and hands off to Quality Requirements. You do not construct evidence JSON or execute a CLI command.

**Agent operation example, not a developer instruction:** `kepler audit record approval --unit <unit-id> --stage functional-design --attempt <attempt-id> --project <record-home>` reads a typed approval from stdin after you explicitly approve the current material. Its returned event ID is used by stage completion. See [Audit](../cli/audit.md#audit-record-approval).

## 3. Agree quality targets: `kepler-quality`

> Use kepler-quality for this unit. Assess every applicable quality category, define observable targets and constraints, and show me the committed requirements for approval. Stop before Planning.

The architect writes `quality.md`, checks all eight categories, validates the artifact and self-reviews its targets and conditions. You resolve consequential targets and trade-offs. After reviewing the current material, reply:

> I approve the Quality Requirements material you identified at this checkpoint. Record my decision and complete Quality Requirements if it is still current.

This approval is required, and like Functional Design approval, does not authorize implementation or delivery. Expect a summary of accepted requirements and open nonblocking questions.

## 4. Plan the work: `kepler-plan`

> Use kepler-plan for this unit. Choose a solution consistent with the approved design and quality targets. Produce and validate the plan and task graph, review coverage and verification, and complete Planning when its gates hold. Ask me about consequential choices; do not start implementation.

The architect authors `plan.md` and `tasks-dag.json`, explains the technical rationale, task dependencies, prerequisites, and exact project-native checks. The agent runs Kepler lint and reviews coverage; these checks do not prove the implementation passes. A separate whole-plan approval occurs only if your instructions or applicable authority require it. Expect a graph summary and any unresolved decisions, not a list of CLI commands to execute.

## 5. Implement and integrate: `kepler-orchestrate`

> Use kepler-orchestrate to implement this unit's current plan. I authorize implementation within its scope. Coordinate ready tasks through Code Generation, independent Code Validation, and Code Integration; run required checks and record actual results. Complete Implementation when its gates hold and hand off for independent whole-unit Review. Do not deliver.

The orchestrator admits dependency-ready tasks and assigns `kepler-code` to authors and `kepler-code-feedback` to separate non-author reviewers. You do not invoke these skills task by task. Compatible tasks may run concurrently in isolated writer lanes. Integration locks the unit while preparing, checking, and accepting each combined candidate. Generation, Validation, and Integration are Activities **inside** Implementation, not extra Standard stages; their typechecking, relevant tests, build, full suite, and independent feedback gates remain in force. A failed check needs correction and new applicable evidence, not a fabricated passing result. Expect the final integrated checkpoints, task/evidence coverage, unit assessment, and Review handoff.

**Agent operation example, not a developer instruction:** `kepler workflow construction integration accept ... --lock-token <token> --prepared-event-id <event-id>` accepts only the unchanged prepared candidate with current successful check evidence under the existing lock. It does not complete the Activity. See [Integration](../cli/construction.md#integration).

## 6. Review the complete unit: `kepler-review`

Ask an independent reviewer context/profile, not the primary author:

> Use kepler-review to assess this unit's complete integrated result against its current design, quality obligations, task outcomes, and applicable evidence. You must not be its primary implementation author. Report blocking findings and proposed correction boundaries to the orchestrator; complete Review only when its gates hold. Do not edit the implementation or deliver.

The reviewer compares the original Review baseline with the complete final result, checks whether evidence covers current material, and records its assessment. Review does not unconditionally repeat the full suite or require requester acceptance unless an applicable authority rule does. If there are blocking findings, ask the orchestrator to authorize the smallest valid correction and repeat the affected activities/stages. A reviewer verdict alone does not grant delivery permission.

## 7. Deliver the requested outcome: `kepler-finish-work`

For this exercise, choose a **local repository handoff** to yourself. No push, merge, PR/MR, publication, deployment, rollback, or cleanup is authorized:

> Use kepler-finish-work for this reviewed unit. The requested outcome is a local repository handoff to me in this repository, with no push, merge, PR/MR, publication, deployment, or cleanup. Prepare delivery instructions, verify the reviewed source and actual handoff, record evidence, and complete Deliver when its gates hold. Ask before any unapproved effect.

For another outcome, explicitly name the recipient, destination, and operations you authorize. The orchestrator records your requested outcome, writes `delivery.md`, checks permissions and prerequisites for every operation, performs only authorized effects, reads back results, and records verification and recipient handoff. It cannot substitute a local handoff for a required deployment. Final approval is conditional on applicable rules; completing Review never authorizes an external effect.

**Agent operation example, not a developer instruction:** `kepler workflow construction stage complete --unit <unit-id> --stage deliver --attempt <attempt-id> --request '<actual-outcome-and-evidence-JSON>'` records verified completion; it does not perform or verify delivery by itself. See [Deliver assessment](../cli/stage-assessments.md#deliver).

Expect the actual outcome location, reviewed source, verification evidence, limitations, recovery information, and recipient responsibilities. Deliver ends the Standard workflow; there is no `mission finish` command.

## Inspect or resume without CLI work

At any stage, ask:

> Use kepler-resume to inspect this unit in its record home without changing state. Tell me what is complete, blocked, awaiting my decision, or safe to do next, and give me the next skill prompt.

After an interruption:

> Use kepler-resume to reconcile the interrupted work for this unit. Preserve commits, partial work, locks, and history; confirm earlier workers ended and inspect actual effects before a retry. Return to the owning skill and ask me only for missing authority or a consequential decision.

A lost session or timed-out command does not prove no effect. Startup recovery uses the original mission ID and `mission prepare`; it never repeats `mission create` blindly. Paused work retains its original attempt and input bindings; resume does not dispatch a worker. An uncertain Integration lock or external delivery effect requires reconciliation, not a force release or duplicate operation. See [Recovery](../recovery.md) for detailed limits. The agent reports the exact blocker if safe recovery needs information only you can supply.

## What this example proves

The [operator walkthrough](../cli/standard-walkthrough.md) and [public CLI Standard E2E](../../tests/e2e/stage-completion.test.ts) exercise the CLI's mechanics in controlled environments. They do not certify that your coding agent loaded or followed a skill or obtained genuine approval. Verify the selected host's skill loading and independent reviewer contexts separately; report only checks and effects that actually occurred.
