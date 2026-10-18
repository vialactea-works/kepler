# Workflow version 3: authoring progress

[Workflow phase index](README.md) | [Functional Design specification](phase_construction/functional-design.md)

## Purpose

Plan the decisions needed to ship a minimum viable product (MVP) for Construction. Do not require the complete version 3 framework before implementation can start.

Track specification decisions, not Unit of Work execution state. Each row records one decision with one unique ID. Required implementation work is not a separate requester approval gate.

The requester has accepted the complete Functional Design stage specification under FD13. This does not approve a particular Unit of Work or establish completed implementation.

## Construction MVP boundary

Use the agreed [direct Construction entry](README.md#phase-organization) with a clear Unit of Work request. Greenfield work remains in scope; pre-existing application code and tests are not required. Supply relevant context without requiring completed Initialization or Inception contracts.

Ship the complete [Construction stage sequence](phase_construction/README.md#stage-outline), from Functional Design through Deliver. This includes the task coding loop, independent validation, integration, and whole-unit review.

Preserve ready-task parallelism, fixed admission baselines, attempt identity, requester authority, and evidence bindings. Hold each unit's integration lock through candidate preparation, required checks, and acceptance.

The CLI, templates, agents, and skills must support that sequence before the MVP ships. Their implementation and verification are release work, not completed specification decisions.

Standalone Initialization and Inception are outside this MVP. Removing a question from the approval queue does not remove its required behavior or implementation.

## Construction MVP path

These rows are work packages, not new decision IDs. Define only the behavior needed by this release.

For each missing stage, define essential inputs, outputs, responsibilities, completion conditions, failure/reopening, and handoff. Define requester approval only when applicable; do not add a gate by convention.

| Order | Work package | Minimum work |
| --- | --- | --- |
| 1 | Functional Design | The stage specification is accepted under FD13. Resolve DF06 before producing supporting documents. |
| 2 | Non-functional Requirements | Define essential `quality.md` content, measurable evidence, responsibility, completion conditions, and handoff. Define approval only when applicable. |
| 3 | Implementation Planning | Define the technical solution and task-plan contract. Keep the dependency graph; let implementation choose its concrete representation. |
| 4 | Implementation Execution | Define responsibilities, evidence, completion conditions, and any applicable approval. Reuse agreed task loops, returns, concurrency, and integration rules. |
| 5 | Unit of Work Review | Define whole-unit findings, evidence, correction routes, completion conditions, and any applicable approval. Integration success is not review or delivery approval. |
| 6 | Deliver | Define the delivery outcome, permitted side effects, authorization, outputs, and failure handling. Resolve deployment content, location, and timing. |
| 7 | Shared runtime | Resolve SH74 record portability. Implement journals, guarded transitions, safe recovery, material retention, and isolated concurrent work. |
| 8 | MVP release | Implement the CLI, templates, agents, and skills. Verify the complete path, recovery, scoped concurrency, and rejection of invalid transitions. |

Start implementation from agreed contracts without waiting for unrelated v3 decisions. Resolve unchosen stage behavior before deriving that stage's skills or runtime transitions.

The release must preserve separate Code Validation and candidate integration checks. A reduced approval queue does not make the MVP implemented or ready to ship.

## MVP decisions

### Shared decisions still pending

Resolve these questions within the work packages above. SH61 is conditional on missing identity; work with valid identity need not wait for that case.

| ID | Decision | Question to resolve |
| --- | --- | --- |
| SH52 | Required evidence coverage | What evidence must each remaining Construction stage produce, and what material must it cover? Existing [test duties](phase_construction/README.md#agreed-boundaries) remain binding. |
| SH61 | Missing author identity | What must happen when effective Git name or email is missing? Resolve before creating an affected artifact. Do not invent [author identity](metadata.md#author-identity). |
| SH74 | Record version-control policy | Which authoritative records travel with the repository, and which remain local? Define how workers and later sessions retain [required history](runtime.md#execution-state-representation). |
| SH77 | Deployment record content | What deployment information must the MVP record for an acceptable unit? Keep known [deployment constraints](unit-of-work.md#deployment) visible to Planning. |
| SH78 | Deployment record location | Where is the authoritative deployment information recorded? Resolve with Planning and Deliver under the [unit document layout](README.md#document-scopes). |
| SH79 | Deployment record timing | When must deployment information be complete for Planning, review, and Deliver? Known constraints already belong in the [unit definition](unit-of-work.md#deployment). |

### Stage contract decisions

Supporting files remain part of the accepted Functional Design contract. Their type remains unresolved; no supporting-document type default is approved.

| ID | Decision | Question to resolve |
| --- | --- | --- |
| DF06 | Supporting document types | Choose generic or purpose-specific types before emitting supporting documents. Metadata requires `type`; [neither alternative is approved](metadata.md#classification-and-ownership). |

## Review result

Of the 57 previously open or deferred rows, 7 remain MVP authoring decisions. Another 35 are required MVP implementation choices. Defer 13 beyond the MVP and remove 1 speculative approval gate. FD13 is now complete after requester acceptance.

The MVP review preserved the 87 previously completed decisions. Acceptance of FD13 brings the completed total to 88. Reclassification must not fabricate approval or claim implementation is complete.

## Register rules

- Give each independently decidable question its own row and ID.
- Define each ID once. References to that ID do not create another decision.
- Do not combine completed policy with unresolved questions.
- Mark a decision complete only after requester agreement and a canonical specification record.
- Preserve IDs when decisions move between sections. Give new questions new IDs.
- Classification does not approve unchosen policy or change decision ownership.

A requester decision is needed when the answer changes required behavior, authority, evidence obligations, or material scope. Technical formats, command names, and mechanisms belong to implementation within the agreed contracts.

SH identifies shared decisions. CN identifies Construction decisions. FD identifies Functional Design decisions. DF preserves the existing deferred-decision series. An ID does not determine its status.

## Completed shared decisions

Every decision in this section is complete. The linked specification contains its full contract.

| ID | Decision | Record |
| --- | --- | --- |
| SH01 | Unit identifier | [Identity and directory](unit-of-work.md#identity-and-directory): CLI-generated `YYYY-MM-DD-<slug>`, machine-local creation date, project uniqueness, stable identity, and exact directory name. Detect duplicates without overwriting. |
| SH02 | Common metadata fields | [Common fields](metadata.md#common-fields): `id`, `type`, `schema_version`, `unit_id`, `author`, and optional `labels`. Omit `unit_id` for project scope. |
| SH03 | Depth levels | [Levels](depth.md#levels): Minimal, Standard, and Comprehensive change analysis and documentation detail. They do not remove required information, verification, or approval. |
| SH04 | Editorial corrections | [Editorial corrections](revision.md#editorial-corrections): agents can correct prose without reopening or new approval when meaning stays unchanged. Use existing history, approval bindings, and evidence rules. Refer uncertain changes to the orchestrator. |
| SH05 | Unit acceptance boundary | [Acceptance cohesion](unit-of-work.md#acceptance-cohesion): define a coherent outcome that the requester can accept as a whole. Implementation size alone does not define the boundary. |
| SH06 | Persistence responsibilities | [Data responsibilities](runtime.md#data-responsibilities): frontmatter holds artifact metadata; Markdown holds authored content. CLI-owned JSON journals retain workflow history. Execution state is derived under SH43, replacing the earlier state-plus-audit representation. |
| SH07 | Unit decomposition procedure | [Decomposition procedure](unit-of-work.md#decomposition-procedure): identify outcomes, group by cohesion, check coverage, record dependencies, verify outcomes, and agree boundaries. Use "Decomposition procedure", not "Application mechanism". |
| SH08 | Walking skeleton | [Walking skeleton](unit-of-work.md#walking-skeleton): minimal executable, deployable, observable functionality across important boundaries. Use normal stages, artifacts, and approval. A proposed predecessor needs requester agreement and an explicit dependency. Retain its implementation; do not require a redundant skeleton. |
| SH09 | Walking skeleton classification | [Metadata](unit-of-work.md#metadata): use the canonical `walking-skeleton` label on the unit definition. Do not introduce `unit_kind`. |
| SH10 | Project reference scope | [Document scopes](README.md#document-scopes): Project references supply shared application context at `.kepler/reference/`. This decision does not define their authority or internal structure. |
| SH11 | Unit document layout | [Document scopes](README.md#document-scopes): required documents stay at the unit root. Additional detail uses linked files under `details/<stage>/`. Keep essential information in required sections, without empty placeholders or artificial quotas. |
| SH12 | Initial artifact types | [Accepted types](metadata.md#accepted-type-values): `unit-of-work`, `functional-design`, `non-functional-requirements`, and `project-reference`. Type identifies document purpose, not its stage or unit classification. |
| SH13 | Artifact identifier | [Identity](metadata.md#identity-and-content-versions): CLI-generated lowercase UUIDv4, full `8-4-4-4-12` form, without prefixes, braces, or shortening. Preserve it across revisions, renames, and moves. |
| SH14 | Creator identity format | [Author identity](metadata.md#author-identity): store the original creator as `Name <email>`. Use effective project Git `user.name` and `user.email` at creation. |
| SH15 | Creator attribution during edits | [Author identity](metadata.md#author-identity): preserve the original creator, except explicit correction of incorrect attribution. Record later contributions through Git history and audit records. |
| SH16 | Label role and vocabulary | [Labels](metadata.md#labels): optional classification strings with an open vocabulary. Omit unused labels; do not encode execution state. |
| SH17 | Label syntax | [Label validation](metadata.md#label-syntax-and-validation): use Kubernetes label-key syntax, including its optional DNS prefix. Matching is case-sensitive. Reject whitespace and duplicate strings; do not import controller policies. |
| SH18 | Allowed metadata fields | [Field validation](metadata.md#field-validation): allow shared fields and agreed artifact extensions only. Reject unknown fields. Extensions can add fields, not redefine common fields. |
| SH19 | Metadata value validation | [Value validation](metadata.md#value-validation): enforce types and required non-empty values, including both author components. Validation is read-only; do not coerce, delete, or generate missing values. Explicit creation can populate values. |
| SH20 | Metadata changes | [Metadata changes](metadata.md#metadata-changes): permit deliberate reclassification, ownership transfer, and label changes. Preserve UUID and creator. Transfer unit ownership and location together; validate affected contracts and apply revision rules. |
| SH21 | Artifact schema compatibility | [Schema version](metadata.md#schema-version): use the integer Kepler major version, currently `3`. Minor and patch releases preserve validity. Report unsupported schemas unchanged; do not migrate automatically. |
| SH22 | Depth inheritance | [Selection rules](depth.md#selection-rules): one unit default, explicit stage overrides, and Standard as fallback. There is no document-level depth. |
| SH23 | Depth selection authority | [Selection procedure](depth.md#selection-procedure): the agent recommends and the requester decides. Apply revision rules when a change affects completed work. |
| SH24 | Stage attempt lifecycle | [Stage attempts](runtime.md#stage-attempts): each stage execution has a distinct attempt. Internal corrections, pauses, sessions, and failed commands alone do not replace it. Authorized reopening creates another attempt when the stage executes again. |
| SH25 | Active attempt limit | [Active scope](runtime.md#attempt-identity-and-active-scope): at most one active attempt per unit/task/stage scope. Paused and waiting attempts retain their scope. Concurrent operations must preserve the limit without blocking unrelated scopes. |
| SH26 | Run floor | [Run floor](runtime.md#run-floor): use the applicable attempt identity without a separate verification round. Late results retain their original attempt; they cannot complete a newer attempt. |
| SH27 | Repository checkpoint meaning | [Checkpoint concepts](runtime.md#concepts): a commit identifies content, not checks or approval. Attempts and commits have separate identities. One attempt can use several checkpoints; different attempts can share a checkpoint. Do not create commits solely for attempt identity. |
| SH28 | Evidence material types | [Material references](runtime.md#material-references): evidence can cover repository or external material. Use immutable references or retain relevant content when mutable references are insufficient. |
| SH29 | Evidence bindings | [Evidence bindings](runtime.md#evidence-and-approval-bindings): identify scope, attempt, checked material, inputs, results, supporting output, and relevant conditions. Record bindings through CLI-owned JSON journal events, not frontmatter. |
| SH30 | Approval bindings | [Approval bindings](runtime.md#evidence-and-approval-bindings): identify the requester, attempt, and reviewed material. Repository output commits must exist before approval is recorded. Recording approval does not grant approval authority to the CLI. |
| SH31 | Evidence reuse | [Applicability](runtime.md#evidence-applicability): within an attempt, verify unchanged covered material and relevant inputs before reuse. Retain original references. A different commit alone does not invalidate evidence; reopening still requires stage execution again. |
| SH32 | Checkpoint preservation | [Retention principles](runtime.md#checkpoint-retention): keep required Git objects reachable through retained references. JSON identifiers, audit events, and fingerprints do not preserve content. External material needs its own retention. |
| SH33 | Task admission baseline | [Task admission](runtime.md#task-admission-and-baselines): capture the current unit integration commit containing required predecessor outputs. Keep the admitted baseline fixed. Establish inclusion through ancestry or provenance, not timestamps. |
| SH34 | Parallel coordination boundary | [Parallel execution](runtime.md#parallel-execution): independent units and ready tasks progress without global coordinator `HEAD` gates. Do not require shared admission commits or unrelated workspaces to be clean. Keep event-update coordination short. Construction's unit integration lock is the explicit exception. |
| SH35 | Revision authority | [Authority and safeguards](revision.md#authority-and-escalation): the orchestrator assesses findings and authorizes reopening and its boundary. Preserve requester product authority, address evidence, and resolve confirmed invalidity. Ordinary internal corrections need no orchestrator approval. |
| SH36 | Revision cascade | [Revision boundary](revision.md#revision-boundary): reopen the earliest affected stage and every downstream stage in the authorized scope. Reestablish completion even when content remains unchanged. Preserve valid upstream work and historical artifacts and approvals. |
| SH37 | Reopening questionnaire mechanism | [Questionnaires](revision.md#stage-reopening-questionnaires): each stage supplies questions for the shared revision procedure. Answers support assessment; they neither authorize reopening nor exempt downstream stages. |
| SH38 | Audit ownership | [Audit ownership](runtime.md#audit-ownership): CLI-owned operations validate transitions and append resulting events. Current state is derived; agents and skills must not write journals or projections directly. |
| SH39 | Revision decision recording | [Revision decisions](runtime.md#revision-decisions): record the orchestrator's decision, reason, scope, and starting stage through the CLI. Derive current execution state from the recorded decision. |
| SH40 | Current-author lookup | [Current author](runtime.md#current-author): provide a command returning effective project Git identity. It identifies the current author, not an existing artifact's creator. |
| SH41 | Filename convention | [Filename convention](#filename-convention): use short filenames with full words, without abbreviations. |
| SH42 | Interrupted-work recovery | [Recovery](runtime.md#interrupted-work-recovery): resume from verified progress and preserve unfinished work. Continue the same attempt only if it has not ended. |
| SH43 | Execution-state representation | [Representation](runtime.md#execution-state-representation): derive execution state from phase-owned event journals without independently authoritative state files. Each phase owns its state model and projection schemas. Materialized views are disposable. |
| SH44 | Audit event schema | [Event envelope](runtime.md#event-envelope-choices): all ten approved fields are required. Use `[]` for no causal predecessors. Record RFC3339 UTC timestamps with `Z`. Exact types and the event catalog belong to implementation. |
| SH80 | Requirement coverage across units | [Coverage](unit-of-work.md#coverage): account for known requirements when defining units. Do not leave required behavior outside the decomposition. |
| SH81 | Unit dependencies | [Dependencies](unit-of-work.md#dependencies): record dependencies and interaction contracts explicitly. Do not present dependent work as independent. |
| SH82 | Verifiable unit outcomes | [Verification](unit-of-work.md#verification): give each unit meaningful, observable acceptance conditions. |
| SH83 | Deployment as a unit concern | [Deployment](unit-of-work.md#deployment): consider deployment when defining a unit without prematurely selecting its mechanism. |
| SH88 | Phase responsibilities | [Phase organization](README.md#phase-organization): Initialization prepares the project; Inception defines units; Construction handles one unit. |
| SH89 | Direct Construction entry | [Phase organization](README.md#phase-organization): a clear request can enter Construction without Inception. |
| SH90 | Stage and skill distinction | [Shared concepts](README.md#shared-concepts): stages define workflow responsibilities; skills supply procedures. Skill packaging does not determine stage boundaries. |
| SH91 | Revision contract location | [Revision](revision.md) owns shared revision authority and procedure; [runtime](runtime.md#revision-decisions) owns attempt rules and CLI recording. Do not create a separate orchestrator document for this authority. |
| SH92 | Event producer identity | [Producer identity](runtime.md#producer-identity): record the original CLI name and actual version in `producer`. Preserve those values on import. Actor identity and approval authority remain separate. |
| SH93 | Causal event references | [Causal references](runtime.md#causal-references): require `caused_by` as a list of direct causal event IDs. Use `[]` when no recorded causes exist. Causal links do not replace attempt or material bindings. |
| SH94 | Journal order representation | [Journal order](runtime.md#journal-identity-and-order): keep `journal_id` and preserve stored local order during collection. Use stable event IDs for duplicate detection. Do not persist numeric positions or allocate separate sequence counters. |

## MVP implementation choices

Remove these questions from the requester approval queue. Implement and test them for the MVP under the linked contracts. They are neither deferred features nor completed implementations.

Safe appends, recovery, scoped locks, and concurrent work must ship. Preserve original attempts, material bindings, fixed admission baselines, and reachable evidence. Do not replace these obligations with global serialization, unsafe lock takeover, or unchecked acceptance.

The implementation must provide the project build and full-suite commands needed by the required checks. It must preserve project-required checks without waiting for a general extra-check policy.

| ID | Implementation choice | Work to resolve during implementation |
| --- | --- | --- |
| SH45 | Runtime storage paths | Where do authoritative journals and derived projections live? See [runtime decisions](runtime.md#decisions-still-required). |
| SH46 | Event-write consistency | How do event appends and journal reconciliation preserve valid workflow histories? See [runtime decisions](runtime.md#decisions-still-required). |
| SH47 | Attempt ID format | What format identifies a stage attempt? See [attempts](runtime.md#stage-attempts). |
| SH48 | Revision ID format | What format identifies an authorized revision? See [revision decisions](runtime.md#revision-decisions). |
| SH49 | Evidence record format | What JSON structure stores evidence bindings and results? See [evidence bindings](runtime.md#evidence-and-approval-bindings). |
| SH50 | Approval record format | What JSON structure stores requester approval and its bindings? See [approval bindings](runtime.md#evidence-and-approval-bindings). |
| SH51 | Material reference format | How do records identify repository and external material? See [material references](runtime.md#material-references). |
| SH53 | Progress query interface | What commands and arguments read workflow progress? See [CLI responsibilities](runtime.md#cli-responsibilities). |
| SH54 | State transition interface | What commands, arguments, validation, and authority checks govern execution-state transitions? See [CLI responsibilities](runtime.md#cli-responsibilities). |
| SH55 | Approval recording interface | What command inputs record requester approval? See [CLI responsibilities](runtime.md#cli-responsibilities). |
| SH56 | Interaction recording interface | What command inputs record workflow interactions? See [CLI responsibilities](runtime.md#cli-responsibilities). |
| SH57 | Revision command interface | What command inputs apply authorized revisions? See [CLI responsibilities](runtime.md#cli-responsibilities). |
| SH58 | Pause/resume interface | What commands and arguments manage pause checkpoints and resumption? See [CLI responsibilities](runtime.md#cli-responsibilities). |
| SH59 | Unit creation interface | What command inputs create a unit under the agreed identity rules? See [unit creation](runtime.md#unit-creation). |
| SH60 | Current-author command interface | What command name and output format expose current Git identity? See [current author](runtime.md#current-author). |
| SH62 | Depth selection representation | What event payloads and derived fields represent the unit default and stage overrides? See [depth decisions](depth.md#decisions-still-required). |
| SH63 | Depth change interface | What CLI operation changes depth settings? See [depth decisions](depth.md#decisions-still-required). |
| SH64 | Lock mechanism | What mechanism enforces the agreed lock scopes? See [runtime decisions](runtime.md#decisions-still-required). |
| SH65 | Lock ownership record | How is lock ownership identified and recorded? See [runtime decisions](runtime.md#decisions-still-required). |
| SH66 | Cross-workspace coordination | How do operations coordinate across concurrent workspaces? See [runtime decisions](runtime.md#decisions-still-required). |
| SH67 | Interrupted-lock recovery | How is a lock recovered after its owner is interrupted? See [runtime decisions](runtime.md#decisions-still-required). |
| SH68 | Workspace layout | How are isolated writer and unit integration workspaces arranged? See [parallel execution](runtime.md#parallel-execution). |
| SH69 | Branch layout | How do branches represent concurrent work and integrated unit state? See [parallel execution](runtime.md#parallel-execution). |
| SH70 | Test resource isolation | How are shared test resources isolated between concurrent runs? See [parallel execution](runtime.md#parallel-execution). |
| SH72 | Checkpoint publication | How are required checkpoint references published? See [retention](runtime.md#checkpoint-retention). |
| SH84 | Traceability relationship format | How are relationships between execution records and artifacts represented? See [traceability](runtime.md#traceability-and-revision-outputs). |
| SH85 | Checkpoint reference names | How are retained Git references named? See [runtime decisions](runtime.md#decisions-still-required). |
| SH86 | Retained evidence storage | Where is retained evidence content stored? See [retention](runtime.md#checkpoint-retention). |
| SH87 | Interrupted event-write recovery | How does an interrupted append or journal import recover without losing or duplicating events? See [runtime decisions](runtime.md#decisions-still-required). |
| DF04 | Technical design location | Where does Implementation Planning record the selected technical solution? See [remaining stage contracts](phase_construction/README.md#remaining-stage-contracts). |
| DF12 | Task graph representation | What concrete format represents the planning graph? See [remaining stage contracts](phase_construction/README.md#remaining-stage-contracts). |
| DF14 | Integration check configuration | How are project-specific integration checks configured? See [Task Integration](phase_construction/README.md#task-integration). |
| DF15 | Task-state transitions | What detailed transitions govern Construction tasks? See [remaining stage contracts](phase_construction/README.md#remaining-stage-contracts). |
| DF16 | Dependency invalidation | How does a dependency change affect task readiness and validity? See [remaining stage contracts](phase_construction/README.md#remaining-stage-contracts). |
| DF17 | Revision shutdown coordination | How is active implementation stopped during an authorized unit-wide revision? See [upstream revision](phase_construction/README.md#unit-wide-upstream-revision). |

Implement DF15 through DF17 under the agreed attempt, evidence-applicability, and revision rules. Do not invalidate tasks merely because unrelated commits arrive. Ended attempts cannot complete tasks or accept candidates. Verify that previous workers stopped before resuming affected work.

## Completed Construction decisions

These decisions apply to Construction. Do not generalize its nested execution structure to other phases.

| ID | Decision | Record |
| --- | --- | --- |
| CN01 | Unit-stage order | [Stage outline](phase_construction/README.md#stage-outline): Functional Design, Non-functional Requirements, Implementation Planning, Implementation Execution, Unit of Work Review, then Deliver. |
| CN02 | Non-functional Requirements document | [Stage boundaries](phase_construction/README.md#agreed-boundaries): use required `quality.md`, separate from functional `design.md`. Cover applicable performance, availability, security, accessibility, compatibility, operability, and observability. |
| CN03 | Technical solution selection | [Stage boundaries](phase_construction/README.md#agreed-boundaries): Implementation Planning selects the technical solution before dividing work into tasks. |
| CN04 | Plan dependency model | [Stage boundaries](phase_construction/README.md#agreed-boundaries): the plan represents tasks and dependencies as a graph. |
| CN05 | Implementation scheduling | [Implementation Execution](phase_construction/README.md#implementation-execution): the orchestrator schedules independent dependency-ready task implementations concurrently within the unit-scoped stage. |
| CN06 | Task execution structure | [Task coding](phase_construction/README.md#task-coding): Task implementation contains Task coding, then Task Integration. Task coding contains Code Generation and Code Validation. The contexts add no stages, attempts, run floors, or requester approval gates. |
| CN07 | Code Generation testing | [Stage boundaries](phase_construction/README.md#agreed-boundaries): run tests related to the modifications. |
| CN08 | Code Validation test scope | [Stage boundaries](phase_construction/README.md#agreed-boundaries): run the full application test suite. |
| CN09 | Task coding completion | [Task coding](phase_construction/README.md#task-coding): required validation succeeds and no blocking findings remain. Coding completion means ready for integration, not completed task implementation. |
| CN10 | Integration serialization | [Integration order and locking](phase_construction/README.md#integration-order-and-locking): prepare, check, then accept under one lock per unit. Hold it through checks and acceptance. Release before returning to coding. All integrated-state changes respect this lock; unrelated scopes continue. |
| CN11 | Required integration checks | [Task Integration](phase_construction/README.md#task-integration): build the combined candidate and run its full application test suite under the unit lock. Both must succeed before acceptance. These checks do not replace Code Validation. |
| CN12 | Task implementation completion | [Task Integration](phase_construction/README.md#task-integration): successful candidate acceptance and the task's other completion conditions establish task completion. Acceptance changes integrated state; it is not requester approval. |
| CN13 | Implementation Execution completion | [Attempts and completion](phase_construction/README.md#attempts-and-completion): complete required tasks and required integrated-result checks. The unit becomes ready for Unit of Work Review, not delivery approval. |
| CN14 | Task-local correction return | [Return paths](phase_construction/README.md#return-paths): the orchestrator authorizes a return to coding when task output must change. Execute Code Generation, Code Validation, and Task Integration again. The enclosing execution attempt remains active. |
| CN15 | Integration-only retry | [Return paths](phase_construction/README.md#return-paths): integration-only retries remain within the current Task Integration attempt. Failed commands alone do not create attempts. |
| CN16 | Unit-wide upstream revision | [Upstream revision](phase_construction/README.md#unit-wide-upstream-revision): stop unit admissions and active implementation, including integration. End affected attempts; retain history. Execute revised upstream stages before replacement attempts. Independent valid units continue. |
| CN17 | Unit review scope | [Stage outline](phase_construction/README.md#stage-outline): Unit of Work Review examines the complete integrated result. |
| CN18 | Construction attempt scopes | [Attempts](phase_construction/README.md#attempts-and-completion): Implementation Execution has a unit-scoped attempt. Nested task stages have task-scoped attempts within it. |
| CN19 | Independent code feedback ownership | [Stage boundaries](phase_construction/README.md#agreed-boundaries): Code Validation owns independent code feedback. |

## Functional Design decisions

The decisions below are complete. FD13 records requester acceptance of the complete stage specification, including its [skill reference](skills.md). Approval of a particular Unit of Work remains separate.

| ID | Decision | Status | Record |
| --- | --- | --- | --- |
| FD01 | Required documents | Complete | [Artifacts](phase_construction/functional-design.md#artifacts): require `unit-of-work.md` and `design.md` at the unit root. |
| FD02 | Functional Design scope | Complete | [Scope](phase_construction/functional-design.md#scope): define domain behavior and models, not the technical solution, quality specification, or implementation tasks. |
| FD03 | Entry conditions | Complete | [Entry conditions](phase_construction/functional-design.md#entry-conditions): sufficient context, a reasonably unit-sized outcome, and requester availability. Complete artifacts or an Inception handoff are not prerequisites. |
| FD04 | Requester approval | Complete | [Requester approval](phase_construction/functional-design.md#requester-approval): explicit approval is required and recorded through CLI-owned JSON journal events. |
| FD05 | Reopening questionnaire | Complete | [Questionnaire](phase_construction/functional-design.md#reopening-questionnaire): use stage-specific questions with shared orchestrator revision authority. Reopened work must satisfy the stage conditions again. |
| FD06 | Stage owner and entry skill | Complete | [Agent roles](phase_construction/functional-design.md#agent-roles): `kepler-architect` owns the stage and uses `kepler-design`. No other stage agent roles are defined. |
| FD07 | Unit definition sections | Complete | [Unit definition](phase_construction/functional-design.md#unit-of-work-definition): require Purpose, Scope, and Context. The definition serves every stage. |
| FD08 | Functional design sections | Complete | [Functional design](phase_construction/functional-design.md#functional-design): require Domain behavior, Domain model, Boundaries and interactions, and Design decisions and open questions. Keep acceptance criteria with requirements. Use domain language and applicable DDD concepts. |
| FD09 | Self-review | Complete | [Self-review](phase_construction/functional-design.md#self-review): `kepler-architect` reviews through `kepler-design`; do not create a separate supporting skill. |
| FD10 | External review trigger | Complete | [External review](phase_construction/functional-design.md#external-review): external review occurs only when the requester asks for it. |
| FD11 | Completion conditions | Complete | [Completion](phase_construction/functional-design.md#completion-conditions): valid artifacts, observable criteria, consistent contracts, resolved material functional questions, explicit handoffs, self-review, and requester approval. Completion permits Non-functional Requirements, not implementation. |
| FD12 | Supporting skill responsibilities | Complete | [Supporting skills](skills.md): adapt `kepler-grilling`, `kepler-domain-modelling`, and `kepler-research` for version 3. The skill reference records the name changes. |
| FD13 | Whole-draft acceptance | Complete | [Functional Design](phase_construction/functional-design.md): the requester accepted the complete stage specification, including the skill reference. This does not approve a Unit of Work or establish completed implementation. |
| FD14 | Blocking functional questions | Complete | [Blocking rule](phase_construction/functional-design.md#blocking-rule): unresolved questions block completion when answers could change scope, behavior, invariants, or functional contracts. |

## Deferred decisions

These questions are deferred beyond the Construction MVP. Deferral selects no fallback, precedence rule, expiry period, or destructive operation.

Supporting-document types remain an [MVP decision](#stage-contract-decisions), not a post-MVP deferral. Read supplied project context and resolve material conflicts during Construction. Deferring reference governance does not permit ignoring relevant facts or inventing current behavior.

| ID | Decision | Question to resolve |
| --- | --- | --- |
| DF01 | Project reference authority | Defer formal [reference authority](README.md#document-scopes). Investigate actual conflicts; do not choose an implicit precedence rule. |
| DF02 | Inception terminology | What terms organize Inception intents? See [phase organization](README.md#phase-organization). |
| DF03 | Project preparation requirements | What project standards and workspace preparation does Initialization require? See [phase organization](README.md#phase-organization). |
| DF05 | Version 2 migration procedure | Keep migration outside the MVP. Preserve legacy data and report unsupported schemas without [automatic conversion](metadata.md#schema-version). |
| DF07 | Project reference structure | What internal document structure do Project references use? See [document scopes](README.md#document-scopes). |
| DF08 | Project reference updates | How are Project references maintained? See [document scopes](README.md#document-scopes). |
| DF09 | Intent document format | What documents represent Inception intents? See [phase organization](README.md#phase-organization). |
| DF10 | Inception unit-definition procedure | How does Inception produce one or more Units of Work? See [phase organization](README.md#phase-organization). |
| DF13 | Additional integration checks | Defer general extra-check policy. Honor unit/project obligations and the existing [build/full-suite minimum](phase_construction/README.md#task-integration). |
| SH71 | Evidence retention period | No retention period is selected. Required checkpoints and external evidence must remain available under the [retention contract](runtime.md#checkpoint-retention). |
| SH73 | Retention cleanup | Defer destructive cleanup policy. This does not authorize expiry, checkpoint deletion, or loss of [required evidence](runtime.md#checkpoint-retention). |
| SH75 | Additional unit scope guidance | Defer additional [scope and size guidance](unit-of-work.md#decisions-still-required). Existing cohesion, coverage, dependency, and verification rules still apply. No additional criteria are approved. |
| SH76 | Decomposition questionnaire | Defer the detailed questionnaire. Use the accepted [decomposition procedure](unit-of-work.md#decomposition-procedure); no questionnaire contract is selected. |

## Removed decision gates

Delete this speculative comparison from the approval queue. Keep its ID only as a short disposition record. This does not select a legacy compatibility policy.

| ID | Removed question | Reason |
| --- | --- | --- |
| DF11 | Previous route concept | Delete speculative comparison with the old route model. No compatibility answer is selected; [migration remains deferred](metadata.md#schema-version). |

## Contract coverage

The MVP needs all six Construction stages and their task-scoped stages. The Functional Design specification is accepted; five other unit-stage contracts still need work. Supporting-document types remain unresolved under DF06.

The MVP path above defines bounded authoring work, not omnibus decision IDs. Add a question only when a material choice remains unanswered. Do not create separate approval gates for implementation-owned field types, event catalogs, or command syntax.

Do not require Initialization, Inception, managed reference features, or migration to be complete before shipping this Construction path.

## Filename convention

Use short filenames with full words, without abbreviations. The agreed `quality.md` replaces the proposed `requirements.md` name. Non-functional Requirements does not share `design.md` with Functional Design.

## Record maintenance

Update a row when its decision or disposition changes. Keep exactly one row per ID. Retain prior approval and source references when reorganizing the file.

Implementation choices require working behavior and tests, not new requester approval for every mechanism. Post-MVP rows remain unresolved; they do not authorize destructive or unsafe defaults.

Preserve whole-draft approval boundaries. This file does not grant permission to implement unapproved behavior or claim the release is complete.

Use ASD-STE100 Simplified Technical English. Do not run workflow-reference tests.
