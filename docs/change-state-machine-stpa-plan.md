# Kepler change state machine: STPA investigation and remediation plan

## 1. Scope, evidence, and decision criteria

This is an analysis and future implementation plan, not an applied fix. The entry point is [the change-state-machine document](./change-state-machine.md). Repository behavior is evaluated at commit `ebfa4f53624f3ea9d6a201b2f69c9c262246ac83` on `fix/finish-work-gates`.

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
| Active task identity and acceptance | Plan body; planner owns changes. | Abandonment requires the exact terminal heading form. Zero active tasks means an all-abandoned declared plan, not a genuinely empty new plan; only task gates are skipped. |
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
| C2 | Planner reads current standards/specs, confirms or auto-reflects authorized unattended work, isolates workspace, initializes identities. | Lint substituted for approval; wrong route unit; rename/history mismatch; interrupted scaffold reused as complete; competing claim. | F12/F14–F19; A11–A16; T18/T20–T27/T30/T34. |
| C2a | No active tasks remains only after declared tasks are abandoned with canonical reasons. | Empty ledger falsely treated as complete work; taskless state used to skip branch/spec/delivery obligations; repeated task dispatch despite no active task. | Existing parser/ledger guards retained; A10; T15/T32. |
| C3 | One exact active Task N, scoped files, stable checkpoint, ordered verification, owned committed evidence. | Missing evidence; cropped checkpoint; execution against changed acceptance; concurrent overwrite; fabricated attempt after interruption. | F2/F5/F6/F16/F19/F20; A1/A2/A14/A16/A17; T1–T4/T22/T28–T29/T34. |
| C4 | Independent task review reads acceptance and cumulative stable range; appends only owned feedback. | Omitted acceptance; wrong title/Base; premature/undurable approval; approval retained after relevant input change. | F4/F14/F16/F20; A5/A12/A14/A17; T10/T20/T22/T28. |
| C4a | Named unresolved diff-evidence risk receives bounded driver adjudication, then independent resolving pass. | Evidence question sent to code; advancement before resolution; unchanged indefinite retries. | F8; A3; T9. Existing canonical trigger preserved. |
| C5 | Driver advances only after current done evidence and durable fresh task approval. | Skip a task; trust transient answer; advance before commit; reused approval for different title/contract. | F2/F6/F14/F16/F20; A1/A2/A12/A14/A17. |
| C6 | Whole review covers complete branch and consumers against actual target merge base. | Omitted integration; arbitrary range; approval before task/intent readiness; repeated unbounded inspection. | F1/F3/F11; A3/A4/A9; T6–T8/T13. |
| C6a | Latest valid durable approval can be reused with material freshness, separately from explicit finish waiver. | Fall back to old approval; confuse disposition/clearance; reuse after material/input change. | A4/A9/A14; T6–T8/T15/T22. |
| C7 | Driver classifies implementation versus approved-intent defects; planner appends numbered remediation, freezes done definitions. | Missing invalidation; modifying frozen history; title change stranding feedback; resolving intent in code; unchanged remediation loops. | F3/F8/F14/F16; A3/A4/A12/A14; T7/T9/T20/T22. |
| C8 | History, CLI predicates, and semantic/user policy jointly admit finish. | Treat CLI open as complete authorization; missing user waiver; tested revision differs; ambiguous route hidden by context. | F7/F18/F20; A6/A11/A15/A17; T5/T18/T25/T28. |
| C9 | Approved consistent deltas only; tactical behavior changes still require deltas. | Invent specs from diff; stale approval; sync before journal; detect missing obligation only after costly implementation/review. | F9/F12/F16; A7/A11/A14; T11/T18/T22/T30. |
| C10 | Durable intent precedes effects; owned boundary and strategy qualification must hold. | Wrong unit; competing ownership; premature shipment; unexpected mutation or unauthorized shared-workspace cleanup. | F10/F18/F19; A7/A8/A15/A16; T12/T17/T25–T27/T33. |
| C11 | Actual external/workspace state closes a numbered pair; dangling recovery precedes new intent. | False readback; repeated delivery; treating cancellation as rollback; holding abandoned claims indefinitely. | A7/A8/A16; T14/T16/T27/T33. Paired blocked records remain immutable. |

