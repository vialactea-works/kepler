# Kepler v3 implementation map

This document records the M01 source-package mapping. The approved specifications define behavior and remain authoritative. Package ownership below is an implementation choice; it does not add workflow behavior or claim that v3 is implemented.

## Existing interfaces

The current workspace has two packages. Core exposes settings and path behavior. The CLI exposes setup and legacy workbench operations. The source interfaces below are observed in the current implementation; they do not establish v3 behavior.

| Existing interface | Current responsibility | M01 selection |
| --- | --- | --- |
| `KeplerEnvironment`, `KeplerServiceOptions`, `KeplerGlobalPaths`, `KeplerService` in `packages/core/src/service.ts` | Resolve current global and project paths, read settings, and retain legacy path-copy behavior. | Keep for existing setup and path compatibility. Do not use `projectDataPath` as mission storage or treat legacy copies as artifact conversion. |
| `KeplerSettings`, `parseKeplerSettings`, and `loadKeplerSettings` in `packages/core/src/config.ts` | Parse and load global settings. | Keep as generic configuration APIs. They do not model authored artifacts or execution state. |
| `ArtifactFileSystem` in `packages/cli/src/workbench/artifact-reader.ts` | Supplies a narrow file-read operation to the current workbench reader. | Reuse only as a pattern for a narrow file adapter. The current parser and `ArtifactReadResult` encode legacy artifact rules; M02 owns the v3 artifact reader. |
| `ProcessResult` and `ProcessPort` in `packages/cli/src/workbench/runtime.ts` | Describe command results and an injectable subprocess operation. | Reuse only where a use case needs a specifically typed process capability. Prefer operation-specific interfaces such as `CheckRunner` over a universal runtime. |
| `IsolationFileSystemPort` and `IsolationGitPort` in `packages/cli/src/workbench/runtime.ts` | Expose filesystem and Git operations for legacy workbench isolation. | Use only individual low-level operations whose contract fits. `IsolationRuntime` and its branch/worktree policy are not v3 workflow contracts. |
| `Setup` and `SetupFiles` in `packages/cli/src/cli/setup.service.ts`, with `createSetupRuntime` in `setup-runtime.ts` | `Setup` is the setup operation's inbound contract. `SetupFiles` and `SetupBundleLocator` are its outbound contracts; the runtime adapter owns Node filesystem and path APIs. | Keep setup-specific. `SetupService` contains no Nest, CLI, filesystem, or process dependency. Do not use setup to create missions, alter project artifacts, or install native host resources. |
| `ResultOutputSink` and `ResultExitSink` in `packages/cli/src/cli/nest/result-reporter.ts` | Separate current CLI output and exit effects. | Reuse the narrow sink pattern. Define the v3 result contract in its owning CLI boundary; the existing result shape does not set it. |
| `ContextRuntime` and `PreconditionRuntime` in `packages/cli/src/workbench/` | Combine filesystem, Git, process, and legacy workbench state inspection. | Do not reuse these broad composites as v3 truth or as application contracts. |

Core's `KeplerService` currently uses Node filesystem, operating-system, and path APIs. Treat it as a legacy infrastructure-facing API, not as pure domain logic. New domain rules and application use cases must depend on typed contracts rather than Nest, CLI, filesystem, or process APIs.

## Package ownership

| Area | Core package | CLI package | Spec boundary |
| --- | --- | --- | --- |
| Authored artifacts | Own shared artifact types and phase-independent metadata rules. Keep pure validation and parsing contracts reusable by other clients. | Translate public requests into artifact operations and supply repository-scoped read/write adapters. Do not create or rewrite project artifacts during installation. | [Runtime: data responsibilities and artifact metadata](runtime.md#data-responsibilities); [installation: installed components](installation.md#installed-components). |
| History | Own only phase-independent event-envelope contracts and pure shared rules that other clients can use. Do not own a global state model or journal path. | Own CLI operations that validate transitions and record/query events. Implement journal and projection adapters under the Mission paths; keep phase payloads and projections with their owning phase. | [Runtime: execution state and audit ownership](runtime.md#execution-state); [Mission: durable layout and journals](mission.md#durable-layout). |
| Missions | Provide reusable types or pure helpers only when they have no Mission storage or host policy. | Own mission-facing application operations, project selection, and adapters for mission record-home and local workspace effects. | [Mission: identity, durable layout, and implementation boundaries](mission.md#identity-membership-and-lifecycle); [runtime: CLI responsibilities](runtime.md#cli-responsibilities). |
| Construction rules | Provide shared primitives only when they do not impose Construction-specific states or scopes on other phases. | Own the Construction bounded context: phase-specific operations, transition rules, event payloads, and derived queries. Keep these operations behind typed contracts. | [Runtime: execution-state representation](runtime.md#execution-state); [Construction runtime](phases/construction/runtime.md). |
| Effects | Declare narrow ports for reusable Core use cases. Keep domain and application logic free of host APIs. | Implement CLI-facing filesystem, Git, process, workspace, coordination, and check adapters. An adapter performs effects only for its owning operation and reports its result. | [Runtime: handoff and recovery](runtime.md#handoff-and-recovery); [Installation: setup contract](installation.md#setup-contract). |

The Core/CLI split is a source-code choice, not a change to bounded-context ownership. Mission owns mission storage policy. Each workflow phase owns its state model and event payloads. CLI-owned operations validate phase transitions and write the resulting events. No package owns a universal workflow engine, repository, service locator, or plugin registry.

## Installation boundary

Kepler supplies versioned bundle resources, skills, and native agent definitions. The host or its skill manager owns native skill and agent installation. Setup owns only its declared bundle and default-setting targets. Installation does not create or migrate project artifacts, translate workflow history, or restore locks and worker ownership. An installation result does not grant workflow authority or certify agent behavior.

See [Installation: agent resource ownership](installation.md#agent-resource-ownership), [setup contract](installation.md#setup-contract), and [upgrade and legacy behavior](installation.md#upgrade-and-legacy-behavior).

The [M01.8 smoke-invocation inventory](smoke-invocation-inventory.md) records current release callers and their M15/M16 replacements.
