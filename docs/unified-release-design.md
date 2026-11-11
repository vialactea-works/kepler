# Unified Kepler release and setup design

**Historical status:** The requester approved this design at an earlier point. A later requester decision superseded its Kepler-owned CLI installation, generation selector, and Pi-registration boundary. The current contract is [versioned home initialization](specs/v3/installation.md). This document remains as provenance for the earlier design; its approval is not current implementation or release evidence. It does not authorize live-home changes, publication, deployment, or data migration.

## Confirmed direction

- Publish one versioned file for each supported OS and architecture. Each file contains the standalone CLI binary, assets, skills, and agent prompts from one release.
- Give the shipped components one Kepler release version. Do not maintain separate bundle, skill, or binding release numbers.
- Let `kepler setup` install the packaged skills and agent prompts. The first managed host is Pi only.
- Set artifact `schema_version` to the Kepler release major. Patch and minor releases preserve the schema and existing valid artifacts.

The proposed first unified release is **3.0.0**, because the existing Construction artifacts already use schema `3`. No remote `v3` tags were found during discovery; this does not reserve the version. Before publication, check existing tags, GitHub releases/assets, and the Core registry version. An existing immutable identity is reusable only for reconciliation of the same verified source and bytes; an unmatched or unverifiable version blocks publication. Moving the executable from its current declared `0.11.0` to `3.0.0` must not rewrite existing schema-3 artifacts or historical producer versions.

## Current behavior and failure paths

