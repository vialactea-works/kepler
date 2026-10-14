---
artifact: plan
change: 2026-09-12-lint-skill-scripts
status: approved
created: 2026-09-12
author: Hermes Agent
decision: accepted
route_unit: null
---

# Plan: Replace Hamilton Helper Scripts with the Workbench CLI

## Overview

- Change: `.hamilton/changes/2026-09-12-lint-skill-scripts/`
- Goal: Replace the six Hamilton-owned installed shell helpers with a native `hamilton workbench` CLI while preserving their observable behavior, stateful gates, and exit-code contract. Add explicitly scoped artifact linting and migrate setup, skills, tests, and documentation to the distributed implementation.
- Test: `bun --bun vitest run`
- Build / typecheck: `bun run build`
- Context notes: Follow `AGENTS.md`, the accepted proposal and design, and the requirement deltas in `requirements/`. Use ESM `.js` imports, Effect command patterns, pinned dependencies, `Data.TaggedError` for custom errors, real temporary directories and repositories in tests, and no comments in code. The implementation must preserve the old helper semantics while keeping workflow judgment in skills rather than the CLI.
- Quality notes: Tasks follow the design boundaries: shared artifact reading and contracts, scoped linting, one task per stateful operation, command composition, setup migration, consumer migration, documentation, and deletion. Runtime IO is isolated behind narrow seams, artifact validation is shared rather than duplicated, and precondition gates are split into independently testable repository and evidence groups. No structural smell is intentionally accepted.
- Re-plan amendment (2026-09-16): Whole-branch feedback found that global feedback/review frontmatter cannot truthfully represent an append-only pass history. Preserve the single `feedback.md`/`review.md` files and all existing evidence; append Tasks 16–21 so a shared per-pass parser is the sole provenance source for lint, precondition, and context. The parser seam remains pure and narrow, while lint, gate, and informational consumers stay independently testable.
- Re-plan amendment (2026-09-17): Whole-branch review Pass 2 found six remaining defects: the one-pass compatibility rule strands legacy multi-pass histories and the already-migrated root review, execution metadata and Task 21 evidence disagree with their ledgers, two valid progress-ledger shapes are rejected, lint misclassifies read failures, and the CLI drops isolation errors. Tasks 1–21 and their evidence remain frozen; append Tasks 22–30 to define one typed legacy-prefix-to-per-pass-suffix transition, prove every consumer and producer follows it, repair durable execution evidence append-only, and close the independent parser, lint, and stream-routing regressions. The transition binds legacy global provenance only to the physical last legacy pass, treats earlier legacy passes as structural history with unknown provenance, removes the three globals when the first explicit suffix is appended, and never applies a latest verdict to historical passes. Task 27 deliberately makes Task 21 feedback stale by appending canonical evidence, so orchestration must obtain a fresh Task 21 feedback pass from its stable checkpoint before advancing to the next whole-branch review.
- Re-plan amendment (2026-09-17, Task 25 feedback): Task 25 feedback found three documentation-contract defects: three canonical specifications still imply that every pass is fully evidenced, five documents misdescribe `Verdict` as a commit identifier, and concatenated documentation assertions permit cross-document false positives. Tasks 1–25 and their histories remain frozen; append Task 31 to make structural legacy records explicitly provenance-free, distinguish full `Base`/`Head` commit identifiers from the allowed `Verdict` enum, and enforce the transition contract independently in every relevant document. The existing changes-requested Task 25 pass remains history, and orchestration must obtain fresh Task 25 feedback immediately after the Task 31 implementation commit.

## Tasks

### Task 1: Add the shared artifact reader

- Depends on: none
- Files:
  - Created: `src/workbench/artifact-reader.ts`, `tests/workbench/artifact-reader.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - A reader parses the first YAML frontmatter block, returns the source path, metadata, body, and useful line locations, and exposes a discriminated result for recognized, unrelated, and invalid input.
  - Malformed YAML, duplicate keys, an absent `artifact` field inside an attempted frontmatter block, and unreadable files produce typed diagnostics instead of falling back to body or filename inference.
  - Files without frontmatter can be classified for the lint layer without being treated as recognized artifacts by the reader itself.
  - File access is injectable so parser behavior is testable without process or Git state.
- Steps:
  1. Add fixture tests for valid frontmatter, multiline bodies, malformed YAML, duplicate keys, missing artifact metadata, no frontmatter, and read failures; assert structured results and source locations.
  2. Implement the reader with the existing YAML dependency, unique-key/error detection, frontmatter/body separation, and an injected file-reading seam.
  3. Run the targeted reader tests and the build, then refactor only for clarity without changing the result contract.
- Verify: `bun --bun vitest run tests/workbench/artifact-reader.test.ts && bun run build` → all reader tests pass and TypeScript builds cleanly.
- Commit: `feat(workbench): add artifact reader`

### Task 2: Register artifact metadata contracts

- Depends on: Task 1
- Files:
  - Created: `src/workbench/artifact-contracts.ts`, `tests/workbench/artifact-contracts.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - The registry covers every supported pipeline and Wayfinder artifact represented by the installed templates, including proposal, design, requirements, plan, progress, task progress, feedback, review, finish, map, ticket, and route artifacts.
  - Each contract validates required frontmatter fields, allowed values, and path-derived identity such as change, capability, task, effort, or ticket names.
  - Unsupported artifact values and metadata/path conflicts fail closed with structured diagnostics and never become skipped files.
  - Contract results are pure over the reader's parsed metadata and are reusable by lint, context, diff, and precondition without filesystem or Git access.
- Steps:
  1. Add table-driven fixtures for every artifact type, valid metadata, missing fields, invalid enumerations, unsupported values, and path identity mismatches; write the expected diagnostics before implementation.
  2. Implement the typed contract registry and metadata validators against the reader result, keeping artifact dispatch keyed by the declared `artifact` value.
  3. Run the contract tests and build, then simplify duplicated field or identity rules while retaining one authoritative definition per rule.
- Verify: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts && bun run build` → all metadata contract cases pass and TypeScript builds cleanly.
- Commit: `feat(workbench): register artifact contracts`

### Task 3: Validate artifact bodies and workflow records

- Depends on: Task 2
- Files:
  - Created: none
  - Modified: `src/workbench/artifact-contracts.ts`, `tests/workbench/artifact-contracts.test.ts`
  - Deleted: none
- Acceptance:
  - Recognized artifacts validate their required headings, structural sections, and append-only record grammar for the declared artifact type.
  - HTML instruction comments cannot satisfy required headings or records, and checkbox-list validation is not introduced.
  - Plan/task ledgers, task progress, feedback, review, finish, critique, and Wayfinder records expose structured data needed by the stateful operations, including physical-last-pass and legacy-unsupported classification where established behavior requires it.
  - Missing headings, malformed records, non-monotonic append-only numbering, and unsupported legacy layouts produce location-bearing diagnostics rather than inferred success.
- Steps:
  1. Add body fixtures for every contract family, including valid finalized bodies, missing headings, comment-only headings, malformed records, stale numbering, and legacy layouts; assert structured diagnostics and extracted workflow state.
  2. Implement comment-aware body views and the contract-specific heading, section, record, ledger, and evidence validators on top of the metadata registry.
  3. Run the artifact contract tests and build, then verify that shared workflow parsing is consumed through the registry instead of duplicated in future operation modules.
- Verify: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts && bun run build` → all body and workflow-record cases pass and TypeScript builds cleanly.
- Commit: `feat(workbench): validate artifact bodies`

