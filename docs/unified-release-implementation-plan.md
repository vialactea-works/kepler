# Unified release implementation plan

**Historical status:** This implementation plan was approved for the earlier unified-release and Pi-registration design. A later requester decision superseded its Kepler-owned installer, selector, Pi registration, and host-integration contracts. The current normative contract is [versioned home initialization](specs/v3/installation.md). This plan remains historical provenance and does not describe current implementation or authorize live-home changes, migration, publication, deployment, staging, or commit.

**Historical authority:** [Unified Kepler release and setup design](unified-release-design.md), approved in commit `df0cff3ee813582ade65b6afaf687e0796146d3f`, and the implementation decisions recorded below. Those earlier decisions do not override the later versioned-home boundary.

**Current evidence:** The source candidate removes the earlier installer, generation selector, receipt, development-package, and Pi-registration implementation and adds version-specific home initialization. Current checks and release readiness are recorded against the exact source and archive candidate. Published `v3.0.0` still contains the earlier implementation. A corrected release has not been prepared or published; previous release evidence does not certify changed source or archive bytes.

## 1. Outcome and boundaries

Build one versioned, complete release archive for each existing target: Linux and macOS on `x86_64` and `arm64`. The root package version is the one authored Kepler SemVer. Each archive contains a matching CLI and the complete resource set. `kepler setup` is the only owner of activation and of the packaged Pi registration. Setup must preserve project artifacts, schema-3 history, legacy workbench data, custom settings, unknown resources, and prior generations.

The initial unified release is proposed as `3.0.0`. It is not reserved until the release process checks immutable GitHub identities and the Core registry. The release must not rewrite historical producer versions, change valid schema-3 artifacts, or silently migrate any data.

This plan does not add a host registry, generic dependency resolver, workflow engine, agent-certification framework, smoke-test tier, automatic migration, automatic rollback, or generation garbage collection. The package rollback story must be documented against the actual receipt and data compatibility; restoring an executable alone is not a rollback guarantee.

## 2. Release and resource identity

### 2.1 One authored version

`package.json` at the repository root is the authored release version. Derive or check the Core and CLI package versions, compiled runtime values, resource-package metadata, archive and release manifests, and release-note path from it. Prepare `3.0.0` for the first unified release; this implementation version bump does not reserve a publication identity. Publication requires the immutable identity checks. Support `release:prepare patch|minor|major|<version>` and `release:check`. Product preparation accepts stable SemVer `M.m.p` with non-negative safe integer components and no leading zero, prerelease, or build suffix. Development identity uses the separate package source-kind/content digest. Preparation reads the current root version, computes `patch` as `M.m.(p+1)`, `minor` as `M.(m+1).0`, and `major` as `(M+1).0.0`; an explicit version selects that exact stable target. Reject malformed, overflowing, or lower targets before writes. An equal target refreshes stale derived values and otherwise leaves bytes unchanged.

The preparation command writes the selected target into root `package.json.version`; the root remains the sole authored input for later build/check operations. Its enumerated derived outputs are `packages/core/package.json.version`, `packages/cli/package.json.version`, `src/index.ts`'s exported `VERSION`, `packages/cli/src/cli/version.ts`'s exported `CLI_RELEASE`, `bundle/pi-package.json.version`, and resource-manifest-v2 `bundle/manifest.json.kepler_release` plus recomputed inventory/digest. The generated `bundle/pi-package.json` descriptor is copied byte-for-byte to each final generation's root `package.json`, with Pi resource paths relative to that generation root. Build/archive/release manifests derive their version during a new build; preparation never relabels existing archives. Create `docs/releases/<target>.md` from the release-note skeleton only when absent; preserve an existing note. Precompute and validate all target changes before writing. Report exact partial paths on an I/O failure; do not reset Git, discard edits, or claim cross-file atomicity. Preserve unrelated package fields, historical fixtures/notes/events, and all stored schema values. A prepared major remains release-blocked until F7's explicit data-support gate passes. `release:check` validates a candidate's internal consistency and remains usable for dirty development input; it must report that such a candidate is not frozen production input. A separate release-workflow gate requires a clean frozen source commit before production assets are built. Exercise that production predicate in an isolated committed fixture when needed; do not create an unauthorized commit or claim that commit `df0cff3` contains later implementation bytes. No version command uses repository-wide replacement, rewrites histories or fixtures, installs, publishes, commits, or calls destructive `purge`.

