# Kepler change state machine: STPA investigation and remediation plan

## 1. Scope, evidence, and decision criteria

This is an analysis and future implementation plan, not an applied fix. The entry point is [the change-state-machine document](./change-state-machine.md). Repository behavior was initially evaluated at commit `ebfa4f53624f3ea9d6a201b2f69c9c262246ac83` on `fix/finish-work-gates`. The task-sequencing follow-up uses report commit `f07473988631196efc408ea118d5a7c3f4894c54`; that commit changed only this report, not workflow behavior.

The investigation covers the **entire documented change lifecycle**, not only the four reported examples: all 16 C transitions (including C1a/C2a/C4a/C6a), all 12 E predicates, initial and tactical entry, critique disposition, re-planning, optional route handoff, interruption, conflicting ownership, and recovery. The initial pass concentrated on code/review/finish; the expanded pass systematically examines upstream controllers and cross-stage interactions. Additional sources answer specific control/feedback questions; unrelated CLI operations and the internal Wayfinder ticket-resolution workflow remain outside this change-lifecycle boundary. No live `.kepler/` change artifacts exist in this checkout, so the user's historical failures establish observed incidents but do not establish which installed version or exact artifact produced each incident. Reproduction is not required from the user.

Evidence labels used below:

- **Reported observation:** an incident supplied by the user.
- **Source observation:** behavior or an instruction directly present in the inspected checkout.
- **Inference:** a failure scenario supported by that control structure, not a reproduced incident.
- **Proposal:** a future change that has not been implemented or behaviorally verified.

This uses STPA's purpose, control-structure, unsafe-control-action, and causal-scenario analysis. The four unsafe-control-action categories are omission, provision in an unsafe context, incorrect timing/order, and excessive/insufficient duration. For Kepler, duration includes repeated dispatches and a persisted authorization remaining effective after its evidence changes. These are software workflow losses and hazards, not a claim that Kepler controls a physical safety-critical process.

The decision criteria are correctness, review cost, recoverability, artifact compatibility, clear ownership, and portability across agent harnesses. A smaller instruction change is preferable when it closes the causal gap; a mechanical predicate is justified where multiple agents otherwise interpret the same persisted evidence differently. Adding a new aggregate change-status database is outside the proposed approach.

## 2. STPA purpose and system boundary

### Stakeholders and unacceptable losses

| ID | Loss | Stakeholder affected |
| --- | --- | --- |
| L1 | An incomplete, incorrect, or insufficiently reviewed change is delivered. | Requester, maintainers, downstream consumers. |
| L2 | Authorized work or safe recovery stalls avoidably, or consumes repeated expensive reviews without new useful evidence. | Requester and engineering budget. |
| L3 | Implementation evidence, approved intent, canonical specs, or delivery records become contradictory or lose provenance. | Maintainers and future agents resuming the work. |
| L4 | A workflow retry, withdrawal, or cleanup duplicates an external action, destroys workspace state, or reports delivery that did not occur. | Requester, repository owners, external reviewers. |
| L5 | Preventable design/code defects recur because binding standards and relevant prior decisions do not reach the generating controller. | Maintainers and downstream consumers. |

### System-level hazards and constraints

A hazard is a system condition that can lead to a loss in a particular operational context; it is not the name of a broken function.

| ID | Hazardous system condition | Losses | Required system constraint |
| --- | --- | --- | --- |
| H1 | A controller advances with incomplete, contradictory, wrongly scoped, or stale evidence. | L1, L3 | SC1: Advancement must use one explicit predicate over current durable evidence, with stage and task identities intact. |
| H2 | A controller withholds safe authorized progression/repair, including after independently discharged obligations, or repeats work/review without a meaningful change of evidence. | L2 | SC2: Resolution must have a bounded, independently checked path; repeated dispatch must have a stated new evidence or correction purpose. |
| H3 | Different readers derive incompatible task/review states from replicated fields or different definitions of freshness. | L1, L2, L3 | SC3: Define authority and consistency rules for every representation, and check them at the stage handoff rather than only at finish. |
| H4 | A persistent shared workflow mutation or external effect occurs outside recoverable ownership/intent, or route state advertises an unverified result. | L1, L3, L4 | SC4: Durable intent must precede persistent effects; completion must follow observed effects, and recovery must not allocate duplicate intent. |
| H5 | A generating/reviewing controller lacks applicable quality constraints and current decision context, or treats remembered guidance as current authorization. | L1, L5 | SC5: Supply relevant quality/decision evidence before generation and verify its applicability; memory cannot authorize lifecycle advancement or override approved intent. |
| H6 | State changes between verification, admission, and the next effect without invalidating the authorization. | L1, L3, L4 | SC6: Bind verification and each effect to the admitted repository identity and owned mutation boundary. |

### Control structure

```text
Requester / project standards / approved intent / applicable prior decisions
             | goals, constraints, decisions, explicit narrow waiver
             v
Project / Git / legacy-data resolver
  +--> kepler-init ---------------------+ standing standards + project workspace
Optional compiled Wayfinder route ------+ destination, units, dependencies, target
Requester --> kepler-propose -----------+ proposal + deltas + design
              ^                        |
              +-- critique + disposition+ revision / explicit owner settlement
Person or kepler-orchestrate
  | bounded dispatch                    ^ current committed artifacts + Git evidence
  +--> kepler-plan ---------------------+ plan and initialized task identity
  +--> kepler-code ---------------------+ implementation + task/root evidence commit
  +--> kepler-code-feedback ------------+ independent task verdict commit
  +--> kepler-review -------------------+ independent branch verdict commit
             |
             | fresh cleared branch authorization
             v
       kepler-finish-work
          | admission / effects          ^ gate result and observed readback
          +--> workbench CLI ------------+ parsed predicates and diagnostics
          +--> specs / route / Git / provider / worktree
                                        ^ actual refs, request state, workspace
```

The controlled process is the progression and delivery of one change within shared project standards, canonical specs, routes, and Git refs. Neighboring changes/worktrees matter at shared-resource and cleanup boundaries. The workbench is a mechanical controller for selected predicates and also a feedback channel; it is not the semantic reviewer. Stage skills run in agents or people, whose process models can differ despite reading the same files. Git, artifact parsing, verification output, and provider/worktree readback supply observations. The requester owns choices that a boolean CLI flag cannot authenticate.

