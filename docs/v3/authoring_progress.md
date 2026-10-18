# Workflow version 3: authoring progress

[Workflow phase index](README.md) | [Functional Design specification](phases/construction/functional-design.md)

## Purpose

Plan the decisions needed to ship a minimum viable product (MVP) for Construction. Do not require the complete version 3 framework before implementation can start.

Track specification decisions, not Unit of Work execution state. Each row records one decision with one unique ID. Required implementation work is not a separate requester approval gate.

The requester has accepted the complete Functional Design and Quality Requirements stage specifications under FD13 and NF12. This does not approve a particular Unit of Work or establish completed implementation.

## Construction MVP boundary

Use the agreed [direct Construction entry](README.md#phase-organization) with a clear Unit of Work request. Greenfield work remains in scope; pre-existing application code and tests are not required. Supply relevant context without requiring completed Initialization or Inception contracts.

Ship the complete [Standard stage sequence](workflows/standard/README.md#stages), from Functional Design through Deliver. Within Implementation Execution, run the fixed Code Generation, Code Validation, and Code Integration Activity sequence, then complete whole-unit review.

Preserve complex multi-task units and ready-task parallelism. Keep admission baselines fixed. Use explicit attempts and evidence. Recover from interruptions. Preserve requester authority and the actual agreed delivery outcome. Hold each unit's integration lock through reading the current checkpoint, candidate preparation, required checks, and acceptance.

For each task in Implementation Execution, use the fixed Activity sequence Code Generation, Code Validation, then Code Integration. Authorized returns route code changes to Generation, then repeat Validation and Integration as required. Integration-only retries stay within the current Integration attempt. The accepted task graph defines dependencies and prerequisite conditions. The orchestrator assesses readiness from those requirements and current execution facts. Do not duplicate its dependencies in the Activity procedure. Serial or parallel scheduling is separate from dependency topology, and feedback routes do not create dependency edges.

Use one orchestrator-controlled subagent model for MVP Implementation Execution. The orchestrator dispatches scoped workers and coordinates Activity handoffs. Workers report facts; they do not need to spawn reviewers or call one another. Generation and independent non-author Validation use separate worker contexts. Authorized orchestrator and CLI operations control progress, revision, and acceptance. Logical roles, profile implementations, and skill implementations remain proposed unless separately accepted. Do not add a per-task worker-topology selector.

Separate the authored plan from runtime state. Keep explicit attempts, evidence, and phase-owned rules. Separate executor dispatch from readiness, acceptance, and revision policy. Do not add a generic protocol registry, arbitrary graph language, interpreter, or Basic/Workshop/Factory preset. Do not add a team engine, swarm, extra protocol state store, or universal domain graph. Defer a general graph engine; keep required feedback routes. Add only behavior needed by an agreed MVP scenario for correctness and completion. Future variants alone do not justify new machinery.

This change keeps the existing Construction stage placement. It does not decide the proposed Operation placement for Deliver. Functional Design, Quality Requirements, and Implementation Planning remain in Construction. These release boundaries do not establish implemented behavior.

The CLI, templates, agents, and skills must support the complete Construction sequence before the MVP ships. Their implementation and verification are release work, not completed specification decisions.

Standalone Initialization and Inception are outside this MVP. Removing a question from the approval queue does not remove its required behavior or implementation.

## Construction MVP path

These rows are work packages, not new decision IDs. Define only the behavior needed by this release.

For each incomplete stage and Activity contract, define essential inputs, outputs, responsibilities, completion conditions, failure or correction paths, and handoffs. Define requester approval only when applicable; do not add a gate by convention.

| Order | Work package | Minimum work |
| --- | --- | --- |
| 1 | Functional Design | The stage specification is accepted under FD13. Use the agreed `supporting-document` type under DF06. |
| 2 | [Quality Requirements](phases/construction/quality-requirements.md) | The stage specification, including evidence and skill responsibilities, is accepted under NF12. |
| 3 | [Implementation Planning](phases/construction/implementation-planning.md) | Review the remaining Planning proposals. The task graph specification is accepted under IP26, including task content, dependencies, and prerequisites. |
| 4 | [Implementation Execution](phases/construction/implementation-execution.md) | Review the unit contract and dedicated Activity contracts. Preserve accepted independence, checks, concurrency, recovery, and blocker-only requester intervention. |
| 5 | [Unit of Work Review](phases/construction/unit-of-work-review.md) | Review whole-unit assessment, findings, evidence, completion, applicable acceptance, and handoff proposals. |
| 6 | [Deliver](phases/construction/deliver.md) | Review outcome, instructions, authorization, verification, recovery, and deployment information proposals. |
| 7 | Shared runtime | Resolve SH74 record portability. Implement journals, guarded transitions, safe recovery, material retention, and isolated concurrent work. |
| 8 | MVP release | Implement the CLI, templates, agents, and skills. Verify the complete path, recovery, scoped concurrency, and rejection of invalid transitions. |

Start implementation from agreed contracts without waiting for unrelated v3 decisions. Resolve unchosen stage behavior before deriving that stage's skills or runtime transitions.

The release must preserve separate non-author Code Validation and combined-candidate Code Integration checks. A reduced approval queue does not make the MVP implemented or ready to ship.

## MVP decisions

### Shared decisions still pending

Resolve these questions within the work packages above. SH61 is conditional on missing identity; work with valid identity need not wait for that case.

| ID | Decision | Question to resolve |
| --- | --- | --- |
| SH52 | Required evidence coverage | Each stage and Activity contract owns its evidence, covered material, and required results. Review proposed coverage in Planning and the remaining stage and Activity drafts. Existing [test duties](phases/construction/README.md#agreed-boundaries) remain binding. |
| SH61 | Missing author identity | What must happen when effective Git name or email is missing? Resolve before creating an affected artifact. Do not invent [author identity](metadata.md#author-identity). |
| SH74 | Record version-control policy | Which authoritative records travel with the repository, and which remain local? Define how workers and later sessions retain [required history](runtime.md#execution-state-representation). |
| SH77 | Deployment record content | Is the [proposed deployment information](phases/construction/deliver.md#deployment-information) sufficient for the actual delivery outcome? Known constraints remain visible to Planning. |
| SH78 | Deployment record location | Should required unit-root [delivery.md](phases/construction/deliver.md#required-delivery-instructions) contain authored instructions, while CLI-owned journals record actual operations and results? |
| SH79 | Deployment record timing | Is the proposed [stage-specific timing](phases/construction/deliver.md#timing-and-upstream-ownership) sufficient without requiring future external availability during Planning? |

### Construction decisions still pending

No coordination-protocol definition is required for this MVP. [CN20](#deferred-decisions) tracks later protocol definitions. [CN22](#completed-construction-decisions) preserves the agreed MVP execution model.

### Stage contract decisions

No pending Functional Design or Quality Requirements decisions remain in this queue. The task graph specification is accepted under [IP26](#implementation-planning-decisions). The [Implementation Planning draft](phases/construction/implementation-planning.md) proposes the remaining policies below. Saving a draft does not accept those proposals. These rows do not add separate execution approval steps.

| ID | Decision | Proposal to review |
| --- | --- | --- |
| IP02 | Planning artifact type | Should the plan use proposed [type `implementation-plan`](phases/construction/implementation-planning.md#artifact-metadata) for its required artifact? |
| IP03 | Plan sections | Are the four proposed [required sections](phases/construction/implementation-planning.md#required-sections) sufficient for the plan? |
| IP04 | Technical solution content | Does the proposed [technical solution contract](phases/construction/implementation-planning.md#technical-solution) adequately define choices, boundaries, and consequences? Rationale coverage is agreed under IP21. |
| IP05 | Task identity | Should tasks retain unique unit-scoped identities and preserve historical bindings under the proposed [identity lifecycle](phases/construction/implementation-planning.md#task-identities-and-definitions)? UUIDv4 syntax is agreed under IP22. |
| IP08 | Requirement coverage | Should Planning account for every applicable obligation through planned work or justified unchanged behavior under the proposed [coverage rule](phases/construction/implementation-planning.md#dependencies-and-coverage)? |
| IP09 | Verification strategy | Does the proposed [verification strategy](phases/construction/implementation-planning.md#verification-strategy) cover test design, expected results, environments, and missing infrastructure? Stage check duties are agreed under CN07, CN08, and CN11. |
| IP10 | Entry conditions | Are the proposed [entry conditions](phases/construction/implementation-planning.md#entry-conditions) sufficient after the preceding stages complete under their own contracts? |
| IP11 | Stage owner | Should `kepler-architect` own Planning under the proposed [agent role](phases/construction/implementation-planning.md#agent-roles)? |
| IP12 | Entry skill | Should [kepler-plan](skills.md#kepler-plan) supply the proposed version 3 Planning responsibilities? |
| IP13 | Self-review | Should the entry skill perform the proposed [self-review](phases/construction/implementation-planning.md#self-review)? |
| IP14 | External review trigger | Should [external review](phases/construction/implementation-planning.md#external-review) occur only on requester request? |
| IP15 | Requester approval trigger | Should [approval](phases/construction/implementation-planning.md#requester-decisions-and-approval) apply under requester instructions or existing authority rules, without an automatic whole-plan gate? |
| IP16 | Reopening questionnaire | Do the proposed [reopening questions](phases/construction/implementation-planning.md#reopening-questionnaire) identify Planning's revision triggers? |
| IP17 | Completion conditions | Are the proposed [completion conditions](phases/construction/implementation-planning.md#completion-conditions) sufficient for handoff to Implementation Execution? |
| IP18 | Stage evidence coverage | Are the named [evidence results](phases/construction/implementation-planning.md#evidence-coverage), covered material, and conditional approval record sufficient? |
| IP19 | Whole-draft acceptance | Does the requester accept the complete [Implementation Planning specification](phases/construction/implementation-planning.md)? |

### Implementation Execution proposals

The [Execution draft](phases/construction/implementation-execution.md) preserves the accepted structure and check duties. Dedicated [Generation](phases/construction/activities/code-generation.md), [Validation](phases/construction/activities/code-validation.md), and [Integration](phases/construction/activities/code-integration.md) contracts define those Activities. Their Activity classification is accepted; detailed bodies and skill responsibilities remain proposed. Scoped [Execution decisions](#completed-execution-decisions) are accepted; the additional proposals below remain open.

| ID | Decision | Proposal to review |
| --- | --- | --- |
| IE01 | Execution entry conditions | Are the proposed [entry conditions](phases/construction/implementation-execution.md#entry-conditions) sufficient, including greenfield checkpoint establishment and scoped prerequisite timing? |
| IE02 | Execution outputs and ownership | Should Execution produce implementation material and CLI-owned records without a separate required [execution Markdown document](phases/construction/implementation-execution.md#artifacts-and-records)? |
| IE03 | Execution stage owner | Should `kepler-orchestrator` own the proposed [unit execution responsibilities](phases/construction/implementation-execution.md#agent-roles)? |
| IE04 | Generation stage owner | Should `kepler-coder` own the proposed [Code Generation Activity responsibilities](phases/construction/activities/code-generation.md#roles-and-skills)? |
| IE05 | Validation stage owner | Should `kepler-reviewer` own the proposed [Code Validation Activity responsibilities](phases/construction/activities/code-validation.md#roles-and-skills)? |
| IE06 | Integration stage owner | Should `kepler-orchestrator` own the proposed [Code Integration Activity responsibilities](phases/construction/activities/code-integration.md#roles-and-skills)? |
| IE07 | Execution entry skill | Should [kepler-orchestrate](skills.md#kepler-orchestrate) supply the proposed [unit execution procedure](phases/construction/implementation-execution.md#supporting-skills)? |
| IE08 | Generation entry skill | Should [kepler-code](skills.md#kepler-code) supply the proposed Generation procedure? |
| IE09 | Validation entry skill | Should [kepler-code-feedback](skills.md#kepler-code-feedback) supply the proposed Validation procedure? |
| IE11 | Execution self-review rule | Should self-review belong in each applicable [entry procedure](phases/construction/implementation-execution.md#self-review), without separate stages or attempt identities? |
| IE12 | Additional execution review trigger | Should [additional external review](phases/construction/implementation-execution.md#additional-review) be requester-triggered, while required Validation feedback and Unit of Work Review remain mandatory? |
| IE14 | Execution reopening questionnaires | Do the proposed [unit and Activity questions](phases/construction/implementation-execution.md#reopening-questionnaires) identify relevant findings without changing revision authority? |
| IE15 | Generation completion evidence | Are the named [Generation results](phases/construction/activities/code-generation.md#evidence-coverage), covered material, and required results sufficient for its proposed completion details? |
| IE16 | Validation completion evidence | Are the named [Validation results](phases/construction/activities/code-validation.md#evidence-coverage), covered material, and required results sufficient for its proposed completion details? |
| IE17 | Integration completion evidence | Do the named [Code Integration results](phases/construction/activities/code-integration.md#evidence-coverage) and covered material suffice under the accepted lock and check rules? |
| IE18 | Execution completion evidence | Is the proposed [unit completion assessment](phases/construction/implementation-execution.md#evidence-coverage) sufficient while preserving originating Activity evidence bindings? |
| IE19 | Execution completion details | Are the proposed [completion details](phases/construction/implementation-execution.md#completion-conditions) sufficient for the already agreed unit completion boundary? |
| IE20 | Execution handoff | Does the proposed [review handoff](phases/construction/implementation-execution.md#handoff) identify sufficient integrated material, provenance, evidence, and remaining concerns? |
| IE21 | Execution whole-draft acceptance | Does the requester accept the complete [unit-scoped Execution specification](phases/construction/implementation-execution.md), including its skill responsibilities? |
| IE22 | Post-completion execution return | Should the proposed [scoped-return rule](phases/construction/implementation-execution.md#return-after-completed-execution) reopen affected Activities and reassess retained scopes? Should it require new unit completion and downstream execution? Details remain open. |
| IE24 | Generation contract acceptance | Does the requester accept the complete dedicated [Code Generation contract](phases/construction/activities/code-generation.md), including its proposed role, evidence, and handoff details? |
| IE25 | Validation contract acceptance | Does the requester accept the complete dedicated [Code Validation contract](phases/construction/activities/code-validation.md), including its proposed role, evidence, and handoff details? |
| IE27 | Integration contract acceptance | Does the requester accept the complete dedicated [Code Integration Activity contract](phases/construction/activities/code-integration.md), including its proposed role, evidence, and handoff details? |
| IE28 | Integration entry skill | Should [kepler-orchestrate](skills.md#kepler-orchestrate) supply the proposed [Code Integration procedure](phases/construction/activities/code-integration.md#roles-and-skills)? |

### Unit of Work Review proposals

The [Review draft](phases/construction/unit-of-work-review.md) preserves the agreed whole-integrated-result scope. These detailed policies remain proposed.

| ID | Decision | Proposal to review |
| --- | --- | --- |
| UR01 | Unit review entry conditions | Are the proposed [entry conditions](phases/construction/unit-of-work-review.md#entry-conditions) sufficient without requiring delivery or acceptance before assessment? |
| UR02 | Unit review record outputs | Should review use [CLI-owned records](phases/construction/unit-of-work-review.md#artifacts-and-records) and retained evidence without another required Markdown document? |
| UR03 | Whole-unit review procedure | Does the proposed [review procedure](phases/construction/unit-of-work-review.md#review-procedure) establish complete outcome assessment beyond individual task reports? |
| UR04 | Unit review evidence assessment | Should review [assess applicable Execution evidence](phases/construction/unit-of-work-review.md#evidence-assessment) without an unconditional rerun, while resolving uncovered review obligations? |
| UR05 | Unit review findings and correction | Does the proposed [finding treatment](phases/construction/unit-of-work-review.md#findings-and-correction) distinguish blocking defects, advice, local corrections, and authorized upstream revision? |
| UR06 | Unit review stage owner | Should `kepler-reviewer` own the proposed [whole-unit assessment](phases/construction/unit-of-work-review.md#agent-roles)? |
| UR07 | Unit review independence | Should the proposed [reviewer independence rule](phases/construction/unit-of-work-review.md#agent-roles) exclude the primary implementation author without excluding earlier task reviewers? |
| UR08 | Unit review entry skill | Should [kepler-review](skills.md#kepler-review) supply the proposed version 3 whole-unit review procedure? |
| UR09 | Unit review self-review | Should the entry skill [self-check coverage and evidence](phases/construction/unit-of-work-review.md#self-review) without replacing independent assessment? |
| UR10 | Additional unit review trigger | Should [additional external review](phases/construction/unit-of-work-review.md#additional-review) be requester-triggered while the unit stage remains required? |
| UR11 | Unit acceptance trigger | Should [separate requester acceptance](phases/construction/unit-of-work-review.md#requester-acceptance) apply only under an applicable authority rule or requester instruction? |
| UR12 | Unit review reopening questions | Are the proposed [reopening questions](phases/construction/unit-of-work-review.md#reopening-questionnaire) sufficient under shared revision authority? |
| UR13 | Unit review completion conditions | Are the proposed [completion conditions](phases/construction/unit-of-work-review.md#completion-conditions) sufficient before the Deliver handoff? |
| UR14 | Unit review evidence coverage | Are the named [review results](phases/construction/unit-of-work-review.md#evidence-coverage), covered material, required results, and conditional acceptance record sufficient? |
| UR15 | Unit review handoff | Does the proposed [Deliver handoff](phases/construction/unit-of-work-review.md#handoff) preserve reviewed material, evidence, limitations, and operation boundaries? |
| UR16 | Unit review whole-draft acceptance | Does the requester accept the complete [Unit of Work Review specification](phases/construction/unit-of-work-review.md), including its skill responsibilities? |

### Deliver proposals

The [Deliver draft](phases/construction/deliver.md) proposes the following policies. SH77, SH78, and SH79 separately track deployment content, location, and timing.

| ID | Decision | Proposal to review |
| --- | --- | --- |
| DL01 | Deliver entry conditions | Are the proposed [entry conditions](phases/construction/deliver.md#entry-conditions) sufficient while applying authority and prerequisites before affected operations? |
| DL02 | Delivery outcome scope | Should Deliver establish the [requested outcome](phases/construction/deliver.md#goal) without assuming publication or deployment for every unit? |
| DL03 | Delivery artifact type | Should proposed [type delivery-plan](phases/construction/deliver.md#required-delivery-instructions) identify authored `delivery.md` instructions, separately from execution history? |
| DL04 | Delivery document sections | Are the four proposed [required sections](phases/construction/deliver.md#required-sections) sufficient for delivery instructions? |
| DL05 | Delivery procedure | Does the proposed [delivery procedure](phases/construction/deliver.md#delivery-procedure) establish outcome, readiness, authority, execution, verification, and recipient handoff? |
| DL06 | Delivery provenance and verification | Does the proposed [material and verification contract](phases/construction/deliver.md#material-and-verification) establish actual delivered effects and their relationship to reviewed source? |
| DL07 | Delivery partial effects and recovery | Does the proposed [failure and recovery treatment](phases/construction/deliver.md#failure-and-interrupted-work) preserve partial effects and prevent blind or unauthorized retries? |
| DL08 | Deliver stage owner | Should `kepler-orchestrator` own the proposed [Deliver responsibilities](phases/construction/deliver.md#agent-roles)? |
| DL09 | Deliver entry skill | Should [kepler-finish-work](skills.md#kepler-finish-work) supply the proposed version 3 Deliver procedure? |
| DL10 | Deliver self-review | Should the entry skill perform the proposed [preparation and result self-review](phases/construction/deliver.md#self-review)? |
| DL11 | Additional delivery review trigger | Should [additional external review](phases/construction/deliver.md#additional-review) be requester-triggered while preserving existing project-required reviews? |
| DL12 | Delivery operation authority | Does the proposed [authority assessment](phases/construction/deliver.md#operation-authority-and-requester-approval) preserve existing permissions without treating earlier completion as operation authorization? |
| DL13 | Final delivery approval trigger | Should [additional final approval](phases/construction/deliver.md#operation-authority-and-requester-approval) apply only under an applicable authority rule or requester instruction? |
| DL14 | Deliver reopening questions | Are the proposed [reopening questions](phases/construction/deliver.md#reopening-questionnaire) sufficient for outcome, material, authority, verification, recovery, and upstream findings? |
| DL15 | Deliver completion conditions | Are the proposed [completion conditions](phases/construction/deliver.md#completion-conditions) sufficient without converting unfinished delivery into a narrower handoff? |
| DL16 | Deliver evidence coverage | Are the named [delivery results](phases/construction/deliver.md#evidence-coverage), material scopes, required results, and conditional authorization or approval records sufficient? |
| DL17 | Recipient handoff | Does the proposed [final handoff](phases/construction/deliver.md#handoff) supply actual result references, verification, limitations, recovery information, and agreed recipient responsibilities? |
| DL18 | Deliver whole-draft acceptance | Does the requester accept the complete [Deliver specification](phases/construction/deliver.md), including its skill responsibilities? |

## Review result

The register contains 256 unique IDs, including 128 completed decisions and 80 pending MVP decisions. It also has 33 MVP implementation choices, 14 deferred questions, and one retired question. Whole-stage Planning acceptance (IP19) remains open. CN22 preserves the accepted Implementation Execution model; CN20 tracks deferred protocol definitions. Activity decisions do not accept detailed contract bodies or claim implementation is complete.

## Register rules

- Give each independently decidable question its own row and ID.
- Define each ID once. References to that ID do not create another decision.
- Do not combine completed policy with unresolved questions.
- Mark a decision complete only after requester agreement and a canonical specification record.
- Preserve IDs when decisions move between sections. Give new questions new IDs.
- Classification does not approve unchosen policy or change decision ownership.

Original decision titles retain their historical wording, including the former Depth label. Contract text and references use current concept names. The requester replaced CN20 with deferred coordination protocol definitions. CN22 preserves the previously accepted MVP execution model.

A requester decision is needed when the answer changes required behavior, authority, evidence obligations, or material scope. Technical formats, command names, and mechanisms belong to implementation within the agreed contracts.

SH identifies shared decisions. CN identifies Construction decisions. FD identifies Functional Design decisions. NF identifies Quality Requirements decisions. Keep existing NF identifiers after the stage rename. IP identifies Implementation Planning decisions. IE identifies Implementation Execution decisions, including its Activities. UR identifies Unit of Work Review decisions. DL identifies Deliver decisions. DF preserves the existing deferred-decision series. An ID does not determine its status.

## Completed shared decisions

Every decision in this section is complete. The linked specification contains its full contract.

| ID | Decision | Record |
| --- | --- | --- |
| SH01 | Unit identifier | [Identity and directory](unit-of-work.md#identity-and-directory): CLI-generated `YYYY-MM-DD-<slug>`, machine-local creation date, project uniqueness, stable identity, and exact directory name. Detect duplicates without overwriting. |
| SH02 | Common metadata fields | [Common fields](metadata.md#common-fields): `id`, `type`, `schema_version`, `unit_id`, `author`, and optional `labels`. Omit `unit_id` for project scope. |
| SH03 | Depth levels | [Levels](effort.md#levels): Minimal, Standard, and Comprehensive change analysis and documentation detail. They do not remove required information, verification, or approval. |
| SH04 | Editorial corrections | [Editorial corrections](revision.md#editorial-corrections): agents can correct prose without reopening or new approval when meaning stays unchanged. Use existing history, approval bindings, and evidence rules. Refer uncertain changes to the orchestrator. |
| SH05 | Unit acceptance boundary | [Acceptance cohesion](unit-of-work.md#acceptance-cohesion): define a coherent outcome that the requester can accept as a whole. Implementation size alone does not define the boundary. |
| SH06 | Persistence responsibilities | [Data responsibilities](runtime.md#data-responsibilities): frontmatter holds Markdown artifact metadata; Markdown and authored JSON hold content. CLI-owned JSON journals retain workflow history. Execution state is derived under SH43, replacing the earlier state-plus-audit representation. |
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
| SH22 | Depth inheritance | [Selection rules](effort.md#selection-rules): one unit default, explicit stage overrides, and Standard as fallback. There is no document-level effort. |
| SH23 | Depth selection authority | [Selection procedure](effort.md#selection-procedure): the agent recommends and the requester decides. Apply revision rules when a change affects completed work. |
| SH24 | Stage attempt lifecycle | [Stage attempts](runtime.md#stage-attempts): each stage execution has a distinct attempt. Internal corrections, pauses, sessions, and failed commands alone do not replace it. Authorized reopening creates another attempt when the stage executes again. |
| SH25 | Active attempt limit | [Active scope](runtime.md#attempt-identity-and-active-scope): allow at most one active attempt per unit/stage scope. SH96 defines the separate Activity-occurrence limit. Paused and waiting attempts retain their scope. Concurrent operations preserve both limits without blocking unrelated scopes. |
| SH26 | Run floor | [Run floor](runtime.md#run-floor): use the applicable attempt identity without a separate verification round. Late results retain their original attempt; they cannot complete a newer attempt. |
| SH27 | Repository checkpoint meaning | [Checkpoint concepts](runtime.md#concepts): a commit identifies content, not checks or approval. Attempts and commits have separate identities. One attempt can use several checkpoints; different attempts can share a checkpoint. Do not create commits solely for attempt identity. |
| SH28 | Evidence material types | [Material references](runtime.md#material-references): evidence can cover repository or external material. Use immutable references or retain relevant content when mutable references are insufficient. |
| SH29 | Evidence bindings | [Evidence bindings](runtime.md#evidence-and-approval-bindings): identify scope, attempt, checked material, inputs, results, supporting output, and relevant conditions. Record bindings through CLI-owned JSON journal events, not frontmatter. |
| SH30 | Approval bindings | [Approval bindings](runtime.md#evidence-and-approval-bindings): identify the requester, attempt, and reviewed material. Repository output commits must exist before approval is recorded. Recording approval does not grant approval authority to the CLI. |
| SH31 | Evidence reuse | [Applicability](runtime.md#evidence-applicability): within an attempt, verify unchanged covered material and relevant inputs before reuse. Retain original references. A different commit alone does not invalidate evidence. Reopening still requires the reopened stage or Activity to execute again. |
| SH32 | Checkpoint preservation | [Retention principles](runtime.md#checkpoint-retention): keep required Git objects reachable through retained references. JSON identifiers, audit events, and fingerprints do not preserve content. External material needs its own retention. |
| SH33 | Task admission baseline | [Task admission](runtime.md#task-admission-and-baselines): capture the current unit integration commit containing required predecessor outputs. Keep the admitted baseline fixed. Establish inclusion through ancestry or provenance, not timestamps. |
| SH34 | Parallel coordination boundary | [Parallel execution](runtime.md#parallel-execution): independent units and ready tasks progress without global coordinator `HEAD` gates. Do not require shared admission commits or unrelated workspaces to be clean. Keep event-update coordination short. Construction's unit integration lock is the explicit exception. |
| SH35 | Revision authority | [Authority and safeguards](revision.md#authority-and-escalation): the orchestrator assesses findings and authorizes reopening and its boundary. Preserve requester product authority, address evidence, and resolve confirmed invalidity. Ordinary internal corrections need no orchestrator approval. |
| SH36 | Revision cascade | [Revision boundary](revision.md#revision-boundary): reopen the earliest affected stage and every downstream stage in the authorized scope. Reestablish completion even when content remains unchanged. Preserve valid upstream work and historical artifacts and approvals. |
| SH37 | Reopening questionnaire mechanism | [Questionnaires](revision.md#stage-reopening-questionnaires): each stage supplies questions for the shared revision procedure. Answers support assessment; they neither authorize reopening nor exempt downstream stages. |
| SH38 | Audit ownership | [Audit ownership](runtime.md#audit-ownership): CLI-owned operations validate transitions and append resulting events. Current state is derived; agents and skills must not write journals or projections directly. |
| SH39 | Revision decision recording | [Revision decisions](runtime.md#revision-decisions): record the orchestrator's decision, reason, scope, and starting stage through the CLI. Derive current execution state from the recorded decision. |
| SH40 | Current-author lookup | [Current author](runtime.md#current-author): provide a command returning effective project Git identity. It identifies the current author, not an existing artifact's creator. |
| SH41 | Filename convention | [Filename convention](#filename-convention): use short filenames with full words. The requester-selected `tasks-dag.json` is an explicit exception. |
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
| SH95 | Activity concept | [Activity](activity.md): An Activity is a bounded responsibility within a stage. It is not a stage, agent, skill, task, or lifecycle milestone. The owning phase or stage defines its contract. Activity completion cannot complete the stage or grant authority. |
| SH96 | Activity attempt lifecycle | [Activity attempts](runtime.md#activity-attempts): bind each attempt and run floor to its occurrence and enclosing stage attempt. Allow one active attempt per occurrence. Keep Activity and stage evidence in their own contracts. Do not reparent old records. Use shared CLI journals, not another lifecycle engine. |
| SH97 | Effort terminology | [Effort](effort.md) replaces the former Depth name. Minimal, Standard, and Comprehensive keep their accepted meanings and selection rules. This rename changes no required work, checks, review triggers, or authority. |
| SH98 | Workflow composition | A [workflow](README.md#shared-concepts) selects a series of phase-owned stages. Its definition owns their order and routing. Phases own stage contracts and execution scopes. [Standard](workflows/standard/README.md) selects the agreed Construction MVP sequence without accepting remaining detailed proposals. |
| SH99 | Canonical reference layout | Use [docs/v3](README.md#reference-organization) for the canonical reference. Keep phase contracts under `phases/<phase>/`, Construction Activities under `phases/construction/activities/`, and Standard under `workflows/standard/`. These specification paths do not migrate unit artifacts or implement runtime behavior. |
| DF06 | Supporting document types | [Accepted types](metadata.md#accepted-type-values): use `supporting-document` for optional supporting Markdown documents. Explain purpose in content and the owning-stage link. Existing required-document and Project reference types remain unchanged. |

## MVP implementation choices

Remove these questions from the requester approval queue. Implement and test them for the MVP under the linked contracts. They are neither deferred features nor completed implementations.

Safe appends, recovery, scoped locks, and concurrent work must ship. Preserve original attempts, material bindings, fixed admission baselines, and reachable evidence. Do not replace these obligations with global serialization, unsafe lock takeover, or unchecked acceptance.

The implementation must provide typechecking, project build, and full-suite commands for the required checks. It must preserve project-required checks without waiting for a general extra-check policy.

| ID | Implementation choice | Work to resolve during implementation |
| --- | --- | --- |
| SH45 | Runtime storage paths | Where do authoritative journals and derived projections live? See [runtime decisions](runtime.md#decisions-still-required). |
| SH46 | Event-write consistency | How do event appends and journal reconciliation preserve valid workflow histories? See [runtime decisions](runtime.md#decisions-still-required). |
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
| SH85 | Checkpoint reference names | How are retained Git references named? See [runtime decisions](runtime.md#decisions-still-required). |
| SH86 | Retained evidence storage | Where is retained evidence content stored? See [retention](runtime.md#checkpoint-retention). |
| SH87 | Interrupted event-write recovery | How does an interrupted append or journal import recover without losing or duplicating events? See [runtime decisions](runtime.md#decisions-still-required). |
| DF14 | Integration check configuration | How are project-specific integration checks configured? See [Code Integration](phases/construction/README.md#code-integration). |
| DF15 | Task-state transitions | What detailed transitions govern Construction tasks? See [remaining stage contracts](phases/construction/README.md#remaining-stage-contracts). |
| DF16 | Dependency invalidation | How does a dependency change affect task readiness and validity? See [remaining stage contracts](phases/construction/README.md#remaining-stage-contracts). |
| DF17 | Revision shutdown coordination | How is active implementation stopped during an authorized unit-wide revision? See [upstream revision](phases/construction/README.md#unit-wide-upstream-revision). |

Implement DF15 through DF17 under the agreed attempt, evidence-applicability, and revision rules. Do not invalidate tasks merely because unrelated commits arrive. Ended attempts cannot complete tasks or accept candidates. Verify that previous workers stopped before resuming affected work.

## Completed Construction decisions

These decisions apply to Construction. Do not generalize its nested execution structure to other phases.

| ID | Decision | Record |
| --- | --- | --- |
| CN01 | Unit-stage order | [Standard stage order](workflows/standard/README.md#stages): Functional Design, Quality Requirements, Implementation Planning, Implementation Execution, Unit of Work Review, then Deliver. |
| CN02 | Quality Requirements document | [Stage boundaries](phases/construction/README.md#agreed-boundaries): use required `quality.md`, separate from functional `design.md`. Cover applicable performance, availability, security, accessibility, compatibility, operability, and observability. |
| CN03 | Technical solution selection | [Stage boundaries](phases/construction/README.md#agreed-boundaries): Implementation Planning selects the technical solution before dividing work into tasks. |
| CN04 | Plan dependency model | [Stage boundaries](phases/construction/README.md#agreed-boundaries): the plan represents tasks and dependencies as a graph. |
| CN05 | Implementation scheduling | [Implementation Execution](phases/construction/README.md#implementation-execution): the orchestrator schedules independent dependency-ready task implementations concurrently within the unit-scoped stage. |
| CN06 | Task execution structure | [Task coding](phases/construction/README.md#task-coding): IE29 supersedes this row's task-stage classification only. Each task uses Code Generation, Code Validation, and Code Integration Activities. Task dependencies remain in the accepted graph. Task coding adds no attempt identity, run floor, or requester approval gate. |
| CN07 | Code Generation testing | [Stage boundaries](phases/construction/README.md#agreed-boundaries): run typechecking and tests related to the modifications. |
| CN08 | Code Validation test scope | [Stage boundaries](phases/construction/README.md#agreed-boundaries): run typechecking, the project build, and the full application test suite. |
| CN09 | Task coding completion | [Task coding](phases/construction/README.md#task-coding): required validation succeeds and no blocking findings remain. Coding completion means ready for integration, not completed task implementation. |
| CN10 | Integration serialization | [Integration order and locking](phases/construction/README.md#integration-order-and-locking): prepare, check, then accept under one lock per unit. Hold it through checks and acceptance. Release before returning to coding. All integrated-state changes respect this lock; unrelated scopes continue. |
| CN11 | Required integration checks | [Code Integration](phases/construction/README.md#code-integration): run typechecking, the build, and the full suite against the candidate under the unit lock. All three must succeed before authorized acceptance. These checks do not replace Code Validation. |
| CN12 | Task implementation completion | [Code Integration](phases/construction/README.md#code-integration): successful candidate acceptance and the task's other conditions establish task completion. Acceptance changes unit state; it is not requester approval. |
| CN13 | Implementation Execution completion | [Attempts and completion](phases/construction/README.md#attempts-and-completion): complete required tasks and required integrated-result checks. The unit becomes ready for Unit of Work Review, not delivery approval. |
| CN14 | Task-local correction return | [Return paths](phases/construction/README.md#return-paths): the orchestrator authorizes a return to Code Generation when output needs changes. Then run Code Generation, Code Validation, and Code Integration as required. Keep the enclosing Execution attempt active. |
| CN15 | Integration-only retry | [Return paths](phases/construction/README.md#return-paths): Integration-only retries remain within the current Code Integration Activity attempt. Failed commands alone do not create attempts. |
| CN16 | Unit-wide upstream revision | [Upstream revision](phases/construction/README.md#unit-wide-upstream-revision): stop unit admissions and active implementation, including integration. End affected attempts; retain history. Execute revised upstream stages before replacement attempts. Independent valid units continue. |
| CN17 | Unit review scope | [Review scope](phases/construction/unit-of-work-review.md#goal): Unit of Work Review examines the complete integrated result. |
| CN18 | Construction attempt scopes | [Attempts](phases/construction/README.md#attempts-and-completion): Implementation Execution has a unit-scoped attempt. Each Activity occurrence has a distinct attempt and run floor linked to it. SH96 supersedes only the historical task-stage attempt classification. The task graph and its dependencies remain unchanged. |
| CN19 | Independent code feedback ownership | [Stage boundaries](phases/construction/README.md#agreed-boundaries): Code Validation owns independent non-author code feedback. |
| CN21 | MVP coordination boundary | [Construction MVP boundary](#construction-mvp-boundary): keep the authored plan separate from runtime state. Keep explicit attempts and evidence under phase-owned rules. Keep the fixed per-task Activity procedure separate from the accepted dependency-ready DAG. Feedback routes do not add dependency edges. Keep dispatch separate from readiness, acceptance, and revision policy. Do not add a generic protocol registry, arbitrary graph language or interpreter, or Basic, Workshop, or Factory presets. Do not add a team engine, swarm, extra protocol state store, or universal domain graph. Defer a general graph engine, but keep required feedback routes. Future variants alone do not justify new machinery. Add only behavior needed for an agreed MVP scenario. |
| CN22 | MVP execution model | Retain the accepted model previously recorded under CN20. [Implementation Execution](phases/construction/implementation-execution.md#agent-roles): use one orchestrator-controlled subagent model for MVP Implementation Execution. The orchestrator dispatches scoped workers and coordinates Activity handoffs. Workers report facts; they need not spawn reviewers or call one another. Generation and independent non-author Validation use separate worker contexts. The decision selects no role profiles, skill implementations, or per-task topology. It does not constrain other phases. |

## Completed Execution decisions

These scoped decisions are accepted. The remaining Execution, Generation, Validation, and Integration proposals are not accepted by this record.

| ID | Decision | Status | Record |
| --- | --- | --- | --- |
| IE10 | Validation reviewer independence | Complete | Retain [independent non-author feedback](phases/construction/activities/code-validation.md#roles-and-skills) on actual task material without authoring or editing the implementation. A different model, vendor, or human is not required. |
| IE13 | Execution approval trigger | Complete | Requester [intervention](phases/construction/implementation-execution.md#requester-intervention) occurs only for hard blockers that agents cannot resolve within their authority. Routine task acceptance follows successful Validation and Integration, not requester approval. |
| IE23 | Dedicated task-stage contracts | Complete | This historical decision required dedicated Generation and Validation contracts. [IE29](#completed-execution-decisions) replaces only their stage classification. They now define Activities. Their detailed contract proposals remain open under IE24 and IE25. The fixed Activity order and check duties remain agreed. |
| IE26 | Dedicated Integration contract | Complete | This historical decision required a dedicated Integration contract. [IE29](#completed-execution-decisions) replaces its stage classification and names its Activity Code Integration. IE27 keeps its procedure, evidence, role, and handoff details open. |
| IE29 | Implementation Activity classification | Complete | [Activity](activity.md) defines the shared concept. Code Generation, Code Validation, and Code Integration are Activities within Implementation Execution, not stages. Their detailed contracts remain proposals. This classification approves no executing unit or skill implementation. It does not accept an unapproved contract body. |
| IE30 | Compact Activity contracts | Complete | [Activity contracts](phases/construction/activities/README.md) share execution, effort, evidence-binding, review, and recovery rules. Each keeps its specific inputs, procedure, checks, named evidence, completion, correction questions, and handoff. Shortening preserves agreed guarantees without accepting detailed contract proposals or implementing skills. |

## Functional Design decisions

The decisions below are complete. FD13 records requester acceptance of the complete stage specification, including its [skill reference](skills.md). Approval of a particular Unit of Work remains separate.

| ID | Decision | Status | Record |
| --- | --- | --- | --- |
| FD01 | Required documents | Complete | [Artifacts](phases/construction/functional-design.md#artifacts): require `unit-of-work.md` and `design.md` at the unit root. |
| FD02 | Functional Design scope | Complete | [Scope](phases/construction/functional-design.md#scope): define domain behavior and models, not the technical solution, quality specification, or implementation tasks. |
| FD03 | Entry conditions | Complete | [Entry conditions](phases/construction/functional-design.md#entry-conditions): sufficient context, a reasonably unit-sized outcome, and requester availability. Complete artifacts or an Inception handoff are not prerequisites. |
| FD04 | Requester approval | Complete | [Requester approval](phases/construction/functional-design.md#requester-approval): explicit approval is required and recorded through CLI-owned JSON journal events. |
| FD05 | Reopening questionnaire | Complete | [Questionnaire](phases/construction/functional-design.md#reopening-questionnaire): use stage-specific questions with shared orchestrator revision authority. Reopened work must satisfy the stage conditions again. |
| FD06 | Stage owner and entry skill | Complete | [Agent roles](phases/construction/functional-design.md#agent-roles): `kepler-architect` owns the stage and uses `kepler-design`. No other stage agent roles are defined. |
| FD07 | Unit definition sections | Complete | [Unit definition](phases/construction/functional-design.md#unit-of-work-definition): require Purpose, Scope, and Context. The definition serves every stage. |
| FD08 | Functional design sections | Complete | [Functional design](phases/construction/functional-design.md#functional-design): require Domain behavior, Domain model, Boundaries and interactions, and Design decisions and open questions. Keep acceptance criteria with requirements. Use domain language and applicable DDD concepts. |
| FD09 | Self-review | Complete | [Self-review](phases/construction/functional-design.md#self-review): `kepler-architect` reviews through `kepler-design`; do not create a separate supporting skill. |
| FD10 | External review trigger | Complete | [External review](phases/construction/functional-design.md#external-review): external review occurs only when the requester asks for it. |
| FD11 | Completion conditions | Complete | [Completion](phases/construction/functional-design.md#completion-conditions): valid artifacts, observable criteria, consistent contracts, resolved material functional questions, explicit handoffs, self-review, and requester approval. Completion permits Quality Requirements, not implementation. |
| FD12 | Supporting skill responsibilities | Complete | [Supporting skills](skills.md): adapt `kepler-grilling`, `kepler-domain-modelling`, and `kepler-research` for version 3. The skill reference records the name changes. |
| FD13 | Whole-draft acceptance | Complete | [Functional Design](phases/construction/functional-design.md): the requester accepted the complete stage specification, including the skill reference. This does not approve a Unit of Work or establish completed implementation. |
| FD14 | Blocking functional questions | Complete | [Blocking rule](phases/construction/functional-design.md#blocking-rule): unresolved questions block completion when answers could change scope, behavior, invariants, or functional contracts. |

## Quality Requirements decisions

The decisions below are complete. The requester confirmed acceptance of the complete stage specification under NF12, including its [skill reference](skills.md#kepler-quality).

This approval concerns the specification, not an executing Unit of Work or completed implementation.

| ID | Decision | Status | Record |
| --- | --- | --- | --- |
| NF01 | Quality document sections | Complete | [Required sections](phases/construction/quality-requirements.md#required-sections): require Quality requirements, Constraints and dependencies, and Decisions and open questions in `quality.md`. |
| NF02 | Quality requirement content | Complete | [Requirement content](phases/construction/quality-requirements.md#requirement-content): define covered material, targets or constraints, relevant conditions, objective acceptance conditions, assumptions, and dependencies. |
| NF03 | Category applicability procedure | Complete | [Applicability](phases/construction/quality-requirements.md#quality-categories): assess all eight categories and briefly explain inapplicable categories. Do not invent targets or waive relevant obligations. |
| NF04 | Entry conditions | Complete | [Entry](phases/construction/quality-requirements.md#entry-conditions): completed Functional Design, current artifacts, and requester availability for consequential quality choices. Existing code and measurements are not prerequisites. |
| NF05 | Stage owner | Complete | [Agent role](phases/construction/quality-requirements.md#agent-roles): `kepler-architect` owns the stage and maintains consistent quality requirements. |
| NF06 | Entry skill | Complete | [kepler-quality](skills.md#kepler-quality) performs the stage's investigation, artifact maintenance, self-review, evidence recording, approval request, and handoff. |
| NF07 | Self-review | Complete | [Self-review](phases/construction/quality-requirements.md#self-review) belongs in the entry skill and covers applicability, scope, acceptance conditions, consistency, blocking questions, and handoff. |
| NF08 | External review trigger | Complete | [External review](phases/construction/quality-requirements.md#external-review) occurs only when the requester asks for it. Self-review remains required. |
| NF09 | Requester approval | Complete | [Approval](phases/construction/quality-requirements.md#requester-approval) requires explicit requester acceptance of the current quality material, recorded through CLI-owned events. |
| NF10 | Reopening questionnaire | Complete | [Reopening questions](phases/construction/quality-requirements.md#reopening-questionnaire) identify stage-specific findings for the orchestrator's revision decision. Apply the shared authority and cascade rules. |
| NF11 | Completion conditions | Complete | [Completion](phases/construction/quality-requirements.md#completion-conditions) requires valid artifacts, consistent requirements, resolved blocking questions, named evidence, requester approval, and handoff to Implementation Planning. |
| NF12 | Whole-draft acceptance | Complete | [Quality Requirements](phases/construction/quality-requirements.md): the requester confirmed acceptance of the complete stage specification, including evidence and skill responsibilities. This does not approve an executing Unit of Work. |
| NF13 | Design quality category | Complete | [Maintainability](phases/construction/quality-requirements.md#maintainability) covers modularity, extensibility, decoupling, and safe change or technology replacement. Planning selects the mechanisms. |
| NF14 | Stage evidence coverage | Complete | [Evidence](phases/construction/quality-requirements.md#evidence-coverage) requires artifact validation, quality self-review, requested external review, and a separate requester approval record. Apply shared evidence bindings, applicability rules, and retention rules. |

## Implementation Planning decisions

These scoped decisions are complete. They do not accept the whole stage specification; IP19 remains open.

| ID | Decision | Status | Record |
| --- | --- | --- | --- |
| IP01 | Required planning document | Complete | [Artifacts](phases/construction/implementation-planning.md#paths-and-organization): require `plan.md` for technical rationale and `tasks-dag.json` for the task graph at the unit root. |
| DF04 | Technical design location | Complete | [Technical solution](phases/construction/implementation-planning.md#technical-solution): record the selected technical solution and its rationale in `plan.md` at the unit root. |
| IP21 | Technical rationale coverage | Complete | [Rationale](phases/construction/implementation-planning.md#technical-solution): `plan.md` must record the technical rationale for every planning decision. Concise explanations or precise references can be sufficient. |
| DF12 | Task graph representation | Complete | Define the custom [Kepler task graph JSON format](phases/construction/task-graph.md); do not adopt JGF. Its writer and validator remain MVP implementation work. |
| IP22 | Task ID format | Complete | Use [UUIDv4 strings for task IDs](phases/construction/task-graph.md#task-identity), independently of titles, artifact IDs, and attempt IDs. |
| IP23 | Verification setup placement | Complete | The graph's [verification object](phases/construction/task-graph.md#verification-object) records procedure, fixtures, versions, resources, and isolation conditions in `method`. Remove the separate `environment` field. |
| IP24 | Dependency object fields | Complete | Each [dependency object](phases/construction/task-graph.md#dependency-object) contains only `task_id` and `reason`. Explain required predecessor work in `reason`; retain task-level `outputs`. |
| IP25 | Task resource instruction placement | Complete | Remove the graph's `coordination` field. Place [resource-use instructions](phases/construction/task-graph.md#shared-file-and-resource-instructions) in `guidance`, verification `method`, or `prerequisites`, according to their scope. |
| IP06 | Task definition content | Complete | [Task content](phases/construction/task-graph.md#task-object) defines identity, goal, inputs, outputs, acceptance criteria, guidance, verification, dependencies, and external prerequisites. Accepted under IP26. |
| IP07 | Dependency contract | Complete | [Dependencies](phases/construction/task-graph.md#dependency-object) require justified predecessor work in `reason`. Resolve predecessor references and reject self-dependencies, duplicate edges, and cycles. Accepted under IP26. |
| IP20 | External prerequisite readiness | Complete | [Prerequisites](phases/construction/task-graph.md#prerequisite-object) identify affected work, timing, availability conditions, blocking behavior, and nonblocking rationale. Check blocking conditions before affected work, not Planning completion. Accepted under IP26. |
| IP26 | Task graph specification acceptance | Complete | The requester accepted the complete [task graph specification](phases/construction/task-graph.md), including its field meanings, example, validation rules, and JSON Schema. This does not accept the whole Planning stage or approve an executing unit. |

## Deferred decisions

These questions are deferred beyond the Construction MVP. Deferral selects no fallback, precedence rule, expiry period, or destructive operation.

Supporting-document types are agreed under [DF06](#completed-shared-decisions). Read supplied project context and resolve material conflicts during Construction. Deferring reference governance does not permit ignoring relevant facts or inventing current behavior.

| ID | Decision | Question to resolve |
| --- | --- | --- |
| CN20 | Coordination protocol definitions | After the MVP, define protocols that combine execution organization with worker communication. Consider serial/parallel scheduling, dependency DAGs, and general execution graphs. Evaluate inline, subagent, and team interaction separately. Examples: Basic uses serial/subagents; Workshop uses DAG/subagents; Factory uses graph/team. These combinations are illustrative, not accepted protocols. Define scope, feedback, context sharing, and compatibility with Activity contracts. Preserve required checks, authority, attempts, evidence, and integration guarantees. The fixed MVP model remains under [CN22](#completed-construction-decisions). Deferral selects no protocol, registry, or execution engine. |
| DF01 | Project reference authority | Defer formal [reference authority](README.md#document-scopes). Investigate actual conflicts; do not choose an implicit precedence rule. |
| DF02 | Inception terminology | What terms organize Inception intents? See [phase organization](README.md#phase-organization). |
| DF03 | Project preparation requirements | What project standards and workspace preparation does Initialization require? See [phase organization](README.md#phase-organization). |
| DF05 | Version 2 migration procedure | Keep migration outside the MVP. Preserve legacy data and report unsupported schemas without [automatic conversion](metadata.md#schema-version). |
| DF07 | Project reference structure | What internal document structure do Project references use? See [document scopes](README.md#document-scopes). |
| DF08 | Project reference updates | How are Project references maintained? See [document scopes](README.md#document-scopes). |
| DF09 | Intent document format | What documents represent Inception intents? See [phase organization](README.md#phase-organization). |
| DF10 | Inception unit-definition procedure | How does Inception produce one or more Units of Work? See [phase organization](README.md#phase-organization). |
| DF13 | Additional integration checks | Defer general extra-check policy. Honor unit/project obligations and the existing [typechecking/build/full-suite minimum](phases/construction/README.md#code-integration). |
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

The MVP needs all six Construction stages and the three Implementation Execution Activities. Functional Design and Quality Requirements are accepted. Planning, Execution, Unit of Work Review, and Deliver have drafts for discussion. The Execution draft includes dedicated Generation, Validation, and Integration Activity contracts. Their classification is accepted; their detailed bodies and other new proposals remain open. Writing these drafts does not accept Planning or close SH52. Supporting-document types are agreed under DF06.

The MVP path above defines bounded authoring work, not omnibus decision IDs. Add a question only when a material choice remains unanswered. Do not create separate approval gates for implementation-owned field types, event catalogs, or command syntax.

Do not require Initialization, Inception, managed reference features, or migration to be complete before shipping this Construction path.

## Filename convention

Use short filenames with full words, without abbreviations. The requester-selected `tasks-dag.json` is an explicit exception. The agreed `quality.md` replaces the proposed `requirements.md` name. Quality Requirements does not share `design.md` with Functional Design.

## Record maintenance

Update a row when its decision or disposition changes. Keep exactly one row per ID. Retain prior approval and source references when reorganizing the file.

Implementation choices require working behavior and tests, not new requester approval for every mechanism. Post-MVP rows remain unresolved; they do not authorize destructive or unsafe defaults.

Preserve whole-draft approval boundaries. This file does not grant permission to implement unapproved behavior or claim the release is complete.

Use ASD-STE100 Simplified Technical English. Do not run workflow-reference tests.
