# Workflow version 3: authoring progress

[Workflow phase index](README.md) | [Functional Design draft](phase_construction/functional-design.md)

## Purpose

Track specification decisions, not Unit of Work execution state. Each row records one decision with one unique ID.

The Functional Design contract remains a draft. Agreement on individual decisions does not approve the whole draft.

## Register rules

- Give each independently decidable question its own row and ID.
- Define each ID once. References to that ID do not create another decision.
- Do not combine completed policy with unresolved questions.
- Mark a decision complete only after requester agreement and a canonical specification record.
- Preserve IDs when decisions move between sections. Give new questions new IDs.
- Do not change policy or deferred ownership when reorganizing this register.

The former topic rows have been split. Their IDs now identify only the decisions named below. This reorganization does not approve unresolved policy.

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
| SH06 | Persistence responsibilities | [Data responsibilities](runtime.md#data-responsibilities): frontmatter holds artifact metadata; Markdown holds authored content. CLI-managed JSON holds execution state and append-only audit history. This replaces execution flags and depth settings in frontmatter. |
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
| SH29 | Evidence bindings | [Evidence bindings](runtime.md#evidence-and-approval-bindings): identify scope, attempt, checked material, inputs, results, supporting output, and relevant conditions. Record bindings through CLI-managed JSON, not frontmatter. |
| SH30 | Approval bindings | [Approval bindings](runtime.md#evidence-and-approval-bindings): identify the requester, attempt, and reviewed material. Repository output commits must exist before approval is recorded. Recording approval does not grant approval authority to the CLI. |
| SH31 | Evidence reuse | [Applicability](runtime.md#evidence-applicability): within an attempt, verify unchanged covered material and relevant inputs before reuse. Retain original references. A different commit alone does not invalidate evidence; reopening still requires stage execution again. |
| SH32 | Checkpoint preservation | [Retention principles](runtime.md#checkpoint-retention): keep required Git objects reachable through retained references. JSON identifiers, audit events, and fingerprints do not preserve content. External material needs its own retention. |
| SH33 | Task admission baseline | [Task admission](runtime.md#task-admission-and-baselines): capture the current unit integration commit containing required predecessor outputs. Keep the admitted baseline fixed. Establish inclusion through ancestry or provenance, not timestamps. |
| SH34 | Parallel coordination boundary | [Parallel execution](runtime.md#parallel-execution): independent units and ready tasks progress without global coordinator `HEAD` gates. Do not require shared admission commits or unrelated workspaces to be clean. Keep state/audit coordination short. Construction's unit integration lock is the explicit exception. |
| SH35 | Revision authority | [Authority and safeguards](revision.md#authority-and-escalation): the orchestrator assesses findings and authorizes reopening and its boundary. Preserve requester product authority, address evidence, and resolve confirmed invalidity. Ordinary internal corrections need no orchestrator approval. |
| SH36 | Revision cascade | [Revision boundary](revision.md#revision-boundary): reopen the earliest affected stage and every downstream stage in the authorized scope. Reestablish completion even when content remains unchanged. Preserve valid upstream work and historical artifacts and approvals. |
| SH37 | Reopening questionnaire mechanism | [Questionnaires](revision.md#stage-reopening-questionnaires): each stage supplies questions for the shared revision procedure. Answers support assessment; they neither authorize reopening nor exempt downstream stages. |
| SH38 | Audit ownership | [Audit ownership](runtime.md#audit-ownership): CLI-owned operations record their state changes and corresponding append-only events. Agents and skills must not implement separate state or audit writers. |
| SH39 | Revision decision recording | [Revision decisions](runtime.md#revision-decisions): record the orchestrator's decision, reason, scope, and starting stage through the CLI. Keep execution state consistent with the decision. |
| SH40 | Current-author lookup | [Current author](runtime.md#current-author): provide a command returning effective project Git identity. It identifies the current author, not an existing artifact's creator. |
| SH41 | Filename convention | [Filename convention](#filename-convention): use short filenames with full words, without abbreviations. |
| SH42 | Interrupted-work recovery | [Recovery](runtime.md#interrupted-work-recovery): resume from verified progress and preserve unfinished work. Continue the same attempt only if it has not ended. |
| SH80 | Requirement coverage across units | [Coverage](unit-of-work.md#coverage): account for known requirements when defining units. Do not leave required behavior outside the decomposition. |
| SH81 | Unit dependencies | [Dependencies](unit-of-work.md#dependencies): record dependencies and interaction contracts explicitly. Do not present dependent work as independent. |
| SH82 | Verifiable unit outcomes | [Verification](unit-of-work.md#verification): give each unit meaningful, observable acceptance conditions. |
| SH83 | Deployment as a unit concern | [Deployment](unit-of-work.md#deployment): consider deployment when defining a unit without prematurely selecting its mechanism. |
| SH88 | Phase responsibilities | [Phase organization](README.md#phase-organization): Initialization prepares the project; Inception defines units; Construction handles one unit. |
| SH89 | Direct Construction entry | [Phase organization](README.md#phase-organization): a clear request can enter Construction without Inception. |
| SH90 | Stage and skill distinction | [Shared concepts](README.md#shared-concepts): stages define workflow responsibilities; skills supply procedures. Skill packaging does not determine stage boundaries. |
| SH91 | Revision contract location | [Revision](revision.md) owns shared revision authority and procedure; [runtime](runtime.md#revision-decisions) owns attempt rules and CLI recording. Do not create a separate orchestrator document for this authority. |

## Shared decisions still pending

Each row is open. The additional unit-definition questions have no agreed allocation to core, phase, or stage contracts.

| ID | Decision | Question to resolve |
| --- | --- | --- |
| SH43 | Execution-state schema | What JSON fields and status values represent workflow execution? See [runtime decisions](runtime.md#decisions-still-required). |
| SH44 | Audit event schema | What event types, required fields, and envelope represent audit history? See [runtime decisions](runtime.md#decisions-still-required). |
| SH45 | Runtime storage paths | Where do execution-state and audit files live? See [runtime decisions](runtime.md#decisions-still-required). |
| SH46 | State/audit write consistency | How does one operation keep state changes and audit events consistent? See [runtime decisions](runtime.md#decisions-still-required). |
| SH47 | Attempt ID format | What format identifies a stage attempt? See [attempts](runtime.md#stage-attempts). |
| SH48 | Revision ID format | What format identifies an authorized revision? See [revision decisions](runtime.md#revision-decisions). |
| SH49 | Evidence record format | What JSON structure stores evidence bindings and results? See [evidence bindings](runtime.md#evidence-and-approval-bindings). |
| SH50 | Approval record format | What JSON structure stores requester approval and its bindings? See [approval bindings](runtime.md#evidence-and-approval-bindings). |
| SH51 | Material reference format | How do records identify repository and external material? See [material references](runtime.md#material-references). |
| SH52 | Required evidence coverage | Which material must each check and stage cover? See [runtime decisions](runtime.md#decisions-still-required). |
| SH53 | Progress query interface | What commands and arguments read workflow progress? See [CLI responsibilities](runtime.md#cli-responsibilities). |
| SH54 | State transition interface | What commands, arguments, validation, and authority checks govern execution-state transitions? See [CLI responsibilities](runtime.md#cli-responsibilities). |
| SH55 | Approval recording interface | What command inputs record requester approval? See [CLI responsibilities](runtime.md#cli-responsibilities). |
| SH56 | Interaction recording interface | What command inputs record workflow interactions? See [CLI responsibilities](runtime.md#cli-responsibilities). |
| SH57 | Revision command interface | What command inputs apply authorized revisions? See [CLI responsibilities](runtime.md#cli-responsibilities). |
| SH58 | Pause/resume interface | What commands and arguments manage pause checkpoints and resumption? See [CLI responsibilities](runtime.md#cli-responsibilities). |
| SH59 | Unit creation interface | What command inputs create a unit under the agreed identity rules? See [unit creation](runtime.md#unit-creation). |
| SH60 | Current-author command interface | What command name and output format expose current Git identity? See [current author](runtime.md#current-author). |
| SH61 | Missing author identity | What happens when the effective Git name or email is missing? See [current author](runtime.md#current-author). |
| SH62 | Depth state format | What JSON fields store the unit default and stage overrides? See [depth decisions](depth.md#decisions-still-required). |
| SH63 | Depth change interface | What CLI operation changes depth settings? See [depth decisions](depth.md#decisions-still-required). |
| SH64 | Lock mechanism | What mechanism enforces the agreed lock scopes? See [runtime decisions](runtime.md#decisions-still-required). |
| SH65 | Lock ownership record | How is lock ownership identified and recorded? See [runtime decisions](runtime.md#decisions-still-required). |
| SH66 | Cross-workspace coordination | How do operations coordinate across concurrent workspaces? See [runtime decisions](runtime.md#decisions-still-required). |
| SH67 | Interrupted-lock recovery | How is a lock recovered after its owner is interrupted? See [runtime decisions](runtime.md#decisions-still-required). |
| SH68 | Workspace layout | How are isolated writer and unit integration workspaces arranged? See [parallel execution](runtime.md#parallel-execution). |
| SH69 | Branch layout | How do branches represent concurrent work and integrated unit state? See [parallel execution](runtime.md#parallel-execution). |
| SH70 | Test resource isolation | How are shared test resources isolated between concurrent runs? See [parallel execution](runtime.md#parallel-execution). |
| SH71 | Evidence retention period | How long must required checkpoints and external evidence remain available? See [retention](runtime.md#checkpoint-retention). |
| SH72 | Checkpoint publication | How are required checkpoint references published? See [retention](runtime.md#checkpoint-retention). |
| SH73 | Retention cleanup | When and how can retained material be removed? See [retention](runtime.md#checkpoint-retention). |
| SH74 | Record version-control policy | Which execution-state and audit records are version-controlled, and which are checkout-local? See [runtime decisions](runtime.md#decisions-still-required). |
| SH75 | Additional unit scope guidance | What further scope and size guidance is needed beyond acceptance cohesion? See [remaining unit decisions](unit-of-work.md#decisions-still-required). |
| SH76 | Decomposition questionnaire | What questions support unit decomposition? See [remaining unit decisions](unit-of-work.md#decisions-still-required). |
| SH77 | Deployment record content | What deployment information must a unit record? See [remaining unit decisions](unit-of-work.md#decisions-still-required). |
| SH78 | Deployment record location | Where must deployment information be recorded? See [remaining unit decisions](unit-of-work.md#decisions-still-required). |
| SH79 | Deployment record timing | When must deployment information be defined? See [remaining unit decisions](unit-of-work.md#decisions-still-required). |
| SH84 | Traceability relationship format | How are relationships between execution records and artifacts represented? See [traceability](runtime.md#traceability-and-revision-outputs). |
| SH85 | Checkpoint reference names | How are retained Git references named? See [runtime decisions](runtime.md#decisions-still-required). |
| SH86 | Retained evidence storage | Where is retained evidence content stored? See [retention](runtime.md#checkpoint-retention). |
| SH87 | Interrupted state-write recovery | How does an interrupted state/audit operation restore consistency? See [runtime decisions](runtime.md#decisions-still-required). |

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

Individual decisions below are complete except whole-draft acceptance. They do not establish approval of the complete stage contract.

| ID | Decision | Status | Record |
| --- | --- | --- | --- |
| FD01 | Required documents | Complete | [Artifacts](phase_construction/functional-design.md#artifacts): require `unit-of-work.md` and `design.md` at the unit root. |
| FD02 | Functional Design scope | Complete | [Scope](phase_construction/functional-design.md#scope): define domain behavior and models, not the technical solution, quality specification, or implementation tasks. |
| FD03 | Entry conditions | Complete | [Entry conditions](phase_construction/functional-design.md#entry-conditions): sufficient context, a reasonably unit-sized outcome, and requester availability. Complete artifacts or an Inception handoff are not prerequisites. |
| FD04 | Requester approval | Complete | [Requester approval](phase_construction/functional-design.md#requester-approval): explicit approval is required and recorded through CLI-owned JSON state and audit. |
| FD05 | Reopening questionnaire | Complete | [Questionnaire](phase_construction/functional-design.md#reopening-questionnaire): use stage-specific questions with shared orchestrator revision authority. Reopened work must satisfy the stage conditions again. |
| FD06 | Stage owner and entry skill | Complete | [Agent roles](phase_construction/functional-design.md#agent-roles): `kepler-architect` owns the stage and uses `kepler-design`. No other stage agent roles are defined. |
| FD07 | Unit definition sections | Complete | [Unit definition](phase_construction/functional-design.md#unit-of-work-definition): require Purpose, Scope, and Context. The definition serves every stage. |
| FD08 | Functional design sections | Complete | [Functional design](phase_construction/functional-design.md#functional-design): require Domain behavior, Domain model, Boundaries and interactions, and Design decisions and open questions. Keep acceptance criteria with requirements. Use domain language and applicable DDD concepts. |
| FD09 | Self-review | Complete | [Self-review](phase_construction/functional-design.md#self-review): `kepler-architect` reviews through `kepler-design`; do not create a separate supporting skill. |
| FD10 | External review trigger | Complete | [External review](phase_construction/functional-design.md#external-review): external review occurs only when the requester asks for it. |
| FD11 | Completion conditions | Complete | [Completion](phase_construction/functional-design.md#completion-conditions): valid artifacts, observable criteria, consistent contracts, resolved material functional questions, explicit handoffs, self-review, and requester approval. Completion permits Non-functional Requirements, not implementation. |
| FD12 | Supporting skill responsibilities | Complete | [Supporting skills](phase_construction/functional-design.md#supporting-skills): adapt `kepler-grilling`, `kepler-wayfinder-domain-modeling`, and `kepler-wayfinder-research` for version 3. |
| FD13 | Whole-draft acceptance | Open | The requester must review and accept the complete [Functional Design draft](phase_construction/functional-design.md). Saving or committing it does not establish acceptance. |
| FD14 | Blocking functional questions | Complete | [Blocking rule](phase_construction/functional-design.md#blocking-rule): unresolved questions block completion when answers could change scope, behavior, invariants, or functional contracts. |

## Deferred decisions

Each row records one deferred question. Deferral does not select an answer or approve a proposal.

| ID | Decision | Question to resolve |
| --- | --- | --- |
| DF01 | Project reference authority | What authority do Project references have relative to unit artifacts? See [document scopes](README.md#document-scopes). |
| DF02 | Inception terminology | What terms organize Inception intents? See [phase organization](README.md#phase-organization). |
| DF03 | Project preparation requirements | What project standards and workspace preparation does Initialization require? See [phase organization](README.md#phase-organization). |
| DF04 | Technical design location | Where does Implementation Planning record the selected technical solution? See [remaining stage contracts](phase_construction/README.md#remaining-stage-contracts). |
| DF05 | Version 2 migration procedure | How does migration preserve legacy data and move old artifacts to `.kepler/deprecated/v2/`? No migration is authorized here. |
| DF06 | Supporting document types | Do supporting documents use one generic type or purpose-specific types? See [metadata decisions](metadata.md#deferred-decisions). Neither alternative is selected. |
| DF07 | Project reference structure | What internal document structure do Project references use? See [document scopes](README.md#document-scopes). |
| DF08 | Project reference updates | How are Project references maintained? See [document scopes](README.md#document-scopes). |
| DF09 | Intent document format | What documents represent Inception intents? See [phase organization](README.md#phase-organization). |
| DF10 | Inception unit-definition procedure | How does Inception produce one or more Units of Work? See [phase organization](README.md#phase-organization). |
| DF11 | Previous route concept | What relationship, if any, does the previous route concept have to Units of Work? |
| DF12 | Task graph representation | What concrete format represents the planning graph? See [remaining stage contracts](phase_construction/README.md#remaining-stage-contracts). |
| DF13 | Additional integration checks | What checks are required beyond the agreed build and full suite? See [Task Integration](phase_construction/README.md#task-integration). |
| DF14 | Integration check configuration | How are project-specific integration checks configured? See [Task Integration](phase_construction/README.md#task-integration). |
| DF15 | Task-state transitions | What detailed transitions govern Construction tasks? See [remaining stage contracts](phase_construction/README.md#remaining-stage-contracts). |
| DF16 | Dependency invalidation | How does a dependency change affect task readiness and validity? See [remaining stage contracts](phase_construction/README.md#remaining-stage-contracts). |
| DF17 | Revision shutdown coordination | How is active implementation stopped during an authorized unit-wide revision? See [upstream revision](phase_construction/README.md#unit-wide-upstream-revision). |

## Contract coverage

Initialization, Inception, and later Construction stage contracts remain under development. Their remaining work includes artifact sections, entry and completion conditions, agents, skills, questionnaires, and metadata extensions.

These are authoring areas, not single decisions. Add concrete questions as separate rows when designing each contract. Do not give an entire unfinished contract one decision ID.

## Filename convention

Use short filenames with full words, without abbreviations. The agreed `quality.md` replaces the proposed `requirements.md` name. Non-functional Requirements does not share `design.md` with Functional Design.

## Record maintenance

Update the relevant row when its decision changes. Add a new row for a different question, even when it concerns the same contract. Never reuse an ID for unrelated work or define it in both completed and pending sections.

Keep proposed choices distinct from agreed choices. Do not move deferred work into the current scope without an explicit decision. Preserve whole-draft approval boundaries when closing individual decisions.

Use ASD-STE100 Simplified Technical English. Do not run workflow-reference tests.
