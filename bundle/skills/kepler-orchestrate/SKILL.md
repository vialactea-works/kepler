---
name: kepler-orchestrate
description: Coordinate the unit-scoped Implementation stage and the separate task-scoped Code Integration Activity through the v3 Construction CLI.
---

# Implementation Coordination

The developer authorizes implementation of the current plan; you own CLI mechanics and worker dispatch, not their task-by-task commands. Read the [packaged agent operations](../kepler-mission-startup/references/agent-operations.md) and complete request examples. Verify the host actually has separate Generation and non-author Validation worker contexts before admission. Start only an eligible unit attempt or continue the same safe unended attempt. Report accepted task outputs, combined checks, current Implementation assessment, receipts and blockers, then offer: “Use kepler-review in an independent non-author context for the full integrated unit; do not deliver yet.” Do not start Review yourself.

## When to Use

Use for the Standard Implementation stage of one Unit of Work. This skill coordinates workers and CLI-owned transitions; it does not write implementation, task graphs, journals, projections, or worker evidence. It owns the unit Implementation attempt and coordinates separate per-task Activity attempts, including Code Integration.

## Stage characteristics

| Characteristic | Summary |
| --- | --- |
| Inputs | Current unit artifacts and upstream records or approvals; the task graph and its obligations; current integrated checkpoints and retained work when available; project checks and environments; task prerequisites and resume evidence. Before first task admission, identify the unit's original Review baseline. |
| Lead agent | The `kepler-orchestrator` role owns task admission, worker coordination, findings, progress records, completion, and the Review handoff. Lead role names describe responsibility; they do not authenticate a worker, select a model or topology, or add permission. |
| Outputs | **Executable material:** task code, tests, configuration, and required documentation. **Integrated material:** accepted outputs and repository-qualified checkpoints. **Optional authored detail:** useful linked findings under `details/implementation/`. **CLI-owned evidence and records:** Activity and stage evidence, task records, the unit completion assessment, and additional-review results when requested by the requester. **Handoff:** the integrated result and evidence for Unit of Work Review. No separate execution Markdown document is required. |
| Gates | **Entry:** upstream stages are complete for current material, the task graph and obligations are available, execution is authorized, and the original Review baseline is identified. **Advance:** required tasks have applicable Activity results; Generation includes typechecking, related tests, and self-review; Validation includes typechecking, build, full suite, and independent non-author feedback; Integration runs typechecking, build, and full suite on the combined candidate under the unit lock. Keep valid retained Activities under their original bindings; rerun only affected Activities under authorized return rules. Complete the unit assessment and requested reviews, resolve blockers, and bind evidence to the final result. Routine task approval and separate whole-Implementation approval are not required. A commit, positive review, or process exit alone does not complete Implementation or authorize Deliver. |

## Procedure

1. **Read current unit and graph.** Use explicit selectors and inspect derived state:

   ```text
   kepler workflow construction unit show --unit <unit-id> [--project <path>]
   kepler workflow construction stage show --unit <unit-id> --stage implementation [--project <path>]
   kepler workflow construction lint --unit <unit-id> [--project <path>]
   kepler workflow construction task list --unit <unit-id> [--project <path>]
   ```

   Stop on invalid graph or upstream blockers. Read `unit-of-work.md`, `design.md`, `quality.md`, `plan.md`, `tasks-dag.json`, relevant supporting material, and applicable upstream evidence. Do not require initialization, inception, source code, or existing tests. Plan necessary foundation for greenfield tasks. Resolve effort from unit default and explicit Implementation override; all three Activities inherit it. A requester-selected effort adjustment is recorded as structured `kepler audit record interaction`, never inferred from prose.
2. **Start or resume the unit attempt.** Start the exact Implementation stage only when Standard permits it:

   ```text
   kepler workflow construction stage start --unit <unit-id> --stage implementation --request '<typed stage-input JSON>' [--project <path>]
   ```

   Retain its attempt ID for all task and Activity scopes. On resume, use `stage show`, `task show`, and `activity show`; confirm prior workers stopped, ownership and inputs remain current, and the same unended attempt is active. Pausing, resuming, a new session, waits, and command retries do not create new attempts.
