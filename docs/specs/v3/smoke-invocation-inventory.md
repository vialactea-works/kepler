# M01.8 smoke-invocation inventory

M01 validation did not invoke the shell smoke scripts. This inventory records their release callers and the behavior that later milestones must cover. M15.7 replaces installer coverage. M16.5 removes the old smoke scripts and release calls after substantive coverage exists.

## Installer

| Current caller | Existing behavior | Replacement |
| --- | --- | --- |
| `.github/workflows/release.yml`, `verify` job, `Test local installer` step runs `bash scripts/smoke-installer.sh`. The same job runs ShellCheck on this script. | Builds fake release assets and a fake CLI. Checks successful installation, checksum validation, bundle extraction, and that a corrupt binary stops installation before the binary is written. The fake CLI only prints a setup message. | M15.7 replaces the fake assets and CLI with isolated `execa` E2E coverage of release assets, checksums, installation, and real setup behavior. Include valid and invalid generations and resource preservation. |

## Standalone binary

| Current caller | Existing behavior | Replacement |
| --- | --- | --- |
| `.github/workflows/release.yml`, `build` job, `Test binary (linux-x64 only)` step runs `bash scripts/smoke-standalone.sh ./kepler-linux-x64`. The `package` job runs it again after extracting the bundle archive. The `verify` job runs ShellCheck on this script. | Stages the binary and bundle outside the checkout. Runs with an isolated home and a `PATH` without Bun or Node. Checks the exact version, root and workbench help, setup assets, a representative lint operation, and the missing-bundle error without checkout fallback. The package-job call supplies the extracted bundle as an override. | M16.5 replaces these calls with tests of the staged standalone binary and sidecar outside the checkout, with Bun and Node unavailable. M16.6 owns native target-specific distribution checks. M15.7 owns setup compatibility and preservation behavior. |

## Packed Core

| Previous caller | Previous behavior | M01 replacement and later coverage |
| --- | --- | --- |
| The removed `packages/core/scripts/pack-smoke.sh` was called by Core's `test:package` script. Root `test:package` called that script and then the CLI package's `test` script. The release `verify` job used root `test:package`. | Packed Core, installed the archive into a temporary consumer, typechecked a TypeScript consumer against declarations, exercised `KeplerService` and `parseKeplerSettings`, and removed the temporary directory. The script also deleted `packages/core/dist` before packing. | `packages/core/tests/integration/packed-package.test.ts` now packs and installs Core in an isolated consumer, typechecks its declarations, exercises runtime exports, and cleans up. Root and Core `test:package` scripts run this Vitest test. The integration project runs files serially because the pack lifecycle builds `dist`. M16.4 owns broader packed-consumer behavior and failure coverage. |

## Current package and workflow gates

No current package script invokes a shell smoke script. Root `test:package` and Core `test:package` run the packed-Core Vitest integration test. The release `verify` job invokes root `test:package` as a separate gate. The CLI package's `test` script builds both packages, then runs its Vitest files through the named projects. Root `test` runs typecheck, unit, integration, and E2E projects; it does not invoke a smoke script. The test workflow runs root `test`. The release workflow still invokes the installer and standalone scripts listed above; M01 validation did not run those release steps.