### Task 4: Implement explicitly scoped linting

- Depends on: Task 3
- Files:
  - Created: `src/workbench/lint.ts`, `tests/workbench/lint.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - The lint operation requires exactly one selector, `file` or `changeDir`; missing or conflicting selectors return a usage result without inspecting either scope.
  - `file` validates only an existing regular file, while `changeDir` recursively considers regular files contained by the supplied directory, sorts candidates deterministically, and does not follow outside-target symlinks.
  - Recognized frontmatter is validated by the shared contracts, conventional Hamilton artifact filenames without frontmatter emit warnings and fail, and unrelated files are reported as skipped without failing.
  - All findings include paths and useful line or structural locations, all findings are reported in sorted order, and the result distinguishes success, lint findings, and invalid scope.
- Steps:
  1. Create temporary-directory tests for each selector, missing/both selectors, invalid paths, nested files, outside symlinks, valid artifacts, malformed artifacts, conventional filenames without frontmatter, unrelated files, multiple findings, and deterministic ordering.
  2. Implement scope validation, regular-file traversal, containment checks, reader/contract dispatch, diagnostic rendering, and the `0`/`1`/`2` result mapping without introducing a current-directory default.
  3. Run the lint suite and build, then inspect the rendered diagnostics for stable paths, severity, and locations.
- Verify: `bun --bun vitest run tests/workbench/lint.test.ts && bun run build` → all scope and diagnostic cases pass and TypeScript builds cleanly.
- Commit: `feat(workbench): add scoped artifact lint`

### Task 5: Establish runtime seams for isolation

- Depends on: none
- Files:
  - Created: `src/workbench/runtime.ts`, `src/workbench/isolate.ts`, `tests/workbench/helpers.ts`, `tests/workbench/isolate.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - Isolation preserves check, create, and verify behavior, including linked-worktree detection, non-default-branch handling, title/path validation, and negative results on an unisolated default checkout.
  - Git, filesystem, and process effects are hidden behind narrow injectable ports and the production runtime adapter; operation policy does not depend on a mutable global IO object.
  - Mutation failures return non-success without printing a successful isolation verdict, and successful results retain the load-bearing output line.
- Steps:
  1. Port the existing temporary-repository isolation scenarios and injected command-failure cases into `tests/workbench/isolate.test.ts`; add shared disposable-repository helpers for later workbench suites.
  2. Implement the role-sized runtime ports and the isolation operation against those ports, preserving the old argument and result semantics.
  3. Run the isolation tests and build, then verify real worktree behavior in disposable repositories and policy behavior through injected failures.
- Verify: `bun --bun vitest run tests/workbench/isolate.test.ts && bun run build` → isolation scenarios pass and TypeScript builds cleanly.
- Commit: `feat(workbench): port isolation operation`

### Task 6: Port prototype branching

- Depends on: Task 5
- Files:
  - Created: `src/workbench/prototype.ts`, `tests/workbench/prototype.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - Mapped and standalone prototype flows preserve branch identity, create/resume/switch behavior, verification, and invalid-argument handling.
  - Branch mutations happen only after their repository preconditions pass, and failures never report a successful branch result.
  - The operation uses the shared runtime seam and retains the former final branch/result output required by Wayfinder.
- Steps:
  1. Port the existing prototype branch fixture matrix into temporary-repository tests for mapped, standalone, resume, verify, collision, and failure cases.
  2. Implement the prototype operation with the runtime's narrow branch ports and the existing branch naming rules.
  3. Run the prototype tests and build, then inspect the branch state after every successful and failed mutation case.
- Verify: `bun --bun vitest run tests/workbench/prototype.test.ts && bun run build` → all prototype scenarios pass and TypeScript builds cleanly.
- Commit: `feat(workbench): port prototype branching`

### Task 7: Port diff packaging

- Depends on: Tasks 3 and 5
- Files:
  - Created: `src/workbench/diff.ts`, `tests/workbench/diff.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - Record mode creates exactly one stable task checkpoint only for a genuine first attempt and never overwrites an existing checkpoint.
  - Task, explicit-base, and whole-change packaging preserve ancestry checks, output paths, current-HEAD handling, and invalid-argument/environment results.
  - A package failure or invalid range stops before reporting a successful package, while successful output retains the full Base, Head, and package-path information consumed by skills.
- Steps:
  1. Port checkpoint and range fixtures into disposable repositories, covering first record, retry, historical checkpoint, task scope, explicit base, whole change, invalid ancestry, and output failures.
  2. Implement diff policy against the shared artifact contracts and runtime Git/filesystem ports without rebasing or reconstructing historical task ranges from current HEAD.
  3. Run the diff tests and build, then inspect generated package contents and checkpoint stability.
- Verify: `bun --bun vitest run tests/workbench/diff.test.ts && bun run build` → all checkpoint and package cases pass and TypeScript builds cleanly.
- Commit: `feat(workbench): port diff packaging`

### Task 8: Port change context

- Depends on: Tasks 3 and 5
- Files:
  - Created: `src/workbench/context.ts`, `tests/workbench/context.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - Single-change and `--all` context reports preserve artifact inventory, task status, feedback/review freshness, route metadata, and deterministic output.
  - Current frontmatter artifacts use shared typed inspection, while legacy or incomplete layouts retain the established `pre-plan` and `legacy-unsupported` classifications instead of being silently reinterpreted.
  - Invalid paths and unreadable changes return environment errors without producing a misleading successful context result.
- Steps:
  1. Port context fixtures for one change, all changes, current split state, pre-plan state, legacy layout, malformed artifacts, freshness states, and invalid paths.
  2. Implement context discovery and rendering on top of shared artifact inspection and narrow Git/runtime metadata ports, without duplicating YAML parsing.
  3. Run the context tests and build, then compare representative output against the former helper's load-bearing fields.
- Verify: `bun --bun vitest run tests/workbench/context.test.ts && bun run build` → all context states pass and TypeScript builds cleanly.
- Commit: `feat(workbench): port change context`

### Task 9: Port repository precondition gates

- Depends on: Tasks 3 and 5
- Files:
  - Created: `src/workbench/precondition.ts`, `tests/workbench/precondition.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - The precondition operation evaluates repository cleanliness and the supplied project test command against the requested change repository, preserving normal negative results and environment failures.
  - Tests that fail, mutate the worktree, or cannot be executed close the gate without a success result and without inferring a waiver.
  - The operation uses injected command and Git seams for policy tests and real temporary repositories for integration behavior.