3. **Assess readiness before admission.** For each graph task, query `kepler workflow construction task ready --unit <unit-id> --task <task-id> [--project <path>]` and `task show`. The CLI reports graph dependencies, known integrated predecessor outputs, known prerequisite facts and unknowns; the coordinator compares actual acceptance criteria, outputs, prerequisites, and relevant inputs. Readiness is not admission or dispatch. Admit only a task whose necessary predecessor outputs are integrated and whose blocking prerequisites hold. Preserve original task IDs, graph, scope, and source bindings.
4. **Admit and dispatch compatible work.** Use `kepler workflow construction task admit --unit <unit-id> --task <task-id> --implementation-attempt <implementation-attempt-id> --prerequisites '{"prerequisite_evidence_ids":["<evidence-id>"]}' [--project <path>]` to capture the current repository-qualified integration set as that task's fixed baseline. Use an empty array when no prerequisite evidence IDs apply. Verify returned checkpoint and predecessor-output inclusion through history/provenance, not timestamps. Admission creates no task attempt, commit, or automatic dispatch. Prepare a complete task assignment from its graph definition, upstream contracts, relevant quality/decision context, exact input and output bindings, acceptance criteria, verification commands/resources, applicable constraints, original admission baseline, and required Activity order. Dispatch `kepler-code` for Code Generation. Dispatch `kepler-code-feedback` for Code Validation in an independent non-author context; workers do not spawn or call each other. Admit compatible ready tasks in separate isolated writer lanes and dispatch them concurrently. Serialize only conflicting shared resources/checks. Do not gate on a global HEAD or completed batch.
5. **Coordinate Code Generation.** Use `kepler workflow construction activity show --unit <unit-id> --task <task-id> --activity code-generation --implementation-attempt <implementation-attempt-id> [--project <path>]`, then start its eligible occurrence:

   ```text
   kepler workflow construction activity start --unit <unit-id> --task <task-id> --activity code-generation --implementation-attempt <implementation-attempt-id> [--project <path>]
   ```

   Preserve its returned Activity-attempt ID. Generation owns implementation, typechecking, modification-related tests, self-review, its output checkpoint and evidence. It uses tests at the lowest level that proves behavior, with integration/E2E where collaboration requires them. The orchestrator receives facts, attempt IDs, output commits/checkpoints, evidence receipts, and blockers, not an alternate worker narrative artifact.
6. **Coordinate Code Validation independently.** After Generation succeeds, start Code Validation for that task under the same Implementation attempt and dispatch the reviewer separately from the author:

   ```text
   kepler workflow construction activity start --unit <unit-id> --task <task-id> --activity code-validation --implementation-attempt <implementation-attempt-id> [--project <path>]
   ```

   The reviewer examines actual task output against its fixed admission baseline and current functional/quality obligations, runs typechecking, project build, and full application suite using the exact planned native commands, and gives independent feedback without editing candidate files. Generation success does not imply Validation success. If useful, create the optional package with the fixed source bindings:

   ```text
   kepler git diff-package validation --unit <unit-id> --task <task-id> --implementation-attempt <implementation-attempt-id> --generation-attempt <generation-attempt-id> [--project <path>] [--out <path>]
   ```

   Preserve package source bindings; a package is inspection input, not check evidence or approval. Resolve blocking findings under the revision/correction rules before Integration. Validation evidence and independent feedback must apply to the current Validation attempt and reviewed material.
7. **Execute separate Code Integration attempts, under lock.** Only after successful Validation and independent feedback, start that task's Code Integration occurrence under the same Implementation attempt:

   ```text
   kepler workflow construction activity start --unit <unit-id> --task <task-id> --activity code-integration --implementation-attempt <implementation-attempt-id> [--project <path>]
   ```

   It has its own Activity attempt ID, distinct from the unit Implementation attempt, the task ID, and Generation/Validation attempts. Use the executable Integration lifecycle operations:

   ```text
   kepler workflow construction integration lock --unit <unit-id> --task <task-id> --activity code-integration --implementation-attempt <implementation-attempt-id> --attempt <integration-attempt-id> [--project <path>]
   kepler workflow construction integration prepare --unit <unit-id> --task <task-id> --activity code-integration --implementation-attempt <implementation-attempt-id> --attempt <integration-attempt-id> --lock-token <token> --request '<typed candidate JSON>' [--project <path>]
   kepler workflow construction integration evidence --unit <unit-id> --task <task-id> --activity code-integration --implementation-attempt <implementation-attempt-id> --attempt <integration-attempt-id> --lock-token <token> --request '<typed check/self-review JSON>' [--project <path>]
   kepler workflow construction integration accept --unit <unit-id> --task <task-id> --activity code-integration --implementation-attempt <implementation-attempt-id> --attempt <integration-attempt-id> --lock-token <token> --prepared-event-id <event-id> [--project <path>]
   kepler workflow construction integration release --unit <unit-id> --task <task-id> --activity code-integration --implementation-attempt <implementation-attempt-id> --attempt <integration-attempt-id> --lock-token <token> [--project <path>]
   ```

   The lock operation captures the then-current repository-qualified unit checkpoint set. While holding the unit lock, prepare the combined candidate from these actual Integration inputs and the validated task output; keep the task's fixed admission baseline separate. Run typechecking, build, and the full application test suite against the combined candidate in every required repository using exact planned commands. Bind actual commands, conditions, results, candidate, and inputs in CLI-owned evidence. If any bytes change after checks, rerun all required checks before acceptance. Accept only the exact checked candidate. Successful `accept` releases the lock. For incomplete work, use `release` only under its unchanged-target guard; if effects or ownership are uncertain or the guard refuses, preserve the lock and work for recovery instead of forcing release. The lock covers checkpoint capture, preparation, checks, and acceptance; release it before a Generation return. CLI calls represent durable transitions, not permission to hand-edit history. A cross-repository acceptance is not atomic and creates no rollback authority.