Keep independent counters independent: artifact `schema_version`, CLI envelope version, event version, installation receipt format, and bundle/resource-manifest format are not SemVer fields. Artifact schema equals the Kepler release major. The 3.x line preserves supported schema-3 artifacts and journals. A major release remains blocked until current-data read/write behavior, compatibility tests, and any explicit migration policy are defined and accepted. A version-preparation command cannot grant that approval.

### 2.2 Resource manifest and Pi profiles

Replace the independently versioned bundle, skill, and Claude-binding releases with a version-2 complete resource manifest. It binds one `kepler_release`, a canonical resource digest, and a sorted digest inventory of every packaged template, guideline, skill, Pi profile, and resource-package descriptor. The inventory declares the eleven existing skills and four Pi roles. Do not remove or translate the existing Claude Code definitions; Pi setup installs only Pi-native resources.

The Pi package descriptor will use `pi.skills` for the eleven skill trees and `pi.subagents.agents` for four native agent profiles. The definitions belong at `bundle/agents/pi/v1/kepler-architect.md`, `kepler-orchestrator.md`, `kepler-coder.md`, and `kepler-reviewer.md`. The roles keep their current Kepler duties. Only the orchestrator receives the `subagent` tool. The reviewer remains an independent non-author and has no dedicated `write`, `edit`, or dispatch tool. It retains the existing review role's Bash permission for inspection and assigned checks. Bash can mutate files, so this is an assignment and prompt policy, not a filesystem sandbox or capability-enforced no-write guarantee. Verification may create its owned test outputs; the role may not author or modify the reviewed implementation. Preserve the existing role permissions rather than add a new shell sandbox. Resource discovery proves availability, not model behavior, credentials, permissions, or session reload.

### 2.3 Build and provenance identities

Use separate content identities to avoid a manifest/binary checksum cycle:

- Production source records the full Git commit and a canonical source-content digest. Production packaging requires a clean source tree and source identity matching the frozen commit.
- A local development build records `development` plus a digest of its actual dirty/staged/untracked authored inputs. It must not claim that HEAD alone identifies those bytes. A local E2E candidate built from an uncommitted worktree is development evidence only; retain that exact tested archive and digest, and never rebuild different bytes as if they were the tested or frozen publication artifact.
- The resource digest covers a canonical manifest payload and complete resource inventory, excluding its own digest field and the executable. The binary embeds the release, source identity, and resource digest; runtime resolution compares the embedded digest to the selected generation.
- Final target inventory includes the actual executable and all resources. The external release manifest, checksums, and attestations bind the final staged archive bytes, target, frozen source commit, workflow run, and attempt.

Name each complete archive `kepler-${version}-${os}-${arch}.tar.gz`, using the release SemVer and existing target labels. For example: `kepler-3.0.0-linux-x64.tar.gz`, `kepler-3.0.0-linux-arm64.tar.gz`, `kepler-3.0.0-darwin-x64.tar.gz`, and `kepler-3.0.0-darwin-arm64.tar.gz`. Use tag `v${version}`. One shared naming function and strict expected-asset set must serve the archive builder, bootstrap installer, tests, and CI. A filename is not identity authority; validate embedded metadata and digests too. Do not select a separate latest bundle. Keep the Core tarball as a distinct publication effect at the same version. Publish the exact verified tarball; an existing registry version is reusable only after exact byte/source reconciliation.

## 3. Installation record and transition

### 3.1 Receipt format 2

Keep the receipt at `<Kepler global home>/installation.json`. Format 2 is a closed schema, independent of artifact schema and resource-manifest format. It records:

```text
format_version: 2
generation_id: UUIDv4
release: {
  version: SemVer,
  source: { commit: full Git SHA, content_digest: SHA-256, kind: production | development },
  target: { os, arch }
}
resources: { manifest_digest: SHA-256, files: normalized relative path -> SHA-256 }
selector: { path: absolute path, generation_id: generation_id }
pi_binding: {
  host: { id: pi, release: detected version, check: matches | unsupported | unknown },
  loader: { id: pi-subagents, release: detected version, check: matches | unsupported | unknown },
  scope: user,
  agent_directory: absolute resolved path,
  settings_path: exact native-coordination path,
  package_source: stable local package-root path,
  registration: { entry_digest: SHA-256, check: ResourceCheck },
  skills: [{ id, digest, check: ResourceCheck } x 11],
  roles: [{ role, agent_id, digest, check: ResourceCheck } x 4]
}
compatibility: { check: compatible | unsupported | unknown }
```