- Steps:
  1. Port clean-tree, test-command, post-test mutation, missing-command, and target-repository fixtures; assert the exact gate result and output for each case.
  2. Implement the repository-level precondition gates against the runtime and shared artifact-inspection interfaces, keeping command execution separate from gate policy.
  3. Run the precondition repository-gate tests and build, then verify no failed gate reports success.
- Verify: `bun --bun vitest run tests/workbench/precondition.test.ts -t "repository" && bun run build` → repository-gate cases pass and TypeScript builds cleanly.
- Commit: `feat(workbench): port repository preconditions`

### Task 10: Port evidence freshness gates

- Depends on: Task 9
- Files:
  - Created: none
  - Modified: `src/workbench/precondition.ts`, `tests/workbench/precondition.test.ts`
  - Deleted: none
- Acceptance:
  - Task ledger, task progress, feedback, review, ancestry, freshness, blocking-finding, and explicit whole-change waiver rules preserve the former fail-closed behavior.
  - Missing, malformed, stale, mixed, uncommitted, or contradictory evidence never inherits an earlier approval; the waiver changes only the explicitly permitted material-change check.
  - Successful output retains the final precondition result line and identifies the verified gate state needed by finish-work.
- Steps:
  1. Port evidence fixtures for exact split ledgers, task statuses, latest attempts, feedback/review verdicts, Base/Head ancestry, stale and mixed commits, blocking findings, and the narrow waiver cases.
  2. Implement the evidence gates using the shared workflow-record validators and physical Git history, preserving stage ownership and fail-closed decisions.
  3. Run the complete precondition suite and build, then inspect successful and failed outputs against the requirement scenarios.
- Verify: `bun --bun vitest run tests/workbench/precondition.test.ts && bun run build` → all repository and evidence gate cases pass and TypeScript builds cleanly.
- Commit: `feat(workbench): port evidence preconditions`

### Task 11: Compose the workbench CLI

- Depends on: Tasks 4, 6, 7, 8, and 10
- Files:
  - Created: `src/cli/commands/workbench.ts`, `tests/cli/workbench.test.ts`
  - Modified: `src/cli/main.ts`
  - Deleted: none
- Acceptance:
  - `hamilton workbench` exposes `isolate`, `diff`, `precondition`, `context`, `prototype`, and `lint` with their former argument meanings, while artifact contracts remain internal.
  - CLI parsing rejects unknown options, missing values, invalid combinations, missing lint scope, and both lint selectors with exit `2` before stateful work begins.
  - Subprocess tests exercise the actual command path for successful results, normal negative checks, failed operations, lint findings, help output, and the final machine-readable result lines.
  - The command runs without a source checkout or `~/.hamilton/scripts/` dependency and uses the production runtime adapter only at the composition boundary.
- Steps:
  1. Add command-level and subprocess tests that invoke the real Bun entrypoint with temporary repositories and change directories, covering help, every subcommand, exit statuses, and invalid argument combinations.
  2. Implement the namespaced Effect command, option parsing, operation factories, runtime wiring, result rendering, and root CLI composition without moving workflow judgment into handlers.
  3. Run the CLI suite and build, then verify the command starts with stale helper files absent and reports the expected final result lines.
- Verify: `bun --bun vitest run tests/cli/workbench.test.ts && bun run build` → actual CLI scenarios pass and TypeScript builds cleanly.
- Commit: `feat(cli): add workbench commands`

### Task 12: Remove script installation from setup

- Depends on: Task 11
- Files:
  - Created: none
  - Modified: `src/cli/commands/setup.ts`, `src/paths.ts`, `tests/cli/setup.test.ts`, `tests/paths.test.ts`
  - Deleted: none
- Acceptance:
  - Fresh setup continues to install templates, guidelines, settings, and the Hamilton home while creating and reporting no helper scripts or new `~/.hamilton/scripts/` directory.
  - Setup succeeds when the bundle has no `scripts/` directory and leaves a pre-existing scripts directory and its contents byte-for-byte unchanged.
  - Path helpers and setup results no longer expose script installation as a supported asset.
- Steps:
  1. Update temporary-HOME and bundle-override tests for fresh setup, missing bundle scripts, and an existing stale script directory; assert the expected red behavior before implementation.
  2. Remove script-directory creation, copy, and reporting from setup and remove obsolete path helpers while retaining all other setup behavior.
  3. Run setup and path tests and build, then inspect the resulting HOME tree and setup output.
- Verify: `bun --bun vitest run tests/cli/setup.test.ts tests/paths.test.ts && bun run build` → all setup migration cases pass and TypeScript builds cleanly.
- Commit: `refactor(cli): stop installing helper scripts`

### Task 13: Migrate skills to workbench commands

- Depends on: Tasks 11 and 12
- Files:
  - Created: `tests/skills/workbench-contract.test.ts`
  - Modified: `skills/hamilton-propose/SKILL.md`, `skills/hamilton-plan/SKILL.md`, `skills/hamilton-code/SKILL.md`, `skills/hamilton-orchestrate/SKILL.md`, `skills/hamilton-critique/SKILL.md`, `skills/hamilton-finish-work/SKILL.md`, `skills/hamilton-wayfinder-prototype/SKILL.md`, `tests/skills/finish-work-contract.test.ts`, `tests/skills/orchestrate-contract.test.ts`
  - Deleted: none
- Acceptance:
  - Every maintained Hamilton skill that formerly invoked a Hamilton-owned helper calls the matching `hamilton workbench` subcommand with equivalent arguments and no maintained skill invokes `~/.hamilton/scripts/`.
  - Skill-owned judgment, ordering, fail-closed behavior, task/review ownership, and migration boundaries remain in the skills rather than being delegated to the CLI.
  - Contract tests cover the complete former call-site mapping, including isolate, diff, context, precondition, and prototype commands.
- Steps:
  1. Update skill contract tests to assert the new command mappings and to fail on stale helper paths or altered ownership language.
  2. Replace each documented helper invocation in the seven affected skills with the corresponding workbench invocation, preserving flags, sequencing, and evidence handling.
  3. Run the focused skill-contract suites and build, then search all maintained skills for obsolete helper references.
- Verify: `bun --bun vitest run tests/skills/finish-work-contract.test.ts tests/skills/orchestrate-contract.test.ts tests/skills/workbench-contract.test.ts && bun run build` → all consumer contracts pass and no maintained skill references the old support surface.
- Commit: `docs(skills): migrate helper calls to workbench`

