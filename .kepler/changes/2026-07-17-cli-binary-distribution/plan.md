# Plan: CLI Binary Distribution

## Overview

- Change: `.hamilton/changes/2026-07-17-cli-binary-distribution/`
- Goal: publish standalone `hamilton` binaries (macOS/Linux × x64/arm64) via a GitHub Actions release workflow triggered by a `package.json` version bump, and replace `install.sh` so it installs from those binaries with no `bun`/`git`/`node` required.
- Test: `bun run test`
- Build / typecheck: `bun run build`
- Context notes: `setup.ts` and `install-logic.ts` each define an identical `PROJECT_ROOT = Path.resolve(import.meta.dirname, "..", "..", "..")` (grep-confirmed the only two usages in `src/`) and read `bundle/<subdir>` beneath it. `import.meta.dirname` only resolves to a real path in a source checkout or `tsc`-built `dist/`; inside a `bun build --compile` binary it's a virtual embedded-FS path, so `process.execPath` (symlink-resolved) is the only reliable way to find real on-disk assets from a compiled binary. See design.md's Context and the `bundle-root.ts` row of Architecture & Components.
- Quality notes: the DRY fix (one `resolveBundleRoot()` replacing two copies of `PROJECT_ROOT`) is the plan's central seam — Tasks 2 and 3 are two small, independently verifiable consumers of the single Task 1 abstraction rather than one bundled task, so each keeps its own existing test file green in isolation. `bundle-root.ts` is placed under `src/cli/` (not `src/paths.ts`) because it resolves a different concern — where source/install-time bundle assets live — from `paths.ts`'s concern of runtime state under `~/.hamilton`; only the two `src/cli/commands/` consumers need it. Tasks 4–5 (workflow YAML, shell script) have no automated test harness by design (design.md Testing Strategy); their Verify steps use YAML/shellcheck linting plus a local dry run, which is the accepted, proportional level of rigor for build/release tooling in this change.

## Tasks

### Task 1: Add `resolveBundleRoot()` with injectable inputs and full branch coverage

