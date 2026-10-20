# Artifacts

[Reference index](README.md) | Previous: [Gates](gates.md) | Next: [Support operations](support.md)

## Path model

In this chapter, `<change>` means `.kepler/changes/<YYYY-MM-DD-title>/`. `<effort>` means `.kepler/maps/<effort-name>/`.

Kepler installs shared templates under `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/`.

The templates guide new records. `kepler workbench lint` decides the supported format of existing records.

The documents in `docs/workflow_v2/` define this workflow generation. The files in `.kepler/specs/` define capability contracts for a project.

## Artifact ownership

The map, ticket, and route rows summarize construction inputs. [Inception artifacts](../phase_inception/artifacts.md) define their complete authoring and lifecycle contracts.

| Artifact | Producer and permitted writer | Inputs and purpose | Consumers and output contract |
| --- | --- | --- | --- |
| `AGENTS.md` | Init owner and authorized project maintainer. | Repository facts and requester rules establish standing standards. | Every step uses commands, style, Git rules, and boundaries. Preserve unrelated user content. |
| `.kepler/specs/glossary.md` | Init owner, domain-modeling owner, or authorized Wayfinder closing operation. | Sourced, context-scoped terms establish project language. | Intent, planning, code, and review use the same meanings. Preserve existing author metadata and distinct scoped meanings. |
| `.kepler/specs/<capability>.md` | Finish owner or authorized compose-spec operation. | Approved deltas or directly authorized source-based specification. | Durable capability truth uses Overview, Contract, Behavior, Invariants, and Decisions. |
| `<change>/proposal.md` | Intent owner. | Request, canonical context, and optional route define why and scope. | Planning consumes exact approved bytes. Keep capability-to-delta mappings stable. |
| `<change>/requirements/<capability>.md` | Intent owner. | Proposed behavior defines ADDED, MODIFIED, REMOVED, or RENAMED deltas. | Planning and review consume binding behavior. Finish translates approved deltas into canonical specs without editing these inputs. |
| `<change>/design.md` | Intent owner. | Approved direction and requirements define the model and architecture. | Planning and implementation consume responsibilities, ports, adapters, contracts, and decisions. |
| `<change>/critique.md` | Critique reviewer for findings. Requester for disposition. | Present formal artifacts and source evidence support critique. | The supported verdict/decision matrix controls settlement. Settlement cannot approve formal intent. |
| `<change>/plan.md` | Planner only after code starts. | Tactical request or approved formal intent defines tasks and dependency declarations. | Workers consume exactly one task and cited context. Coordinator consumes graph and approval/input evidence. |
| `<change>/progress.md` | Planner initializes and reconciles authorized amendments. Coordinator performs guarded runtime updates. | Active task list establishes the current implementation ledger. | Context, review, and finish consume exact matching metadata and body rows. No detailed attempt or verdict belongs here. |
| `<change>/tasks/task-N/progress.md` | Planner initializes. Assigned worker appends terminal attempts. | One task's observed work and verification establish detailed implementation evidence. | Coordinator and reviewers consume the latest attempt. Preserve earlier attempts. |
| `<change>/tasks/task-N/.base` | Guarded checkpoint mechanics. | Verified admission history supplies the immutable Task Base. | Cache only. Never commit or treat it as independent authority. |
| `<change>/tasks/task-N/feedback.md` | Independent task reviewer only. | Published task package and unchanged criteria support tactical review. | Coordinator consumes the physical last pass after durability and freshness checks. Commit this path alone. |
| `<change>/review.md` | Branch reviewer only. | Complete change and task clearance support whole-branch judgment. | Coordinator and finish consume current clearance. Commit this path alone. |
| `<change>/finish.md` | Finish owner only. | Admitted intent and observed effects support paired history. | Recovery consumes exact Attempt/Outcome pairs and original identities. Commit intent and outcome separately. |
| `<effort>/map.md` | Wayfinder owner. Authorized downstream owners update aggregate shipment state. | Destination, ticket summaries, and operation rules orient the effort. | Map status summarizes the effort. It cannot prove unit availability or ownership. |
| `<effort>/tickets/NN-slug.md` | Authorized ticket owner through the matching support operation. | A specific question and dependencies define bounded investigation. | The Answer preserves the result and source links. Superseded decisions remain explicit history. |
| `<effort>/route.md` | Wayfinder writes the compiled body. Bound change owners update permitted unit state. | Resolved tickets, glossary, and destination define coarse delivery units. | Propose, plan, and finish consume exact unit identity, constraints, dependencies, and Shipping rules. |

## Stored status and workflow state

Stored values summarize specific artifacts. They do not replace the internal state contracts in the step chapters.

| Artifact field | Stored values | Workflow meaning |
| --- | --- | --- |
| Proposal `status` | `draft`, `approved`, `implemented` | Proposal lifecycle only. Formal approval still needs exact revision evidence. |
| Design or requirement delta `status` | `draft`, `approved` | Candidate or approved formal input. A default decision is not approval. |
| Canonical spec `status` | `current` | Consolidated capability truth. It does not describe a change's execution. |
| Plan `status` | `draft`, `approved`, `in-progress`, `complete`, `blocked` | Plan summary. It cannot release a task or approve formal inputs. |
| Root progress `status` | `pending`, `in-progress`, `blocked`, `complete` | Aggregate implementation summary. |
| Root task entry `status` | `pending`, `in-progress`, `blocked`, `done` | Current implementation outcome or active admission. |
| Task log `status` | `pending`, `in-progress`, `blocked`, `done` | Task-local implementation summary. The latest attempt supplies terminal evidence. |
| Feedback `status` | `open`, `resolved` | Feedback artifact lifecycle. Only the physical last verdict can support clearance. |
| Review `status` | `open`, `complete` | Review artifact lifecycle. It does not prove range freshness or clearance. |
| Finish `status` and `result` | `pending`, `completed`, `blocked` | Finish summary. Paired records and observed effects establish completion. |
| Critique `verdict` | `approved`, `changes-requested`, `skipped` | Critique has no status field. The owner decision determines disposition. |
| Map `status` | `open`, `cleared`, `shipping`, `shipped` | Aggregate effort lifecycle. |
| Route `status` | `open`, `shipping`, `shipped` | Route lifecycle. A route has no `cleared` status. |
| Route unit `status` | `pending`, `in-progress`, `shipped` | Unit claim and shipment summary. It is not a distributed lock. |
| Ticket `status` | `open`, `claimed`, `resolved` | Ticket availability and answer lifecycle. |

