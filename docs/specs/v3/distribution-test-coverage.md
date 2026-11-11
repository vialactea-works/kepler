# Distribution test coverage

M01.8 recorded the behaviors previously checked by shell scripts. The current test contract verifies the matching CLI and resource archive and the version-specific home it initializes. It does not add a smoke suite, host-integration claim, or agent-certification claim.

## Exact native archive

`tests/e2e/release-archive.test.ts` reads the exact archive selected by the workflow. It requires the archive path, expected target, independently calculated SHA-256, and frozen source commit. It checks the archive name, target, embedded release identity, package inventory, and production source binding before extraction. Missing identity inputs fail the test; it does not substitute a checkout build or another archive.

The E2E runs the extracted CLI outside the checkout with isolated temporary paths. It verifies that setup:

- requires an absolute `KEPLER_HOME` and does not create a fallback home;
- seeds the complete packaged templates, guidelines, skills, and agent profiles;
- writes default settings and ready home metadata;
- preserves user-edited settings and a deleted skill on successful reinitialization;
- refuses an unknown non-empty home without modifying its files; and
- does not create a stable launcher or `kepler-dist` selector.

The test proves the executable archive's home-initialization behavior. It does not exercise Pi or Claude Code discovery, host configuration, session loading, model execution, agent behavior, credentials, permissions, or workflow readiness.

## Workspace and packed Core checks

The pull-request workflow runs source policy, typecheck, build, unit tests, integration tests, Docker-backed E2E, and the packed-Core consumer check. The packed-Core test installs the produced tarball into a disposable consumer and checks its declarations and public behavior. Docker E2E requires Docker and its pinned Git-enabled image. These gates do not publish a release.

## Native workflows and release evidence

The pull-request workflow executes the exact-archive E2E on Linux x64. The release workflow has native jobs for Linux x64, Linux arm64, macOS x64, and macOS arm64. Each job builds an archive from the checked-out source, calculates its digest, runs the archive E2E against those exact bytes, and uploads the tested archive for publication. A configured target is not a passed target. A Linux cross-build is not evidence of execution on another target.

Historical D4/D5 approval and older candidate reports apply only to the exact source and archive identities recorded in those reports. They do not certify the current versioned-home source or a corrected release. Published `v3.0.0` still contains the earlier installation behavior. A corrected release requires fresh source-bound checks, archive digests, provenance, and all required target-native executions. No release or publication is claimed here.