8. **Complete the Activity and task scopes.** Record evidence through `kepler audit record evidence` with its typed JSON request and exact unit/task/activity/attempt selectors only after material and supporting output exist. Then complete the current Activity using its attempt and evidence receipts:

   ```text
   kepler workflow construction activity complete --unit <unit-id> --task <task-id> --activity <activity> --implementation-attempt <implementation-attempt-id> --attempt <activity-attempt-id> --evidence '{"evidence_ids":["<evidence-id>"]}' [--project <path>]
   ```

   Include accepted Integration candidate evidence for Code Integration. Do not mark Integration complete before candidate acceptance. A task becomes eligible for dependent admission only after successful Validation, accepted Integration, applicable evidence, and required completion facts are current. Recompute readiness after each accepted task output; unrelated ready tasks continue.
9. **Handle blockers and recovery.** Workers report facts and proposed correction boundaries. Ordinary code defects, failed checks, and local assessment errors follow authorized agent correction paths, not requester escalation. A task-local code return authorized by the orchestrator repeats Generation, Validation, and Integration as required; start new attempts only when returned Activities execute again. An Integration-only retry stays within the same Code Integration attempt, and failed commands alone create no new attempt. Preserve the original admission baseline and all partial work. A pause/resume keeps the attempt. On interruption, use CLI-derived progress, check previous workers have stopped, reconcile lock ownership and partial effects, and resume only the same safe unended attempt. Missing sessions/timeouts do not prove workers stopped. Before resuming an Integration owner, verify its lock and candidate effects; use only the accepted manual lock recovery rules. Never infer acceptance from a commit or successful subprocess.
10. **Use revision barriers for upstream changes.** For suspected invalid upstream input or an authorized unit-wide revision, report evidence and proposed scope; workers do not authorize revision. The orchestrator selects the earliest affected stage and applies `kepler workflow construction revise` with exact unit/stage/attempt selectors and the typed reason/supporting-input request. For a unit-wide upstream revision, stop new admissions and active task work for that unit, coordinate stop and reconcile workers/locks/effects, then end affected Implementation and Activity attempts through the revision operation. Do not acknowledge pause/stop until workers stopped and locks reconcile. Keep history and work; ended attempts cannot accept candidates or complete tasks. Independent units continue. Resume only after revised upstream stages complete and a new Implementation attempt starts. Task-local returns do not reopen the unit attempt; do not re-open unrelated scopes.
11. **Assess complete unit result.** After every necessary task and Activity succeeds, inspect all task outputs, accepted repository-qualified checkpoints, applicable original and current evidence, integration provenance, unresolved findings, and retained scopes. Perform Implementation's unit-level coverage/self-review and state whether all completion conditions hold. Record its typed assessment/evidence through CLI-owned operations; do not transfer Activity evidence to the unit attempt or treat task success as whole-unit completion. Before `stage complete`, use `kepler workflow construction stage show --unit <unit-id> --stage implementation [--project <path>]` and provide the accepted typed completion request to `kepler workflow construction stage complete --unit <unit-id> --stage implementation --attempt <implementation-attempt-id> --request '<typed assessment/evidence JSON>' [--project <path>]`.
12. **Hand off to Review.** Supply the complete integrated outcome, current upstream contracts, graph/task coverage, original unit Review baseline, final repository-qualified checkpoint set, Integration inputs, task output attribution, current-attempt assessment and evidence, retained-scope bindings, check conditions/results, resolved findings, and nonblocking limits. Identify precise package sources for optional whole-unit review. Do not conduct Unit of Work Review, publish, merge, release, or deploy.

## Diff-package handoffs

Packages are optional inspection inputs. They preserve producer attempt and checkpoint bindings; they do not run checks, prove applicability, authorize a transition, or add completion gates.

- Validation: `kepler git diff-package validation --unit <unit-id> --task <task-id> --implementation-attempt <implementation-attempt-id> --generation-attempt <generation-attempt-id> [--project <path>] [--out <path>]`.
- Integration: `kepler git diff-package integration --unit <unit-id> --task <task-id> --implementation-attempt <implementation-attempt-id> --integration-attempt <attempt-id> [--project <path>] [--out <path>]` after its owning operation captured actual inputs/candidate. Do not have packaging manage its lock.
- Whole-unit review: `kepler git diff-package unit-review --unit <unit-id> --implementation-attempt <implementation-attempt-id> [--project <path>] [--out <path>]` using the original pre-admission Review baseline and final checkpoint set from the completion assessment. The Review package belongs to the next skill; this orchestrator identifies sources only.

Keep material references opaque and original. The consumer records its own current attempt/evidence and decides applicability.