A schema can retain historical values that current authoring procedures do not produce. Format support alone grants no execution authority.

## Root and task contracts

### Root task ledger

The root frontmatter `tasks` list and Markdown table describe the same ordered active tasks.

Each metadata entry contains numeric `id`, exact `title`, `status`, and `progress`. Admission and publication records add guarded execution provenance.

Each body row uses the same identity and status. Its link is exactly `[details](tasks/task-N/progress.md)`.

The root statuses are `pending`, `in-progress`, `blocked`, and `done`. Aggregate `status: complete` means all active implementation rows are done.

Aggregate completion does not prove feedback approval, branch clearance, or finish completion.

### Task definition

A version 2 task contains Goal, Acceptance, Depends on, Steps, Verify, and Commit. Files can guide the worker without limiting valid paths.

Task Notes identify selected input blobs, repository identity, task digest, and intent authority. Hashes identify revisions, not semantic approval.

The plan uses `Depends on` as the dependency source. A duplicate frontmatter dependency graph is not part of this contract.

### Task attempt

The planner creates a pending task log without an Attempt. The worker appends a next-numbered terminal attempt after actual work.

Each new attempt records admitted `Start HEAD`, exact commands, observed results, changed paths, phase evidence, and one Outcome.

The only terminal task Outcomes are `done` and `blocked`. Local status agrees with the latest terminal Outcome.

A blocked worker commits only truthful task-local evidence. Partial production edits remain uncommitted and disclosed.

## Review records

Each task-feedback pass records full Base, Head, and Verdict. A v2 publication also requires exact Coverage.

A verified v1 broad-review pass omits Coverage. Historical missing attempt starts remain unknown rather than reconstructed.

Each modern full branch pass also records `Scope: full` and explicit Target. A remediation pass adds its retained baseline and resolution fields.

Every pass retains Blocking and Suggestions. A blocking finding identifies its location, defect, required correction, violated criterion, ID, and kind.

The physical last pass controls the current verdict. Frontmatter status and decision cannot replace pass-local clearance checks.

Existing legacy-global histories can transition only through the supported atomic append procedure. Preserve prior bodies and do not invent their provenance.

## Publication records

Execution version and publication version are different schemas. A version 2 plan can retain verified historical v1 publication coverage.

A modern publication records worker Head, integrated Head, terminal outcome, and integrated verification. Its coverage identifies attempt boundaries, original commits, parents, and paths.

The task package preserves verified integration deltas across corrections. A later empty net diff cannot hide an earlier integration effect.

The publication commit changes only the root ledger. Feedback binds its pass to that exact publication through Coverage.

## Finish records

Each `Attempt N` records planned effects and exact admission, source, route, and input identities. Each `Outcome N` records observations for that Attempt.

Outcome records include the result, actual spec synchronization, delivery identity, and remaining effects. They do not rewrite the intent record.

A repair adds a new linked pair. It preserves original delivery identity and every earlier blocked outcome.

## Workbench operation contracts

| Operation | Responsibility | Input → output | Write boundary and limit |
| --- | --- | --- | --- |
| `setup` | Install shared resources. | Bundled templates and guidelines → global data. | Preserve existing settings. Not a core change step. |
| `workbench lint` | Validate artifact syntax and schema. | File or change directory → diagnostics and exit status. | No approval or completion inference. |
| `workbench context` | Project artifact and Git evidence. | Change directory and optional input path → state summaries, input blobs, and readiness. | Derived output does not authorize edits. Legacy-path resolution can copy data. |
| `workbench isolate` | Inspect, create, or verify workspace isolation. | Change or workspace title → isolation result or path. | Isolation does not grant ownership or prove distinct source/target roles. |
| `workbench task-state --admit` | Bind guarded task execution. | Expected HEAD, task, observed worker, lane, and target → admission identities. | Coordinator-owned root update and immutable checkpoint. |
| `workbench task-state --reserve` | Record bounded prerequisite authority. | Current HEAD and exact reservation → committed reservation. | Before edits. Lifetime and authority limits still apply. |
| `workbench task-state --publish` | Integrate, verify, and publish a terminal task result. | Original task Head, expected HEAD, response, and exact Verify → root publication. | Coordinator serializes shared writes. No feedback clearance. |
| `workbench diff` | Package stable review evidence. | Exact task or whole-change range → Base, Head, and scratch package. | `--record` handles the checkpoint cache. It is not guarded admission or review packaging. |
| `workbench precondition` | Check ordinary finish or finalization-repair readiness. | Change, explicit target, test/build command, and optional recovery identity → closed or identity-bound open gate. | It checks readiness. It does not perform finish effects. |
| `workbench prototype` | Manage the support prototype branch. | Prototype operation and branch context → guarded prototype workspace result. | Throwaway investigation only. It cannot approve production intent. |

The [skills reference](../../skills.md) supplies command syntax. This reference defines the workflow obligations that those commands support.