- Depends on: none
- Files:
  - Created: `src/cli/bundle-root.ts`, `tests/cli/bundle-root.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - Requirement `cli-distribution` / "Running from a source checkout": with no env override and no binary-sibling `bundle/`, resolution finds the source-checkout `bundle/` (a directory two levels up from `src/cli/bundle-root.ts`, i.e. the repo root).
  - Requirement `cli-distribution` / "Running as an installed binary": with a `bundle/` directory sibling to `dirname(realpath(execPath))`, resolution returns that sibling path without needing any env var.
  - Requirement `cli-distribution` / "Assets missing in both locations": when neither the binary-sibling nor the source-checkout `bundle/` exists (and no env override), `resolveBundleRoot()` throws an error whose message lists every path it checked.
  - `HAMILTON_BUNDLE_DIR` env var, when set and pointing at an existing directory, wins over both other resolution branches (explicit override takes precedence).
  - `HAMILTON_BUNDLE_DIR` set but pointing at a non-existent directory falls through to the next branch rather than failing immediately (an override that doesn't exist on disk isn't a hard error by itself, as long as another branch resolves).
- Steps:
  1. Write `tests/cli/bundle-root.test.ts` first, covering all five acceptance cases above by calling `resolveBundleRoot()` with injected `env`, `execPath`, `sourceDir`, `existsSync`, and `realpathSync` — no real filesystem or real binary needed. Run `bun --bun vitest run tests/cli/bundle-root.test.ts` and confirm it fails (module doesn't exist yet).
  2. Implement `src/cli/bundle-root.ts`:

     ```ts
     import * as Fs from "node:fs"
     import * as Path from "node:path"

     export interface ResolveBundleRootOptions {
       env?: NodeJS.ProcessEnv
       execPath?: string
       sourceDir?: string
       existsSync?: (path: string) => boolean
       realpathSync?: (path: string) => string
     }

     export class BundleRootNotFoundError extends Error {
       constructor(checked: string[]) {
         super(`Could not locate the Hamilton bundle directory. Checked:\n${checked.map((p) => `  - ${p}`).join("\n")}`)
         this.name = "BundleRootNotFoundError"
       }
     }

     export function resolveBundleRoot(options: ResolveBundleRootOptions = {}): string {
       const env = options.env ?? process.env
       const execPath = options.execPath ?? process.execPath
       const sourceDir = options.sourceDir ?? import.meta.dirname
       const existsSync = options.existsSync ?? Fs.existsSync
       const realpathSync = options.realpathSync ?? Fs.realpathSync

       const checked: string[] = []

       const override = env.HAMILTON_BUNDLE_DIR
       if (override) {
         checked.push(override)
         if (existsSync(override)) return override
       }

       const binarySibling = Path.join(Path.dirname(Path.dirname(realpathSync(execPath))), "bundle")
       checked.push(binarySibling)
       if (existsSync(binarySibling)) return binarySibling

       const sourceCheckout = Path.join(Path.resolve(sourceDir, "..", ".."), "bundle")
       checked.push(sourceCheckout)
       if (existsSync(sourceCheckout)) return sourceCheckout

       throw new BundleRootNotFoundError(checked)
     }
     ```

     Note the `sourceDir` default resolves two levels up (`src/cli` → repo root) because this file lives at `src/cli/bundle-root.ts`, one directory shallower than `setup.ts`/`install-logic.ts` (which resolve three levels up from `src/cli/commands/`).
  3. Run `bun --bun vitest run tests/cli/bundle-root.test.ts` again — expect green.
- Verify: `bun --bun vitest run tests/cli/bundle-root.test.ts` → all cases pass; `bun run build` → no type errors.
- Commit: `feat(cli): add resolveBundleRoot for source-checkout and installed-binary asset lookup`

### Task 2: Wire `setup.ts` to `resolveBundleRoot()`

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `src/cli/commands/setup.ts`, `tests/cli/setup.test.ts`
  - Deleted: none
- Acceptance:
  - Requirement `cli-distribution` / "Running from a source checkout": `setupHamilton()` still copies agents/skills/guidelines/hooks/templates correctly when run from this checkout (existing `setup.test.ts` cases stay green — this is a pure refactor of how the bundle path is found, not of what gets copied).
  - New case: setting `HAMILTON_BUNDLE_DIR` to a temp directory containing a minimal fake `bundle/agents/<name>/INSTRUCTIONS.md` makes `setupHamilton()` copy from that directory instead of the real one, proving the wiring (not just the unit) works end-to-end.
  - `setupHamilton()` fails with a `SetupError` (not an unhandled throw) when `resolveBundleRoot()` throws.
- Steps:
  1. In `tests/cli/setup.test.ts`, add a test in a new `describe("bundle root resolution")` block: set `process.env.HAMILTON_BUNDLE_DIR` to a temp dir with a fabricated `bundle/agents/demo/INSTRUCTIONS.md`, call `setupHamilton()`, assert the file lands under `~/.hamilton/agents/demo/INSTRUCTIONS.md`; restore/delete the env var in `afterEach` alongside the existing `HOME` teardown. Run it — expect failure (setup.ts doesn't consult the env var yet).
  2. In `setup.ts`: delete the module-level `PROJECT_ROOT` constant and the `Path` import usage tied to it; import `resolveBundleRoot` from `../bundle-root.js`. Change each of `copySharedAgents`, `copySkillManifests`, `copyGuidelineManifests`, `copyHooks`, `copyTemplates` to accept a `bundleRoot: string` first parameter and build their source path as `Path.join(bundleRoot, "bundle", "<subdir>")`. In `setupHamilton()`, resolve it once — `const bundleRoot = yield* Effect.try({ try: () => resolveBundleRoot(), catch: (e) => new SetupError({ message: String(e) }) })` — before the copy calls, and pass `bundleRoot` into each.
  3. Run `bun run test` — expect the new test green and all pre-existing `setup.test.ts` cases still green.
- Verify: `bun --bun vitest run tests/cli/setup.test.ts` → all pass, including the new `HAMILTON_BUNDLE_DIR` case; `bun run build` → clean.
- Commit: `refactor(cli): resolve setup's bundle assets via resolveBundleRoot`

### Task 3: Wire `install-logic.ts` to `resolveBundleRoot()`

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `src/cli/commands/install-logic.ts`, `tests/cli/install.test.ts`
  - Deleted: none
