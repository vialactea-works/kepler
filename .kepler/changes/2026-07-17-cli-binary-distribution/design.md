# Design: CLI Binary Distribution

## Context

Hamilton's CLI entrypoint (`src/cli/main.ts`) is Bun-native — `#!/usr/bin/env bun`,
`@effect/platform-bun`, `bun:sqlite` — so it has never run under plain Node. Today's only
install path (`install.sh`) requires `bun` on the target machine, clones the repo (or uses a
local checkout), runs `bun install`, and builds with `tsc` to `dist/cli/main.js`. `hamilton
setup` then copies assets out of a `bundle/` directory it finds by resolving `PROJECT_ROOT`
three levels up from the running script's file (`Path.resolve(import.meta.dirname, "..", "..",
"..")` in both [setup.ts](../../../src/cli/commands/setup.ts) and
[install-logic.ts](../../../src/cli/commands/install-logic.ts)) — a resolution that only makes
sense inside a source checkout.

Bun can produce standalone, self-contained executables via `bun build --compile`: the Bun
runtime is embedded in the output, so the resulting binary needs neither Bun nor Node installed
to run. It also supports cross-compilation — building a `darwin-arm64` binary from a Linux CI
runner — because it stitches the bundle against a prebuilt Bun runtime for the target rather
than invoking the host's own toolchain. `bun:sqlite` is part of that embedded runtime, so it
travels with the binary automatically; the codebase has no other native (`.node`) addons in its
import graph, so this project has no native-dependency obstacle to cross-compiling.

`import.meta.dirname` is meaningless inside a `--compile` binary — Bun resolves it to a virtual
embedded-filesystem path, not a real directory — but `process.execPath` still points at the
executable's true location on disk. That distinction is the crux of this design: a compiled
binary can find things next to itself; it cannot find things "relative to my own source file."

## Goals / Non-Goals

**Goals**

- Publish a versioned GitHub Release with binaries for macOS/Linux × x64/arm64 whenever
  `package.json`'s version changes on `main`.
- `install.sh` installs Hamilton from those binaries with no `bun`/`git`/`node` required.
- The installed binary runs `hamilton setup` and every other command exactly as it does from a
  source checkout.

**Non-Goals**

- Windows, npm/Homebrew publishing, code signing/notarization, auto-update, full in-binary
  asset embedding — see proposal.md Non-Goals for the full list and reasoning.

## Decisions

### Decision: `bun build --compile` as the binary strategy

- Choice: build release binaries with `bun build --compile --target=bun-<os>-<arch>`.
- Alternatives considered: `pkg`/`nexe` (Node-based single-file packagers) — rejected, they
  target Node and the codebase is Bun-native (`bun:sqlite`, `@effect/platform-bun`); porting off
  Bun is a much larger change than this one. Shipping a Node build instead of a Bun build —
  rejected for the same reason plus it would still require bundling or vendoring `bun:sqlite`
  functionality.
- Rationale: it's already the runtime the code targets, needs no source changes to the app logic
  itself, and produces a genuinely dependency-free executable.

### Decision: side-car bundle archive, not full asset embedding

- Choice: package `bundle/` into one `hamilton-bundle.tar.gz` per release (same file for every
  OS/arch), published alongside the binaries. The binary resolves it from a sibling directory at
  runtime (see Architecture).
- Alternatives considered: statically `import`-ing every file under `bundle/` so `bun build
  --compile` embeds them into the executable. Rejected for this change — it needs a codegen step
  to keep a static import list in sync with `bundle/`'s contents (which change often; the project
  is alpha and `bundle/` is actively edited), and a rewrite of the asset-copying logic in
  `setup.ts`/`install-logic.ts` to read from `Bun.embeddedFiles` instead of the filesystem. A
  tarball is a five-line build step and a five-line extraction step; embedding is a more elegant
  end state but not proportional to this change. Can be revisited later without touching the
  release-trigger or install.sh mechanics built here.
- Rationale: lowest-risk path to "no Bun dependency for end users" without also taking on an
  asset-embedding subsystem.

### Decision: platform matrix — macOS + Linux, x64 + arm64, no Windows

- Choice: build `bun-darwin-x64`, `bun-darwin-arm64`, `bun-linux-x64`, `bun-linux-arm64`.
- Alternatives considered: adding `bun-windows-x64` — deferred; Windows needs a separate
  install path (`.ps1`, not a POSIX shell script) and is untested territory for this project.
- Rationale: covers the platforms maintainers and current users actually run.

### Decision: single Linux runner cross-compiles all four targets

- Choice: run the build matrix on `ubuntu-latest`, looping (or matrixing) over the four
  `--target` values from one job, rather than using `macos-latest` runners for the Darwin
  builds.
- Alternatives considered: native runners per OS (`macos-latest` for Darwin targets) — rejected;
  Bun's cross-compilation makes this unnecessary, and native macOS runners cost more CI minutes
  for no benefit given there's nothing platform-specific in the build.
- Rationale: simpler workflow, cheaper CI, and cross-compilation is exactly what Bun's `--compile
  --target` flag is designed for.
- Trade-off (see Risks): the cross-compiled `darwin-*` and `linux-arm64` binaries can't be
  executed on the `x64` Linux build runner, so CI can only prove they *compiled*, not that they
  *run*.

### Decision: version-diff release trigger with workflow-created tag

- Choice: on push to `main`, a job compares `package.json`'s `version` against the latest
  published release's tag. On a difference, the workflow creates and pushes tag `v<version>`,
  then runs the build/package/publish jobs. No manual dispatch step, no separate manual tagging.
- Alternatives considered: `workflow_dispatch` with a manually entered version — rejected, an
  extra manual step for every release; tag-push trigger (release only on an already-existing
  tag) — rejected, it just moves the manual step to "remember to tag," which is what this
  decision automates away.
- Rationale: makes the version bump in `package.json` the single source of truth for "should a
  release happen," and keeps releases synchronous with normal PR merges.

### Decision: `install.sh` fully replaces the source-build path

- Choice: the new `install.sh` only downloads and installs prebuilt artifacts. There is no
  fallback to cloning and building from source for unsupported platforms.
- Alternatives considered: try-binary-then-fall-back-to-source-build — rejected; it keeps the
  `bun`/`git` requirement alive on exactly the path most likely to need it (an unsupported
  platform), defeating the purpose of this change, and doubles the script's failure surface.
- Rationale: matches the goal directly — no Bun dependency, full stop. An unsupported platform
  gets a clear error, not a silent 10-minute source build.

### Decision: checksums published and verified

- Choice: the release workflow generates a `SHA256SUMS` file covering every binary and the
  bundle archive; `install.sh` downloads it and verifies the matching hash before installing
  anything.
- Alternatives considered: no verification, relying on GitHub's TLS — rejected; verifying a hash
  before `chmod +x` and running a freshly downloaded binary is standard practice for
  `curl | bash` installers and costs almost nothing to add.
- Rationale: cheap integrity check on the exact artifact that's about to be executed.

## Architecture & Components

| Component | Responsibility | Depends on |
|---|---|---|
| `.github/workflows/release.yml` | Detects a version bump, tags, builds the four binaries, packages the bundle archive, generates checksums, publishes the GitHub Release. | `bun build --compile`, `gh release create` |
| `install.sh` | Detects OS/arch, downloads the matching release assets, verifies checksums, installs binary + bundle, runs `hamilton setup --mode assisted`. | The published release assets; `curl`, `tar`, `sha256sum`/`shasum` |
| `src/cli/bundle-root.ts` *(new)* | Resolves the on-disk `bundle/` directory a running `hamilton` process should read from — the one seam both compiled-binary and source-checkout invocations share. | `process.execPath`, `process.env`, filesystem |
| `setup.ts` / `install-logic.ts` | Copy assets out of whatever directory `bundle-root.ts` resolves. | `bundle-root.ts` (replaces each file's private `PROJECT_ROOT` constant) |

**`bundle-root.ts` resolution order** (a pure function, `resolveBundleRoot(): string`, so it can
be unit tested with injected inputs rather than real `process.execPath`/env):

1. `HAMILTON_BUNDLE_DIR` env var, if set and it exists on disk — explicit override, useful for
   tests and non-standard installs.
2. A `bundle/` directory sibling to the *real* (symlink-resolved) executable's parent directory
   — i.e. `dirname(dirname(realpath(process.execPath)))/bundle`. This is the layout `install.sh`
   produces: `~/.hamilton-dist/bin/hamilton` and `~/.hamilton-dist/bundle/`, with
   `~/.local/bin/hamilton` symlinked to the former.
3. The existing source-checkout resolution — walk up from the module's own location (works
   because `import.meta.dirname` is only unreliable inside a `--compile` binary; it's exactly
   right for `bun run` and the `tsc`-built `dist/cli/main.js` dev path).
4. None found → the caller (`setup.ts`) fails with an error naming all the paths it checked.

## Data & Flow

**Release:**

```
PR merges to main, package.json version changed
  -> release.yml: compare version to latest GitHub Release tag
  -> differs? create + push tag v<version>
  -> build job (ubuntu-latest, loop over 4 targets):
       bun build --compile --target=bun-<os>-<arch> src/cli/main.ts --outfile hamilton-<os>-<arch>
  -> package job: tar czf hamilton-bundle.tar.gz bundle/
  -> checksum job: sha256sum all artifacts > SHA256SUMS
  -> gh release create v<version> <binaries> hamilton-bundle.tar.gz SHA256SUMS