**Admission coverage:** E0 (history/lint/recovery) maps to A7/T11/T14/T16; E1 (real target and supplied command) to preserved path guards/T31; E2/E4/E10 (entry/after/final cleanliness) to A6/T5; E3 (exit status versus full-suite semantics) to standards/A5/A6/T5/T10/T31; E5 (durable matching plan/root identities) to A1/A11/A12/T1/T18/T20; E6 (latest done implementation) to A2/A13/T3/T4/T21; E7 (task review identity, durability and scope) to A2/A12/A14/A17/T4/T20/T22/T28; E8 (whole review validity/scope) to A4/A9/T6–T8/T13/T15; E9 (material coverage and narrow authorized waiver) to A7/A9/A14/T8/T22; E11 (conjunction with semantic policy) to A11/A15/A17/T18/T25/T28. A boolean or exit code cannot authenticate an owner decision or prove semantic review quality.

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

These include prohibited-policy and inferred-interaction scenarios, not nine additional reproduced incidents. Independent investigation found specific machine gaps and liveness ambiguities; the broad matrix also retains correctly controlled paths.

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

## 7. Prioritized implementation sequence

All actions below are proposals. Snippets identify concrete edit locations and intended content; they have not been applied or compiled as an integrated patch. A snippet introducing a field/helper requires the accompanying reader, caller, template, and test changes listed with it.

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
| A11. Define durable intent approval and unresolved critique routing | P1 semantic boundary: format validity must not become authorization. | F12/F13 | Agree protocol; A14 for revision impact | Propose/critique/plan/finish; enums/templates; semantic preflight. |
| A12. Preserve task title identity once feedback exists | P2 liveness: avoids unowned history repair. | F14 | A1 | Planner and re-plan contracts. |
| A13. Resume only provably initial, history-free scaffolds | P2 recovery: no unsafe completion is admitted today. | F15 | A11 for authorized breakdown; A1 | Planner/context/scaffold contracts. |
| A14. Bind current inputs to explicit obligation impact | P1 when intent changes: old evidence must not acquire new meaning. | F16/F12 | A11; preserve A4 fallback | Planner/driver/reviewer input contracts. |
| A15. Validate route relationships and reject conflicting bindings | P1 when route-backed: current shapes can conceal the wrong unit or impossible graph. | F17/F18 | None; consumed by A7/A8/A16 | Registry/context; route producer/consumers. |
| A16. Make unit ownership, branch role, withdrawal and retention explicit | P1 source/target role before generation/cleanup; P2 claim/cancellation coordination | F19 | A15/A9; A7 for delivered effects | Propose/plan/finish; owner-directed claim protocol. |
| A17. Verify one canonical historical task Base | P1 gate integrity: ancestry alone can approve cropped task coverage. | F20 | A2 for durable progress | Shared checkpoint helper; diff/precondition/driver. |
| A10. Exercise workflow scenarios, not only wording | P1 regression work within each action; final adoption gate after all selected actions | All | Each action adds its own tests; final scenarios follow integration. | Repository tests and controlled agent evaluation. |

Do not implement all of this as one task. Keep pure parser changes, admission changes, and skill-protocol changes separately verifiable. A4 needs a short design/approval step because it changes the public review-clearance protocol; its classification and invalidation rules must be agreed before code generation.

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

**Decision:** Prefer an explicit remediation-clearance verdict to accepting `decision: applied`. Keep full review as the default/fallback. A cleared remediation pass certifies the combination of retained full-review coverage and independently checked corrections; it does not pretend that the reviewer reread the entire branch.

**Steps:**

1. Give whole review two invocation modes: full, and bounded remediation against a named full-review baseline. The first branch review remains full. Remediation mode always receives the complete range/artifact context, but inspects the correction delta, every outstanding blocker, and affected consumers/invariants; it does not reopen unrelated preferences.
2. Introduce `approved-remediation` only for root whole review. Task feedback retains its existing verdict vocabulary. This deliberate new verdict makes old readers reject the new clearance rather than silently interpreting shorter inspection as an ordinary full pass.
3. Persist pass-local scope and provenance: full Base/Head, target, baseline pass number and Head, and resolution mapping for all original and subsequently introduced blockers. Keep the historical full pass immutable.
4. Validate the baseline's durable semantic-evidence provenance, exact target/merge base, ancestry, reviewed intent, and correction boundaries. Bind a modern full baseline to its committed artifact revision and verify its unchanged pass text. A structural-only legacy prefix cannot be a baseline. For a legacy-global history, obtain a new full explicit pass once before using bounded clearance: the atomic transition removes globals and makes the old prefix structural. Existing supported legacy approvals remain usable through the ordinary full-clearance path; never fabricate a remediation baseline from their removed global fields.
5. Require all active remediation tasks to pass normal code/feedback gates. Independently validate resolution of every outstanding blocking finding and integration effects of the delta. Approve only when the resulting composite branch coverage is complete.
6. Full review is mandatory if the baseline is missing/invalid, reviewed commits were amended, Base/target changed, approved requirements/design changed, a material path is unclassified, or the correction's integration impact cannot be bounded. A change to plan.md is permitted only as the exact numbered-remediation amendment; preserve original task intent and definitions.
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