The receipt reports detected files, registration, and declared compatibility only. It does not certify model execution, credentials, permissions, active-session reload, or workflow readiness. Write it only after setup reads back and verifies the selected generation, stable command path, and required Pi registration.

### 3.2 Read-only format-1 handling

Add a tagged format-1 reader. Never relabel its values as format 2 or rewrite it before a successful format-2 activation. Keep original bytes in recovery evidence. Preserve the original meanings: `generation_id` is historical; `cli_release` is not the unified version; `bundle_release` is not the new resource package identity; old skill/host/role checks are not Pi evidence. Old installed-file digests authorize only the exact recorded Kepler templates and guidelines. They do not prove ownership of native files, Pi settings, registrations, selectors, links, or unknown resources.

Treat the old flat `~/.kepler-dist/bin/kepler`, old sidecar, and format-1 receipt as read-only transition inputs. Keep them and all project data. Do not overlay the old sidecar or adopt native resources. Replace a launcher symlink only when it exactly matches the known old Kepler link; a regular file or any other symlink is a conflict.

## 4. Setup roots and activation protocol

### 4.1 Owned roots and paths

Keep the Kepler global home (receipt, existing settings, preserved custom assets), distribution root (staged and immutable generations, selector, stable executable), Pi user agent directory and initialized `settings.json`, and read-only current-project discovery scope distinct. Journal exact preconditions, candidate identity, owner token, preimage bytes/digests, affected paths, prior selector and Pi package entry across those roots. Unknown paths are never adopted, edited, or deleted.

Use these concrete paths, all beneath the distribution filesystem except the stable command entry:

- Immutable release candidates: `~/.kepler-dist/generations/<generation-id>/`, each containing `bin/kepler`, the complete resource tree, and its package metadata.
- One generation selector: `~/.kepler-dist/current`, a Kepler-owned symlink to either `generations/bootstrap` or one complete immutable release generation. Do not create a directory at `current` and later try to replace a non-empty directory with a symlink.
- Stable Pi local-package source: the literal path `~/.kepler-dist/current`, registered once in Pi's `packages` setting. On first install, `generations/bootstrap/` is a valid minimal package root with empty `skills/` and Pi-agent resource roots, and package metadata that declares no resources. Create it, then create `current -> generations/bootstrap`, before adding the Pi entry. The package-source path therefore exists and resolves throughout first registration; the bootstrap generation is not a release and is not workflow-ready.
- Stable launcher: `~/.local/bin/kepler -> ~/.kepler-dist/current/bin/kepler`. On first install, leave the launcher absent until the candidate selector is committed. During a legacy transition, keep the old launcher until candidate activation, and replace it only when it is the exact known Kepler symlink to `~/.kepler-dist/bin/kepler`. A regular file or any other link is a conflict.

The package source and launcher both follow the one `current` symlink. The bootstrap package root is replaced by atomically replacing that selector symlink, not by replacing a populated package directory or independently promoting a second metadata pointer. First-install states are `absent` (before setup), `bootstrap` (valid empty selected package; no new stable launcher), then `active:<generation-id>` (candidate resources and CLI selected; stable launcher may be created or safely updated). Upgrade states are `active:<prior-id>` then `active:<candidate-id>`; no bootstrap or Pi settings rewrite is needed. Any other target, dangling link, selector/receipt disagreement, or unowned launcher is a held conflict.

Journal creation of the bootstrap generation, initial selector, stable package path, Pi registration preimage/effect, candidate, selector replacement, and launcher preimage/effect. A failure before candidate activation keeps the previous selector (`bootstrap` on first install or the prior release on upgrade) and retains all exact recovery evidence. Prove that Pi 1.2.0 and pi-subagents 0.76.1 can load both the valid empty bootstrap source and the active package by the same registered path. Resolve the running process's package root once. Production has no arbitrary checkout or cwd fallback. An explicit development package uses isolated roots and fails closed when incomplete.

### 4.2 Sole activation owner and state order

Setup alone commits the selector and creates/replaces the known stable Kepler command symlink. The bootstrap installer downloads, verifies, and safely stages one archive, invokes that candidate's setup, and reports its result. It never promotes the selector or changes the stable command after setup. Direct setup of an unpacked candidate follows the same state machine.

