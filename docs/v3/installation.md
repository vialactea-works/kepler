# Kepler v3 installation contract draft

[Version 3 reference](README.md) | [CLI draft](cli.md) | [Skills](skills.md) | [Construction runtime draft](phases/construction/runtime.md) | [Authoring progress](authoring_progress.md)

**Status:** Draft for discussion. Kepler v3 is not implemented or released. These proposals do not claim current support or authorize installation.

## Purpose and boundary

Define observable installation and host-readiness behavior for the Construction MVP. Keep installed software and host resources separate from authored project artifacts, workflow history, and live coordination.

Installation and setup do not run Initialization, create units, dispatch workers, or apply workflow transitions. Installation grants no implementation or delivery authority. Loading a portable skill file alone does not establish a working host integration.

## Current repository behavior

The current root exposes `setup` and `workbench`, not the v3 tree. See [CLI status](cli.md#purpose-and-status). Source: `packages/cli/src/cli/nest/root.command.ts:3-9`.

Current setup copies bundle templates and guideline manifests. It writes default settings only when settings are absent. Source: `packages/cli/src/cli/setup.service.ts:24-88`.

The current directory-copy adapter uses recursive `force: true`. Source: `packages/cli/src/cli/setup-runtime.ts:34-35`. Preserving user-modified resources below is a proposed v3 change, not implemented behavior.

Current global paths use absolute `XDG_CONFIG_HOME`, otherwise `$HOME/.config`, followed by `vialactea-works/kepler`. Project data uses `.kepler`, with existing legacy-path handling. Source: `packages/core/src/service.ts:46-99`.

The release workflow packages the sidecar bundle and checks a standalone binary with it. Source: `.github/workflows/release.yml:248-270`. These existing delivery mechanisms do not establish released v3 resources.

## Installed components

| Component | Responsibility and ownership boundary |
| --- | --- |
| Kepler CLI | The declared executable release. Its package manager or release installer owns binary placement. |
| Sidecar bundle | Declared compatible templates and guideline manifests. The compatible generation also supplies default settings. |
| Portable skills | Versioned procedures for accepted v3 responsibilities. Installation ownership remains open under SH117. |
| Host role bindings | Host-native bindings for the four accepted logical roles and entry skills. Ownership remains SH117. |
| Project artifacts | Authored unit documents, task graphs, and Project references. Installation does not create, rewrite, or migrate them. |
| Workflow history | Versioned phase journals under the runtime contract. Installation does not translate history or restore live ownership. |
| Local runtime data | Disposable views, locks, and worker ownership. Installation does not copy or restore this data. |

A usable installation needs compatible CLI, bundle, skills, and host bindings. Component presence alone proves neither compatibility nor authority to run a unit.

## Proposed installation generation

An installation record describes verified resources and their compatibility. It is not workflow authority or a general dependency resolver. The proposed version-one record contains:

| Field | Meaning |
| --- | --- |
| `format_version` | Installation-record format only, separate from artifact or event versions. |
| `generation_id` | Identity for this installed set, not an execution attempt. |
| `cli_release` | Exact CLI release identifier. |
| `bundle_release` | Exact bundle release and complete content digest. |
| `skills` | Required skill identities, declared releases or digests, and verified installation results. |
| `host_binding` | Host/platform identity, logical role bindings, resource versions, and verified capabilities. |
| `compatibility` | The declared supported combination of these resources. |

The proposed location is `<Kepler global home>/installation.json`. SH114 and SH117 retain the format, location, and recording ownership as implementation choices. These names are proposals, not accepted schemas.

A compatibility statement must cover the actual CLI, bundle, skills, and host binding. Similar version strings, latest tags, or portable files alone prove no compatibility. Missing, incomplete, or unsupported compatibility information prevents a workflow-ready claim.

Keep all version domains distinct: CLI release, bundle release, installation format, artifact `schema_version`, `envelope_version`, and `event_version`. A compatible installed generation does not make an unsupported artifact or journal readable.

Record verified component results without claiming unverified components. Setup success covers only setup's authorized resources. Full workflow readiness requires the remaining skill, host, and compatibility checks. The verification owner remains open under SH117; do not silently assign host installation or certification to setup.

## Inputs and prerequisites

Select the CLI release, compatible bundle and digest, required skills, host binding, and authorized targets. Unsupported or unavailable required inputs prevent their affected writes. Setup input grammar remains SH114; do not invent flags or assume an implicit latest release.

Use the installation request and applicable operator permission before changing global or host-native targets. Setup writes only its declared targets. Keep credentials, tokens, and private keys out of project files, bundles, skills, and installation records.

Software installation does not require project Git author identity. Before creating a project artifact requiring `author`, apply [SH61](metadata.md#missing-identity). Missing or blank identity blocks that creation before writing. Installation must not configure Git or invent attribution.

## Setup contract

The proposed [setup command](cli.md#kepler-setup) retains its installation-bootstrap role. Copy compatible bundle templates and guideline manifests. Create default settings only when settings do not exist.

Native skill/profile installation ownership is unresolved under SH117. Until selected, this draft grants setup no native-host installation authority. Setup does not create units, edit project files, dispatch workers, or apply workflow transitions.

Use the existing XDG-based global home. Keep project artifacts and [Construction runtime data](phases/construction/runtime.md#journal-projection-and-live-coordination-proposal) under their own contracts.

Preserve settings, project data, unsupported history, and user-modified resources. An existing file is installer-managed only when a valid installation record identifies it and its recorded digest matches. Preserve unknown or modified files. Report required-path conflicts instead of silently overwriting or merging them.

Existing `--force` behavior remains open under SH114. This draft grants no force-based permission to replace user data.

A successful setup result identifies the verified resources and their generation. It does not claim that unverified skills or hosts are ready. Component records may describe an incomplete installation explicitly. Only successful verification of all required components permits a complete, workflow-ready generation claim.

On failure, preserve the prior usable generation and report actual partial effects. Remove only temporary or partial resources provably owned by the failed operation. Do not delete uncertain data or perform automatic repair or migration.

CLI-owned failures return structured errors and nonzero status. Common output details remain SH104-SH107. Host-native installers retain their own failure reporting; no new Kepler command is defined here.

## Host capability contract

The host must load the four accepted role bindings and applicable entry skills. The [skill reference](skills.md) owns their responsibilities. This table does not implement or approve profiles.

| Logical role | Agent binding | Responsibility |
| --- | --- | --- |
| Architect | `kepler-architect` | Perform Functional Design, Quality Requirements, and Implementation Planning. |
| Orchestrator | `kepler-orchestrator` | Coordinate Implementation and its Code Integration scope. Perform Deliver under its separate contract. |
| Coder | `kepler-coder` | Perform assigned Code Generation. |
| Reviewer | `kepler-reviewer` | Perform independent non-author Code Validation and whole-unit Review without authoring the reviewed implementation. |

Provide the eight Standard entry skills: `kepler-design`, `kepler-quality`, `kepler-plan`, `kepler-orchestrate`, `kepler-code`, `kepler-code-feedback`, `kepler-review`, and `kepler-finish-work`. Provide `kepler-grilling`, `kepler-domain-modelling`, and `kepler-research` when the accepted procedures need them.

During Implementation, support orchestrator-controlled dispatch and concurrent independent ready tasks. Keep Generation and non-author Validation in separate contexts. Preserve assignment identities, source material, permissions, handoffs, and result bindings. Workers report facts; they need not dispatch one another.

This Implementation model does not select execution topology for Design, Quality, Planning, Review, or Deliver. Their accepted roles and authority still apply.

Unsupported required capabilities must produce an explicit unsupported-host result before affected execution. Do not substitute author self-review for independent Validation or silently serialize all ready work. Resume only after the owning recovery checks; copied installation records establish no worker ownership.

Named host/platform certification remains open under [SH116](authoring_progress.md#mvp-decisions). No Pi, Claude, Codex, Linux, macOS, or other target is selected or certified by this draft. SH117 retains native-resource installation ownership. No profile registry, topology selector, or host-discovery system is required.

## First use and resume

Verify compatible resources and required host capabilities before affected execution. Use an explicit Git project and unit identity. An empty application is valid; completed Initialization and Inception are not prerequisites.

Start with a clear unit request. Select or create the unit through its existing CLI contract. Invoke the selected Standard stage's entry skill under its authority and completion rules. Use defined [CLI grammar](cli.md); unchosen selectors remain proposals.

Setup neither selects the workflow nor launches an agent. Stage start records execution state without automatic dispatch. `kepler-orchestrate` owns Implementation and Code Integration responsibilities. Other entry skills retain their own scopes. Read and write execution facts through CLI-owned operations, never by editing journals or projections.

Resume from the explicit project, unit, current history, material, and safe worker-shutdown facts. Keep an unended attempt's identity when its inputs remain valid. Copying installation records or journals restores no live lock. Apply [Construction recovery](phases/construction/runtime.md#writes-partial-effects-and-safe-resumption).

## Upgrade and legacy behavior

An installation upgrade does not convert v2 artifacts, translate old status, or adopt old history as v3 authority. Preserve unsupported history and unfinished work. Missing compatibility prevents affected v3 operations without changing their data.

Existing Core path resolution and legacy copying remain separate from artifact conversion. This draft changes neither those shared rules nor the deferred migration policy. It grants no deletion, external rollback, or distributed synchronization authority.

The operator chooses rollout timing under applicable authority. SH116 selects certified support scope; it does not authorize installation or deployment. SH117 retains resource-installation ownership and the associated compatibility checks.

## Open decisions

- **SH116:** Which host/platform combinations are certified, and which required capabilities does each support? This is release scope, not worker topology.
- **SH117:** Which skill/profile writes belong to setup, the native host, or its skill manager? Define targets, verification ownership, failure handling, and compatibility.
- **SH114:** Define setup inputs, bundle selection, existing force-option behavior, results, and partial-write handling within these proposed preservation rules.

These drafts do not reopen accepted stage contracts or create an implementation plan. `implementation-map.md` remains outside this specification task.