**Compatibility/rollout:** Approve this public protocol before implementation. Older design/delta linters reject approved status, while old precondition alone still omits semantic intent checks: update CLI, templates and portable skills together, verify installed versions, then enable writers. Legacy draft/default-accepted artifacts need explicit current owner confirmation, not inferred approval or mass rewriting. Preserve legitimate historical approval evidence and source attribution.

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

**Targets:** propose/plan map-aware claim and existing-workspace steps; code's workspace preflight; shared actual-target identity from A9; plan/proposal provenance; finish intent/cleanup/readback; state-machine recovery docs; multi-worktree scenarios. Preserve isolate.check's workspace fact rather than silently redefining it as source-role authorization.

**Steps:** Before any new change artifact/code write, resolve the actual delivery target from route Shipping rules/map.branch or project/default rules. Require a named, owner-bound change-source branch distinct from that target; isolated: yes alone is insufficient and a detached linked checkout is not a named source. If target/ownership is unknown or the same, stop for owner-directed creation/switch/verification before writing. Normalize the actual delivery identity rather than comparing raw local/remote-tracking spellings or tip SHAs: a distinct feature branch may correctly start at the target's current commit. A7's post-delivery repair may operate on the surviving base but cannot authorize new implementation. Before a new claim or suffixed workspace, inspect visible active plans/proposals/branches/worktrees for the same effort/unit; prefer resuming its owner. Record owning change, branch, base/input revision and canonical unit reference in existing change intent. Revalidate before commit/effects and enforce one writer per change/worktree. Claims are observable reservations, not distributed locks: multiple clones need an explicit shared reservation authority/serialization agreement before concurrent unit shipping is supported. Do not promise exclusivity from a local scan or status hash.

**Edit snippet:** Add to both map-aware entry paths and the finish cleanup policy:

```markdown
A pending marker in this branch alone does not establish availability. Inspect known
competing change claims; a worktree suffix does not create a second authorized owner.
Stop on ambiguity and ask to resume, explicitly transfer, or reserve through the agreed
shared authority. Revalidate dependencies and current input/owner identity before writes.
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

**Compatibility/rollout:** Agree claim/transfer authority before implementing cross-clone concurrency. Reuse current route_unit/change/branch/Git evidence; do not add a second project status database or auto-expiring destructive lease. Legacy owner ambiguity remains an explicit intervention. Changes to local-merge retention must update its stated effect contract and A7 intent/readback together; never weaken required verification by omitting failed cleanup after the fact.

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

A10 now spans T1–T34 and all documented C/E controls, including protected cases. Existing A1–A9 traceability remains unchanged; the expansion does not weaken their clearance, verification, shipment, or finalization-repair requirements.

### Final expanded-deliverable checks

- Matched the coverage ledger to all 16 documented C transitions and all 12 E predicates. Verified unique complete F1–F20, A1–A17, U1–U30 and T1–T34 entries, with targets/steps/acceptance/compatibility contracts for every action.
- Validated 64 local references, line ranges and heading anchors; balanced code fences and clean whitespace. Parsed all 17 TypeScript blocks in their appropriate object/method/interface/function contexts. This proves syntax only, not types, integration, or proposed behavior.
- Confirmed branch fix/finish-work-gates and HEAD ebfa4f53624f3ea9d6a201b2f69c9c262246ac83 remain unchanged; tracked/staged diffs are empty. This report remains the only changed non-runtime repository file; .pi/ state is preserved.
- Independent static review and its bounded delta challenge accepted the expanded analysis. Two current-helper probes ran; no future acceptance workflow, implementation fix, full suite/build, or delivery operation ran. The report is a remediation plan, not runtime assurance.