Use one Kepler-only owner-token coordination claim shared by bootstrap and setup. Do not take over a claim by age. Its release and process-exit cleanup must confirm that the claim is still the exact one acquired by the operation; never remove an observed replacement holder. Pi settings use Pi's native settings lock; Kepler's claim does not serialize editors or other host tools. Writers that ignore Pi's lock must be quiescent during registration/transfer. A fresh final read is required; hash-then-rename alone is not compare-and-swap.

Perform setup in this order:

1. Acquire the Kepler claim.
2. Validate the target archive, complete inventory, digests, embedded version/source/resource identities, and Pi prerequisites.
3. Read the format-1 or format-2 receipt, selector, launcher, Pi scope and visible conflicts. Resolve ownership and any exact transfer plan without activation.
4. Stage a complete immutable candidate and durable recovery preimages/journal. Do not select it. On first install only, also create the valid empty bootstrap package generation and atomically set `current -> generations/bootstrap` before registration; journal both effects. Do not create a new stable launcher in this state.
5. For first registration, explicit transfer, or repair only, acquire the Pi-native settings lock, read current settings while locked, verify the frozen preconditions, and update only the exact Kepler package entry. The first registration points to the already-resolving `~/.kepler-dist/current` bootstrap package path. A routine upgrade must not rewrite settings.
6. Recheck the selector, receipt, registration, and filesystem conditions.
7. Atomically replace the one selector. Update the stable launcher only if absent or the exact known-owned prior Kepler link. Verify selected resources and registration.
8. Write and read back receipt v2; mark the journal committed. Clean only operation-owned temporary staging. Keep old immutable generations; no safe session-pin or garbage-collection contract exists.

A pre-activation failure leaves the previous selector unchanged. A failure after an external effect retains recovery evidence and reports each known effect; failure does not prove rollback. Restore only an unchanged, proved-owned prior value under the relevant guard. Drift or user edits require manual reconciliation. Do not add blanket rollback, `--force`, or generation deletion.

### 4.3 Supported modes

- **First install:** require absent selector and receipt, stage the complete candidate, create and select the valid empty bootstrap package, register that existing `current` path under the Pi lock, then replace the bootstrap selector with the candidate and create the stable launcher. The bootstrap state is journaled and is not a release or workflow-ready installation.
- **Legacy transition:** require an absent selector, a valid read-only v1 receipt, the preserved flat installation, and an absent or exact known legacy Kepler launcher. Stage the new generation, journal/select the empty bootstrap package, and follow the guarded registration/activation sequence. The old receipt and flat paths remain untouched until the new receipt commit; v1 native checks provide no transfer authority. Conflicting native resources still require the explicit digest-bound transfer.
- **Upgrade:** require a valid selected generation and matching receipt; preserve old generation and stable registration; switch the one selector.
- **No-op:** coherent same-generation setup performs read-only checks and leaves stable registration unchanged.
- **Repair:** reconstruct only from a fully verified selected generation plus matching known registration/receipt and explicit ownership evidence.
- **Held conflict:** missing/corrupt selected contents, selector/receipt disagreement, unknown registration, unresolved journal, or unowned launcher is not permission to fall back or repair. Reconcile first.

## 5. Pi prerequisites and native ownership transfer

Resolve the user agent directory in this order: `KEPLER_PI_AGENT_DIR`, `PI_CODING_AGENT_DIR`, then `~/.pi/agent`. Report the resolved target before writes. Require the configured directory and initialized `settings.json` to exist. Detect the actual supported Pi CLI and `pi-subagents` loader from the resolved installation and fail before managed writes on missing, unknown, or untested versions. Initial support evidence targets Pi 1.2.0 and pi-subagents 0.76.1. Setup does not install Pi, the extension, models, credentials, or permissions.

For Pi 1.2.0, registration must interoperate with the native settings protocol for an existing settings file, using pinned `proper-lockfile` 4.1.2 and the same settings-path identity. The file is a prerequisite because Pi's missing-file path invokes its callback before taking its write lock. Pin the same dependency in the CLI. Do not assume that `lockSync(settingsPath, { realpath: false })` prevents takeover: the [pinned library source](https://raw.githubusercontent.com/moxystudio/node-proper-lockfile/v4.1.2/lib/lockfile.js) defines stale-lock recovery with a 10-second default, and `lockSync` can apply that recovery. A no-takeover configuration must be selected from and tested against the pinned library's public behavior. `stale: Infinity` with an explicit finite heartbeat interval is a candidate only; do not claim it works until tests prove the actual library preserves old locks. Do not assume `stale: 0` disables recovery; the library normalizes it to a finite minimum.