### Task 14: Update framework documentation

- Depends on: Task 13
- Files:
  - Created: `tests/docs/workbench-docs.test.ts`
  - Modified: `README.md`, `docs/modes.md`, `docs/skills.md`, `docs/sdd-framework.md`
  - Deleted: none
- Acceptance:
  - Setup and migration documentation presents the distributed workbench as the supported Hamilton workflow-mechanics surface and no longer instructs readers to install or verify the six helper scripts.
  - Documentation names all relevant workbench subcommands and explains that lint requires exactly one of `--file <file>` or `--change-dir <dir>`, including recursive boundary, skipped-file, warning, and fail-closed behavior.
  - Migration guidance states that CLI and skills update together, setup does not delete stale helper files, and `hamilton purge` remains explicit cleanup.
- Steps:
  1. Add focused documentation assertions for the setup, workbench, lint, and between-changes migration requirements; make them fail against the current text.
  2. Rewrite the affected README, mode, skills-reference, and framework sections to describe the new command without changing unrelated guidance.
  3. Run the documentation test, search for stale supported instructions, and inspect the rendered Markdown diff for accurate command examples.
- Verify: `bun --bun vitest run tests/docs/workbench-docs.test.ts && git diff --check && ! rg -n "hamilton-(artifact-contracts|change-context|diff-package|isolate|precondition-check|prototype-branch)|~/.hamilton/scripts/" README.md docs` → documentation assertions pass, whitespace is clean, and no stale user-facing instruction remains.
- Commit: `docs: document workbench migration`

### Task 15: Delete obsolete shell helpers and tests

- Depends on: Task 14
- Files:
  - Created: none
  - Modified: none
  - Deleted: `bundle/scripts/hamilton-artifact-contracts.sh`, `bundle/scripts/hamilton-change-context.sh`, `bundle/scripts/hamilton-diff-package.sh`, `bundle/scripts/hamilton-isolate.sh`, `bundle/scripts/hamilton-precondition-check.sh`, `bundle/scripts/hamilton-prototype-branch.sh`, `tests/scripts/change-context.test.ts`, `tests/scripts/diff-package.test.ts`, `tests/scripts/helpers.ts`, `tests/scripts/isolate.test.ts`, `tests/scripts/precondition-check.test.ts`, `tests/scripts/prototype-branch.test.ts`
- Acceptance:
  - The six Hamilton shell helpers and their obsolete shell-execution test suite are no longer tracked or required by setup, skills, docs, or source code.
  - The operation-focused workbench suites cover the former behavior before deletion, and no duplicate supported implementation remains.
  - The complete project test and build gates pass with the shell helper files absent.
- Steps:
  1. Confirm all former behavior cases are represented by `tests/workbench/`, all consumers use the workbench, and no source or documentation path still requires the deleted files.
  2. Delete the six bundle scripts and the legacy `tests/scripts/` files, then remove any now-unused references revealed by the compiler or search.
  3. Run the full test suite, build, whitespace check, and repository search; inspect the final changed-file list for accidental deletions.
- Verify: `bun --bun vitest run && bun run build && git diff --check && ! rg -n "hamilton-(artifact-contracts|change-context|diff-package|isolate|precondition-check|prototype-branch)|~/.hamilton/scripts/" src bundle skills README.md docs tests` → all tests and the build pass, the diff has no whitespace errors, and no maintained implementation references the removed helpers.
- Commit: `refactor: remove shell helper implementation`

### Task 16: Align per-pass feedback and review producers

- Depends on: none
- Files:
  - Created: none
  - Modified: `bundle/templates/feedback.md`, `bundle/templates/review.md`, `skills/hamilton-code-feedback/SKILL.md`, `skills/hamilton-review/SKILL.md`, `skills/hamilton-orchestrate/references/code-feedback-prompt.md`, `skills/hamilton-orchestrate/references/whole-branch-review-prompt.md`, `tests/templates/artifact-contracts.test.ts`, `tests/skills/code-feedback-contract.test.ts`, `tests/skills/review-contract.test.ts`, `tests/skills/orchestrate-contract.test.ts`
  - Deleted: none
- Acceptance:
  - The feedback and review templates retain only artifact identity and lifecycle frontmatter; each `## Pass N` contains exactly one full `Base:`, `Head:`, and `Verdict:` field before its findings.
  - A pass has only `### Blocking` and `### Suggestions` child sections, and both producer skills and orchestration prompts instruct authors to append that same shape at the physical end without creating `feedback-<k>.md` or rewriting prior passes.
  - Template and skill-contract tests fail for global pass provenance or an extra pass child section and pass for the single-file append-only shape.
- Steps:
  1. Update template and skill-contract assertions to require per-pass Base, Head, and Verdict fields, the two allowed child sections, and continued single-file append-only ownership; run the focused tests to establish the red state.
  2. Move Base, Head, and Verdict out of the feedback/review frontmatter into each pass in both templates, then update the two producer skills and their orchestrator dispatch prompts to author, validate, and report those per-pass values.
  3. Run the focused template and skill-contract suites, inspect the template and producer diffs for a single authoritative pass shape, and refactor wording only for clarity.
- Verify: `bun --bun vitest run tests/templates/artifact-contracts.test.ts tests/skills/code-feedback-contract.test.ts tests/skills/review-contract.test.ts tests/skills/orchestrate-contract.test.ts && bun run build` → template and producer contracts pass and TypeScript builds cleanly.
- Commit: `docs(review): record provenance per pass`

### Task 17: Parse and validate per-pass review evidence

- Depends on: Task 16
- Files:
  - Created: `src/workbench/review-passes.ts`, `tests/workbench/review-passes.test.ts`
  - Modified: `src/workbench/artifact-body.ts`, `src/workbench/artifact-contracts.ts`, `src/workbench/artifact-schemas.ts`, `src/workbench/artifact-types.ts`, `tests/workbench/artifact-contracts.test.ts`, `tests/workbench/artifact-schemas.test.ts`
  - Deleted: none
- Acceptance:
  - One pure shared parser returns typed pass evidence and location-bearing diagnostics for feedback and review artifacts, including per-pass full Base, Head, Verdict, pass number/date, Blocking, and Suggestions.
  - The parser requires contiguous pass numbering; exactly one Base, Head, and Verdict before the child sections; full commit identifiers; allowed verdicts; non-contradictory findings; and only Blocking/Suggestions child sections. Its physical last pass governs and malformed last evidence never revives an older approval.
  - A historical `changes-requested` pass followed by an `approved` pass is valid when each pass is complete, while an existing unambiguous one-pass artifact with global Base, Head, and Verdict remains safely readable as compatibility evidence; ambiguous or multi-pass global-frontmatter artifacts fail closed.
  - Artifact schemas and contracts consume the shared parser rather than retaining a second feedback/review grammar.
