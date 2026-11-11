# V3 stage characteristics: implementation impact

## Scope and result

The [shared Stage contract](specs/v3/stage.md) and all six [Construction stage contracts](specs/v3/phases/construction/README.md#stage-catalog) declare Inputs, Lead agent, Outputs, and Gates. This assessment compares those definitions with source at `667f7fdcef4367bfa01509d2862ac20afebfc8f1`.

The six portable Construction stage skills now include self-contained summaries of those four characteristics. The architect, orchestrator, and reviewer prompts reinforce the responsibilities and handoffs in their respective scopes. This resource alignment clarifies existing contracts; it adds no runtime behavior, execution fields, gate engine, or agent assignment records. Existing operations implement the six stages and many of their material, evidence, approval, and completion conditions.

The implementation still has no uniform machine-readable four-characteristic description or query presentation. Those remain optional follow-up work if an agent host or CLI consumer needs them; this resource alignment does not implement them.

## Current implementation

| Characteristic | Existing behavior | Boundary |
| --- | --- | --- |
| Inputs | [`StageStart`](../packages/cli/src/construction/stage-start.ts) records nonempty opaque references and purposes, checkpoints, and upstream authority IDs. [`NodeConstructionMaterialReader`](../packages/cli/src/construction/node-material-reader.ts) and stage-specific completion handlers read and validate concrete artifacts and their bindings. | Start input strings do not resolve themselves or prove that every required artifact is current. Preserve first-stage request/context bootstrap and each stage's validation timing. |
| Lead agent | Portable stage skills and architect, orchestrator, and reviewer prompts now state the accepted stage responsibilities. The [stage-start payload](../packages/cli/src/construction/events.ts) has no lead assignment field, and starting a stage returns `worker_dispatched: false`. | A declared lead role is not an authenticated worker identity or permission. Evidence executor/reviewer strings and independence checks do not implement an identity or dispatch system. |
| Outputs | Stage-specific operations bind authored artifacts, code and tests, integrated checkpoints, assessment records, and handoffs. The aligned skills distinguish these output kinds without adding runtime records. | There is no universal output format. Implementation and Review do not need new Markdown reports. Deliver's actual products depend on the requested outcome. |
| Gates | Stage-start authority checks, dedicated completion handlers, Activity operations, and [`projectConstruction`](../packages/cli/src/construction/projection.ts) enforce existing lifecycle and evidence rules. Portable summaries describe these existing entry and advancement conditions. | These checks are stage-specific, not a generic interpreter of a gate list. Human assessment and operation permissions remain with their existing owners. Metadata alone must not report that a gate passed. |

### Stage ownership and completion paths

| Stage | Lead | Main products | Existing implementation |
| --- | --- | --- | --- |
| Functional Design | `kepler-architect` | `unit-of-work.md`, `design.md`, relevant detail, evidence and required requester approval. | [`FunctionalDesignStageCompletion`](../packages/cli/src/construction/stage-completion.ts). Bootstrap does not require earlier phase artifacts or completed design outputs. |
| Quality Requirements | `kepler-architect` | `quality.md`, detail, evidence and required requester approval. | [`QualityRequirementsStageCompletion`](../packages/cli/src/construction/quality-stage-completion.ts). |
| Implementation Planning | `kepler-architect` | `plan.md`, `tasks-dag.json`, validation and self-review evidence; approval when required. | [`ImplementationPlanningStageCompletion`](../packages/cli/src/construction/planning-stage-completion.ts). |
| Implementation | `kepler-orchestrator` | Code/tests, integrated material, task/Activity evidence and unit assessment. | [`ImplementationStageCompletion`](../packages/cli/src/construction/implementation-stage-completion.ts), Activity operations and Integration acceptance. Valid retained scopes keep their original bindings. |
| Unit of Work Review | `kepler-reviewer`, independent of the primary author | Whole-unit assessment, findings, evidence and Deliver handoff. | [`UnitOfWorkReviewStageCompletion`](../packages/cli/src/construction/unit-of-work-review-completion.ts). Acceptance is conditional; no mandatory `review.md`. |
| Deliver | `kepler-orchestrator` | `delivery.md`, authorized outcome products, operation results, verification and recipient handoff. | [`DeliverStageCompletion`](../packages/cli/src/construction/deliver-stage-completion.ts). No universal publication or deployment. |

The existing `CONSTRUCTION_STAGES` and `CONSTRUCTION_ACTIVITIES` constants keep the six stages separate from the three Activities inside Implementation. No new stage is needed. Initialization and Inception still have no defined stage catalog in this reference.

## Recommended follow-up if runtime descriptions are needed

1. **Add a read-only Construction description.** Use a small typed description keyed by the existing stage values, with input requirements, declared lead role, output kinds, and references to the owning entry/completion conditions. Distinguish required, optional, bootstrap, and conditional material. Keep this description in the Construction context. Do not add a general registry, workflow DSL, or second source of execution state.
2. **Choose a concrete consumer.** [`ConstructionQueries.stageShow`](../packages/cli/src/construction/scoped-queries.ts) currently returns state, attempts, effort, evidence, approvals, blockers, and unknowns. It does not return the four-characteristic contract. Extend its read-only presentation only if callers need that information. Keep static requirements separate from observed gate results. A new command or stored event field is not required by the specification amendment.
3. **Reuse the existing validation paths.** Link descriptions to stage-specific material readers, authority checks, completion handlers, and replay rules. Do not replace them with file-existence checks, automatically resolve opaque references, or require completed Functional Design outputs before that first stage starts. Keep conditional approvals conditional. Integration workers still execute the required commands; the CLI validates and records their supplied results.
4. **Keep resource alignment distinct from runtime assignment.** The six stage skills now carry self-contained characteristic summaries, and the architect, orchestrator, and reviewer prompts reinforce scoped accountability. These names describe responsibilities; they do not select authenticated identities, models, topology, or permissions. Any future host assignment can expose stage inputs and outputs while preserving existing lead roles and worker boundaries. Do not add assignment events, an authentication scheme, or authority from a role name.
5. **Verify only the changed contract.** For a description/query implementation, add unit tests for complete six-stage coverage and public types, plus query/CLI integration tests for read-only output. If a real gate changes, test that stage's positive, negative, current-material, approval, and replay boundaries. Use a complete CLI workflow only when full wiring changes. Do not add tests that assert skill wording or claim live-agent certification.

The completed skill and lead-prompt alignment requires the corresponding source and shipped resources to remain synchronized through `bun run prepare:bundle` and the applicable resource-generation compatibility rules. A future runtime description or query change alone does not require another bundle change unless it also changes a portable resource.

## Existing traceability limit to keep separate

The [Review contract](specs/v3/phases/construction/unit-of-work-review.md#evidence-assessment) includes comparison from the unit's original Review baseline to the final integrated result. [`ConstructionDiffPackageSources`](../packages/cli/src/construction/diff-package-source.ts) supports `unit-review-original-baseline-to-completion` and binds that package comparison to the baseline and Implementation assessment.

The Review completion handler binds review evidence to current artifacts, final checkpoints, the reviewer, and the current attempt. It does not separately prove that the reviewer assessed the original-baseline range. That comparison remains a reviewer responsibility supported by the package path. This is a source-inspection observation, not a reproduced runtime failure or a new requirement introduced by the four-characteristic format.

If stronger machine-auditable comparison coverage is wanted, define the required comparison/provenance binding explicitly, then update the existing Review assessment, validation, replay, and tests with appropriate compatibility. Do not silently add mandatory fields to old records as part of a presentation change.

## Changes not required

- No new stages, Activity promotion, universal requester approval, delivery permission, report filename, or deployment gate.
- No change to stage order, attempts, revision cascades, authoritative journals, or the existing one-repository executable Integration limit.
- No application-runtime, query-output, host-installation, or deployment behavior is added. The alignment updates six skill sources and three lead prompts; the coder prompt remains unchanged.

The source audit was read-only. This report separates the completed skill and lead-prompt alignment from optional runtime-description and query-presentation work; it does not claim that follow-up was implemented or tested.
