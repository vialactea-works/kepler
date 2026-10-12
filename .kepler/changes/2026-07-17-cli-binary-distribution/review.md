## Task 2: Wire `setup.ts` to `resolveBundleRoot()` — Review — 2026-07-17

Verdict: approved

### Verified

- **Refactor correctness** — All five copy functions (`copySharedAgents`, `copySkillManifests`, `copyGuidelineManifests`, `copyHooks`, `copyTemplates`) correctly accept `bundleRoot: string` as the first explicit parameter and construct source paths via `Path.join(bundleRoot, "<subdir>")` instead of the deleted `PROJECT_ROOT` module constant. The binding is consistent across all call sites in `setupHamilton()`.

- **Module-level constant deleted entirely** — The `PROJECT_ROOT = Path.resolve(import.meta.dirname, "..", "..", "..")` constant is removed (not aliased or left dead); the import of `resolveBundleRoot` from `../bundle-root.js` replaces it.

- **Error handling** — `setupHamilton()` wraps `resolveBundleRoot()` throws in `SetupError` via `Effect.try`, as required. The implementation is straightforward and correct.

- **Source checkout requirement met** — All 27 pre-existing copy-related test cases pass, confirming `setupHamilton()` still copies agents, skills, guidelines, hooks, templates correctly when run from the source checkout. Pure refactor of path resolution, not of copy logic.

- **HAMILTON_BUNDLE_DIR env var override tested end-to-end** — New test creates a fake `bundle/agents/demo/INSTRUCTIONS.md` under a temp directory, sets `HAMILTON_BUNDLE_DIR`, calls `setupHamilton()`, and asserts the file lands at `~/.hamilton/agents/demo/INSTRUCTIONS.md` with correct content. This proves the wiring works at the integration level, not just the unit.

- **Test hygiene** — New test properly sets up/tears down `HOME` and `HAMILTON_BUNDLE_DIR` env vars in `beforeEach`/`afterEach`, cleans up temp directories with `Fs.rmSync`, and restores original env state. Isolated from other tests.

- **Build and type check** — `bun run build` clean with no new errors.

### Suggestions

- [tests/cli/setup.test.ts:250+] Add an explicit test case in the `describe("bundle root resolution")` block for the error path: set `HAMILTON_BUNDLE_DIR` to a non-existent directory (or unset all bundle paths to trigger `BundleRootNotFoundError`), call `setupHamilton()`, and assert the exit is a failure with `SetupError` thrown (not an unhandled exception). This verifies the requirement "setupHamilton() fails with a SetupError (not an unhandled throw) when resolveBundleRoot() throws" is honoured at runtime, ensuring the `Effect.try` wrapping does what it promises. The code is correct as-is, but a test would prevent regression.

---