- Steps:
  1. Add parser and contract fixtures for valid multi-pass history, changes-requested followed by approved, duplicate/missing/misordered fields, invalid hashes/verdicts, illegal child headings, contradictory findings, malformed physical-last passes, and the bounded one-pass global-frontmatter compatibility case; run the focused suites to establish the red state.
  2. Implement the pure per-pass parser with typed evidence and diagnostics, remove Base/Head/Verdict from new feedback/review metadata requirements, and delegate feedback/review body validation to the parser through the shared artifact contract seam.
  3. Run the parser, contract, and schema suites with the build, then simplify any duplicated pass extraction so the parser is the single source of truth.
- Verify: `bun --bun vitest run tests/workbench/review-passes.test.ts tests/workbench/artifact-contracts.test.ts tests/workbench/artifact-schemas.test.ts && bun run build` → strict and compatibility pass evidence cases pass and TypeScript builds cleanly.
- Commit: `feat(workbench): parse review passes`

### Task 18: Lint per-pass review evidence

- Depends on: Task 17
- Files:
  - Created: none
  - Modified: `src/workbench/lint.ts`, `tests/workbench/lint.test.ts`
  - Deleted: none
- Acceptance:
  - `hamilton workbench lint` rejects malformed feedback and review pass evidence emitted by the shared parser with deterministic, source-located diagnostics and exit `1`.
  - Valid multi-pass artifacts, including historical changes-requested followed by approved, lint successfully; only the explicit one-pass compatibility shape is accepted from legacy global frontmatter.
  - Lint keeps its current explicit scope, skipped-file behavior, finding order, and `0`/`1`/`2` result semantics.
- Steps:
  1. Add lint fixtures for every per-pass parser failure class and the valid multi-pass and compatibility cases; assert rendered path/line diagnostics and exit codes before implementation.
  2. Route feedback/review contract diagnostics through lint without local pass parsing or altered scope policy.
  3. Run the lint suite and build, then inspect the deterministic rendered output for representative malformed passes.
- Verify: `bun --bun vitest run tests/workbench/lint.test.ts && bun run build` → malformed feedback/review passes fail lint with stable diagnostics while valid evidence succeeds.
- Commit: `test(workbench): lint review pass evidence`

### Task 19: Gate preconditions on parsed review evidence

- Depends on: Task 17
- Files:
  - Created: none
  - Modified: `src/workbench/precondition-reviews.ts`, `tests/workbench/precondition.test.ts`
  - Deleted: none
- Acceptance:
  - Precondition reads the shared parsed latest feedback/review pass instead of artifact-global Base, Head, or Verdict fields, preserving all existing durability, ancestry, freshness, blocking, waiver, and fail-closed gate rules.
  - A valid requested-change pass followed by a valid fresh approved pass can open the relevant evidence gate; malformed, contradictory, stale, or ambiguous compatibility evidence closes it without falling back to earlier approval.
  - No precondition module retains an independent pass-section or metadata parser.
- Steps:
  1. Extend real-repository precondition fixtures with multi-pass task feedback and whole review cases covering requested-change then approval, malformed latest pass, stale latest approval, and compatibility evidence; run the focused tests to establish the red state.
  2. Replace local feedback/review extraction with the shared parsed pass result and carry its latest Base, Head, Verdict, and Blocking state through the existing gate checks.
  3. Run the complete precondition suite and build, then search the precondition review module for duplicate pass grammar.
- Verify: `bun --bun vitest run tests/workbench/precondition.test.ts && bun run build` → precondition preserves its gate semantics while using only parsed latest pass evidence.
- Commit: `refactor(workbench): share review evidence gates`

### Task 20: Report context from parsed review evidence

- Depends on: Task 17
- Files:
  - Created: none
  - Modified: `src/workbench/context.ts`, `tests/workbench/context.test.ts`
  - Deleted: none
- Acceptance:
  - Context derives task feedback and whole-review standing from the shared parsed latest pass evidence rather than global frontmatter or a local legacy-pass parser.
  - Context reports valid requested-change then approved history according to its existing informational standing vocabulary, and reports malformed or ambiguous evidence as `malformed` without changing a context request into a gate failure.
  - Pre-plan, legacy-unsupported, inventory ordering, freshness labels, and nonzero environment-error behavior remain unchanged.
- Steps:
  1. Add context fixtures for valid multi-pass feedback/review, requested-change then approval, malformed physical-last passes, and the allowed one-pass compatibility artifact; assert the existing informational output and result semantics before implementation.
  2. Replace context-local pass extraction with the shared parser while retaining the established layout classification and freshness calculations.
  3. Run the context suite and build, then inspect one rendered current change and one malformed change for unchanged informational semantics.
- Verify: `bun --bun vitest run tests/workbench/context.test.ts && bun run build` → context reports parsed pass standing without turning malformed evidence into an environment error.
- Commit: `refactor(workbench): share context review evidence`

### Task 21: Synchronize per-pass evidence specifications and verification

- Depends on: Tasks 16, 17, 18, 19, and 20
- Files:
  - Created: none
  - Modified: `.hamilton/specs/artifact-templates.md`, `.hamilton/specs/review.md`, `.hamilton/specs/workbench.md`, `docs/sdd-framework.md`, `docs/skills.md`, `tests/cli/workbench.test.ts`
  - Deleted: none
- Acceptance:
  - Canonical specifications and framework documentation define Base, Head, and Verdict as per-pass feedback/review evidence; they retain the single-file append-only model and name the bounded one-pass global-frontmatter compatibility rule.
  - An end-to-end CLI regression covers a change whose feedback and review histories have multiple passes and proves lint, context, and precondition agree on the physically latest parsed evidence and fail closed for malformed latest evidence.
  - The full repository suite, build, and whitespace check pass without modifying production implementation files outside Tasks 16–20.
- Steps:
  1. Add the end-to-end CLI regression for aligned valid and malformed multi-pass evidence, then update canonical-spec and documentation assertions or inspection expectations to establish the red state.
  2. Synchronize the three canonical specs and the framework/skills documentation with the implemented per-pass contract, compatibility boundary, ownership, and consumer behavior without introducing numbered feedback files.
  3. Run focused end-to-end coverage, the full suite, build, and whitespace check; inspect the documentation and changed-path diff to confirm the remediation is fully described.
- Verify: `bun --bun vitest run tests/cli/workbench.test.ts && bun --bun vitest run && bun run build && git diff --check` → end-to-end evidence consumers agree, all tests and the build pass, and the diff has no whitespace errors.
- Commit: `docs: synchronize per-pass review evidence`

### Task 22: Model legacy review transitions

