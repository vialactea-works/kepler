# Kepler v3 installation contract

[Version 3 reference](README.md) | [CLI contract](cli.md) | [Skills](skills.md) | [Construction runtime contract](phases/construction/runtime.md) | [Authoring progress](authoring_progress.md)

**Status:** Approved by the requester under [SH124](authoring_progress.md#completed-shared-decisions). Earlier decisions SH114, SH116, and SH117 keep their scope. Kepler v3 is not implemented or released. This approval does not claim current support or authorize installation.

## Purpose and boundary

This contract gives observable installation and host-readiness behavior for the Construction workflow. Keep installed software and host resources separate from authored project artifacts, workflow history, and live coordination.

Installation and setup do not run Initialization, create units, dispatch workers, or apply workflow transitions. Installation grants no implementation or delivery authority. A portable skill file alone does not make a working host integration.

## Current repository behavior

The current root exposes `setup` and `workbench`, not the v3 tree. See [CLI status](cli.md#purpose-and-status). Source: `packages/cli/src/cli/nest/root.command.ts:3-9`.

Current setup copies bundle templates and guideline manifests. It writes default settings only when settings are absent. Source: `packages/cli/src/cli/setup.service.ts:24-88`.

The current directory-copy adapter uses recursive `force: true`. Source: `packages/cli/src/cli/setup-runtime.ts:34-35`. The accepted v3 behavior keeps user-modified resources. The current software does not keep user-modified resources.

The current command parses `--force` but does not use that option. Source: `packages/cli/src/cli/nest/setup.command.ts:17-27`. The accepted v3 interface removes the flag.

Current global paths use absolute `XDG_CONFIG_HOME`, otherwise `$HOME/.config`, followed by `vialactea-works/kepler`. Project data uses `.kepler`, with existing legacy-path handling. Source: `packages/core/src/service.ts:46-99`.

The release workflow packages the sidecar bundle and checks a standalone binary with it. Source: `.github/workflows/release.yml:248-270`. These existing delivery mechanisms do not show that v3 resources have been released.

## Installed components

| Component | Responsibility and ownership boundary |
| --- | --- |
| Kepler CLI | The declared executable release. Its package manager or release installer owns binary placement. |
| Sidecar bundle | Declared compatible templates and guideline manifests. The compatible generation also supplies default settings. |
| Portable skills | Kepler supplies versioned procedures. The native host or skill manager installs and upgrades them in its own locations. |
| Host role bindings | Kepler supplies versioned definitions for the four accepted logical roles and entry skills. The native host or skill manager installs them. |
| Project artifacts | Authored unit documents, task graphs, and Project references. Installation does not create, rewrite, or migrate them. |
| Workflow history | Versioned phase journals under the runtime contract. Installation does not translate history or restore live ownership. |
| Local runtime data | Disposable views, locks, and worker ownership. Installation does not copy or restore this data. |

A usable installation must include a compatible CLI, bundle, skills, and host bindings. Component presence alone does not show compatibility or authority to run a unit.

## Agent resource ownership

**Accepted under [SH117](authoring_progress.md#completed-shared-decisions).** Kepler supplies versioned skills and native agent definitions. The coding-agent host or its skill manager owns their installation and upgrades in its native locations.

Here, the host is the coding-agent application. Native configuration assigns the four roles, entry skills, tool permissions, and existing subagent dispatch. Setup owns Kepler's bundle resources and default settings, not native agent or skill installation.

Each installer reports its own writes and failures. Keep installation results within that installer's scope. A failed or incomplete native installation cannot establish readiness through a successful setup result. Keep existing host configuration and apply its owner's permission rules before replacement.

These responsibilities add no Kepler host-verification framework, profile registry, or agent test system. They do not change the accepted stage, Activity, or role contracts.

## Installation generation

An installation record lists resources and their compatibility status. It is not workflow authority or a general dependency resolver. The accepted version-one record contains:

| Field | Meaning |
| --- | --- |
| `format_version` | Installation-record format only, separate from artifact or event versions. |
| `generation_id` | Identity for this installed set, not an execution attempt. |
| `cli_release` | Exact CLI release identifier. |
| `bundle_release` | Exact bundle release and complete content digest. |
| `skills` | Necessary skill identities, declared releases or digests, and the results of installation checks. |
| `host_binding` | Host/platform identity, native role bindings, resource versions, and available installation facts. These values do not prove tested agent behavior. |
| `compatibility` | The declared supported combination of these resources. |

Store the record at `<Kepler global home>/installation.json`. SH124 approves this location and the field names and meanings above. Field types, nested encodings, and recording mechanics not specified here remain implementation details within the accepted resource-ownership rules. This record adds no separate approval or certification gate.

A compatibility statement must cover the actual CLI, bundle, skills, and host binding. Similar version strings, latest tags, or portable files alone do not show compatibility. Missing, incomplete, or unsupported compatibility information prevents a workflow-ready claim.

Keep all version domains distinct: CLI release, bundle release, installation format, artifact `schema_version`, `envelope_version`, and `event_version`. A compatible installed generation does not make an unsupported artifact or journal readable.

Record available component facts and software-check results without claiming that unchecked components are ready. Setup success applies only to setup's authorized resources. Native hosts and skill managers report their own installation results. Apply declared compatibility to the actual component versions.

Do not use installation records or skill text as proof of agent behavior. This specification defines no automated host-certification system. Actual execution still follows the owning stage and Activity contracts.

## Inputs and prerequisites

The release installer selects the CLI release and supplies its bundle. Setup uses the accepted [local bundle selection](cli.md#kepler-setup), including the `KEPLER_BUNDLE_DIR` override. Validate the selected bundle's declared compatibility and digest before copying resources. An invalid explicit override fails without selecting another bundle. Setup does not download or select a latest release.

Use the installation request and applicable operator permission before changing global or host-native targets. Setup writes only its declared targets. Keep credentials, tokens, and private keys out of project files, bundles, skills, and installation records.

Project Git author identity is not necessary for software installation. Before you create a project artifact with an `author` field, apply [SH61](metadata.md#missing-identity). Missing or blank identity blocks that creation before writing. Installation must not configure Git or invent attribution.

## Setup contract

The accepted [setup interface](cli.md#kepler-setup) under SH114 keeps its installation-bootstrap role. Copy compatible bundle templates and guideline manifests. Create default settings only when settings do not exist.

Apply the accepted [agent resource ownership](#agent-resource-ownership). Setup does not install native agent definitions or skills. It does not create units, prepare project markers, edit project files, dispatch workers, or apply workflow transitions.

Use the existing XDG-based global home. Keep project artifacts and [mission runtime data](mission.md#local-storage-and-concurrency) under their own contracts.

Keep settings, project data, unsupported history, and user-modified resources. An existing file is installer-managed only when a valid installation record identifies it and its recorded digest matches. Keep unknown or modified files. Report conflicts at necessary paths instead of silently overwriting or merging them.

Remove `--force` from the v3 interface. Do not use another option to bypass these preservation rules.

A successful setup result identifies the installed generation and resource-check results inside `data`. It does not claim that unchecked skills or hosts are ready. Component records can report an incomplete installation. Do not describe an incomplete or uncertain generation as complete or workflow-ready.

On failure, keep the prior usable generation. Report available partial-write facts in `data.details`. Remove only temporary or partial resources that the failed operation can identify as its own. Do not delete uncertain data or perform automatic repair or migration.

CLI results use the accepted [result envelope](cli.md#machine-readable-output). CLI-owned failures use the shared [failure result fields](cli.md#failure-and-recovery-rules). Apply the accepted [exit-code contract](cli.md#exit-codes), [output stream contract](cli.md#output-streams), and [JSON-only result format](cli.md#human-output). Host-native installers keep their own failure reporting. This document adds no new Kepler command.

## Host capability contract

The host must load the four accepted role bindings and applicable entry skills. The [skill reference](skills.md) owns their responsibilities. This table does not install or approve profiles.

| Logical role | Agent binding | Responsibility |
| --- | --- | --- |
| Architect | `kepler-architect` | Own Functional Design, Quality Requirements, and Implementation Planning. |
| Orchestrator | `kepler-orchestrator` | Coordinate Implementation and its Code Integration scope. Own Deliver under its separate contract. |
| Coder | `kepler-coder` | Own assigned Code Generation. |
| Reviewer | `kepler-reviewer` | Own independent non-author Code Validation and whole-unit Review. Do not author the reviewed implementation. |

Load the eight Standard entry skills: `kepler-design`, `kepler-quality`, `kepler-plan`, `kepler-orchestrate`, `kepler-code`, `kepler-code-feedback`, `kepler-review`, and `kepler-finish-work`. Load `kepler-grilling`, `kepler-domain-modelling`, and `kepler-research` when the accepted procedures call for them.

The host must have two capabilities during Implementation: orchestrator-controlled dispatch and concurrent execution of independent ready tasks. Keep Generation and non-author Validation in separate contexts. Keep assignment identities, source material, permissions, handoffs, and result bindings. Workers report facts. Worker-to-worker dispatch is not necessary.

This Implementation model does not select execution topology for Design, Quality, Planning, Review, or Deliver. Their accepted roles and authority still apply.

If a necessary capability is unsupported, return an explicit unsupported-host result before affected execution. Do not substitute author self-review for independent Validation or silently serialize all ready work. Resume only after the owning recovery checks. Do not treat copied installation records as proof of worker ownership.

Apply the accepted [intended targets](#intended-targets) and [agent resource ownership](#agent-resource-ownership). Target selection does not certify a named coding-agent host or prove agent behavior. No profile registry, topology selector, or host-discovery system is necessary.

## Intended targets

**Accepted under [SH116](authoring_progress.md#completed-shared-decisions).** Use these intended operating-system and CPU targets:

| Operating system | CPU architecture |
| --- | --- |
| Linux | `x86_64` |
| Linux | `arm64` |
| macOS | `x86_64` |
| macOS | `arm64` |

These are intended 64-bit targets. They do not claim tested or certified agent support.

Tests that assert skill Markdown wording or structure do not prove agent behavior.

Keep appropriate tests of executable CLI and Core behavior, including workflow operations, recovery, concurrency, and invalid transitions. The accepted Generation, Validation, Integration, and Review duties still apply during actual work.

## First use and resume

Start affected execution only when compatible resources and necessary host capabilities are available. Use an explicit record-home project and unit identity. Apply the accepted [project selection rules](cli.md#project-selection), including the existing local `.kepler/` directory. An empty application is valid. Completed Initialization and Inception are not prerequisites.

Apply the accepted [mission startup rules](mission.md#workspace-selection-and-preparation) before the first stage. Define the workspace and complete authorized preparation. Resolve the mission through explicit selection or unique recorded unit membership. Do not adopt unbound units implicitly.

Start with a clear unit request. Select or create the unit through its existing CLI contract. Invoke the selected Standard stage's entry skill under its authority and completion rules. Use the approved [CLI grammar](cli.md). Do not infer additional selectors.

Setup neither selects the workflow nor launches an agent. Mission creation records the workflow binding. Unit creation records the matching [Standard workflow binding](cli.md#workflow-binding). Later operations and resume use the recorded binding.

Stage start records execution state without automatic dispatch. `kepler-orchestrate` owns Implementation and Code Integration responsibilities. Other entry skills keep their own scopes. Read and write execution facts through CLI-owned operations, never by editing journals or projections.

Resume from the explicit project, unit, current history, material, and safe worker-shutdown facts. Keep an unended attempt's identity when its inputs stay valid. Copying installation records or journals does not restore a live lock. Apply [mission recovery](mission.md#evidence-transfer-and-recovery) and the owning [Construction recovery rules](phases/construction/runtime.md#writes-partial-effects-and-safe-resumption).

## Upgrade and legacy behavior

An installation upgrade does not convert v2 artifacts, translate old status, or adopt old history as v3 authority. Keep unsupported history and unfinished work. Missing compatibility prevents affected v3 operations without changing their data.

Existing Core path resolution and legacy copying stay separate from artifact conversion. This contract changes neither those shared rules nor the deferred migration policy. It grants no deletion, external rollback, or distributed synchronization authority.

The operator selects rollout timing under applicable authority. SH116 selects intended targets without agent certification. It does not authorize installation or deployment. SH117 assigns native-resource writes to the host or skill manager.

## Remaining implementation details

SH124 approves the complete installation contract, including the installation-generation record. SH114, SH116, and SH117 keep their earlier approval scopes. Encodings and mechanisms not specified here remain implementation details, not separate requester approval gates.

These approvals do not reopen accepted stage contracts or create an implementation plan. `implementation-map.md` stays outside this specification task.