Tests must show that an aged holder, a fresh holder, and an observed replacement/unknown holder remain untouched. Verify normal release and process-exit cleanup cannot remove another holder's lock. If the pinned API cannot provide these ownership-safe outcomes while interoperating with Pi, stop before configuration-writing implementation and resolve a narrow safe adapter rather than inventing a wrapper contract. Do not manually reap locks, remove another actor's lock, or add a generic lock manager. The host protocol is cooperative and same-user; uncoordinated editors must be quiescent and drift must still abort. Under the lock, perform a fresh read, compare the exact Kepler entry and frozen plan, change only that entry, preserve unrelated JSON fields and packages, and read back. Never use a cached whole object or stale `SettingsManager.setPackages()` array.

The experiment report demonstrates a real Pi writer and lock harness, not Kepler adapter acceptance. Integration acceptance must exercise the actual pinned Pi binary/settings manager with the actual Kepler adapter, then the real Pi package/skill/agent loader, offline and without model calls.

Preflight the effective user configuration and the current invocation's visible project discovery scope. Check settings package entries, direct resource paths, `subagents.agentOverrides`, and effective same-name skill/agent definitions. Pi user/project precedence can shadow packaged resources. Report exact collisions and stop before activation; never overwrite a custom profile or claim every future project has been checked. A new session is required for first install and later major transitions; registration does not rewrite already-loaded instructions.

**Transfer confirmation:** if preflight finds a prior native owner, ordinary `kepler setup` emits the exact read-only proposal and its canonical SHA-256 digest. It performs neither the ownership transfer nor dependent candidate activation. A safe no-conflict first registration, ordinary upgrade/no-op, or safe repair still uses ordinary setup. The sole consent interface is `kepler setup --accept-native-transfer <digest>`. It authorizes only the unchanged frozen plan. The digest binds candidate identity, resolved Pi/config scope, exact old registration/source, paths, operations, content and ownership digests. Changed inputs invalidate it. The flag cannot authorize an unknown, modified, custom, or mixed external resource, blanket package removal, or deletion. Bootstrap never supplies consent; it preserves the candidate and reports the follow-up command/digest. Keep ordinary CLI JSON success/failure envelope rules; use the existing failure `details` object for plan evidence when setup cannot proceed without consent. Do not create a separate transfer command family.

## 6. Test and evidence strategy

Use the repository's Bun/Vitest pyramid and keep tests at the lowest level that proves each contract. Unit tests cover parsing, identities, version preparation, inventory, plan/status, conflict, and failure results. Integration tests use disposable filesystem roots, real Git where needed, the native Pi settings writer, and actual package/resource discovery without model calls. E2E installs the exact archive bytes outside the checkout and checks the resulting executable, selector, receipt, Pi registration, preservation, and recovery. Keep the exact tested archive and its digest as evidence; do not rebuild a different artifact and claim it was the tested candidate. Every test owns and cleans only its temporary root and proves unrelated sentinels remain unchanged.

Do not add tests that infer agent behavior from Markdown wording or installed file presence. Do not run live-agent/model certification, host installation, release/publication, smoke/performance tests, or additional manual Linux arm64/macOS execution. The parent may run applicable current-host gates. Retain all four existing native CI target jobs and report their results only after those jobs actually pass; cross-compilation is not execution evidence. The parent runs the repository's broad gates after the implementation candidate is integrated.

## 7. Implementation task ledger

Every task uses **Red → Green → Refactor → Verify**. Red adds a public-behavior check and records the intended pre-change failure before production edits. Green makes the narrowest change and reruns that check. Refactor reviews the behavior and boundaries without changing them; if no cleanup is needed, record why. Verify reruns the focused tests and obtains fresh diagnostics for changed files and dependents. A wrong-reason failure, review defect, or failed Verify returns to correction in the same task. The parent owns the broad final gates. No task implies commit or publication.