- Acceptance:
  - Requirement `cli-distribution` / "Running from a source checkout": existing `install.test.ts` cases (`installWorkflow`, `uninstallWorkflow`, `installAllWorkflows`) stay green — same refactor-only guarantee as Task 2.
  - New case: `HAMILTON_BUNDLE_DIR` pointed at a temp dir with a fabricated `bundle/workflows/demo-flow/workflow.yml` makes `installWorkflow("demo-flow")` install from that directory.
  - `installWorkflow()` fails with an `InstallError` (not an unhandled throw) when `resolveBundleRoot()` throws.
- Steps:
  1. In `tests/cli/install.test.ts`, add a test setting `HAMILTON_BUNDLE_DIR` to a temp dir with `bundle/workflows/demo-flow/workflow.yml`, calling `installWorkflow("demo-flow")`, and asserting it lands under `~/.hamilton/workflows/demo-flow/workflow.yml`; clean up the env var in `afterEach`. Run it — expect failure.
  2. In `install-logic.ts`: delete `PROJECT_ROOT`; import `resolveBundleRoot` from `../bundle-root.js`. Change `bundledWorkflowsDir()` to `Path.join(resolveBundleRoot(), "workflows")`. Since this function is called from both `installWorkflow` (inside `Effect.gen`) and the plain `listBundledWorkflowSlugs()` helper, wrap the `resolveBundleRoot()` call site(s) so a thrown `BundleRootNotFoundError` surfaces as an `InstallError` rather than an uncaught exception — e.g. call it inside `Effect.try` in `installWorkflow`, and have `listBundledWorkflowSlugs()` (used by `installAllWorkflows`) catch-and-return `[]` only for the "directory doesn't exist" case it already handles today, letting a `resolveBundleRoot()` throw propagate up through `installAllWorkflows`'s existing `Effect.gen` (no swallow).
  3. Run `bun run test` — expect the new test green and all pre-existing `install.test.ts` cases still green.
- Verify: `bun --bun vitest run tests/cli/install.test.ts` → all pass, including the new `HAMILTON_BUNDLE_DIR` case; `bun run build` → clean.
- Commit: `refactor(cli): resolve install-logic's bundled workflows via resolveBundleRoot`

### Task 4: Add the release workflow (`.github/workflows/release.yml`)

- Depends on: none
- Files:
  - Created: `.github/workflows/release.yml`
  - Modified: none
  - Deleted: none