Sources: [scope and authority](./change-state-machine.md#scope-and-authority), [orchestrator role ownership](../skills/kepler-orchestrate/SKILL.md#principles), [review generation preflight](../skills/kepler-review/SKILL.md#generation-preflight), [finish preconditions](../skills/kepler-finish-work/SKILL.md#preconditions).

### Controlled variables and process-model inputs

| Variable | Authority / observer | Important distinction |
| --- | --- | --- |
| Project readiness | Init, repository facts, preserved standards/workspace. | Existence of a directory or AGENTS.md alone does not establish verified commands or successful initialization. |
| Approved intent and critique disposition | Requester; proposal/design/deltas; critique owner. | Approval is not lint validity. Critique settlement differs from independent code/branch clearance. |
| Route entry and ownership | Compiled body, units metadata, dependency Git reachability, owning branch/change. | A branch-local in-progress marker is observable intent, not an exclusive distributed claim. |
| Active task identity and acceptance | Plan body; planner owns changes. | Numeric IDs/paths are stable identities. Today physical ID order also governs orchestration; A18 proposes a separate serial execution sequence without changing identities. Abandonment retains its exact heading form; zero active tasks skips only task gates. |
| Current task implementation state | Root `tasks[]` metadata and root body table; coder owns the assigned entry. | Root aggregate `status`, entry `status`, and task-local `status` are different fields. |
| Implementation outcome | Physical latest task attempt plus task-local status; coder. | A transient agent answer or successful test command does not create a durable done attempt. |
| Task approval | Physical latest task feedback, artifact-only commit, stable task range. | Approval is separate from implementation completion. |
| Branch approval | Physical latest root review, artifact-only commit, valid range, material coverage. | Metadata `decision` is not the pass verdict; `applied` is not independently verified clearance. |
| Finish admission | E0, CLI predicates, and skill/user policy. | CLI `gate: open` is not proof of every semantic or user-authorization fact. |
| Delivery intent/result | Paired finish Attempt/Outcome, actual Git/provider/workspace state. | Intent and observed completion must remain separate. |
| Quality and prior decisions | Current standards, applicable rubric, verified relevant project knowledge. | Harness memory is context, not authoritative lifecycle state. |

The root body ledger is genuinely required by [`readTaskLedger`](../packages/cli/src/workbench/artifact-body.ts#L686-L842). Its metadata copy is compared at finish by [`inspectTasks`](../packages/cli/src/workbench/precondition-artifacts.ts#L112-L262). The absence of a table in the root progress template does not remove that reader contract.

## 3. Current derived states and guarded transitions

| Transition group | Controller and required feedback | False-guard / recovery behavior |
| --- | --- | --- |
| C0–C2: initialize, optionally propose, plan | Project instructions, requester-approved intent where applicable, lint-valid plan and initialized evidence. | Remain before implementation; do not fabricate missing inputs. |
| C3: execute one task | Coder reads exact task, stable checkpoint, current assigned root state, same-task correction evidence. | Graceful blocker writes blocked evidence; interruption leaves an in-progress root entry without invented outcome. |
| C4–C5: task feedback and advance | Independent task feedback; physical latest approval must be durable and fresh. | Code defects return to the same task; a canonical evidence blocker gets bounded driver adjudication; missing/stale feedback gets feedback again. |
| C6–C7: whole review and remediation | All active tasks done and approved; actual target merge base; complete branch review. | Implementation findings create numbered remediation tasks; approved-intent defects return upstream; after remediation current policy repeats full review. |
| C8: finish admission | Existing finish-history preflight, clean repository, passing supplied verification, exact task/review evidence, material freshness or explicit narrow waiver. | No new finish Attempt or finish-stage mutation. |
| C9: specification synchronization | Approved consistent change deltas; known strategy and route intent. | Missing/incorrect intent stops before Attempt allocation. Current ordering permits a canonical-spec commit before the Attempt. |
| C10–C11: effect, readback, outcome | Durable Attempt, permitted post-gate mutations, actual strategy and workspace/provider readback. | Preserve partial state; reconcile a dangling Attempt before another; blocked retries require a new gate. |

The original document's state names are explanatory derived predicates, not new YAML enum values. `AllTasksGated` is conjunctive, not a check on a single summary field. `WholeReviewApproved` alone does not establish material freshness. `FinishCompleted` requires both a persisted pair and observed strategy-specific effects. See [derived states](./change-state-machine.md#derived-change-states), [transition table](./change-state-machine.md#transition-table), and [exact admission predicate](./change-state-machine.md#exact-finish-work-admission-predicate).

Current admission model:

```text
FINISH_ADMITTED = history_preflight AND CLI_OPEN AND skill_policy
CLI_OPEN = target_and_command_valid AND clean_entry AND command_exit_zero
           AND clean_after_verification AND exact_done_task_evidence
           AND approved_durable_task_and_branch_reviews
           AND valid_branch_ranges AND material_fresh_or_explicitly_waived
           AND final_clean_tree
```

[`readReview`](../packages/cli/src/workbench/precondition-reviews.ts#L77-L104) consumes the physical latest parsed verdict. [`inspectReviews`](../packages/cli/src/workbench/precondition-reviews.ts#L106-L182) requires `approved`; [`inspectFreshness`](../packages/cli/src/workbench/precondition-reviews.ts#L184-L242) retains that requirement even under a material-ancestry waiver.

### Full lifecycle coverage ledger

This ledger records normal authorization, all four UCA categories, and containment for every documented transition. A covered/protected case is not forced into a new defect finding. Source baseline: [transition and admission tables](./change-state-machine.md#transition-table).

| Control | Normal authority and observed protection | Omission / unsafe provision / timing / persistence challenge | Finding, action, or retained check |
| --- | --- | --- | --- |
| C0 | Init explores facts, preserves AGENTS/data, migrates before scaffolding, then confirms/records assumptions. The [core resolver](../packages/core/src/migration.ts#L769-L883) stages copy, records ownership, uses a migration lease, and dispatches existing-marker recovery. | Missing facts; guessed commands; readiness before migration/scaffold succeeds; stale standing standards after repository change. | Existing controls retained; U29; A10/A13/A14; T31. No live migration exercised. |
| C1 | Propose owns intent, quality self-review and requester approval; tactical changes may skip it. | Approval omitted or inferred from defaults; early handoff; a prior approval reused after byte/content revision. | F12/F19; A11/A14/A16; T18/T22/T34. |
| C1a | Critique reviews only; requester settles accepted/applied/rejected; skipped collects no decision. | Unresolved skipped verdict treated as settlement; next-stage selection before disposition; redundant critique after legitimate settlement. | F13; A11; T19. Preserve distinct critique protocol. |
| C2 | Planner reads current standards/specs, confirms or auto-reflects authorized unattended work, isolates workspace, initializes identities. | Lint substituted for approval; wrong route unit; rename/history mismatch; interrupted scaffold reused as complete; competing claim. | F12/F14–F19/F21; A11–A16/A18; T18/T20–T27/T30/T34–T39. |
| C2a | No active tasks remains only after declared tasks are abandoned with canonical reasons. | Empty ledger falsely treated as complete work; taskless state used to skip branch/spec/delivery obligations; repeated task dispatch despite no active task. | Existing parser/ledger guards retained; A10; T15/T32. |
| C3 | One exact active Task N, scoped files, stable checkpoint, ordered verification, owned committed evidence. | Missing evidence; cropped checkpoint; execution against changed acceptance; concurrent overwrite; fabricated attempt after interruption. | F2/F5/F6/F16/F19–F21; A1/A2/A14/A16–A18; T1–T4/T22/T28–T29/T34–T39. |
| C4 | Independent task review reads acceptance and cumulative stable range; appends only owned feedback. | Omitted acceptance; wrong title/Base; premature/undurable approval; approval retained after relevant input change. | F4/F14/F16/F20/F21; A5/A12/A14/A17/A18; T10/T20/T22/T28/T39. |
| C4a | Named unresolved diff-evidence risk receives bounded driver adjudication, then independent resolving pass. | Evidence question sent to code; advancement before resolution; unchanged indefinite retries. | F8; A3; T9. Existing canonical trigger preserved. |
| C5 | Driver advances only after current done evidence and durable fresh task approval. | Skip a task; trust transient answer; advance before commit; reused approval for different title/contract. | F2/F6/F14/F16/F20/F21; A1/A2/A12/A14/A17/A18; T35–T39. |
| C6 | Whole review covers complete branch and consumers against actual target merge base. | Omitted integration; arbitrary range; approval before task/intent readiness; repeated unbounded inspection. | F1/F3/F11; A3/A4/A9; T6–T8/T13. |
| C6a | Latest valid durable approval can be reused with material freshness, separately from explicit finish waiver. | Fall back to old approval; confuse disposition/clearance; reuse after material/input change. | A4/A9/A14; T6–T8/T15/T22. |
| C7 | Driver classifies implementation versus approved-intent defects; planner appends numbered remediation, freezes done definitions. | Missing invalidation; modifying frozen history; title change stranding feedback; resolving intent in code; unchanged remediation loops. | F3/F8/F14/F16/F21; A3/A4/A12/A14/A18; T7/T9/T20/T22/T35–T39. |
| C8 | History, CLI predicates, and semantic/user policy jointly admit finish. | Treat CLI open as complete authorization; missing user waiver; tested revision differs; ambiguous route hidden by context. | F7/F18/F20; A6/A11/A15/A17; T5/T18/T25/T28. |
| C9 | Approved consistent deltas only; tactical behavior changes still require deltas. | Invent specs from diff; stale approval; sync before journal; detect missing obligation only after costly implementation/review. | F9/F12/F16; A7/A11/A14; T11/T18/T22/T30. |
| C10 | Durable intent precedes effects; owned boundary and strategy qualification must hold. | Wrong unit; competing ownership; premature shipment; unexpected mutation or unauthorized shared-workspace cleanup. | F10/F18/F19; A7/A8/A15/A16; T12/T17/T25–T27/T33. |
| C11 | Actual external/workspace state closes a numbered pair; dangling recovery precedes new intent. | False readback; repeated delivery; treating cancellation as rollback; holding abandoned claims indefinitely. | A7/A8/A16; T14/T16/T27/T33. Paired blocked records remain immutable. |

**Admission coverage:** E0 (history/lint/recovery) maps to A7/T11/T14/T16; E1 (real target and supplied command) to preserved path guards/T31; E2/E4/E10 (entry/after/final cleanliness) to A6/T5; E3 (exit status versus full-suite semantics) to standards/A5/A6/T5/T10/T31; E5 (durable matching plan/root identities) to A1/A11/A12/T1/T18/T20; E6 (latest done implementation) to A2/A13/T3/T4/T21; E7 (task review identity, durability and scope) to A2/A12/A14/A17/T4/T20/T22/T28; E8 (whole review validity/scope) to A4/A9/T6–T8/T13/T15; E9 (material coverage and narrow authorized waiver) to A7/A9/A14/T8/T22; E11 (conjunction with semantic policy) to A11/A15/A17/T18/T25/T28. A boolean or exit code cannot authenticate an owner decision or prove semantic review quality. A18 proposes execution validation at E0/E5/E11 while preserving E6/E7 for every active task; the current CLI does not prove historical chronological execution order.

**Cross-boundary containment:** Ordinary paths realpath/bind change/task identity; material freshness includes plan/proposal/design/deltas/specs/standards, not only production files. A waiver does not authorize changed intent. Isolation proves workspace shape, not exclusive change ownership. Route status/body/dependency coherence and claim visibility require their own checks. Cancellation/transfer must inspect partial effects and preserve work rather than infer rollback from a status.

### Invariants to preserve in any remediation

1. Never revive an earlier approval when the physical latest evidence is invalid or requests changes.
2. Never interpret `decision: applied` as independent code/whole-review verification. Critique's legitimate user-owned applied/rejected settlement is a different protocol and must not be forced into redundant critique passes.
3. Preserve completed task definitions and append-only attempts/reviews; owners repair only their evidence.
4. Preserve stable task checkpoints and require task/branch ranges to resolve and remain on the current branch.
5. Separate exact artifact/range validity from material coverage; a user waiver affects only its named comparison.
6. Do not introduce a second authoritative aggregate lifecycle field or depend on conversation memory for resume.
7. Admit no new finish attempt before reconciling existing unmatched intent; prove actual effects before completion.
8. Preserve standards and approved intent when using memory or a shorter remediation review.
9. Separate stable task identity/storage order from an explicitly authorized serial execution order. A new prerequisite must not force renumbering, scope expansion, fabricated completion, or bypassed feedback.

### Open questions carried into the failure analysis

- Whether lint detects replicated task-state contradictions before finish, and which contradictions dispatch checks miss.
- Whether material freshness is evaluated before classifying previously requested branch corrections.
- Whether finish can recover an interruption after spec synchronization but before its Attempt, and whether retry can safely reconcile an already-shipped route.
- Which quality criteria reach the implementer before generation, and whether applicable prior decisions have an explicit evidence path.
- Which guarantees remain prose-only versus mechanically checked; no static contract test will be treated as proof of agent behavior.

## 4. Disposition of the four reported incidents

| Reported observation | What this checkout establishes | Remaining problem / recommended disposition |
| --- | --- | --- |
| Finish rejected a `changes-requested` review whose metadata documented applied corrections. | `inspectReviews` and `inspectFreshness` require the latest verdict to be `approved`. Review metadata `decision` permits `accepted`, `rejected`, or `skipped`; `applied` is permitted for critique, not review. | Historical reproduction is unavailable, but the interpretation mismatch is real. Preserve independent verification; introduce an explicit reviewer-owned remediation clearance instead of admitting a bare `applied` claim. F1, A4. |
| Orchestration left task frontmatter stale. | Code already requires synchronized root metadata, root body row, task-local status, latest attempt, and one commit. Finish checks the copies. Artifact lint does not compare root metadata against its body table. | This is not solved by adding another instruction to mark done. Detect disagreement earlier, validate the committed handoff, and send evidence repairs to the coder rather than recoding or changing status in the driver. F2, A1–A2. |
| Review corrections triggered repeated expensive whole-branch reviews. | Review explicitly says every pass must inspect the broader repository. Orchestration explicitly repeats that gate after remediation. Fresh approved review reuse and focused command execution already limit some redundant work. | Bounded remediation review does not exist. Separate finding resolution from the scope of the original full review, preserve integration coverage, and detect dispatches that add no evidence. F3, F8; A3–A4. |
| Rubrics and agent memory were insufficiently applied during decisions/generation. | Plan has a substantive local rubric and Overview quality notes; task/branch reviewers have scoped rubrics. The coder reads one task and cited constraints, uses a shorter checklist, and does not read plan-wide quality notes. Core dispatches have no explicit relevant-memory retrieval/application step. | Carry applicable quality decisions into each task and its dispatch before code generation. Use memory as checked decision context, never as resume state or an override of approved intent. F4, A5. |

Schema source: [`schemaProperties`](../packages/cli/src/workbench/artifact-schemas.ts#L87-L141). This table does not claim the installed version used in the historical incidents had today's schema or parser.

### Subsequent reported observation: unforeseen prerequisites

| Reported observation | What this checkout establishes | Remaining problem / recommended disposition |
| --- | --- | --- |
| Strict Task 1 → 2 → 3 execution prevents introducing an unforeseen prerequisite, causing deadlock or forcing an original task's scope to grow. | Planner appends IDs and freezes done definitions; lint rejects reordered numeric records; driver selects the earliest unresolved task. Depends on exists as prose but is not consumed by the task-ledger reader. | F21/S21 adds the control-composition failure. A18 separates identity from an authorized serial execution sequence; a new Task 4 can precede unresolved Task 2 without renaming or widening it. A genuine dependency cycle still requires owner adjudication. |

## 5. Unsafe control actions

Each entry names the controller, the action, and the context that makes it unsafe. A control action can be unsafe even when every component follows its local instructions.

| ID | Controller and control action in hazardous context | Category | Hazards | Constraint / proposed action |
| --- | --- | --- | --- | --- |
| U1 | Finish withholds admission after corrections have actually been independently verified, but clearance exists only as incompatible metadata. | Omission | H2, H3 | A4 must provide consumable reviewer-owned clearance, not merely a disposition field. |
| U2 | Finish admits a review because someone wrote `applied`, without independent correction and coverage evidence. | Unsafe provision | H1 | Preserve SC1; A4 rejects disposition-only clearance. |
| U3 | Coder ends a verified implementation without synchronizing its assigned root/task representations. | Omission | H3 | A1–A2 require a consistent committed handoff and owner-directed repair. |
| U4 | Driver advances from a `done` root body row while metadata or the latest task outcome contradicts it. | Unsafe provision | H1, H3 | Check the complete task-completion predicate before feedback or advancement. A1–A2. |
| U5 | Driver dispatches new implementation from a stale pending/blocked root entry when a done attempt already exists. | Incorrect order | H2, H3 | Diagnose evidence mismatch before applying the resume matrix; do not fabricate completion. A1. |
| U6 | Driver requests a new complete branch review after a bounded verified correction without first evaluating whether existing coverage can be retained. | Unsafe provision in a cost-sensitive context | H2 | A4 permits explicit bounded clearance only under preserved coverage conditions. |
| U7 | Driver continues requesting review or code on unchanged range, unresolved concern, and unchanged available evidence. | Excessive duration | H2 | A3 requires a new-evidence reason or owner adjudication, not another identical dispatch. |
| U8 | Driver sends an evidence question to code because the reviewer used wording other than the canonical `cannot verify from diff`. | Unsafe provision | H2, H5 | A3 adds typed issue classification with a legacy fallback. |
| U9 | Planner/dispatcher omits applicable quality constraints and prior decisions from the exact task the coder receives. | Omission / too late | H5 | A5 embeds task-local references and checks their application before generation and at handoff. |
| U10 | Agent uses remembered advice as authorization to bypass current requirements, review, or a user's waiver decision. | Unsafe provision | H1, H5 | A5 keeps memory subordinate to current binding evidence. |
| U11 | Parser exposes `Outcome: done` after a contradictory earlier Outcome in the same attempt. | Unsafe provision | H1, H3 | A2 rejects duplicate terminal fields, including mixed supported syntax. |
| U12 | Gate accepts task feedback without a verifiable committed task-progress revision to which its Head must be bound. | Unsafe provision / excessive validity | H1, H3 | A2 makes the required implementation revision mandatory. |
| U13 | Gate uses a passing verification from one HEAD to admit a different clean HEAD produced during verification. | Incorrect timing | H6 | A6 binds admission to a captured unchanged HEAD and passes that identity to finish. |
| U14 | Finish commits canonical specs before durable Attempt intent exists, then is interrupted. | Incorrect order | H4 | A7 validates intent first and journals it before persistent spec effects. |
| U15 | Finish writes `shipped` before the selected strategy satisfies the route's actual shipping condition. | Incorrect order | H4 | A8 distinguishes intended route advancement from verified qualification. |
| U16 | Finish starts another attempt or repeats a route/provider action while a previous attempt left a partial effect. | Unsafe provision / repeated duration | H2, H4 | Existing dangling-intent reconciliation remains mandatory; A7–A8 strengthen step idempotency and readback. |
| U17 | Gate admits a whole-review range with a valid arbitrary ancestor as Base, despite the review requiring the actual target merge base. | Unsafe provision | H1 | A9 binds target and Base mechanically; A4 depends on that coverage foundation. |
| U18 | Finish reports remote completion from a local Outcome or successful command without provider/ref readback. | Unsafe provision | H4 | Existing strategy readback controls already prohibit this; retain and exercise them in A10. |

U2, U10, U16, and U18 include actions that current written policy already prohibits. They are included as constraints to preserve and behavioral tests to exercise, not as claims of reproduced defects.

### Additional upstream and cross-stage unsafe control actions

| ID | Controller and control action in hazardous context | Category | Hazards | Constraint / proposed action |
| --- | --- | --- | --- | --- |
| U19 | Planner begins from lint-valid but semantically unapproved formal intent, or treats unattended planning as permission to approve proposal artifacts. | Unsafe provision | H1/H5 | A11 separates format, authorization and approved snapshot. |
| U20 | Driver advances a changes-requested critique whose skipped decision collected no owner disposition; or repeats settled critique indefinitely. | Early / excessive duration | H1/H2 | A11 supplies explicit hold/settlement routing. |
| U21 | Planner changes a non-done task title while prior feedback keeps its fixed identity heading. | Unsafe provision | H2/H3 | A12 preserves identity after feedback exists. |
| U22 | Planner withholds every repair of a provably interrupted, history-free initial scaffold, or invents missing execution evidence to make it pass. | Omission / unsafe provision | H2/H3 | A13 permits only bounded initialization, never history fabrication. |
| U23 | Driver retains task authorization after a relevant upstream contract changes without classifying affected obligations. | Excessive validity / incorrect order | H1/H5/H6 | A14 records input/impact boundaries and current obligations. |
| U24 | Route producer/consumer provides entry from duplicate identities, dangling/cyclic dependencies, or mismatched metadata/body units. | Unsafe provision | H1/H3/H4 | A15 checks relational consistency, preserving semantic consistency review. |
| U25 | Context silently chooses proposal route A while the plan binds reviewed work to B. | Unsafe provision | H1/H3/H4 | A15 refuses conflicting non-null references. |
| U26 | Planner claims a unit from a stale branch-local pending marker despite a competing change claim. | Too early / unsafe provision | H2/H4/H6 | A16 makes collision/resume/transfer explicit; a name suffix is not ownership. |
| U27 | Feedback/admission accepts a later-ancestor Base that omits earlier task implementation. | Unsafe provision | H1/H3 | A17 verifies the canonical historical checkpoint, not only ancestry. |
| U28 | Driver resets an abandoned claim or removes a shared workspace without inspecting partial effects and other ownership; or leaves a withdrawn reservation permanently blocking progress. | Unsafe provision / excessive duration | H2/H4/H6 | A16 defines owner-directed cancellation/retention; delivered effects use A7 repair. |
| U29 | Driver declares ProjectReady from file existence while commands/migration remain unresolved, then keeps reusing stale standards. | Omission / early / excessive validity | H1/H5 | Retain init's no-guess/confirmation guards; A13/A14/T31. |
| U30 | Generator treats isolated: yes as a change-source certificate and commits new work directly on the actual delivery target before finish admission. | Unsafe provision / too early | H4/H6 | A16 separates named source/target role from workspace isolation; A7 repair on the surviving base remains exempt from new-generation rules. |
| U31 | Driver repeatedly selects unresolved Task 2 or withholds a new authorized prerequisite Task 4 solely because 4 has a higher numeric ID. | Omission / excessive repetition | H2 | A18 separates scheduling from identity, while A3 still forbids identical ineffective retries. |
| U32 | Planner/generator escapes the ordering blockade by renumbering/reusing identities, absorbing new work into Task 2 without scope authorization, declaring it cleared, or acting on stale reordered dispatch. | Unsafe provision | H1/H3/H5/H6 | A18 preserves task contracts/history and requires every scheduled task's ordinary code/feedback clearance. |

These include prohibited-policy and inferred-interaction scenarios, not a claim that every listed scenario was reproduced. Independent investigation found specific machine gaps and liveness ambiguities; the broad matrix also retains correctly controlled paths.

## 6. Findings, causal scenarios, and existing protections

### F1. Review disposition and review clearance are different protocols

**Source observation, high confidence:** Current finish predicates consume pass-local `Verdict` and do not interpret metadata disposition. Critique explicitly supports `changes-requested` plus `decision: applied`, while review does not. The same word therefore has different meanings at different stages. The reported older artifact is not available, so its exact schema and field cannot be identified.

**Causal scenario S1:** A requester/driver thinks corrections are settled because a metadata field says applied. Finish's process model requires a new approved pass. Both act consistently with different protocols, and a corrected change stalls (U1 → H2/H3 → L2/L3). Accepting the field unconditionally would create U2 → H1 → L1.

**Existing protection:** [`readReview`](../packages/cli/src/workbench/precondition-reviews.ts#L77-L104) selects the physical latest parsed pass; [`inspectFreshness`](../packages/cli/src/workbench/precondition-reviews.ts#L184-L242) does not waive its verdict. Do not remove either protection.

**Action:** A4 adds an independent, provenance-bearing resolution path. A3 makes diagnostics name the required next owner/action.

### F2. Replicated task state is checked too late, and the handoff has no explicit mismatch route

**Source observations, high confidence:** [`kepler-code` step 9](../skills/kepler-code/SKILL.md#process) already requires synchronized task-local status and attempt plus root metadata and row. [`inspectTasks`](../packages/cli/src/workbench/precondition-artifacts.ts#L112-L262) checks them at finish. However, [`validateMetadataRelationships`](../packages/cli/src/workbench/artifact-registry.ts#L172-L202) checks metadata paths, not equality with body rows. [`validateArtifactBody`](../packages/cli/src/workbench/artifact-body.ts#L844-L938) parses the root table without comparing the metadata copy. The orchestrator's task matrix starts from root status and contains no explicit contradictory-evidence row.

The root aggregate `status` is also independent: finish does not require `complete`, and code does not specify its reduction from task entries. A stale aggregate summary is not the same defect as a stale `tasks[N].status`; only the latter directly fails the exact task gate. The root [progress template](../bundle/templates/progress.md) has no body-table skeleton, although the planner explicitly requires generating that table. This is authoring friction, not evidence that every initialized plan lacks a ledger.

**Causal scenario S2:** A coder writes `done` in the table but leaves its metadata entry pending. Lint accepts both local formats. The driver interprets one copy, or repeats implementation from another. Finish later rejects the contradiction, when the repair also risks unnecessary review churn (U3–U5 → H1/H2/H3 → L1/L2/L3).

**Actions:** A1 moves same-file consistency into lint, adds a task-handoff diagnosis, and makes aggregate status explicitly non-authoritative. A2 requires durable task evidence. Do not allow the orchestrator to write another stage's state, and do not reduce the system to the root summary alone.

### F3. Mandatory full review repeats are policy, not an accidental CLI recursion

**Source observation, high confidence:** [`kepler-review` inspection](../skills/kepler-review/SKILL.md#whole-branch-inspection) requires broader-repository inspection on every pass. [`kepler-orchestrate` whole findings](../skills/kepler-orchestrate/SKILL.md#whole-branch-findings) requires full review after remediation. The whole-review matrix tests freshness before routing a fresh requested-change pass, so corrected material can also obscure the distinction between outstanding findings and obsolete coverage. There is no separate bounded remediation mode or unchanged-evidence stopping predicate.

**Causal scenario S3:** Full review finds a bounded defect; remediation passes task feedback; the next full review discovers a different suggestion promoted to a blocker or repeats an evidence question. Re-plan adds more material, which demands another full inspection. Task approval reuse does not terminate this branch-level cycle (U6/U7 → H2 → L2). Endless review is a user-reported incident; its exact sequence in an older version is unknown.

**Existing protections:** Fresh whole-branch approvals can be reused. Full-suite/build commands are not routine review steps; focused execution requires a concrete doubt. Those reduce repeated execution, but not the mandated breadth of review reading.

**Actions:** A3 requires an evidence-changing reason for repeated dispatch. A4 retains the original full review and adds bounded independent verification with full-review invalidation triggers.

### F4. Quality is present upstream, but its decision context is not reliably handed to the coder

**Source observations, high confidence:** [Plan quality rubric](../skills/kepler-plan/references/code-quality.md) and plan-wide Quality notes are substantial; [task feedback](../skills/kepler-code-feedback/references/code-quality.md) and [whole review](../skills/kepler-review/references/code-quality.md) also have suitable rubrics. The [implementer prompt](../skills/kepler-orchestrate/references/implementer-prompt.md) confines reading to the exact task and its cited constraints. [`kepler-code`](../skills/kepler-code/SKILL.md#code-quality-self-review) has a shorter self-review list and no local rubric reference. Planner quality notes in Overview are therefore not guaranteed to reach that reader. The inspected core skills/templates/dispatch references contain no explicit relevant-memory retrieval or applicability record. The orchestrator's prohibition on memory as lifecycle state is correct and should remain.

**Causal scenario S4:** A planner records a structural tradeoff only in Overview, or an applicable past failure remains only in harness memory. The coder executes the task without that constraint; expensive structural correction arrives at feedback/review. Alternatively, injecting all remembered guidance without applicability checks can override approved intent (U9/U10 → H1/H5 → L1/L5).

**Action:** A5 carries applicable principles and prior decisions into task-local binding context before generation. It does not duplicate every rubric, demand broad memory searches, or make a particular agent-memory tool a Kepler dependency.

### F5. The task Outcome parser silently uses the last duplicate value

**Source observation and narrow execution, high confidence:** [`recordFields`](../packages/cli/src/workbench/artifact-body.ts#L265-L283) assigns each matching field into a map. The task gate later reads only `latest.fields.Outcome`. A read-only Bun probe transpiled and executed this actual helper: `blocked` followed by `done` returned `done`; reversing the fields returned `blocked`. This establishes last-wins field parsing, not a reproduced complete finish-gate bypass.

**Causal scenario S5:** A correction appends another terminal label inside the same attempt instead of creating a new attempt. The body has contradictory results, but the gate sees the favorable final value. The skill's exactly-one rule exists only as semantic policy here (U11 → H1/H3 → L1/L3).

**Action:** A2 makes duplicate terminal fields a lint error while retaining a single historical unbulleted `Outcome: done`. Reject same-valued duplicates too; ambiguity, not only differing values, is the defect.

### F6. Missing task-progress Git provenance weakens feedback freshness

**Source observations, high confidence:** `inspectTasks` does not apply `durableArtifact` to the task log. It adds `implementation` only if `gitLatestCommit` returns a full identifier. [`validRange`](../packages/cli/src/workbench/precondition-reviews.ts#L26-L57) treats the required implementation revision as optional and skips containment when absent. Root plan/progress and feedback do receive durability checks.

**Causal scenario S6, inferred:** A task log exists as ignored/untracked evidence, or commit lookup fails while other evidence remains valid. A clean-tree check does not expose ignored files. The required revision is omitted and task feedback can escape that containment comparison (U12 → H1/H3 → L1/L3). No such live artifact was found or manufactured in this checkout.

**Action:** A2 requires a durable task log and a resolvable implementation commit, without imposing an inappropriate task-log-only commit rule on a code-plus-evidence commit.

### F7. Cleanliness does not bind verification to a repository revision

**Source observation, high confidence:** [`PreconditionService.execute`](../packages/cli/src/workbench/precondition.ts#L70-L156) checks clean state, runs the supplied shell command, then checks current evidence and final cleanliness. It does not capture and compare HEAD before/after verification. A command or concurrent actor can create/switch to another clean revision.

**Causal scenario S7, inferred:** Tests pass for revision A; before artifact inspection or final admission, a process commits or checks out revision B. B has plausible approval and a clean tree. The command exit and clean-tree predicates are true, but they do not establish that B was verified (U13 → H6 → L1/L3). This scenario was not executed against the full service.

**Action:** A6 captures a valid entry HEAD, refuses admission if it changes, and carries the verified identity into finish's mutation boundary. This reduces a race; it is not a repository-wide lock or proof against every external actor after the command returns.

### F8. Free-text evidence classification and unchanged dispatches can cause correction loops

**Source observation, high confidence:** [`Task resume matrix`](../skills/kepler-orchestrate/SKILL.md#task-resume-matrix) recognizes an evidence blocker only when a Blocking finding contains the exact phrase `cannot verify from diff`. Suggestions do not trigger it. Whole-review findings have no analogous evidence-only adjudication route. For an already blocked task, the driver correctly refuses identical retries when nothing changed, but there is no general equivalent for repeated feedback/whole-review dispatches.

**Causal scenario S8, inferred:** A reviewer writes “insufficient evidence to establish consumer compatibility.” The driver interprets this as a code defect, causes an unnecessary code change, then retries broad review. Or evidence-only feedback repeats without anyone adding the needed located evidence (U7/U8 → H2/H5 → L2/L5).

**Action:** A3 gives findings an explicit kind and tracks the evidence-changing purpose of retries. Existing canonical wording remains the legacy fallback; uncertainty does not become approval.

### F9. Spec synchronization precedes the durable recovery record

**Source observations, high confidence:** [Finish process](../skills/kepler-finish-work/SKILL.md#process) step 4 commits canonical specs, step 5 resolves intent, and step 6 commits Attempt. [Resume](../skills/kepler-finish-work/SKILL.md#resume-and-recovery) reconciles an unmatched Attempt, not an earlier spec-only commit. [`gitLatestMaterialCommit`](../packages/cli/src/workbench/precondition-git.ts#L110-L132) excludes finish/progress/review evidence, but not specs or route/map changes.

**Causal scenario S9, inferred:** Spec synchronization commits, then the agent stops before Attempt. Resume has no durable admitted intent to reconcile; a fresh gate treats that new material as outside the old review Head. Recovering a finish-owned change can therefore require unnecessary branch review or manual waiver. A blocked later attempt can face similar material-staleness on the next admission (U14/U16 → H2/H4 → L2/L3/L4).

**Action:** A7 validates inputs/strategy first, commits an intent record before persistent spec effects, and records observed synchronization in Outcome. A later new attempt still revalidates current evidence; do not globally exclude specs/routes from material freshness.

### F10. Route `shipped` is written before strategy readback

**Source observation, high confidence:** Finish step 7 commits route advancement; step 9 executes the strategy; step 10 reads actual state. Retry assumes the named unit's transition starts at `in-progress`, although a previous partial attempt may already have changed it.

**Causal scenario S10, conditional inference:** If a route's shipping condition requires an observed merge or request, a merge/push/provider failure leaves `shipped` despite that condition not being satisfied. Other readers can misinterpret it even though finish records a blocked outcome (U15/U16 → H4 → L3/L4). A route that explicitly defines a no-op or request submission as shipment has different conditions; this analysis does not assume shipment universally means merged.

**Existing protection:** The planner checks both `shipped` and base reachability for route dependencies. That helps dependency scheduling but does not make the premature status truthful to every consumer.

**Action:** A8 evaluates the route's Shipping rules and observable completion outcome, applies advancement after the qualifying effect, and reuses only exact verified effects on resume.

### F11. Finish mechanically accepts a weaker branch scope than review promises

**Source observation, high confidence:** `kepler-review` requires Base to equal the actual merge base against the target/default branch. `validRange` checks only identifier validity and ancestry. Finish does not resolve that target. The same distinction is already disclosed in [CLI enforcement versus skill policy](./change-state-machine.md#cli-enforcement-versus-skill-and-user-policy).

**Causal scenario S11, inferred:** An approved pass records a recent arbitrary ancestor as Base, omitting earlier branch changes. Its Head contains material and all ancestry checks succeed. Skill compliance would reject it, but the mechanical gate cannot establish the full inspection scope (U17 → H1 → L1).

**Action:** A9 records/resolves the review target and validates the exact merge base before admitting full or remediation clearance. A4 must not build a cheaper review mode on an unproven full-review foundation.

### F12. Formal approval lacks one durable cross-stage representation

**Source observation, high confidence:** Propose requires approval before handoff, while planning reads present upstream files without an explicit approval check. [Status enums](../packages/cli/src/workbench/artifact-types.ts#L289-L319) allow approved proposal but only draft design/deltas; template decision fields do not authenticate approval. [Propose approval](../skills/kepler-propose/SKILL.md#L205-L223) and [planning confirmation](../skills/kepler-plan/SKILL.md#L177-L203) are real procedural protections. Finish separately checks approved consistent inputs.

**S12 (inference):** A resumed/out-of-order rich planning call consumes draft or skipped intent as authoritative because lint passed. This is unproven authorization, not a demonstrated normal-path gate bypass. H1/H5; U19; A11; T18. Git can prove the approved bytes, not who authorized them.

### F13. Unattended unresolved critique has an ambiguous handoff

**Source observation, moderate confidence:** [Critique](../skills/kepler-critique/SKILL.md#L88-L101) uses skipped when no decision is collected; its [handoff](../skills/kepler-critique/SKILL.md#L188-L202) says follow the verdict and then chooses plan/code from plan presence. Accepted/applied/rejected dispositions are defined; changes-requested/skipped lacks an explicit hold/owner action. [Current assertions](../tests/skills/pipeline-identity.test.ts#L38-L49) cover settlement, not the full matrix.

**S13 (inference):** An unattended driver interprets next-stage naming as authorization despite unresolved findings, or requests identical critiques indefinitely. The intended reading may already be a hold. Clarify it without requiring re-critique after legitimate applied/rejected settlement. H1/H2; U20; A11; T19.

### F14. A permitted non-done rename can strand existing feedback

**Source observation, high confidence:** [Re-plan](../skills/kepler-plan/SKILL.md#L256-L291) synchronizes a renamed non-done task's plan/root/task-progress heading while preserving histories. [Feedback admission](../packages/cli/src/workbench/precondition-reviews.ts#L106-L145) requires the current exact title; the feedback owner preserves its identity heading. Done definitions are already frozen.

**S14 (inference):** Rename a blocked task with prior feedback; its unchanged feedback H1 no longer matches, so advancement fails closed. This is liveness/ownership ambiguity. The [fully synchronized renamed fixture](../tests/workbench/precondition.test.ts#L486-L497) passes; it does not specify a permissible migration of prior feedback history. H2/H3; U21; A12; T20.

### F15. Interrupted initial planning has no bounded initialization repair

**Source observation, high confidence:** Planning [writes the complete scaffold before lint](../skills/kepler-plan/SKILL.md#L204-L239), but existing-plan/re-plan requires missing task evidence as input. [Context](../packages/cli/src/workbench/context.ts#L718-L737) classifies a missing active task log as unsupported. Lint does not supply absent files; finish correctly refuses them.

**S15 (inference):** Termination after plan/root creation but before one pending log leaves an initial scaffold that cannot meet the stated re-plan input gate. Do not conflate this with the core's existing transactional legacy-migration recovery. A safe initializer needs proof that no execution/feedback/checkpoint/partial implementation exists and that the breakdown is authorized. H2/H3; U22/U29; A13; T21/T31.

### F16. Relevant upstream revision has no explicit task-obligation invalidation map

**Source observation, high confidence:** [Task freshness](../packages/cli/src/workbench/precondition-reviews.ts#L126-L145) binds implementation revision, not requirements/design/standards. Critique allows continuing a still-valid plan; C7 and finish require fresh whole review after intent revision. Material freshness is a strong backstop and includes upstream artifacts.

**S16 (inference):** A requirement changes after Task 1 approval; old task feedback remains implementation-fresh while the driver must infer whether its acceptance is still applicable. Unrelated upstream changes need not repeat every task review. Preserve frozen done tasks and append new obligations rather than retroactively changing their meaning. No silent ordinary finish bypass is claimed: whole-review freshness and semantic consistency still apply. H1/H5/H6; U23; A14; T22.

### F17. Route lint validates shapes, not identity/dependency/body coherence

**Source observation and narrow behavior probe, high confidence:** [Route schema](../packages/cli/src/workbench/artifact-schemas.ts#L62-L78) validates positive IDs and lists; [relationships](../packages/cli/src/workbench/artifact-registry.ts#L172-L214) handle only progress. The actual exported validateArtifact returned valid with no diagnostics for duplicate IDs, unknown/self/cyclic dependencies, and metadata order differing from a valid numbered body, plus a valid control. This exercised the reader, not planner/finish advancement.

**S17 (inference):** A malformed route gives the first-pending selector ambiguous identity, impossible prerequisites, or the wrong body constraints. [Wayfinder's semantic consistency gate](../skills/kepler-wayfinder/SKILL.md#L78-L88) already prohibits such output; [entry dependency checks](../skills/kepler-plan/SKILL.md#L108-L115) also contain it. Mechanical coherence closes drift/resume gaps without replacing either. H1/H3/H4; U24; A15; T24.

### F18. Context hides conflicting proposal/plan route references

**Source observation, high confidence:** [Context routeUnit](../packages/cli/src/workbench/context.ts#L481-L509) returns proposal's first non-null reference before inspecting plan. Both can independently satisfy route-reference syntax. Planning says its route_unit supplies finish provenance.

**S18 (inference):** Proposal binds unit A, revised plan binds B, context silently reports A. Finish may faithfully mutate the wrong named unit. Careful semantic rereading can catch this, but the machine-facing context suppresses the conflict. Matching references and a null/legacy proposal with a valid plan must remain supported. H1/H3/H4; U25; A15; T25.

### F19. Isolation and branch-local claims do not prove unit or target ownership

**Source observation, high confidence; collision inference moderate:** [Planning](../skills/kepler-plan/SKILL.md#L108-L153) reads pending state in its worktree and commits the claim on its branch. A same-name collision asks resume/suffix; unit metadata has no owning change. [Wayfinder](../skills/kepler-wayfinder/SKILL.md#L98-L106) explicitly describes its ticket claims as intent, not collision prevention; do not falsely call either a lease.

**S19 (inference):** Two controllers/clones can plan the same pending unit before branch-local claims become mutually visible. Git may later expose conflicts but not prevent wasted work or identical nonconflicting status writes. Withdrawal after claiming has no declared route-unit release/transfer protocol. Isolation's [linked/non-default check](../packages/cli/src/workbench/isolate.ts#L91-L153) also does not prove sole change ownership or a source branch distinct from the actual delivery target. A non-default map target (or linked default-branch checkout) can report isolated while new change commits land directly on that target before finish admission. This is an early target-mutation inference, not a reproduced remote delivery. The [ordinary whole-change packager](../packages/cli/src/workbench/diff.ts#L843-L890) rejects Base equal Head, which contains a default-target empty-review path but cannot undo earlier target commits. Cleanup and generation therefore need role/ownership checks distinct from filesystem isolation. No concurrent delivery or deletion was reproduced. H2/H4/H6; U26/U28/U30; A16; T26/T27/T33/T34.

### F20. Task feedback Base is not mechanically bound to its historical checkpoint

**Source observation, high confidence:** [Checkpoint recording](../packages/cli/src/workbench/diff.ts#L533-L644) deliberately ignores .base, preserves existing files and checks resolution/ancestry; [packaging](../packages/cli/src/workbench/diff.ts#L686-L753) uses that local value. [Task admission](../packages/cli/src/workbench/precondition-reviews.ts#L26-L57) checks generic ancestry and implementation containment, not equality with the original task checkpoint.

**S20 (inference):** A valid later ancestor in an ignored/cross-worktree checkpoint can crop earlier task work and still satisfy the generic feedback range predicate. The [code recovery rule](../skills/kepler-code/SKILL.md#L117-L130) already requires consensus of valid feedback Bases and the first parent of the earliest first-attempt commit; compliant skill execution prevents it. Whole review remains a backstop. Share that canonical derivation mechanically; do not start tracking .base or invent another checkpoint database. H1/H3; U27; A17; T28/T29.

### F21. Append-only numeric identity is also used as an unchangeable execution queue

**Reported observation:** Unforeseen prerequisite work cannot run before an earlier unresolved task; the workaround becomes deadlock or a scope change to that original task.

**Source observation, high confidence:** [Re-plan](../skills/kepler-plan/SKILL.md#L249-L291) recognizes missing dependencies, freezes done definitions, forbids renumbering/reuse, and appends new tasks. [Ledger lint](../packages/cli/src/workbench/artifact-body.ts#L686-L842) requires plan IDs to be contiguous in numeric physical order and root rows to increase. [Selection](../skills/kepler-orchestrate/SKILL.md#L137-L177) uses the earliest unresolved task; [checkpoint advancement](../skills/kepler-orchestrate/SKILL.md#L219-L235) additionally requires the immediately preceding task's durable approval. The [plan template](../bundle/templates/plan.md#L75-L105) already distinguishes stable reference numbers, logical Depends on, and serial execution, but readTaskLedger returns empty task fields rather than consuming those dependencies.

**Narrow current-reader probe:** validateArtifact accepted an in-memory plan with physical IDs 1,2,3,4 and Task 2 depending on Task 4; its parsed task fields were all empty. Moving the same headings to 1,4,2,3 failed with non-monotonic-record. The first fixture path was rejected until corrected to the required canonical string; no files were created. This proves a format/reader boundary, not execution of an orchestrator or a complete bypass.

**S21 (source-supported mechanism; historical artifact unavailable):** Task 1 is gated; Task 2 needs an unanticipated engine/repair outside its Files and Acceptance; Task 3 remains pending. Planner correctly appends Task 4 for that prerequisite. Numeric selection stays at 2, but 2 cannot complete until 4 runs. The imposed queue creates the wait cycle even if the actual prerequisite graph (1 → 4 → 2 → 3) is acyclic. Moving headings fails lint; renumbering breaks paths/provenance; embedding Task 4 in Task 2 loses the intended task boundary. Repeating an unchanged blocked dispatch is already prohibited, so the normal result may be a safe halt requiring manual intervention rather than an infinite implemented loop.

**Existing protections and limits:** Code correctly blocks out-of-scope work. [Exact-task code dispatch](../skills/kepler-code/SKILL.md#L99-L115) itself accepts one active positive ID, and finish inspects completion/feedback for all active tasks rather than proving historical chronological order. Thus the restriction is the documented driver/ledger composition, not a claim that every CLI operation mechanically forbids a direct Task 4 invocation. Manual out-of-order invocation has no sanctioned durable resume protocol today. A18 supplies it without a parallel scheduler or weakening all-task clearance. H1/H2/H3/H5; U31/U32; A18; T35–T39.

## 7. Prioritized implementation sequence

The actions below remain unimplemented remediation proposals; the requester-approved A4/A11/A16 policy decisions are recorded in this section. Snippets identify concrete edit locations and intended content; they have not been applied or compiled as an integrated patch. A snippet introducing a field/helper requires the accompanying reader, caller, template, and test changes listed with it.

- **P1:** Establish trustworthy handoffs and prevent invalid evidence or unjournaled effects before the next workflow changes.
- **P2:** Reduce review cost and improve decision quality after the safety foundations exist.

| Action | Priority / decisive reason | Findings | Dependencies | Responsible stage / code owner |
| --- | --- | --- | --- | --- |
| A1. Detect task-state disagreement at its writer boundary | P1: repeated stale-state incidents; finish-only detection is too late. | F2 | None | Workbench artifact validation; code/plan writers; orchestration dispatch. |
| A2. Require unambiguous durable task evidence | P1: terminal field ambiguity and missing provenance weaken a gate. | F5, F6 | A1 for shared handoff diagnostics | Workbench parsers/precondition; coder. |
| A6. Bind verification to HEAD | P1: a clean revision is not necessarily the tested revision. | F7 | None | Precondition service; finish consumer. |
| A7. Journal before specs and define linked post-delivery repair | P1: a real commit currently precedes recovery intent; delivered changes need a non-repeating closure path. | F9, F10 | A6, A9; A2's unambiguous terminal-field convention | Finish/precondition skill, schema, template, and contract. |
| A8. Make route advancement truthful and resumable | P1 when route-backed: premature shipment can mislead other changes. | F10 | A7 | Finish skill; route consumers. |
| A9. Prove full-review target and scope mechanically | P1: cheaper follow-up review needs a trustworthy baseline. | F11 | A6 | Review parser/precondition CLI; review/finish skills. |
| A3. Classify findings and stop unchanged dispatches | P2: removes avoidable correction/review churn without weakening approval. | F1, F3, F8 | A1–A2 | Orchestrator and reviewer issue protocol. |
| A5. Carry quality and prior decisions before generation | P2: prevents defects that are currently caught after code exists. | F4 | None; integrate with A1 handoff | Planner, coder, dispatch prompt. |
| A4. Add bounded, independent remediation clearance | P2: addresses the first and third incidents while retaining integration coverage. | F1, F3 | A1–A3, A9 | Whole review/parser/precondition/driver, coordinated release. |
| A11. Define durable intent approval and unresolved critique routing | P1 semantic boundary: format validity must not become authorization. | F12/F13 | Requester-approved protocol below; A14 for revision impact | Propose/critique/plan/finish; enums/templates; semantic preflight. |
| A12. Preserve task title identity once feedback exists | P2 liveness: avoids unowned history repair. | F14 | A1 | Planner and re-plan contracts. |
| A13. Resume only provably initial, history-free scaffolds | P2 recovery: no unsafe completion is admitted today. | F15 | A11 for authorized breakdown; A1 | Planner/context/scaffold contracts. |
| A14. Bind current inputs to explicit obligation impact | P1 when intent changes: old evidence must not acquire new meaning. | F16/F12 | A11; preserve A4 fallback | Planner/driver/reviewer input contracts. |
| A15. Validate route relationships and reject conflicting bindings | P1 when route-backed: current shapes can conceal the wrong unit or impossible graph. | F17/F18 | None; consumed by A7/A8/A16 | Registry/context; route producer/consumers. |
| A16. Make unit ownership, branch role, withdrawal and retention explicit | P1 source/target role before generation/cleanup; P2 claim/cancellation coordination | F19 | A15/A9; A7 for delivered effects | Propose/plan/finish; owner-directed claim protocol. |
| A17. Verify one canonical historical task Base | P1 gate integrity: ancestry alone can approve cropped task coverage. | F20 | A2 for durable progress | Shared checkpoint helper; diff/precondition/driver. |
| A18. Decouple immutable task IDs from serial execution order | P1 liveness/scope: unanticipated prerequisites need a safe path before the blocked task. | F21 | A1/A2 for evidence; A11/A14 for authorized impact; A17 for historical Base | Plan/template/schema/context; driver/code/feedback; semantic preflight. |
| A10. Exercise workflow scenarios, not only wording | P1 regression work within each action; final adoption gate after all selected actions | All | Each action adds its own tests; final scenarios follow integration. | Repository tests and controlled agent evaluation. |

Do not implement all of this as one task. Keep pure parser changes, admission changes, and skill-protocol changes separately verifiable. The requester approved the A4/A11/A16 policy boundaries below. Validate implementation grammar, classification and invalidation details within those boundaries; request confirmation only for a material public-contract change or an unresolved user-owned choice.

### Requester-approved protocol decisions

**Status:** Approved for the implementation handoff. **Source:** The requester explicitly accepted the recommended policies for all three actions: “agree with the suggestion for the three, record this decision on the report.” This records policy approval, not completed implementation, approval of a live change's artifacts, a waived gate, or authority to deploy/publish.

- **A4, bounded independent remediation clearance:** The first whole-branch review remains full. Corrections may receive reviewer-owned `approved-remediation` clearance against a valid immutable full-review baseline, with every outstanding blocker independently resolved and affected integration behavior checked. Invalid provenance, changed intent/target/Base or unbounded impact requires full review. Bare `decision: applied` never grants clearance. Preserve all ordinary task code/feedback gates and the report's legacy-baseline restrictions.
- **A11, explicit revision-bound intent approval:** Formal proposal/design/requirement inputs need explicit requester approval tied to their committed revision. Changed inputs invalidate the corresponding approval until reconciled. Tactical work may omit formal propose artifacts; authorized unattended agents may self-review a task breakdown but cannot invent requester approval. Ambiguous legacy draft/default-accepted inputs need explicit confirmation, never automatic promotion. Preserve the documented critique-settlement rules.
- **A16, serialized ownership and conservative retention:** One designated user/controller coordinates ownership, claims and delivery, with one owner per unit and one writer per change/worktree. Concurrent cross-clone claims/shipping are unsupported; implementing them requires a separate future authority/protocol decision. Local scans do not establish distributed exclusivity. Do not introduce distributed locking or an external coordination service. Release/transfer requires explicit owner authorization and inspection of partial work and actual effects, preserving history and verified shipment. Retain shared, dirty or ambiguously owned workspaces; clean up only provably owned, safely preserved workspaces under declared finish intent. Keep the existing source/target-role guard and A7 repair boundaries.

An implementation agent may choose internal parser/type/test details within these contracts. Bring proposed public-contract deviations or external-service requirements back to the requester; do not ask to reconfirm these settled policy defaults.

### A1. Detect and repair task-state disagreement before dispatch

**Targets:** `packages/cli/src/workbench/artifact-body.ts` (`validateArtifactBody` and a pure ledger comparator); `precondition-artifacts.ts` (`inspectTasks`); `bundle/templates/progress.md`; `skills/kepler-code/SKILL.md` (steps 5/9/10); `skills/kepler-orchestrate/SKILL.md` (state load, code handoff, task matrix); implementer prompt; artifact/lint/orchestrator contract tests.

**Steps:**

1. Add a failing lint case where the root table is done but its metadata entry is pending; also cover title/order/id/link mismatch and an empty active ledger.
2. Extract the already-existing `inspectTasks` metadata/table comparison into one pure exported comparator in `artifact-body.ts`. Invoke it during root body validation and reuse it in finish; do not maintain two predicates.
3. Add a contradictory-evidence diagnosis before applying the task matrix. After code returns, inspect the committed root metadata/row and selected task status/latest outcome, not only a concise agent answer.
4. Repair a proven recording omission through the task's coder. Do not ask feedback to change status, and do not ask the driver to manufacture a done attempt. If completion evidence is insufficient, resume normal verification rather than performing a bookkeeping-only repair.
5. Document/normalize root aggregate `status` as an implementation summary only. `complete` means all active implementation rows are done, not that review/finish passed; it must never override per-task evidence. Preserve sibling entries byte-for-byte.

**Edit snippet:** Add this helper near the root-ledger parser, replacing the duplicated comparison rather than adding another authority:

```ts
export const progressLedgerMatches = (
  metadata: unknown,
  records: readonly ArtifactWorkflowRecord[],
): boolean => {
  if (!Array.isArray(metadata) || metadata.length !== records.length) return false;
  return metadata.every((value, index) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const entry = value as Record<string, unknown>;
    const record = records[index];
    return (
      entry.id === record?.number &&
      entry.title === record?.title &&
      entry.status === record?.fields.Status &&
      entry.progress === `tasks/task-${String(entry.id)}/progress.md` &&
      `[details](${entry.progress})` === record?.fields.Progress
    );
  });
};
```

In `validateArtifactBody`, immediately after collecting `workflowRecords`, use that helper for `kind === "progress"`; emit a normal `invalid-record` diagnostic with `progress metadata ledger does not match`. Keep schema checking and the accepted body parser as the format authorities. In `inspectTasks`, remove its copied metadata loop and reuse this helper or the earlier valid-contract result.

Add a concrete table skeleton after the progress template's title:

```markdown
| Task | Status | Progress |
| --- | --- | --- |
| Task N: <escaped display title> | pending | [details](tasks/task-N/progress.md) |
```

Add before the orchestrator's task matrix:

```markdown
Require root metadata and its body row to match exactly. Interpret task-local evidence
by phase: root in-progress with an initialized pending log, or a prior finalized local
attempt during correction, is a supported boundary rather than a status contradiction.
For a claimed done/blocked handoff, require matching root copies, local status, and
latest terminal outcome. Diagnose other disagreement with the owning coder before
selection. A proven recording omission may receive an owner bookkeeping repair;
incomplete or unverifiable work resumes verification. Never invent a done attempt.
```

**Acceptance:** Lint rejects same-file metadata/table mismatch before code/feedback; it accepts the supported root in-progress/task-log pending boundary and correction with a prior finalized local log. Handoff rejects contradictory done claims, but does not require all other tasks to be done. A repair touches only the selected evidence and permitted aggregate summary, preserves siblings/history, and forces fresh task feedback if the task-progress revision changes.

**Compatibility/rollout:** Stricter lint will expose formerly lint-valid contradictions. Return exact owner-directed diagnostics; do not mass-normalize existing files. Preserve historical attempts and the single-root-ledger layout. Update tests that currently rely on a metadata/body mismatch being locally valid. Do not require root aggregate `complete` as a new finish gate.

### A2. Reject duplicate terminal outcomes and missing implementation provenance

**Targets:** `artifact-body.ts` (`readWorkflow`); `precondition-artifacts.ts` (`inspectTasks`); artifact-contract/precondition tests; task-handoff instructions.

**Steps:**

1. Add failing latest-attempt cases for `blocked` then `done`, reversed values, repeated `done`, and mixed bulleted/unbulleted Outcome forms.
2. Check the physical latest task attempt's raw terminal-field occurrences before exposing its result. It must contain exactly one supported terminal Outcome with value `done` or `blocked`. A map cannot establish uniqueness.
3. Require the linked task-progress content to be tracked/committed at HEAD, using the existing `durableArtifact`; then require its implementation revision lookup to return a full commit. Missing lookup is a failed gate, not an omitted freshness argument.
4. Keep code-plus-task-evidence commits valid. Only feedback/review commits must be artifact-only.

**Edit snippet:** In `readWorkflow`, after calculating the record's `start` and `end` and before `records.push`, add latest-task-attempt validation:

```ts
if (
  artifact.metadata.artifact === "task-progress" &&
  matchingKind === "attempt" &&
  !candidates.some((candidate) =>
    candidate.line > heading.line && recordHeadingMatches("attempt", candidate.text),
  )
) {
  const outcomes = lines.slice(start + 1, end).flatMap((line) => {
    const match = /^(?:- Outcome:[ \t]*(.*)|Outcome:[ \t]+(.*))$/.exec(line);
    return match === null ? [] : [(match[1] ?? match[2] ?? "").trim()];
  });
  if (outcomes.length !== 1 || !["done", "blocked"].includes(outcomes[0] ?? ""))
    diagnostics.push(bodyDiagnostic(
      artifact,
      "invalid-record",
      "Latest task attempt must declare exactly one done or blocked Outcome",
      heading.line,
    ));
}
```

In `inspectTasks`, before consuming `taskRead`, add:

```ts
if (!(await durableArtifact(runtime, root, taskPath)))
  problems.push(`Task ${task} progress is not tracked and committed exactly at HEAD`);
```

After resolving `implementation`, add:

```ts
if (!fullCommit(implementation))
  problems.push(`Task ${task} implementation commit is missing or unverifiable`);
```

Retain the gate failure even if no `implementation` property can be populated. Do not coerce a missing SHA into current HEAD.

**Acceptance:** Ambiguous latest Outcomes close lint/admission; one legacy unbulleted `Outcome: done` still passes. An initialized pending log without attempts remains valid. An ignored/untracked task log or failed revision lookup fails task admission even with a clean tree and approved feedback. A proper implementation-plus-evidence commit passes and its revision must be contained by feedback Head.

**Compatibility/rollout:** Initially enforce uniqueness on the physical latest attempt; do not reinterpret historical attempt text or rewrite old records. Older supported records retain provenance. Diagnose historical ambiguity separately if later needed. Existing runtime-port test fixtures must supply a real implementation revision rather than accidentally depending on optional containment.

### A3. Classify outstanding findings before freshness routing and require useful retries

**Targets:** `skills/kepler-orchestrate/SKILL.md` (both matrices, bounded adjudication, whole findings); reviewer/feedback instructions and templates; dispatch references; `review-passes.ts` finding parsing only if typed fields become mechanically consumed; contract/scenario tests.

**Steps:**

1. Separate range validity, current material coverage, and unresolved findings. A changes-requested review can be historical coverage with still-relevant obligations; staleness must not erase its finding set. It cannot authorize finish.
2. Add stable finding identity and kind to newly authored Blocking findings. Keep the existing location-first Markdown grammar; do not prefix it with another bracket group that breaks parsing.
3. Extend evidence-only adjudication to branch findings. Located evidence is independently checked by the reviewer; a genuine defect still returns to code/re-plan, and an approved-intent defect still returns upstream.
4. Before any repeated dispatch, name the changed code, located evidence, external condition, or corrected protocol input that could change the result. If none changed, stop automated retries and ask the owning stage/requester to adjudicate the concrete issue. Never stop merely because a legitimate correction still needs review.

**Edit snippets:** Replace the whole-review matrix with explicit validity-first routing, integrating A4 only after its readers ship:

```markdown
| Review evidence | Action |
| --- | --- |
| absent | Obtain a full whole-branch review. |
| lint-invalid, undurable, or off-branch | Diagnose the exact invalid evidence with its owner; no clearance or identical retry. |
| valid latest changes-requested | Preserve/classify all outstanding findings before choosing remediation scope, even if material coverage is now stale. |
| approved, valid range, material stale | Require new coverage; choose full review unless A4's bounded follow-up conditions hold. |
| valid skipped | Obtain a non-skipped review with a stated review purpose. |
| valid cleared and material fresh | Hand off to finish. |
```

Example compatible finding text for future writers:

```markdown
- [packages/cli/src/workbench/precondition-reviews.ts:26] id: pass-1-blocking-1; kind: evidence-gap; consumer compatibility is unverified. Supply located evidence or a focused check (violates: review coverage).
```

Add to both feedback and whole-review dispatch instructions:

```markdown
Classify each Blocking finding as code-defect, evidence-gap, or intent-defect.
A kind is a routing aid, not a verdict or waiver. Preserve each finding's identity
when carrying it forward. For a legacy untyped task finding, retain the canonical
cannot verify from diff rule; adjudicate ambiguous kind rather than inventing code.
Before repeating this pass, identify the changed input that can resolve its concern.
```

**Acceptance:** Reworded evidence questions do not automatically trigger code changes. Same range and same unresolved obligations with no new evidence stop repeated dispatch; different located evidence on the same range permits the existing evidence-only review path. A new confirmed code defect still obtains verification and independent approval. Material-stale requested changes are classified without accepting stale authorization.

**Compatibility/rollout:** New finding kinds are additive text after the existing location. Untyped finding IDs can be synthesized as `pass-N-blocking-M` from their first physical occurrence without editing historical bodies; carried findings retain that identity. An unclear legacy finding requires adjudication. No general resume database or new pipeline stage is needed; review histories already retain the relevant durable evidence. A human-authored review without a stated retry reason is not silently upgraded to approval.

### A4. Add reviewer-owned bounded remediation clearance

**Targets:** `artifact-types.ts`; `review-passes.ts` (field/shape parsing and latest evidence); `artifact-body.ts` review projection; `precondition-reviews.ts`; review template; `kepler-review` inputs, inspection, verdicts, handoff, and diagram; whole-review dispatch prompt; orchestrator matrix; finish verdict wording; state-machine/skills docs; parser/precondition/skill tests.

**Decision (requester-approved):** Use an explicit remediation-clearance verdict rather than accepting `decision: applied`. Keep full review as the default/fallback. A cleared remediation pass certifies the combination of retained full-review coverage and independently checked corrections; it does not pretend that the reviewer reread the entire branch.

**Steps:**

1. Give whole review two invocation modes: full, and bounded remediation against a named full-review baseline. The first branch review remains full. Remediation mode always receives the complete range/artifact context, but inspects the correction delta, every outstanding blocker, and affected consumers/invariants; it does not reopen unrelated preferences.
2. Introduce `approved-remediation` only for root whole review. Task feedback retains its existing verdict vocabulary. This deliberate new verdict makes old readers reject the new clearance rather than silently interpreting shorter inspection as an ordinary full pass.
3. Persist pass-local scope and provenance: full Base/Head, target, baseline pass number and Head, and resolution mapping for all original and subsequently introduced blockers. Keep the historical full pass immutable.
4. Validate the baseline's durable semantic-evidence provenance, exact target/merge base, ancestry, reviewed intent, and correction boundaries. Bind a modern full baseline to its committed artifact revision and verify its unchanged pass text. A structural-only legacy prefix cannot be a baseline. For a legacy-global history, obtain a new full explicit pass once before using bounded clearance: the atomic transition removes globals and makes the old prefix structural. Existing supported legacy approvals remain usable through the ordinary full-clearance path; never fabricate a remediation baseline from their removed global fields.
5. Require all active remediation tasks to pass normal code/feedback gates. Independently validate resolution of every outstanding blocking finding and integration effects of the delta. Approve only when the resulting composite branch coverage is complete.
6. Full review is mandatory if the baseline is missing/invalid, reviewed commits were amended, Base/target changed, approved requirements/design changed, a material path is unclassified, or the correction's integration impact cannot be bounded. A change to plan.md is permitted only as the exact numbered-remediation amendment; preserve original task intent and definitions. After A18's coordinated rollout, its exact authorized execution-only amendment may accompany that remediation without discarding the full baseline. Changed requirements/definitions or unbounded effects still require the full fallback.
7. On a failed remediation check, append a changes-requested scoped pass with remaining/new blocker identities; do not edit the original review. Subsequent scoped attempts stay linked to the same full baseline, inspect the cumulative correction delta, and discharge every outstanding blocker from the suffix. Do not chain approvals through arbitrary older approvals.

**Edit snippets:** Extend the root-review evidence protocol, not merely its status metadata. Proposed modern remediation pass:

```markdown
## Pass 2 — 2026-10-09

Base: <full actual target merge-base SHA>
Head: <full current remediation HEAD SHA>
Verdict: approved-remediation
Scope: remediation
Parent pass: 1
Parent commit: <full artifact-only commit containing the modern full baseline>
Delta base: <full Head from the retained full review>
Target: refs/remotes/origin/main
Resolutions: [{"finding":"pass-1-blocking-1","evidence":["<located correction or full commit reference>"],"verification":"<independent check and observed result>"}]

### Blocking

- None.

### Suggestions

- [review.md:Pass 1] Resolved B1 by the correction commit and focused compatibility check; cumulative correction delta preserves the retained integration constraints.
```

`Parent pass` identifies the modern full baseline, not an arbitrary last pass. `Parent commit` must resolve to an ancestor artifact-only review commit whose blob contains that full pass with actual provenance; validate the current retained pass against that immutable text. A legacy-global pass that became structural is not eligible.

`Resolutions` is one pass-local, single-line JSON array of objects with exactly `finding`, nonempty `evidence[]`, and nonempty `verification` fields. IDs use immutable first-occurrence `pass-N-blocking-M` identity; carried findings retain that identity. Its unique ID set must equal every outstanding blocker from the full baseline and scoped suffix. Reject duplicate, missing, unknown, or invented resolution IDs and partial provenance. The reviewer checks evidence/observed results; structural JSON validity cannot prove the correction. Suggestions may explain the mapping but do not replace it. Validate this grammar in A4's design and preserve the current child-section restriction; no fourth child heading is needed.

Proposed type extension in `artifact-types.ts`:

```ts
export type ReviewPassVerdict =
  | "approved"
  | "approved-remediation"
  | "changes-requested"
  | "skipped";

export interface ReviewFindingResolution {
  readonly finding: string;
  readonly evidence: readonly string[];
  readonly verification: string;
}

export type ReviewClearanceProvenance =
  | { readonly scope: "full"; readonly target: string }
  | {
      readonly scope: "remediation";
      readonly target: string;
      readonly parentPass: number;
      readonly parentCommit: string;
      readonly deltaBase: string;
      readonly resolutions: readonly ReviewFindingResolution[];
    };
```

This is a protocol/type sketch, not a safe standalone patch: attach parsed provenance and parsed resolution identities to `ReviewPassEvidence`, constrain the new verdict to root review, and introduce one shared clearance predicate. Update `FieldOccurrence`, `fieldPattern`, `passFields`, `completePassFields`, `parsePass`, and legacy/explicit-suffix classification together. Preserve exact-one core Base/Head/Verdict fields, their existing ordering, physical-last authority, and strict global/suffix separation. Do not widen `verdicts` alone.

Replace finish/driver prose that requires a literal approved root verdict with:

```markdown
Require current valid whole-branch clearance: either a full approved pass, or an
approved-remediation pass whose retained baseline, correction coverage, outstanding
finding resolutions, target/range, and durability all validate. Metadata disposition
alone never clears review. A waiver changes only material ancestry, not clearance.
```

**Acceptance:** A full requested-change review followed by one bounded verified correction can finish without another full inspection. Bare applied metadata, unresolved blocker, forged/missing parent, structural legacy parent, off-branch delta, incomplete finding map, unrelated material commit, target/Base change, and modified intent all fail bounded clearance. A failed latest scoped pass cannot revive the baseline's older approval. Repeated bounded failures obey A3. Full-review count remains one for the bounded scenario; it increases when an explicit invalidation condition requires it.

**Compatibility/rollout:** No auto-conversion of `changes-requested + applied` to cleared. Install matching readers and stage resources before enabling scoped approvals; old CLIs reject `approved-remediation`. Existing ordinary approved and supported legacy-global reviews retain their existing meaning. A historical schema-invalid `decision: applied` review needs an explicit owner-authorized metadata repair/migration before modern parsing, not a verdict bypass. Preserve its historical review text and do not invent prior independent resolution.

**Strongest objection and mitigation:** Bounded review can miss interactions outside the original findings. Require the reviewer to trace changed contracts and classify every material correction path; fall back to full review when that argument cannot be made. Do not infer safety from a small diff size or a coder's claim that fixes are local.

### A5. Supply quality and prior decisions before code generation

**Targets:** `kepler-plan` context gathering/task specification; `bundle/templates/plan.md` task blocks; `kepler-code` inputs, pre-generation check, self-review and handoff; implementer prompt; corresponding skill-contract/scenario checks. Reuse current plan/task-feedback/whole-review rubrics at their appropriate scopes.

**Steps:**

1. During planning, retrieve relevant project memory when the harness exposes it, and always consult current specs/approved design/standards. Search for the change's decisions and failure modes, not all user memory.
2. Test each recalled lesson against current source and intent. Carry only an applicable constraint and its source into the exact task; record stale/conflicting advice as rejected context, not binding instructions.
3. Put applicable structural criteria and referenced decisions inside each task block because the coder intentionally does not read sibling tasks or the entire Overview. Keep full rubric evaluation in planning and scoped review; do not require a second expansive repository audit during code.
4. Before generation, the coder confirms those constraints are available and coherent with its Steps. If the plan mandates a defect, block for planner/design correction rather than silently redesigning. At handoff, record which applicable criterion/decision shaped the implementation or a justified non-applicability result.

**Edit snippets:** Add after each task's Acceptance block:

```markdown
- Quality constraints: <applicable rubric principle, concrete task constraint, source section>
- Decision context: <verified current decision or relevant recalled lesson, source, applicability; or none with reason>
```

Add to the implementer prompt after its Context heading:

```markdown
[APPLICABLE_TASK_QUALITY_CONSTRAINTS_AND_VERIFIED_DECISION_CONTEXT]

Before production edits, confirm these constraints against this task's Steps and
current project standards. Memory informs decisions; it cannot replace committed
state or authorize deviation. If a supplied constraint conflicts with approved
intent, record a blocker for the owning planner/design stage.
```

Add a bullet to the coder's final attempt evidence and self-review, not a second report file:

```markdown
- Quality/decision evidence: <applicable criterion or decision, observed implementation/check, and any justified exception>
```

**Acceptance:** A task carries the concrete structural choice that would otherwise remain only in Overview. An available relevant lesson changes a task constraint or is rejected with a source-backed reason. Unavailable harness memory is recorded and uses repository-owned context; it is not a fatal dependency. Stale memory cannot override current intent. An inapplicable principle does not trigger speculative abstraction. A reviewer can locate criterion-to-code/test evidence rather than relying on “rubric applied.”

**Compatibility/rollout:** Additive task/body text remains compatible with current task-heading parsing. Keep memory optional and harness-neutral; do not hardwire Pi, a private memory path, credentials, or an external service into Kepler. Existing tasks need not be rewritten mid-run; apply this to new/remediation tasks and supplied dispatch context. Review independence remains intact.

### A6. Bind full verification and admission to the same HEAD

**Targets:** `precondition.ts`; its existing Git helpers/runtime ports; `kepler-finish-work` gate-entry capture; precondition tests.

**Steps:**

1. Add a test whose verification command/runtime callback changes HEAD while returning zero and leaving clean state. Admission must fail.
2. Capture a valid HEAD before verification, compare it after all checks, and report the admitted verified identifier. Use existing `gitCurrentHead`, `text`, and `fullCommit` helpers.
3. Finish must consume that identifier, not silently capture a different HEAD after `gate: open`. Check branch/worktree/target identity as part of the existing next-effect boundary; if unexpected state changed, stop and revalidate.

**Edit snippets:** Import the existing helpers from `precondition-git.js`. After initial clean-tree inspection and before `runTestCommand`, add:

```ts
const verifiedHead = text(await gitCurrentHead(runtime, target));
if (!fullCommit(verifiedHead))
  return result("error", 2, output, "Unable to resolve verification HEAD\n");
```

After the final clean-tree check, but before the success branch emits `gate: open`, add:

```ts
if (failures === 0) {
  const currentHead = text(await gitCurrentHead(runtime, target));
  if (currentHead !== verifiedHead) {
    output += "[FAIL] Verified HEAD changed during admission\n";
    failures += 1;
  } else {
    output += `verified-head: ${verifiedHead}\n`;
  }
}
```

Finish gate-entry instruction:

```markdown
Require the gate's verified-head to equal current HEAD before capturing admitted
branch/worktree/target identities. Use that verified identity for the attempt's
mutation boundary. A clean but changed HEAD requires another gate, not reuse.
```

**Acceptance:** An unchanged clean HEAD passes; a clean newly committed or checked-out HEAD fails even with command exit zero; failure to resolve HEAD is an error. Existing supplied-command and clean-tree checks remain. The final line remains `gate: open` only on success. An unexpected branch/worktree change before the next effect is not excused by the same commit ID.

**Compatibility/rollout:** Add a diagnostic/output field while preserving the command's final-line contract. Update mock ports to provide stable valid identities. Update the consuming finish skill with the CLI in the same release. This is identity validation, not a lock; continued external mutation can still force a fail-closed retry.

### A7. Persist finish intent before canonical specs and define post-delivery repair

**Targets:** `kepler-finish-work` synchronization/history/process/recovery/boundaries and diagram; `bundle/templates/finish.md`; `artifact-types.ts` finish strategy enum and `artifact-body.ts` finish validation; precondition arguments/command/service plus historical Git/artifact readers for narrowly scoped repair admission; finish/precondition/CLI contract tests; state-machine document.

**Steps:**

1. Validate approved inputs and required deltas read-only. Resolve strategy, base, route shipping condition, and strategy/qualification compatibility before allocating intent. Missing/inconsistent inputs or an incompatible strategy still stop without persistent spec/history effects.
2. Commit Attempt after the ordinary gate and read-only validation, before any canonical-spec commit. Record planned sync targets, exact approved input identities, verified gate HEAD, target ref and target commit, review Base/Head, and the committed review artifact revision. These are durable recovery inputs, not claims that synchronization already occurred.
3. Apply/lint/commit spec synchronization within that attempt. Record its actual result/commit in Outcome. Observe a no-change sync; do not create an empty commit.
4. For an unmatched Attempt, inspect existing effects and continue that same attempt from its first unverified step. If a blocked Outcome is already paired, never reopen it or rewrite it.
5. Distinguish **ordinary retry before delivery** from **finalization repair after verified delivery**. An ordinary retry follows current full admission. A post-delivery repair creates a new numbered pair on the surviving branch/base, references the blocked delivery pair, and completes only remaining named effects. It never repeats merge, request creation, or destructive branch/worktree cleanup.
6. Add a narrow repair-admission mode to the existing precondition command, not a second lifecycle database. It returns a distinct authorization for remaining finalization effects. It must not apply A9's current-target merge-base comparison to the already-delivered historical range; instead it verifies the original admitted scope from immutable recorded target/review revisions.
7. Make every repair step idempotent through observation. A failed repair leaves another paired blocked record. A later repair requires newly available evidence/conditions, refers to the same original delivery and latest failed repair, and rechecks its remaining-effect boundary.

**Edit snippets:** Replace persist-specs → resolve-intent → commit-intent ordering with:

```markdown
4. Validate approved synchronization inputs and resolve compatible strategy/workspace/
   route intent without changing canonical files. Stop on invalid or incompatible intent.
5. Append and commit Attempt N with admitted identities, approved input identities,
   planned canonical targets, strategy, workspace result, and route intent. Verify it.
6. Synchronize canonical specs inside this attempt, lint each mutation, commit only
   derived spec paths, and read back the result. Recover this step from the same Attempt.
```

Change the Attempt template's synchronization bullet, add recorded admission provenance, and record observed synchronization in Outcome:

```markdown
- Specification synchronization: planned exact targets and approved input identities, or planned none
- Admission identity: {"verifiedHead":"<full SHA>","targetRef":"<ref>","targetCommit":"<full SHA>","reviewBase":"<full SHA>","reviewHead":"<full SHA>","reviewCommit":"<full artifact-only SHA>","materialWaiver":null,"inputs":[{"path":"<approved input path>","blob":"<Git blob ID>"}]}
```

```markdown
- Specification synchronization result: observed canonical paths and commit, or verified no change
- Strategy effect: observed merge/ref or canonical request identity and provider state, or verified no-op
- Remaining effects: exact unverified paths/actions, or none
```

Add this explicit recovery branch to the skill:

```markdown
If a paired blocked outcome follows verified delivery, do not run delivery again.
Request finalization-repair admission on the surviving branch/base. Preserve the
original pair and create a new numbered repair Attempt linked to it. Complete only
its exact remaining finish-owned effects, then persist a separately verified Outcome.
A branch removed after merge is not an input to another merge. A changed current
merge base is not evidence that the already-delivered historical review was invalid.
```

Proposed mode interface, wired through the existing precondition CLI/runtime:

```text
kepler workbench precondition --change-dir <change-dir>
  --test-cmd '<full test suite && build/typecheck>'
  --target-branch <recorded target> --recover-finish <blocked delivery attempt number>

Success feedback:
  admission: finalization-repair
  verified-head: <current surviving HEAD>
  gate: repair-open
```

`gate: repair-open` is deliberately distinct from ordinary `gate: open`. A repair result cannot authorize the ordinary synchronization/delivery path. Add `reconcile-delivery` to the finish artifact's `strategy` enum for repair records, and include the original delivery strategy in their linked intent. The user's ordinary delivery choices remain local-merge, pull-request, and no-op; reconciliation is an executor submode, not a fourth way to ship. Old schemas reject the new repair executor instead of ignoring an unknown purpose field and accidentally repeating delivery.

Parse `Admission identity` as one JSON object with exactly the documented keys, valid full commit IDs, and unique approved-input paths/blob IDs. Define similarly typed `Recovery of` (original attempt number and blocked-outcome commit), optional previous-repair commit, observed delivery identity, and exact remaining effects. Reject duplicates, partial fields, and mismatched references. Read historical artifacts through immutable Git blobs at the recorded revision; do not temporarily check out the old branch or repoint refs to satisfy a historical predicate. Reuse pure readers/validators with an explicit source revision, rather than making current-worktree checks impersonate the old admitted state.

**Exact repair-admission predicate:**

- The original Attempt/blocked Outcome and any latest failed repair pair are committed, valid, uniquely numbered, and belong to this exact change. No intervening unrelated delivery or completed repair is silently bypassed.
- The recorded admitted HEAD, original target commit, and committed review artifact revision resolve. Validate the original task/review predicates at that admitted revision, and recompute its Base against the **recorded original target commit**, not today's already-merged base. Record waiver state: `materialWaiver` is null unless it contains the explicit authorization reference for the original narrow material-ancestry waiver. Reuse only that established comparison waiver, never scope/verdict/durability waivers. Missing or ambiguous authorization/provenance requires owner adjudication; never guess it.
- Independently re-read the already-completed strategy effect. For local merge, the recorded surviving base contains the admitted change/Attempt and the recorded merge result; a missing change branch is allowed and no merge is issued. For a request, provider/repository/URL/head/base identity matches recorded intent, and its open or merged qualification is evaluated under the shipping rule. A different or closed-unmerged request is not a qualifying result. No-op requires its original branch/workspace invariants and no invented remote effect.
- If merge policy rewrote commits, prove reviewed-content provenance unambiguously through the recorded provider/Git evidence or stop for owner adjudication. Do not require a nonexistent branch and do not silently infer squash/rebase equivalence.
- The surviving tree is clean; full tests/build pass for its unchanged current HEAD (A6). Any dirty tree, including an exact attempt-owned route/map diff left by failed lint/commit, requires explicit owner intervention before automated repair admission. Inspect and report the paths/boundary, but do not discard, stage, pre-commit, or normalize them to manufacture cleanliness. The owner must authorize preservation/restoration or a correct scoped commit; preserve unrelated work. After reconciliation, rerun admission at the new HEAD and independently validate any already-committed remaining effect. Current task/history evidence remains durable and consistent; changed approved synchronization inputs or route intent are not repaired under this mode.
- The repair is limited to exact remaining canonical/route/map/history paths recorded in the blocked result. Already-completed effects are reused by observation. Any needed application/test/requirement/design change starts a normal change with ordinary review; repair admission cannot approve it.
- Capture current repair-entry HEAD and enforce that exact allowlist before every remaining effect. There is no global material-freshness exemption, general base-branch writing permission, or user flag that substitutes for verified delivery.

**Acceptance:** Interruption before/after a spec commit leaves a recoverable unmatched Attempt. Invalid inputs create no Attempt/spec commit. A changed input identity aborts recovery. Specifically exercise **merge success → branch/worktree removal → route failure → paired blocked Outcome → later repair on base**: preserve the original pair, validate historical admission plus current HEAD, emit no second merge, perform only remaining route/history writes, and persist the new completed pair on base. Forged/missing delivery or admission provenance closes repair admission. A normal attempt cannot consume repair-open.

**Compatibility/rollout:** Historical Attempts with observed synchronization remain immutable. New planned synchronization has an observed Outcome. Update the contract test enforcing sync before Attempt. Add the new executor/mode to schema, parser, CLI, skill, template, and docs together. Old readers reject repair records; new readers preserve old records but do not automatically repair incomplete legacy provenance. Rollback requires a compatible recovery reader or explicit owner intervention, not deleting a blocked pair.

### A8. Advance routes only after compatible, observed shipping qualification

**Targets:** `kepler-finish-work` read-only intent validation, route process, strategy execution, recovery and partial failure; state-machine document; finish/route scenario tests. Use the route body's [Shipping rules](../bundle/templates/wayfinder/route.md#shipping-rules) and unit completion outcome rather than inventing a universal shipment definition.

**Steps:**

1. Capture the named unit's old state and exact shipping condition in Attempt. Before journaling, require the selected strategy to be capable of satisfying that condition within the invocation. **Conservative default:** if the route requires merge but selected delivery only opens a request, reject incompatible intent before Attempt/effects and ask for a compatible strategy or an explicit authorized rule decision. Do not automatically create an awaiting-merge finish state or reinterpret an open request as merged.
2. Execute/read back the qualifying strategy effect, then update route/map on the branch that survives. For local merge, update on base after observed merge; for a qualifying request submission, update on the change branch and push/read back; for no-op, advance only when the route explicitly permits it.
3. If a historical attempt already opened a request but needs merge qualification, report that pending external condition without a shipped/completed claim. After merge, A7 finalization-repair may use provider **merged** readback and immutable reviewed-content provenance; it must not retain an open-state-only check or recreate the request. Insufficient historical provenance requires owner adjudication.
4. Reuse an exact recorded advancement only while its qualification and input identity still hold. A different unit/map/condition is a conflict. Preserve other units; a partial route/map update is not assumed atomic or rolled back.
5. Persist/push route and the matching Outcome before reporting completion. If post-delivery route persistence fails, use A7's linked repair path, not a new ordinary delivery attempt. A dirty surviving tree blocks automated admission, even for an owned partial route/map write; obtain explicit owner reconciliation without automatic discard/pre-commit, then rerun the repair checks.

**Edit snippet:** Replace the unconditional pre-strategy route step and update each strategy's ordering:

```markdown
Validate strategy/route qualification compatibility before journaling or effects.
After the recorded shipping condition is observed, mutate only the named unit and
conditional map on the surviving branch. Reuse a prior exact advancement only with
qualification verified. An incomplete qualifying effect leaves the unit in-progress.
A post-delivery failure receives blocked evidence and later linked finalization repair;
it never authorizes another merge/request. Re-read and persist every remaining effect.
```

**Acceptance:** Failed push/merge before qualification leaves the route unshipped. Request-open qualifies only when Shipping rules say so. A merge-required route plus request-open strategy fails read-only intent validation, creating no request/Attempt/spec write. A historical already-open request can later qualify from merged readback, without an open-state requirement or duplicate object; ambiguous provenance still stops. No-op cannot imply external delivery. Both dangling-attempt resume and paired-blocked repair complete missing route/history effects on the surviving branch/base without replaying delivery.

**Compatibility/rollout:** Do not mass-revert shipped routes or presume they are wrong. Diagnose against historical pairs and actual shipping rules. Preserve history and use an authorized owner. Update local-merge tests that require route commits before merge: the new route result must be verified on base after merge. Do not silently change shipping rules to make an incompatible selected strategy pass.

### A9. Validate the review's actual target merge base at admission

**Targets:** `precondition-runtime.ts` arguments; `precondition.command.ts` option/wiring; `precondition-reviews.ts`; review evidence/template/provenance parser alongside A4; review/finish dispatch instructions; `tests/workbench/precondition.test.ts` and `tests/cli/precondition-command.test.ts`.

**Steps:**

1. For ordinary delivery admission, record/supply the exact review target reference. Resolve it to a commit and compute merge base against current verified branch HEAD; require equality with the review's full Base. A7 finalization-repair uses its separate verified historical admission view and must not fall through this current-base comparison after delivery.
2. Keep existing Base→Head and Head→current ancestry and material checks for ordinary admission. An explicit freshness waiver cannot authorize the wrong target or omitted branch range. Repair authorization is restricted to A7's remaining effects; it never constitutes current full-change clearance.
3. For supported legacy review lacking persisted target, require an explicit target from project standards or the requester; do not infer it from arbitrary Base. Record the resolved target in the next new pass, without rewriting historical provenance.

**Edit snippets:** Add to `PreconditionArguments` and wire the corresponding Nest option into `run`:

```ts
readonly targetBranch: string;
```

```ts
@Option({
  flags: "--target-branch <reference>",
  name: "targetBranch",
  description: "Validate review scope against this target branch",
})
parseTargetBranch(reference: string): string {
  return reference;
}
```

The new required argument intentionally makes callers update their gate input. Extend the command's existing missing-option/error handling; do not pass an undefined target.

Within **ordinary delivery** branch review validation, after resolving the target to a full commit and obtaining current verified HEAD, use the existing helpers:

```ts
const targetCommit = await gitResolveCommit(runtime, root, targetBranch);
const current = text(await gitCurrentHead(runtime, root));
if (!successful(targetCommit) || !fullCommit(text(targetCommit)) || !fullCommit(current))
  problems.push("whole-branch review target is missing or unverifiable");
else {
  const actualBase = await gitCommand(runtime, ["merge-base", text(targetCommit), current], root);
  if (!successful(actualBase) || text(actualBase) !== review.base)
    problems.push("whole-branch review Base is not the actual target merge base");
}
```

Pass `targetBranch` explicitly through `inspectReviews`; import `gitCommand`; validate any persisted target equals the selected target. The snippet shows the local predicate, not the complete parameter/wiring patch.

**Acceptance:** The true merge base passes. A recent arbitrary ancestor, unknown target, mismatched persisted target, and changed actual merge base fail even under the material waiver. Explicit-target legacy review can pass without fabricated historical target fields. CLI missing target exits with a named input error rather than quietly reducing scope.

**Compatibility/rollout:** This is an intentional CLI/API input change. Update every precondition caller, runtime-port fixture, example, and finish resource in the same release. Keep legacy artifact reading available with explicit target input. Document the version boundary before users adopt A4; do not deploy only the new skill command against an older CLI.

### A10. Verify the protocol through observable scenarios

**Targets:** Existing artifact-contract/review-pass/precondition/CLI tests; `tests/skills/{orchestrate,review,finish-work}-contract.test.ts`; a new bounded workflow-scenario checklist under `tests/skills/`; existing project verification commands.

**Steps:**

1. Add each action's focused regression before implementation. Keep regex-based skill contract tests for instruction ownership/order, but label them as wording checks rather than agent-behavior evidence.
2. Add temporary-filesystem/Git and injectable-runtime cases for parser/range/durability/admission invariants. Assert gate output and unchanged files on rejection, not only a successful command exit.
3. Run a controlled agent workflow in an isolated disposable fixture through the supported harness: initial full review requests one bounded correction, correction gets task approval, bounded clearance passes finish; also interrupt after spec/route/provider milestones. Count dispatch scopes and inspect committed artifacts/actual readback.
4. Keep the agent evaluation opt-in and record harness/model/resource versions. If no supported harness is available, report that behavioral case as unverified; text tests are not a substitute. Do not introduce a new production orchestrator just to make its tests easy.

**Concrete regression snippet:** Add alongside existing Outcome tests in `tests/workbench/precondition.test.ts`:

```ts
it.each([
  "- Outcome: blocked\n- Outcome: done",
  "- Outcome: done\n- Outcome: blocked",
  "- Outcome: done\n- Outcome: done",
  "Outcome: blocked\n- Outcome: done",
])("rejects ambiguous latest task outcomes: %s", async (taskOutcomeField) => {
  const repository = makeRepo();
  const { changeDir } = makeEvidence(repository, { taskOutcomeField });
  const result = await runPrecondition({ changeDir, testCommand: "true" });
  expect(result.exitCode).toBe(1);
  expect(result.lastLine).toContain("gate: closed");
});
```

This uses the current fixture helpers. Once A9 changes the API, supply the fixture's explicit target as well. Add a separate artifact-lint assertion so the regression is caught before finish.

**Acceptance:** The scenario matrix below passes at the claimed layer. End-to-end evidence records actual dispatch counts, independent reviewer outcomes, task metadata/row/outcome consistency, and persisted finish readback. Focused mechanical tests, full suite, and build/typecheck pass after implementation. No test claims a remote effect merely because a fake returned zero.

**Compatibility/rollout:** Existing wording tests remain useful but cannot certify a model followed a skill. Use available Vitest/Bun and repository runtime ports; add no mandatory agent provider or dependency. Keep destructive/provider behavior in disposable fixtures or approved test resources. Retain signing policy in Git fixtures; never disable host signing to obtain a passing test.

### A11. Define approved intent and unresolved critique handoff

**Decision (requester-approved):** Adopt explicit requester approval over revision-bound formal inputs. Tactical requests may omit formal artifacts; authorized unattended planning may self-review the breakdown but cannot create formal approval. Require explicit confirmation for ambiguous legacy approval as recorded above.

**Targets:** proposal/design/requirements templates; artifact-types status enums; propose approval, critique Handoff, planner context/confirmation, finish input validation; semantic preflight and skill contracts.

**Steps:** Define approval as an explicit owner decision over exact intent bytes, durably committed after approval; Git proves those bytes, not owner authorization. Formal intent present at planning must be approved and mutually consistent; tactical absence is allowed. Authorized unattended planning may self-review its breakdown, but may not manufacture formal proposal approval. Persist the approval reference and committed input revision in the plan, revalidate current inputs before code/finish, and invalidate changed approval through A14. Do not interpret template decision defaults as approval.

**Edit snippets:** Extend existing enums, with coordinated readers/writers:

```ts
design: { status: ["draft", "approved"] },
"requirements-change": { status: ["draft", "approved"] },
```

In propose's approval step and planner's gather-context step:

```markdown
After explicit approval, set proposal/design/delta status to approved and decision to
accepted, preserve author attribution, and commit those exact approved inputs. Record
the decision reference and full approval commit in the plan's Overview. Require current
input bytes to match that revision; an edited draft is not covered by prior approval.
A tactical request with no formal intent remains valid; do not create fake approvals.
Confirm the breakdown or record authorized unattended self-review and assumptions.
```

Replace critique's skipped handoff ambiguity:

```markdown
For decision skipped, approved may name the next applicable stage; changes-requested
holds at the artifact owner until findings are applied/reapproved or explicitly rejected.
A skipped verdict supplies no clearance. Do not manufacture a user disposition.
Applied/rejected critique decisions remain settled; do not require another critique.
Naming a possible next stage does not authorize dispatch while the hold remains.
```

**Acceptance:** T18/T19 distinguish format, intent approval, planning authority and critique settlement. CLI semantics may reject missing/stale/negative evidence; they cannot authenticate a claimed owner message. No forced propose for tactical work, no re-critique solely to replace applied/rejected.

**Compatibility/rollout:** The requester approved this public protocol; implement within the recorded boundaries and confirm any material deviation. Older design/delta linters reject approved status, while old precondition alone still omits semantic intent checks: update CLI, templates and portable skills together, verify installed versions, then enable writers. Legacy draft/default-accepted artifacts need explicit current owner confirmation, not inferred approval or mass rewriting. Preserve legitimate historical approval evidence and source attribution.

### A12. Freeze title identity before it strands feedback

**Targets:** planner Re-plan mode; execution/feedback contracts; renamed-task fixtures.

**Steps:** Preserve existing non-done rename support only before its feedback file exists. After feedback exists, keep the task title/ID/paths/heading and every pass immutable; represent a necessary changed identity by abandoning the unfinished task with the canonical reason and appending a new ID. Done task definitions remain frozen. A merely incomplete feedback write still requires owner diagnosis before any identity migration.

**Edit snippet:** Add before the current renamed-non-done bullet:

```markdown
Before renaming, inspect the assigned feedback path. If it exists, preserve this task's
identity and feedback heading. Do not rewrite feedback owned by the reviewer. If a new
identity is needed, explicitly abandon this unfinished task and append a new numbered
task, retaining all old evidence. A rename with no feedback may use the existing
synchronized plan/root/task-progress transition. Never rename a done task.
```

**Acceptance:** T20 prevents the old feedback-H1 mismatch, preserves completed/history bytes and permits history-free renames. Existing completely synchronized historical renames still read normally.

**Compatibility/rollout:** Instruction-only tightening of future re-plans; no new schema. An already-stranded history requires owner adjudication, not automatic feedback/header migration.

### A13. Recover partial initial scaffolding without inventing execution

**Targets:** planner existing-artifact gate/initialization; context missing-input diagnostics; execution/scaffold contracts; init preservation fixtures.

**Steps:** Add an explicit initial-scaffold resume mode distinct from re-plan and code. Record the full initialization Git HEAD in the plan Overview before the first scaffold write; bind it to the authorized breakdown. On recovery, inspect that original revision, complete task definitions, root identities and all present files before writing anything. Every present task state must be pending/history-free; missing state is initialized only after proof of initial creation. Admit only if no attempt/feedback/checkpoint or task-owned implementation exists since that revision, existing files are consistent, and missing paths have no previous execution-bearing version. If the baseline/authority is unavailable, stop for owner evidence; current HEAD and file absence alone are insufficient. Prove these conditions from filesystem plus reachable Git history; uncertainty stops. Fill only missing authorized paths; never overwrite logs or change completed tasks. Full scaffold lint then durable handoff remains required.

**Edit snippet:** Insert before treating a present plan as ordinary re-plan:

```markdown
Record Initialization base as the full Git HEAD before writing the first scaffold file.
If the initial scaffold is incomplete, diagnose it before the normal existing-input
gate. With the authorized breakdown, original initialization revision, and proof of no
execution/feedback/checkpoint history or partial task work since that revision, initialize
only the missing initial pending root/log paths from that exact task list. An absent
baseline, committed prior execution, or deleted historical log needs owner diagnosis. Preserve every existing file and author. If any task has begun,
this is not initialization: return to its owner. Lint the completed scaffold, commit
its initial evidence, and only then dispatch code. Never synthesize an Attempt.
```

**Acceptance:** T21 interrupts after each initial file, resumes only missing pending artifacts, and rejects history-bearing/ambiguous cases. T31 preserves legacy data and init's no-guess/confirmation/migration-before-scaffold ordering. Existing core migration recovery is reused, not replaced.

**Compatibility/rollout:** Opt-in owner-directed recovery, not automatic normalization of unsupported artifacts. A truly empty plan remains invalid; all-abandoned plans follow their existing separate path.

### A14. Classify input changes before reusing task obligations

**Targets:** plan Overview/task blocks, task-progress Notes, driver upstream-revision handoff, code/feedback/review generation preflights; standards/spec/intent fixtures.

**Steps:** Capture the exact task definition plus relevant approved requirements/design/specs, route constraints, project standards and repository identity at handoff. Re-read before acting; hashes identify change, not semantic equivalence. An owner/planner classifies changed inputs into unaffected obligations, affected unfinished tasks, new obligations after frozen done tasks, or unresolved intent. Record the impact map in the plan and require independent review of its reasoning. Re-plan unfinished work; append new tasks for new obligations rather than changing frozen done definitions. Require fresh whole review after material intent changes and use A4's full fallback when its baseline intent changed. Unrelated inputs must not automatically restart every task review.

**Edit snippet:** Add to upstream-revision routing and task dispatch:

```markdown
Compare the committed input revision and exact selected task contract with current
inputs. Before reuse, record which obligations changed and why unaffected approvals
still apply. Frozen done tasks certify their original contracts only; append new
numbered work for new requirements. Revised unfinished work returns through plan/code
and fresh feedback. Re-read AGENTS commands/boundaries and canonical specs; do not use
cached standards or memory to authorize a changed contract. Any unresolved impact holds
at the owner. Whole review and the material waiver cannot supply missing intent approval.
```

A task-local Notes entry can carry versioned input context as data:

```json
{"version":1,"repository":"<canonical Git root identity>","intentCommit":"<full SHA or explicit tactical authority reference>","taskDefinition":"<selected-block digest>","inputs":[{"path":"AGENTS.md","blob":"<Git blob ID>"}],"impactPlanCommit":"<full SHA when revised>"}
```

Define its parser/schema and nullable/absent tactical inputs explicitly before consuming it. Do not invent old snapshots. Record current canonical capability blobs against the actual target when synchronizing; if those semantics changed since authoring, reconcile the delta at its owner before applying it.

**Acceptance:** T22 detects relevant changed acceptance without discarding frozen history; unaffected tasks retain legitimate approvals; missing intent approval still blocks under a generic material waiver. T30 discovers behavioral/spec obligations during planning, not solely after whole review: a minimal approved delta is sufficient without mandatory heavyweight proposal. T31 notices changed standards/commands rather than perpetuating guesses.

**Compatibility/rollout:** Start with explicit owner impact routing and controlled scenario evaluation. Make mechanically consumed snapshots versioned in the existing task evidence, with coordinated readers; old readers ignoring additive data do not enforce this rule. Legacy evidence without provenance gets scoped diagnosis/current confirmation, never fabricated hashes or wholesale task re-execution. Do not add another lifecycle-status database.

### A15. Enforce coherent route identity, graph and binding

**Targets:** artifact-types/body/registry relational validation; context routeUnit resolver/result diagnostics and all its callers; route producer and propose/plan/finish consumers; artifact/context/route fixtures.

**Steps:** Check unique unit IDs, exact metadata/body identity/order, existing non-self non-duplicate dependencies, and acyclicity after shape validation. Preserve Wayfinder's semantic causal-order/coverage gate and the entry requirement that prerequisites are shipped and Git-reachable. Refuse conflicting non-null proposal/plan references instead of first-wins. Resolve only a canonical route/real unit under the intended project; record its source/revision in handoff/finish intent. No silent renumber, reorder, normalization or unit substitution.

**Edit snippets:** Declare one shared validated shape in artifact-types, then import it with .js imports in artifact-body/registry:

```ts
export interface RouteUnitContract {
  readonly id: number;
  readonly name: string;
  readonly depends_on: readonly number[];
}
```

Add the pure helper to artifact-body. Shape validation still checks the other existing status/backed_by fields before calling it:

```ts
export const routeRelationProblems = (
  units: readonly RouteUnitContract[],
  records: readonly ArtifactWorkflowRecord[],
): readonly string[] => {
  const problems: string[] = [];
  const ids = new Set(units.map((unit) => unit.id));
  if (ids.size !== units.length) problems.push("Route unit IDs must be unique");
  if (units.length !== records.length || units.some((unit, index) =>
    unit.id !== records[index]?.number || unit.name !== records[index]?.title,
  )) problems.push("Route metadata and body unit identities/order must match");
  for (const unit of units) {
    if (new Set(unit.depends_on).size !== unit.depends_on.length)
      problems.push(`Unit ${unit.id} repeats a dependency`);
    for (const dependency of unit.depends_on) {
      if (!ids.has(dependency)) problems.push(`Unit ${unit.id} has unknown dependency ${dependency}`);
      if (dependency === unit.id) problems.push(`Unit ${unit.id} depends on itself`);
    }
  }
  const indegree = new Map(units.map((unit) => [unit.id, 0]));
  const dependents = new Map<number, number[]>();
  for (const unit of units) for (const dependency of unit.depends_on) {
    if (!ids.has(dependency)) continue;
    indegree.set(unit.id, (indegree.get(unit.id) ?? 0) + 1);
    const list = dependents.get(dependency);
    if (list) list.push(unit.id);
    else dependents.set(dependency, [unit.id]);
  }
  const ready = [...indegree].filter(([, count]) => count === 0).map(([id]) => id);
  for (let index = 0; index < ready.length; index += 1) {
    for (const id of dependents.get(ready[index]!) ?? []) {
      const next = (indegree.get(id) ?? 0) - 1;
      indegree.set(id, next);
      if (next === 0) ready.push(id);
    }
  }
  if (ready.length !== ids.size) problems.push("Route dependencies must be acyclic");
  return problems;
};
```

In validateArtifact, after existing shape/body diagnostics succeed, narrow metadata units to RouteUnitContract and invoke the helper over unit records. Convert each problem to the existing invalid-value diagnostic at units; do not throw or run typed graph logic on malformed metadata.

Replace first-wins resolution with an explicit result (including preserved legacy extraction rules):

```ts
export const resolveRouteReferences = (
  proposal: string | null | undefined,
  plan: { readonly present: boolean; readonly reference?: string | null },
) => {
  if (plan.present && proposal && proposal !== plan.reference)
    return { kind: "conflict" as const, references: [proposal, plan.reference ?? null] };
  return plan.present
    ? { kind: "resolved" as const, reference: plan.reference ?? undefined, source: "plan" as const }
    : { kind: "resolved" as const, reference: proposal ?? undefined, source: "proposal" as const };
};
```

Update all context callers: a conflict is a separate semantic diagnostic with both source paths/values and a nonzero command result, not an invented legacy-format error. Plan/finish stop before claim, Attempt or route mutation. After planning, the plan is the selected binding; a non-null proposal must agree with it, including when plan is null. Missing propagation or an intended release requires explicit owner reconciliation, not implicit fallback/clearing. A null proposal may accompany a valid planned binding. Matching/fully legacy references follow their documented profile; never mix a modern null with a guessed legacy override.

**Acceptance:** T24 rejects the currently accepted bad graph/body fixtures while the valid control passes; include a long acyclic chain to guard against recursive stack exhaustion; T25 refuses different valid bindings and accepts matching/null-proposal plus valid-plan. A blocked first pending unit reports the exact prerequisite/ordering issue; any explicit later-unit choice needs owner authorization, not silent substitution. Map open/uncleared or contradictory aggregate state cannot substitute for the compiled semantic handoff; unit states remain authoritative for shipment.

**Compatibility/rollout:** Diagnose old shape-valid but incoherent routes without rewriting IDs, shipped history or body. Deploy shared reader/context diagnostics and all callers before enabling producer expectations. Existing causal-order semantics remain; graph validity alone does not prove dependency reachability or destination coverage.

### A16. Guard unit reservation, withdrawal and shared-workspace cleanup

**Decision (requester-approved):** Adopt designated-controller serialization, one owner per unit, explicit authorized release/transfer and conservative workspace retention. Concurrent cross-clone claims/shipping, distributed locking and external coordination services are outside this implementation contract.

**Targets:** propose/plan map-aware claim and existing-workspace steps; code's workspace preflight; shared actual-target identity from A9; plan/proposal provenance; finish intent/cleanup/readback; state-machine recovery docs; multi-worktree scenarios. Preserve isolate.check's workspace fact rather than silently redefining it as source-role authorization.

**Steps:** Before any new change artifact/code write, resolve the actual delivery target from route Shipping rules/map.branch or project/default rules. Require a named, owner-bound change-source branch distinct from that target; isolated: yes alone is insufficient and a detached linked checkout is not a named source. If target/ownership is unknown or the same, stop for owner-directed creation/switch/verification before writing. Normalize the actual delivery identity rather than comparing raw local/remote-tracking spellings or tip SHAs: a distinct feature branch may correctly start at the target's current commit. A7's post-delivery repair may operate on the surviving base but cannot authorize new implementation. Before a new claim or suffixed workspace, inspect visible active plans/proposals/branches/worktrees for the same effort/unit; prefer resuming its owner. Record owning change, branch, base/input revision and canonical unit reference in existing change intent. Revalidate before commit/effects and enforce one writer per change/worktree. Claims are observable reservations, not distributed locks. The approved policy serializes claims and delivery through the designated user/controller; concurrent cross-clone claims/shipping are unsupported. Stop on competing/ambiguous ownership and request owner adjudication. Do not promise exclusivity from a local scan or status hash, or introduce a distributed lock/coordination service.

**Edit snippet:** Add to both map-aware entry paths and the finish cleanup policy:

```markdown
A pending marker in this branch alone does not establish availability. Inspect known
competing change claims; a worktree suffix does not create a second authorized owner.
Stop on ambiguity and ask the designated owner to resume or explicitly transfer.
Serialize claims/delivery through that controller; concurrent cross-clone claims/shipping
are unsupported. Do not invent distributed locking or an external coordination service.
Revalidate dependencies and current input/owner identity before writes.
Serialize this change's writers. Before new propose/plan/code writes, verify a named
owned source branch distinct from the actual route/project delivery target. A linked
or merely non-default checkout does not establish that role. If it is the target or
unresolved, create/switch only through owner-directed isolation and verify it first.
Historical finalization repair on the base is separate and does not authorize new code.
Isolation is not a cleanup-ownership certificate.

For withdrawal, inspect actual partial implementation, Git/provider effects and other
owners. With explicit owner authorization, retain/archive work and record release or
transfer in existing change intent; reset a unit to pending only when no verified
shipment is being erased and its reservation can be safely relinquished. Never delete
work or infer rollback. Delivered changes use linked A7 finalization repair. Before
workspace/branch removal, prove no other active change or unpreserved work depends on it;
otherwise agree retention in intent before delivery, or stop for owner intervention.
```

**Acceptance:** T26 exposes two branch-local claims before duplicate work; T27 requires explicit release/transfer after verified partial-state inspection and preserves work/history; T33 retains a shared/uncertain workspace; T34 prevents pre-admission writes on the actual target despite a positive filesystem-isolation result. A current HEAD/input revision change aborts unowned next writes, but is not a race-free lock; concurrency requires serialized ownership.

**Compatibility/rollout:** Claim/transfer authority is the requester-approved designated user/controller. Cross-clone concurrency is not part of this implementation; it requires a separate future authority/protocol decision. Reuse current route_unit/change/branch/Git evidence; do not add a second project status database or auto-expiring destructive lease. Legacy owner ambiguity remains an explicit intervention. Changes to local-merge retention must update its stated effect contract and A7 intent/readback together; never weaken required verification by omitting failed cleanup after the fact.

### A17. Share historical checkpoint verification across diff and admission

**Targets:** diff checkpoint/package helpers; typed runtime adapters; task evidence and precondition review inspection; code/feedback/driver checkpoint rules; diff/precondition fixtures.

**Steps:** Extract the existing skill recovery algorithm into a typed pure/port-backed checkpoint verifier. Before recording, packaging, feedback dispatch or E7 admission, derive canonical Base from all valid feedback Bases and the first parent of the earliest commit adding the first task attempt. Candidates must agree, resolve, precede that attempt, and remain ancestors of reviewed Heads/current HEAD. An existing ignored .base is an optimization to validate against that result, never the durable authority. Before any history, retain the guarded pending/no-attempt/no-feedback/no-task-change initial record path. Missing/ambiguous historical candidates stop for owner adjudication; no guessed HEAD or HEAD~1.

**Edit snippet:** Extend TaskEvidence with a verified historical base result and invoke the shared verifier while inspecting task history. Define the new result member in TaskEvidence (the shared verifier returns this union), then use it in the existing inspectReviews task loop before validRange:

```ts
readonly checkpoint:
  | { readonly kind: "verified"; readonly base: string }
  | { readonly kind: "unverified"; readonly reason: string };
```

```ts
if (task.checkpoint.kind !== "verified" || feedback.base !== task.checkpoint.base)
  problems.push(`Task ${task.task} feedback Base does not match its historical checkpoint`);
```

In recordCheckpoint's existing-file branch and packageTask, invoke that same verifier when durable task history exists; disagreement is a structured failure before packaging/writing. Define the typed verifier/runtime result rather than coercing failures to a SHA. It must read historical progress blobs to locate first-attempt introduction, not confuse the planner's initial pending log creation with implementation. Keep generic branch validRange unchanged.

**Acceptance:** T28 rejects shortened Base despite valid generic ancestry/implementation containment; T29 accepts identical canonical history across worktrees, rejects conflicting local checkpoints, and preserves code-plus-progress commits. Existing record retry/no-overwrite/malformed/off-history protections remain. A2 supplies required durable progress, not a separate tracked .base.

**Compatibility/rollout:** Keep .base ignored. Existing unambiguous feedback/attempt provenance is sufficient; do not retrofit fake checkpoint records. Imported/rewritten/ambiguous histories require owner diagnosis and explicit evidence before advance. Update runtime fixtures to model real first-attempt history and shared helper callers together.

### A18. Keep IDs immutable; let the approved plan insert serial prerequisites

**Targets:** plan template and planner Re-plan/confirmation/self-review; artifact-types/schemas/body/registry (one execution/dependency projection); context's task-order reporting; precondition plan validation; orchestrator task matrix, selection, predecessor/whole gates, todo mirroring and dispatch references; code task preflight; task-feedback range/ownership instructions; state-machine docs; artifact/context/precondition/execution/orchestrator tests.

**Decision:** Use a single optional, versioned execution sequence in the existing plan, not new task numbers, a second status ledger, or a parallel/DAG scheduler. It directly reuses the serial driver. Physically moving Task 4 above Task 2 fails current lint; renumbering corrupts identity. A dependency-ready scheduler is viable but adds scheduling/selection behavior unnecessary for this insertion problem. Validate declared prerequisites against the chosen sequence; an acyclic graph can be serialized, but a real cycle cannot be waived by reordering.

**Steps:**

1. Keep plan headings and root metadata/table in existing numeric identity order, with new max+1 IDs, stable titles/paths and histories. Add optional execution metadata to the plan only. Absent means legacy numeric serial behavior; present must validate completely, never silently fall back. Its order contains every active ID once, including done tasks, and no abandoned/unknown ID. All-abandoned still skips only task gates; an empty new plan is still invalid.
2. An authorized re-plan appends the prerequisite's complete scoped task/log/root row and puts its new ID before the affected unresolved task in execution order. Preserve the relative order of surviving old IDs and the already fully gated prefix. Record why, the affected blocker/obligations, previous/new order and approval reference in Overview. Neither the metadata flag nor template decision defaults create authorization (A11/A14). An actual approved-intent change must return to its owner first.
3. Parse existing task Depends on from the same visible-Markdown/task boundaries used by lint, not raw hidden comments or another caller-specific regex. Return one typed projection reused by context, driver and admission. Validate known active IDs and earlier prerequisite positions; reject self/cyclic/unknown/abandoned or ambiguous declared prerequisites. Missing legacy declarations do not erase the surviving original sequence. Do not rewrite a frozen done task to normalize dependencies: an execution-only insertion may precede its unresolved correction/feedback while its definition remains immutable. A fully gated task keeps its original certification; new obligations use new tasks and A14 impact review.
4. Before changing or acting on the order, quiesce any current implementer. Resolve in-progress work through its owner/interruption protocol, never run two task writers. A gracefully blocked task can leave partial production edits uncommitted: obtain explicit preservation/isolation authorization and a verifiable locator before the prerequisite runs. No automatic discard, broad stash, staging or pre-commit. If safe parking is unavailable, stop for owner intervention instead of repeating the impossible task. Restore/reconcile the preserved work through that task's owner after its prerequisite clears.
5. Select the first not-fully-gated ID in the validated execution sequence; apply the existing task matrix to that ID. The predecessor is the previous execution slot, not N−1 or the immediately preceding numeric row. Require its durable fresh independent approval before the new checkpoint. A done-but-unapproved task is not a gated prefix. Complete Task 4's ordinary code/TDD/feedback loop, then return to Task 2; Task 4 never changes Task 2's row/history or declares it complete. Direct human/code dispatch obeys the same authorized selection contract; code retains one-task scope and verifies the committed plan revision supplied by the driver.
6. Re-evaluate current evidence and committed plan revision before every handoff; a changed order/worker/HEAD invalidates stale dispatch authorization. Todo mirrors the sequence but is not its authority. Preserve Task 2's original checkpoint and blocked attempts on resume (A17); do not rebase it onto Task 4. Its later full cumulative range legitimately includes the prerequisite commits: give feedback the peer-approved commit/path context, inspect the complete unchanged range, and attribute changes by commits/evidence rather than excluding whole filenames. Overlapping files still require review; new Task 2 changes cannot hide behind Task 4's approval.
7. All active tasks still need current done evidence and durable fresh feedback before whole review/finish. Sequence validity never substitutes for those gates. Shared context/admission reject malformed or unsupported execution metadata with an exact diagnostic. Keep A4's bounded-baseline conditions, A14's impact classification, and full-review fallback; do not reopen settled task history or treat the order as a material waiver.

**Edit snippets:** Add this optional frontmatter to plan.md for the approved example; ordinary legacy plans omit it:

```yaml
execution:
  version: 1
  order: [1, 4, 2, 3]
```

Plan headings and both root representations remain 1,2,3,4. Task 1's frozen definition/evidence stays untouched; Task 4 has its own Files/Acceptance/Steps/Verify/Commit and initial pending log. The reason in Overview explicitly says Task 4 provides the prerequisite for Task 2, not an expanded Task 2 acceptance contract.

After strict optional-metadata shape/version parsing, project active task identity and declared dependencies into the following shared types/helper (artifact-types and artifact-body, with .js imports). Caller retains the existing physical ledger checks:

```ts
export interface PlanExecutionContract {
  readonly version: 1;
  readonly order: readonly number[];
}

export interface TaskOrderEntry {
  readonly id: number;
  readonly dependsOn: readonly number[];
}

export const executionSequenceProblems = (
  tasks: readonly TaskOrderEntry[],
  execution: PlanExecutionContract,
): readonly string[] => {
  const active = new Set(tasks.map((task) => task.id));
  const order = execution.order;
  if (order.length !== active.size || new Set(order).size !== order.length ||
    order.some((id) => !active.has(id)))
    return ["Execution order must contain every active task exactly once"];
  const positions = new Map(order.map((id, index) => [id, index]));
  const problems: string[] = [];
  for (const task of tasks) {
    const position = positions.get(task.id);
    for (const dependency of task.dependsOn) {
      const before = positions.get(dependency);
      if (position === undefined || before === undefined || before >= position)
        problems.push(`Task ${task.id} requires active Task ${dependency} earlier in execution order`);
    }
  }
  return problems;
};
```

Dependency interpretation/ambiguity and valid positive IDs/version belong to the shared parser/schema before this typed helper; cycles necessarily violate earlier-position constraints. Re-plan separately compares the authorized previous sequence to preserve old relative order and gated prefix. Neither helper invents a dependency or authorizes an amendment.

Replace numeric selection and predecessor text in the driver with the validated sequence contract:

```ts
const current = executionOrder.find((id) => !isFullyGated(id));
```

Here isFullyGated is the existing evidence-based predicate over root/local completion, physical latest feedback, Git durability/freshness and applicable current contract, not a status-only callback or caller boolean. No current ID means only that all task gates hold; whole review/finish still run. Extend supported readers first to resolve legacy versus explicit order, expose separate identityOrder/executionOrder in context, and reject invalid explicit metadata before dispatch/admission; update every numeric-earliest/predecessor instruction and prompt together.

**Acceptance:** T35 demonstrates 1 → 4 → 2 → 3 with original scope/IDs and independent approval per slot. T36 preserves frozen done definitions and history during unresolved correction; T37 contains interruption/partial-work/changed-dispatch risk; T38 rejects invalid order or genuine dependency cycles and preserves legacy/all-abandoned behavior; T39 preserves cumulative checkpoints and complete review coverage. No parent task is marked cleared by its prerequisite, no fake TDD success, and no next task or whole review bypasses feedback.

**Compatibility/rollout:** This is an opt-in public scheduling protocol requiring schema, CLI/context/admission, planner, driver, code/feedback and docs to roll out together. Old readers allow additional metadata and old drivers still choose numeric order: verify installed capability/version before emitting execution, do not assume old lint protects the new policy. Legacy plans remain numerical without mass rewriting; adoption is an authorized re-plan preserving definitions/history, not migration inferred from dependencies or memory. Unknown versions/malformed explicit order stop without legacy fallback. Keep one writer and one plan authority, and validate ordering scenarios with controlled agent runs before declaring the new behavior proven.

## 8. Cross-component regression matrix

These are future implementation acceptance cases, not checks performed by this investigation.

| Case | Setup / perturbation | Required observable result | Covers |
| --- | --- | --- | --- |
| T1 | Root row done, metadata pending or wrong title/order/link. | Lint fails before dispatch; coder owns repair; no next checkpoint/review. | A1; U3–U5; H1/H3. |
| T2 | Root enters in-progress while initialized local log remains pending, or correction retains prior finalized local status. | Supported boundary remains lint-valid; no false done inference. | A1–A2 compatibility. |
| T3 | Latest attempt contains repeated/mixed terminal Outcome forms. | Lint and admission reject ambiguity; single historical unbulleted outcome passes. | A2; U11; H1/H3. |
| T4 | Ignored/untracked task log or failed latest-commit lookup with otherwise clean approved evidence. | Task gate closes; required containment is never skipped. | A2; U12; H1/H3. |
| T5 | Verification exits zero after changing to another clean HEAD. | Gate closes and names verified-identity change; no Attempt/spec writes. | A6; U13; H6. |
| T6 | Requested review plus bare applied disposition. | No finish clearance; name independent remediation verification as the next requirement. | A3–A4; U1/U2; H1/H2. |
| T7 | One full requested-change review, bounded correction, fresh task feedback, valid remediation clearance. | Exactly one full review, a bounded follow-up, finish opens with preserved composite coverage. | A4; U6; H2. |
| T8 | Scoped follow-up omits one blocker, introduces an unclassified material path, changes intent/target/Base, or refers to an invalid baseline. | Bounded clearance fails; full review/upstream repair occurs only for the stated invalidation. | A4/A9; H1. |
| T9 | Repeated same-range evidence question with no new located evidence or changed input. | No identical automated redispatch; bounded adjudication with exact missing evidence. | A3; U7/U8; H2/H5. |
| T10 | Relevant quality decision exists only in Overview/memory; task-local context is missing, stale, or unavailable. | New task gets applicable current constraints; stale memory is rejected; unavailability uses repository context without fake retrieval. | A5; U9/U10; H5. |
| T11 | Interrupt immediately before/after canonical-spec commit. | Durable Attempt exists before persistent mutation; same-attempt recovery neither duplicates nor invents result. | A7; U14/U16; H4. |
| T12 | Route qualification fails before merge/request readback; resume after strategy success or route commit. | No premature shipment, no duplicate effect, exact named route update and observed surviving-branch result. | A7–A8; U15/U16; H4. |
| T13 | Valid approved review with recent arbitrary ancestor Base or wrong target, with waiver on/off. | Mechanical scope check fails; waiver does not bypass it. | A9; U17; H1. |
| T14 | PR Outcome commits locally but push/provider readback fails; local-merge removes worktree; no-op has no remote effect. | No false completed remote state; paired evidence survives on the correct branch/base; no-op performs no forbidden effect. | Existing protections/A10; U18; H4. |
| T15 | Zero active tasks, legacy-global history transitioning to an explicit suffix, or malformed latest pass after older approval. | Empty task set still needs review/finish; legacy approvals remain supported, but bounded clearance needs a new full modern baseline; malformed last pass cannot fall back. | A1–A4/A10 invariant preservation. |
| T16 | Local merge succeeds, branch/worktree is removed, route fails, and a paired blocked Outcome persists; variant leaves a dirty owned route/map diff. | Clean-state repair-open validates historical admission/current HEAD and completes a new linked pair on base with zero repeat merges; dirty-state admission stops for explicit owner reconciliation, never auto-discards/pre-commits, and then revalidates. | A6–A9; U16/U17; H2/H4/H6. |
| T17 | Selected request-open strategy cannot satisfy a merge-required route; or a historical request later merges. | New incompatible intent stops before writes; historical eventual qualification uses merged readback/provenance and no duplicate request, or stops on insufficient evidence. | A7–A8; U15/U16; H4. |

Future commands, after implementation and without installing dependencies implicitly:

```bash
bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/workbench/review-passes.test.ts tests/workbench/precondition.test.ts tests/cli/precondition-command.test.ts
bun --bun vitest run tests/skills/orchestrate-contract.test.ts tests/skills/review-contract.test.ts tests/skills/finish-work-contract.test.ts
bun --bun vitest run
bun run build
```

### Expanded full-lifecycle cases

| ID | Scenario / input | Required result | Action / STPA trace |
| --- | --- | --- | --- |
| T18 | Rich planning resumes with draft/default-accepted or changed formal inputs; separately an authorized tactical/unattended planning request. | Unproven formal approval holds before code; exact current approval permits it; tactical absence/self-reviewed breakdown does not fabricate proposal approval. | A11/A14; U19; S12; H1/H5. |
| T19 | Cross critique verdicts with accepted/applied/rejected/skipped dispositions. | changes-requested/skipped holds at owner; legitimate applied/rejected settles without redundant critique; stage naming never overrides unresolved disposition. | A11; U20; S13; H1/H2. |
| T20 | Rename a blocked task with existing feedback; controls have no feedback or already fully synchronized historical names. | Future planner keeps identity or appends a new ID; no reviewer-owned history rewrite; safe/historical controls remain supported. | A12; U21; S14; H2/H3. |
| T21 | Stop initialization after each scaffold file; variant includes an attempt, feedback, checkpoint or unexplained partial code. | Only proven authorized pending/history-free missing artifacts are initialized; existing bytes preserved; history-bearing case goes to owner. | A13; U22; S15; H2/H3. |
| T22 | Requirements/design/standards change after task approval, with affected/unaffected obligations and a generic material waiver. | Explicit impact/re-plan/new obligations, not reinterpretation of frozen history; unaffected evidence retained; waiver cannot invent current authorization. | A11/A14; U19/U23; S12/S16; H1/H5/H6. |
| T23 | Re-plan adds remediation after frozen done tasks and abandoned IDs. | Preserve all prior definitions/IDs/history; new tasks use new IDs and full gates; no silent reassignment of earlier approval. | A12/A14/A10; U21/U23; S14/S16; H1/H3. |
| T24 | Valid route control; duplicate IDs/dependencies, unknown/self/cyclic edges, and metadata/body identity/order mismatch. | Relational diagnostics reject incoherence before entry; valid control still passes; causal semantic review and reachability remain required. | A15; U24; S17; H1/H3/H4. |
| T25 | Proposal/plan have different valid route refs, or proposal is non-null while an existing plan is null; controls match or proposal is null. | Conflict/missing propagation surfaces both references and stops before effects; no silent restoration/release; controls resolve without false conflict or legacy guessing. | A15; U25; S18; H1/H3/H4. |
| T26 | Two branches read the same pending route revision and use distinct/suffixed workspace names. | Competing visible claim requires resume/transfer/stop, not duplicate work; cross-clone exclusivity uses explicit shared authority, not a false local-lock claim. | A16; U26; S19; H2/H4/H6. |
| T27 | User withdraws/transfers a claimed unit with partial work, then variant with already observed delivery. | Explicit owner decision preserves work, records release/transfer and revalidates dependencies; delivered variant never resets shipment or repeats delivery. | A7/A16; U28; S19; H2/H4/H6. |
| T28 | Valid feedback ancestry uses a later Base than the first task checkpoint. | Shared historical-base verification rejects cropped coverage; correct cumulative base/code-plus-evidence commit passes. | A2/A17; U27; S20; H1/H3. |
| T29 | Same task history in two worktrees, missing or conflicting ignored checkpoints, or initial pending-log commit before first attempt. | Recover only consensus first-attempt provenance; do not use initial-log parent or current HEAD; retain ignored/no-overwrite convention. | A17; U27; S20; H1/H3. |
| T30 | Tactical behavioral change versus internal no-behavior change. | Planning records early spec-impact/delta obligations; behavioral delta is approved before finish; internal case does not acquire a compulsory heavyweight proposal. | A11/A14; U19/U23; S12/S16; H1/H5. |
| T31 | Existing standards/data, legacy-only state, migration failure/recovery, unresolved or later-changed verification commands. | Preserve sources/standards; run existing migration-before-scaffold/recovery; no ProjectReady on unresolved facts; current commands reach generation/verification. | A10/A13/A14; U29; S15/S16; H1/H5. |
| T32 | Genuinely empty new plan, all-abandoned declared plan, and active task with empty ledger. | Empty new plan/active mismatch reject; all-abandoned skips only task gates, never whole-review/spec/delivery checks. | A1/A10; H1/H3; retained protection. |
| T33 | Isolated non-default/linked workspace contains another active change or changed ownership/input state before cleanup. | Isolation is not sole ownership; agree retention before effects or stop; no shared-data deletion and no manufactured successful cleanup. | A7/A16; U28; S19; H4/H6. |
| T34 | Actual non-default map target, linked default-target or detached checkout reports isolated; control is the owned feature branch initially sharing the target commit, plus historical A7 repair on base. | New-generation role check stops before writes; correct named source proceeds; empty whole-change package remains rejected; historical repair still follows its separate admission and cannot start new code. | A7/A16; U30; S19; H4/H6. |
| T35 | Task 1 gated, Task 2 blocked on unforeseen work, Task 3 pending; new Task 4 provides it; serial sequence becomes 1,4,2,3. | Numeric headings/paths/root rows stay 1,2,3,4; Task 4 gets its own code/TDD/fresh approval before Task 2 resumes; Task 2 Acceptance/Files do not absorb extra scope; neither 2 nor 3 is skipped. | A18; U31/U32; S21; H1/H2/H3/H5. |
| T36 | Task 2 has root done but fresh changes-requested/uncleared feedback; separately a fully gated original prefix. | Execution-only insertion can precede unresolved correction without editing its frozen definition/attempts/title; a fully gated prefix and old relative order remain fixed, with new obligations separately reviewed. | A12/A14/A18; U31/U32; S21; H1/H2/H3. |
| T37 | In-progress worker or blocked Task 2 leaves partial edits; order changes during Task 4 dispatch; then a safely parked/restored control. | Quiesce and obtain scoped owner preservation before any other writer; no discard/broad stash/fake commit; stale dispatch stops; safe restoration uses original Task 2 checkpoint/history. | A6/A17/A18; U31/U32; S21; H1/H2/H3/H6. |
| T38 | Duplicate/missing/unknown/abandoned IDs, unknown version, forward/cyclic or ambiguous prerequisites; controls omit execution or have all tasks abandoned. | Invalid explicit sequence never falls back or bypasses lint/gates; real cycle goes to owner; absent metadata preserves numeric behavior; all-abandoned still requires whole review/finish. | A1/A18; U31/U32; S21; H1/H2/H3. |
| T39 | Task 2 blocked then Task 4 committed/approved then Task 2 correction overlaps a prerequisite file. | Preserve Task 2 Base/old attempts; review complete cumulative range with peer context and commit-level ownership, not filename hiding; all active approvals and whole/integration clearance remain mandatory. | A2/A4/A14/A17/A18; U32; S21; H1/H3/H5. |

## 9. Adoption, containment, and rollback

1. Ship A1/A2/A6 and their tests first. They expose inconsistent evidence and bind verification without changing review scope. Report repair owners; preserve all raw history.
2. Ship target-scope support and caller migration (A9), then A7/A8 as a coordinated finish skill/schema/CLI/template/document update. Test new planned sync, immutable old completed-sync Attempts, and narrow post-delivery repair. Reconcile a dangling old attempt before new protocol work; incomplete legacy admission provenance requires owner intervention.
3. Add A3/A5 task-context and routing changes. Record resource/CLI versions together; an installed package is not automatically the source checkout.
4. Enable A4 only after all consuming readers, skills, templates, dispatch references, and tests understand it. The first attempt with insufficient bounded-scope evidence takes the full-review path; it does not use a waiver to manufacture clearance.
5. Run the controlled T7/T11/T12/T14/T16/T17 workflows and inspect outputs. Monitor full-review count per bounded correction, unchanged redispatches, task-mismatch detections, and dangling attempts recovered without duplicate effects. Treat increasing mismatch/redispatch rates as evidence to diagnose, not a reason to weaken gates.
6. Rollback means stop writing new-shape clearance/finish records and use full review for new work. Keep existing history; older readers may safely reject new verdicts but cannot be assumed able to resume new planned-sync Attempts. Reconcile through a compatible reader or explicit owner intervention, never by deleting evidence or rewriting a completed outcome.

Do not implement a global exemption for finish-owned paths across attempts, auto-promote applied metadata, backfill old approvals, or ask the controller to repair another stage's artifacts. Those cheaper-looking options transfer uncertainty into delivery authorization.

## 10. Investigation verification and limitations

The report is an evidence-backed plan, not proof that the proposed controls work. Its model and finding predicates were cross-checked against the named source readers/writers. Two narrow current-source probes ran: recordFields demonstrated duplicate-Outcome last-wins parsing; validateArtifact accepted the valid route control and five malformed relational route cases. Neither exercised full lifecycle admission, implemented a fix, or tested a proposed control. No implementation patch, workflow execution, full test suite, build, merge, push, or provider operation was performed.

STPA method reference: MIT's [Books and Handbooks](https://psas.scripts.mit.edu/home/books-and-handbooks/) describes defining purpose, creating control structures, identifying unsafe control actions, building scenarios, and developing constraints. Its readable page was inspected. The linked handbook PDF could not be text-extracted by the available fetch provider; no quotation or claimed full-handbook reading relies on it.

Historical artifacts and installed package versions for the four incidents were not available here. No exact historical reproduction, incident frequency, or exhaustive proof of absence is claimed. Semantic review adequacy, explicit requester authorization, complete test-suite selection, and future harness/model behavior remain facts that structural validation alone cannot prove.

### Independent review disposition

| Review | Observed result | Disposition |
| --- | --- | --- |
| Evidence audit, run `798c41c9-b58c-4eee-81f9-5c1ba4c71c1f` | Supported decision-critical current-state claims, snippet placement, and action coverage; flagged legacy baseline provenance ambiguity. | Accepted. A4 now requires a modern full baseline after legacy-global transition and binds it to an immutable Parent commit. No removed provenance is reconstructed. |
| Initial control/safety review, run `207a9fb0-a0a8-44d0-af2e-94eaef568b91` | Blocked plan acceptance on missing paired-blocked post-delivery repair; also flagged legacy provenance and incompatible strategy/route qualification. | Accepted all three findings. A7–A9 define separate repair admission on the surviving branch/base with no repeated delivery; A4 fixes the baseline; A8 validates compatibility before effects. T15–T17 exercise the corrections. |
| Bounded follow-up, run `74b52beb-9520-4445-87c3-18863d2b5383` | Marked all three prior findings addressed, no new findings, verdict OK with notes. Asked whether dirty owned diffs require reconciliation or intervention. | Chose explicit owner intervention. Follow-up accepted that boundary but had not inspected its final insertion; the parent added and checked the rule in A7, A8, and T16. No automatic discard/pre-commit is authorized. |

The follow-up challenged only the changed recovery/compatibility argument; it did not restart the complete investigation or claim runtime verification of proposed controls.

### Mitigation traceability check

| Action | Hazard / constraint | Unsafe actions | Causal scenarios | Acceptance cases |
| --- | --- | --- | --- | --- |
| A1 | H1/H3; SC1/SC3 | U3–U5 | S2 | T1–T2 |
| A2 | H1/H3; SC1/SC3 | U11–U12 | S5–S6 | T3–T4 |
| A3 | H2/H5; SC2/SC5 | U1/U7/U8 | S1/S3/S8 | T6/T9 |
| A4 | H1/H2/H3; SC1/SC2/SC3 | U1/U2/U6/U17 | S1/S3/S11 | T6–T8/T13/T15 |
| A5 | H1/H5; SC1/SC5 | U9–U10 | S4 | T10 |
| A6 | H6; SC6 | U13 | S7 | T5/T16 |
| A7 | H2/H4/H6; SC2/SC4/SC6 | U14/U16 | S9/S10 and post-delivery premortem | T11/T16/T17 |
| A8 | H4; SC4 | U15–U16 | S10 | T12/T16/T17 |
| A9 | H1/H6; SC1/SC6 | U17 | S11 and repair-scope premortem | T8/T13/T16 |
| A10 | H1–H6; SC1–SC6 | U1–U18 | S1–S11 and retained-protection cases | T1–T17 |

### Initial-pass checks performed on the deliverable

- Validated 37 local links, source line ranges, and heading anchors; checked balanced fences and complete unique F1–F11, A1–A10, U1–U18, and T1–T17 entries.
- Parsed all 11 proposed TypeScript snippet blocks with Bun's TypeScript transpiler, wrapping isolated method/property fragments in their declared syntactic contexts. This is syntax validation only, not type checking, integrated compilation, or behavioral verification.
- Inspected the actual duplicate-Outcome helper and ran the narrow source-execution probe. Its output was `blockedThenDone: {Outcome: done}` and `doneThenBlocked: {Outcome: blocked}`. No complete gate bypass is claimed.
- Confirmed tracked and staged diffs are empty and HEAD remains the investigated commit. The only new non-runtime repository file is this report; `.pi/` contains goal/subagent runtime state and remains preserved.
- Checked the dirty-tree intervention rule and post-delivery repair/fallback cases. No proposed fix or future T1–T34 acceptance workflow was executed.

### Expanded full-lifecycle review disposition

The user clarified that the four incidents were examples. The expansion adds explicit 16-transition/12-predicate coverage, F12–F20, U19–U30, S12–S20, A11–A17, and T18–T34. It preserves correctly controlled entry/migration, all-abandoned, path identity, material-freshness, and completed-task histories rather than labeling them defects.

- Independent upstream scan `884e44f7-5129-4f5d-9571-7c1e93157ff1`: accepted five approval/critique/re-plan/scaffold/invalidation findings, with normal-path and backstop qualifications.
- Independent cross-stage scan `7e322d1c-4f8d-4289-a0f6-4204fa3de208`: accepted checkpoint equality, route-reference conflict, and branch-local claim findings; retained its disconfirming identity/material/empty-task evidence. A17 reuses existing historical recovery instead of adopting another tracked checkpoint record.
- Parent source/probe check added route relational validation (F17). Core migration's staged/leased recovery is present; it is not the missing initial-plan repair path. A fully synchronized historical rename remains supported.
- Bounded expanded-plan review resumed as `3469ceab-4bb0-48fa-b54c-d41bb57da1ff`: no issues found, OK with notes. It source-checked added lifecycle coverage and controls, with no probes/tests/builds/delivery. Its initial readiness wait ended without inspection; that incomplete handoff was not treated as approval.
- Parent's final conservative refinements make initial-scaffold recovery depend on the original initialization revision, declare the shared type/result shapes, use iterative graph traversal, and refuse a non-null proposal paired with an existing null plan. The same reviewer examined those short deltas in the bounded follow-up below; they remain behaviorally unverified.
- Bounded final-delta challenge `dc8bfc51-c0a4-46f0-854b-627566f1e49b`: no issues found, OK with notes. It confirmed F19/U30's early target-write mechanism, empty-package disconfirmation, A16's pre-generation guard/A7 carve-out, and the short scaffold/route/checkpoint refinements. T34 must distinguish branch roles when tips share a SHA and normalize local/remote target aliases; that note is incorporated. No tests/edits/Git effects occurred.
- Final coverage/links/fences/snippet syntax and repository footprint checks are recorded below. The earlier completion audit covered the earlier pass, not this expansion.

### Expanded mitigation traceability

| Action | Hazard / constraint | Unsafe actions | Causal scenarios | Acceptance cases |
| --- | --- | --- | --- | --- |
| A11 | H1/H2/H5; SC1/SC2/SC5 | U19/U20 | S12/S13 | T18/T19/T22/T30 |
| A12 | H2/H3; SC2/SC3 | U21 | S14 | T20/T23 |
| A13 | H2/H3/H5; SC2/SC3/SC5 | U22/U29 | S15 | T21/T31 |
| A14 | H1/H5/H6; SC1/SC5/SC6 | U19/U23/U29 | S12/S16 | T22/T23/T30/T31 |
| A15 | H1/H3/H4; SC1/SC3/SC4 | U24/U25 | S17/S18 | T24/T25 |
| A16 | H2/H4/H6; SC2/SC4/SC6 | U26/U28/U30 | S19 | T26/T27/T33/T34 |
| A17 | H1/H3; SC1/SC3 | U27 | S20 | T28/T29 |
| A18 | H1/H2/H3/H5/H6; SC1/SC2/SC3/SC5/SC6 | U31/U32 | S21 | T35–T39 |

A10 now spans T1–T39 and all documented C/E controls, including protected cases. Existing A1–A9 traceability remains unchanged; the expansion does not weaken their clearance, verification, shipment, or finalization-repair requirements.

### Prior expanded-deliverable checks (before report commit)

- Matched the coverage ledger to all 16 documented C transitions and all 12 E predicates. Verified unique complete F1–F20, A1–A17, U1–U30 and T1–T34 entries, with targets/steps/acceptance/compatibility contracts for every action.
- Validated 64 local references, line ranges and heading anchors; balanced code fences and clean whitespace. Parsed all 17 TypeScript blocks in their appropriate object/method/interface/function contexts. This proves syntax only, not types, integration, or proposed behavior.
- Confirmed branch fix/finish-work-gates and HEAD ebfa4f53624f3ea9d6a201b2f69c9c262246ac83 remain unchanged; tracked/staged diffs are empty. This report remains the only changed non-runtime repository file; .pi/ state is preserved.
- Independent static review and its bounded delta challenge accepted the expanded analysis. Two current-helper probes ran at that pass; no future acceptance workflow, implementation fix, full suite/build, or delivery operation ran. The report is a remediation plan, not runtime assurance.

### Task-sequencing follow-up

The user supplied another observed workflow problem after committing the earlier report. F21/S21, U31–U32, A18 and T35–T39 address it without narrowing the prior lifecycle coverage. The proposed execution order remains separate from numeric storage/identity order and uses the existing serial approval/checkpoint loop.

- Parent traced plan/template, driver selection/predecessor, code scope/blocked partial-work, ledger/context and finish readers. The third narrow probe family executed the actual validateArtifact reader on in-memory ordering fixtures: ascending IDs with forward Depends on were valid and produced empty task fields; physically reordered stable IDs failed non-monotonic-record. Initial path-mismatch diagnostics were corrected by using a canonical fixture path string; no live artifacts were written.
- Focused fresh-context review `7e194fde-5f18-426a-b152-82505b3d315d` (workflow `a20502a6-395e-4645-ac93-606b855e75e4`): no issues found; verdict OK for this report addition. It source-checked identity/order composition, frozen root-done correction, partial-work ownership, dependency/version validation, cumulative Base/range and A4/A14 integration. No tests, edits or Git effects occurred.
- Proposed execution metadata/helper/selection have not been implemented or behaviorally tested. Prior expanded-pass validation counts above describe that earlier snapshot, not this addition. Final follow-up artifact checks are recorded below.

### Final task-sequencing deliverable checks

- Coverage remains all 16 documented transitions and 12 admission predicates. Verified complete unique F1–F21, A1–A18, U1–U32 and T1–T39 entries and full action contracts.
- Validated 70 local references/line ranges/anchors, balanced fences and clean whitespace. All 19 TypeScript blocks parse in their declared syntactic contexts; this is not type checking, integration or scheduling-behavior proof.
- HEAD remains report commit f07473988631196efc408ea118d5a7c3f4894c54 on fix/finish-work-gates. The only tracked diff is this report; staged diffs are empty and .pi/ runtime state is preserved. No new commit, implementation fix, live change artifact or delivery operation was created in this follow-up.

## 11. Implementation rollout tracking

This section is the current implementation tracker, separate from the preceding historical investigation and review record. The action specifications in §7 and scenario oracles in §8 remain authoritative; this table maps every acceptance and compatibility clause to implementation ownership and rollout order. A status here does not replace those contracts.

**Rollout-map baseline (before implementation):** No remediation action or T-case had been implemented or verified when this tracker was added by a documentation-only change. The supplied baseline records `bun run build` passed; `.pi/verification/mv2elq7d-jczez0/baseline-tests.log` records 44 Vitest files and 611 passing tests. Those are baseline results, not verification of the implementation statuses below.

### Rollout order and ownership

The implementation is multi-seam. Each named seam has one exclusive writer at a time; hand off only after its focused changes and checks are complete. Adjacent slices overlap shared artifact readers, runtime ports, templates, or skills and therefore remain serial. Do not start parallel writers on the same seam, create caller-specific duplicate helpers, or emit a new artifact grammar before all consuming readers and callers support it.

| Order | Exclusive owner seam | Actions / boundary | Required handoff condition |
| --- | --- | --- | --- |
| 1 | Format | A1, A2, A15 and the shared artifact grammar parts of A4/A11/A18. Own `artifact-body.ts`, types, schemas, registry, templates and parser fixtures as one coordinated format pass. | One visible-body projection and each shared typed contract have the required compatibility controls; malformed input returns structured diagnostics. Readers precede writers. |
| 2 | Admission / checkpoint | A2, A6, A9, A17 and admission portions of A4/A7/A11/A14/A18. Own precondition artifacts/reviews/Git/runtime, diff Git adapters and admission CLI wiring. | Required identity, target, durability and historical-checkpoint predicates are shared by their callers; no missing port silently omits a gate. |
| 3 | Plan contract | A1, A11, A13, A14, A18 and plan-related A15 binding. Own plan task projection, execution/dependency contract, context projection and plan-specific admission. | Identity order and any explicit execution order are distinct, versioned, consistently read, and invalid explicit data never falls back. |
| 4 | Planning resources | A1, A5, A11–A14, A16, A18. Own planner/code/orchestrator/feedback skills, dispatch references, plan/progress/task templates and diagrams. | Writers, dispatchers and reviewers describe the same owner boundaries, evidence and recovery sequence; no task scope/history is silently rewritten. |
| 5 | Review | A3, A4, A9 and review portions of A11/A14/A17. Own review-pass parsing, review templates/skills, findings and clearance instructions. | Full baseline, physical-latest authority, finding identity, target/scope and invalidation grammar agree across reader and writer; ordinary and legacy review controls remain valid. |
| 6 | Route | A8, A15, A16 and route portions of A7/A9. Own route relation validation, context binding, producer/consumer and shipping qualification instructions. | Route identity, dependencies, owner/source-target role and observable shipping condition agree; conflicts stop before writes. |
| 7 | Finish | A6–A9, A11, A14, A16. Own finish history/schema/template, finish skill, repair admission and strategy readback contracts. | Attempt precedes effects, repair has distinct authorization and exact allowlist, route follows observed qualification, and readers cannot replay delivery. |
| 8 | Integration | A10 plus cross-seam integration for A1–A18. Own full fixture migration, CLI/skill compatibility checks, controlled evaluation and final adoption evidence. | Focused regressions, full suite/build, and isolated agent scenarios report their actual evidence layer; no wording/build result is represented as agent-behavior proof. |

**Serial dependency order:** A1 → A2; A6 is an independent early foundation. A15 precedes route consumers and A7/A8/A16. A9 follows A6 and establishes target/Base semantics before A4 and finish repair. A3 follows A1/A2; A5 and A12 follow the shared handoff foundation. A11 precedes A14 and A13; A14's impact classification must preserve A4 invalidation. A17 follows A2. A4 follows A1–A3 and A9, and must coordinate with approved-intent/impact readers. A7 follows A2/A6/A9 and the route/approval inputs it records; A8 follows A7. A16 follows A7/A9/A15. A18 follows A1/A2/A11/A14/A17 and is last among plan/driver contracts. A10 adds focused checks within each slice and runs integration/controlled evaluation only after readers, writers, resources and tests agree. This ordering preserves the documented action dependencies while avoiding overlapping concurrent edits.

**Approved policy constraints for all owners:** A4 retains one full branch review and permits only reviewer-owned, baseline-bound, independently verified bounded remediation clearance with full-review fallback on invalidation; `decision: applied` is never clearance. A11 requires explicit requester approval tied to exact committed formal-intent revisions, permits tactical absence and authorized unattended breakdown self-review, and never infers approval from defaults or legacy drafts. A16 uses the designated user/controller to serialize unit claims and delivery, one owner per unit and one writer per change/worktree; cross-clone concurrency is unsupported, no lock/service is added, and ambiguous/shared/dirty work is retained for explicit owner intervention. These settled policies must not be reopened as implementation options.

### A1–A18 action/resource/acceptance/compatibility matrix

Each row states its current slice status. “Implemented” describes only the exercised mechanical/resource scope named there; controlled-agent and external-effect behavior remains unverified unless separate scenario evidence is recorded. The acceptance and compatibility cells summarize all clauses in the corresponding §7 action, including protected legacy and rollout behavior, rather than treating example snippets as the contract.

| Action / exclusive owner | Dependency and resources | Acceptance contract to verify | Compatibility and rollout contract to preserve |
| --- | --- | --- | --- |
| **A1 — parser, precondition and resource changes implemented; controlled-agent behavior unverified**; format + planning resources | None. `artifact-body.ts`, shared ledger comparator, `precondition-artifacts.ts`, progress template, coder/orchestrator/implementer prompt and artifact/lint tests. | Lint rejects metadata/body mismatch before code or feedback, including status/title/order/ID/link and active-empty cases; accepts root in-progress with initialized pending log and correction with prior finalized local log; diagnoses contradictory done/blocked handoffs without requiring sibling tasks complete. Only coder repairs proven selected recording omissions; repair preserves sibling bytes/history, never invents done attempt, and changed task-progress revision requires fresh feedback. Root aggregate is implementation summary only. | Stricter lint diagnoses exact owners and does not mass-normalize existing artifacts. Preserve historical attempts and one root ledger; update mismatch-dependent positive fixtures. Never add aggregate `complete` as a finish gate. |
| **A2 — latest raw terminal-Outcome uniqueness and durable provenance implemented; controlled-agent behavior unverified**; format + admission/checkpoint | A1 shared handoff. `readWorkflow`, `inspectTasks`, `durableArtifact`, implementation-commit lookup, shared `task-checkpoint.ts`, diff/precondition Git/runtime adapters, task-handoff resources, and artifact/diff/precondition tests. | Latest-attempt duplicate/mixed terminal Outcome fails lint/admission; one historical unbulleted Outcome and pending logs without attempts remain valid. Ignored/untracked task-progress content or missing/non-full implementation revision closes admission despite otherwise clean/approved evidence. A code-plus-task-progress commit remains valid, its implementation commit resolves, and feedback Head contains it. Focused Vitest and isolated signed actual-source CLI/Git fixtures exercise these predicates; native agent behavior remains unverified. | Enforce uniqueness only for the physical latest attempt; do not rewrite/reinterpret older attempt bodies. Keep supported provenance and pending initialization. Do not require the ignored `.base` cache to be tracked. Diagnose historical ambiguity; never let optional/missing revision lookup skip containment. |
| **A3 — bounded finding classification/identity and evidence-gap clearance mechanics implemented; native dispatch/reviewer behavior unverified, component review pending**; review + planning resources | A1–A2. Orchestrator task/branch matrices, reviewer/feedback finding protocol and templates; parser only if typed fields are consumed. | Reworded evidence questions route to evidence adjudication rather than automatic code change. Same range/obligations/evidence with no new resolving input stops identical redispatch; new located evidence can trigger the existing focused review path. Confirmed code defects still get implementation verification and independent approval. Material-stale requested changes retain/classify findings but never authorize finish. | Finding kind/ID is additive after existing location grammar; synthesize stable legacy IDs as `pass-N-blocking-M`, preserve them on carry-forward, and adjudicate unclear legacy findings. No resume database. Human review lacking retry purpose is not silently upgraded to approval. |
| **A4 — bounded cumulative review-clearance validation implemented and regression-tested; independent reviewer/driver behavior unverified, component review pending**; review + admission | A1–A3 and A9; coordinate `review-passes.ts` with target/scope grammar. Types/body projection, precondition review predicate, root-review template/skill, driver/finish wording and parser/admission tests. | One full requested-change review plus bounded correction, normal task gates and independent resolving pass can produce valid `approved-remediation` clearance without another full inspection. Independently resolve every outstanding blocker and verify affected integration behavior. Reject bare `applied`, unresolved/invented/partial blockers, forged/missing/structural legacy parent, off-branch delta, unrelated/unclassified material, changed intent/target/Base, invalid provenance, amended reviewed commits or unbounded impact. Failed latest scoped pass cannot revive older approval. Keep full review count one unless a named invalidation requires fallback; A3 bounds repeated scoped attempts. Reviewer traces changed contracts/correction paths and falls back to full inspection when bounded interaction impact cannot be justified. | Reviewer-owned root-review-only verdict; task-feedback vocabulary unchanged. Full review remains default and integration/affected-consumer coverage is required. Preserve ordinary approved and supported legacy-global ordinary clearance; legacy-global transition needs a fresh explicit modern full baseline, never fabricated historical provenance. Do not auto-convert applied metadata. Ship matching CLI/readers/templates/skills before writers; old readers must reject new verdict; schema-invalid legacy applied metadata requires authorized repair, not bypass. Plan edits are limited to the exact numbered-remediation amendment; after A18, its exact authorized execution-only amendment may accompany that remediation without discarding the baseline. Changed requirements/definitions or unbounded effects require full review. |
| **A5 — planning/code quality-context resources implemented and contract-tested; generated-work behavior unverified**; planning resources | Independent; integrate with A1 handoff. Planner context, plan task blocks/template, coder pre-generation/self-review/handoff and implementer prompt. | Plan resources direct the planner to current project standards, touched canonical specs, and relevant optional decision history; code resources consume task-local quality/decision context without rewriting legacy task definitions. Planning-resource contracts exercise applicable-context transfer, optional-memory boundaries, and legacy preservation. Native generation against a concrete rubric/decision and reviewer evidence tracing remain unverified. | Memory is optional/harness-neutral; no Pi/private path/credential/service dependency. Additive task text works with existing headings. Do not rewrite in-flight tasks; use for new/remediation tasks and supplied dispatch. Preserve independent review. |
| **A6 — verified-HEAD admission binding implemented; controlled finish-agent behavior unverified**; admission/checkpoint | None. Precondition service/Git ports and finish gate-entry consumer; precondition and actual-source CLI tests. | Stable clean HEAD passes with `verified-head` before the final `gate: open`; clean commit/checkout to a different HEAD during successful verification fails, and unresolved HEAD errors. Supplied-command and clean-tree checks remain. Branch/worktree/target identity is rechecked; changed branch or worktree stops even when SHA matches. Service tests cover same-HEAD branch/worktree changes, while the isolated CLI fixture covers clean HEAD substitution. | Add the output field without changing the final-line contract; update the finish resource in the same release. Identity checks reduce races but are not a lock; later external mutation still requires a fail-closed retry. No controlled finish-agent effect sequence was run. |
| **A7 — not implemented / unverified**; finish + admission/checkpoint | A2, A6, A9; coordinated with A8, A11/A14 and A15 route inputs. Finish skill/history, template, strategy schema/body, precondition CLI/runtime and immutable Git readers. | Read-only input/delta/strategy compatibility failure creates no Attempt/spec effect. Attempt is durable before spec mutation and records admission/target/review/input identities; spec Outcome reflects observed commit or verified no-change; unmatched recovery reuses same Attempt and completed/blocked pairs remain immutable. Pair-blocked post-delivery repair links original/latest repair, validates original scope against recorded target/review, uses distinct `repair-open`, proves prior effect independently, enforces exact remaining-effect allowlist and unchanged clean verified repair HEAD, and completes a new pair with no repeated merge/request/destructive cleanup. Forged provenance, changed inputs/route, dirty tree or missing authorization closes repair; dirty state is reported and owner-reconciled, never auto-discarded/staged/pre-committed. No normal attempt consumes repair-open. | Historical observed-sync attempts remain immutable; new planned sync has observed Outcome. New `reconcile-delivery` is a repair executor mode, not a fourth ordinary shipping strategy; old schemas reject it, new readers preserve old data but do not auto-repair incomplete provenance. Update parser/schema/CLI/skill/template/docs and old sync-before-Attempt assertion together. Rollback retains blocked evidence and requires compatible reader or owner intervention. |
| **A8 — not implemented / unverified**; route + finish | A7. Finish strategy/route qualification flow, route/map readback, recovery and route scenarios. | Failed merge/push before qualification leaves unit unshipped. Request-open qualifies only if route rule says so; merge-required plus open-request strategy fails before Attempt/spec/request. Historical open request can qualify later from merged readback and immutable provenance without duplicate request; ambiguity stops. No-op cannot imply remote delivery. Dangling and paired-blocked recovery finish only on surviving branch/base with no delivery replay. | Never mass-revert route state or infer historical fault; diagnose actual pair/rules and use authorized owner. Preserve partial unit/map state and sibling bytes. Verify local-merge route result on base after merge; do not alter shipping rule to fit strategy. Dirty partial effects require owner reconciliation. |
| **A9 — explicit required target and merge-base admission implemented with signed source-CLI controls; native repair behavior unverified, component review pending**; admission/checkpoint + review | A6; coordinate parser with A4 and target role with A16. Required target CLI/runtime argument, target resolution, exact merge-base review predicate, tests and all callers. | Actual target merge-base passes; recent arbitrary Base, unknown/mismatched target and changed base fail even under material waiver. Legacy target-less review passes only with explicit target, no fabricated field. Missing CLI target is named error. Ordinary Base→Head, Head→current and material checks remain; repair uses historical A7 view, not current post-merge merge-base. | Intentional CLI/API required-input change. Update every caller, port fixture, example and finish resource together. Preserve legacy reading with explicit target; disclose version boundary and never deploy only a new skill against old CLI. |
| **A10 — not implemented / unverified**; integration | All actions; focused unit/runtime/CLI/wording tests and opt-in supported agent harness. | Every action's regression passes at its claimed layer; rejection asserts gate output and unchanged files; full Vitest/build/typecheck pass. Controlled runs count dispatch scopes, record independent verdicts and inspect artifacts/effects/readback; zero-return fake alone does not prove remote effect. | Wording tests stay labeled as wording only. No mandatory provider/dependency or production orchestrator. Agent runs are opt-in, isolated, version-recorded; if harness unavailable, mark behavior unverified. Destructive/provider tests only in disposable/approved resources; retain signing policy, never disable host signing. |
| **A11 — mechanical artifact/consumer contracts implemented in this slice; controlled planning/approval behavior unverified, component review pending**; format + planning resources + admission | Requester-approved policy; coordinate artifact enums/templates, propose/critique/planner and finish semantic preflight. A14 consumes revision impact. | Formal intent must be explicitly owner-approved over exact committed bytes and mutually consistent; approval reference/revision persists and is revalidated before code/finish. Tactical absence is allowed; authorized unattended planning may self-review breakdown but cannot manufacture formal approval. Critique changes-requested/skipped holds at artifact owner; approved/skipped has no clearance; applied/rejected stays settled without redundant critique. CLI may reject missing/stale evidence but cannot authenticate owner. Internal-only tactical work needs no formal input; a bounded behavioral delta uses requirements-only requester approval without proposal/design. | Approved public protocol is fixed. Update design/delta enums, templates, CLI, portable skills/readers/writers together before enabling approved status. Old linters reject new approved values, old precondition omits semantic check. Legacy draft/default-accepted requires current explicit confirmation; no inferred approval or mass rewriting. Preserve source attribution and legitimate historical approval evidence. |
| **A12 — plan/re-plan identity and history-preservation resources implemented and mechanically tested; native re-plan behavior unverified**; planning resources | A1. Planner re-plan and execution/feedback identity contracts. | Plan and feedback resources require frozen task identity/title/path/history, explicit abandonment before replacement, and append-only new numeric IDs; done tasks are never renamed. Parser, context, precondition and signed consumer controls cover historical-definition preservation, later-attempt provenance and blocked-origin cases. Native planner behavior on real interrupted/feedback-owned work remains unverified. | No new identity schema. Stranded history requires owner adjudication, never automatic reviewer-owned feedback/header migration. |
| **A13 — initial-proof history verifier and narrowly scoped context recovery implemented; actor recovery behavior unverified, component review pending**; plan contract + planning resources | A1 and A11. Planner initialization recovery, context diagnostics, scaffold rules and temp-Git/init tests. | Interrupt after any scaffold file can fill only proven-missing initial pending artifacts from authorized breakdown and original full initialization HEAD; all existing bytes preserved. Any attempt/feedback/checkpoint/task-owned work, deleted historical execution file or ambiguous/missing baseline holds for owner. Never synthesize Attempt. T31 preserves standards/data and migration-before-scaffold/no-guess ordering, and blocks readiness while required project facts, standards, or verification commands remain unresolved. | Explicit owner-directed initialization recovery, not automatic normalization. Reuse core migration recovery without replacing it. Empty plan remains invalid; all-abandoned follows separate existing path. |
| **A14 — input-impact artifact/context/admission contracts implemented; independent owner classification behavior unverified, component review pending**; plan contract + admission/checkpoint | A11; coordinate A4 fallback and A18 task-contract snapshots. Planner/task evidence, input blobs, impact classification and review/preflight writers. | Changed acceptance is identified without discarding frozen history; owner classifies affected unfinished/new obligations versus unaffected approvals and independently reviews map. New obligations append tasks; relevant intent change invalidates/reviews through A4; unresolved impact holds. Generic waiver cannot supply approval. T30 requires an early minimal approved behavioral delta, with requirements-only approval and no proposal/design for a bounded tactical change; internal-only work needs no delta. T31 notices changed commands/standards and blocks readiness on unresolved required facts. | Snapshot schema/version and explicit tactical null/absence precede mechanical use. Hash change is not semantic impact; do not invent legacy snapshots or wholesale rerun tasks. Old readers ignoring additive data do not enforce policy. No second lifecycle database; owner impact routing and controlled evaluation precede snapshot reliance. A current-source rerun after later `context.ts`/`artifact-body.ts` changes passed all 19 input-impact precondition-CLI frame/diagnostic assertions; the synthetic overall gate intentionally stayed closed for pending tasks/reviews. Fixture commits verified `G`, the harness reported an unchanged source snapshot and removed its temporary repositories. This establishes CLI mechanics only, not authenticated owner/reviewer authority or semantic classification. Evidence: `.pi/verification/mv2elq7d-jczez0/parent-input-impact-cli-current-run.log` and `parent-input-impact-cli-current.log`. |
| **A15 — route relation/context binding and binding-first planning resources implemented; current-source CLI vectors and narrow source review passed, component/native acceptance pending**; format + route + planning resources | No prerequisite; consumed by A7/A8/A16. Shared typed relation helper/registry, context conflict resolver, route producer/consumers and existing-change plan binding resolution. | Route relation tests reject duplicate IDs/dependencies, unknown/self/cyclic edges and metadata/body identity/order mismatch; a 20,000-unit acyclic control passes. The actual public `workbench context` CLI also consumed 12 signed route/body vectors and six signed binding vectors from isolated temporary repositories: 10 malformed routes returned exit2, the valid and 10,000-unit acyclic controls passed, both binding conflicts returned exit2 with both references, and matching/null/absent controls behaved as specified. Every fixture commit verified `G`; CLI runs preserved HEAD, files, prepared-pack bytes and production source, then removed owned temporary repositories. The duplicate-ID vector was rejected by the earlier body-record numbering diagnostic rather than the duplicate-ID-specific diagnostic; see `route-binding-cli-duplicate-identities-diagnostic.log`. Plan skill resolves existing plan/proposal bindings before first-pending selection; fresh read-only review found no remaining unit-substitution path, and rich-path/re-plan contract cases pass. A current planning/route focused run passed276/276 across12 files (`.pi/verification/mv2elq7d-jczez0/parent-planning-execution-current-focused.log`); this is not the required bare full gate. The latest required bare full suite passed874/874 across50 files in297.50s under default settings (`.pi/verification/mv2elq7d-jczez0/parent-t30-requirements-only-bare-full.log`), and the core/CLI build passed (`.pi/verification/mv2elq7d-jczez0/parent-t30-requirements-only-build.log`); the preceding872/872 run and earlier timeout results remain historical. Current full-suite success does not complete the native route review or A15/A16 acceptance. Native reachability, causal review, destination coverage, shipped prerequisites and owner/claim behavior remain unverified. | Diagnose existing incoherence without rewriting IDs, shipped history or body. Deploy shared reader/context/all consumers before producer expectations. Graph validity does not prove reachability or destination coverage; preserve legacy profile and do not let modern null revive guessed legacy binding. |
| **A16 — source/target dispatch guard and owner/retention protocol resources implemented; competing-claim/transfer actors unverified, component review pending**; route + finish + planning resources | A7, A9, A15. Propose/plan claim entry, code preflight, actual target/source identity, finish cleanup/readback and multi-worktree scenarios. | Propose/plan/orchestrate/Wayfinder direct visible claim checks to resume or owner-adjudicate instead of suffixing; owner-authorized transfer inspects partial work/effects and preserves history. Code's read-only dispatch gate rejects identical/unresolved source/target identities and passes a named feature branch at the target's same commit. Current `tests/skills/dispatch-preflight.test.ts` passed11/11 against the shell gate extracted from `skills/kepler-code/SKILL.md`; signed fixtures and negative checkpoint-write snapshots passed. Planning/orchestration/finish owner-resource contracts passed67/67 (`parent-route-owner-resource-contracts.log`), but they assert instructions rather than actor behavior. Finish requires route owner/revision readback and retains shared, dirty or ambiguous workspaces. Controlled cross-branch claim, withdrawal, cleanup and external-effect behavior remains unverified; the local scan does not prove distributed exclusivity. | Approved designated controller serializes one owner/unit and one writer/change/worktree; cross-clone concurrency unsupported absent future protocol decision. No distributed lock/service/status DB/auto-expiring destructive lease. Reuse route/change/branch/Git evidence, retain source-target guard and A7 repair boundary. Preserve ambiguous legacy ownership; local-merge retention contract must coordinate A7. |
| **A17 — shared historical task-Base verification and resource first-attempt guards implemented; controlled-agent behavior unverified**; admission/checkpoint | A2 durable task evidence. Typed `task-checkpoint.ts` verifier is shared by diff record/package and precondition task evidence/review admission; code/feedback/orchestrator resources and diff/precondition fixtures consume its contract. | A cropped later-ancestor Base and conflicting cache fail before packaging/writing; canonical first-attempt parent and feedback Bases are checked against ancestry. Code-plus-progress commits pass. Isolated signed CLI/Git controls show first-attempt parent differs from pending-log/current HEAD, cache-free packaging derives history, and independent worktrees derive the same Base. Focused service tests cover feedback Base mismatch and stale ancestry. | `.base` stays ignored and is only a no-overwrite cache validated against history. Historical attempt discovery preserves metadata/path/heading/ordering checks without reapplying current-latest terminal uniqueness to old snapshots; current lint/admission remain strict. Driver and standalone coder must inspect task-owned committed/uncommitted work before initial recording; CLI cleanliness/pending-log eligibility cannot certify semantic absence of task work. Do not fabricate checkpoint records; ambiguous/imported/rewritten history needs owner evidence. All record/package/admission callers use the typed verifier; never guess HEAD, HEAD~1, or the planner log commit. Actor/driver/standalone dispatch behavior remains unverified. |
| **A18 — shared serial-order/dependency projection and context/admission contracts implemented; planner/driver behavior unverified, component review pending**; plan contract + planning resources + admission | A1/A2/A11/A14/A17; A4 baseline integration. Versioned optional execution metadata, shared task/dependency projection, context/precondition, planner, driver/code/feedback and tests. | T35 serial order 1→4→2→3 with immutable numeric IDs/scope and Task4's ordinary gates; T36 preserves unresolved done-but-uncleared task and gated prefix; T37 quiesces writers, safely preserves partial work and rejects stale dispatch; T38 rejects malformed/unknown/cyclic explicit order without fallback while absent metadata stays numeric and all-abandoned skips only task gates; T39 retains Task2 Base and reviews full cumulative overlapping-file range. Every active task still needs current durable feedback before whole review; no fake TDD or clearance. | Optional opt-in protocol only; strict reader/context/admission/planner/driver/code/feedback/docs rollout together before emitting metadata. Old readers may ignore additional fields, so verify capability first. Legacy plans remain numeric with no mass rewrite; explicit adoption is authorized re-plan, malformed version never falls back. Keep immutable identities, serial driver, one writer and full A4/A14 safeguards; do not add scheduler/database. |

### T1–T39 oracle/status matrix

Case status is explicit in each row. “Mechanical,” “CLI,” and “wording” evidence do not stand in for the controlled-agent result required by the corresponding case. Case definitions in §8 remain authoritative.

| Case / status | Oracle required for acceptance |
| --- | --- |
| **T1 — parser/precondition mismatch gate tested; controller behavior unverified** | Metadata/root-row status, title, order, ID or link mismatch fails lint before dispatch; coder owns repair; no next checkpoint/review occurs. |
| **T2 — supported parser boundary controls tested; controller behavior unverified** | Root in-progress plus initialized pending local log, and correction with prior finalized local attempt, remain valid; neither state implies done or permits fabricated attempt. |
| **T3 — raw latest-Outcome uniqueness and compatibility controls tested; controller behavior unverified** | Latest blocked→done, done→blocked, repeated done and mixed syntax fail lint/admission; one supported legacy unbulleted terminal Outcome passes and old history remains unchanged. |
| **T4 — parser/precondition tests and isolated actual-source CLI controls passed; controlled-agent behavior unverified** | Ignored/untracked progress and missing implementation-commit lookup close admission; code-plus-evidence commit is accepted and feedback Head contains the task implementation revision. Actual-source signed fixtures exercised durable evidence admission and ignored local-log rejection. |
| **T5 — precondition tests and isolated actual-source clean-HEAD substitution passed; controlled finish-agent behavior unverified** | Zero-exit verification followed by clean HEAD change closes admission; unchanged HEAD passes with verified identity; unresolved HEAD errors; same-SHA branch/worktree changes fail service identity checks. These are gate controls, not proof of the finish actor's later effect sequence. |
| **T6 — mechanical bounded-clearance and `applied`-metadata rejection tested; independent actor behavior unverified** | Requested-change review plus bare `decision: applied` never clears; independent remediation requirement is diagnosed; distinguish legacy schema-invalid metadata from valid requested-change history. |
| **T7 — seeded Git/service positive and negative bounded-clearance predicates tested; independent review and controlled actor behavior unverified** | Controlled agent discovers initial defect in one full review, performs scoped correction and normal task feedback, then one bounded pass produces valid composite clearance and CLI gate opens; invalid blocker/provenance/target controls fail. |
| **T8 — bounded-clearance invalidation and fallback guards regression-tested; actor fallback behavior unverified** | Missing blocker resolution, suffix omission, forged/structural parent, altered parent text, off-branch delta, unclassified material, changed intent/target/Base or unbounded impact fails with the proper full/upstream fallback; no generic retry. |
| **T9 — same-range evidence-gap and blocker-identity predicates regression-tested; zero-redispatch actor oracle unverified** | Same range and unresolved concern with no new evidence causes zero identical redispatch; located new evidence allows one resolving review; defect goes to code/feedback and ambiguous legacy type to adjudication. |
| **T10 — quality-context and optional-memory resource contracts implemented; native generation/reviewer behavior unverified** | Relevant lesson yields concrete task constraint or source-backed rejection; unavailable memory uses repository context; stale memory cannot override intent; reviewer locates criterion-to-code/test evidence. |
| **T11 — not implemented / unverified** | Interrupt before/after spec commit proves Attempt precedes effect, same Attempt recovers, exact spec commit occurs at most once, Outcome records observed result/no-change; changed input aborts and invalid intent produces zero Attempt/spec writes. |
| **T12 — not implemented / unverified** | Qualification failure leaves route unshipped; observed success updates only named unit on surviving branch; request/no-op rules respected; resume after strategy/route commit has zero duplicate delivery and reads back route/Outcome. |
| **T13 — explicit-target/Base/merge-base CLI and service controls passed; native repair actor behavior unverified** | Correct target merge base passes; arbitrary ancestor, unknown/mismatched target or changed base fails with waiver on/off; explicit-target legacy review passes without fabricated target history; CLI missing target errors. |
| **T14 — not implemented / unverified** | Provider/push failure cannot claim remote completion; local merge pair survives and verifies on base after cleanup; no-op has zero forbidden external/destructive effects. Stateful provider/ref readback, not fake zero, is observed. |
| **T15 — ordinary legacy-review and all-abandoned mechanical compatibility controls tested; actor behavior unverified** | All-abandoned still requires review/finish; ordinary legacy approval remains supported but cannot be remediation baseline after global provenance loss; malformed/latest scoped pass cannot revive earlier approval. |
| **T16 — not implemented / unverified** | Merge→remove branch/worktree→route failure→blocked pair repairs on base with distinct repair-open, historical admission and current HEAD, zero second merge, exact remaining effects and new completed pair. Dirty variant remains untouched pending owner reconciliation; forged/missing provenance and normal-gate misuse fail. |
| **T17 — not implemented / unverified** | New merge-required/open-request incompatibility creates zero request/Attempt/spec/route writes; historical request qualifies only from merged readback/provenance with zero duplicate request, otherwise holds. |
| **T18 — exact revision/working-byte admission and signed CLI controls passed; native approval behavior unverified** | Draft/default-accepted/changed formal inputs block before code; exact approved revision passes; tactical absence and authorized unattended self-review are valid without manufactured proposal approval. |
| **T19 — not implemented / unverified** | Cross verdict/disposition matrix holds changes-requested/skipped at owner; settled applied/rejected creates no redundant critique; next-stage naming does not authorize dispatch. |
| **T20 — service identity/abandonment preservation and signed CLI controls passed; native migration behavior unverified** | Feedback-bearing task keeps title/ID/paths/heading/history or is explicitly abandoned and replaced; no-feedback rename and synchronized historical rename remain valid. |
| **T21 — original-proof recovery/history rejection and signed CLI controls passed; native interruption/recovery unverified** | Interrupt after each scaffold file resumes only missing authorized pending/history-free artifacts from original initialization revision; preserves existing bytes; attempt/feedback/checkpoint/partial code/deleted history/ambiguous base holds. |
| **T22 — shared impact/retained-history contracts and signed CLI controls passed; independent native classification unverified** | Changed input produces independently reviewed impact map, retains unaffected approvals, revises affected unfinished/new obligations, preserves frozen done history; generic waiver cannot create intent approval. |
| **T23 — abandonment/append/frozen-evidence contracts and signed CLI controls passed; native re-plan/gates unverified** | Re-plan preserves old definitions/IDs/attempts/feedback and abandoned paths, appends max+1 tasks with full gates, and never reassigns old approval. |
| **T24 — route relation tests and 12 actual-source CLI vectors passed; semantic actor behavior unverified** | The public `workbench context` CLI passed the valid and 10,000-unit acyclic controls and returned exit2 for all 10 malformed graph/body vectors. Duplicate identities were rejected by the body-record numbering check before the duplicate-ID-specific diagnostic; the direct route-relation test still asserts that diagnostic. The signed isolated fixtures preserved repository HEAD/files and the prepared input pack; semantic causal review and reachability remain required. |
| **T25 — context tests and six actual-source CLI vectors passed; legacy-profile actor behavior unverified** | The public `workbench context` CLI returned exit2 with both source references for both distinct-valid-binding and non-null-proposal/null-plan conflicts. Matching modern, null-proposal/valid-plan, proposal-only binding with absent plan, and matching explicit-null controls behaved as specified. Each isolated fixture commit verified `G`; no authenticated owner approval or actor effect is claimed. Legacy-profile compatibility remains separately covered by existing context tests. |
| **T26 — route-ownership wording contract tested; two-branch controller scenario unverified** | Propose/plan/orchestrator resources require visible-claim inspection, owner resume/transfer/stop, and prohibit suffix ownership; wording tests preserve the explicit local-scan/cross-clone limitation. A real two-branch competing-claim scenario remains unrun. |
| **T27 — owner-transfer resource contract tested; partial-effect behavior unverified** | Wayfinder/propose/plan/finish resources require owner authorization, partial-work and Git/provider-effect inspection, history preservation, dependency revalidation, and no reset of verified shipment. No stateful withdrawal/transfer actor was exercised. |
| **T28 — diff/precondition tests and isolated actual-source CLI/Git controls passed; controlled-agent behavior unverified** | A cache naming a later cropped ancestor is rejected without package/cache/ignore writes; the canonical first-attempt Base is derived and the complete cumulative range passes with a code-plus-progress commit. |
| **T29 — diff/precondition tests and isolated actual-source CLI/Git controls passed; controlled-agent behavior unverified** | Independent worktrees derive the same Base; missing `.base` packaging uses history, conflicting/malformed cache is rejected without writes, and the initial pending-log commit is not mistaken for the first attempt. |
| **T30 — planning spec-impact and requirements-only resources implemented/tested; native planner behavior unverified** | `kepler-plan` compares requested externally observable behavior against touched canonical specs and requires an explicit Overview decision; `bundle/templates/plan.md` supplies a dedicated `Spec impact` field. A bounded behavioral tactical change needs a minimal approved `requirements/` delta tied to its exact committed revision before code dispatch; `kepler-propose` creates no proposal/design on this path, and its process graph connects the explicit planner handoff to delta approval and back to planning. Internal-only changes record no canonical behavior change and need no proposal or delta. The focused planning-resource contract passed13/13 (`parent-t30-requirements-only-planning-resource.log`); process-flow/output and focused docs contracts passed41/41 across3 files (`parent-t30-requirements-only-graph-docs-focused.log`); skills/templates/docs passed245/245 across19 files (`parent-t30-requirements-only-resources.log`); the required default full suite passed874/874 across50 files in297.50s and the build passed (`parent-t30-requirements-only-bare-full.log`, `parent-t30-requirements-only-build.log`). A docs/planning-resource run passed49/49 across5 files after correcting the state-machine diagram's no-pending-delta edge (`parent-t30-post-prefix-docs-resources.log`); the subsequent required bare suite passed874/874 across50 files in305.14s and `bun run build` passed (`parent-t30-post-prefix-bare-full.log`, `parent-t30-post-prefix-build.log`). Native planner classification, authenticated requester approval, and actor execution of the requirements-only path remain unverified. |
| **T31 — migration/path regression and readiness resources passed; init actor behavior unverified** | Focused `context.test.ts` and `project-data-path.test.ts` passed48/48 (`parent-t31-project-migration-current.log`). The built `packages/cli/dist/cli/main.js workbench context --all` also passed isolated legacy-only and both-path Git fixtures (`parent-t31-context-all-migration-cli.log`): legacy data copied before discovery with its source intact, while existing canonical data won without overwrite or merge. `kepler-init` readiness contract covers unresolved required facts, standards, and verification commands; it passed13/13 (`parent-t30-requirements-only-planning-resource.log`). Current skills/templates/docs passed245/245 across19 files, the required default full suite passed874/874 across50 files in297.50s, and the build passed (`parent-t30-requirements-only-resources.log`, `parent-t30-requirements-only-bare-full.log`, `parent-t30-requirements-only-build.log`). Native init ordering/recovery, runtime stops for unresolved facts/commands, and current commands reaching generation/verification remain unverified. |
| **T32 — not implemented / unverified** | Empty new plan and active-task/empty-ledger mismatch fail; all-abandoned skips only task gates and still requires whole-review/spec/delivery obligations. |
| **T33 — retention resource contract tested; multi-worktree cleanup behavior unverified** | Finish resources require exclusive ownership, clean state and preserved work before removal, and retain/report shared, dirty or ambiguous workspaces. No actual multi-worktree cleanup actor was exercised. |
| **T34 — source/target dispatch shell controls passed; integrated target admission unverified** | `tests/skills/dispatch-preflight.test.ts` passed11/11 against the current shell gate using isolated signed Git fixtures. A named feature branch at the target's same SHA passes; changed HEAD/branch/target/worktree/worker, detached source, configured local/remote aliases and unresolved same-name mappings reject before checkpoint writes. Full linked-worktree/precondition orchestration and the empty-package control remain unrun; A7 historical repair stays separate. |
| **T35 — serial-order projection and composed prerequisite CLI controls passed; native role sequence unverified** | Successful clearance order is exactly 1,4,2,3 while physical IDs/rows/paths remain 1,2,3,4; if discovery occurs while Task2 is blocked, that dispatch is not completion. Task4 has independent code/TDD/fresh approval; Task2 scope unchanged; neither Task2 nor Task3 skipped. |
| **T36 — gated-prefix/history and composed done-uncleared CLI controls passed; native re-plan behavior unverified** | Done-but-unapproved Task2 remains unresolved and frozen; execution-only insertion precedes its correction without changing definition/title/history; fully gated prefix and surviving old relative order remain. |
| **T37 — dispatch-identity and partial-work preservation controls implemented/tested; native park/resume behavior unverified** | Quiesce current writer; unsafe partial changes yield hold and zero next writes; safe owner-authorized parking has exact locator, no broad stash/discard/fake commit; changed order/worker/HEAD invalidates dispatch; resume uses original checkpoint. |
| **T38 — order/dependency/no-fallback lint/admission/context controls passed; native zero-dispatch/write oracle unverified** | Duplicate/missing/unknown/abandoned IDs, malformed shape/version, ambiguous/forward/self/cyclic dependencies produce named nonzero lint/admission diagnostics. A successful context read may exit 0; it must report exact invalid/blocked state without numeric fallback. Controlled dispatch/checkpoint rejection must produce zero writes; absent metadata stays numeric; all-abandoned still needs review/finish. |
| **T39 — canonical Base, cumulative diff and composed peer-approval CLI controls passed; native overlapping-file feedback unverified** | Preserve Task2 historical Base across Task4; feedback reviews full cumulative overlapping-file diff with peer-approved commit/path context, no filename hiding or inherited approval; new Task2 defect is independently rejected and all active task/whole gates remain. |

### Current implementation handoff

**Parent verification, evidence-format:** The parent inspected the shared comparator/latest-Outcome implementation and resource changes, updated one stale wording-test mutation marker without weakening lint ordering, and reran the gates: the expanded focused suite passed 410 tests across 19 files, the full suite passed 640 tests across 44 files, and `bun run build` passed. Thirteen actual-source CLI positive/negative/legacy controls passed with all temporary fixture bytes unchanged. A signed disposable Git fixture exercised the actual range predicate: committed task-progress repair changed prior feedback from fresh to stale; all four commits verified with signature status `G`. The initial CLI harness detected only Bun transpiler caches in its temporary HOME; documented subprocess-only `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0` removed that harness interference without narrowing the snapshot assertion. Evidence is under `.pi/verification/mv2elq7d-jczez0/parent-evidence-format-*`. These results establish mechanical/public-path behavior only; controlled actor handoffs, sibling preservation and whole-goal implementation remain unverified. Independent component acceptance is still pending at this record.

**Parent verification and review fixes, evidence-admission:** Native recovery completed the inspected writer handoff. Fresh independent review identified lost semantic first-attempt guards, lost standalone checkpoint responsibility, and historical raw-Outcome revalidation; parent reproduced four regression failures before fixing them. Parent restored coder/driver inspection before recording and standalone checkpoint validation before implementation. The historical snapshot mode now preserves metadata/path/heading/numbering checks without imposing the new latest-Outcome rule on old snapshots; registry/lint/current validation retain strict defaults. The focused expanded gate passed 465 tests across 24 files, the full suite passed 656 tests across 44 files, and core/CLI build passed. Twenty signed isolated actual-source CLI/Git controls passed with unchanged source inputs; corrected legacy history now passes lint, record, package and admission without rewriting old bytes. The task-code-before-attempt control demonstrates the mechanical/semantic boundary: CLI eligibility alone can record a cropped Base, so the restored source-skill guard must stop before that call. This is a controlled CLI counterexample and resource-contract regression, not native guard-behavior proof. Rejection/retry snapshots remained unchanged where required. Active LSP probes returned no errors but two inconclusive/silent-on-clean outcomes; build establishes the typecheck result. Evidence is under `.pi/verification/mv2elq7d-jczez0/parent-admission-review-fixes-*` and `parent-evidence-admission-cli.log`; failed red/intermediate/path/historical runs remain preserved. Independent component acceptance is pending at this record, and controlled actor behavior remains unverified.

This tracker defines scope and ownership; it does not authorize implementation effects on real project data or deployment. The preceding handoff paragraph records the earlier format/resource slice's status and remains historical; the current admission/checkpoint update follows. A wording assertion, typecheck/build, or baseline suite alone cannot mark controlled-agent or external-effect oracles satisfied.

### Admission/checkpoint handoff (current slice)

A2 durable task provenance, A6 verified-HEAD admission binding, and A17 shared canonical historical Base verification are implemented in the current source/resource delta, with focused regressions and isolated actual-source CLI/Git controls. The full Vitest suite passed 651 tests across 44 files and `bun run build` passed. The isolated parent harness passed 15 signed temporary-Git CLI controls covering guarded pending initialization/retry, first-attempt-parent derivation, historical cache preservation/conflict, cache-free package derivation, independent worktree agreement, durable task evidence, clean HEAD substitution rejection, and ignored local task-progress rejection. Its JSON log reports `sourceSnapshotUnchanged: true`; it exercised Kepler's actual CLI/Git behavior, not a native agent's dispatch or finish-effect sequence. No live project `.kepler` data or provider effect was used.

The previous evidence-format component has a separate accepted review record, with `completesMilestone=false`. This admission/checkpoint slice still needs independent component review and parent integration/acceptance. No goal-level completion is claimed. The harness canonicalized its owned temporary root after macOS `/var` and `/private/var` spelling initially caused correct relative-path rejection; that path-alias compatibility was not tested, and production path handling was not changed. No files were staged or committed.

### Plan-contract producer/consumer handoff (current slice)

The A11/A13/A14/A18 source slice adds shared task and execution projections, versioned handoffs/approval/impact/transition records, the read-only `kepler workbench context <change-dir> [--input PATH ...]` producer data, and historical initialization-proof admission/recovery. `artifact-body.ts`, `artifact-schemas.ts`, `context.ts`, and `precondition-artifacts.ts` parse current task identities separately from the original proof snapshot. The plan template tells future producers to preserve the original proof and use SHA-256 only for new task-definition/breakdown digests. Git commit/blob IDs and canonical legacy/Base evidence remain 40 hex. References for approval and review continue to represent assertions, not authenticated authority or proof of independent review.

`tests/workbench/context.test.ts` covers authorized uncommitted initialization plus amended-plan, forged-breakdown, changed-base, and deleted-attempt recovery boundaries. `tests/workbench/precondition.test.ts` verifies initial breakdown history across changed definitions, synchronized unfinished rename and all-abandoned state, and rejects a well-shaped forged 64-hex breakdown and a changed base. `tests/workbench/plan-contract.test.ts` covers SHA-256 projection and fenced fake task fields/Notes. `tests/templates/artifact-contracts.test.ts` locks the template's digest/Git-ID distinction. The isolated actual-source plan-contract CLI harness passed 22 signed fixtures and reported `sourceSnapshotUnchanged: true`.

The isolated actual-source initialization CLI harness did not complete: its forged-breakdown case replaces the digest with 64 unquoted zeroes, which YAML parses as a number, so `plan.md` fails parsing before historical verification. Do not treat that malformed-input rejection as proof of the intended forged-digest oracle. Service-level precondition tests exercise the corrected condition using a validly shaped `f`-repeated 64-hex digest and a validly shaped later commit as the forged base; both fail the initialization proof gate. The harness owner must quote the zero digest or use a nonnumeric 64-hex value before relying on the public CLI forged-proof result.

Final local validation passed `bun run build` and `bun --bun vitest run --maxWorkers=2 --testTimeout=15000` (45 files, 699 tests). An earlier focused run without a per-test timeout hit Vitest's 5-second default because the historical-proof regression makes five complete precondition subprocess calls; the same test passed with its explicit 15-second budget. No files were staged or committed. Independent component review, parent acceptance, skill/agent execution, and integrated behavior proof remain pending; this handoff does not claim them.

### A12/A14 input-impact abandonment compatibility follow-up

A composed service-level Git fixture confirmed that the original active-prefix rule rejected an affected unfinished, feedback-bearing Task 2 when its owner abandoned it and appended Task 5. `inspectInputImpact` now retains the prior physical task-ID prefix, validates active survivors in their prior relative order, and requires appended physical IDs to remain active and match `newTasks`. An affected task may leave the active set only under an explicit abandonment title appended to its existing title; the validator preserves its Files/dependency scope and task-progress/feedback identity and history, and does not require a new handoff for that abandoned task. Active affected tasks and appended tasks still bind their current handoffs to the actual input-impact commit. Completed tasks remain ineligible for affected classification, and unchanged completed tasks keep their frozen definitions and handoffs.

The regression uses an actual `input_impact` predecessor and classification plus a valid `execution_transition` in the introducing plan commit, then binds Task 5 in a follow-up plan revision without changing the impact boundary. Its positive case passes both Input impact and Execution transition while asserting physical identity order `1,2,3,4,5`, active execution order `1,3,4,5`, and unchanged Task 2 progress/feedback blobs. Negative cases reject feedback-bearing rename instead of abandon-and-append, deletion of abandoned feedback history, and reclassification of completed Task 1. These are PreconditionService tests; a parent-owned public CLI reproduction remains unrun.

The full suite now passes 45 files and 699 tests; the full `tests/workbench/precondition.test.ts` file passes 68 tests; build passes. `git diff --check` passes and the staged diff is empty. This follow-up confirms the source-level compatibility candidate without claiming parent acceptance or actor behavior.

### Parent plan-contract repair and verification checkpoint

The parent reproduced the independent review's F1–F6 findings and repaired the current source. `plan-history.ts` now supplies shared context/admission input-impact and chronological execution-amendment checks. Validated unaffected classification retains an implemented task's independently checked original formal approval, including approved additions and deletions; current working/index bytes still invalidate current formal authority. Pending logs without Attempts do not create an implementation boundary. Context recovery checks deleted or unavailable checkpoint history and original root/task identities. Malformed explicit metadata retains field-qualified diagnostics; successful context reads preserve exit 0 while reporting invalid/blocked state without fallback.

| Review finding | Actual parent control and result | Evidence boundary |
| --- | --- | --- |
| F1, historical formal authorization | Signed source CLI passes reviewed changes, null-to-blob approved additions, blob-to-null deletions and retained earlier impact handoffs with original Notes unchanged. Missing unaffected classification and unapproved historical formal authority reject. Dirty formal input fails the named Intent gate. | Approval/review references are controlled fixture assertions, not authenticated requester authority or independent native review. |
| F2, abandonment consumer parity | Source CLI admission and context accept affected feedback-bearing Task 2 abandonment plus appended Task 5; Task 2 progress/feedback bytes stay unchanged. Service negatives retain rename/deleted-history/completed-task protections. | Mechanical compatibility only; no native planner identity migration ran. |
| F3/F4, initial recovery | Signed source context admits plan-only, present pending root, and present pending task log. Deleted checkpoint history, controlled history lookup failure and inconsistent task/root/change/plan identities stop recovery without writes. Corrected initialization CLI passes nine original-proof/digest/base controls. | True absence is distinct from unavailable/deleted history. No native interruption or authorized repair actor ran. |
| F5, retained execution authority | Signed source admission/context reject the forged gated-prefix introducing amendment at P1, after proof deletion at P2, and after subsequent prose-only P3. All retain the original introducing-boundary diagnostic. | No prerequisite actor dispatch or checkpoint write is inferred. |
| F6, exact explicit-metadata rejection | Null and version-2 execution metadata fail lint/admission with named diagnostics; context read exits 0 with explicit invalid/no-fallback diagnostics. Complete fixture-byte comparisons remain unchanged. | Actual zero native dispatch/checkpoint effects remain an integration actor oracle. |

Parent final gates passed: focused planning contracts 248 tests/5 files, separated scaffold/context regressions 42 tests/1 file, default full `bun --bun vitest run` 726 tests/45 files, reviewer-requested bounded full run 726 tests/45 files, and `bun run build`. The initial default-full run passed 720 tests and timed out on one test containing six complete scaffold scenarios. Its isolated rerun passed; the parent split those independent scenarios, retained their assertions and Vitest's default 5-second limit, and preserved the failed log. No timeout increase supplied the default-full green.

Five signed actual-source CLI harnesses passed 102 controls: plan contract 22, formal provenance 12, initialization 9, input impact 19, and review repairs 40. Each records unchanged source snapshots and exact allowed fixture effects; fixture commits verify `G` and owned fixtures/keys are removed. The initialization digest now uses valid nonnumeric 64-hex text, and the unresolvable approval negative uses valid nonnumeric 40-hex text, so YAML numeric coercion cannot replace their intended history/provenance oracles. Earlier fixture/schema/grammar failures and production regression logs remain preserved. Evidence: `.pi/verification/mv2elq7d-jczez0/parent-*-cli-final-run.log`, `parent-plan-review-cli.log`, `parent-plan-review-final-{focused,full,bounded,build}.log`, and `parent-plan-review-full-before-scaffold-case-split.log`.

The original review returned blocked at its deadline before final parent evidence and acceptance were ready. Parent verification is now quiescent, but its actual-source independent final reread/acceptance remains pending. Planning resources, all remaining action contracts, integrated native actors, final reviews and goal completion remain unverified; this checkpoint does not complete planning-execution or authorize real project/delivery effects.

### A14 repeated retained-input chain repair

The resumed independent reviewer found a remaining F1/T22 failure: completed Task 1 retained its original input A and Notes after unaffected I1 A→B, but unaffected I2 B→C rejected A against B. Parent reproduced four service failures across formal/standards admission/context before changing the shared validator. `plan-history.ts` now inspects I1 at I2's actual committed predecessor snapshot before accepting the retained older blob. The predecessor must independently pass its committed projection, relevant history, classification, input-byte and scope checks. Missing, stale or forged predecessor proof stays blocked; the original task definition, Notes, progress and feedback remain unchanged. Deletion/reintroduction cannot bypass predecessor validation through a null blob. Previously validated unaffected inputs also survive a subsequent impact on a different input only with unchanged effective committed and working bytes and retained task scope, including a previously added formal input absent from the original tactical handoff.

Final source checks passed 262 focused tests across five files, both default and bounded full suites with 740 tests across 45 files, and core/CLI build. Six signed actual-source CLI harnesses passed 162 command controls (22 plan, 12 provenance, 9 initialization, 19 impact, 40 earlier repairs, 60 retained-chain controls). The chain harness checks both admission and context, preserves original Notes/evidence bytes, verifies signatures with `git verify-commit`, records `sourceSnapshotUnchanged: true`, and removes owned fixtures/keys. Its reviews/approvals are controlled fixture assertions, not authenticated authority or native semantic review. Evidence: `.pi/verification/mv2elq7d-jczez0/parent-chain-final-{focused,full,bounded,build}.log`, `parent-*-cli-chain-final-run.log`, `parent-retention-chain-cli.log`, and the retained red-first logs.

A private impact assertion previously expected its impact frame to pass while an omitted changed captured input failed Inputs. The new validator rejects that incomplete retention at both frames; the parent tightened the assertion to require the named Input impact failure and kept Inputs/overall admission closed. Its failed run and the chain harness's summary-field failure remain preserved. Successful parser/service/CLI verification does not establish independent native approval, lifecycle dispatch, interrupted execution or delivery. Actual-source component reread/acceptance and the remaining planning resources/native actors are still pending; planning-execution and the goal remain open.

### Context task-standing parity follow-up

The independent final reread found that the context history frame verified the shared chain while its task-input renderer still used the latest record's previous blob and reported the frozen task stale. The earlier 60 controls asserted the history frame, not that separate task standing. Parent preserved those contradictory outputs and strengthened the service/public positives to require `impact-reviewed-unaffected` for original captured changed paths and no stale standing (an originally empty captured set remains current). Four stronger context service positives failed before the consumer fix.

`context.ts` now carries the exact validated shared unaffected-input map into task standing instead of reconstructing a latest-only predicate. Repository identity remains independently stale, even when a captured/reviewed file is literally named `repository`; dirty current working bytes cannot inherit reviewed standing. Seven focused standing/identity/worktree controls pass. The strengthened signed source chain harness passed 69 command controls, including observed dirty-worktree rejection, repository-marker collision, and restoration of the original captured repository field. It preserves old task/root/feedback bytes, signatures, fixture snapshots and owned cleanup. These are source-CLI controls, not native semantic authority.

Fresh source gates passed 264 focused tests across five files, the required default full suite with 742 tests across 45 files, and core/CLI build. Current evidence is `.pi/verification/mv2elq7d-jczez0/parent-standing-final-*.log`, `parent-context-standing-cli-run.log`, the final six `parent-*-cli-standing-final-run.log` files, and `parent-context-retention-standing-red.log`. Earlier 740/162 history-frame gates remain historical. Independent actual-source reread, planning resources and integrated native behavior remain pending; no completed planning milestone or whole-goal claim follows from this repair.

### Parent planning-resource repairs and current verification

Parent reproduced and repaired eight independent-review concerns: full dispatch HEAD/branch/canonical repository/worktree/independently observed worker binding; cumulative commit-attributed peer approval and unapproved overlap; supported critique settlement; template initialization and canonical Overview labels consumed by the actual validator; legacy quality/decision context continuity from code to feedback; retained completed-definition validation after a later valid Attempt; case-preserving `fields.Outcome`; and known versioned provenance at a prior BLOCKED Attempt. Shipped dispatch shell controls prove mismatched or missing identity refuses before checkpoint writes. Template tests consume the shipped fields, including `taskIds`, rather than checking wording alone.

The signed later-attempt counterexample initially passed both admission Inputs and scoped context after a frozen definition rewrite with a recomputed current digest. The overall gate was already closed for an unrelated whole-review reason, so that exit was insufficient. Shared validation now checks historical real Attempt snapshots for known provenance and freezes completed definitions across retained post-completion plan revisions. Later Attempts, restored latest definitions and erased known provenance cannot establish genuine historical absence. Completion remains distinct from blocked implementation provenance. Both consumers run the same guard after ordinary scope/checkpoint checks succeed; ordinary failure stays held. Truly missing historical inputs remain unknown, and successful context reads preserve exit 0 while reporting stale scoped standing.

Default verification exposed fixture-heavy timing failures as well as the actual Outcome regression. All failed outputs remain preserved. Profiling recorded 156 Git subprocesses and 93 distinct queries in the deletion control. An invocation-local admission cache retains only successful full-SHA blob/parent/resolve/ancestor/file-list reads, keyed by operation, repository, revision and path. Mutable HEAD, branch/worktree identity, working/index bytes, path history, aliases and unavailable reads remain live; each execution gets a new cache and original port receivers remain bound. The same control then used 112 subprocesses with the same 93 distinct queries. This is a read-count observation, not a controlled performance benchmark. Related real-Git fixture setup now has a separate 5000ms hook cap, admission retains its default 5000ms cap, and independent stale-parent/forged-order controls are separate tests. This explicitly changes test phase boundaries without deleting assertions or claiming a five-second combined setup/operation latency contract.

At the earlier contained-resource snapshot, focused303/11, required default full798/49, core/CLI build, and resources232/19 passed; evidence remains `.pi/verification/mv2elq7d-jczez0/parent-planning-resources-snapshot-final-{focused,full,build,resources}.log`. After the requirements-only path and docs edits, the latest planning-resource contract passed13/13, focused graph/output and docs contracts passed41/41 across3 files, skills/templates/docs passed245/245 across19 files, the required default full suite passed874/874 across50 files in297.50s, and the core/CLI build passed. Current evidence is `parent-t30-requirements-only-{planning-resource,graph-docs-focused,resources,bare-full,build}.log` under `.pi/verification/mv2elq7d-jczez0/`. No timeout or concurrency override supplied the latest full-suite result. Five cache boundary tests cover repository/revision/path separation, failed/alias reads, live mutable state, invocation lifetime and prototype receiver compatibility.

Ten actual-source signed harness runs passed 211 commands: the preceding six 171 controls, legacy scope 32, cumulative package effects 2, later-attempt rejection 2 and blocked-origin controls 4. All record unchanged source snapshots, fixture read/effect boundaries, `G` signatures and owned cleanup. Current summaries are `parent-*-planning-final-run.log`; blocked-origin evidence preserves the original committed scope/Base/body and distinguishes known provenance refusal from genuinely missing scoped confirmation. The cumulative package retains Task 2's original Base and blocked Attempt through prerequisite Task 4 and resumed overlapping work; filename exclusion would conceal an unapproved change. These are package/consumer mechanics, not native dispatch, authenticated requester approval or semantic reviewer judgment.

The original resource reviewer returned blocked with no remaining source findings when its runner stopped before final parent acceptance. Its exact native session remains the recovery candidate; final evidence/audit and fresh actual-source acceptance are required before the next writer. Planning-execution remains open for native T10/T18–T23/T30–T31/T35–T39, including quality generation, approval, interruption/resume, preservation and full-range feedback. Other action slices, integrated native evaluation and goal completion remain pending.

### Post-route binding-selection repair and current full-suite evidence

The route workflow reviewer found a P1 in `skills/kepler-plan/SKILL.md`: first-pending selection ran before resolving an existing proposal/plan binding. The parent changed the order so an existing plan binding wins, a proposal-only binding is retained when no plan exists, and first-pending applies only to an unbound change. Rich-path and re-plan contract cases cover unit 1 bound/in-progress with unit 2 pending; a fresh narrow reviewer returned OK with no findings. Focused route/resource/context tests passed73/73, plan-contract passed28/28, selected A18 precondition tests passed5/5, and `bun run build` passed. These checks establish resource/source contracts, not native route dispatch.

The latest required bare `bun --bun vitest run` passed874/874 across50 files in307.96s with default worker and timeout settings (`.pi/verification/mv2elq7d-jczez0/parent-t30-t31-current-bare-full.log`); the preceding run passed872/872 across50 files in331.36s (`.pi/verification/mv2elq7d-jczez0/parent-route-required-bare-full-current.log`); `bun run build` also passed for core and CLI (`.pi/verification/mv2elq7d-jczez0/parent-route-current-build.log`). Earlier bare runs and the authorized `--maxWorkers=2` diagnostic timed out different tests and remain historical. The diagnostic `--maxWorkers=1` run passed872/872 across50 files in429.09s (`.pi/verification/mv2elq7d-jczez0/parent-current-full-one-worker-diagnostic.log`). A previous default-timeout run of only `tests/workbench/precondition.test.ts` recorded162/163, with a different case timing out at5031ms; that exact case passed alone twice (3.82s and3.30s). A temporary phase probe measured1,137ms for fixture/review setup and2,133ms in `runPrecondition`, and a separate passing CPU profile measured4.09s real (2.39s user,1.60s system). The instrumentation was removed and the test file hash restored. Cross-file worker contention alone cannot explain the historical one-file timeout, and the cause of prior timing reds remains unknown despite the current full pass. The bounded evidence and limits are recorded in `.pi/verification/mv2elq7d-jczez0/precondition-timeout-causal-diagnosis.md`. No Vitest configuration, timeout or assertion changed. Current-source T24/T25 CLI vectors are recorded in `.pi/verification/mv2elq7d-jczez0/parent-route-binding-cli-results.json`; the fresh narrow reviewer accepted only the binding-first repair, so full route review, native route/ownership actors and A15/A16 component acceptance remain open.

### Composed planning/execution CLI checkpoint

The parent exercised the current built `packages/cli/dist/cli/main.js` in two isolated signed Git fixtures: Task 2 initially blocked, and Task 2 root/local done with fresh changes-requested feedback. Each fixture passed12 public CLI controls, for24 total, with15 verified `G` commits per fixture. The constructed clearance order is1,4,2,3; it is fixture-authored evidence, not an observed native actor schedule or TDD run.

Both variants retain Task 1's completed evidence, original Task 2 definition/Notes/Base and initial Attempt/feedback. The explicit execution-only insertion validates against its introducing revision and actual gated prefix. Missing Task 4 feedback holds; its approval does not clear Task 2. Resumed overlapping Task 2 work remains held by its own requested-change pass. The diff package includes the full original Base through Task 4 and resumed Task 2, including the shared file. A cropped Task 2 approval fails the named historical-checkpoint predicate; restoring the exact fixture bytes and adding current original-Base feedback leaves Task 3 pending. All four fresh task approvals still require whole review. Only the final complete evidence set opens mechanical admission.

Every read-only command preserved fixture HEAD, index and complete fixture bytes; checkpoint/package commands changed only declared paths. Source hashes stayed unchanged, signing remained enabled, and all temporary repositories and keys were removed. Evidence: `.pi/verification/mv2elq7d-jczez0/parent-prerequisite-chain-cli-{v3,done-uncleared}.log` and `parent-prerequisite-chain-results-{v3,done-uncleared}.json`. The first harness run failed because it expected a nonexistent standalone Feedback output frame; the repaired assertions require each task's actual fresh context standing and the canonical Reviews frame. Its output is retained in `parent-prerequisite-chain-cli-run.log`.

The init process graph/output and `ProjectReady` definition now require resolved migration and required facts, standards and verification commands. The old graph bypassed migration and treated unattended assumptions as readiness. Its regression failed before the resource fix (`parent-t31-readiness-diagram-red.log`); the corrected skills/templates/docs suite passed245/245 across19 files (`parent-t31-readiness-diagram-resources.log`). The preceding874/50 full suite and build predate these later init diagram changes and remain separate snapshots.

These results add composed consumer evidence for T35/T36/T39 and readiness resource coverage for T31. Native planner/coder/feedback behavior, semantic quality and approval judgments, partial-work parking/restoration, and independent final review remain unverified. Planning-execution is still the focused, incomplete goal task; no actor launch or delegation occurred.

### A14 implemented legacy confirmation protocol

The audit found worker-authored protocol details had changed the protected historical A14 section. Parent preserved that diff in `planning-resources-historical-prefix-drift.patch`, restored the exact approved prefix and moved the implementation details here. This is forward implementation guidance, not a rewrite of historical approval or native semantic authority.

**Targets:** plan Overview/task blocks and optional `legacy_input_confirmations` frontmatter, task-progress Notes, typed artifact readers, context/read-only plan data, finish admission, driver upstream-revision handoff, code/feedback/review generation preflights; standards/spec/intent fixtures.

For legacy task evidence with genuinely missing versioned input provenance, never reconstruct prior hashes or edit the task's Notes, frozen definition, identity, attempts, feedback, checkpoint, or approvals. A current confirmation is eligible only when the plan at each real historical Attempt, including blocked implementation, also lacks versioned input context, the task definition digest is unchanged, and its prior task/Base/range identity is verifiable. Store it in the existing plan authority, one record per task, not a lifecycle store:

```yaml
legacy_input_confirmations:
  - version: 1
    task: 1
    repository: <canonical Git root realpath>
    taskDefinition: <64-hex SHA-256>
    intentCommit: <full commit with current approved formal inputs or tactical:<ownerReference>>
    inputs:
      - path: AGENTS.md
        blob: <current committed 40-hex Git blob>
    historicalInputs: unknown
    owner: <attributable owner identity>
    ownerReference: <owner-held decision reference>
    reviewer: <distinct independent reviewer identity>
    reviewReference: <independent review reference>
    rationale: <scoped current-contract applicability>
```

Capture relevant current input blobs through the typed context producer. Context and admission must
check canonical repository and unchanged task contract, committed current intent/approval and input
blobs, exact plan and input HEAD/index/worktree bytes, attributable distinct owner/reviewer
references, and existing impact history. Report `legacy-current-confirmed` only for a verified
current standing; keep historical input state explicitly unknown. A reference string is mechanical
consistency evidence, not authentication or semantic review. This path is never an intent, feedback,
whole-review, test, cleanliness, or finish waiver. Changed frozen contracts require appended new
obligations. Missing, malformed explicit Notes/version, dirty, stale, changed, or unverifiable
history stays held; do not use this path for newly planned tasks.

**Acceptance:** T22 detects relevant changed acceptance without discarding frozen history; unaffected tasks retain legitimate approvals; missing intent approval still blocks under a generic material waiver. Legacy current confirmation preserves old Notes, definitions, identities, attempts, feedback, checkpoints, and approvals; it passes only with verified unchanged task scope and exact current input/approval bytes, while absent, dirty, malformed, wrong-repository, stale, forged/default-reference, or other failed-gate controls remain held. The context producer marks this standing separately from historical input snapshots. T30 discovers behavioral/spec obligations during planning, not solely after whole review: a minimal approved delta is sufficient without mandatory heavyweight proposal or design for a bounded tactical behavior change. T31 notices changed standards/commands rather than perpetuating guesses.

**Compatibility/rollout:** Start with explicit owner impact routing and controlled scenario evaluation. Make mechanically consumed snapshots versioned in the existing task evidence, with coordinated readers; old readers ignoring additive data do not enforce this rule. Legacy evidence without provenance gets scoped diagnosis/current confirmation, never fabricated hashes or wholesale task re-execution. Keep this confirmation in additive plan authority and coordinate schema, context, producers, admission and resource instructions before using it; do not add another lifecycle-status database.

### Admission cache interpretation-bound containment

Fresh exact-session review rejected the preceding cache safety claim: full SHA alone does not fix Git's effective interpretation. Parent reproduced the counterexample in a signed isolated repository without changing HEAD. Replacement refs changed live blob bytes while the cache returned old bytes; grafts changed the live parent while it retained the old parent; a shallow boundary made live parent resolution fail with status 128 and ancestry return 1 while cached successes remained 0. Original failed data, four `G` signatures, complete fixture restoration and source immutability remain in `parent-precondition-cache-graph-before-repair-{results,command}.log`. This disconfirms the earlier unconditional immutable-query assumption; the preceding 798 green and 156-to-112 count observation do not establish cache safety.

`precondition-snapshot.ts` now binds retained native reads to a content-based interpretation epoch over ordinary repository refs, packed refs and local configuration, with repository locator identity. Missing/unreadable epoch evidence runs the original live query. Replacement refs, grafts, shallow state, alternate ref storage, Git interpretation environment overrides, gitfiles/linked worktrees and explicit common-directory layouts decline retention. Queries keep their original semantics; the implementation does not force raw-object interpretation, suppress Git failures or override graph features. Cache entries include the epoch, and a changed epoch during a read prevents retention and causes a fresh live read. Opaque custom process/query ports receive no implicit cache; tests can supply explicit controlled epoch authority. Each stored/returned ProcessResult is copied so producer or caller mutation cannot alter retained evidence.

`runtime.ts` exposes the frozen import-captured native process environment only for the actual production ProcessPort and its original run function. The guard reads this environment rather than current `process.env`; it does not infer a custom port's subprocess environment. It bypasses common-directory indirection instead of trusting a cached locator there. No environment values or credentials are added to logs. Narrow tests preserve the prior alias/failure/live/prototype/tuple controls and add opaque-port, epoch change/during-read/unavailable, mutable-result and actual same-service execution coverage. The first new run reproduced five failures; an intermediate during-read count expectation was strengthened to assert the deliberate fresh read and nonretention, with failed output preserved.

Signed actual-source graph controls use a fixture-only Git trace wrapper that forwards every command to native Git without inventing results. Ordinary repeated unchanged blob reads invoke native Git once, proving the cache stays active; replacement/graft/shallow results then agree with live Git, including failures. Captured-environment mode supplies a nonstandard replacement namespace before module import and deletes only the process-visible copy afterward; retention remains disabled against the actual captured backend environment. Linked-common mode changes the worktree's common-directory pointer to an owned alternate with replacement refs while preserving HEAD; opaque-process mode supplies a forwarding custom port. Each declines retention, invokes the unchanged query twice and agrees with current live results. Four modes preserve complete fixture bytes, source hashes, sixteen `G` entries and owned cleanup. Evidence: `parent-precondition-cache-graph-{ordinary,captured-environment,linked-common,opaque-process}-{results,queries,final-run}.log`.

A separate signed native-backend control executes the same actual PreconditionService instance twice. Both executions perform the same six distinct historical Git reads, return identical scoped-positive input standing, retain the original Base/evidence, and preserve complete fixture bytes; six signatures verify `G`. Both overall exits remain 1 with `gate: closed (2 failing)` because whole review is absent. This proves invocation lifetime rather than whole-gate approval or native semantic authority. Evidence: `parent-precondition-cache-service-{results,queries,run}.log`.

Final containment gates pass at default limits: 309 focused tests/11 files, REQUIRED `bun --bun vitest run` with 804 tests/49 files, core/CLI build, 232 resource tests/19 files, and all preceding ten signed 211-command harnesses rerun on the contained source. Evidence: `parent-planning-resources-contained-final-{focused,full,build,resources}.log` and `parent-*-contained-final-run.log`. Earlier epoch-only 804 results precede the captured-environment/common-directory repair and remain separate. Active LSP returns zero diagnostics on four paths, two confirmed clean/two inconclusive; the build supplies the production type gate. Final packet/hash audit and the exact reviewer's final-source accepted result still govern the next writer. No planning-execution milestone, authenticated approval, native lifecycle oracle or whole-goal completion follows.

### A3/A4/A9 bounded review-clearance implementation handoff

The A3/A4/A9 mechanical slice is implemented with explicit target selection. `review-passes.ts` parses full and bounded pass provenance, stable finding IDs/kinds, and exact cumulative resolution records. `precondition-reviews.ts` verifies an immutable artifact-only full-review baseline, retained pass bytes, target/Base/Delta ancestry, same-plan intent and frozen task evidence, exact appended remediation tasks, A18 execution-only transition authorization, cumulative outstanding findings, and correction-path classification. Evidence-gap-only clearance requires unchanged material range, preserved task/plan obligations, and new located evidence; it rejects identical evidence, invented remediation tasks, code defects without a correction, and intent defects without upstream revision. Latest material corrections must be covered even with the material waiver. Plan and review projections ignore fenced fake headings while retaining raw bytes for immutable-baseline comparison; CRLF pass boundaries remain physical and line-correct.

A9 requires `--target-branch` on whole-change diff and precondition CLI/API calls. The shared Git-reference validator accepts only a full branch ref and verifies the selected target's actual merge base against the reviewed Base. Production commands and all reviewed private precondition fixtures pass the explicit `refs/heads/fixture-target`; no default-branch fallback was added. Existing ordinary legacy review parsing remains available with explicit target, while structural legacy passes cannot establish a bounded baseline.

Regression coverage includes a bounded positive with ordinary remediation gates, evidence-gap positive and identical-evidence negative, cumulative blocker resolution, unclassified paths with spaces, immutable baseline/title/commit checks, unreviewed latest material under waiver, changed intent/task definitions, wrong target/Base/Delta, non-artifact-only review parent, malformed/applied/legacy provenance, A18 authorized execution-only amendment and forged-boundary negative, and fenced/CRLF physical-heading cases. `tests/workbench/precondition.test.ts`, review-pass tests, artifact parser tests, CLI target-forwarding tests, diff tests, templates, and skill contracts carry the changes.

Final local verification: `bun run build` passed; default `bun --bun vitest run` passed 49 files / 841 tests; the changed parser/admission/lint/CLI tests passed 317 tests across five files. `git diff --check` passed and `git diff --cached --name-status` is empty. A prior default-full run exposed one HTML-comment diagnostic line regression after CRLF offset handling; the comment diagnostic was restored to the established comment-opening-line location, the focused suite passed, and the required default full suite was rerun successfully.

Eight isolated actual-source signed CLI fixture harnesses passed: plan-review 40 controls; evidence-admission 20; initialization 9; input-impact 19; planning-provenance 12; legacy-current-confirmation 32; legacy blocked-origin 4; and latest-attempt 2. A same-service cache harness ran twice and retained its expected whole-review-missing closed gate. All harness outputs report unchanged production source; signed fixture commits verified `G`; fixtures were removed. The evidence-admission helper's first attempt exposed a stale positive fixture without current versioned task `Notes`; the rerun added a valid Notes record in memory only and passed all 20 controls. The legacy-confirmation harness's guarded initial invocation required `--expected-standing`; the exact value was read from its prior result and the 32-control run passed. Harness output was redirected to `/tmp`; prior `.pi` logs and helper files were not overwritten.

The implementation has not passed the required independent final-source reviewer gate. No native reviewer/driver proved finding classification, independent full/bounded review, zero-identical-redispatch behavior, integration scope, or finish/repair behavior. T6–T9 and T13 remain unverified at the actor level; T15 compatibility is mechanical only; T16 and goal completion remain parent-owned/open. Do not treat parser, seeded signed fixtures, build, tests, or wording assertions as authenticated approval or integrated agent-behavior proof. No files were staged, committed, pushed, or applied to real project data.

### Parent review-clearance repairs and source verification

The retained writer completed with a durable handoff. The fresh read-only reviewer identified seven admission/resource concerns; parent held acceptance and reproduced the failures before repair. Twelve new regressions exposed unresolved/off-branch/cropped/ahead-of-latest scoped Heads, normalized duplicate finding IDs, lost structural legacy first occurrence, and missing installed resolution grammar/mode routing. Two additional real-Git regressions showed artifact-only scoped-blocker erasure opened admission, including erasure followed by exact restoration. Original red outputs remain separate under `.pi/verification/mv2elq7d-jczez0/parent-review-clearance-*-red.log`.

`review-passes.ts` now carries parseable structural findings into first-occurrence identity without inventing historical Base, Head or verdict, and rejects duplicate IDs after normalization. `precondition-reviews.ts` resolves every scoped Head inside the original-full-to-latest cumulative range. It compares retained scoped pass bytes against relevant reachable full-history review snapshots after the immutable baseline; missing, invalid, deleted/restored or rewritten history cannot erase a blocker. Ordinary full/legacy admission remains outside this bounded validator. Current resolution coverage must still match every retained baseline/suffix finding exactly.

Installed review/template/prompt resources now provide executable single-line JSON resolution syntax with exactly finding/evidence/verification keys, nonempty located evidence and verification, and exact unique cumulative ID coverage. Controller Process10/14, task-feedback handoffs, whole-review rubric, output summaries and diagrams classify requested findings before freshness routing, including stale requested passes. Confirmed code defects use numbered remediation or the same task's code cycle; evidence gaps use independent new located evidence on the unchanged range without invented code/tasks; intent defects return for approved proposal revision. Full/bounded selection and invalid/unchanged-input holds agree across prose and diagrams. Independent semantic actor execution remains unperformed.

The first parent bare full suite passed 855 tests/49 files and core/CLI build before the final downstream resource reconciliation. That result is historical, not certification of later edits. Current resource checks passed 235 tests/19 files. Twenty new signed actual-source CLI controls passed with 147 verified G readbacks: valid cumulative clearance, mandatory/unknown/mismatched/advanced targets with waiver on/off, invalid historical scoped Heads, mixed or rewritten baselines, deletion/restoration and blocker erasure, scoped omission, exact spaced paths, useful versus identical evidence-only adjudication, and ordinary legacy-global approval. They preserve complete fixture/source bytes and remove owned fixtures/keys. The initial new positive used a reviewed Head before Task1 feedback existed; parent corrected the fixture to capture the fully gated Head rather than weaken frozen-evidence admission. Evidence: `parent-review-clearance-cli.log`, `parent-review-clearance-cli-commands.json` and `parent-review-clearance-cli-expanded-run.log`.

The older evidence-admission positive failed with missing current input context. Parent repaired its actual pending-plan producer with versioned Notes before implementation, preserved original helper/results, made its entrypoint import-safe, and reran all twenty signed CLI controls. The earlier in-memory-only rerun is superseded by `parent-evidence-admission-notes-import-safe-final.log`; historical outputs remain retained. Reference strings and fixture-authored records establish mechanical consistency, not requester authentication or independent native approval.

Current final focused/default-full/build gates, explicit caller audit, exact historical prefix/separator, index/lock/signing/current hashes and actual final-source reviewer acceptance still govern source-lane transfer. T6–T9/T13 native actors, T15 semantic compatibility, T16 finish recovery and the broader goal remain open. No maintenance staging/commit, real-user data change, provider delivery, push or merge occurred.

### Current-source planning CLI replay (A11–A14/A18 mechanics)

The earlier planning CLI snapshots predate later `artifact-body.ts` and `context.ts` changes. I reran the affected isolated public-CLI harnesses from copied runners, preserving each historical output:

| Harness | Cases passed | Main mechanical scope |
| --- | ---: | --- |
| Plan-contract CLI | 22 | Plan/task/execution projection, dependency, and context controls |
| Planning-provenance CLI | 12 | Formal-input revision and approval/provenance consistency |
| Initialization CLI | 9 | Original initialization proof and history-preserving recovery boundaries |
| Input-impact CLI | 19 | Changed-input map, affected/unaffected classification consistency, stale/forged controls |
| Retention-chain CLI | 69 | Repeated input-impact history, retained task context, and current standing |
| Legacy current-confirmation CLI | 32 | Legacy unknown-history confirmation, malformed/stale/dirty controls, and scoped standing |
| Blocked-origin CLI | 4 | Known blocked provenance versus genuinely missing historical input provenance |
| Latest-attempt diagnostic CLI | 2 | Frozen completed definition rejection through admission and context |

All 169 harness cases passed their expected source-CLI assertions. Fixture commits verified `G`; each harness reported `sourceSnapshotUnchanged: true` and removed its temporary repositories. The input-impact and other precondition cases intentionally remained closed when task/review evidence was absent; the case count does not mean every CLI process exited zero. Current detailed outputs are the matching `*-current.log`/`*-results-current.log` files under `.pi/verification/mv2elq7d-jczez0/`; each `*-current-run.log` records its runner summary. The previous resource/docs suite passed244 tests; the latest skills/templates/docs suite passed245 tests across19 files (`parent-t30-requirements-only-resources.log`), and the focused planning-resource plus docs contracts passed41/41 across3 files (`parent-t30-requirements-only-graph-docs-focused.log`). The required default full suite passed874/874 across50 files in297.50s and the core/CLI build passed (`parent-t30-requirements-only-bare-full.log`, `parent-t30-requirements-only-build.log`); the earlier243/244-test and 307.96-second full-suite results remain separately recorded. Fixture approval/review references remain consistency assertions, not authentication or semantic review. These reruns verify current-source CLI mechanics only; native approval, independent semantic classification, interruption actors, and T10/T18–T23/T30–T31/T35–T39 acceptance remain open.

### A1–A18 implementation continuation from checkpoint 8de197a

The continuation preserves all earlier implementation and historical §§1–10. The current action
inventory and exact changed predicates are recorded in
[the implementation handoff](change-state-machine-implementation-handoff.md#current-implementation-continuation).
All eighteen implementation paths are present; source/resource completeness is separate from native
acceptance and the paused goal's milestone ledger.

New fixes close finish-history deletion/downgrade and same-commit journaling, original-evidence set
changes, paired shipping incompatibility, historical Qualification ambiguity, sibling route changes,
omitted pending effects, visible ref/worktree claim gaps and unchanged failed-repair retries.
Typed retry evidence binds the latest failed Outcome and entry HEAD to changed remaining paths or
observed request merge; the paired Outcome must preserve that observation. Request Head readback
permits only the exact finish-owned mutation boundary. Context now validates durable task/checkpoint
evidence and labels whole-review range freshness as clearance-unverified. Initial-scaffold recovery
also refuses staged evidence. Copyedited planning, orchestration, finish and template wording matches
these boundaries.

A10 keeps native actor evaluation separate from mechanical checks. Selected cases require approval,
and each case remains unverified until its behavior is directly observed.
At the user's direction, no broad smoke/full suite, skill behavior/contract validation, native
lifecycle evaluation, compiled repair replay or provider scenario was executed.

Current narrow checks: 39 finish parser/route/claim units; 21 selected context units (28 skipped);
17 selected precondition repair units (163 skipped); core/CLI TypeScript build; and Git diff integrity
passed. These 77 unit assertions are mechanical evidence, not authenticated or semantic approval.
A retry-evidence negative first reproduced acceptance of a regressed Outcome and then passed after
repair. Historical fixture/harness claims above were not rerun or promoted to current evidence.

Legacy history remains immutable. Missing modern delivery/Qualification provenance and older
successive repairs without retry evidence require owner adjudication. This continuation introduces
no dependency, production orchestrator, installation, commit, push, real-user data mutation or
real provider delivery. Keep CLI and resources together; do not use an older reader to guess recovery
authority from the new records.
