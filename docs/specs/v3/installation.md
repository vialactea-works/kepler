# Kepler v3 installation and home contract

[Version 3 reference](README.md) | [CLI contract](cli.md) | [Skills](skills.md) | [Construction runtime contract](phases/construction/runtime.md) | [Authoring progress](authoring_progress.md)

**Status:** SH124 approved the original installation contract. The requester later amended its installation boundary: Kepler requires an externally selected, version-specific `KEPLER_HOME`; setup initializes that home and does not install or register the CLI or host resources. This amendment supersedes conflicting installation behavior in SH114, SH117, and the earlier unified-release design. Those records remain historical. The current source candidate implements the amended boundary. The published `v3.0.0` tag's setup code requires `KEPLER_HOME` and initializes a release-bound home. Its published resource inventory may differ from this source candidate; no release containing this candidate is claimed. This contract does not authorize live installation, migration, publication, or deployment.

## Purpose and boundary

Kepler defines a versioned resource home and its initializer. The user, host, or external software manager selects the CLI version, provides `KEPLER_HOME`, manages `PATH`, and chooses how hosts discover resources. Kepler does not select a release, download or install the CLI, manage an active-version selector, register resources with Pi or another host, or launch agents.

Setup initializes only the selected home. It does not create units, run workflow stages, migrate project history, install host prerequisites, configure credentials or permissions, or change host settings. Setup success proves only the reported home-initialization result.

The prior [unified-release design](../../unified-release-design.md) and [implementation plan](../../unified-release-implementation-plan.md) document superseded decisions and implementation history. They are not current installation instructions or normative contracts.

## Version-specific home