**Summary:** Task 2 correctly wires `setup.ts` to `resolveBundleRoot()` as a pure refactor of path resolution. All three acceptance criteria are met: source checkout continues to work (27 pre-existing tests pass), `HAMILTON_BUNDLE_DIR` env var override works end-to-end (new test verifies), and error handling is implemented correctly (Effect.try wraps throws in SetupError). Build is clean. Ready for `hamilton-finish-work` once the optional error-case test is addressed (or deferred to a follow-up refine pass at the coder's discretion).

---

## Task 5: Rewrite `install.sh` for binary-based installs — 2026-07-20

Verdict: **approved**

### Verified Acceptance Criteria

1. **"Supported platform"** — Script correctly:
   - Maps `uname -s`/`uname -m` to asset names via `detect_platform()` (lines 172–210), supporting darwin/linux × x64/arm64
   - Downloads binary, bundle archive, and checksums to temp dir (lines 280–282)
   - Verifies checksums with `sha256sum` (Linux) or `shasum -a 256` (macOS) using `--ignore-missing` to match only downloaded files (lines 240–254, verified at line 285 BEFORE chmod/extract)
   - Installs binary to `~/.hamilton-dist/bin/hamilton` with `chmod +x` (lines 288–290)
   - Creates symlink from `~/.local/bin/hamilton` (lines 293–294)
   - Extracts bundle to `~/.hamilton-dist` (lines 297–298), producing correct `bundle/` structure
   - Runs `hamilton setup --mode assisted` (line 316)

2. **"Unsupported platform"** — Exits non-zero with error and no download/build:
   - Unknown OS: error to stderr (line 189) and exit 1 (line 191)
   - Unknown arch: error to stderr (line 203) and exit 1 (line 205)
   - Detected platform and supported list printed as required

3. **"Checksum mismatch"** — Aborts before chmod/extraction:
   - Checksum verification at line 285, strictly before chmod (line 290) and extract (line 298)
   - Uses standard `sha256sum -c` and `shasum -a 256 -c` commands; any non-zero exit propagates via `set -euo pipefail`
   - Trap cleanup (lines 277, 300–301) ensures temp dir removed even on early exit; no partial install committed

4. **"Pinning a version"** — Correctly implemented:
   - `resolve_version()` checks `HAMILTON_VERSION` env var first (lines 227–228)
   - Falls back to GitHub API fetch of latest release tag (lines 230–234)

5. **No bun/git dependency, no fallback** — Verified:
   - No `require` function definition anywhere
   - Zero calls to `require bun` or `require git`
   - No git clone, fetch, reset, or source-build logic
   - Single linear execution path: detect → resolve → download → verify → install → setup

6. **Shellcheck passes with no warnings** — Deferred to controller confirmation:
   - Task instructions note: controller already ran `ASDF_SHELLCHECK_VERSION=0.9.0 shellcheck install.sh` → exit 0, zero warnings
   - Acceptance criterion satisfied

### CI Integration Verified

7. **Lint job in release.yml** — Correctly positioned:
   - New job defined at lines 26–39, depends on `tag` (line 28)
   - Installs shellcheck and runs `shellcheck install.sh` (line 38) with NO `|| true` wrapper — will fail CI on warnings
   - Build job updated to depend on `lint` instead of `tag` (lines 42–43)
   - Job chain: check-version → tag → lint → build (correct execution order)

### Code Quality

- **Variable quoting:** All expansions properly quoted (`"$work_dir"`, `"$platform"`, `"$version"`, `"$binary_name"`, `"$bundle_name"`, `"$HAMILTON_REPO_SLUG"`, etc.)
- **POSIX compliance:** Uses `[ ]` not `[[ ]]`, `command -v` not `which`, error messages to stderr with `>&2`
- **Function design:** Each function (detect_platform, resolve_version, verify_checksums, install_hamilton, main) has single clear responsibility
- **Error handling:** Unsupported platforms exit with clear error; checksum mismatches abort via sha256sum/shasum exit code; missing checksums utility exits 1; trap cleanup on error
- **Gatekeeper mitigation:** Lines 318–326 print `xattr -d com.apple.quarantine` workaround for macOS users (per design.md risk mitigation)
- **Idiomatic shell:** Proper use of `set -euo pipefail`, trap setup/removal, local variable declarations, clean argument passing

### No Issues Found

All binding constraints from plan.md and design.md are met. The script is robust, follows shell best practices, and integrates correctly into the release workflow.

---

## Whole-branch review — 2026-07-20

Verdict: **approved**

Base: `e13d16578b2709f92cc566c812637b011187eac2` (merge-base with `origin/main`)
Head: `c444246fb10d73d79cf0dc941ed81cd1e1a32918`

### Binding constraints met

- All tasks implemented and recorded in `progress.md`.
- `bun run test`: 666/667 passing (1 pre-existing failure in `reminder.test.ts`, unrelated to this change).
- `bun run build`: clean, no new errors.
- DRY fix in place: one `resolveBundleRoot()` replaces both prior `PROJECT_ROOT` copies.

### Critical integration seam verified

Traced the full path from CI packaging to runtime resolution:

1. `release.yml`: `tar czf hamilton-bundle.tar.gz bundle/` archives the `bundle/` directory.
2. `install.sh`: `tar xzf "$bundle_name" -C ~/.hamilton-dist` extracts it to `~/.hamilton-dist/bundle/`.
3. `install.sh`: binary installed to `~/.hamilton-dist/bin/hamilton`, symlinked from `~/.local/bin/hamilton`.
4. `bundle-root.ts`'s binary-sibling branch: `dirname(dirname(realpathSync(execPath)))` resolves `~/.local/bin/hamilton` → `~/.hamilton-dist/bin/hamilton` → `~/.hamilton-dist`, joined with `"bundle"` → `~/.hamilton-dist/bundle`.

Matches the extraction location exactly — a real end-user install resolves its bundle assets correctly at runtime.

### Cannot verify from diff

- Whether `shasum -a 256 -c SHA256SUMS --ignore-missing` behaves correctly on an actual macOS system's `shasum` (shellcheck passes and syntax is correct; semantic correctness needs a real macOS smoke test). Low risk; already flagged in design.md as a first-release follow-up.

### No blocking issues

All six per-task reviews independently approved their diffs; this pass additionally confirmed cross-task integration is correct. Ready for `hamilton-finish-work`.
