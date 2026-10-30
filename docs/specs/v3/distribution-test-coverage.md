# Distribution test coverage

M01.8 recorded the behaviors previously checked by shell smoke scripts. The standalone and installer scripts and their release-workflow calls have been replaced with executable E2E coverage. The Core pack test is a Vitest integration test. No smoke tests remain in the v3 test or release workflow.

## Installer and standalone executable

`tests/e2e/installation.test.ts` builds a host-native standalone binary and stages it with the actual `bundle/` sidecar outside the checkout. It drives the installer against checksummed local release assets through a test-only curl transport, then verifies the real installed binary's setup behavior, compatibility receipt, repeat setup, resource preservation, upgrade, conflict, and checksum-failure paths.

The same test runs the installed executable from a temporary directory outside the checkout with an empty `PATH`. It checks the version and runs setup while Bun and Node are unavailable, using the installed sidecar. The test does not claim cross-target execution.

## Packed Core consumer

`packages/core/tests/integration/packed-package.test.ts` packs Core, installs the tarball into a disposable consumer, typechecks consumer TypeScript against the packed declarations, and exercises public runtime behavior and invalid artifact, event-envelope, and settings cases. Its cleanup verifies that the temporary consumer is removed.

## CI

The pull-request and release verification jobs run the named unit, integration, and E2E projects, including the installer/standalone and packed-Core behavior gates. The release workflow no longer calls shell smoke scripts. Native distribution execution for the supported Linux/macOS architectures is tracked separately from cross-compilation in the release matrix work.
