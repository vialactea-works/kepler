# Capability: cli-distribution

Builds, publishes, and installs Hamilton as a prebuilt binary, and lets that binary locate its
bundled assets (agents, skills, workflows, templates) without a source checkout.

## ADDED Requirements

### Requirement: Version-triggered release

The system SHALL publish a new GitHub Release whenever the `version` field in `package.json`
changes on the default branch.

- Priority: must
- Rationale: ties releases to an explicit, reviewable version bump instead of a manual dispatch
  step or every merge to main.

#### Scenario: Version bump on main

- WHEN a commit lands on `main` whose `package.json` version differs from the most recent
  published release's version
- THEN the workflow creates a git tag `v<version>`, builds all release artifacts, and publishes
  a GitHub Release tagged `v<version>` with those artifacts attached

#### Scenario: No version change

- WHEN a commit lands on `main` whose `package.json` version matches the most recent published
  release's version
- THEN the workflow does not create a tag, build artifacts, or publish a release

#### Scenario: Duplicate tag

- WHEN the computed tag `v<version>` already exists (e.g. a retried run after a partial failure)
- THEN the workflow fails with a clear error instead of overwriting the existing tag or release

### Requirement: Cross-platform binary builds

The system SHALL build a standalone `hamilton` executable for each of macOS x64, macOS arm64,
Linux x64, and Linux arm64 as part of every release.

- Priority: must
- Rationale: covers the OS/arch combinations the maintainers use and expect contributors/users
  to run, without the cost of per-OS CI runners.

#### Scenario: Successful build

- WHEN the release workflow runs
- THEN it produces four binaries, one per target, each named to identify its OS and
  architecture (e.g. `hamilton-darwin-arm64`, `hamilton-linux-x64`)

#### Scenario: Binary runs without Bun installed

- WHEN a produced binary is copied to a machine with no `bun`, `node`, or Hamilton source
  checkout present, made executable, and run
- THEN it starts and executes commands normally (the Bun runtime is embedded in the binary)

### Requirement: Published bundle archive

The system SHALL package the repository's `bundle/` directory into a single, platform-independent
archive and attach it to every release alongside the binaries.

- Priority: must
- Rationale: `hamilton setup` needs these assets at runtime; a compiled binary has no source
  checkout to read them from, so they ship as a separate, versioned artifact instead.

#### Scenario: Bundle archive contents

- WHEN the release workflow packages the bundle archive
- THEN the archive's contents match the repository's `bundle/` directory at the tagged commit,
  unpacked to reproduce the same directory structure

### Requirement: Release checksums

The system SHALL publish a checksums file covering every binary and the bundle archive in a
release.

- Priority: must
- Rationale: lets `install.sh` verify a download before installing and executing it.

#### Scenario: Checksum coverage

- WHEN a release is published
- THEN it includes a checksums file listing a SHA-256 digest for every binary asset and the
  bundle archive in that release

### Requirement: Binary-relative asset resolution

The system SHALL locate its bundled assets (agents, skills, guidelines, hooks, templates,
workflows) relative to the running executable's real on-disk location when no source checkout
is present, in addition to the existing source-checkout-relative resolution.

- Priority: must
- Rationale: the existing resolution walks up from the script file's location, which only
  exists in a source checkout; a compiled single-file binary needs a different, equally
  reliable way to find assets installed alongside it.

#### Scenario: Running from a source checkout

- WHEN `hamilton` runs from a source checkout (`bun run` or the `dist/cli/main.js` build)
- THEN it resolves bundled assets the same way it does today, from the checkout's `bundle/`
  directory

#### Scenario: Running as an installed binary

- WHEN `hamilton` runs as a compiled binary installed with its bundle archive unpacked into a
  sibling directory (the layout `install.sh` produces)
- THEN it resolves bundled assets from that sibling directory, without requiring any
  environment variable or flag

#### Scenario: Assets missing in both locations

- WHEN neither a source-checkout `bundle/` directory nor a sibling `bundle/` directory next to
  the executable exists
- THEN `hamilton setup` fails with an error naming the paths it checked, instead of silently
  skipping asset installation

### Requirement: Binary-based install script

The system SHALL provide an `install.sh` that installs Hamilton by downloading the matching
prebuilt binary and bundle archive from the latest GitHub Release, without requiring `bun`,
`git`, or a source checkout on the target machine.

- Priority: must
- Rationale: removing the Bun/git/source-build requirement is the point of this change; a
  fallback to the old build-from-source path would keep that requirement alive for any platform
  the release matrix doesn't cover.

#### Scenario: Supported platform

- WHEN `install.sh` runs on a machine whose OS/arch matches a published binary
- THEN it downloads that binary and the bundle archive, verifies both against the published
  checksums, installs the binary onto `PATH` (e.g. `~/.local/bin/hamilton`), unpacks the bundle
  archive into a sibling location the binary resolves at runtime, and runs
  `hamilton setup --mode assisted`

#### Scenario: Unsupported platform

- WHEN `install.sh` runs on a machine whose OS/arch has no matching published binary
- THEN it exits with a non-zero status and an error naming the detected OS/arch and the
  supported platforms, without attempting a source build

#### Scenario: Checksum mismatch

- WHEN a downloaded binary or bundle archive does not match its published checksum
- THEN `install.sh` aborts the install with an error and does not install the mismatched file

#### Scenario: Pinning a version

- WHEN the caller sets an override environment variable naming a specific release version
- THEN `install.sh` installs that version's binary and bundle archive instead of the latest
  release