- Depends on: none
- Files:
  - Created: none
  - Modified: `src/workbench/artifact-types.ts`, `src/workbench/review-passes.ts`, `src/workbench/artifact-body.ts`, `tests/workbench/review-passes.test.ts`, `tests/workbench/artifact-contracts.test.ts`
  - Deleted: none
- Acceptance:
  - Review history is represented by a discriminated typed record: fully evidenced records carry required Base, Head, and Verdict plus a `per-pass` or `legacy-global` provenance source, while earlier fieldless legacy records are explicitly structural and cannot be consumed as verdict evidence. `ReviewPassParseResult.latest` remains a fully evidenced record, so lint, context, and precondition cannot accidentally read absent legacy provenance.
  - The parser accepts exactly three complete history modes: a legacy-only fieldless history with one complete global `base`/`head`/`verdict` triple bound only to its physical last pass; a transitioned history with a nonempty fieldless legacy prefix, no global triple, and a nonempty suffix whose every pass has ordered pass-local Base, Head, and Verdict; and a modern history whose every pass has pass-local evidence and no globals.
  - A legacy multi-pass history may contain historical blocking findings followed by a globally approved physical-last pass without interpreting the historical passes as approved. The current root-review shape—a preserved fieldless Pass 1 followed by explicit Pass 2 with no globals—is valid, and its explicit physical-last pass is authoritative.
  - Partial global triples, globals beside any explicit suffix, partial pass-local triples, fieldless passes after the explicit suffix begins, legacy-only histories without globals, contradictory evidenced verdicts/findings, malformed physical-last passes, unsupported child headings, and non-contiguous numbering fail closed with the existing location-bearing diagnostic vocabulary.
- Steps:
  1. Add failing parser and artifact-contract fixtures for old multi-pass global histories with historical blockers, the current migrated root-review shape, strict modern history, and every ambiguous transition boundary; assert the provenance discriminator, structural-only historical records, fully evidenced `latest`, and source locations.
  2. Replace the compatibility boolean with the explicit history-state parser and discriminated record types, bind global evidence only to the last legacy record, expose only complete evidence as `latest`, and adapt artifact workflow extraction without inventing Base, Head, or Verdict for structural history.
  3. Run the focused parser and contract suites plus the build, then inspect the implementation for any path that seeds more than one pass from global metadata or permits a fieldless record after explicit evidence begins.
- Verify: `bun --bun vitest run tests/workbench/review-passes.test.ts tests/workbench/artifact-contracts.test.ts && bun run build` → legacy-only, transitioned, and modern histories pass their exact fixtures; ambiguous or malformed histories fail closed; TypeScript builds cleanly.
- Commit: `fix(workbench): support legacy review transitions`

### Task 23: Verify review transition consumers

- Depends on: Task 22
- Files:
  - Created: none
  - Modified: `src/workbench/context.ts`, `src/workbench/precondition-reviews.ts`, `tests/workbench/lint.test.ts`, `tests/workbench/context.test.ts`, `tests/workbench/precondition.test.ts`, `tests/cli/workbench.test.ts`
  - Deleted: none
- Acceptance:
  - Lint, context, and precondition consume the shared parser's fully evidenced `latest` value and retain no local rule that applies global metadata to historical passes or reconstructs missing provenance.
  - All three consumers agree on old global multi-pass histories whose earlier passes contain blockers and whose physical last pass is approved, and on migrated fieldless-prefix plus explicit-suffix histories; lint succeeds, context reports the explicit or legacy-global latest standing, and a fresh approved latest pass can satisfy the review gate.
  - All three consumers reject an illegal transition or malformed physical-last pass without reviving earlier approval. Context keeps its informational malformed result, lint returns findings/exit `1`, and precondition keeps the gate closed.
  - An end-to-end CLI fixture exercises both accepted transition modes and one malformed boundary so integration cannot diverge even if the parser's internal representation changes.
- Steps:
  1. Add failing lint, context, precondition, and CLI fixtures using the same old-global and migrated-prefix histories, including historical blockers and a malformed physical-last transition; assert each operation's established output and exit semantics.
  2. Adapt context and precondition to consume only the parser's complete latest evidence, leaving lint routed through the artifact contract, and remove or reject any fallback to artifact-global fields or raw last-record indexing.
  3. Run all four focused suites and the build, then search the three consumers for independent Base/Head/Verdict history parsing.
- Verify: `bun --bun vitest run tests/workbench/lint.test.ts tests/workbench/context.test.ts tests/workbench/precondition.test.ts tests/cli/workbench.test.ts && bun run build` → every consumer agrees on accepted and rejected transition histories with unchanged operation-level result semantics.
- Commit: `fix(workbench): share review transition evidence`

### Task 24: Teach review producers the transition

- Depends on: Task 22
- Files:
  - Created: none
  - Modified: `bundle/templates/feedback.md`, `bundle/templates/review.md`, `skills/hamilton-code-feedback/SKILL.md`, `skills/hamilton-review/SKILL.md`, `skills/hamilton-orchestrate/references/code-feedback-prompt.md`, `skills/hamilton-orchestrate/references/whole-branch-review-prompt.md`, `tests/templates/artifact-contracts.test.ts`, `tests/skills/code-feedback-contract.test.ts`, `tests/skills/review-contract.test.ts`, `tests/skills/orchestrate-contract.test.ts`
  - Deleted: none
- Acceptance:
  - Fresh feedback and review files still use identity/lifecycle-only frontmatter and complete pass-local Base, Head, and Verdict fields; the only child sections remain Blocking and Suggestions, and numbered `feedback-<k>.md` or `review-<k>.md` files remain forbidden.
  - Both producer skills and both orchestration prompts define one deterministic first-append transition: validate the legacy-global history, preserve every existing pass body byte-for-byte, remove exactly the global `base`, `head`, and `verdict` fields, and append the next complete pass-local record at the physical end in the same mutation. They never copy global provenance into historical passes or retain globals beside an explicit suffix.
  - Producers append normally to an already transitioned or modern history and fail closed for partial globals, mixed global-plus-explicit evidence, missing legacy globals without an explicit suffix, or any fieldless pass after the suffix begins. The already-migrated root-review shape is recognized as transitioned rather than rewritten.
  - Template and skill-contract tests assert the fresh shape, the one-time transition procedure, history preservation, strict suffix rule, and continued rejection of `### Reviewed range` blocks.
- Steps:
  1. Add failing template and skill-contract assertions for the exact one-time transition procedure and rejection boundaries while retaining the current strict fresh-file assertions.
  2. Update template authoring guidance, both producer skills, and both dispatch prompts to follow the shared parser modes and atomic metadata-removal-plus-append transition without changing any live feedback or review artifact.
  3. Run the focused template and skill suites and build, then inspect all six producer surfaces for identical transition semantics and no alternative numbered-file path.
