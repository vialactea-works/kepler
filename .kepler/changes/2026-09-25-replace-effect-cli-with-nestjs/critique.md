---
artifact: critique
change: 2026-09-25-replace-effect-cli-with-nestjs
created: 2026-09-25
verdict: changes-requested
decision: accepted
scope: proposal.md, design.md, requirements/cli-distribution.md, requirements/workbench.md
---

# Critique: Replace Effect-TS in the CLI with NestJS — 2026-09-25

## Scope

Four committed propose artifacts (`proposal.md`, `design.md`, and both requirements deltas) were cross-referenced against `.hamilton/specs/cli-distribution.md`, `.hamilton/specs/workbench.md`, the glossary, `AGENTS.md`, the CLI and workbench source, their tests, the release workflow, and `nest-commander`'s documented `CommandFactory` API. `route_unit: null`; both capabilities are modified, with no new or removed capability. Every named current repository module, function, result shape, and version source was checked; `AppModule` and the injectable services are explicitly proposed additions, not mistaken for existing code. The five findings below were validated with the requester and then applied to the proposal, both requirements deltas, and design. The original `changes-requested` verdict remains the record of this review. After the fixes were applied, the requester directed `decision: accepted` as the critique's disposition and approved the revised artifacts. The current validator rejects `decision: applied` despite the critique template documenting it.

## Findings

1. **[Critical] Parsing failures lack an exit-code boundary**
   - Where: `design.md:40,67,70,86-87,94`; `requirements/workbench.md:21,36-39`; `src/cli/commands/workbench.ts:66-70`; `tests/cli/workbench.test.ts:101-119`
   - Problem: The design only maps bootstrap errors and validates combinations in command handlers. Unknown options and missing required option values fail during `nest-commander` parsing, before a handler executes. `nest-commander` documents a separate parser-level `errorHandler`, but the proposed `CommandFactory.run(AppModule)` supplies none. The current CLI returns `2` for `workbench lint --unknown`; relying on the framework default cannot establish the promised stderr and exit-code contract. This violates the explicit error-handling and complete-flow criteria.
   - Fix: Specify a parser-level error handler that maps unknown commands, unknown options, and missing values to one stderr error and exit `2` without executing a use case. Add subprocess regression cases for those paths as well as handler-level invalid combinations.

2. **[Critical] The canonical CLI version is never registered with the new parser**
   - Where: `design.md:40,67,76,105`; `requirements/cli-distribution.md:28-29`; `src/cli/main.ts:5,15-18`; `src/index.ts:1`
   - Problem: The design says the entry point reads `VERSION`, but only specifies `CommandFactory.run(AppModule)`. `nest-commander` enables `--version` through `CommandFactoryRunOptions.version`; reading the constant does not register that option. The existing CLI prints precisely `0.8.10` with status `0`, which `tests/cli/main.test.ts` checks. The described flow therefore cannot meet the committed version scenario as written.
   - Fix: Pass the canonical version to `CommandFactory.run(AppModule, { version: VERSION, ... })` and specify the root command name/registration needed for the existing help layout. Test exact version output in source and in the compiled Linux x64 executable.

3. **[Significant] The chosen Nest provider architecture is absent from the normative requirements**
   - Where: `requirements/workbench.md:12-21`; `requirements/cli-distribution.md:19-29`; `design.md:45-54,69-73,80`; `src/workbench/isolate.ts:223-244`, `src/workbench/diff.ts:883-898`, `src/workbench/context.ts:1312-1317`, `src/workbench/lint.ts:279-288`, `src/workbench/precondition.ts:61-64`, `src/workbench/prototype.ts:231-253`
   - Problem: The workbench SHALL only says that Nest command *adapters* preserve behavior. Wrapping today's exported functions in Nest command classes would satisfy that requirement while bypassing the user's explicit choice that setup and each operation be injectable providers. The design proposes services but does not define whether existing direct function exports remain as delegates or are replaced, despite the workbench tests importing them. This leaves the plan's use-case boundary and test migration ambiguous under the dependency-direction and completeness criteria.
   - Fix: Add an ADDED requirement that setup and each workbench use case execute through a Nest-injected provider. In the design, specify an OOP boundary: Nest classes for commands, each operation's use-case service, and infrastructure adapters; pure artifact parsing and validation remain framework-independent functions. State whether existing exported operation functions delegate to services or their callers/tests migrate, and identify the role-sized injection tokens/ports at the composition boundary.