| ID | Task / bounded outcome | Depends on | Red / Green / Refactor / Verify evidence |
|---|---|---|---|
| **F1** | Amend canonical installation, setup, resource-owner, version, index, and decision records to match the approved design while preserving historical SH114/SH117 text and marking implementation pending. | — | Red: checklist every current contradiction against design. Green: amend canonical specs and provenance only. Refactor: check scoped links and read touched sections in full. Verify: compare against design sections for versioning, Pi ownership, setup, transfer, and transition; no wording-only behavior test. |
| **F2** | Introduce resource-manifest v2, canonical digest and complete sorted inventory for all resources; retain v1 only as legacy input. | F1 | Red: tests for v2 inventory and malformed/unsafe inputs fail under current parser. Green: strict parser/generator. Refactor: share sort/hash rules without changing v1 meaning. Verify: focused manifest/setup tests and deterministic generation in a disposable copy. |
| **F3** | Add four native Pi role profiles and package metadata for 11 skills/4 roles; leave Claude files unchanged. | F2 | Red: inventory/loader tests show Pi resources absent. Green: create native definitions and descriptor. Refactor: check exact duties, tool boundaries, and skill references. Verify: resource tests; defer actual loader proof to S4/D4. |
| **F4** | Make root SemVer authoritative; add `release:prepare` and candidate-consistency `release:check`; preserve old fixtures and independent counters. | F1, F2 | Red: tests for `3.0.0`, patch/minor/major, invalid input, stale derived values, dirty-development checks, production readiness reporting, and no-rewrite boundary. Green: version derivation/scripts. Refactor: centralize derivation. Verify: focused version and release-asset tests plus `bun run check:version`; production cleanliness is tested with a disposable committed fixture, not by committing this worktree. |
| **F5** | Add honest production source and development content identity and compile resource identity without a self-hash cycle. | F4 | Red: fixtures distinguish staged, dirty, untracked, generated-only, and clean sources. Green: canonical digest and build metadata. Refactor: ensure authored inputs are not excluded. Verify: identity and CLI-version tests; production source checks use isolated committed fixtures, ordinary checks remain usable on this uncommitted implementation, and no result claims that HEAD alone identifies dirty bytes. |
| **F6** | Define receipt v2 closed schema and an explicit tagged, read-only v1 reader using §3 mapping. | F1, F2, F5 | Red: valid/invalid v2 and genuine v1 fixtures expose current reader gap. Green: schema/reader/writer. Refactor: retain strict duplicate-key, closed-field, path, and v1 validation. Verify: tests prove v1 host facts never imply Pi ownership. |
| **F7** | Gate schema-major release compatibility on tested current-data support; keep schema 3 through 3.x. | F4, F5, F6 | Red: a major cannot pass from SemVer alone; patch/minor retain schema 3. Green: explicit support evidence gate. Refactor: keep artifact, event, envelope, receipt, and manifest counters distinct. Verify: focused version, artifact, envelope, and history tests; `bun run check:version`. |
| **S1** | Resolve one immutable generation root per process, bind built-in resources and stable Pi package paths to the selector, and isolate dev lookup. | F2, F5 | Red: tests fail for missing/corrupt selector and currently allowed checkout fallback. Green: generation resolver. Refactor: keep injected path seams. Verify: resolver and digest tests. |
| **S2** | Add multi-root Kepler claim, immutable staging, selector transaction, exact preimage journal, and interruption reporting. | F6, S1 | Red: tests inject contention and failures in each root; prior selector remains unchanged pre-activation. Green: claims and staged selector adapter. Refactor: explicit roots; distinguish missing/file/symlink/directory/special. Verify: transaction plus existing preservation tests. |
| **S3** | Add read-only Pi host/version/settings prerequisite and user/project shadow preflight. | F3, S1 | Red: cases for missing/unknown host, loader, settings, overrides, and collisions. Green: exact-path preflight. Refactor: use resolved host and actual loader rather than guessed imports; bound scan to visible scope. Verify: unit and read-only real loader probe. |
| **S4** | Implement narrow Pi registration under pinned native settings lock and prove two-way interoperability. | S3 | Red: use the actual library to expose default stale reaping; test contention, missing settings, stale read, lost unrelated setting, aged/fresh/replacement and unknown holders, plus exit cleanup. Green: implement only after a tested no-age-takeover option preserves old locks with the pinned library; then use exact path identity and locked fresh read/update/read-back. Refactor: remove stale setters/snapshots and any lock cleanup. Verify: actual Pi 1.2.0 `--offline` settings manager plus Kepler adapter preserves unrelated settings/packages; aged, fresh, replacement, and unknown locks are never removed by acquire, release, or process exit; no model/session/network. Block configuration-writing implementation if this cannot be proved. |
| **S5** | Implement setup plan/modes for first install, v1/flat upgrade, v2 upgrade, no-op, and safe repair. | F6, S1, S2, S3, S4 | Red: public tests expose unsupported modes and unknown-state fallback. Green: plan then guarded effects. Refactor: domain plan separated from filesystem/host effects. Verify: fixtures prove legacy and project data/custom files remain byte-preserved; v1 host data never transfers ownership. |
| **S6** | Implement digest-bound explicit Pi native transfer interface. | S4, S5 | Red: ordinary setup returns exact plan/digest with no transfer or activation; wrong/stale digest and unsafe conflicts fail. Green: canonical plan digest and `--accept-native-transfer`. Refactor: canonical serialization binds exact candidate/scope/source/path/content/operations. Verify: transfer, ordinary no-conflict, preserved unrelated resources, modified/unknown/mixed owner cases. |
| **S7** | Complete cross-root failure/recovery states and partial-effect reporting. | S2, S5, S6 | Red: inject interruption before/after Pi update, selector, and receipt; inspect evidence. Green: recovery guard and result. Refactor: no blanket rollback or delete. Verify: exact-ownership restoration only; drift/user edits remain blocked; unresolved journal prevents retry. |
| **D1** | Produce and verify one complete archive per target with exact final inventory and provenance. | F2, F3, F4, F5, F7, S1 | Red: current split assets or mixed identities incorrectly pass fixture. Green: deterministic archive and strict target manifest. Refactor: distinguish resource digest from final archive digest; retain attestations. Verify: archive fixtures enumerate every resource and executable; verify exact four-target set. |
| **D2** | Make bootstrap installer stage one verified archive and invoke candidate setup, without activation. | S2, S5, S7, D1 | Red: tamper/traversal/interruption cases prove current early active writes. Green: safe staging and candidate invocation. Refactor: unique temp roots and exact cleanup only. Verify: focused installer E2E plus shell lint in CI; assert setup alone commits selector. |
| **D3** | Add isolated `dev:package`; retire `install-local` stable-link behavior; keep `purge` out of release flow. | F4, F5, S1, D1 | Red: demonstrate a dirty build cannot be identified by HEAD and current helper would replace stable path. Green: disposable development package/home/config/project. Refactor: forbid live HOME, Pi config and `.kepler` defaults. Verify: sentinel tests show stable paths unchanged and temp roots cleaned. |
| **D4** | Run first install, upgrade, no-op, rejected candidate, v1 transition and transfer against exact versioned archive bytes and actual Pi loaders. | D1, D2, S3, S4, S5, S6, S7 | Red: existing E2E rebuilds separate binary/bundle rather than selected archive. Green: isolated exact-archive harness outside checkout. Refactor: test owns one temp root and proves user-data preservation. Verify: retain the exact tested local candidate and its digest; show the executed hash equals that digest. For dirty local source, label the bytes development-only and do not claim frozen publication provenance. Pi and pi-subagents discover all 11 skills/four roles; no model/session call. Run each target in its existing native CI job; local verification is limited to the parent-approved applicable host, with no additional manual target execution. |
| **D5** | Gate release on frozen-source native archive checks and publish only verified GitHub assets/Core tarball. | F4, F5, F6, F7, D1, D2, D4 | Red: fixtures expose non-native proof and current existing-Core-version shortcut. Green: native matrix produces the exact artifacts that E2E and publication consume; exact Core tarball reconciliation. Refactor: preserve provenance; never replace immutable mismatches. Verify: workflow/script tests and all four existing native matrix jobs; report only jobs that actually pass. Do not run extra manual target execution or publish. |
| **D6** | Align user and release documentation to executable behavior after implementation. | F1, S5, S6, S7, D2, D5 | Red: enumerate claims contradicted by final behavior. Green: update current docs and release note. Refactor: distinguish approved spec, shipped runtime, native execution and cross-compilation. Verify: links and claims reviewed against implementation and exact archive tests; no agent-certification claims. |