The checkout duplicates the executable release in three package manifests and two TypeScript constants. [The version check](https://github.com/vialactea-works/kepler/blob/df0cff3ee813582ade65b6afaf687e0796146d3f/scripts/check-versions.ts) detects disagreement, but does not prepare a version change. [The bundle generator](https://github.com/vialactea-works/kepler/blob/df0cff3ee813582ade65b6afaf687e0796146d3f/scripts/prepare-bundle.ts) separately maintains bundle, skill, and native-binding release identifiers.

[The installer shipped with `v3.0.0`](https://github.com/vialactea-works/kepler/blob/v3.0.0/install.sh) already selects one GitHub release tag for its binary and sidecar downloads. It replaces the active binary and symlink before extracting the sidecar and running setup. Failed extraction or setup can therefore leave a partial installation. Extracting over the existing sidecar can retain stale files.

[Setup at design approval](https://github.com/vialactea-works/kepler/blob/df0cff3ee813582ade65b6afaf687e0796146d3f/packages/cli/src/cli/setup.service.ts) validates the bundle and preserves settings and user-modified resources. Its [recovery transaction](https://github.com/vialactea-works/kepler/blob/df0cff3ee813582ade65b6afaf687e0796146d3f/packages/cli/src/cli/setup-runtime.ts) covers sequential global-home writes, not binary activation or native host resources. At that time, native skill and agent checks remained `not_checked` under the [installation contract then in effect](https://github.com/vialactea-works/kepler/blob/df0cff3ee813582ade65b6afaf687e0796146d3f/docs/specs/v3/installation.md). This draft proposes replacing SH117's external native-installation ownership for the Pi target; it does not claim that the accepted contract or current code already changed.

The release workflow already provides source-commit manifests, hashes, attestations, and native verification jobs. Reuse these controls. Do not describe the current installer as resolving independent latest versions or discard the existing provenance work.

## Release identity and package

Root `package.json` is the authoritative release-version input. Derive or synchronize the Core/CLI package versions, compiled version constants, package metadata, release manifests, and release-note location from it. A resource-only change still produces a Kepler release, normally a patch. Historical fixtures, journal producer fields, and unrelated format counters are not version-bump targets.

Each target archive contains its binary and the complete resource tree. Keep the existing `bundle/skills`, templates, guidelines, and required skill references. Add Pi-native bindings for `kepler-architect`, `kepler-orchestrator`, `kepler-coder`, and `kepler-reviewer`; do not install the existing Claude Code definitions into Pi or silently convert them into slash-command prompts. Existing Claude resources need not be deleted to support Pi-only setup.

The release metadata binds the shared version, source commit, target, complete inventory, and exact content digests. Binary build metadata binds its version and resource content identity. A different build that claims the same version must not pass a matching-label check alone. Do not embed a manifest hash in a binary when that manifest includes the binary's own hash; use a separately computed resource identity and the final package inventory.

Production resource lookup uses the selected package generation, not an arbitrary checkout or a leftover compatible bundle. Resolve the executable's package root once per process. Explicit isolated development lookup remains available and fails closed when invalid.

The independently consumed Core library can retain its existing distribution channel at the same Kepler version. Publish the verified tarball rather than rebuilding it after verification. Registry publication and GitHub publication are separate effects; neither a shared version nor this archive makes them one atomic operation.

## Pi resource installation

Use Pi's existing local-package mechanism rather than create another host registry or invoke a separately versioned skill installer. The archive includes package metadata exposing the eleven portable skills through `pi.skills` and the four Pi-native agent definitions through `pi.subagents.agents`. `pi-subagents` documents this installed-package agent source. These are agent profiles, not Pi core `/` prompt templates.

`kepler setup` registers one Kepler-managed local resource source against the selected Pi configuration. The source follows the same managed package-generation selector used for the CLI and built-in assets; it is not a second copy updated on a separate schedule. The first implementation is user-scoped, consistent with current global setup. Resolve the Pi directory from an explicit override, then `PI_CODING_AGENT_DIR`, then Pi's default. Report the resolved destination before writes. Preserve unrelated settings and resource declarations.

Pi and the `pi-subagents` loader remain host prerequisites. If the configured Pi directory, supported local-package/agent-binding protocol, or required loader prerequisite cannot be resolved, setup fails before managed writes or activation. Report the missing/unsupported prerequisite and any staged-candidate-only effects; keep the previous active selection unchanged. Do not turn an absent or unknown host into a successful registration. Setup installs Kepler's resources, not Pi, the extension, models, credentials, or permissions. Report registration/file verification separately from actual agent execution. Do not mark a host workflow-ready merely because its package metadata was installed.

Same-name user/project skills, agent definitions, overrides, and old manager registrations can shadow package resources. Preflight the selected configuration and visible discovery scopes, report conflicts, and refuse an unqualified successful Kepler binding while a known conflict remains. Do not overwrite or disable custom definitions. This check does not inventory every project or prove what an existing session loaded.

Existing sessions can retain descriptions, instructions, and agent definitions. Complete active work on its starting compatible generation, then restart or reload according to the host's supported lifecycle before new work. Start a new session for the first unified release and later major transitions; reloading discovery does not remove old instructions already in model context. Package activation does not hot-replace those instructions. Preserve previous generations while they remain needed; do not claim a session pin that the host has not supplied.

## Setup and activation contract

Normal managed installation uses a fresh immutable generation and one active selector on the same filesystem. **Setup is the sole owner of committing that selector.** The bootstrap installer only fetches/stages a candidate and invokes its setup; it never performs a second promotion. Built-in templates and guidelines must follow this generation too. Leaving their current global in-place copies as an independent default would preserve a mismatch path. User settings and explicit custom assets remain separate preserved overrides.

1. Acquire the installation-scoped coordination claim shared by bootstrap installation and setup. This claim serializes cooperating Kepler operations only; it does not lock Pi, editors, or other package managers. Preserve ownership tokens and recovery evidence; do not take over a claim based on age.
2. Validate the target, complete archive inventory, required checksum entries, release/commit/resource identity, and supported Pi binding before activation. Reject absolute paths, traversal, escaping links, corruption, and missing required resources.
3. Preflight the selector, receipt, Pi configuration entry, and other required managed paths. Compare current ownership/content with the retained record. Do not adopt unknown files or modify the active selection during this phase.
4. Stage the complete generation and any necessary owned configuration changes. Keep a durable recovery record covering the package selector, receipt, and exact Pi configuration entry as well as Kepler global-home paths. Shared stable registration references must continue resolving through the old selector until activation.
5. Recheck preconditions and let setup commit the sole selector only after the required preparation succeeds. This pointer replacement is the activation boundary for package contents. It is not a transaction across arbitrary external files or loaded sessions.
6. Record the actual selection and verified registered resource identities. An interruption or failure after effects must report them and require reconciliation before retry; do not report failure as proof that nothing changed.

Normal version upgrades keep the stable Pi registration unchanged and do not rewrite shared Pi settings. Initial registration, explicit ownership transfer, or registration repair uses the concrete Pi adapter under the host's cooperating-writer protocol. The inspected [Pi 1.2.0 settings storage](https://raw.githubusercontent.com/earendil-works/pi/v1.2.0/packages/coding-agent/src/core/settings-manager.ts) exposes `SettingsStorage.withLock`; for an existing settings file, `FileSettingsStorage` acquires its native file lock before reading current content. Target that existing initialized-file protocol and the same configured path identity. A missing settings file is an initialization prerequisite failure, not permission for an unlocked first-creation path.

Fresh read, ownership comparison, and the narrow registration update must occur under that native coordination. Preserve the current unrelated entries; do not pass a cached whole file or stale package array to a setter. The adapter must reuse or demonstrably interoperate with the native protocol and retain backup/recovery evidence for its own write. If it cannot support the configured host protocol, fail before configuration writes or activation rather than fall back to an unlocked rewrite. Pin its supported host versions and test interoperability before implementation is accepted. This source inspection is not execution evidence for a Kepler adapter.

The host coordination boundary includes only writers that use that protocol. Manual editors or other tools that ignore it are not serialized; registration/repair requires those writers to be quiescent. Recheck the current configuration at the final write boundary. Preserve unrelated current entries; an externally changed owned entry or unresolvable drift aborts activation and requires reconciliation, not overwrite. A hash check followed by rename alone is not an atomic compare-and-swap. If drift becomes observable after effects, report those effects and retain recovery evidence without claiming successful binding or an automatic safe rollback.

A download, extraction, validation, or preflight failure leaves the previous active selection unchanged. If preparation changed a proved-owned configuration entry and then failed, keep the old selector and retain the journal/backups. Recovery may restore only the recorded unchanged owned state under its compare-and-update guard; uncertain or user-modified state requires a manual decision. Do not add blanket rollback, deletion, or `--force` authority.

The bootstrap installer stages the archive and invokes that candidate's setup. Setup performs the one activation commit; the installer only reports its result and does not promote anything afterward. Direct use of an unpacked candidate follows the same setup contract. Repeated setup of the same coherent generation is a no-op apart from reported checks. A registered source with stale/missing package contents is an error, not permission to fall back to another generation.

## Version-change workflow

The command names below are proposed, not shipped.

| Action | Proposed interface | Contract |
| --- | --- | --- |
| Prepare the initial unified line | `bun run release:prepare 3.0.0` | Prepare the one-time version/metadata transition and its bounded diff. Do not publish or alter project records. |
| Prepare normal changes | `bun run release:prepare patch`, `minor`, or `major` | Derive release metadata and resource manifests from one version input; prepare release-note structure; report stale outputs. |
| Check a candidate | `bun run release:check` | Verify version/schema consistency, complete resources, source/shipped parity, provenance, compatibility classification, and required repository gates. It does not publish. |
| Try local changes | `bun run dev:package` | Build a complete identifiable development generation with matching resources and disposable home/config/project data. Do not replace stable CLI or Pi registration. |

Retire the current `install-local` helper that links a development CLI directly into the stable `~/.local/bin/kepler` path without installing matching native resources. Replace that development path with the isolated candidate flow; it must not bypass setup or overwrite the stable selector. No preparation, development, or release command invokes the destructive `purge` helper.

A preparation command must not implement versioning with a repository-wide text replacement. Keep independent old-version fixtures and immutable history. Current-release assertions should compare actual built artifacts against the authoritative expected release, while compatibility fixtures keep their intentional older values.

Patch and minor releases preserve documented CLI inputs/outputs, configuration behavior, supported data, and skill/CLI contracts within major `3`. A changed CLI contract requires explicit review of affected skills, prompts, templates, and documentation. A version stamp or a skill-wording assertion is not evidence of semantic compatibility.

A major preparation derives the new artifact schema major but cannot approve its transition. Release remains blocked until reader/writer support, existing-data behavior, and any explicit migration procedure are defined and tested. Envelope, event, installation-record, and package-manifest formats keep their own counters; they are not artifact schema fields. No command renumbers existing artifacts or rewrites historical events automatically.

## Build and publication workflow

1. Prepare and review the version change, resources, compatibility classification, and release notes together. Freeze one source commit before constructing publication artifacts.
2. Use the lockfile and a pinned build toolchain. Build each complete platform archive, including its matching resources. Run the existing unit/integration/packed-Core gates and native installer/upgrade E2E against the exact archives selected for publication, outside the checkout. A separate rebuilt or cross-compiled binary is not execution evidence for those bytes.
3. Verify the complete manifest, archive checksums, source commit, target set, and existing attestations. Hash the actual staged files. No required component is selected from another latest endpoint or source checkout.
4. Publish immutable assets for the selected version only after the required checks pass. A partial publication is reconciled against the same source and bytes; do not delete/reuse a tag or replace contents under an existing version as an automatic retry.
5. Publish the same verified Core tarball if its registry channel is part of the release. An already-present registry version is not automatic success: verify it identifies the same tarball/source, or block and report the conflict. If this cannot be verified, do not overwrite or assume equivalence. Report/retry that independent effect without claiming cross-registry atomicity.

Keep intended targets Linux/macOS on x86_64/arm64. This design does not add manual target verification, publication as a test effect, live-agent certification, or a new smoke tier.

## Existing-installation transition

The unified installation receipt uses a new format version `2` for the common release identity and managed Pi registration. Keep an explicit read-only version-1 reader for old component release fields; preserve their original meanings rather than relabel them with the new release version. Version-1 digest records authorize only their recorded Kepler-managed templates/guidelines, never native files. Preserve the prior receipt/recovery snapshot during an authorized transition and write a version-2 receipt only for the verified new managed installation.

The first unified setup must recognize the existing flat `~/.kepler-dist` installation and version-1 record without treating either as proof of native-file ownership. Preserve the old installation and settings while preparing the new generation. Do not extract into the old sidecar or delete stale/unknown files to make validation pass.

Transfer from an external skill manager is a distinct, explicitly authorized ownership operation. Present the exact registered source, conflicting paths, retained content, and planned replacement. Do not silently adopt matching unrecorded files, remove another manager's registration, or leave two active owners updating the same names. If authority or provenance is missing, stop the affected takeover and keep the old selection. Normal managed upgrades must not require repeating this transfer.

Existing schema-3 Construction artifacts and supported journals remain unchanged and readable by the `3.x` line. Keep original artifact IDs/authors, attempts, approvals, producer versions, and material bindings. Legacy workbench artifacts/history keep their separate owner and are not converted into Construction authority. Package rollback is available only when the selected older program can safely consume the actual current project and installation state, including the receipt format. Restoring an executable does not reverse writes or make an old version understand the new receipt.

## Implementation boundaries

| Existing area | Proposed responsibility |
| --- | --- |
| Root and workspace version fields | One authored release version with derived package/runtime values and artifact-major consistency checks. |
| Development install helpers | Replace direct development-to-stable CLI linking with a complete isolated candidate; keep destructive cleanup outside version preparation. |
| `scripts/prepare-bundle.ts` | Synchronize resources and bind them to that release without independently maintained resource release IDs. |
| `scripts/check-versions.ts` | Check derived metadata, schema-major consistency, and complete package/resource identity. |
| `scripts/release-assets.ts` and release workflow | Construct, verify, attest, and publish the complete target archives and exact verified Core tarball. |
| `install.sh` | Fetch/stage one target archive, invoke candidate setup, and report its result; own no selector promotion. |
| `SetupService`, `SetupFiles`, and setup runtime | Own the sole selector commit, native-writer-coordinated Pi registration, explicit version-1/version-2 receipt handling, and recovery covering actual roots through injected filesystem/coordination boundaries. |
| Bundle-root and resource providers | Resolve the executing immutable generation; preserve explicit isolated development selection; avoid production checkout fallback. |
| Pi binding resources | Define the four roles in native `pi-subagents` format with their existing responsibilities and permissions, selected skills, and valid dispatch boundaries. |

Keep release validation and setup policy independent of shell, filesystem, and host configuration APIs. Reuse the existing parsing, digest, setup-plan, and injected filesystem patterns. One concrete Pi registration adapter is sufficient; do not build a generic host registry, dependency resolver, or workflow engine.

## Verification and finish criteria

Unit tests cover version derivation, schema-major rules, complete identity/inventory checks, setup planning, conflicts, no-op behavior, and failure outcomes through public contracts. Integration tests exercise real temporary filesystem registration, selector coordination, interrupted recovery, ownership transfer, and Pi/package discovery without model calls. Existing host precedence and shadowing rules must be exercised, not inferred from successful writes.

E2E tests install the exact target archive into an isolated home, run the standalone CLI outside the checkout, upgrade from a supported prior installation, check native resource registration/read-back, and prove that rejected candidates preserve the previous active selection and user files. Compatibility fixtures exercise supported older artifacts/journals and the intended CLI contract. Do not add brittle tests of skill wording or claim agent behavior from loader/file checks.

Before implementation, amend the approved installation/resource-ownership and versioning specifications through an explicit reviewed change. This document selects no runtime field schema, marks no code shipped, and grants no installation, release, commit, push, or migration authority. Detailed package metadata, the version-2 receipt schema and legacy-reader mapping, supported Pi/extension coordination protocol, and recovery state transitions must be fixed by the reviewed implementation plan rather than hidden in assumptions. That plan must demonstrate the supported host writer protocol before configuration-writing code is accepted.
