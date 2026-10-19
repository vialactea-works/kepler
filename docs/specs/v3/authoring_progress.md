# Workflow version 3: authoring progress

[Workflow phase index](README.md) | [Functional Design specification](phases/construction/functional-design.md)

## Purpose

List accepted decisions, remaining questions, and release implementation work for the Construction MVP. The complete version 3 framework is not necessary before implementation can start.

List specification decisions, not Unit of Work execution state. Each row records one decision with one unique ID. Implementation work necessary for these decisions does not add a separate requester approval gate.

The requester accepted Functional Design and Quality Requirements under FD13 and NF12. The requester also accepted Implementation Planning (IP19) and Implementation (IE21). The Activity approvals are Code Generation (IE24), Code Validation (IE25), and Code Integration (IE27). Unit of Work Review (UR16) and Deliver (DL18) are also accepted. These seven whole-contract approvals are distinct from detailed decisions and from each other. They do not approve a particular Unit of Work, set up roles or skills, or show completed implementation.

## Construction MVP boundary

Use the agreed [direct Construction entry](README.md#phase-organization) with a clear Unit of Work request. Greenfield work stays in scope. Existing application code and tests are not prerequisites. Give relevant context without completed Initialization or Inception contracts.

Ship the complete [Standard stage sequence](workflows/standard/README.md#stages), from Functional Design through Deliver. Within Implementation, run the fixed Code Generation, Code Validation, and Code Integration Activity sequence, then complete whole-unit review.

Keep complex multi-task units and ready-task parallelism. Keep admission baselines fixed. Use explicit attempts and evidence. Recover from interruptions. Keep requester authority and the actual agreed delivery outcome. Hold each unit's integration lock through reading the current checkpoint, candidate preparation, required checks, and acceptance.

For each task in Implementation, use the fixed Activity sequence Code Generation, Code Validation, then Code Integration. Authorized returns route code changes to Generation, then do Validation and Integration again under their accepted contracts. Integration-only retries stay within the current Integration attempt. The accepted task graph sets dependencies and prerequisite conditions. The orchestrator uses those requirements and current execution facts to identify ready tasks. Do not duplicate its dependencies in the Activity procedure.

Serial or parallel scheduling is separate from dependency topology, and feedback routes do not create dependency edges.

Use one orchestrator-controlled subagent model for MVP Implementation. The orchestrator dispatches scoped workers and coordinates Activity handoffs. Workers report facts. Reviewer spawning and worker-to-worker calls are not necessary. Generation and independent non-author Validation use separate worker contexts.

Authorized orchestrator and CLI operations control progress, revision, and acceptance. Role and entry-skill responsibilities are accepted contracts. They do not install agent profiles or adopt current skill implementations. `kepler-orchestrate` coordinates Implementation and separately does the Code Integration Activity under distinct scopes and attempts. Do not add a per-task worker-topology selector.

Separate the authored plan from runtime state. Keep explicit attempts, evidence, and phase-owned rules. Separate executor dispatch from readiness, acceptance, and revision policy. Do not add a generic protocol registry, arbitrary graph language, interpreter, or Basic/Workshop/Factory preset. Do not add a team engine, swarm, extra protocol state store, or universal domain graph.

Keep a general graph engine outside this MVP. Keep necessary feedback routes. Add only behavior necessary for correctness and completion in an agreed MVP scenario. Do not add machinery only for future variants.

This change keeps the existing Construction stage placement. It does not decide the proposed Operation placement for Deliver. Functional Design, Quality Requirements, and Implementation Planning stay in Construction. These release boundaries do not show implemented behavior.

The CLI, templates, agents, and skills must have the capabilities to run the complete Construction sequence before the MVP ships. Their implementation and verification are release work, not completed specification decisions.

Standalone Initialization and Inception are outside this MVP. Removing a question from the approval queue does not remove necessary behavior or implementation.

## Construction MVP path

These rows are work packages, not new decision IDs. Set only the behavior necessary for this release.

All Construction stage and Activity contracts in this MVP are accepted. Build their documented behavior: inputs, outputs, responsibilities, completion conditions, failure or correction paths, evidence, and handoffs. Apply requester approval only when an accepted contract or authority rule makes it necessary.

| Order | Work package | Minimum work |
| --- | --- | --- |
| 1 | Functional Design | The stage specification is accepted under FD13. Use the agreed `supporting-document` type under DF06. |
| 2 | [Quality Requirements](phases/construction/quality-requirements.md) | The stage specification, including evidence and skill responsibilities, is accepted under NF12. |
| 3 | [Implementation Planning](phases/construction/implementation-planning.md) | Build the `plan.md` and task graph capabilities under their accepted contracts, including the writer and validator. |
| 4 | [Implementation](phases/construction/implementation.md) | Build the accepted unit and Activity behavior. Keep independent work, checks, concurrency, recovery, and blocker-only requester intervention. |
| 5 | [Unit of Work Review](phases/construction/unit-of-work-review.md) | Build whole-unit assessment, findings, evidence, completion, applicable acceptance, and handoff. |
| 6 | [Deliver](phases/construction/deliver.md) | Build the accepted behavior for outcome, instructions, authorization, verification, recovery, and deployment information. |
| 7 | Shared runtime | Set up journals under the accepted portability policy, guarded transitions, safe recovery, material retention, and isolated concurrent work. |
| 8 | MVP release | Build the CLI, templates, agents, and skills. Test the complete path, recovery, scoped concurrency, and rejection of invalid transitions. |

Start implementation from accepted contracts without waiting for unrelated v3 decisions. The Construction policy approval queue stays complete. The separate host and platform release-scope decision SH116 stays open. It does not reopen accepted stage or Activity contracts. Derive skills and runtime transitions from the accepted contracts.

The release must keep separate non-author Code Validation and combined-candidate Code Integration checks. A reduced approval queue does not make the MVP implemented or ready to ship.

## MVP decisions

The accepted Construction policy decisions stay complete. One release-scope decision, SH116, stays open: the certified host and platform combinations for the first Construction MVP. It does not reopen an accepted stage or Activity contract. The 45 implementation choices and 14 deferred questions stay separate from requester policy approval.

### Open MVP release-scope decision

| ID | Decision | Status | Question | Record |
| --- | --- | --- | --- | --- |
| SH116 | MVP installation targets | Open | Which agent-host and platform combinations are certified for the first Construction MVP, and which capabilities does each have? | [Installation contract draft](installation.md#host-capability-contract). This selects release-support scope, not another execution topology. |

### Coordination boundary

No coordination-protocol definition is necessary for this MVP. [CN20](#deferred-decisions) tracks later protocol definitions. [CN22](#completed-construction-decisions) keeps the agreed MVP execution model.

### Accepted stage contracts

The seven whole-contract rows record approval of Planning, Implementation, Generation, Validation, Integration, Review, and Deliver. The completed sections below keep each approval as a distinct record. Functional Design, Quality Requirements, and the task graph were accepted earlier under FD13, NF12, and IP26.

## Review result

The register contains 278 unique IDs. These include 217 completed decisions, 1 pending MVP release-scope decision, and 45 MVP implementation choices. It also contains 14 deferred questions and 1 retired question. SH116 is the only pending MVP release-scope decision.

The requester accepted 78 decisions for the Construction contracts: 16 for Planning, 24 for Implementation and Activity, 16 for Review, and 18 for Deliver. The shared approvals in that group are SH52 and SH77-SH79. SH61 and SH74 were accepted separately.

SH100, SH101, IE32, IE33, and UR17 record the later diff-package capability and command definitions. SH102-SH104 separately record accepted CLI project selection, scope selectors, and the result envelope. The seven whole-contract acceptance rows stay distinct. CN22 keeps the accepted Implementation model. CN20 lists deferred protocol definitions. Specification acceptance does not approve a specific Unit of Work or show implementation.

## Register rules

- Give each independently decidable question its own row and ID.
- Give each ID one row. References to that ID do not make another decision.
- Do not combine completed policy with unresolved questions.
- Mark a decision complete only after requester agreement and a canonical specification record.
- Keep IDs when decisions move between sections. Give new questions new IDs.
- Classification does not approve unchosen policy or change decision ownership.

Keep original decision titles in their historical wording, including the former Depth label. Contract text and references use current concept names. Historical titles also use former stage names. IE31 records the Implementation rename.

The requester replaced CN20 with deferred coordination protocol definitions. CN22 keeps the previously accepted MVP execution model. Some completed records describe a narrower approval state at the time. Their references to open proposals are historical and do not change the later whole-contract approvals recorded above.

A requester decision is necessary when the answer changes required behavior, authority, evidence obligations, or material scope. Technical formats, command names, and mechanisms belong to implementation within the agreed contracts.

SH identifies shared decisions. CN identifies Construction decisions. FD identifies Functional Design decisions. NF identifies Quality Requirements decisions. Keep existing NF identifiers after the stage rename.

IP identifies Implementation Planning decisions. IE identifies Implementation decisions, including its Activities. UR identifies Unit of Work Review decisions. DL identifies Deliver decisions. DF keeps the existing deferred-decision series. An ID does not set its status.

## Completed shared decisions

Every decision in this section is complete. The linked specification contains its full contract.

| ID | Decision | Record |
| --- | --- | --- |
| SH01 | Unit identifier | [Identity and directory](unit-of-work.md#identity-and-directory): CLI-generated `YYYY-MM-DD-<slug>`, machine-local creation date, project uniqueness, stable identity, and exact directory name. Detect duplicates without overwriting. |
| SH02 | Common metadata fields | [Common fields](metadata.md#common-fields): `id`, `type`, `schema_version`, `unit_id`, `author`, and optional `labels`. Omit `unit_id` for project scope. |
| SH03 | Depth levels | [Levels](effort.md#levels): Minimal, Standard, and Comprehensive change analysis and documentation detail. They do not remove required information, verification, or approval. |
| SH04 | Editorial corrections | [Editorial corrections](revision.md#editorial-corrections): agents can correct prose without reopening or new approval when meaning stays unchanged. Use existing history, approval bindings, and evidence rules. Refer uncertain changes to the orchestrator. |
| SH05 | Unit acceptance boundary | [Acceptance cohesion](unit-of-work.md#acceptance-cohesion): group work around a coherent outcome that the requester can accept as a whole. Implementation size alone does not set the boundary. |
| SH06 | Persistence responsibilities | [Data responsibilities](runtime.md#data-responsibilities): Frontmatter holds Markdown artifact metadata. Markdown and authored JSON hold content. CLI-owned JSON journals keep workflow history. Execution state is derived under SH43, replacing the earlier state-plus-audit representation. |
| SH07 | Unit decomposition procedure | [Decomposition procedure](unit-of-work.md#decomposition-procedure): identify outcomes, group by cohesion, compare outcomes with acceptance conditions, record dependencies, and agree boundaries. Use "Decomposition procedure", not "Application mechanism". |
| SH08 | Walking skeleton | [Walking skeleton](unit-of-work.md#walking-skeleton): minimal executable, deployable, observable functionality across important boundaries. Use normal stages, artifacts, and approval. A requester must agree to a proposed predecessor, and the unit must record an explicit dependency. Keep its implementation. A redundant skeleton is not necessary. |
| SH09 | Walking skeleton classification | [Metadata](unit-of-work.md#metadata): use the canonical `walking-skeleton` label on the unit definition. Do not introduce `unit_kind`. |
| SH10 | Project reference scope | [Document scopes](README.md#document-scopes): Project references give shared application context at `.kepler/reference/`. This decision does not set their authority or internal structure. |
| SH11 | Unit document layout | [Document scopes](README.md#document-scopes): required documents stay at the unit root. Additional detail uses linked files under `details/<stage>/`. Keep essential information in required sections, without empty placeholders or artificial quotas. |
| SH12 | Initial artifact types | [Accepted types](metadata.md#accepted-type-values): `unit-of-work`, `functional-design`, `non-functional-requirements`, and `project-reference`. Type identifies document purpose, not its stage or unit classification. |
| SH13 | Artifact identifier | [Identity](metadata.md#identity-and-content-versions): CLI-generated lowercase UUIDv4, full `8-4-4-4-12` form, without prefixes, braces, or shortening. Keep it across revisions, renames, and moves. |
| SH14 | Creator identity format | [Author identity](metadata.md#author-identity): store the original creator as `Name <email>`. Use effective project Git `user.name` and `user.email` at creation. |
| SH15 | Creator attribution during edits | [Author identity](metadata.md#author-identity): keep the original creator, except explicit correction of incorrect attribution. Record later contributions through Git history and audit records. |
| SH16 | Label role and vocabulary | [Labels](metadata.md#labels): optional classification strings with an open vocabulary. Omit unused labels. Do not encode execution state. |
| SH17 | Label syntax | [Label validation](metadata.md#label-syntax-and-validation): use Kubernetes label-key syntax, including its optional DNS prefix. Matching is case-sensitive. Reject whitespace and duplicate strings. Do not import controller policies. |
| SH18 | Allowed metadata fields | [Field validation](metadata.md#field-validation): accept only shared fields and agreed artifact extensions. Reject unknown fields. Extensions can add fields, not redefine common fields. |
| SH19 | Metadata value validation | [Value validation](metadata.md#value-validation): enforce types and necessary non-empty values, including both author components. Validation is read-only. Do not coerce, delete, or generate missing values. Explicit creation can populate values. |
| SH20 | Metadata changes | [Metadata changes](metadata.md#metadata-changes): the change permissions cover deliberate reclassification, ownership transfer, and label changes. Keep the UUID and creator. Transfer unit ownership and location together. Compare affected contracts with the proposed changes and apply revision rules. |
| SH21 | Artifact schema compatibility | [Schema version](metadata.md#schema-version): use the integer Kepler major version, currently `3`. Minor and patch releases keep artifacts valid. Report unsupported schemas. Do not change or migrate them automatically. |
| SH22 | Depth inheritance | [Selection rules](effort.md#selection-rules): one unit default, explicit stage overrides, and Standard as fallback. There is no document-level effort. |
| SH23 | Depth selection authority | [Selection procedure](effort.md#selection-procedure): the agent recommends and the requester selects. Apply revision rules when a change affects completed work. |
| SH24 | Stage attempt lifecycle | [Stage attempts](runtime.md#stage-attempts): each stage execution has a distinct attempt. Internal corrections, pauses, sessions, and failed commands alone do not replace it. Authorized reopening creates another attempt when the stage executes again. |
| SH25 | Active attempt limit | [Active scope](runtime.md#attempt-identity-and-active-scope): keep at most one active attempt per unit/stage scope. SH96 sets the separate Activity-occurrence limit. Paused and waiting attempts keep their scope. Concurrent operations keep both limits without blocking unrelated scopes. |
| SH26 | Run floor | [Run floor](runtime.md#run-floor): use the applicable attempt identity without a separate verification round. Late results keep their original attempt. They cannot complete a newer attempt. |
| SH27 | Repository checkpoint meaning | [Checkpoint concepts](runtime.md#concepts): a commit identifies content, not checks or approval. Attempts and commits have separate identities. One attempt can use several checkpoints. Different attempts can share a checkpoint. Do not create commits solely for attempt identity. |
| SH28 | Evidence material types | [Material references](runtime.md#material-references): evidence can cover repository or external material. Use immutable references or keep relevant content when mutable references are not sufficient. |
| SH29 | Evidence bindings | [Evidence bindings](runtime.md#evidence-and-approval-bindings): identify scope, attempt, checked material, inputs, results, supporting output, and relevant conditions. Record bindings through CLI-owned JSON journal events, not frontmatter. |
| SH30 | Approval bindings | [Approval bindings](runtime.md#evidence-and-approval-bindings): identify the requester, attempt, and reviewed material. Repository output commits must exist before approval is recorded. Recording approval does not grant approval authority to the CLI. |
| SH31 | Evidence reuse | [Applicability](runtime.md#evidence-applicability): within an attempt, compare covered material and relevant inputs with their references before reuse. Keep original references. A different commit alone does not invalidate evidence. The reopened stage or Activity must execute again. Earlier completion does not complete it. |
| SH32 | Checkpoint preservation | [Retention principles](runtime.md#checkpoint-retention): keep required Git objects reachable through references that stay available. JSON identifiers, audit events, and fingerprints do not keep content. Handle external material under separate retention. |
| SH33 | Task admission baseline | [Task admission](runtime.md#task-admission-and-baselines): capture the current unit integration commit containing required predecessor outputs. Keep the admitted baseline fixed. Show inclusion through ancestry or provenance, not timestamps. |
| SH34 | Parallel coordination boundary | [Parallel execution](runtime.md#parallel-execution): independent units and ready tasks progress without global coordinator `HEAD` gates. Shared admission commits and clean unrelated workspaces are not necessary for independent work. Keep event-update coordination short. Construction's unit integration lock is the explicit exception. |
| SH35 | Revision authority | [Authority and safeguards](revision.md#authority-and-escalation): the orchestrator compares findings with current contracts, then selects whether to authorize reopening and its boundary. Keep requester product authority, address evidence, and make sure a reported problem is real. Orchestrator approval is not necessary for ordinary internal corrections. |
| SH36 | Revision cascade | [Revision boundary](revision.md#revision-boundary): reopen the earliest affected stage and every downstream stage in the authorized scope. Make sure completion conditions hold again even when content stays unchanged. Keep valid upstream work and historical artifacts and approvals. |
| SH37 | Reopening questionnaire mechanism | [Questionnaires](revision.md#stage-reopening-questionnaires): each stage gives questions for the shared revision procedure. Answers help the orchestrator select whether to reopen a stage. They do not authorize reopening or exempt downstream stages. |
| SH38 | Audit ownership | [Audit ownership](runtime.md#audit-ownership): CLI-owned operations validate transitions and append resulting events. Current state comes from the recorded events. Agents and skills must not write journals or projections directly. |
| SH39 | Revision decision recording | [Revision decisions](runtime.md#revision-decisions): record the orchestrator's decision, reason, scope, and starting stage through the CLI. Derive current execution state from the recorded decision. |
| SH40 | Current-author lookup | [Current author](runtime.md#current-author): give a command that returns effective project Git identity. It identifies the current author, not an existing artifact's creator. |
| SH41 | Filename convention | [Filename convention](#filename-convention): use short filenames with full words. The requester-selected `tasks-dag.json` is an explicit exception. |
| SH42 | Interrupted-work recovery | [Recovery](runtime.md#interrupted-work-recovery): resume from recorded progress after making sure it matches actual work. Keep unfinished work. Continue the same attempt only if it has not ended. |
| SH43 | Execution-state representation | [Representation](runtime.md#execution-state-representation): derive execution state from phase-owned event journals without independently authoritative state files. Each phase owns its state model and projection schemas. Materialized views are disposable. |
| SH44 | Audit event schema | [Event envelope](runtime.md#event-envelope-choices): all ten approved fields must be present. Use `[]` for no causal predecessors. Record RFC3339 UTC timestamps with `Z`. Exact types and the event catalog belong to implementation. |
| SH80 | Requirement coverage across units | [Coverage](unit-of-work.md#coverage): account for known requirements when you set unit boundaries. Do not leave necessary behavior outside the decomposition. |
| SH81 | Unit dependencies | [Dependencies](unit-of-work.md#dependencies): record dependencies and interaction contracts explicitly. Do not present dependent work as independent. |
| SH82 | Verifiable unit outcomes | [Verification](unit-of-work.md#verification): give each unit meaningful, observable acceptance conditions. |
| SH83 | Deployment as a unit concern | [Deployment](unit-of-work.md#deployment): include deployment when you set a unit boundary. Do not select its mechanism too early. |
| SH88 | Phase responsibilities | [Phase organization](README.md#phase-organization): Initialization prepares the project. Inception identifies units. Construction handles one unit. |
| SH89 | Direct Construction entry | [Phase organization](README.md#phase-organization): a clear request can enter Construction without Inception. |
| SH90 | Stage and skill distinction | [Shared concepts](README.md#shared-concepts): Stages set workflow responsibilities. Skills give procedures. Skill packaging does not set stage boundaries. |
| SH91 | Revision contract location | [Revision](revision.md) owns shared revision authority and procedure. [Runtime](runtime.md#revision-decisions) owns attempt rules and CLI recording. Do not create a separate orchestrator document for this authority. |
| SH92 | Event producer identity | [Producer identity](runtime.md#producer-identity): record the original CLI name and actual version in `producer`. Keep those values on import. Actor identity and approval authority stay separate. |
| SH93 | Causal event references | [Causal references](runtime.md#causal-references): use `caused_by` as a list of direct causal event IDs. Use `[]` when no recorded causes exist. Causal links do not replace attempt or material bindings. |
| SH94 | Journal order representation | [Journal order](runtime.md#journal-identity-and-order): keep `journal_id` and stored local order during collection. Use stable event IDs for duplicate detection. Do not persist numeric positions or allocate separate sequence counters. |
| SH95 | Activity concept | [Activity](activity.md): An Activity is a bounded responsibility within a stage. It is not a stage, agent, skill, task, or lifecycle milestone. The owning phase or stage sets its contract. Activity completion cannot complete the stage or grant authority. |
| SH96 | Activity attempt lifecycle | [Activity attempts](runtime.md#activity-attempts): bind each attempt and run floor to its occurrence and enclosing stage attempt. Keep at most one active attempt per occurrence. Keep Activity and stage evidence in their own contracts. Do not reparent old records. Use shared CLI journals, not another lifecycle engine. |
| SH97 | Effort terminology | [Effort](effort.md) replaces the former Depth name. Minimal, Standard, and Comprehensive keep their accepted meanings and selection rules. This rename changes no required work, checks, review triggers, or authority. |
| SH98 | Workflow composition | A [workflow](README.md#shared-concepts) selects a series of phase-owned stages. Its definition owns their order and routing. Phases own stage contracts and execution scopes. [Standard](workflows/standard/README.md) selects the agreed Construction MVP sequence without accepting remaining detailed proposals. |
| SH99 | Canonical reference layout | Use [docs/specs/v3](README.md#reference-organization) for the canonical reference. Keep phase contracts under `phases/<phase>/`, Construction Activities under `phases/construction/activities/`, and Standard under `workflows/standard/`. These specification paths do not migrate unit artifacts or implement runtime behavior. |
| DF06 | Supporting document types | [Accepted types](metadata.md#accepted-type-values): use `supporting-document` for optional supporting Markdown documents. Explain purpose in content and the owning-stage link. Existing types for required unit documents and Project references stay unchanged. |
| SH52 | Required evidence coverage | Each stage and Activity contract gives its named evidence, covered material, and required results. Functional Design expresses these duties through its artifacts, self-review, explicit requester-approval coverage, and completion conditions. [Functional Design](phases/construction/functional-design.md), [Quality Requirements](phases/construction/quality-requirements.md#evidence-coverage), and the accepted stage and Activity evidence sections. |
| SH77 | Deployment record content | The accepted [Deliver contract](phases/construction/deliver.md#deployment-information) covers the destination, environment, recipient, intended outcome, reviewed source, and deliverable identity. It also covers configuration, dependencies, operator duties, operations, permissions, verification, and observation. It identifies failure boundaries, recovery, irreversible effects, and safe-retry limits. Apply this to the requested outcome. Do not add invented production instructions for a repository handoff. |
| SH78 | Deployment record location | Keep authored delivery instructions and acceptance conditions in unit-root [`delivery.md`](phases/construction/deliver.md#required-delivery-instructions). CLI-owned journals record actual operations, approvals, identities, and results. |
| SH79 | Deployment record timing | Record known constraints in the unit definition. Planning selects choices that affect implementation. Review compares preparation and constraints with the unit definition. Before affected operations, Deliver completes the instructions and makes sure that prerequisites and permissions are in place. Future external availability is not necessary for Planning completion. [Deliver timing and ownership](phases/construction/deliver.md#timing-and-upstream-ownership). |
| SH61 | Missing author identity | [Missing identity](metadata.md#missing-identity): fail lookup with a nonzero result when either effective project Git identity value is missing or blank. Identify missing `user.name` or `user.email` keys. Make sure that the identity is valid before artifact creation. Do not write incomplete author metadata or record successful creation or completion after failure. Do not invent identity, prompt inside the CLI, or change Git configuration automatically. The caller explains remediation and retries after the appropriate identity is configured. Keep existing authors and continue unaffected work. Exact error codes and response fields stay under SH60. |
| SH74 | Record version-control policy | [Record portability](runtime.md#record-portability): version authored project artifacts and phase journals. Keep projections and live runtime coordination data unversioned. Version suitable evidence. Keep large or sensitive content outside the project with durable references to the content. Keep event and journal identities, order, causality, attempts, and evidence bindings. Give relevant history, checkpoint material, and accessible evidence during cross-checkout or cross-machine handoff. Missing necessary material blocks only affected work. A new commit is not necessary solely for an event, dispatch, or session resume. Git merge success does not validate workflow history. Replay does not start workers, restore locks, or grant new consent. Keep secrets out of versioned records. Do not store full session transcripts in journals. Paths and synchronization are implementation work. Retention periods and cleanup are deferred. |
| SH100 | Generated diff-package capability | Record diff packages as an optional derived inspection capability for Code Validation, Code Integration, and Unit of Work Review. Keep the original material and attempt bindings. Packages add no workflow stage, Activity, evidence authority, or completion gate. [Git diff packages](diff-package.md). |
| SH101 | Diff-package Git command interface | Use three source-scoped commands under `kepler git diff-package`. Give explicit source selectors, project and output rules, and bounded effects. The existing MVP release work covers implementation. This decision adds no approval gate. See [CLI contract](cli.md#kepler-git-diff-package) and [Git diff packages](diff-package.md). |
| SH102 | CLI project selection interface | [Project selection](cli.md#project-selection): use optional `--project <path>`, with relative paths from the invocation working directory. Without it, use that directory itself. The selected directory must be a Git working-tree root with an existing local `.kepler/` directory, including for unit creation. Accept linked worktrees and reject bare repositories. Do not search ancestors, select another root, run setup, initialize Git, or create `.kepler/`. Return a structured error and nonzero status on failure. |
| SH103 | CLI scope selector grammar | Use the six long flags in [Scope selectors](cli.md#scope-and-selectors). Use exact IDs and the listed stage and Activity values. Each selector takes one value. Reject duplicate selectors and ownership mismatches with a structured error and nonzero status. Do not select an implicit active or latest scope or add task attempts. Keep diff-package source selectors unchanged. |
| SH104 | CLI success result envelope | Use the [result envelope](cli.md#machine-readable-output) with exactly two required fields: `status` and `data`. Use `success` or `failed` for `status`. Put command-specific fields inside the `data` JSON object. Operation success does not show workflow completion. Keep failure fields under SH105 and exits, streams, and human rendering under SH106-SH108. |

## MVP implementation choices

Remove these questions from the requester approval queue. Build and test them for the MVP under the linked contracts. They are neither deferred features nor completed implementations.

Safe appends, recovery, scoped locks, and concurrent work must ship. Keep original attempts, material bindings, fixed admission baselines, and reachable evidence. Do not replace these obligations with global serialization, unsafe lock takeover, or unchecked acceptance.

The implementation must include typechecking, project-build, and full-suite commands for the necessary checks. It must keep project-required checks without waiting for a general extra-check policy.

| ID | Implementation choice | Work to resolve during implementation |
| --- | --- | --- |
| SH45 | Runtime storage paths | Where do authoritative journals and derived projections live? See [runtime decisions](runtime.md#decisions-still-required). |
| SH46 | Event-write consistency | How do event appends and journal reconciliation keep workflow histories valid? See [runtime decisions](runtime.md#decisions-still-required). |
| SH47 | Attempt ID format | What formats identify [stage attempts](runtime.md#stage-attempts) and [Activity attempts](runtime.md#activity-attempts)? |
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
| SH62 | Depth selection representation | What event payloads and derived fields represent the unit default and stage overrides? See [effort decisions](effort.md#decisions-still-required). |
| SH63 | Depth change interface | What CLI operation changes effort settings? See [effort decisions](effort.md#decisions-still-required). |
| SH64 | Lock mechanism | What mechanism enforces the agreed lock scopes? See [runtime decisions](runtime.md#decisions-still-required). |
| SH65 | Lock ownership record | How is lock ownership identified and recorded? See [runtime decisions](runtime.md#decisions-still-required). |
| SH66 | Cross-workspace coordination | How do operations coordinate across concurrent workspaces? See [runtime decisions](runtime.md#decisions-still-required). |
| SH67 | Interrupted-lock recovery | How is a lock recovered after its owner is interrupted? See [runtime decisions](runtime.md#decisions-still-required). |
| SH68 | Workspace layout | How are isolated writer and unit integration workspaces arranged? See [parallel execution](runtime.md#parallel-execution). |
| SH69 | Branch layout | How do branches represent concurrent work and integrated unit state? See [parallel execution](runtime.md#parallel-execution). |
| SH70 | Test resource isolation | How are shared test resources isolated between concurrent runs? See [parallel execution](runtime.md#parallel-execution). |
| SH72 | Checkpoint publication | How are required checkpoint references published? See [retention](runtime.md#checkpoint-retention). |
| SH84 | Traceability relationship format | How are relationships between execution records and artifacts represented? See [traceability](runtime.md#traceability-and-revision-outputs). |
| SH85 | Checkpoint reference names | How do we name Git references that keep checkpoints reachable? See [runtime decisions](runtime.md#decisions-still-required). |
| SH86 | Retained evidence storage | Where should we store evidence content to keep it available? See [retention](runtime.md#checkpoint-retention). |
| SH87 | Interrupted event-write recovery | How does an interrupted append or journal import recover without losing or duplicating events? See [runtime decisions](runtime.md#decisions-still-required). |
| DF14 | Integration check configuration | How are project-specific integration checks configured? See [Code Integration](phases/construction/README.md#code-integration). |
| DF15 | Task-state transitions | What detailed transitions govern Construction tasks? See [remaining implementation work](phases/construction/README.md#remaining-implementation-work). |
| DF16 | Dependency invalidation | How does a dependency change affect task readiness and validity? See [remaining implementation work](phases/construction/README.md#remaining-implementation-work). |
| DF17 | Revision shutdown coordination | How is active implementation stopped during an authorized unit-wide revision? See [upstream revision](phases/construction/README.md#unit-wide-upstream-revision). |
| SH105 | CLI error result envelope | Set typed error fields for scoped causes, partial effects, and recovery information. Never report false success. See [CLI](cli.md#failure-and-recovery-rules). |
| SH106 | CLI exit-code contract | Set success, failure, usage, unsupported-input, and uncertain-outcome codes. Keep the accepted nonzero-on-failure rule. See [CLI](cli.md#failure-and-recovery-rules). |
| SH107 | CLI output stream contract | Set stdout and stderr separation and one machine-readable result without mixed prose. See [CLI](cli.md#machine-readable-output). |
| SH108 | CLI human output interface | Decide whether the MVP offers optional human rendering or a flag. Keep structured output as the default. Do not make a new human feature a condition for the MVP. See [CLI](cli.md#machine-readable-output). |
| SH109 | CLI evidence recording interface | Set typed evidence inputs and bindings through audit. Do not add raw append. Approval and interaction interfaces stay under SH55 and SH56. See [CLI audit operations](cli.md#audit-operations). |
| SH110 | CLI audit query interface | Set scoped record selectors, filters, pagination, and causal or local-sequence presentation. Do not infer global timestamp order. See [CLI audit operations](cli.md#audit-operations). |
| SH111 | CLI shared lint interface | Set selected shared-artifact paths and the full read-only validation report. Keep the accepted root lint scope. See [CLI `kepler lint`](cli.md#kepler-lint). |
| SH112 | CLI Construction lint interface | Set unit and graph selectors, necessary context, and finding format. Keep the accepted task-graph scope. See [CLI Construction lint](cli.md#kepler-workflow-construction-lint). |
| SH113 | CLI UUID generation interface | Set arguments and results for the proposed root UUID command. Do not add a global allocation registry. See [CLI `kepler uuid`](cli.md#kepler-uuid). |
| SH114 | CLI setup interface | Set which setup inputs the installation record keeps, compatibility, existing force-option handling, results, and partial-write effects. Do not add force authority. See the [installation contract draft](installation.md). |
| SH115 | CLI workflow selection interface | Set how current phase operations identify and select the Standard binding. Do not add a generic workflow registry or future phase engine. See [CLI Construction commands](cli.md#construction-commands). |
| SH117 | Agent resource installation ownership | Set ownership of skill and profile installation. State the targets, failure handling, and compatibility for setup, native hosts, or skill managers. Do not decide this in the draft. See the [installation contract draft](installation.md#open-decisions). |

Complete DF15 through DF17 under the agreed attempt, evidence-applicability, and revision rules. Do not invalidate tasks merely because unrelated commits arrive. Ended attempts cannot complete tasks or accept candidates. Make sure that previous workers stopped before resuming affected work.

## Completed Construction decisions

These decisions apply to Construction. Do not generalize its nested execution structure to other phases.

| ID | Decision | Record |
| --- | --- | --- |
| CN01 | Unit-stage order | [Standard stage order](workflows/standard/README.md#stages): Functional Design, Quality Requirements, Implementation Planning, Implementation, Unit of Work Review, then Deliver. |
| CN02 | Quality Requirements document | [Stage boundaries](phases/construction/README.md#agreed-boundaries): use required `quality.md`, separate from functional `design.md`. Cover applicable performance, availability, security, accessibility, compatibility, operability, and observability. |
| CN03 | Technical solution selection | [Stage boundaries](phases/construction/README.md#agreed-boundaries): Implementation Planning selects the technical solution before dividing work into tasks. |
| CN04 | Plan dependency model | [Stage boundaries](phases/construction/README.md#agreed-boundaries): the plan represents tasks and dependencies as a graph. |
| CN05 | Implementation scheduling | [Implementation](phases/construction/README.md#implementation): the orchestrator schedules independent dependency-ready task implementations concurrently within the unit-scoped stage. |
| CN06 | Task execution structure | [Task coding](phases/construction/README.md#task-coding): IE29 supersedes this row's task-stage classification only. Each task uses Code Generation, Code Validation, and Code Integration Activities. Task dependencies stay in the accepted graph. Task coding adds no attempt identity, run floor, or requester approval gate. |
| CN07 | Code Generation testing | [Stage boundaries](phases/construction/README.md#agreed-boundaries): run typechecking and tests related to the modifications. |
| CN08 | Code Validation test scope | [Stage boundaries](phases/construction/README.md#agreed-boundaries): run typechecking, the project build, and the full application test suite. |
| CN09 | Task coding completion | [Task coding](phases/construction/README.md#task-coding): required validation succeeds and no blocking findings stay open. Coding completion means ready for integration, not completed task implementation. |
| CN10 | Integration serialization | [Integration order and locking](phases/construction/README.md#integration-order-and-locking): prepare, run the required checks, then accept under one lock per unit. Hold it through checks and acceptance. Release before returning to coding. All integrated-state changes respect this lock. Unrelated scopes continue. |
| CN11 | Required integration checks | [Code Integration](phases/construction/README.md#code-integration): run typechecking, the build, and the full suite against the candidate under the unit lock. All three must succeed before authorized acceptance. These checks do not replace Code Validation. |
| CN12 | Task implementation completion | [Code Integration](phases/construction/README.md#code-integration): successful candidate acceptance and the task's other conditions count as task completion. Acceptance changes unit state. It is not requester approval. |
| CN13 | Implementation Execution completion | [Attempts and completion](phases/construction/README.md#attempts-and-completion): complete required tasks and required integrated-result checks. The unit becomes ready for Unit of Work Review, not delivery approval. |
| CN14 | Task-local correction return | [Return paths](phases/construction/README.md#return-paths): the orchestrator authorizes a return to Code Generation when output must change. Then run Code Generation, Code Validation, and Code Integration as required. Keep the enclosing Implementation attempt active. |
| CN15 | Integration-only retry | [Return paths](phases/construction/README.md#return-paths): Integration-only retries stay within the current Code Integration Activity attempt. Failed commands alone do not create attempts. |
| CN16 | Unit-wide upstream revision | [Upstream revision](phases/construction/README.md#unit-wide-upstream-revision): stop unit admissions and active implementation, including integration. End affected attempts. Keep their history. Execute revised upstream stages before replacement attempts. Independent valid units continue. |
| CN17 | Unit review scope | [Review scope](phases/construction/unit-of-work-review.md#goal): Unit of Work Review examines the complete integrated result. |
| CN18 | Construction attempt scopes | [Attempts](phases/construction/README.md#attempts-and-completion): Implementation has a unit-scoped attempt. Each Activity occurrence has a distinct attempt and run floor linked to it. SH96 supersedes only the historical task-stage attempt classification. The task graph and its dependencies stay unchanged. |
| CN19 | Independent code feedback ownership | [Stage boundaries](phases/construction/README.md#agreed-boundaries): Code Validation owns independent non-author code feedback. |
| CN21 | MVP coordination boundary | [Construction MVP boundary](#construction-mvp-boundary): keep the authored plan separate from runtime state. Keep explicit attempts and evidence under phase-owned rules. Keep the fixed per-task Activity procedure separate from the accepted dependency-ready DAG. Feedback routes do not add dependency edges. Keep dispatch separate from readiness, acceptance, and revision policy. Do not add a generic protocol registry, arbitrary graph language or interpreter, or Basic, Workshop, or Factory presets. Do not add a team engine, swarm, extra protocol state store, or universal domain graph. Defer a general graph engine, but keep required feedback routes. Do not add machinery only for future variants. Add only behavior necessary for an agreed MVP scenario. |
| CN22 | MVP execution model | Keep the accepted model previously recorded under CN20. [Implementation](phases/construction/implementation.md#agent-roles): use one orchestrator-controlled subagent model for MVP Implementation. The orchestrator dispatches scoped workers and coordinates Activity handoffs. Workers report facts. Reviewer spawning and worker-to-worker calls are not necessary. Generation and independent non-author Validation use separate worker contexts. The decision selects no role profiles, skill implementations, or per-task topology. It does not constrain other phases. |

## Completed Implementation decisions

Keep these records within their original approval scope and wording. IE23 and IE26 record earlier contract separation. IE29 records the later Activity classification. References to detail proposals in those earlier records describe their historical scope.

The full Implementation contract is accepted under IE21. Generation, Validation, and Integration are separately accepted under IE24, IE25, and IE27. These acceptance records do not approve a specific executing unit or set up the assigned roles and skills.

| ID | Decision | Status | Record |
| --- | --- | --- | --- |
| IE10 | Validation reviewer independence | Complete | Keep [independent non-author feedback](phases/construction/activities/code-validation.md#roles-and-skills) on actual task material without authoring or editing the implementation. A different model, vendor, or human is not required. |
| IE13 | Execution approval trigger | Complete | Requester [intervention](phases/construction/implementation.md#requester-intervention) occurs only for hard blockers that agents cannot resolve within their authority. Routine task acceptance follows successful Validation and Integration, not requester approval. |
| IE23 | Dedicated task-stage contracts | Complete | This historical decision made dedicated Generation and Validation contracts necessary. [IE29](#completed-implementation-decisions) replaces only their stage classification. Generation and Validation are now Activities. Their detailed contract proposals stay open under IE24 and IE25. The fixed Activity order and check duties stay agreed. |
| IE26 | Dedicated Integration contract | Complete | This historical decision made a dedicated Integration contract necessary. [IE29](#completed-implementation-decisions) replaces its stage classification and names its Activity Code Integration. IE27 keeps its procedure, evidence, role, and handoff details open. |
| IE29 | Implementation Activity classification | Complete | [Activity](activity.md) gives the shared concept. Code Generation, Code Validation, and Code Integration are Activities within Implementation, not stages. Their detailed contracts are not yet approved. This classification approves no executing unit or skill implementation. It does not accept an unapproved contract body. |
| IE30 | Compact Activity contracts | Complete | [Activity contracts](phases/construction/activities/README.md) share execution, effort, evidence-binding, review, and recovery rules. Each keeps its specific inputs, procedure, checks, named evidence, completion, correction questions, and handoff. Shortening keeps agreed guarantees without accepting detailed contract proposals or adding skills. |
| IE31 | Implementation stage name | Complete | Use [Implementation](phases/construction/implementation.md) as the stage name. It replaces the former Implementation Execution name. Keep Activity boundaries, attempt scopes, necessary checks, evidence, authority, and the agreed MVP model. The rename does not accept detailed proposals or change implementation status. |
| IE01 | Execution entry conditions | Complete | Start after Planning and earlier stages complete under their contracts. Current inputs and execution authority must be available. Identify or set the initial integration checkpoint before the first admission. A greenfield checkpoint is valid. Do not block independent ready work because of future prerequisites. [Entry conditions](phases/construction/implementation.md#entry-conditions). |
| IE02 | Execution outputs and ownership | Complete | Make task implementation material, accepted integrated unit material, and CLI-owned stage and Activity evidence. A separate execution Markdown document is not necessary. Optional detail uses `details/implementation/`. [Artifacts and records](phases/construction/implementation.md#artifacts-and-records). |
| IE03 | Execution stage owner | Complete | `kepler-orchestrator` coordinates admissions, workers, findings, execution records, completion, and the Review handoff. [Agent roles](phases/construction/implementation.md#agent-roles). |
| IE04 | Generation stage owner | Complete | `kepler-coder` owns task implementation, typechecking, modification-related tests, self-review, evidence, and the Validation handoff. [Code Generation roles and skills](phases/construction/activities/code-generation.md#roles-and-skills). |
| IE05 | Validation stage owner | Complete | `kepler-reviewer` owns required checks and independent non-author feedback. The reviewer does not author or edit the candidate. [Code Validation roles and skills](phases/construction/activities/code-validation.md#roles-and-skills). |
| IE06 | Integration stage owner | Complete | `kepler-orchestrator` owns candidate preparation, combined checks, evidence, and authorized acceptance under the unit integration lock. [Code Integration roles and skills](phases/construction/activities/code-integration.md#roles-and-skills). |
| IE07 | Execution entry skill | Complete | `kepler-orchestrate` coordinates the unit graph, scoped handoffs, completion evidence, and Review handoff under the Implementation contract. [Implementation skill responsibilities](skills.md#kepler-orchestrate). |
| IE08 | Generation entry skill | Complete | `kepler-code` makes the changes for the task outcome, runs necessary checks, does a self-review, records Generation evidence, and hands checked material to Validation. [Generation skill responsibilities](skills.md#kepler-code). |
| IE09 | Validation entry skill | Complete | `kepler-code-feedback` compares actual task material with its baseline, task contract, functional obligations, quality requirements, and relevant upstream inputs. It gives independent non-author feedback, records evidence, and hands valid results to Integration. [Validation skill responsibilities](skills.md#kepler-code-feedback). |
| IE11 | Execution self-review rule | Complete | Each applicable entry procedure owns self-review. The unit owner makes sure that evidence covers the unit and that integrated completion and handoff information are complete. Activity self-review follows its own contract. Neither adds a separate stage or attempt identity. [Self-review](phases/construction/implementation.md#self-review). |
| IE12 | Additional execution review trigger | Complete | Additional external review occurs only when the requester asks. This does not replace required independent Validation feedback or whole-unit Review. [Additional review](phases/construction/implementation.md#additional-review). |
| IE14 | Execution reopening questionnaires | Complete | Implementation and Activity questionnaires identify relevant findings and proposed boundaries. They help the orchestrator select a boundary but do not change revision authority or authorize reopening. [Reopening questionnaires](phases/construction/implementation.md#reopening-questionnaires). |
| IE15 | Generation completion evidence | Complete | Generation evidence covers the task output checkpoint, changed behavior, related tests, contract, and inputs. Typechecking and modification-related tests must succeed. Self-review must find no blocker. [Generation evidence coverage](phases/construction/activities/code-generation.md#evidence-coverage). |
| IE16 | Validation completion evidence | Complete | Validation evidence covers the actual task output and conditions. Typechecking, project build, full suite, and independent non-author feedback must succeed. Do not leave a blocking finding open. [Validation evidence coverage](phases/construction/activities/code-validation.md#evidence-coverage). |
| IE17 | Integration completion evidence | Complete | Integration evidence covers the combined candidate and actual inputs under the unit lock. Required checks must pass against the exact accepted bytes. Keep acceptance and original Activity bindings. [Integration evidence coverage](phases/construction/activities/code-integration.md#evidence-coverage). |
| IE18 | Execution completion evidence | Complete | Review the final unit checkpoint, task graph, upstream obligations, Activity evidence, and provenance against the unit completion conditions. Report whether those conditions hold. Current-attempt evidence is necessary for each reopened Activity. Unaffected scopes keep valid original bindings. [Implementation evidence coverage](phases/construction/implementation.md#evidence-coverage). |
| IE19 | Execution completion details | Complete | Complete every required task and Activity, required checks, integrated output, evidence, self-review, and handoff. Do not leave blockers open. Get required requester decisions. Keep whole-unit Review and Deliver separate. [Implementation completion conditions](phases/construction/implementation.md#completion-conditions). |
| IE20 | Execution handoff | Complete | Identify the unit, current upstream artifacts, final integrated checkpoint, task set, and Activity evidence. Include coverage, provenance, resolved findings, and nonblocking limits for Review. [Implementation handoff](phases/construction/implementation.md#handoff). |
| IE21 | Execution whole-draft acceptance | Complete | The requester accepted the complete unit-scoped [Implementation specification](phases/construction/implementation.md), including its role and skill responsibilities. This does not approve an executing Unit of Work or authorize delivery. [Implementation](phases/construction/implementation.md). |
| IE22 | Post-completion execution return | Complete | After authorized reopening at Implementation, reopen each affected Activity from its earliest invalid scope and every following Activity. Reopened Activities use new attempts. Reopen dependent tasks whose work or evidence is invalid. Unaffected Activities keep their original parent, attempt, and material bindings after assessment. Make a new completion assessment for the new unit attempt, then do downstream Review and Deliver again. [Return after completed Implementation](phases/construction/implementation.md#return-after-completed-implementation). |
| IE24 | Generation contract acceptance | Complete | The requester accepted the complete [Code Generation Activity contract](phases/construction/activities/code-generation.md), including its role, evidence, completion, and handoff. This is a specification approval, not a skill or profile implementation. [Code Generation](phases/construction/activities/code-generation.md). |
| IE25 | Validation contract acceptance | Complete | The requester accepted the complete [Code Validation Activity contract](phases/construction/activities/code-validation.md), including its role, evidence, completion, and handoff. This is a specification approval, not a skill or profile implementation. [Code Validation](phases/construction/activities/code-validation.md). |
| IE27 | Integration contract acceptance | Complete | The requester accepted the complete [Code Integration Activity contract](phases/construction/activities/code-integration.md), including its role, evidence, completion, and handoff. This Activity attempt stays distinct from `kepler-orchestrate`'s Implementation coordination scope. [Code Integration](phases/construction/activities/code-integration.md). |
| IE28 | Integration entry skill | Complete | `kepler-orchestrate` does Code Integration in its distinct Activity occurrence and attempt. Acquire the unit lock, prepare the candidate, run its required checks, report evidence, and help the orchestrator with authorized acceptance. Release the lock before a return. [Code Integration roles and skills](phases/construction/activities/code-integration.md#roles-and-skills). |
| IE32 | Validation diff-package scope | Complete | Compare the fixed task admission baseline with the generated task output. Bind task definition, relevant upstream versions, original Generation attempt, and contribution history. Package generation may occur before Integration. A new Validation attempt is not necessary. Do not add a Generation completion gate. [Code Validation scope](diff-package.md#code-validation). |
| IE33 | Integration diff-package scope | Complete | Compare the actual checkpoint captured after the Integration operation acquires the unit lock with its immutable prepared candidate. Keep validated output and original Generation and Validation evidence separate from the admission baseline. Do not add a lock operation or independent review step. [Code Integration scope](diff-package.md#code-integration). |

## Functional Design decisions

The decisions below are complete. FD13 records requester acceptance of the complete stage specification, including its [skill reference](skills.md). Approval of a particular Unit of Work stays separate.

| ID | Decision | Status | Record |
| --- | --- | --- | --- |
| FD01 | Required documents | Complete | [Artifacts](phases/construction/functional-design.md#artifacts): use `unit-of-work.md` and `design.md` at the unit root. |
| FD02 | Functional Design scope | Complete | [Scope](phases/construction/functional-design.md#scope): give domain behavior and models, not the technical solution, quality specification, or implementation tasks. |
| FD03 | Entry conditions | Complete | [Entry conditions](phases/construction/functional-design.md#entry-conditions): sufficient context, a reasonably unit-sized outcome, and requester availability. Complete artifacts or an Inception handoff are not prerequisites. |
| FD04 | Requester approval | Complete | [Requester approval](phases/construction/functional-design.md#requester-approval): give explicit requester approval and record it through CLI-owned JSON journal events. |
| FD05 | Reopening questionnaire | Complete | [Questionnaire](phases/construction/functional-design.md#reopening-questionnaire): use stage-specific questions with shared orchestrator revision authority. Reopened work must satisfy the stage conditions again. |
| FD06 | Stage owner and entry skill | Complete | [Agent roles](phases/construction/functional-design.md#agent-roles): `kepler-architect` owns the stage and uses `kepler-design`. The contract sets no other stage agent roles. |
| FD07 | Unit definition sections | Complete | [Unit definition](phases/construction/functional-design.md#unit-of-work-definition): include Purpose, Scope, and Context. The definition serves every stage. |
| FD08 | Functional design sections | Complete | [Functional design](phases/construction/functional-design.md#functional-design): include Domain behavior, Domain model, Boundaries and interactions, and Design decisions and open questions. Keep acceptance criteria with requirements. Use domain language and applicable DDD concepts. |
| FD09 | Self-review | Complete | [Self-review](phases/construction/functional-design.md#self-review): `kepler-architect` does a review through `kepler-design`. Do not make a separate supporting skill. |
| FD10 | External review trigger | Complete | [External review](phases/construction/functional-design.md#external-review): external review occurs only when the requester asks for it. |
| FD11 | Completion conditions | Complete | [Completion](phases/construction/functional-design.md#completion-conditions): valid artifacts, observable criteria, consistent contracts, resolved material functional questions, explicit handoffs, self-review, and requester approval. After completion, the unit can enter Quality Requirements, not Implementation. |
| FD12 | Supporting skill responsibilities | Complete | [Supporting skills](skills.md): adapt `kepler-grilling`, `kepler-domain-modelling`, and `kepler-research` for version 3. The skill reference records the name changes. |
| FD13 | Whole-draft acceptance | Complete | [Functional Design](phases/construction/functional-design.md): the requester accepted the complete stage specification, including the skill reference. This does not approve a Unit of Work or show completed implementation. |
| FD14 | Blocking functional questions | Complete | [Blocking rule](phases/construction/functional-design.md#blocking-rule): unresolved questions block completion when answers could change scope, behavior, invariants, or functional contracts. |

## Quality Requirements decisions

The decisions below are complete. The requester accepted the complete stage specification under NF12, including its [skill reference](skills.md#kepler-quality).

This approval concerns the specification, not an executing Unit of Work or completed implementation.

| ID | Decision | Status | Record |
| --- | --- | --- | --- |
| NF01 | Quality document sections | Complete | [Required sections](phases/construction/quality-requirements.md#required-sections): include Quality requirements, Constraints and dependencies, and Decisions and open questions in `quality.md`. |
| NF02 | Quality requirement content | Complete | [Requirement content](phases/construction/quality-requirements.md#requirement-content): state covered material, targets or constraints, relevant conditions, objective acceptance conditions, assumptions, and dependencies. |
| NF03 | Category applicability procedure | Complete | [Applicability](phases/construction/quality-requirements.md#quality-categories): compare each of the eight categories with the unit's conditions. State which categories do not apply, with a brief reason. Do not invent targets or waive relevant obligations. |
| NF04 | Entry conditions | Complete | [Entry](phases/construction/quality-requirements.md#entry-conditions): completed Functional Design, current artifacts, and requester availability for consequential quality choices. Existing code and measurements are not prerequisites. |
| NF05 | Stage owner | Complete | [Agent role](phases/construction/quality-requirements.md#agent-roles): `kepler-architect` owns the stage and keeps its quality requirements consistent. |
| NF06 | Entry skill | Complete | [kepler-quality](skills.md#kepler-quality) does the stage's investigation, keeps artifacts current, does self-review, records evidence, requests approval, and hands work off. |
| NF07 | Self-review | Complete | [Self-review](phases/construction/quality-requirements.md#self-review) belongs in the entry skill and covers applicability, scope, acceptance conditions, consistency, blocking questions, and handoff. |
| NF08 | External review trigger | Complete | [External review](phases/construction/quality-requirements.md#external-review) occurs only when the requester asks for it. Self-review is necessary. |
| NF09 | Requester approval | Complete | [Approval](phases/construction/quality-requirements.md#requester-approval) makes explicit requester acceptance of the current quality material necessary. Record it through CLI-owned events. |
| NF10 | Reopening questionnaire | Complete | [Reopening questions](phases/construction/quality-requirements.md#reopening-questionnaire) identify stage-specific findings for the orchestrator's revision decision. Apply the shared authority and cascade rules. |
| NF11 | Completion conditions | Complete | [Completion](phases/construction/quality-requirements.md#completion-conditions) is valid only with valid artifacts, consistent requirements, resolved blocking questions, named evidence, requester approval, and a handoff to Implementation Planning. |
| NF12 | Whole-draft acceptance | Complete | [Quality Requirements](phases/construction/quality-requirements.md): the requester accepted the complete stage specification, including evidence and skill responsibilities. This does not approve an executing Unit of Work. |
| NF13 | Design quality category | Complete | [Maintainability](phases/construction/quality-requirements.md#maintainability) covers modularity, extensibility, decoupling, and safe change or technology replacement. Planning selects the mechanisms. |
| NF14 | Stage evidence coverage | Complete | [Evidence](phases/construction/quality-requirements.md#evidence-coverage) includes artifact validation, quality self-review, requested external review, and a separate requester approval record. Apply shared evidence bindings, applicability rules, and retention rules. |

## Implementation Planning decisions

These scoped decisions and the complete Implementation Planning specification are accepted. IP19 records whole-stage acceptance separately from its detailed policy rows.

| ID | Decision | Status | Record |
| --- | --- | --- | --- |
| IP01 | Required planning document | Complete | [Artifacts](phases/construction/implementation-planning.md#paths-and-organization): use `plan.md` for technical rationale and `tasks-dag.json` for the task graph at the unit root. |
| DF04 | Technical design location | Complete | [Technical solution](phases/construction/implementation-planning.md#technical-solution): record the selected technical solution and its rationale in `plan.md` at the unit root. |
| IP21 | Technical rationale coverage | Complete | [Rationale](phases/construction/implementation-planning.md#technical-solution): `plan.md` must record the technical rationale for every planning decision. Concise explanations or precise references can be sufficient. |
| DF12 | Task graph representation | Complete | Use the custom [Kepler task graph JSON format](phases/construction/task-graph.md). Do not adopt JGF. Its writer and validator stay in MVP implementation work. |
| IP22 | Task ID format | Complete | Use [UUIDv4 strings for task IDs](phases/construction/task-graph.md#task-identity), independently of titles, artifact IDs, and attempt IDs. |
| IP23 | Verification setup placement | Complete | The graph's [verification object](phases/construction/task-graph.md#verification-object) records procedure, fixtures, versions, resources, and isolation conditions in `method`. Remove the separate `environment` field. |
| IP24 | Dependency object fields | Complete | Each [dependency object](phases/construction/task-graph.md#dependency-object) contains only `task_id` and `reason`. Explain required predecessor work in `reason`. Keep task-level `outputs`. |
| IP25 | Task resource instruction placement | Complete | Remove the graph's `coordination` field. Place [resource-use instructions](phases/construction/task-graph.md#shared-file-and-resource-instructions) in `guidance`, verification `method`, or `prerequisites`, according to their scope. |
| IP06 | Task definition content | Complete | [Task content](phases/construction/task-graph.md#task-object) lists identity, goal, inputs, outputs, acceptance criteria, guidance, verification, dependencies, and external prerequisites. Accepted under IP26. |
| IP07 | Dependency contract | Complete | Each [dependency](phases/construction/task-graph.md#dependency-object) must name justified predecessor work in `reason`. Resolve predecessor references and reject self-dependencies, duplicate edges, and cycles. Accepted under IP26. |
| IP20 | External prerequisite readiness | Complete | [Prerequisites](phases/construction/task-graph.md#prerequisite-object) identify affected work, timing, availability conditions, blocking behavior, and nonblocking rationale. Make sure blocking conditions hold before affected work, not at Planning completion. Accepted under IP26. |
| IP26 | Task graph specification acceptance | Complete | The requester accepted the complete [task graph specification](phases/construction/task-graph.md), including its field meanings, example, validation rules, and JSON Schema. This does not accept the whole Planning stage or approve an executing unit. |
| IP02 | Planning artifact type | Complete | Use `implementation-plan` for `plan.md`. Optional supporting Markdown uses `supporting-document`. See [Artifact metadata](phases/construction/implementation-planning.md#artifact-metadata) and [accepted types](metadata.md#accepted-type-values). |
| IP03 | Plan sections | Complete | Include Technical solution, Task graph context, Verification strategy, and Decisions and open questions in `plan.md`. A section can use a precise reference for unchanged information. [Required sections](phases/construction/implementation-planning.md#required-sections). |
| IP04 | Technical solution content | Complete | Select mechanisms against functional and quality obligations. Record rationale for every planning decision. Compare materially viable alternatives when constraints, risk, compatibility, or cost differ. Identify effects on data, consumers, configuration, operation, and delivery. [Technical solution](phases/construction/implementation-planning.md#technical-solution). |
| IP05 | Task identity | Complete | Use unique unit-scoped task identities. Keep surviving IDs when task order or descriptions change. Keep historical definitions and execution bindings. Do not reuse retired IDs or transfer completion across an authorized revision. Use UUIDv4 under IP22. [Task identities and definitions](phases/construction/implementation-planning.md#task-identities-and-definitions). |
| IP08 | Requirement coverage | Complete | Cover every applicable functional and quality obligation through planned work or a justified reference to unchanged behavior. Include necessary verification, integration, compatibility, and deployment preparation. [Dependencies and coverage](phases/construction/implementation-planning.md#dependencies-and-coverage). |
| IP09 | Verification strategy | Complete | Plan checks for tasks and the complete unit, expected results, environments, fixtures, missing infrastructure, and necessary permissions. Keep Generation, Validation, and Integration duties under CN07, CN08, and CN11. [Verification strategy](phases/construction/implementation-planning.md#verification-strategy). |
| IP10 | Entry conditions | Complete | Start after upstream stages complete under their contracts, current outputs are available, and consequential choices have a requester decision path. A complete plan, selected solution, test infrastructure, and future prerequisites are not entry requirements. [Entry conditions](phases/construction/implementation-planning.md#entry-conditions). |
| IP11 | Stage owner | Complete | `kepler-architect` owns Implementation Planning. The owner investigates context, selects the solution, sets the task graph, and examines the plan against upstream contracts. [Agent roles](phases/construction/implementation-planning.md#agent-roles). |
| IP12 | Entry skill | Complete | `kepler-plan` gives the Planning procedure, including context investigation, technical solution and task graph, self-review, and handoff. This contract does not install or use a current skill. [Supporting skills](phases/construction/implementation-planning.md#supporting-skills). |
| IP13 | Self-review | Complete | Self-review belongs in `kepler-plan`. Compare technical choices, requirement coverage, task definitions and dependencies, prerequisites, and verification feasibility with their contracts. Report unresolved consequential decisions. [Self-review](phases/construction/implementation-planning.md#self-review). |
| IP14 | External review trigger | Complete | External review occurs only when the requester asks. Effort, risk, and complexity do not trigger it. Self-review is necessary. [External review](phases/construction/implementation-planning.md#external-review). |
| IP15 | Requester approval trigger | Complete | Get whole-plan approval only when an authority rule or requester instruction makes it necessary. Identify covered material and record explicit approval against that material before handoff. [Requester decisions and approval](phases/construction/implementation-planning.md#requester-decisions-and-approval). |
| IP16 | Reopening questionnaire | Complete | Evaluate changes to the selected solution, task outcomes or coverage, dependencies or prerequisites, and verification feasibility. Also evaluate consequential decisions and completion conditions. Answers help the orchestrator select a revision boundary but do not authorize the decision. [Reopening questionnaire](phases/construction/implementation-planning.md#reopening-questionnaire). |
| IP17 | Completion conditions | Complete | Complete both artifacts, the task and prerequisite definitions, and the rationale. Make sure that the artifacts are consistent, the graph is valid, obligations have coverage, and verification is feasible. Complete self-review, applicable reviews and approvals, and the Implementation handoff. [Completion conditions](phases/construction/implementation-planning.md#completion-conditions). |
| IP18 | Stage evidence coverage | Complete | Record artifact validation, task graph validation, Planning self-review, requested external review, and applicable requester approval. Bind each record to its scope, unit attempt, covered material, inputs, and supporting output. [Evidence coverage](phases/construction/implementation-planning.md#evidence-coverage). |
| IP19 | Whole-draft acceptance | Complete | The requester accepted the complete [Implementation Planning specification](phases/construction/implementation-planning.md), including its skill responsibilities. This does not approve an executing Unit of Work or implementation. [Implementation Planning](phases/construction/implementation-planning.md). |

## Unit of Work Review decisions

These decisions record the accepted review procedure and the separate whole-contract approval under UR16.

| ID | Decision | Status | Record |
| --- | --- | --- | --- |
| UR01 | Unit review entry conditions | Complete | Start after Implementation completes under its contract. The integrated result and evidence must be identified, and whole-unit acceptance conditions must be assessable. Delivery, publication, deployment, and requester acceptance are not prerequisites to review. [Entry conditions](phases/construction/unit-of-work-review.md#entry-conditions). |
| UR02 | Unit review record outputs | Complete | Record review evidence and findings through CLI-owned operations. No separate review Markdown document is required. Optional reports and analysis do not become completion authorities. [Artifacts and records](phases/construction/unit-of-work-review.md#artifacts-and-records). |
| UR03 | Whole-unit review procedure | Complete | Identify material and inputs. Compare evidence with review obligations. Examine the complete outcome and interactions, then report findings and resolve blockers through authorized revision. Compare review records with applicable obligations. Record applicable acceptance and hand off to Deliver. [Review procedure](phases/construction/unit-of-work-review.md#review-procedure). |
| UR04 | Unit review evidence assessment | Complete | Compare Activity coverage, combined-result checks, applicability, and retention with review obligations. Report whether the evidence meets those obligations. Do not rerun all checks without cause. Run checks for uncovered obligations. Missing mandatory upstream evidence means that the upstream stage must reopen. [Evidence assessment](phases/construction/unit-of-work-review.md#evidence-assessment). |
| UR05 | Unit review findings and correction | Complete | Distinguish blockers from advice and nonblocking limitations. The reviewer reports evidence and a proposed boundary. The orchestrator selects clarification or revision. Correct local assessment errors within the active review attempt. [Findings and correction](phases/construction/unit-of-work-review.md#findings-and-correction). |
| UR06 | Unit review stage owner | Complete | `kepler-reviewer` owns whole-unit assessment and must have capabilities for functional analysis, code review, quality analysis, and evidence evaluation. [Agent roles](phases/construction/unit-of-work-review.md#agent-roles). |
| UR07 | Unit review independence | Complete | The reviewer must not be the primary author of the integrated result. The reviewer may have participated in an earlier task review. No different model, vendor, or human is necessary for independence. [Agent roles](phases/construction/unit-of-work-review.md#agent-roles). |
| UR08 | Unit review entry skill | Complete | `kepler-review` gives whole-unit assessment, self-review, evidence recording, and the Deliver handoff. The responsibility contract does not install or use a current skill. [Supporting skills](phases/construction/unit-of-work-review.md#supporting-skills). |
| UR09 | Unit review self-review | Complete | `kepler-review` makes sure that its self-review covers complete-unit duties, evidence applicability, blocking findings, and the result. Self-review does not replace independent assessment. [Self-review](phases/construction/unit-of-work-review.md#self-review). |
| UR10 | Additional unit review trigger | Complete | Additional external review occurs only when the requester asks. The Unit of Work Review stage is necessary. [Additional review](phases/construction/unit-of-work-review.md#additional-review). |
| UR11 | Unit acceptance trigger | Complete | Get separate requester acceptance only when an authority rule or requester instruction makes it necessary. Bind each approval to the current review attempt and actual reviewed material. [Requester acceptance](phases/construction/unit-of-work-review.md#requester-acceptance). |
| UR12 | Unit review reopening questions | Complete | Examine the whole-unit conclusion, reviewed material and inputs, unresolved blockers, upstream evidence, and applicable requester acceptance. The orchestrator uses the answers when it selects the boundary. The answers do not authorize that selection. [Reopening questionnaire](phases/construction/unit-of-work-review.md#reopening-questionnaire). |
| UR13 | Unit review completion conditions | Complete | Complete the whole-outcome assessment, self-review, requested review, and applicable acceptance. Keep applicable evidence available and resolve blocking findings. Complete the Deliver handoff. [Completion conditions](phases/construction/unit-of-work-review.md#completion-conditions). |
| UR14 | Unit review evidence coverage | Complete | Record Implementation evidence assessment, whole-unit review, additional checks, requested external review, and applicable requester acceptance. Keep their specified material and necessary results. Conditional rows apply only when their conditions occur. [Evidence coverage](phases/construction/unit-of-work-review.md#evidence-coverage). |
| UR15 | Unit review handoff | Complete | Give the reviewed checkpoint, current upstream artifacts, review result, evidence, and applicable acceptance. Include delivery constraints, nonblocking limits, prerequisites, and every remaining permission or requester decision. [Handoff](phases/construction/unit-of-work-review.md#handoff). |
| UR16 | Unit review whole-draft acceptance | Complete | The requester accepted the complete [Unit of Work Review specification](phases/construction/unit-of-work-review.md), including its skill responsibilities. This does not approve a specific Unit of Work or authorize delivery. [Unit of Work Review](phases/construction/unit-of-work-review.md). |
| UR17 | Unit review diff-package scope | Complete | Start at the original unit integration checkpoint from before first task admission. End at the final checkpoint identified by the selected Implementation attempt's completion assessment. Keep that baseline across returns. Use the package as an aid. Keep whole-outcome and unchanged-behavior review. [Unit Review scope](diff-package.md#unit-of-work-review). |

## Deliver decisions

These decisions record the accepted delivery policies and the separate whole-contract approval under DL18.

| ID | Decision | Status | Record |
| --- | --- | --- | --- |
| DL01 | Deliver entry conditions | Complete | Start after Review completes for current material and the result and evidence are available. Know the requested outcome or get the requester's answer before operations. Permissions and prerequisites apply before affected operations. [Entry conditions](phases/construction/deliver.md#entry-conditions). |
| DL02 | Delivery outcome scope | Complete | Make the requested outcome explicit. It may be a repository handoff, review request, publication, deployment, or another agreed result. Publication or deployment is not necessary for every unit. [Goal](phases/construction/deliver.md#goal). |
| DL03 | Delivery artifact type | Complete | Use `delivery-plan` for authored unit-root `delivery.md` instructions, separately from CLI-owned execution history. See [Required delivery instructions](phases/construction/deliver.md#required-delivery-instructions) and [accepted types](metadata.md#accepted-type-values). |
| DL04 | Delivery document sections | Complete | Include Outcome and destination, Operations and prerequisites, Verification and recovery, and Decisions and open questions in `delivery.md`. [Required sections](phases/construction/deliver.md#required-sections). |
| DL05 | Delivery procedure | Complete | Identify the outcome and material. Prepare instructions. Make sure that operation prerequisites and authority are in place. Do authorized operations, make sure that actual effects match the requested outcome, and hand off results and limitations. [Delivery procedure](phases/construction/deliver.md#delivery-procedure). |
| DL06 | Delivery provenance and verification | Complete | Bind deliverables and derived artifacts to reviewed source and relevant configuration. Make sure that actual recipient-facing effects match the requested outcome. Artifact creation alone is not proof of delivery. [Material and verification](phases/construction/deliver.md#material-and-verification). |
| DL07 | Delivery partial effects and recovery | Complete | Record failures, partial effects, the last state shown by evidence, uncertainty, and the next action. Compare actual effects with the requested outcome before retry. Do not infer retry or recovery authority. [Failure and interrupted work](phases/construction/deliver.md#failure-and-interrupted-work). |
| DL08 | Deliver stage owner | Complete | `kepler-orchestrator` owns operation planning, material tracking, execution coordination, verification, evidence, and handoff. Scoped workers have permission to do authorized operations and report results. [Agent roles](phases/construction/deliver.md#agent-roles). |
| DL09 | Deliver entry skill | Complete | `kepler-finish-work` prepares instructions and makes sure that prerequisites and authority are in place. It coordinates authorized operations, compares results with the requested outcome, and gives the recipient the handoff. The responsibility contract does not install or use a current skill. [Supporting skills](phases/construction/deliver.md#supporting-skills). |
| DL10 | Deliver self-review | Complete | Before operations, self-review compares instructions, material, destination, prerequisites, permissions, verification, recovery limits, and handoff with the approved scope. Before completion, it makes sure that actual results match the evidence. [Self-review](phases/construction/deliver.md#self-review). |
| DL11 | Additional delivery review trigger | Complete | Additional external review occurs only when the requester asks. Existing project-required approvals and reviews still apply. [Additional review](phases/construction/deliver.md#additional-review). |
| DL12 | Delivery operation authority | Complete | Get permission for each operation under requester instructions or project rules. Earlier approval, integration, or review does not give operation permission. Get permission before the affected operation. [Operation authority and requester approval](phases/construction/deliver.md#operation-authority-and-requester-approval). |
| DL13 | Final delivery approval trigger | Complete | Get final requester approval only when an authority rule or requester instruction makes it necessary. No automatic final approval gate applies. [Operation authority and requester approval](phases/construction/deliver.md#operation-authority-and-requester-approval). |
| DL14 | Deliver reopening questions | Complete | Compare changes to the outcome or target, material provenance, and prerequisites or permissions with their current contracts. Do the same for actual effects, verification, recovery, and upstream obligations. Report changes that call for revision. Answers do not authorize reopening or external operations. [Reopening questionnaire](phases/construction/deliver.md#reopening-questionnaire). |
| DL15 | Deliver completion conditions | Complete | Complete the agreed outcome, authored instructions, readiness, permissions, actual operations, provenance, and verification. Resolve blockers and complete applicable approvals, recipient handoff, and evidence retention. An unfinished deployment cannot become a handoff by renaming it. [Completion conditions](phases/construction/deliver.md#completion-conditions). |
| DL16 | Deliver evidence coverage | Complete | Cover preparation, applicable authorization, each operation, outcome verification, requested external review, final approval when necessary, and recipient handoff. Bind each result to its material, conditions, attempt, and output that stays available. [Evidence coverage](phases/construction/deliver.md#evidence-coverage). |
| DL17 | Recipient handoff | Complete | Give actual delivery references, material identity, verification, instructions, limitations, recovery information, and remaining agreed recipient responsibilities. [Handoff](phases/construction/deliver.md#handoff). |
| DL18 | Deliver whole-draft acceptance | Complete | The requester accepted the complete [Deliver specification](phases/construction/deliver.md), including its skill responsibilities. This does not authorize a release, publication, deployment, or other operation. [Deliver](phases/construction/deliver.md). |

## Deferred decisions

These questions are deferred beyond the Construction MVP. Deferral selects no fallback, precedence rule, expiry period, or destructive operation.

Supporting-document types are agreed under [DF06](#completed-shared-decisions). Read supplied project context and resolve material conflicts during Construction. Do not use deferred reference governance as a reason to ignore relevant facts or invent current behavior.

| ID | Decision | Question to resolve |
| --- | --- | --- |
| CN20 | Coordination protocol definitions | After the MVP, set protocols that combine execution organization with worker communication. Compare serial/parallel scheduling, dependency DAGs, and general execution graphs. Compare inline, subagent, and team interaction separately. Examples: Basic uses serial/subagents. Workshop uses DAG/subagents. Factory uses graph/team. These combinations are illustrative, not accepted protocols. Set scope, feedback, context sharing, and compatibility with Activity contracts. Keep required checks, authority, attempts, evidence, and integration guarantees. The fixed MVP model stays under [CN22](#completed-construction-decisions). Deferral selects no protocol, registry, or execution engine. |
| DF01 | Project reference authority | Defer formal [reference authority](README.md#document-scopes). Investigate actual conflicts. Do not choose an implicit precedence rule. |
| DF02 | Inception terminology | What terms organize Inception intents? See [phase organization](README.md#phase-organization). |
| DF03 | Project preparation requirements | What project standards and workspace preparation are necessary for Initialization? See [phase organization](README.md#phase-organization). |
| DF05 | Version 2 migration procedure | Keep migration outside the MVP. Keep legacy data and report unsupported schemas without [automatic conversion](metadata.md#schema-version). |
| DF07 | Project reference structure | What internal document structure do Project references use? See [document scopes](README.md#document-scopes). |
| DF08 | Project reference updates | How do agents keep Project references current? See [document scopes](README.md#document-scopes). |
| DF09 | Intent document format | What documents represent Inception intents? See [phase organization](README.md#phase-organization). |
| DF10 | Inception unit-definition procedure | How does Inception make one or more Units of Work? See [phase organization](README.md#phase-organization). |
| DF13 | Additional integration checks | Defer general extra-check policy. Honor unit/project obligations and the existing [typechecking/build/full-suite minimum](phases/construction/README.md#code-integration). |
| SH71 | Evidence retention period | No retention period is selected. Necessary checkpoints and external evidence must stay available under the [retention contract](runtime.md#checkpoint-retention). |
| SH73 | Retention cleanup | Defer destructive cleanup policy. This does not authorize expiry, checkpoint deletion, or loss of [necessary evidence](runtime.md#checkpoint-retention). |
| SH75 | Additional unit scope guidance | Defer additional [scope and size guidance](unit-of-work.md#decisions-still-required). Existing cohesion, coverage, dependency, and verification rules still apply. No additional criteria are approved. |
| SH76 | Decomposition questionnaire | Defer the detailed questionnaire. Use the accepted [decomposition procedure](unit-of-work.md#decomposition-procedure). This does not select a questionnaire contract. |

## Removed decision gates

Delete this speculative comparison from the approval queue. Keep its ID only as a short disposition record. This does not select a legacy compatibility policy.

| ID | Removed question | Reason |
| --- | --- | --- |
| DF11 | Previous route concept | Delete speculative comparison with the old route model. No compatibility answer is selected. [Migration stays deferred](metadata.md#schema-version). |

## Contract coverage

The Construction MVP has six accepted stage contracts and three accepted Implementation Activity contracts. Functional Design and Quality Requirements were accepted earlier under FD13 and NF12. Planning, Implementation, Generation, Validation, Integration, Review, and Deliver have distinct whole-contract acceptance rows. IP26 separately accepts the task graph specification, and SH52 records the shared evidence-coverage policy. These approvals concern specifications, not an executing unit or implemented behavior. Supporting-document types are accepted under DF06.

The MVP path above lists bounded authoring work, not omnibus decision IDs. Add a question only when a material choice is unanswered. Do not create separate approval gates for implementation-owned field types, event catalogs, or command syntax.

Completion of Initialization, Inception, managed reference features, or migration is not necessary before this Construction path ships.

## Filename convention

Use short filenames with full words, without abbreviations. The requester-selected `tasks-dag.json` is an explicit exception. The agreed `quality.md` replaces the proposed `requirements.md` name. Quality Requirements does not share `design.md` with Functional Design.

## Record maintenance

Update a row when its decision or disposition changes. Keep exactly one row per ID. Keep prior approval and source references when reorganizing the file.

Working behavior and tests are necessary for each implementation choice. Requester approval is not necessary for every mechanism. Follow applicable authority rules and requester instructions. Get approval when they make it necessary. Post-MVP rows stay unresolved. They do not authorize destructive or unsafe defaults.

Keep whole-draft approval boundaries. This file does not grant permission to change unapproved behavior or claim that the release is complete.

Use ASD-STE100 Simplified Technical English. Do not run workflow-reference tests.