4. **[Significant] Unqualified option preservation includes Effect-only global flags**
   - Where: `proposal.md:21,34`; `requirements/workbench.md:21`; `design.md:26,40,76,119`; `src/cli/main.ts:9-18`
   - Problem: The existing CLI advertises `--completions`, `--log-level`, and `--wizard` as inherited options on root and command help. The proposal promises all existing options, while the Nest design never implements or intentionally retires these Effect-generated features. A planner cannot tell whether omitting them is a regression; this violates the consistency and scope criteria.
   - Fix: Narrow the compatibility promise to Hamilton's documented command options, list these three Effect-generated options as intentionally removed, and mark the removal as **BREAKING** in the proposal and requirements. Adjust help and option tests to verify the chosen scope rather than silently dropping flags.

5. **[Significant] Setup's current success exit on failure conflicts with the preservation promise**
   - Where: `proposal.md:21`; `design.md:69,88,96`; `requirements/cli-distribution.md:37-49`; `src/cli/commands/setup.ts:185-189`; `.hamilton/specs/cli-distribution.md:33-35`
   - Problem: `setupCommand` currently catches an Effect failure, writes `Setup failed: ...`, and returns without setting `process.exitCode`. A direct test with `HOME` pointing to a regular file produced the error and status `0`. The proposal promises unchanged exit codes, yet the design says setup errors will not be swallowed and the canonical spec says setup fails when assets are unavailable. Preserving status `0` and returning a failing code are incompatible instructions for the implementer.
   - Fix: Explicitly choose the accepted correction: make setup failures exit `2`, keep the existing message and stderr behavior, and document this as an intentional exception to exit-code preservation. Add a subprocess failure test so an error cannot again report success.

## Quality Lens

| Principle | Verdict | Notes |
| --- | --- | --- |
| Single responsibility (cohesion) | ✅ | Setup and the six workbench use cases have separate responsibilities; the requested OOP boundary still needs a concrete migration rule (finding 3). |
| Low coupling / clear boundaries | ⚠️ (→ finding 3) | Role-sized ports are proposed, but the existing free-function-to-provider boundary and test callers are unspecified. |
| Dependency inversion & testable seams | ⚠️ (→ finding 3) | Existing runtime ports and fakeable tests provide seams; their Nest provider binding is not yet a requirement or a complete design. |
| Open for extension | ✅ | One service per existing operation avoids a new switch or plugin registry. |
| Substitutability | ✅ | Preserving the operation result shapes avoids variant-specific checks at the reporter boundary. |
| Interface segregation | ✅ | The design calls for operation-specific Git, filesystem, and process ports rather than a universal runtime dependency. |
| DRY / single source of truth | ⚠️ (→ finding 2) | `src/index.ts` is the version source, but the new parser has no explicit connection to it. |
| Right-sized abstraction (YAGNI) | ⚠️ (→ finding 4) | The three framework-generated global flags need an explicit removal decision, not speculative replacements. |
| Intention-revealing names | ✅ | Setup, isolate, diff, context, precondition, prototype, and lint match canonical capability terminology. |
| Explicit error and edge handling | ❌ (→ findings 1, 5) | Pre-handler parse failures lack a mapping; setup's current error branch exits successfully. |
| Complexity budget | ✅ | The broader provider conversion is a user-chosen cost; preserving pure helpers avoids expanding the Nest container into validation algorithms. |

## Summary

| Severity | Count | Items |
| --- | --- | --- |
| Critical | 2 | 1, 2 |
| Significant | 3 | 3, 4, 5 |
| Minor | 0 | None |

**Recommendation:** The five `changes-requested` findings have been applied and the revised propose artifacts are approved. The next core stage is `hamilton-plan`; do not rerun this settled critique solely to replace its original verdict. The validator's rejection of `applied` remains a schema mismatch, not an unaddressed design finding.