- Verify: `bun --bun vitest run tests/templates/artifact-contracts.test.ts tests/skills/code-feedback-contract.test.ts tests/skills/review-contract.test.ts tests/skills/orchestrate-contract.test.ts && bun run build` → producer contracts describe one transition and all focused assertions pass.
- Commit: `docs(review): teach legacy pass transition`

### Task 25: Document the review transition contract

- Depends on: Tasks 23 and 24
- Files:
  - Created: none
  - Modified: `.hamilton/specs/artifact-templates.md`, `.hamilton/specs/review.md`, `.hamilton/specs/workbench.md`, `docs/sdd-framework.md`, `docs/skills.md`, `tests/docs/workbench-docs.test.ts`
  - Deleted: none
- Acceptance:
  - Canonical specifications define the same three history modes and one-time transition as the parser and producers, state that global provenance applies only to the physical last legacy pass, and distinguish structural legacy history from fully evidenced verdict records.
  - Framework documentation explains that the first modern append removes legacy global provenance while preserving all pass bodies and starts a strict explicit suffix; later appends remain pass-local, the physical latest evidenced pass governs, and malformed transitions fail closed.
  - The obsolete one-pass-only compatibility claim is removed from the touched specifications and documentation without weakening single-file append-only ownership, full commit identifiers, freshness checks, or the prohibition on numbered feedback/review files.
  - Documentation contract tests cover the transition semantics and the touched Markdown remains clean.
- Steps:
  1. Add failing documentation assertions for legacy-global binding, structural prefixes, the atomic first-append transition, and strict per-pass suffixes.
  2. Synchronize the three canonical specifications and two framework documents with the implemented state machine, using one vocabulary across parser, consumers, and producers.
  3. Run the documentation suite, build, whitespace check, and a focused search proving the superseded one-pass-only language is gone from the touched documents.
- Verify: `bun --bun vitest run tests/docs/workbench-docs.test.ts && bun run build && git diff --check && ! rg -n "one-pass (global-frontmatter )?compatibility|only for a one-pass history|only when the artifact contains exactly one pass" .hamilton/specs/artifact-templates.md .hamilton/specs/review.md .hamilton/specs/workbench.md docs/sdd-framework.md docs/skills.md` → documentation tests and build pass, whitespace is clean, and only the new transition contract remains.
- Commit: `docs(review): define legacy transition contract`

### Task 26: Synchronize root progress metadata

- Depends on: none
- Files:
  - Created: none
  - Modified: `.hamilton/changes/2026-09-12-lint-skill-scripts/progress.md`
  - Deleted: none
- Acceptance:
  - Frontmatter entries for Tasks 18–21 read `done`, matching the frozen body rows and their existing task logs; no Task 1–21 body row, title, link, identifier, or task-local history is changed.
  - At the Task 26 implementation commit, every root frontmatter task entry and body row has the same plan-order identity, title, status, and `tasks/task-N/progress.md` link, including the actual execution state of newly appended Tasks 22–30.
  - Workbench task inspection no longer reports `progress metadata ledger does not match`; unrelated pending-task and review failures remain visible rather than being waived.
- Steps:
  1. Run the current precondition against the change with `--test-cmd true` and capture the four metadata mismatch failures as red evidence.
  2. Change only the stale frontmatter status values and any new-task metadata status that does not match its body row; preserve the frozen Tasks 1–21 body table and all task files.
  3. Lint the root progress artifact, rerun precondition, and inspect its task-gate output to prove the metadata mismatch is gone while legitimate remaining gates still fail closed.
- Verify: `bun run src/cli/main.ts workbench lint --file .hamilton/changes/2026-09-12-lint-skill-scripts/progress.md` → exits `0`; then `bun run src/cli/main.ts workbench precondition --change-dir .hamilton/changes/2026-09-12-lint-skill-scripts --test-cmd true` → remains closed while work is unfinished but does not report `progress metadata ledger does not match`.
- Commit: `chore(change): synchronize task metadata`

### Task 27: Repair Task 21 completion evidence

- Depends on: Task 26
- Files:
  - Created: none
  - Modified: `.hamilton/changes/2026-09-12-lint-skill-scripts/tasks/task-21/progress.md`
  - Deleted: none
- Acceptance:
  - Existing Task 21 attempts remain byte-for-byte intact and a complete next-numbered attempt is appended at the physical end with canonical list fields for `- Outcome: done`, changed paths, verification, and notes.
  - The shared task-progress parser reads the appended attempt as the physical latest done evidence, and precondition no longer reports `Task 21 latest attempt is not done`.
  - The implementation does not edit Task 21 feedback. Because the new commit touches Task 21 progress, orchestration treats its existing approval as stale and, immediately after this task's implementation commit, re-runs `hamilton-code-feedback` for Task 21 from its unchanged `.base` through the post-Task-27 head before considering the task feedback set current or advancing toward whole-branch review.
- Steps:
  1. Run focused task-progress validation and precondition to capture the malformed latest Task 21 outcome as red evidence, then inspect only the physical end needed to allocate the next attempt number.
  2. Append one complete canonical done attempt with current verification evidence; do not edit either existing attempt or any feedback/review artifact.
  3. Lint Task 21 progress, rerun precondition, and inspect the diff to prove the prior history is unchanged and the exact Task 21 outcome failure is gone.
  4. Return an explicit freshness handoff so the orchestrator appends and commits a new Task 21 feedback pass before normal feedback for Task 27 and before Task 28 begins.
- Verify: `bun run src/cli/main.ts workbench lint --file .hamilton/changes/2026-09-12-lint-skill-scripts/tasks/task-21/progress.md` → exits `0`; `bun run src/cli/main.ts workbench precondition --change-dir .hamilton/changes/2026-09-12-lint-skill-scripts --test-cmd true` → remains closed for stale feedback but no longer reports `Task 21 latest attempt is not done`; `git diff --check` → prior attempts are unchanged and the append is whitespace-clean.
- Commit: `chore(change): repair task 21 evidence`

### Task 28: Restore progress ledger parsing parity

- Depends on: none
- Files:
  - Created: none
  - Modified: `src/workbench/artifact-body.ts`, `tests/workbench/artifact-contracts.test.ts`, `tests/workbench/precondition.test.ts`
  - Deleted: none
- Acceptance:
  - The shared progress-table parser treats only unescaped `|` characters as delimiters, unescapes `\|` in the exposed display title, and continues to reject malformed cell counts, status values, links, and task identities.
  - A row such as `Task 1: Parse A \| B` produces exactly three cells and workflow title `Parse A | B`, so plan/progress comparison succeeds against the canonical unescaped plan title.
  - A header-plus-separator progress ledger with zero rows is structurally valid. Existing cross-artifact checks still require it to correspond to zero active plan tasks and empty progress metadata, so a plan with active tasks cannot pass by presenting an empty ledger.
  - Regression fixtures cover an escaped-title ledger, an all-canonically-abandoned plan with an empty ledger, and the negative active-plan/empty-ledger case.
