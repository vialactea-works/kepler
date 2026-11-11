# Distribution test coverage

M01.8 recorded the behaviors previously checked by shell smoke scripts. The current unified-release source candidate replaces the split sidecar and installer path with versioned target archives and executable coverage. No smoke suite, publication, or host-certification claim is added.

## Exact target archive

`tests/e2e/release-archive.test.ts` exercises the selected archive bytes, their embedded release/source/target/resource identity, safe unpacking, setup activation, upgrade, no-op, rejected-candidate preservation, and current-generation checks. In CI, the test requires the workflow-built archive path, independently calculated SHA-256, and expected source commit; missing identity inputs fail the run rather than selecting a substitute. `tests/e2e/installation.test.ts` checks the bootstrap installer against controlled release assets and verifies that setup, not the installer, owns activation.

`tests/e2e/bootstrap-safety.test.ts` covers installer identity, archive bounds, rejected candidates, and safe preservation of owned and replacement paths. `tests/e2e/dev-package.test.ts` exercises `dev:package` with isolated home, Pi settings, package source, and project data. The native distribution job runs these tests against a target-native archive.

## Pi host modes and package discovery

The focused setup tests preserve two host modes:

- **Standalone Pi:** use the actual native Pi executable and pi-subagents 0.76.1. The Kepler CLI remains standalone; the test does not require the npm Pi SDK or Node override.
- **Public npm Pi SDK:** use the actual `@earendil-works/pi-coding-agent@1.2.0` package, its public `dist/index.js`, pi-subagents 0.76.1, and an explicitly selected Node interpreter. The test does not substitute a bundled or internal SDK module.

The tests exercise the native Pi settings writer and package loader offline. They verify discovery of the eleven packaged skills and four Pi profiles, and preserve unrelated settings. This proves package/resource discovery, not model execution, agent behavior, credentials, permissions, active-session reload, or workflow readiness. The public npm mode's Node and SDK paths are explicit inputs; standalone mode remains separately supported.

## Workspace and packed Core checks

The pull-request workflow configures source policy, full typecheck, build, unit, integration, Docker-backed E2E, and packed-Core consumer checks. The packed-Core test installs the produced tarball in a disposable consumer and checks its declarations and public behavior. Docker E2E requires Docker and its pinned Git-enabled image. Tests must fail when required collaborators are absent; they must not silently substitute fake host implementations or skip required native proof.

## Native workflows and current status

The existing native workflow matrix covers `linux-x64`, `linux-arm64`, `darwin-x64`, and `darwin-arm64`. Each job is configured to build its exact native archive from a clean source commit and pass that archive and digest to the E2E suite. Release cross-compilation on Linux x64 is build evidence only; it is not foreign-target execution. A configured target is not a passed target.

Historical D4/D5 approval covers only the earlier development source (`sha256:f627ccd1f94b3a82e7843a9cab366755fd1e810047e894ca59bdaf0fdbec735e`) and its exact native Linux x64 archive (`sha256:c70b95b9391b529510996c93710468c408896fdb3386558fe3de1b60cde689b4`). Later source and archive checks are separate candidate-bound evidence; whole-change review findings required further corrections. No result transfers across source edits. For each corrected candidate, verify the exact frozen source and archive with the applicable source-policy, type, version, build, unit, serial integration, packed-Core, Docker, native archive, and Pi SDK gates, then obtain fresh independent reviews. The private handoff records the exact run evidence. Production publication requires all four configured target-native jobs to execute their exact archives; a configured job, cross-build, or one-host local run is not foreign-target evidence. No release or publication is claimed here.