```

**Install:**

```
curl -fsSL .../install.sh | bash
  -> detect OS (uname -s) + arch (uname -m) -> map to release asset names
  -> fetch latest release metadata (or $HAMILTON_VERSION if set)
  -> download binary + hamilton-bundle.tar.gz + SHA256SUMS
  -> verify checksums; abort on mismatch
  -> install binary to ~/.hamilton-dist/bin/hamilton (chmod +x), symlink from ~/.local/bin/hamilton
  -> extract bundle archive to ~/.hamilton-dist/bundle/
  -> run: hamilton setup --mode assisted
```

### Quality Lens

- **Responsibility split is clean:** the release workflow only produces artifacts, `install.sh`
  only consumes them, and `bundle-root.ts` only answers "where are my assets" — no component
  needs to know the internals of another (low coupling).
- **DRY fix included:** `setup.ts` and `install-logic.ts` currently each define their own
  identical `PROJECT_ROOT` constant. This change deletes both and replaces them with the shared
  `resolveBundleRoot()` — one authoritative definition instead of two copies that could drift.
- **Testable seam:** `resolveBundleRoot()` takes its inputs (env, exec path, filesystem checks)
  through parameters with real-environment defaults, so tests can exercise all four resolution
  branches (env override / binary-sibling / source-checkout / not-found) without needing an
  actual compiled binary or a real install layout on disk.
- **Right-sized:** no plugin system, no config file, no abstraction for "future package
  managers" — `install.sh` is a single linear script, matching its actual job.
- **Accepted smell:** none introduced. The one structural risk (untestable cross-compiled
  binaries — see Risks) is a CI/verification gap, not a code-structure smell.

## Error Handling & Edge Cases

| Failure | Behavior |
|---|---|
| `package.json` version unchanged since last release | Workflow exits after the compare step; no tag, build, or publish. |
| Computed tag already exists | Workflow fails loudly rather than force-overwriting a tag/release. |
| `install.sh` on an unsupported OS/arch | Exits non-zero with the detected platform and the supported list; no source-build fallback. |
| Downloaded asset fails checksum verification | `install.sh` aborts before `chmod +x`/extraction; nothing is installed or overwritten. |
| Neither bundle location resolves at runtime | `hamilton setup` fails with an error listing every path it checked (env override, binary-sibling, source-checkout). |
| Existing Hamilton install present | `install.sh` overwrites the binary and bundle in place (same behavior as today's `ln -sf`); it does not touch `~/.hamilton/` (the user's runtime state, untouched by both old and new scripts). |
| GitHub API/download unreachable | `install.sh` fails with `curl`'s error; no partial install state beyond whatever `curl`/`tar` already wrote (acceptable — rerunning the script is the recovery path). |

## Testing Strategy

- **`resolveBundleRoot()`:** unit tests for each of the four resolution branches, using injected
  fake env/exec-path/fs-exists inputs — no real binary or install layout needed.
- **Compiled binaries, CI smoke test:** after building `hamilton-linux-x64` (the one target that
  matches the `ubuntu-latest` runner's own OS/arch), run it (`./hamilton-linux-x64 --version` or
  `doctor`) as a build-time sanity check. The other three targets can't be executed on that
  runner (see Risks) — their verification is "the compile step exited 0."
- **`install.sh`:** lint with `shellcheck` in CI. Manual verification against a real published
  release (documented in Migration / Rollout) before calling this change done, since the full
  download → checksum → install → `hamilton setup` path isn't practical to fully automate here.
- **Release workflow:** no automated test harness for the workflow YAML itself; verified by
  running it end-to-end against a real version bump as part of landing this change (see
  Migration / Rollout).

## Constraints & Boundaries

- Always: verify checksums before `chmod +x`/executing any downloaded artifact in `install.sh`;
  keep the source-based contributor workflow (`bun run build`, `bun run install-local`)
  unmodified.
- Ask first: changing the default install directories (`~/.local/bin`, the new
  `~/.hamilton-dist`) if that turns out to collide with an existing convention elsewhere in the
  project.
- Never: add a source-build fallback path into `install.sh`; publish a release without a
  checksums file.

## Risks / Trade-offs

- **Cross-compiled binaries aren't executed in CI** (only `linux-x64` matches the build runner)
  -> Mitigation: accepted for this change given alpha status; a maintainer spot-checks a Darwin
  binary manually before/after the first release, and QEMU-based execution for the other targets
  is a reasonable future addition if this bites us.
- **No macOS code signing** -> downloaded binaries will hit Gatekeeper's "unidentified
  developer" warning on first run -> Mitigation: `install.sh` prints the `xattr -d
  com.apple.quarantine` workaround (or equivalent) in its output; full notarization is a
  Non-Goal for this change.
- **Two artifacts (binary + bundle archive) must both be present and matched** -> Mitigation:
  both are always published together in the same release and downloaded together by
  `install.sh`, so there's no version-skew window in normal use; `$HAMILTON_VERSION` pinning
  pins both together.
- **Future native dependency would break cross-compilation** -> Mitigation: none needed now (no
  native `.node` addons in the current import graph); flag this constraint in
  `release.yml` comments so a future contributor adding one notices the build assumption.

## Migration / Rollout

- No backward-compatibility concerns: this is additive (new workflow, new `install.sh`) and the
  contributor source workflow is untouched.
- The first automated release fires the next time a PR bumps `package.json`'s version after this
  change merges — landing this change does not, by itself, trigger a release.
- Old `install.sh` behavior (clone + `bun install` + build) is deleted, not deprecated-in-place;
  README/CONTRIBUTING's install snippets get updated in the same change (per CONTRIBUTING.md's
  docs-sync rule) since the command's user-facing behavior changes.
