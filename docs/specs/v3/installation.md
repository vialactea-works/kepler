# Kepler v3 installation contract

[Version 3 reference](README.md) | [CLI contract](cli.md) | [Skills](skills.md) | [Construction runtime contract](phases/construction/runtime.md) | [Authoring progress](authoring_progress.md)

**Status:** SH124 approved the original installation contract and its format-one receipt. The requester approved the [unified-release design](../../unified-release-design.md) in `df0cff3ee813582ade65b6afaf687e0796146d3f` and authorized implementation. The uncommitted source candidate implements the release and Pi setup amendment; candidate verification and review evidence binds to exact source and archive identities, and changes require new evidence. Kepler 3.0.0 is not published. Neither approval authorizes live installation, migration, publication, or deployment. See [candidate verification status](#implementation-and-release-status) and the [implementation plan](../../unified-release-implementation-plan.md).

## Purpose and boundary

This contract gives observable installation and host-readiness behavior for the Construction workflow. Keep installed software and host resources separate from authored project artifacts, workflow history, and live coordination.

Installation and setup do not run Initialization, create units, dispatch workers, or apply workflow transitions. Installation grants no implementation or delivery authority. A portable skill file alone does not make a working host integration.

## Current repository behavior

The root exposes `setup`, `workbench`, `git`, `uuid`, `lint`, `audit`, `workflow`, and `mission`. The v3 commands coexist with the earlier change-based `workbench`; they do not convert its artifacts. See the [CLI guide](../../cli.md) for command usage and the [CLI contract](cli.md) for detailed interfaces.

The published baseline used a sidecar and left native skills and roles to host tooling. The current uncommitted source candidate replaces that flow with a complete versioned archive, source/resource identity checks, generation activation, a format-two receipt, and Pi package registration. The bootstrap installer stages one archive and invokes candidate setup; setup alone activates the selector. These candidate behaviors are not a published release. Acceptance requires full source-bound verification and fresh independent review of the exact frozen candidate; earlier evidence does not transfer across edits.

The existing global path remains `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler`; project records use `.kepler`. The Core path-copy behavior for legacy locations remains separate from v2 artifact or history conversion. Source: `packages/core/src/service.ts`.

## Installed components

| Component | Responsibility and ownership boundary |
| --- | --- |
| Kepler CLI | Current candidate: one target archive contains the executable and complete resource generation; setup owns selector activation and the stable command path. No 3.0.0 archive is published. |
| Resource package | Current candidate: versioned target archive contains templates, guidelines, skills, role profiles, descriptor, and complete inventory. The old split sidecar is not the setup input. |
| Portable skills | Current candidate: setup registers the packaged skills for Pi; Pi owns discovery, loading, and execution. Other hosts retain their native installation ownership. |
| Host role bindings | Current candidate: setup registers four Pi-native profiles; Pi and pi-subagents own discovery and execution. Separate Claude Code definitions remain in the package and are not installed by Pi setup. |
| Project artifacts | Authored unit documents, task graphs, and Project references. Installation does not create, rewrite, or migrate them. |
| Workflow history | Versioned phase journals under the runtime contract. Installation does not translate history or restore live ownership. |
| Local runtime data | Disposable views, locks, and worker ownership. Installation does not copy or restore this data. |

A usable installation must include a compatible CLI, resources, and required host capabilities. Component presence alone does not show compatibility or authority to run a unit. The table distinguishes the pre-unified published baseline from the current, unreleased source candidate.

## Agent resource ownership

**Historical approval: [SH117](authoring_progress.md#completed-shared-decisions).** SH117 assigned native installation and upgrades to the host or skill manager. The current source candidate implements the approved Pi-only supersession: setup registers the Kepler package, while Pi owns discovery, loading, and execution. Other hosts retain their native installation owner. The candidate is not a published release.

The current resource package contains eleven portable skill trees, four Claude Code definitions, four Pi-native profiles, templates, guidelines, and the Pi package descriptor. Manifest format two binds the release and complete sorted file inventory to a resource digest. `bun run prepare:bundle` regenerates this inventory and digest deterministically. Packaging supplies files; it does not show that Claude Code or a skill manager installed or loaded them. The [Claude Code subagent format](https://code.claude.com/docs/en/sub-agents) describes its native Markdown/YAML definition layout.

In the current candidate, setup owns the Pi package registration and Kepler's generation-backed resources. Pi owns loading and execution. The declared profiles keep the approved duties: only the orchestrator has the `subagent` tool; the reviewer has no dedicated write, edit, or dispatch tool but retains Bash for inspection and assigned checks. That non-author assignment is not a filesystem sandbox. These profile declarations do not certify agent behavior.

Each installer reports its own writes and failures. Keep installation results within that installer's scope. A failed or incomplete native installation cannot establish readiness through a successful setup result. Keep existing host configuration and apply its owner's permission rules before replacement.

These responsibilities add no Kepler host-verification framework, profile registry, or agent test system. They do not change the accepted stage, Activity, or role contracts.

### Pi resource ownership in the current source candidate

Kepler setup registers one local package in the selected Pi user configuration. Its descriptor exposes eleven skills through `pi.skills` and four Pi-native role definitions through `pi.subagents.agents`. Kepler owns the packaged resource bytes and one active-generation selector. Pi and pi-subagents own resource discovery, loading, and execution. The existing Claude Code definitions remain separate and are not installed or translated by Pi setup. This is current candidate behavior, not a published release.

Pi support is limited initially to a verified Pi 1.2.0 and pi-subagents 0.76.1 installation, an existing Pi user agent directory, and initialized settings. Resolve the directory from `KEPLER_PI_AGENT_DIR`, then `PI_CODING_AGENT_DIR`, then Pi's default. Preflight the visible user/project shadowing and settings registration. Report installed resource facts without claiming model execution, credentials, permissions, or already-loaded session state. Require a new session for first install and later major transitions. The host's settings writer remains a cooperative boundary; uncoordinated editors must be quiescent and drift must fail closed.

For Pi 1.2.0, the current adapter uses pinned `proper-lockfile` 4.1.2 and the native settings path. The candidate's integration tests exercise the actual Pi settings writer and verify that aged, fresh, replacement, and unknown holders are not reaped by acquisition, release, or process-exit cleanup. The adapter checks both ownership token and physical claim identity before releasing. These tests prove the tested cooperative protocol; manual editors or other writers that ignore Pi's lock are not serialized and must be quiescent during registration or transfer. See the [pinned library source](https://raw.githubusercontent.com/moxystudio/node-proper-lockfile/v4.1.2/lib/lockfile.js) for its default stale-lock behavior.

The target generation lives at `~/.kepler-dist/generations/<generation-id>/`; `~/.kepler-dist/current` is the only selector and is the literal Pi local-package source. On first setup, create a valid empty `generations/bootstrap` package and point `current` to it before registering that existing path. The bootstrap package contains no release resources and is not workflow-ready. After preflight and candidate staging, setup atomically replaces the `current` symlink with the candidate generation. The stable command path is `~/.local/bin/kepler -> ~/.kepler-dist/current/bin/kepler`; create it only after first candidate activation, and replace an existing link only if it is the exact known Kepler link to the old flat binary. Upgrades leave the Pi package registration unchanged. Bootstrap must not promote the selector or launcher. The [implementation plan](../../unified-release-implementation-plan.md) records the selector states, root journal, and recovery boundary.

An existing external native owner requires a separate explicit transfer. Ordinary setup reports the exact read-only plan and digest and does not apply the transfer or dependent activation. `kepler setup --accept-native-transfer <digest>` authorizes only the unchanged, safe plan. It does not authorize unknown, customized, or mixed resources, blanket removal, or deletion. Bootstrap supplies no transfer consent. The current source candidate implements this interface; the release remains unpublished.

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

Store the record at `<Kepler global home>/installation.json`. SH124 approves this location and the field names and meanings above. The current source candidate reads format one without relabeling it and writes format two only after verified activation. The read-only v1 mapping preserves original values and limits old ownership evidence to exact recorded Kepler templates and guidelines. This record adds no separate approval or certification gate.

### Format-two receipt in the current source candidate

The candidate keeps `<Kepler global home>/installation.json` and uses `format_version: 2`. It binds `generation_id`, one shared release `version`, source `commit` and `content_digest` plus production/development `kind`, OS/architecture `target`, the complete resource `manifest_digest` and per-file digests, and the selector path and selected generation ID. Its `pi_binding` records detected Pi and pi-subagents versions/checks, user scope, resolved agent directory and settings path, stable package source, registration digest/check, eleven skill identities/checks, and four role identities/checks. It records an explicit compatibility check. The closed field shape and reader constraints are in the [implementation plan](../../unified-release-implementation-plan.md). The candidate remains unreleased.

A format-one reader remains read-only. Preserve the v1 receipt bytes in recovery evidence until format-two activation succeeds. Interpret old CLI, bundle, skills, and host-binding fields only with their original meanings. A matching v1 digest authorizes only its exact recorded templates/guidelines; it never proves native Pi ownership or ownership of a selector, command link, settings entry, or unknown resource. The v2 receipt records resource and registration checks; it does not certify agent behavior, credentials, permissions, an active session, or workflow readiness.

A compatibility statement must cover the actual CLI, bundle, skills, and host binding. Similar version strings, latest tags, or portable files alone do not show compatibility. Missing, incomplete, or unsupported compatibility information prevents a workflow-ready claim.

Keep independent format counters distinct: installation receipt format, resource-manifest format, artifact `schema_version`, `envelope_version`, and `event_version`. Under the approved unified-release target, CLI and packaged resources share one Kepler SemVer; artifact schema follows that version's major. A compatible installed generation does not make an unsupported artifact or journal readable.

Record available component facts and software-check results without claiming that unchecked components are ready. Setup success applies only to setup's authorized resources. Native hosts and skill managers report their own installation results. Apply declared compatibility to the actual component versions.

Do not use installation records or skill text as proof of agent behavior. This specification defines no automated host-certification system. Actual execution still follows the owning stage and Activity contracts.

## Inputs and prerequisites

The current source candidate selects a complete target archive whose executable and resources share one release identity. The bootstrap installer selects a published stable tag, stages one target archive, and invokes candidate setup; setup itself does not download or select a release. Setup validates the complete archive/resource inventory before activation. Explicit development packaging uses isolated roots and fails closed when identity or prerequisites do not match.

Use the installation request and applicable operator permission before changing global or host-native targets. Setup writes only its declared targets. Keep credentials, tokens, and private keys out of project files, bundles, skills, and installation records.

Project Git author identity is not necessary for software installation. Before you create a project artifact with an `author` field, apply [SH61](metadata.md#missing-identity). Missing or blank identity blocks that creation before writing. Installation must not configure Git or invent attribution.

## Setup contract

The accepted [setup interface](cli.md#kepler-setup) under SH114 keeps its installation-bootstrap role, with the Pi-transfer option described in the CLI contract. The current candidate validates the complete archive and resource inventory before staging a generation. It resolves templates, guidelines, skills, and Pi-native definitions from that generation. It does not create default Pi settings: an existing initialized Pi settings file is a prerequisite.

The current candidate registers packaged skills and Pi-native definitions through the Pi local package; Pi still owns loading and execution. Setup does not create units, prepare project markers, edit project files, dispatch workers, or apply workflow transitions.

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

For a generation rollout, use a complete target archive and run its `kepler setup`. Keep active project artifacts, unsupported history, and local runtime data unchanged. Setup updates only verified, owned resources. A pre-activation failure keeps the prior selector; after an effect, setup reports known partial state and preserves recovery evidence rather than claiming rollback. Do not convert v2 artifacts, adopt old history, or move active work into v3 as part of installation. For Pi, Kepler setup owns the packaged resource registration while Pi owns loading and execution. Begin affected v3 execution only after required components and host capabilities are available.

The operator selects rollout timing under applicable authority. SH116 selects intended targets without agent certification. It does not authorize installation or deployment. SH117 records the historical owner for native-resource writes; the approved design supersedes that assignment for Pi only.

## Implementation and release status

SH124 approves the original installation-generation contract. The approved unified-release design amends SH114 and supersedes SH117 for Pi only; the original decision rows remain historical. SH116 still defines intended OS/architecture targets and does not certify execution. The [implementation plan](../../unified-release-implementation-plan.md) records the receipt-v2 shape, native-writer protocol, selector states, transfer digest, and recovery sequence.

The uncommitted source candidate implements these contracts but is not a published release. Source checks and reviews apply only to the exact candidate recorded in its private handoff; source changes invalidate earlier evidence. Before a candidate is accepted, run the required gates and independent reviews against its frozen source and exact archive. Publication remains a separate approval and target-native CI gate. No release, publication, deployment, live installation, or migration is claimed here.