### Distribution handoff and parent verification barrier

At the end of the completed D1–D6 distribution/wiring slice, after focused checks and the complete implementation/documentation handoff, the writer must write a bounded private handoff and call `contact_supervisor(reason: need_decision)` for the invoking parent. Include completed tasks, exact changed paths/source hashes, candidate archive path/digest, actual check logs, and unresolved failures. Keep source frozen while the parent inspects the diff and runs the broad verification gates. Do not return and release the workflow to fresh review or a correction writer until the parent accepts that frozen candidate. Parent-discovered failures return to the same writer; correct them, capture new source/artifact identities, and repeat the barrier. Apply the same frozen-source verification rule after review corrections before final delivery. Do not invoke this barrier for unfinished foundation/setup slices or represent a partial implementation as complete. This gate authorizes neither staging nor commit, push, publication, or host installation.

### Dependency order

```text
F1 -> F2 -> F3
F1,F2 -> F4 -> F5
F1,F2,F5 -> F6
F4,F5,F6 -> F7
F2,F5 -> S1
F6,S1 -> S2
F3,S1 -> S3 -> S4
F6,S1,S2,S3,S4 -> S5 -> S6
S2,S5,S6 -> S7
F2,F3,F4,F5,F7,S1 -> D1
S2,S5,S7,D1 -> D2
F4,F5,S1,D1 -> D3
D1,D2,S3,S4,S5,S6,S7 -> D4
F4,F5,F6,F7,D1,D2,D4 -> D5
F1,S5,S6,S7,D2,D5 -> D6
```

