# Gates

[Reference index](README.md) | Previous: [Finish](finish.md) | Next: [Artifacts](artifacts.md)

## How to use this table

A transition can reference several gates. All applicable conditions must pass before the operation claims its target state.

G01 and the common hold contract apply to all transitions. Each gate row applies at its stated phase.

Draft operations use authoring checks. A handoff also requires the stated approval and commit checks. An effect requires its admission checks.

An unknown result is not a passing result. Lint validates existing artifact format. Other gates check presence, truth, authority, ancestry, and freshness.

## Gate index

| Area | Gates |
| --- | --- |
| Common evidence and preparation | [G01](#g01-common-evidence) through [G08](#g08-input-standing) |
| Task admission and implementation | [G09](#g09-admission) through [G13](#g13-publication) |
| Feedback and finding routes | [G14](#g14-task-range) through [G18](#g18-finding-routes) |
| Branch review | [G19](#g19-branch-range), [G20](#g20-branch-clearance), and [G33](#g33-remediation-eligibility) |
| Finish admission and intent | [G21](#g21-finish-admission), [G22](#g22-finish-intent) |
| Amendments, recovery, and route ownership | [G23](#g23-plan-amendment) through [G28](#g28-semantic-inspection) |
| Finish effects and repair | [G29](#g29-spec-synchronization) through [G32](#g32-finalization-repair) |

## G01: Common evidence

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Current actor | Existing artifact lint succeeds before interpretation. Required input files exist. Artifact identity matches the selected subject. | Report exact findings or missing inputs. Do not substitute a template comparison for lint. |
| Current actor | Recorded claims agree with actual files and reachable Git evidence. | Hold the affected operation. Preserve contradictory evidence for its owner. |
| Current actor | The intended write stays inside the role's artifact boundary. | Return the operation to the responsible owner. |

A successful lint result does not require absent files to exist. A lifecycle input can be missing even when lint succeeds.

## G02: Project readiness

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Init owner | The repository exists. Commands, test rules, structure, style, Git rules, and boundaries have reliable sources. | Resolve required facts with repository evidence or requester input. |
| Init owner | Migration succeeds or is unnecessary. Required directories exist. The canonical glossary exists and passes file-scoped lint. | Preserve data and report the exact readiness gap. |
| Init owner | Material terminology conflicts and required verification commands are resolved. | Keep the project unready. Do not invent meanings or commands. |

## G03: Preservation and attribution

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Artifact writer | A new author-bearing artifact uses the repository's configured Git name and email. Existing author metadata remains unchanged. | Obtain missing identity before creation. |
| Init owner | Canonical paths take precedence. Legacy sources remain intact. Migration copies only when the corresponding canonical destination is absent. | Stop unsafe migration. Do not merge or delete source data. |
| Current actor | Unrelated, partial, staged, and sibling work remains preserved. Destructive changes have explicit authority. | Retain the workspace and request scoped owner direction. |

## G04: Change path

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Planner or intent owner | A tactical change preserves existing domain, subdomain, and bounded-context contracts. The plan records its spec-impact rationale. | Use propose for a contract change. Ask when classification is unresolved. |
| Current writer | The workspace belongs to the change. The named source differs from the actual target after normalized ref and upstream mapping. | Resolve ownership and source/target roles before writes. |
| Intent owner | Canonical specs and scoped glossary terms supply the current context. Material ambiguities have explicit resolution. | Keep formal artifacts draft. |

## G05: Formal approval

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Requester and intent owner | The requester explicitly approves the exact final candidate bytes for each formal input. | Retain drafts. Lint, critique, and unattended planning cannot create approval. |
| Planner or coordinator | Each present formal input has `status: approved`, `decision: accepted`, an exact full approval commit, and a requester-held reference. | Return to propose. |
| Planner or coordinator | Current bytes match the approved revision. A plan's `intent_approvals` identifies every present formal input. | Require new approval after any content change. |

Approval references assert owner decisions. They do not authenticate the owner cryptographically.

## G06: Critique disposition

| Critique verdict | Owner decision | Result and required action |
| --- | --- | --- |
| No critique artifact | Not applicable | No optional critique hold exists. Other gates still apply. |
| `approved` | `accepted`, `applied`, or `rejected` | Settled. Preserve the legitimate decision. |
| `changes-requested` | `applied` | Settled after the requester accepts and applies the findings. |
| `changes-requested` | `rejected` | Settled after explicit requester dismissal. |
| `changes-requested` | `accepted` | Application remains required. Hold at the artifact owner. |
| Any verdict | `skipped` | No owner disposition exists. Hold at the artifact owner. |
| `skipped` | Any decision | No clearance. Request owner adjudication. |

Critique settlement never replaces G05 formal approval.

## G07: Plan and scaffold

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Planner | The plan declares `execution: {version: 2, mode: dependencies}`. Tasks have stable IDs and testable contracts. | Preserve historical plans. Resolve malformed or unsupported execution metadata without fallback. |
| Planner | Every declared dependency exists, is active, and is not self-referential. The graph has no cycle. | Correct task boundaries or prerequisites. |
| Planner | Each task states Goal, Acceptance, Depends on, Steps, Verify, and Commit. Files is optional guidance. | Complete the task contract before confirmation. |
| Planner | Steps include Red, Green, Refactor, and relevant verification. Quality constraints and input context have sources. | Correct the plan or record a technically justified alternative check. |
| Planner | The confirmed breakdown has original initialization proof. Root rows and metadata match the active tasks exactly in numeric identity order. | Correct the complete scaffold before commit. |
| Planner | Every active task has one pending, history-free initialized log. Scoped lint succeeds. The complete scaffold is committed. | Do not dispatch code. Use G27 only for proven initial recovery. |

## G08: Input standing

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Planner or coordinator | Selected task inputs, task digest, repository identity, and intent authority match committed context. | Hold the affected task for input diagnosis. |
| Coordinator | Context reports `current`, `impact-reviewed-unaffected`, or `legacy-current-confirmed` for the selected task. | Missing, stale, or `legacy-confirmation-stale` evidence prevents dispatch. |
| Planner | Changed inputs have a committed impact classification and independent review. Affected/new task context binds the follow-up plan revision. | Resolve formal intent first. Do not rewrite frozen completed tasks. |
| Planner | A legacy current confirmation applies only where historical input context is genuinely absent and the task definition remains unchanged. | Do not reconstruct historical blobs or use confirmation to hide known affected work. |

A legacy confirmation retains `historicalInputs: "unknown"`. It confirms current scope only and waives no other gate.

## G09: Admission

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Coordinator | Context verifies task readiness. All declared prerequisites are fully gated. Retry input differs from the unresolved prior attempt. | Hold the task and descendants. Independent compatible work can proceed. |
| Coordinator | The observed worker identity and isolated lane match the intended dispatch. Source, target, repository, worktree, task, plan, and inputs are bound. | Keep the worker read-only until identity and admission agree. |
| Coordinator | Guarded `task-state --admit` succeeds against the full expected HEAD. The original Task Base remains unchanged. | Recalculate after an unaccounted identity or revision change. |
| Coordinator | Any stale-head refresh crosses only verified admission-only events from the same coordinator and exact repository/source/target roles. | Never refresh across material, feedback, or publication commits. |

## G10: Scope reservation

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Worker | Every edit serves Goal and Acceptance within approved intent, design, and standards. | Return unrelated or authority-changing work to its owner. |
| Coordinator | A new necessary prerequisite has a committed reservation before its edits. The record identifies necessity, evidence, paths, attempt, and Verify. | Use guarded `task-state --reserve` before prerequisite edits. |
| Coordinator | A task uses at most two lifetime reservations. Each reservation names at most four concrete paths. | Require owner-approved re-planning above either limit. |
| Coordinator | The reservation introduces no new dependency, public contract, or security-policy authority. | Require owner-approved re-planning or formal intent revision. |

Goal-serving edits to unlisted files alone do not require reservation. Retry, reversion, abandonment, or correction never refunds reservation use.

## G11: Dispatch identity

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Worker | Independent harness readback matches the exact admitted worker. Current HEAD, branch roles, repository, and Git worktree identity match the dispatch. | Stop without checkpoint, status, or code writes. Return to the coordinator. |
| Worker | The admission, task digest, plan, input blobs, and prerequisite approvals match. Route-backed identity remains current. | Preserve work and require renewed admission. |
| Worker | The ignored checkpoint cache agrees with verified admission history. | Recover only a missing cache from proven history. Hold malformed or conflicting evidence. |

The worker repeats identity checks on resume. Copying the expected worker identity is not independent readback.

## G12: Implementation cycle

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Worker | Red observes the intended behavioral failure before production edits. | Repair the check when failure comes from the harness or unrelated behavior. |
| Worker | An alternative Red has a concrete technical reason and a repeatable pre-change/post-change check. | Do not use preference as an exception. |
| Worker | Green passes the same check. Refactor preserves behavior and includes regression checks or a checked no-cleanup decision. | Repeat the applicable correction cycle. |
| Worker | Exact Verify and all additional checks required by the code step and project standards pass. Acceptance and self-review are complete. | Record a truthful blocker if the required checks cannot pass. |
| Worker | Task evidence records exact commands, results, phase evidence, and the admitted `Start HEAD`. | Complete truthful evidence before a terminal commit. |

The planner scopes task Verify to related tests, type checking, and configured lint. The code skill currently also requires full-suite verification.

[Verification alignment](maintenance.md#verification-alignment) records this difference. Finish admission always requires the full suite and build or type check.

## G13: Publication

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Coordinator | The worker supplies truthful local terminal evidence and its original commit. Root and local identities agree. | Preserve unresolved work. Do not infer terminal outcomes from missing responses. |
| Coordinator | Guarded `task-state --publish` succeeds against the current expected HEAD with `done` or `blocked`. | Preserve the failed integration or publication state for diagnosis. |
| Coordinator | For done, the original worker ancestry is integrated and the exact planned Verify passes on integrated bytes. | Do not publish done. Do not grant feedback clearance. |
| Coordinator | The root publication records verified coverage or the supported historical broad fallback. | Package the exact published boundary. Do not invent attempt start revisions. |

## G14: Task range

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Coordinator and reviewer | One active numeric Task N matches the plan, package, checkpoint, local log, and feedback path. | Reject wrong scope before inspection or verdict writes. |
| Reviewer | Full Base and Head resolve. Base equals the verified immutable Task Base. Base precedes Head, and Head precedes current HEAD. | Hold malformed, conflicting, inverted, or unreachable ranges. |
| Reviewer | Head contains the latest task-progress commit. For a v2 publication, Coverage identifies exactly one publication with that integrated Head. | Obtain a correct package or new feedback. Never fall back to an earlier approval. |
| Reviewer | The v2 package retains each attempt manifest and verified integration deltas across correction publications. | Preserve earlier effects. Do not reduce review to the latest visible net diff. |
| Reviewer | A v1 broad package has verified historical publication evidence. | Do not infer narrow coverage for historical attempts. |

## G15: Task inspection

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Task reviewer | Every acceptance criterion and implementation claim has located evidence within the task range or permitted named-risk check. | Record a blocking finding. |
| Task reviewer | Supplied peer approval has independently verified commit, path, reviewed range, and approval boundary. | Inspect unattributed changes. Never exempt whole filenames. |
| Task reviewer | One named outside risk either resolves at its named location or remains explicit. | Record `cannot verify from diff` as an evidence gap when the bounded check cannot resolve it. |
| Task reviewer | Approval has no unresolved blocker. Optional suggestions do not hide required corrections. | Use `changes-requested`. |

## G16: Verdict durability

This gate also supplies the artifact-only commit safety rule for finish intent. Finish outcomes use G31.

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Artifact owner | The destination is not already staged. The actor records existing staged state before mutation. | Stop without altering the destination or pre-existing index. |
| Artifact owner | The new record passes scoped lint. Earlier append-only records remain unchanged. | Correct only the new record or report the exact blocker. |
| Artifact owner | The latest verdict-touching commit contains only the exact feedback or review path. Finish intent contains only the finish path. | Reject mixed commits as gate evidence. |
| Coordinator | The record is tracked and present at HEAD. Its index matches HEAD, and its worktree bytes match the index. | Obtain durable current evidence without destructive unstaging. |

## G17: Task clearance

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Coordinator | Root status is done. Local terminal evidence is consistent, committed, reachable, and verified. Checkpoint, history, and inputs remain current. | Hold the task. Diagnose evidence with its owner. |
| Coordinator | The physical last task pass is independently authored, approved, fresh, durable, range-valid, and free of blockers. | Do not release dependents. Route feedback issues to the task reviewer. |
| Coordinator | Every declared prerequisite is also fully gated. Context confirms the resulting projection. | Hold descendants even when their own feedback appears approved. |
| Branch reviewer or finish owner | Every active task satisfies this gate before whole-branch review or finish. | Return affected tasks to their owners. |

## G18: Finding routes

The coordinator preserves the complete blocker set before classification or freshness routing. A finding keeps its first stable `pass-N-blocking-M` identity.

| Finding kind | Task-feedback route | Branch-review route | Required exit evidence |
| --- | --- | --- | --- |
| `code-defect` | Renew admission for the same task. Repeat its correction cycle and publication. | Ask the planner for new numbered remediation tasks. Execute their ordinary task gates. | Verified correction and new independent verdict. |
| `evidence-gap` | Independently check located new evidence. Keep Base, Head, and v2 Coverage unchanged for evidence-only feedback. | Independently check located evidence on the unchanged material/plan range. | New complete pass that resolves the finding. No invented code or task. |
| `intent-defect` | Return to the proposal/design owner. | Return to the proposal/design owner. | Revised exact requester approval, input-impact assessment, and later full branch review. |
| Ambiguous legacy finding | Ask the responsible owner to classify the named concern. | Ask the responsible owner before remediation selection. | Located classification evidence. Do not assume a code defect. |

Staleness does not erase a requested-change obligation. No changed useful input means no identical automated retry.

## G19: Branch range

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Branch reviewer | The input is the complete branch package, not a task range or arbitrary ancestor. The explicit full target resolves. | Reject wrong scope without a verdict write. |
| Branch reviewer | Base equals the actual target merge base. Base precedes Head, and Head precedes current HEAD. | Recompute and supply the correct range. |
| Branch reviewer | Full scope is used for the first review or when remediation provenance cannot be verified. | Require full review. |

## G20: Branch clearance

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Coordinator | The physical last root pass is durable, range-valid, current, and free of blockers. | Preserve findings and require new coverage or owner diagnosis. |
| Coordinator | Full scope has `approved`. Valid remediation scope has `approved-remediation`. | A skipped or requested-change pass does not clear. |
| Coordinator | Reviewed Head contains the latest material commit unless the requester explicitly waives only that finish comparison. | Obtain fresh review or the narrow explicit waiver. |
| Reviewer and coordinator | Remediation satisfies G33. Resolutions cover the exact union of blocker IDs from the full baseline and scoped suffix. | Retain unresolved findings. Do not grant bounded approval. |

## G21: Finish admission

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Finish owner | Artifact lint succeeds. Exact required task evidence and current branch clearance pass. Formal intent and critique disposition remain valid. | Report the gate output without finish writes. |
| CLI and finish owner | Full tests and build or type check pass. The repository is clean before and after verification. | Do not allocate an attempt. |
| CLI and finish owner | `precondition` reports `gate: open` and one exact `verified-head`. Current HEAD, branch, worktree, and target repository still match. | Rerun admission after an identity change. |
| Finish owner | Source and target roles differ. Strategy, spec targets, and route intent satisfy read-only validation. | Resolve intent before creating finish history. |

A material-ancestry waiver changes only that comparison. It waives no task, verdict, range, cleanliness, test, or intent gate.

## G22: Finish intent

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Finish owner | No unmatched attempt remains. The strategy has requester authority or an explicit project default. | Reconcile history or request the missing strategy. |
| Finish owner | Approved deltas are complete and consistent. Exact spec targets and approved input blobs are known. | Return defective intent for revision and fresh review before an Attempt. |
| Finish owner | The attempt binds admitted HEAD, review, target, source, worktree, repository, approved inputs, route, and intended effects. | Complete the record before commit. |
| Finish owner | Route qualification and strategy agree within this invocation. The verified Attempt commit exists before effects. | Do not create an awaiting-merge state or an incompatible request. |

## G23: Plan amendment

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Planner | The existing plan is version 2 and passes lint. Original initialization, done tasks, IDs, paths, and history remain frozen. | Preserve evidence and request owner diagnosis. |
| Planner | New tasks use new maximum-plus-one IDs. Existing non-done statuses remain accurate. Exact abandonment retains history and never reuses IDs. | Reconcile the active root rows without erasing task directories. |
| Planner | A task with feedback retains its title and identity. A feedback-free unfinished rename updates all permitted identity displays together. | Abandon explicitly and append a new identity when authorized. |
| Coordinator and planner | Current writers stop before a new dependency. Partial work has authorized, verified preservation and restoration evidence. | Do not stage, stash, commit, or discard partial work to manufacture safety. |
| Planner | Changed inputs satisfy G08. New dependencies have requester approval. Scoped lint and current context pass after amendment. | Keep affected dispatches held. |

## G24: Recovery and retry

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Responsible owner | Committed artifacts and actual state establish the last proven boundary. New evidence can change the failed result. | Preserve partial work and ask for adjudication. |
| Coordinator | Missing or interrupted responses do not create terminal attempts or root outcomes. Task Base and consumed reservations remain unchanged. | Inspect the original lane and history. |
| Reviewer | Older approval never overrides a later invalid, skipped, stale, or requested-change pass. | Obtain current evidence through the correct owner. |

## G25: Route binding

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Planner or intent owner | A compiled canonical route exists and passes structural checks. An existing plan binding governs. Any non-null proposal binding agrees. | Stop conflicting or ambiguous bindings. |
| Planner or intent owner | A new unbound change selects the first pending unit. Each prerequisite is shipped and reachable from the actual base. | Report a blocked first unit. A later-unit choice needs owner authority. |
| Current writer | Unit, route-source revision, owner, change, source, target, and base match the admitted context. Visible claims show no competing owner. | Resolve transfer or resume explicitly. Never bypass claims with a suffix. |
| Finish owner | Ordinary finish retains the same in-progress unit. The observed strategy satisfies its exact Shipping rules qualification. | Keep the unit unshipped. |

The local claim scan cannot prove cross-clone exclusivity. Concurrent cross-clone claims and delivery are unsupported.

## G26: Post-admission boundary

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Finish owner | Every later commit and dirty path belongs to this attempt's exact spec, route, map, or numbered finish effects. | Stop forward effects. Return unrelated material changes to branch review. |
| Finish owner | Source, target, base, worktree, and repository identities remain admitted. | Stop even when the commit SHA is unchanged. |
| Finish owner | Approved proposal, design, and requirement bytes remain unchanged. | Require intent revision and new review. |

Expected same-attempt effects do not stale their own admission. They do not grant a general freshness exception or admit another attempt.

## G27: Initial scaffold recovery

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Planner | Read-only context reports `scaffold-recovery: eligible`. The original pre-scaffold HEAD, task digest, IDs, and authority are provable. | Preserve present files. Request owner evidence. |
| Planner | All present state is pending and history-free. No task work, attempt, feedback, checkpoint, staged conflict, or deleted execution history exists. | Do not reconstruct execution evidence. |
| Planner | Only missing original files need creation. Present bytes and author metadata remain unchanged. | Stop any broader repair. Lint and commit the complete recovered scaffold. |

## G28: Semantic inspection

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Intent owner | Formal candidates explain sourced language, responsibilities, boundaries, contracts, and relevant code attribution. | Resolve material ambiguity before approval presentation. |
| Intent owner | Proposal, deltas, and design agree. Structural defects have a correction or an explicit documented design decision. | Correct the candidate. Do not use lint as semantic proof. |
| Branch reviewer | Inspection accounts for binding intent, cross-task behavior, consumers, omissions, tests, security, and scope. | Record located blockers rather than repairing during review. |

## G29: Spec synchronization

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Finish owner | Canonical changes derive only from approved formal inputs inside a durable attempt. | Never infer canonical behavior from raw code or review comments. |
| Finish owner | ADDED, MODIFIED, REMOVED, and RENAMED deltas map to the canonical contract sections. Canonical specs retain human-readable form. | Correct the spec translation without changing approved requirements. |
| Finish owner | Each canonical mutation passes file-scoped lint. New author metadata is valid. Exact spec-only commits exist when needed. | Do not commit invalid specs or create empty no-change commits. |
| Finish owner | A change without deltas preserves canonical behavior. | Return a missing behavior delta to intent revision and fresh branch review. |

## G30: Strategy and shipment

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Finish owner | Independent Git/provider readback proves the exact strategy result. No-op proves retention, not delivery. | Inspect partial state and stop forward actions. |
| Finish owner | Route qualification is exactly `merge`, `request-open`, or `no-op` and agrees with the observed result. | Keep the unit unshipped. Resolve incompatible rules before new effects. |
| Finish owner | Only the named unit advances. All units satisfy shipment before the map becomes shipped. Every route/map mutation passes lint. | Preserve siblings and partial writes. Do not infer rollback. |
| Finish owner | Any workspace removal is authorized, exclusive, clean, and safely preserved. Removal occurs outside that worktree. | Retain shared, dirty, or ambiguous workspaces. |

## G31: Finish outcome

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Finish owner | Each Attempt has one matching numbered Outcome. Numbers increase. Earlier records remain unchanged. | Reconcile unmatched intent before another attempt. |
| Finish owner | Completed means every intended external, spec, route, workspace, and history effect has independent proof. | Record blocked with verified partial state when safe. |
| Finish owner | Outcome passes lint and commits separately on the surviving branch or base. Required remote persistence has verified readback. | Report unpersisted history as unmatched or incomplete. Never claim completion. |

## G32: Finalization repair

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Finish owner and CLI | Original history proves verified delivery followed by blocked finalization. Original admission, review, input, route, and effect provenance remain valid. | Require owner adjudication for missing, changed, or ambiguous provenance. |
| Finish owner and CLI | Repair admission reports `admission: finalization-repair`, current `verified-head`, exact `remaining-effects`, and `gate: repair-open`. | Do not enter ordinary delivery. |
| Finish owner | A new linked `reconcile-delivery` Attempt retains original identities and any required exact `retry-evidence`. | Preserve original pairs and failed repair history. |
| Finish owner | Only named canonical-spec, route, map, and history effects remain. No merge, request creation, or cleanup repeats. | Stop effects outside the repair allowlist. |
| Finish owner | The surviving tree is clean. Failed repair retries have changed, independently verifiable evidence. | Request owner-authorized preservation, restoration, or scoped commit before new admission. |

## G33: Remediation eligibility

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Reviewer and coordinator | Remediation retains its immutable modern full requested-change baseline, artifact-only parent commit, exact target/Base, and original full Head. | Use full review. |
| Reviewer and coordinator | Intent is unchanged. Plan amendments preserve frozen definitions. Scoped history is unchanged and all Heads stay within cumulative bounds. | Require full review or owner repair. |
| Reviewer and coordinator | Every material correction path has bounded classification. Required code-correction tasks are fully gated. | Use full review if impact cannot be bounded. |

G33 permits bounded inspection. It does not require the new approval before inspection. G20 checks the resulting clearance.
