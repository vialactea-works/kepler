# Distribution test coverage

M01.8 recorded the behaviors previously checked by shell smoke scripts. The standalone and installer scripts and their release-workflow calls have been replaced with executable E2E coverage. The Core pack test is a Vitest integration test. No smoke tests remain in the v3 test or release workflow.

## Installer and standalone executable

`tests/e2e/installation.test.ts` builds a host-native standalone binary and stages it with the actual `bundle/` sidecar outside the checkout. It drives the installer against checksummed local release assets through a test-only curl transport, then verifies the real installed binary's setup behavior, compatibility receipt, repeat setup, resource preservation, upgrade, conflict, and checksum-failure paths.

The same test runs the installed executable from a temporary directory outside the checkout with an empty `PATH`. It checks the version and runs setup while Bun and Node are unavailable, using the installed sidecar. The test does not claim cross-target execution.

## Packed Core consumer

`packages/core/tests/integration/packed-package.test.ts` packs Core, installs the tarball into a disposable consumer, typechecks consumer TypeScript against the packed declarations, and exercises public runtime behavior and invalid artifact, event-envelope, and settings cases. Its cleanup verifies that the temporary consumer is removed.

## CI

Pull-request and release verification run explicit TypeScript-source, typecheck, build, unit, integration, Docker E2E, and packed-Core gates. Both workflows run the standalone E2E on native `linux-x64`, `linux-arm64`, `darwin-x64`, and `darwin-arm64` runners; the test checks that the detected native target matches the matrix label. The release workflow's separate cross-compilation job builds release artifacts on Linux x64 and does not claim to execute them on other targets.