- Steps:
  1. Add failing artifact-contract and precondition fixtures for escaped delimiters, all-abandoned zero-row execution, and active-plan mismatch; assert parsed titles and existing diagnostic/gate behavior.
  2. Replace naive table splitting with escape-aware cell parsing and remove the unconditional nonempty-row body diagnostic, leaving active-task cardinality to the existing plan/progress/metadata comparison.
  3. Run the focused suites and build, then verify unescaped delimiters and malformed rows still fail with the existing location-bearing diagnostics.
- Verify: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/workbench/precondition.test.ts && bun run build` → both former-helper parity shapes pass, the active-plan mismatch remains closed, and TypeScript builds cleanly.
- Commit: `fix(workbench): parse valid progress ledgers`

### Task 29: Promote lint read failures to environment errors

- Depends on: none
- Files:
  - Created: none
  - Modified: `src/workbench/lint.ts`, `tests/workbench/lint.test.ts`
  - Deleted: none
- Acceptance:
  - A selected path that passes `stat` but whose artifact reader returns `read-failure` yields a typed environment-error result and exit `2`, not an ordinary lint finding or exit `1`.
  - The same mapping applies deterministically when an unreadable candidate is discovered inside `--change-dir`; its path and read error are rendered, and artifact validation is not attempted for that candidate.
  - Invalid YAML and other readable artifact diagnostics remain lint findings with exit `1`; selector errors, success, skipped files, warning behavior, and deterministic ordering remain unchanged.
- Steps:
  1. Add failing injected-filesystem tests for single-file and change-directory stat-success/read-failure cases plus a control asserting readable invalid YAML remains exit `1`.
  2. Introduce a candidate-validation result that separates reader I/O failure from artifact findings, promote any `read-failure` to the operation's environment-error/exit-`2` path, and render the original path and message.
  3. Run the lint suite and build, then inspect the result union and renderer to ensure environment errors cannot be counted as ordinary findings.
- Verify: `bun --bun vitest run tests/workbench/lint.test.ts && bun run build` → injected read failures return exit `2`, readable malformed artifacts return exit `1`, and all existing lint behavior remains green.
- Commit: `fix(workbench): classify lint read failures`

### Task 30: Preserve workbench output channels

- Depends on: none
- Files:
  - Created: none
  - Modified: `src/workbench/isolate.ts`, `src/cli/commands/workbench.ts`, `tests/workbench/isolate.test.ts`, `tests/cli/workbench.test.ts`
  - Deleted: none
- Acceptance:
  - `renderIsolationResult` returns the populated error text when stdout is empty, matching the other stream-backed workbench renderers instead of returning an empty string.
  - The CLI runner emits stream-backed operation stdout to stdout and stderr to stderr without dropping, merging, or duplicating either channel; rendered-only lint results retain their current output contract.
  - Running `workbench isolate --check` outside a Git repository exits `2`, leaves stdout empty, and emits a useful `error:` message on stderr. A normal negative isolation check inside an unisolated repository still exits `1` with `isolated: no` on stdout.
  - Focused tests, the full repository suite, build, and whitespace check pass.
- Steps:
  1. Add a renderer regression and a subprocess integration test for isolation outside a repository, asserting exit code and both streams; retain the existing negative-check assertion as a stdout control.
  2. Make the isolation renderer fall back to stderr and split the common CLI execution helper into explicit stream-backed and rendered-result paths so operation channels are preserved at the composition boundary.
  3. Run focused isolation and CLI tests, then the full suite, build, and whitespace check; inspect subprocess output for accidental blank lines or duplicate errors.
- Verify: `bun --bun vitest run tests/workbench/isolate.test.ts tests/cli/workbench.test.ts && bun --bun vitest run && bun run build && git diff --check` → channel assertions, all tests, the build, and whitespace validation pass.
- Commit: `fix(cli): preserve workbench output channels`

### Task 31: Correct review transition documentation

- Depends on: Task 25
- Files:
  - Created: none
  - Modified: `.hamilton/specs/artifact-templates.md`, `.hamilton/specs/review.md`, `.hamilton/specs/workbench.md`, `docs/sdd-framework.md`, `docs/skills.md`, `tests/docs/workbench-docs.test.ts`
  - Deleted: none
- Acceptance:
  - Each canonical specification states that only fully evidenced feedback and review passes carry `Base`, `Head`, and `Verdict`, while structural legacy records are provenance-free, cannot supply a verdict, and remain distinct from the authoritative latest evidenced record.
  - All five affected specification and framework documents state that `Base` and `Head` contain full commit identifiers and that `Verdict` contains an allowed verdict enum value, never describing `Verdict` as a commit identifier.
  - Documentation contract tests assert the required transition semantics and reject the blanket every-pass and commit-valued-Verdict claims for each relevant document independently, so content from one document cannot satisfy another document's contract.
  - The implementation commit leaves `tasks/task-25/feedback.md` unchanged. Orchestration immediately follows that commit with fresh Task 25 feedback from its stable checkpoint through the correction Head, appending a new pass while preserving the existing changes-requested pass as history.
- Steps:
  1. Replace the concatenated transition-contract assertions with table-driven per-document assertions over the three canonical specifications and the two affected framework documents; require the fully evidenced versus structural distinction, correct `Base`/`Head` and `Verdict` value classes, and prohibited-language checks, then run the focused suite to establish the red state.
  2. Qualify the blanket per-pass claims in the three canonical specifications and correct the commit-identifier wording in all five documents without weakening the three history modes, atomic transition, single-file ownership, freshness, or fail-closed behavior.
  3. Run the focused documentation suite, build, and whitespace check, then inspect each affected document independently to prove the assertions cannot pass through concatenated content.
  4. Return an explicit handoff requiring `hamilton-code-feedback` to append and commit a fresh Task 25 pass against the correction Head before orchestration advances; do not edit the existing feedback artifact during implementation.
- Verify: `bun --bun vitest run tests/docs/workbench-docs.test.ts && bun run build && git diff --check` → every per-document transition assertion passes, TypeScript builds cleanly, and the documentation diff is whitespace-clean.
- Commit: `docs(review): correct transition evidence contract`

## Done when

- All tasks are implemented and recorded as `done` in `progress.md` with linked task evidence.
- `bun --bun vitest run` passes and `bun run build` is clean.
- Every task has a fresh task-scoped feedback approval with no blocking findings.
- Task 21 has a fresh approval recorded after the Task 27 progress append, and Tasks 22–30 each have their own fresh task-scoped approval.
- The whole branch has a fresh approved review with no blocking findings, and all review feedback has been addressed.