`KEPLER_HOME` is required and must be an absolute path. Kepler provides no fallback. A common location is:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/versions/<version>/
```

The caller chooses `<version>` to match the installed CLI. The path may be elsewhere if the caller supplies a different absolute path. Each release uses a separate home. Do not copy settings or resources between homes automatically.

The initialized home contains these top-level entries:

| Path | Contents |
| --- | --- |
| `templates/` | Versioned Kepler templates. |
| `guidelines/` | Versioned Kepler guidelines. |
| `skills/` | Complete portable skill trees, including their references. |
| `agents/` | Packaged agent-profile files for supported hosts. |
| `settings.yaml` | Kepler settings, seeded as an empty mapping (`{}\n`). |
| `home-metadata.json` | Initialization format, release, resource digest, and pending status when initialization is incomplete. |

The resource package binds one Kepler release to its complete sorted file inventory and content digests. The current manifest format is 3. This source candidate declares fourteen skills and eight agent profiles: four Pi profiles and four Claude Code profiles. These files are data in the Kepler home. Their presence does not configure a host or show that a host loaded them.

## Setup contract

Use the global command:

```text
kepler setup
```

Before writing, setup requires an absolute `KEPLER_HOME`, a production build identity or an explicitly supported development identity, and a complete resource package whose release and target match the executing CLI. It validates the archive and resource inventory before initializing the home. A source-checkout runner without a valid package identity cannot initialize a release home.

For a new home, setup creates the directory, writes compatible pending metadata, and creates missing packaged resource files and the default settings file. It writes ready metadata only after those writes complete. It does not overwrite user-owned files; its only replacement is the exact compatible pending metadata record, after verifying that record has not changed. It rejects a symlink or non-directory at `KEPLER_HOME`, non-regular resource paths, unsafe relative resource paths, and resource symlinks. Symlinked ancestors in the caller-selected absolute path follow normal filesystem resolution.

If a home has ready metadata for the same release, setup returns `unchanged` and does not reconcile resource contents. User edits, deletions, and unknown files remain intact. The resource digest identifies the seeded package; it is not an ongoing integrity check. Use a new version-specific home for another release.

If a prior initialization stopped while metadata has a compatible `initializing` status, setup can resume with the same release and resource digest. It creates missing files without overwriting user-owned resources or settings, then replaces only the exact compatible pending metadata record with ready metadata after verifying that record has not changed. A different release, incompatible pending metadata, malformed metadata, or a non-empty home without compatible Kepler metadata fails closed. Preserve the contents and inspect the reported error. Setup does not clean unknown files or claim rollback after an interrupted write.

The success `data` identifies the absolute home, release, and `initialized` or `unchanged` status. Missing or invalid `KEPLER_HOME` returns a structured failure. Other validation or filesystem errors return `home_initialization_failed`. Apply the shared [result and recovery rules](cli.md#failure-and-recovery-rules).

## Resource ownership

**Historical approval: [SH117](authoring_progress.md#completed-shared-decisions).** SH117 originally assigned native resource installation to the host or skill manager and assigned Kepler setup ownership of its bundle and settings. The requester's later amendment keeps the separation but narrows Kepler's responsibility to initialization of the version-specific home. Kepler does not write to host settings or native skill/agent locations.

Hosts and skill managers own resource discovery, installation, loading, permissions, session lifecycle, and execution. Users choose which packaged resources to expose to a host. Avoid duplicate skill copies when a host has more than one discovery mechanism. Follow each host's own procedures.

The packaged role files express Kepler responsibilities. The orchestrator role has the declared dispatch boundary. The reviewer assignment remains non-author, but tool declarations do not create an operating-system sandbox. Resource files, manifest checks, or host loading do not certify agent behavior, credentials, permissions, active sessions, or workflow readiness.

The accepted [skill reference](skills.md) defines skill responsibilities. It does not grant a host integration to setup.

## Installation and release ownership

The external software manager or user installs and selects the CLI version. That owner also manages executable paths and `PATH`. The Kepler release package carries a CLI and matching resources; `kepler setup` seeds the matching version-specific home. No Kepler bootstrap installer, stable launcher, active-generation selector, `kepler-dist` root, Pi registration, native-transfer option, or coding-agent launcher is part of this contract.

A Kepler resource home is separate from project records. It does not hold missions or project history. Kepler retains the existing safe project path-copy behavior from `.hamilton/` to `.kepler/`: copy only when the canonical destination does not exist, preserve the source, and do not merge or delete data. This behavior does not convert artifacts or history.

## Host capabilities and intended targets

A host that executes the Standard workflow must provide the accepted roles and load the relevant entry skills. The role responsibilities remain:

| Logical role | Profile identity | Responsibility |
| --- | --- | --- |
| Architect | `kepler-architect` | Functional Design, Quality Requirements, and Implementation Planning. |
| Orchestrator | `kepler-orchestrator` | Implementation coordination and Code Integration under their separate scopes. |
| Coder | `kepler-coder` | Assigned Code Generation. |
| Reviewer | `kepler-reviewer` | Independent non-author Code Validation and whole-unit Review. |

Implementation requires orchestrator-controlled dispatch and concurrent execution of independent ready tasks. Generation and non-author Validation require separate contexts. A host that lacks a necessary capability must report that limitation before affected execution. No setup command discovers or certifies these capabilities.

**Accepted under [SH116](authoring_progress.md#completed-shared-decisions).** Intended operating-system and CPU targets are Linux and macOS, each on `x86_64` and `arm64`. These targets do not claim tested or certified host or agent support. Native execution evidence applies only to targets whose exact release artifacts passed native checks.

## First use, resume, and compatibility

Start workflow execution only when compatible CLI resources and the required host capabilities are available. Apply the [project selection rules](cli.md#project-selection), mission startup rules, and owning stage contracts. Setup neither selects the workflow nor launches an agent.

An installation change does not convert earlier change-based artifacts, rewrite event history, or restore live locks and worker ownership. Keep unsupported history and unfinished work. The earlier `workbench` surface keeps its own artifact model. Do not infer workflow authority from copied files, home metadata, or matching version strings.

## Implementation and release status

The active source candidate implements the versioned-home contract and removes the prior installer and Pi-registration flow. Its checks do not certify a published release. The published `v3.0.0` tag requires `KEPLER_HOME`; it does not contain this source candidate's added skills. A subsequent release requires fresh source, package, archive, checksum, provenance, and target-native verification; previous release evidence does not certify changed bytes. No release recreation, publication, live installation, migration, or deployment is claimed here.