F7 is a direct D1 prerequisite because archive construction must reject a schema-major candidate without tested data support; the D1 table row and dependency graph both include F7. Keep one writer per checkout. Coordinate shared manifest/receipt/setup/archive seams before parallel task assignment. The parent owns implementation orchestration, integration, and broad verification.

## 8. Traceability to the approved design

| Approved design contract | Plan sections/tasks | Required acceptance evidence |
|---|---|---|
| One version, source/resource identity, archive identity, no self-hash cycle | §§2.1–2.3; F2, F4–F7, D1, D3, D5 | Derived metadata agrees; dirty build identity matches bytes; final assets and attestations hash exact archive bytes. |
| Four complete target archives and verified Core effect | §2.3; D1, D4, D5 | Exact four target set; each native job executes its uploaded archive; Core tarball bytes reconciled before publication. |
| Eleven skills/four Pi agents with host-owned loading and no behavior certification | §2.2, §5; F3, S3, S4, D4 | Real Pi loader sees all packaged resources; no agent/model claim from file presence. |
| Receipt v2 and read-only v1/flat transition | §3; F6, S5, S7, D4 | Genuine v1 fixtures preserve old meanings; v2 validation strict; no legacy/native ownership inference. |
| Selector-only activation, multi-root recovery, no stale fallback | §4; S1, S2, S5, S7, D2, D4 | Selector unchanged on preflight failure; exact journaled effects on interruption; unknown state held. |
| Native settings lock, actual host/package protocol, shadow conflicts | §5; S3, S4, D4 | Real host adapter and loader interoperate offline; unrelated settings survive; contention/no-write and visible shadow cases verified. |
| Explicit frozen transfer authority | §5; F1, S6, S7, D4 | Plan-only invocation writes nothing; exact unchanged digest authorizes only preserved safe operations; stale or unsafe plan blocks. |
| Isolated development and no stable-link shortcut | §§2.3, 4.1; F5, S1, D3 | Dirty content identity is honest; isolated test changes no stable home/config/project data. |
| Preserve schema-3 data and independent format counters | §§2.1, 3.2; F6, F7, S5, D4, D5 | 3.x preserves supported artifacts/journals; no historical version rewrite or automatic migration. |

## 9. Decision record and completion boundary

The approved design was explicit that native ownership transfer needed an implementation plan. The supervisor resolved its CLI consent flow: ordinary setup returns a read-only exact transfer plan and digest; `kepler setup --accept-native-transfer <digest>` authorizes only that frozen plan. This resolution is limited to safe, inspectable, preserved ownership. It adds no authority over unknown/custom/mixed resources and does not permit bootstrap consent.

Local implementation is complete only after every task's applicable current-host verification evidence is reconciled and the independent parent review accepts the final diff. Production publication remains gated on all four existing target-native CI jobs passing against their exact selected archives. Unrun foreign-target jobs remain unverified; they are not a request for additional manual target execution. This plan records no executed tests, installation, migration, release, or runtime completion.