- Acceptance:
  - Requirement `cli-distribution` / "Version bump on main": on push to `main`, a job compares `package.json`'s `version` to the latest published GitHub Release's tag; on a difference it creates and pushes tag `v<version>`.
  - Requirement `cli-distribution` / "No version change": when the versions match, the workflow's later jobs (build/package/publish) do not run (gate via a job output / `if:` condition, not a separate always-green no-op).
  - Requirement `cli-distribution` / "Duplicate tag": if `v<version>` already exists as a tag, the workflow fails the job explicitly (e.g. `gh release view "$tag"` or `git ls-remote --tags` check before creating) rather than force-pushing over it.
  - Requirement `cli-distribution` / "Successful build": produces four binaries named `hamilton-<os>-<arch>` for `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`, each via `bun build --compile --target=bun-<os>-<arch> src/cli/main.ts --outfile hamilton-<os>-<arch>` in a matrix (or loop) job on `ubuntu-latest`.
  - Requirement `cli-distribution` / "Binary runs without Bun installed": after building `hamilton-linux-x64` (the one target matching the runner's own OS/arch), the workflow runs `./hamilton-linux-x64 --version` (or `doctor`) as a build-time smoke check and fails the job if it errors.
  - Requirement `cli-distribution` / "Bundle archive contents": packages `tar czf hamilton-bundle.tar.gz bundle/` from the tagged commit's working tree, so unpacking it reproduces `bundle/`'s structure.
  - Requirement `cli-distribution` / "Checksum coverage": generates a `SHA256SUMS` file covering all four binaries and `hamilton-bundle.tar.gz` (e.g. `sha256sum hamilton-* hamilton-bundle.tar.gz > SHA256SUMS`).
  - Publishes everything (four binaries, `hamilton-bundle.tar.gz`, `SHA256SUMS`) as assets on a GitHub Release tagged `v<version>`, via `gh release create`.
- Steps:
  1. Write `.github/workflows/release.yml` with this job shape (fill in exact `run:` commands; this is the structure the acceptance criteria above bind to):
     - `check-version` job: checkout, read `package.json`'s `version` with `node -p "require('./package.json').version"` (Node is preinstalled on `ubuntu-latest`; no `bun` needed for this one-liner), compare against `gh release list` / `gh release view "v$version"` exit code, set a job output `should_release`. If the tag already exists, fail the job with a clear error rather than treating it as "no version change."
     - `tag` job (needs `check-version`, `if: should_release`): `git tag "v$version" && git push origin "v$version"`.
     - `build` job (needs `tag`, matrix over the four `os`/`arch` pairs, all on `runs-on: ubuntu-latest`): install `bun` (`oven-sh/setup-bun`), `bun install --frozen-lockfile`, `bun build --compile --target=bun-${{ matrix.os }}-${{ matrix.arch }} src/cli/main.ts --outfile hamilton-${{ matrix.os }}-${{ matrix.arch }}`; for the `linux-x64` matrix entry only, add a step gated on `if: matrix.os == 'linux' && matrix.arch == 'x64'` that runs `chmod +x` and `./hamilton-linux-x64 --version`; upload each binary as a build artifact.
     - `package` job (needs `build`): download all binary artifacts, `tar czf hamilton-bundle.tar.gz bundle/`, `sha256sum hamilton-* hamilton-bundle.tar.gz > SHA256SUMS`.
     - `publish` job (needs `package`): `gh release create "v$version" hamilton-* hamilton-bundle.tar.gz SHA256SUMS --title "v$version"`.
  2. Validate the YAML parses: `bun -e "import('yaml').then(y => { y.parse(require('fs').readFileSync('.github/workflows/release.yml', 'utf8')); console.log('ok') })"`.
  3. Manual dry run before this change is considered done for real releases (documented in design.md's Migration / Rollout): trigger the workflow via a test version bump on a fork or branch, confirm a release publishes with all five expected assets. Record this as a follow-up if it can't be done inside this session.
- Verify: the `bun -e ...` YAML-parse command above prints `ok` with exit code 0; `actionlint` if available (`command -v actionlint && actionlint .github/workflows/release.yml`), otherwise skip — no automated test harness for workflow YAML per design.md.
- Commit: `feat(ci): add release workflow to build and publish cli binaries`

### Task 5: Rewrite `install.sh` for binary-based installs

- Depends on: Task 4
- Files:
  - Created: none
  - Modified: `install.sh`
  - Deleted: none
- Acceptance:
  - Requirement `cli-distribution` / "Supported platform": on a machine whose `uname -s`/`uname -m` maps to one of the four release targets, downloads the matching `hamilton-<os>-<arch>` binary, `hamilton-bundle.tar.gz`, and `SHA256SUMS` from the latest release (or `$HAMILTON_VERSION` if set), verifies both downloads against `SHA256SUMS`, installs the binary to `~/.hamilton-dist/bin/hamilton` (`chmod +x`) symlinked from `~/.local/bin/hamilton`, unpacks the bundle archive to `~/.hamilton-dist/bundle/`, and runs `hamilton setup --mode assisted`.
  - Requirement `cli-distribution` / "Unsupported platform": on an OS/arch with no matching asset name, exits non-zero with the detected values and the supported list, and does not attempt any download or source build.
  - Requirement `cli-distribution` / "Checksum mismatch": if a downloaded file's SHA-256 doesn't match its `SHA256SUMS` entry, aborts before `chmod +x` or extraction, with a non-zero exit and no partial install of that file.
  - Requirement `cli-distribution` / "Pinning a version": `$HAMILTON_VERSION`, if set, selects that release tag's assets instead of the latest release.
  - No `require bun` / `require git` calls remain; no source-build/clone fallback path exists anywhere in the script (per design.md's "fully replaces" decision).
  - Passes `shellcheck install.sh` with no warnings.
- Steps:
  1. Replace `install.sh`'s body (keep the `set -euo pipefail` and top-of-file usage/env-var comment block, updated for the new env vars) with:
     - OS/arch detection: map `uname -s` (`Darwin`→`darwin`, `Linux`→`linux`; anything else → unsupported) and `uname -m` (`x86_64`→`x64`, `arm64`/`aarch64`→`arm64`; anything else → unsupported) to the asset naming scheme `hamilton-<os>-<arch>`. On no match, print the detected `uname` values and the four supported combinations, exit 1.
     - Version resolution: `HAMILTON_VERSION` env var if set, else the tag of the latest GitHub Release via `curl -fsSL https://api.github.com/repos/$HAMILTON_REPO_SLUG/releases/latest` (parse `tag_name` with `grep`/`sed` — no `jq` dependency assumed unless it's already required).
     - Download `hamilton-<os>-<arch>`, `hamilton-bundle.tar.gz`, and `SHA256SUMS` for that version into a temp working directory (`mktemp -d`, cleaned up via `trap`).
     - Checksum verification: `sha256sum -c` (Linux) or `shasum -a 256 -c` (macOS, no `sha256sum` by default) filtered to just the two downloaded filenames from `SHA256SUMS`; abort with a clear message on mismatch, before any `chmod`/`tar`.
     - Install: `mkdir -p ~/.hamilton-dist/bin`, move the binary there as `hamilton`, `chmod +x`; `mkdir -p ~/.local/bin`, `ln -sf ~/.hamilton-dist/bin/hamilton ~/.local/bin/hamilton` (mirrors today's `ln -sf` semantics — overwrites an existing install in place, per design.md's Error Handling table).
     - Bundle: `mkdir -p ~/.hamilton-dist && tar xzf hamilton-bundle.tar.gz -C ~/.hamilton-dist`.
     - Finish: `~/.local/bin/hamilton setup --mode assisted`, plus a printed note about macOS Gatekeeper (`xattr -d com.apple.quarantine ~/.hamilton-dist/bin/hamilton` on first-run "unidentified developer" issues), per design.md's Risks.
  2. Add a `lint` job to `.github/workflows/release.yml` (from Task 4) that runs `shellcheck install.sh` before the `build` job, so a broken script fails CI before any binaries are built — satisfies design.md's Testing Strategy line "lint with shellcheck in CI."
  3. Run `shellcheck install.sh` locally and fix any warnings.
- Verify: `shellcheck install.sh` → no warnings; manual smoke test against a real published release is the full end-to-end check (documented as a follow-up per design.md's Testing Strategy — not automatable in this session without a live release to point at).
- Commit: `feat(cli): rewrite install.sh to install from published release binaries`

### Task 6: Update README and CONTRIBUTING for the new install path

- Depends on: Task 4, Task 5
- Files:
  - Created: none
  - Modified: `README.md`, `CONTRIBUTING.md`
  - Deleted: none
- Acceptance:
  - README's install/quick-start section describes the `curl -fsSL .../install.sh | bash` binary-install path with no mention of a `bun` prerequisite for end users, and documents `HAMILTON_VERSION` for pinning.
  - README's "bun >= 1.2.x" requirement is scoped explicitly to contributors/source builds, not to installing the CLI.
  - CONTRIBUTING.md's docs-sync obligation for this change is satisfied — no unmodified reference to the old `HAMILTON_REPO`/`HAMILTON_REF`/`HAMILTON_DIR`-clone-and-build install flow remains in either file.
- Steps:
  1. Update README.md's install section to the new `install.sh` usage and env vars (`HAMILTON_VERSION`), moving the Bun requirement note under a "Contributing / building from source" heading if one doesn't already separate it.
  2. Update CONTRIBUTING.md wherever it references the old install flow, per its own docs-sync rule.
  3. Re-read both files once modified to confirm no stale command or env var reference remains (a plain read-through, no automated check available for prose docs).
- Verify: manual re-read of both files confirms no reference to `HAMILTON_REPO`/`HAMILTON_DIR`/cloning/`bun install` in the install path section.
- Commit: `docs: update README and CONTRIBUTING for binary-based install`

## Done when

- All tasks implemented (recorded in progress.md)
- `bun run test` passes; `bun run build` is clean
- All review feedback has been addressed
