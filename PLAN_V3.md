# Kepler v3 implementation plan

## Outcome and scope

Build a release that implements the specifications in [docs/specs/v3/](docs/specs/v3/README.md). Verify its behavior with tests. Include executable CLI operations and Core behavior that other code can use. Also include authored-artifact tools, templates, Construction skills, four native agent definitions, installation resources, and user documents.

Use the full Standard workflow:

```text
Functional Design -> Quality Requirements -> Implementation Planning
  -> Implementation -> Unit of Work Review -> Deliver
```

During Implementation, each task follows Code Generation -> Code Validation -> Code Integration. Tasks with no dependency between them can start together when all their dependencies are available. Keep integration for each unit in sequence through candidate preparation, necessary checks, and acceptance.

This roadmap tracks work on Kepler itself. Its checkboxes do not replace CLI-owned execution records in a managed Unit of Work.

### Specification baseline

- Implement all six Standard stages, all three Implementation Activities, and the task graph. Include the CLI, Unit of Work, Construction runtime, and installation contracts.
- Follow the specified command signatures, state names, artifact schemas, payload requirements, and installation records. Illustrative examples do not add schema requirements.
- Make unspecified technical choices in their owning milestones. These include payload types, response encodings, repository identities, journal protocols, lock release, startup integration, and installation receipts. Record each design and its tests. Do not add requester-approval gates for technical encodings.
- Get a requester decision before changing agreed behavior, authority, evidence obligations, or material scope.
- Make direct Construction entry, existing projects, greenfield repositories, and walking skeletons available. Do not make completed Initialization, Inception, existing application code, or passing application tests entry requirements.

### Deliberate exclusions

Do not add these features in this release:

- Standalone Initialization or Inception.
- V2 artifact conversion or pre-mission adoption.
- Managed Project-reference governance.
- Configurable workflow/protocol engines.
- Topology presets, teams, or swarms.
- Generic state setters or raw journal append.
- Public lock/force commands.
- Automatic rollback.
- Automatic checkpoint publication/repair.

Keep these 14 deferred decisions outside this release: CN20, DF01-DF03, DF05, DF07-DF10, DF13, SH71, SH73, SH75-SH76. Use project-specific checks. Do not add DF13's general extra-check policy. Keep necessary evidence without setting retention periods or automatic cleanup. DF11 is retired. Do not add it as a compatibility gate.

## Current implementation baseline

The starting point is commit `e7ccbb6` on `wt/feat-kepler-v3-worktree-20261020`.

| Area | Existing implementation | Planned treatment |
| --- | --- | --- |
| Workspace | Two Bun-managed TypeScript packages: `packages/core` and `packages/cli`. | Keep both packages. Do not add a package only for architectural layers. |
| Core library | Settings, global/project paths, and safe legacy-directory copying. | Keep public behavior. Add only reusable, phase-independent v3 types, pure rules, and contracts. Do not treat legacy-directory copies as converted artifacts. |
| CLI | NestJS/`nest-commander`, `setup`, and legacy `workbench` operations. | Use existing command/provider wiring and output seams. Own v3 commands, Mission and Construction operations, and their adapters. The legacy workbench success does not show v3 coverage. |
| Runtime seams | Typed filesystem, process, Git, setup, and output interfaces already exist. | Use seams that have the necessary contracts. Replace legacy state assumptions. Do not use them as v3 truth. |
| Markdown | Custom frontmatter parsing and legacy artifact/body checks. | Use `remark` and `remark-frontmatter` for v3 Markdown processing. |
| Resources | Legacy templates and skills. No repository-owned four-role v3 agent set. | Write all v3 resources from accepted contracts. |
| Tests and release | Vitest tests, subprocess checks, and shell smoke scripts for installer, standalone binary, and packed Core. | Keep useful behavior tests. Use the behavior boundary, not the folder name, to select a test project. Replace smoke scripts with full integration/E2E tests. |
| Scripts | `scripts/check-versions.mjs`. | Use TypeScript for this script. Update all callers. |

### Core library and CLI ownership

Keep the existing two packages. `packages/cli` may depend on `packages/core`; Core must not depend on the CLI, NestJS, or command/output adapters. Keep new Core domain rules and use cases independent of host APIs. Do not put every pure rule in Core: phase-specific Mission and Construction policy remains with the CLI bounded contexts. Keep effects behind narrow typed contracts and in operation-specific adapters. Do not add a package for an architectural layer. These assignments guide implementation; the accepted specifications remain authoritative for behavior. See [the M01 package map](docs/specs/v3/implementation-map.md).

| Milestone | Core library (`packages/core`) | CLI and non-package resources |
| --- | --- | --- |
| M01 | Keep reusable Core exports and their public-contract checks. | Establish CLI application/adapter seams and test the executable boundaries. |
| M02 | Own shared artifact types and phase-independent metadata parsing and validation. | Own repository-scoped artifact operations and stage-specific checks. Keep templates as authored resources. |
| M03 | Add only generic JSON helpers when another client needs them. | Own the Construction task-DAG format, validation, and authored graph operations. |
| M04 | Keep CLI and host behavior out of Core. | Own command parsing, result reporting, selectors, UUID/Git-author commands, and project resolution. |
| M05 | Own phase-independent event-envelope types and pure shared rules. | Own phase payloads, journals, replay, projections, and history operations. |
| M06 | Expose only phase-neutral reusable types or pure helpers. | Own Mission operations, record-home/workspace policy, coordination, and their effects. |
| M07 | Add shared public contracts only when they serve non-CLI clients. | Own audit commands, recording rules, and query projections. |
| M08 | Reuse shared artifact and metadata contracts. | Own unit management and Construction query behavior. |
| M09 | Keep Standard lifecycle policy out of Core. | Own stage operations, transitions, and completion guards. |
| M10 | Keep task and Activity lifecycle policy out of Core. | Own admission, Activity execution, check coordination, and Integration. |
| M11 | Keep revision and recovery policy out of Core. | Own revision, pause/resume, recovery, and their coordination. |
| M12 | Do not add Git or diff-package adapters to Core. | Own source-bound Git diff-package operations and effects. |
| M13 | Keep skill behavior on published CLI/library contracts. | Keep skills as resources; they guide work and do not become runtime authority. |
| M14 | Keep agent roles and prompts out of Core. | Keep agent definitions as resources that use the accepted CLI operations. |
| M15 | Keep the published Core API and package artifacts compatible. | Own CLI setup/install operations and versioned bundle resources. |
| M16 | Verify public Core behavior, exports, and packed-consumer compatibility. | Verify CLI behavior, end-to-end workflows, and distribution. |

## Engineering requirements for all milestones

### TypeScript and dependency boundaries

1. Write runtime code, tests, executable fixtures, helpers, and development scripts in TypeScript. Do not write hand-coded `.js` or `.mjs` files, including generated test-consumer fixtures. Use `.ts` for the existing version-check script.
2. Use the repository's ESM `.js` import specifiers in TypeScript where its compiler setup uses them. Keep these specifiers in TypeScript source. Do not make authored JavaScript files for them. Keep compiler output as a generated compilation/package artifact.
3. Use interfaces extensively at application and infrastructure boundaries. Give each use case an inbound contract. Give it narrow outbound contracts for artifacts, journals, Git, workspaces, coordination, checks, filesystem access, identifiers, time, and output. Give collaborators to use cases instead of making concrete implementations in use cases.
4. Do not put Nest, Commander, filesystem APIs, process libraries, or host SDKs in domain rules or application use cases. Make CLI handlers translate requests and give results. Make adapters do effects. Direct dependencies toward domain/use-case contracts. The application core is an architectural boundary; it does not mean every use case belongs in the `packages/core` library.
5. Use existing ports when their contracts agree. Name interfaces by domain responsibility, such as `Journal`, `Workspace`, or `CheckRunner`. Do not add mechanical `I`/`Port` suffixes. Do not add a universal repository, service locator, or plugin registry.
6. Supply in-memory or deterministic implementations for isolated tests. Add shared public-contract tests for replaceable adapters. Do compile-time checks for exported types. Do runtime checks too.
7. Pin dependency versions. Keep package manifests, exports, Bun compilation, and the text `bun.lock` current. Keep the no-code-comments convention.

### Markdown and structured artifacts

- Use `remark` plus `remark-frontmatter` for Markdown syntax, headings, links, frontmatter nodes, and Markdown changes. Do not add a second regular-expression Markdown parser.
- `remark-frontmatter` recognizes frontmatter syntax. It does not decode YAML values. Parse its YAML node through the existing `yaml` dependency. Reject duplicate keys and invalid types. Keep parser details behind an artifact interface.
- Keep source positions for useful diagnostics. Keep reads and lint read-only. Do meaningful parse/write/parse checks for authored changes. Do not rewrite unrelated content during inspection.
- Validate authored JSON separately. Markdown `schema_version`, task-DAG `version`, CLI release, installation format, `envelope_version`, and `event_version` have independent version domains.
- Keep opaque material-reference strings unchanged. Resolve only actual Markdown links, explicit path operands, and repository operations against real paths. Keep each result inside its repository.

### Test pyramid and completion

- **No smoke tests.** Do not do shallow startup checks instead of behavior tests. Do not add, keep, or rename those checks. Replace old smoke scripts and their CI calls with the integration/E2E tests below.
- Write unit tests with **Vitest**. Use Bun with `bun --bun vitest run`. Do not use `bun test`. Import Vitest APIs because `globals` is false.
- Use isolated public-contract unit tests as the broad base. Include positive paths, invalid inputs and states, failures, and boundaries that affect the tested contract. Prefer side-effect-free collaborators. Use doubles for effects and unpredictable behavior.
- Add integration tests for real collaborations: filesystem durability, Git/worktrees, journal readers/writers, and lock contention. Add tests for parser/schema behavior, Nest provider wiring, and packed Core consumers. Do not use a mock for the collaboration under test.
- Keep E2E tests small and focused on necessary full-domain workflows through the CLI. Use **`execa`** for E2E process calls. Do not use internal use cases in E2E specifications.
- Use disposable Docker environments for the repeatable Linux E2E baseline, with the actual application and necessary dependencies. Use isolated native resources for target-specific binary tests when Docker cannot show native behavior.
- SH116 excludes tests with live agents and tests of skill Markdown wording or structure. Examine skills and prompts against their contracts. Do tests of executable CLI/Core behavior. Do not claim agent certification from either activity.
- Ship unit tests and integration/E2E tests that apply to each capability. M16 closes cross-capability gaps. It is not the first testing milestone. Compilation alone does not show behavior.

## E2E organization

Use the four-layer specification pattern in `/home/caio/codex/playbooks/e2e-testing-go-services.md` as a guide. The supplied playbook path resolves to this Markdown file. Use its test entry points, business specifications, protocol drivers, resources, and fixtures. Do not use Go libraries, service health checks, or irrelevant databases.

```text
tests/
  unit/
  integration/
  e2e/
    construction.test.ts
    audit.test.ts
    distribution.test.ts
    specifications/
      connector.ts
      construction.ts
      audit.ts
      recovery.ts
      distribution.ts
    driver/
      cli.ts
    resources/
      application.ts
      repository.ts
      workspace.ts
      home.ts
      release-assets.ts
      logs.ts
    fixtures/
      read.ts
      artifacts/
      task-graphs/
      histories/
      repositories/
packages/core/tests/
  unit/
  integration/
```

Use this test layout as a guide. It is not a production resource registry. Add resource files only for dependencies that the tests use.

| Layer | Responsibility |
| --- | --- |
| Entry points | Start resources. Make a driver. Add scenarios. Register cleanup for each resource, including failure paths. Keep domain assertions out of lifecycle setup. |
| Specifications | Write full behavior through interfaces in `connector.ts`. Keep CLI arguments, `execa`, Docker commands, filesystem paths, and Nest providers out of specifications. |
| Driver | Use the public CLI for these interfaces. Use explicit argument arrays and typed JSON stdin for domain actions. Give parsed results, exit codes, and stream observations. |
| Resources | Prepare the compiled CLI and sidecar, disposable repositories/worktrees, isolated homes, temporary Git identities, release assets, and logs. Keep resource ownership and cleanup clear. |
| Fixtures | Supply valid and invalid artifacts, small task graphs, histories, and deterministic repository builders. Keep executable helpers and package-consumer fixtures in `.ts`. |

Driver and resource rules:

- Use `execa` to start the real executable with argument arrays, explicit `cwd`, and a controlled environment. Capture stdout/stderr. Set an execution limit and clean up children. Do not make shell command strings from inputs.
- Keep stream bytes unchanged for assertions, including the final newline. Use the reported exit code and error envelope in failure tests. Do not accept a rejected subprocess as an expected failure.
- For container tests, use `execa` to start Docker and the compiled CLI inside the isolated environment. For native target coverage, start the staged standalone binary through the same behavioral driver contract.
- Compile once per applicable suite/target. Keep staged binaries and bundles outside the checkout. Make Bun and Node unavailable to the CLI during standalone tests. The test runner can use its own runtime outside that environment.
- Use different `HOME`, `XDG_CONFIG_HOME`, Git configuration, repository data, writable targets, and network endpoints. Use test-local identity and credentials only. Do not change the user's Git profile or installation.
- Give each resource an options interface, a returned resource interface, and registered cleanup. Keep command, stdout/stderr, Git, and container diagnostics within fixed limits on failure. Do not include secrets. Remove only resources that the test makes.
- Use public queries for assertions. Add narrow observation interfaces for effects without a public query. Keep infrastructure clients out of specifications.
- Use controlled barriers for finite concurrency cases instead of timing sleeps. Resource contention tests show ordinary correctness. Do not add load, stress, soak, benchmark, or chaos suites.

## Milestone sequencing

Each milestone has deliverables, tests, and a completion gate. All tasks start unchecked.

| Milestone | Dependencies | Main result |
| --- | --- | --- |
| M01 | None | TypeScript boundaries and test infrastructure. |
| M02 | M01 | Markdown artifact processing, validation, and templates. |
| M03 | M01, M02 | Strict task-DAG reader, writer, and validator. |
| M04 | M01, M02 | Shared v3 CLI contract, UUIDs, and Git author lookup. |
| M05 | M01 | Durable journals and event-derived views. |
| M06 | M04, M05 | Coordination, mission startup, and workspace ownership. |
| M07 | M04-M06 | Full audit CLI interface. |
| M08 | M02-M07 | Unit management and read-only Construction queries. |
| M09 | M02-M08 | Stage lifecycle and Standard completion guards. |
| M10 | M03, M06-M09 | Task admission, Activities, and checked Integration. |
| M11 | M09, M10 | Revision, pause/resume, and safe recovery. |
| M12 | M10, M11 | All three source-bound Git diff packages. |
| M13 | M02-M12 | Eleven Construction and supporting skills. |
| M14 | M13 | Four native agent prompts and role bindings. |
| M15 | M02-M04, M13, M14 | Compatible, preservation-safe installation resources. |
| M16 | M01-M15 | Full E2E proof, distribution gates, and release documentation. |

Foundation tasks with no dependency links can start together. Skills and prompts can start from accepted contracts while runtime work continues. Their completion waits for available CLI interfaces. Keep one writer per checkout. Use different worktrees for concurrent writers. Keep all tests, even when they make the dependency chain longer.

### Milestone worktree procedure

Branch each milestone from the latest `wt/feat-kepler-v3-worktree-20261020` integration commit. Use `/home/caio/.local/share/pi-worktrees/20261020141603/feat-kepler-v3-worktree-20261020-<Mnn>` for the worktree and `wt/feat-kepler-v3-worktree-20261020-<Mnn>` for its branch. In the active Herdr workspace, create a tab labeled `<Mnn>` with its root pane's working directory set to the worktree, without changing focus. Preserve untracked `.pi/` data and other user state. Remove a worktree only when requested; keep its branch unless branch removal is requested separately.

## M01: Set TypeScript architecture and test infrastructure

**Sources:** [runtime](docs/specs/v3/runtime.md), [installation](docs/specs/v3/installation.md), existing package and test configuration.

- [x] M01.1 Record existing runtime interfaces. Select interfaces with no legacy workflow policy. Record Core/CLI ownership for artifacts, history, missions, Construction rules, and effects inside the existing two packages.
- [x] M01.2 Give each use case a narrow inbound interface. Give adapters narrow outbound interfaces. Do not put Nest/CLI or filesystem/process dependencies in pure domain/application logic. Add compile-time checks for exported interface contracts.
- [x] M01.3 Add pinned `remark`, `remark-frontmatter`, necessary TypeScript declarations, and `execa` to the packages that use them. Use Bun, ESM, TypeScript, and standalone compilation for version checks. Keep `execa` a test dependency unless production has a concrete need.
- [x] M01.4 Change `scripts/check-versions.mjs` to `scripts/check-versions.ts`. Update package/CI references. Put inline JavaScript from release jobs and package checks in typed scripts. Add a source-file rule that rejects new hand-written `.js`/`.mjs` files, including fixture generators. Keep compiler output and external dependencies outside this rule.
- [x] M01.5 Use one Vitest project/configuration for unit tests, one for integration tests, and one for E2E tests. Keep valid existing tests. Put each test in a project for its actual boundary, not its current folder name. Use explicit API imports and TypeScript type checks for tests.
- [x] M01.6 Add the E2E layers above. Include connector interfaces, an `execa` CLI driver, Docker/native application resources, and temporary homes/Git repositories. Add deterministic fixtures, diagnostics, and cleanup.
- [x] M01.7 Add `typecheck`, `test:unit`, `test:integration`, and `test:e2e` scripts. Make `bun run test` do the full behavior suite without smoke checks. Keep `bun run build` as the package compilation gate. Keep the packed-Core integration gate separate from the package build command.
- [x] M01.8 Record all smoke invocations, including `scripts/smoke-installer.sh`, `scripts/smoke-standalone.sh`, `packages/core/scripts/pack-smoke.sh`, package scripts, and release jobs. Put their useful behavior in M15/M16 replacements. Do not start these scripts for v3 validation.

**Complete when:** Unit tests can use typed collaborators without external effects. Test discovery does not find suites twice. The E2E harness uses CLI behavior with isolated resources and cleanup of test-owned resources.

## M02: Add Markdown artifacts and Construction templates

**Sources:** [metadata](docs/specs/v3/metadata.md), [effort](docs/specs/v3/effort.md), [unit](docs/specs/v3/unit-of-work.md), and the six stage contracts.

- [x] M02.1 Use an artifact reader/writer interface backed by `remark` and `remark-frontmatter`, with YAML-value parsing through `yaml`. Give diagnostics for missing or malformed frontmatter and duplicate keys. Read headings, links, source locations, and supported Markdown constructs. Do not treat headings or links inside code fences as artifact structure.
- [x] M02.2 Use all shared metadata rules: UUIDv4 artifact identity, integer schema `3`, accepted types, and conditional `unit_id`. Keep original `Name <email>` attribution. Use the open label vocabulary with its accepted syntax. Reject duplicate labels, unknown fields, and execution-state metadata.
- [x] M02.3 Keep stable identity and attribution during supported authored changes. Reject unsupported versions without conversion. Keep valid and invalid bytes unchanged on reads and validation. Keep unrelated Markdown meaning during explicit writes.
- [x] M02.4 Use stage-owned structural checks for necessary sections and actual links. Use shared metadata lint for metadata. Keep semantic quality, rationale, applicability, and coverage assessments with the responsible agent/evidence contract.
- [x] M02.5 Write v3 templates for `unit-of-work.md`, `design.md`, `quality.md`, `plan.md`, `delivery.md`, and useful `supporting-document` content. Use the exact necessary sections and types, including `non-functional-requirements`, `implementation-plan`, and `delivery-plan`.
- [x] M02.6 Keep necessary artifacts at the mission-owned unit root and linked detail under `details/<stage-or-activity>/`. Write documents only during their owning work, with actual content and valid IDs/authors. Do not make unit creation add placeholder documents. Do not make mission, execution, review, or per-Activity Markdown records necessary.
- [x] M02.7 Add Vitest unit tests for parser/metadata/section contracts and boundaries. Add integration tests for the real remark/YAML pipeline, filesystem preservation, symlink containment, and meaningful Markdown round trips. Validate template-produced artifacts with executable validators, not skill-text assertions.

**Complete when:** Shared interfaces can author and validate all accepted artifact types. Necessary sections agree with their owning contracts. Inspection and lint do not repair or rewrite content.

## M03: Add the full task-DAG format

**Sources:** [task graph](docs/specs/v3/phases/construction/task-graph.md), [Implementation Planning](docs/specs/v3/phases/construction/implementation-planning.md), IP05, IP26, DF14.

- [x] M03.1 Parse strict JSON. Reject duplicate object keys before parsing discards them. Reject comments, trailing commas, malformed JSON, unknown fields, incorrect types, nulls, and unsupported formats or versions.
- [x] M03.2 Keep the accepted closed `kepler-task-dag` version `1` schema unchanged. Validate all tasks, inputs, outputs, acceptance criteria, guidance entries, verification objects, dependency reasons, and external prerequisites.
- [x] M03.3 Use lowercase UUIDv4 identities. Keep graph, plan artifact, task, and execution identities distinct. Do checks for unit ownership and unique task IDs/output names. Also do checks for correct predecessors, no self/duplicate edges, and acyclicity independent of array order.
- [x] M03.4 Write authored graphs through a typed interface. Keep identities of surviving graphs and tasks during reorder and revision. Do not give a retired ID to unrelated work. Keep status, attempts, baselines, approvals, check results, extra edge arrays, and new resource fields out of the graph.
- [x] M03.5 Keep `inputs.reference` unchanged. Do checks for Markdown links and explicit path operands against declared repositories. Do not parse references into inferred paths, dependencies, or repository membership.
- [x] M03.6 Use structural validation only for graph structure. Use Planning's semantic comparison with `plan.md` for functional/quality obligations, actual material, justified dependencies, and verification feasibility. Put resource instructions only in accepted guidance/method/prerequisite fields.
- [x] M03.7 Add comprehensive Vitest unit fixtures for the accepted example and malformed/boundary graphs. Add real parser/schema integration tests and graph write/read identity-continuity tests. Give precise JSON-Pointer diagnostics without changing input.

**Complete when:** Use the writer and validator for the full accepted graph contract. Reject runtime-state extensions. Do not add a graph-engine abstraction or alternate format.

## M04: Add the shared v3 CLI interface

**Sources:** [CLI](docs/specs/v3/cli.md), SH60-SH61, SH102-SH108, SH113.

- [x] M04.1 Add root `git`, `lint`, `audit`, and `workflow construction` capabilities to the Nest command tree. Make help and parsing use the same framework definitions. Record release treatment of legacy `workbench`. Do not use legacy state as v3 truth or add deferred migration.

  Release treatment: retain legacy `kepler workbench` commands and their state effects in this release. Adapt each result to M04.2's single JSON envelope: keep successful legacy text in `data.output` and failed-command stdout in `data.details.output`, with diagnostics on stderr. Do not emit legacy text outside the envelope, interpret its state as v3 truth, or migrate it.
- [x] M04.2 Use one result-reporting boundary. It has exactly `{status,data}`, `success`/`failed`, exit `0`/`1`, and one JSON object at the end plus newline on stdout. Put diagnostics only on stderr. Do not use an automatic terminal-dependent format. Apply this to argument/parser errors and use-case failures.
- [x] M04.3 Use failed-result fields `code`, `message`, `details`, and `recovery`. Keep partial-effect facts in `details`. Do not add scope/effects envelopes or imply recovery permission. Keep command success distinct from workflow completion.
- [x] M04.4 Resolve projects from invocation cwd or explicit `--project`. Do not select an ancestor project implicitly. Select a Git working-tree root with an existing local `.kepler/`. Accept linked worktrees. Reject bare repositories and nested paths.

  Use a read-only resolver. Do not use legacy Core helpers that can copy data.
- [x] M04.5 Parse selectors and do ownership checks in one place. Use full unit/task/attempt IDs, not prefixes, and allowed stage/Activity values. Reject duplicates. Keep original Implementation-parent binding.

  Use no implicit active/latest scope. Use `--mission` only for mission-scoped operations without unit context. Do not add `--repo`.
- [x] M04.6 Add `kepler uuid` and `kepler git author [--project <path>]`. Keep them read-only except for UUID generation. Use the effective repository Git identity. A missing or blank name or email must cause failure before artifact writes. Do not use fallback, prompts, or Git configuration changes.
- [x] M04.7 Add `kepler lint <path>... [--project <path>]` with only M02 shared metadata validation. Use explicit Markdown paths. Keep unbound-artifact lint. Use the accepted finding fields and success/failure placement. Do no scans or repairs. Add no IDs or events.
- [x] M04.8 Add Vitest unit tests for result/parser/selector contracts. Add integration tests for real Nest module wiring. Use `execa` CLI tests for success, failure, and stream behavior. Include relative project paths, linked worktrees, invalid roots, duplicate flags, and no-write failures.

**Complete when:** Common CLI rules hold on positive and negative paths. Author/UUID/lint commands operate correctly. Later commands use the same parsing, selection, validation, and reporting boundaries.

## M05: Add durable history and event-derived state

**Sources:** [shared runtime](docs/specs/v3/runtime.md), [Construction runtime](docs/specs/v3/phases/construction/runtime.md), SH43-SH51, SH74, SH84, SH87, CN23.

- [x] M05.1 Give the unchanged ten-field event envelope TypeScript interfaces and runtime validation. Keep envelope and payload versions as independent domains. Their numeric values can match. Keep UTC `Z` timestamps, the source CLI producer/version, journal identity, direct `caused_by` IDs, and phase-owned data.
- [x] M05.2 Implement Construction's state names, event catalog, and payload requirements. Keep event, attempt, revision, evidence, graph, and task identities distinct. Define unspecified payload types within those requirements. Do not add approval/task-attempt IDs.
- [x] M05.3 Add the journal adapter at `.kepler/missions/<mission-id>/history/<phase>/<journal-id>.jsonl`. Use one writer per journal. Make each append durable before success. Do not make independent journals share an append lock.
- [x] M05.4 Use original event/domain IDs, producer, bindings, causes, and position for same-write retries and deduplication. Record a conflict when content under one ID differs. Keep damaged bytes and uncertain newer facts. Do not truncate history. An older valid prefix is not current truth.
- [x] M05.5 Use internal interfaces for validated journal collection/import and causal resolution. Do not add a public import command or synchronization service. Keep original journals, local order, identities, and bindings. Block state-dependent work in each scope when unknown, unsupported, incomplete, or conflicting history may affect it. Do not discard uncertain newer control facts just because their effect is unproven. Keep unaffected scopes available.
- [x] M05.6 Use history alone for deterministic, rebuildable phase projections. Get mission membership, workflow, effort, attempts, admissions, results, and progress from history. Do not use authoritative state files, a persisted views tree, timestamp-based global ordering, worker dispatch, restored locks, or recreated approvals.
- [x] M05.7 Bind each evidence and approval record to its applicable scope and attempt. For artifact material, include its identity. Add a content-version binding when its contract makes that binding necessary. Include repository-qualified checkpoint material, relevant inputs, executor/result/output, and applicability. Keep opaque references and original bindings when consuming historical results.
- [x] M05.8 Add Vitest unit tests for event validation/replay/conflicts/late results. Add integration tests for durable appends, interrupted writes, source-ID retries, different writers, imported causal dependencies, unsupported history, and rebuild equivalence. Use deterministic failure points through interfaces, not a new recovery framework.

**Complete when:** Kept history alone forms valid views. Incomplete history cannot grant authority. Readers and writers keep evidence and bytes through retries and interruptions.

## M06: Add mission startup, workspaces, and coordination

**Sources:** [Mission](docs/specs/v3/mission.md), [coordination](docs/specs/v3/runtime.md#short-scoped-coordination), SH64-SH72, SH118-SH121.

- [x] M06.1 Use typed interfaces for mission creation and workspace preparation. Record the mission UUIDv4, title, and request. Record the selected workflow, repository identities, and selected contexts. Record integration targets, starting commits or explicit no-commit conditions, and the single logical record home.
- [x] M06.2 Add the smallest callable CLI-owned startup entry needed for first use. Define its request/result contract within the Mission and CLI requirements. Connect skills to it. Do not make the creator internal-only.

  Do not give agents instructions to edit journals by hand. Add no generic mission registry or workflow engine.
- [x] M06.3 Prepare only selected existing, new, or previous workspaces and selected current/default/other/new branches. Write instructions for explicit preparation of the record home's `.kepler/` marker before project resolution. Do not add an Initialization stage or implicit resolver writes.

  Keep the selected workspaces and contexts. Use existing operation authority without a separate request for each preparation step. Keep dirty work, existing paths, and explicit choices. Do not silently stash, reset, switch, move, or make resources again.
- [x] M06.4 Keep machine-local attachments under the record repository's Git common directory at `kepler/missions/<mission-id>/workspaces/`. Put mission coordination in its sibling `coordination/`. Keep code-repository checkout/shared-resource claims at `<code-git-common-directory>/kepler/workspaces/<local-workspace-key>/`.
- [x] M06.5 Use one dedicated coordination component with atomic lock-directory creation. Include acquisition token, machine/process-incarnation identity, resource scope, and applicable attempt context. A missing/partial owner record still makes the resource unavailable to others. Do tests for replacement-safe release. Read-token-then-delete alone is not sufficient.
- [x] M06.6 Identify checkout and shared Integration-target identity across symlinks, worktree aliases, missions, and record homes. Use coordination locks only for resources with contention. Keep short control locks for control actions. Use the long unit Integration lock for unit Integration. Do not block writers or checks for other resources.
- [x] M06.7 Keep these checkpoint roles distinct:
  - The mission starting set.
  - The original unit Review baseline.
  - The fixed task admission baseline.
  - The actual lock-captured Integration inputs/candidates.

  Capture each at the time set by its contract. Keep repository qualification, including unchanged repositories when their material affects the operation. Do not claim atomic cross-repository commits.
- [x] M06.8 Do a handoff preflight for necessary commit/object reachability before history transfer and safe resume. If a necessary object is missing or unreachable, return a failed result for the affected handoff. Do not resume affected work without its material. Do not automatically fetch, copy, pin, or publish objects to repair a failed handoff. Do not automatically make refs/commits or repair Git for that purpose. Keep separately authorized transfers and ordinary operations under existing authority.

  Make local attachments and ownership current again. Do not restore copied locks.
- [x] M06.9 Add unit tests for preparation/ownership policies. Add integration tests with real repositories, linked worktrees, Git common directories, aliases, and multiple record homes. Include explicit greenfield/no-commit state, ownership contention, replacement races, partial preparation, and missing handoff objects. Show that unrelated scopes can continue.

**Complete when:** A real caller can make and prepare a mission without starting a stage. All supported writers use the correct coordination domain. Startup/handoff failures keep known and uncertain work.

**Verified:** `bun run build`, `bun run typecheck`, and `bun --bun vitest run` passed (75 files, 1269 tests).

## M07: Add the full audit CLI interface

**Sources:** [audit operations](docs/specs/v3/cli.md#audit-operations), SH49-SH56, SH63, SH109-SH110.

- [x] M07.1 Add `kepler audit record evidence` with applicable scope selectors and one typed JSON stdin object. Validate phase/scope/material bindings and one `inputs` array of `{reference,purpose}` without a second material field. Give event `id`, `journal_id`, and distinct `evidence_id`.
- [x] M07.2 Add `kepler audit record approval` with requester attribution, reviewed inputs, explicit decision reference, and applicable attempt/material scope. Make repository output checkpoints before you record approval. Keep approval records immutable. Caller truthfulness stays the trust boundary. Do not add authentication/signing or infer consent.
- [x] M07.3 Add `kepler audit record interaction` with participants, concise content, opaque references/reply reference, and optional structured effort selection. Record requester-selected changes to the unit default or stage overrides. Let a selection remove an override. Ordinary prose cannot change effort or count as approval.
- [x] M07.4 Use the accepted `audit list` signature, filters, and projections. Default fields are `id,journal_id,phase,type,recorded_at`. With `--fields`, replace the projection but keep `id,journal_id`. Keep payload/causes opt-in. Give `events` and nullable `next_cursor`.
- [x] M07.5 Use limit checks with default 20 and maximum 1000. Keep each cursor bound to the original query view/filters. Reject invalid/expired cursors. Keep journal-local order. Do not give cross-journal display order causal meaning. Return success for empty matches.
- [x] M07.6 Use the accepted `audit show --unit ... --journal ... --id ... [--project ...]` signature and validate ownership. Return the complete original event from the source record in `data.event`. Fail when the event is absent. Keep list/show read-only. Do not add mission/repository selectors to their signatures.
- [x] M07.7 Recording evidence does not run checks, grant requester consent, complete stages, or authorize unrelated work. No CLI operation grants requester consent. A recorded failed check stays failed. Lifecycle operations add their own facts without a second audit call.
- [ ] M07.8 Add unit tests for all five operations and invalid payloads/scopes. Add integration tests with actual journals and stable pagination views. Add `execa` E2E cases for recording, listing, filtering, pagination, and full-event lookup. Include structured effort changes and failed/late evidence that cannot authorize completion.

**M07.8 status:** Unit projection tests reject failed evidence and cross-attempt late evidence. The E2E suite proves audit recording and queries are read-only. A public stage-completion denial E2E remains pending because the `stage complete` command is delivered by M09.

**Complete when:** All accepted audit operations have end-to-end behavior. Each operation keeps the original records. Recording/query success stays distinct from the meaning of the recorded outcome.

## M08: Add unit management and Construction queries

**Sources:** [Construction commands](docs/specs/v3/cli.md#construction-commands), [unit identity](docs/specs/v3/unit-of-work.md#identity-and-directory), [effort](docs/specs/v3/effort.md), SH53, SH59, SH62-SH63, SH115, SH121.

- [ ] M08.1 Use the accepted `unit create <slug> --mission ... [--effort ...] [--stage-effort ...]... [--project ...]` contract. Do input checks before writes. Use the machine-local creation date and a mission stored in the record home. Use a matching `standard` binding. IDs must be unique across that project, including unbound units.
- [ ] M08.2 Make only the unit directory and creation facts: identity, membership, workflow, and initial effort. Reject existing paths/IDs and duplicate stage overrides. For concurrent same-ID requests, let no more than one succeed. Reconcile partial directory/journal effects before retries.
- [ ] M08.3 Add `unit list/show` with workflow binding, membership, derived progress, effort defaults/overrides, stage levels after overrides, blockers, and unknowns. Do not store a current-unit setting. Do not silently add unbound `.kepler/units-of-work/` data to managed work.
- [ ] M08.4 Add scoped `stage show`, `task list/show/ready`, and `activity show`. Give compact projections with original attempt links and supporting evidence. A readiness query shows integrated predecessor facts and unknown prerequisites. It does not record admission or send work to a worker. It does not make external availability certain.
- [ ] M08.5 Add `kepler workflow construction lint --unit ... [--project ...]` for the canonical mission-owned graph. Use M02/M03 context and accepted findings. Do not accept another graph path or task mode. Use this command for graph structure, not semantic Planning assessment.
- [ ] M08.6 Use Standard's one-unit-per-mission rule and unique recorded membership. Reject unsupported/mismatched workflows. Make known unbound IDs unavailable across the project. Queries must show missing binding. Do not hide or change work.
- [ ] M08.7 Add unit tests for identity, effort, and lookup rules. Add integration tests for directory/history coordination and task graphs. Use the CLI executable for creation tests. Include duplicate/invalid creation, query purity, missing binding, inherited effort, and Construction lint diagnostics.

**Complete when:** A prepared mission can receive its one unit. All accepted queries and lint stay read-only. Unit creation does not start execution or generate authored artifacts.

## M09: Add Standard stage lifecycle and completion rules

**Sources:** [Construction catalog](docs/specs/v3/phases/construction/README.md), [Functional Design](docs/specs/v3/phases/construction/functional-design.md), [Quality](docs/specs/v3/phases/construction/quality-requirements.md), [Planning](docs/specs/v3/phases/construction/implementation-planning.md), [Implementation](docs/specs/v3/phases/construction/implementation.md), [Review](docs/specs/v3/phases/construction/unit-of-work-review.md), [Deliver](docs/specs/v3/phases/construction/deliver.md).

- [ ] M09.1 Use typed `stage start/complete` application operations and CLI adapters for all six stages. Use the recorded Standard order. Use exact attempts and one active attempt per unit/stage. Use applicable inputs and authority. Do not send workers automatically.
- [ ] M09.2 Use unit/design artifacts with no validation errors for Functional Design completion. Include resolution of material functional choices by their owner, self-review, explicit requester approval for current material, and Quality handoff. Do not make a technical solution or application tests necessary here.
- [ ] M09.3 Use valid `quality.md` for Quality completion. Include evidence for artifact validation and self-review, and applicability of all eight categories. Include resolution of material targets/trade-offs, requested review when applicable, explicit approval, and Planning handoff. Record targets and measured achievements as different data.
- [ ] M09.4 Use valid `plan.md` and graph for Planning completion. Include validation records, semantic self-review of rationale/coverage/dependencies/prerequisites/verification feasibility, resolution of consequential choices, and applicable approval only. Keep task dispatch and future prerequisite availability outside this completion gate.
- [ ] M09.5 Use the typed Implementation completion-assessment contract. Make guards apply to necessary integrated tasks, applicable Activity evidence, repository-qualified provenance, and final combined-result checks. Include retained-scope assessments, no unfinished authorized writer for the result, and the Review handoff. Validate against recorded-history fixtures here. M10 later adds real task execution through these contracts.
- [ ] M09.6 Use an independent reviewer who is not the primary implementation author for whole-unit Review. Identify the integrated material. Examine upstream evidence and the full outcome. Correct blocking findings through authorized returns.

  Keep original evidence bindings. Record applicable acceptance. If a current condition makes a check necessary, do the check again. Do not edit the reviewed implementation.
- [ ] M09.7 Help the Deliver completion path. Validate authored `delivery.md`, preparation/self-review, applicable operation authority, operation results, provenance, outcome verification, applicable approval, and recipient handoff. Do not make publication necessary for an agreed repository handoff. Keep an unfinished requested deployment incomplete.
- [ ] M09.8 Keep human/agent judgments explicit in typed assessment records. Do not use metadata/section checks as proof of semantic correctness. Make missing named evidence, necessary approvals, or current material bindings block completion. A process exit or record append alone does not complete a stage.
- [ ] M09.9 Add unit tests for all stages' positive, missing-evidence, invalid-order, wrong-attempt, unauthorized, and stale-material cases. Add command/provider/journal integration tests with validated historical fixtures for later-stage guards. Add CLI flows through Design, Quality, and Planning. Put execution-to-delivery E2E in M10/M16. Use deterministic caller assessments, not real agents or claims of automated consent checks.

**Complete when:** All six lifecycle/assessment contracts and guards use validated inputs. The first three stages operate through the CLI. Later-stage guards use recorded task/result contracts without the M10 execution coordinator. Deliver completion completes Standard. It gives no cleanup authority.

## M10: Add task execution and checked Integration

**Sources:** [Implementation](docs/specs/v3/phases/construction/implementation.md), [shared Activities](docs/specs/v3/phases/construction/activities/README.md), [Generation](docs/specs/v3/phases/construction/activities/code-generation.md), [Validation](docs/specs/v3/phases/construction/activities/code-validation.md), [Integration](docs/specs/v3/phases/construction/activities/code-integration.md), DF14-DF15.

- [ ] M10.1 Add `task admit`. Do checks for graph/definition versions and prerequisites that apply. Use ancestry/provenance to show that all necessary predecessor outputs are in the integrated material. Record the repository-qualified unit integration set at admission as a fixed baseline. Do not add an admission commit or task-attempt identity.
- [ ] M10.2 Add `activity start/complete` and occurrence/parent bindings for the fixed Generation -> Validation -> Integration route. Keep at most one active attempt per occurrence. Keep attempts unended after local corrections or failed commands. Do not let generic completion bypass `task integrate` acceptance.
- [ ] M10.3 Use typed Generation evidence/completion checks for task outputs, typechecking, and tests for modifications. Include self-review, task inputs, and output checkpoints. Completion makes Validation eligible, not task completion.
- [ ] M10.4 Use Validation for typechecking, project build, and the full application test suite as three separate duties. Include feedback from a non-author, assessment self-review, resolved blockers, and task output. Use different worker contexts for Generation and Validation. A different vendor, model, or person is not necessary.
- [ ] M10.5 Add `task integrate` with the dedicated unit lock. After acquisition, read checkpoint state and make an immutable combined candidate set. Do typechecking, the project build, and the full application test suite as separate necessary checks. Accept only matching checked material under authority at acceptance. Hold the lock through each necessary repository result and final acceptance. Release it on completion/failure and before a Generation return.
- [ ] M10.6 Use an injected check runner that accepts explicit repository-qualified command/executable/argument data for planned checks. Use repository-native targets in `plan.md` and `verification.method`. Do not use arbitrary prose as commands. Do not guess commands or add a project configuration format. A check without a command cannot start.
- [ ] M10.7 Record the inputs used by Integration apart from admission baselines. Record the unit Review baseline from before the first admission. Record task-owned contributions and Integration effects as different facts. Do not accept partial or uncertain cross-repository target updates before reconciliation. Never reset repositories automatically.
- [ ] M10.8 Use accepted Integration and all task conditions for task completion. Let only integrated outputs make dependent tasks ready. Do not add global `HEAD`, batch, unrelated-clean-workspace, or test gates to Generation/Validation or other-unit progress.
- [ ] M10.9 Add unit tests for admissions, route/attempt guards, prerequisite unknowns, check selection, and candidate applicability. Add Git/filesystem/lock/process integration tests for concurrent tasks whose dependencies are available, fixed baselines, and same-unit Integration serialization. Include other-unit progress, failed checks, changed candidates, and partial multi-repository acceptance. Add an `execa` multi-task Construction E2E workflow.

**Complete when:** Full task loops give checked integrated material. Independent tasks stay concurrent. Acceptance does not use isolated-worker checks or outdated/changed candidates as evidence of the combined result.

## M11: Add revision, pause/resume, and recovery

**Sources:** [revision](docs/specs/v3/revision.md), [Activity attempts](docs/specs/v3/activity.md), [Construction runtime](docs/specs/v3/phases/construction/runtime.md), [post-completion return](docs/specs/v3/phases/construction/implementation.md#return-after-completed-implementation), SH57-SH58, DF16-DF17.

- [ ] M11.1 Add direct `kepler workflow construction revise` with typed JSON reason and supporting inputs. Select an explicit unit and stage or Activity boundary. Use exact scope and attempt selectors. Record orchestrator authority and a new revision identity. Derive cascade-affected scopes and attempts from recorded data. Callers do not have to enumerate them.
- [ ] M11.2 Use stage cascades from the earliest affected stage through Deliver. Keep unaffected upstream work/history. End affected previous attempts and invalidate their completion. Start replacements only when execution starts again. The same output bytes do not transfer completion from a previous attempt.
- [ ] M11.3 Use task-local Activity returns during active Implementation. Keep their parent and fixed baseline. Reopen the earliest invalid Activity and all Activities after it. An Integration-only retry keeps its current attempt. Do not let it hide code changes.
- [ ] M11.4 Use returns after completed Implementation. Give resumed execution a new parent. Reopen affected Activities and dependent work. Keep parent IDs and bindings from retained scopes for applicability assessments. Make a new unit assessment. Start downstream Review/Deliver again.
- [ ] M11.5 Use graph edges, changed necessary inputs, and evidence applicability for dependency invalidation. Keep unaffected work and admissions from before the revision. Do not use file conflicts as proof of dependency edges. Do not reset work for unrelated commits.
- [ ] M11.6 Set revision barriers immediately through short control coordination, before waiting for long checks. Reject affected admissions, stale completion, and old candidate acceptance. Stop affected workers through existing host capabilities. Reconcile effects and locks before affected work starts again. An unknown stop is a blocker, not a satisfactory timeout.
- [ ] M11.7 Add stage/Activity pause and resume. Make a pause request block new affected work immediately. A pause request does not show that existing workers stopped. After workers stop and lock reconciliation is complete, record the completed pause. Keep the same attempt/reservation on resume. Do checks for inputs, assignment, material, and ownership.
- [ ] M11.8 Use safe same-checkout/cross-checkout recovery for interrupted journals, partial directories/Integration/delivery effects, necessary object reachability, and late results. Keep work and uncertainty. Write instructions for manual removal of only the identified complete lock artifact after workers stop and reconciliation. Do not add a public force-unlock command or kill engine.
- [ ] M11.9 Add deterministic unit and integration tests for each return case, stale-result rejection, unchanged-byte reexecution, and pause reservations. Include unknown owners and replacement-safe release. Add a race test for revision and a candidate check with a long execution time. Add `execa` E2E recovery and post-completion-revision workflows. Show that unrelated scopes still make progress.

**Complete when:** Interruptions resume safely without duplicate acceptance or new attempts for ordinary retries. Authorized revisions keep obsolete workers/results from changing current truth.

## M12: Add all three Git diff-package interfaces

**Sources:** [diff packages](docs/specs/v3/diff-package.md), [fixed signatures](docs/specs/v3/cli.md#kepler-git-diff-package), SH100-SH101, IE32-IE33, UR17.

- [ ] M12.1 Add exactly `git diff-package validation`, `integration`, and `unit-review` with their accepted source-attempt selectors. Do not add a mission/repository/batch/format selector, an arbitrary range override, or an implicit latest source.
- [ ] M12.2 Get sources through Construction interfaces. Make each package through a Git adapter. Validation uses the fixed admission -> Generation output. Integration uses the recorded lock-captured input -> prepared candidate. Unit Review uses the original Review baseline captured before first task admission -> selected Implementation completion set.
- [ ] M12.3 Get all repository-qualified comparisons once. Include task definitions for the scope, upstream versions, Activity evidence from source records, and retained scopes. Include task-owned commit/parent/path attribution, Integration-only/conflict effects, and explicit attribution uncertainty.
- [ ] M12.4 Include a readable manifest and all paths/statistics. Include the full text patch with ten lines of context. Include binary/nontext indications and object access, the full package fingerprint, and empty-diff status. Do not reduce output or silently omit participating repositories or overlapping changes.
- [ ] M12.5 Make fresh temporary output or a new project-relative `--out` file with exclusive creation. Do not overwrite files. Remove only operation-owned partial output after failure. Do not touch Git metadata, tracked application content, journals, projections, locks, attempts, or check execution.
- [ ] M12.6 A package from historical producer sources does not authorize current consumption. Keep source-record bindings unchanged. Use the consuming contract for applicability assessment and any necessary new work. Do not make an unconditional rerun necessary for each historical read. The CLI can make packages before consuming Validation or Review starts. Do not make packages extra completion gates.
- [ ] M12.7 Add renderer/resolver unit tests. Add Git integration tests for multi-repository/binary/empty/retained/concurrent-history cases. Add CLI E2E tests for all three signatures, source mismatches, missing objects, overwrite rejection, and unchanged workflow/Git state.

**Complete when:** Each package shows its recorded source comparison. It cannot give authority or change state. It cannot replace recorded material with a moving `HEAD`.

## M13: Write all Construction skills

**Sources:** [skills](docs/specs/v3/skills.md), all stage/Activity contracts, and available M04-M12 command interfaces.

- [ ] M13.1 Write `skills/kepler-design/SKILL.md` for investigation, requester discussion, unit/design authorship, self-review, explicit approval, reopening questions, and Quality handoff. Keep technical solution selection outside Functional Design.
- [ ] M13.2 Write `skills/kepler-quality/SKILL.md` for the eight-category applicability review, observable targets/constraints, and quality artifact/evidence. Include self-review, explicit approval, and Planning handoff. Do not make up measurements or technical solutions.
- [ ] M13.3 Change `kepler-plan` to include technical rationale, authoritative `tasks-dag.json`, and explicit native check commands. Include resource/prerequisite instructions, structural and semantic validation, self-review, and applicable approval only. Do not send tasks to workers. Do not keep legacy progress/admission-commit policy.
- [ ] M13.4 Change `kepler-orchestrate` to use one procedure/attempt for unit Implementation and another for task Code Integration. Include readiness/admission and full task assignments. Dispatch ready tasks in parallel. Use different contexts for Generation and Validation. Use facts-based handoffs and lock-held candidate checks. Include revision barriers, recovery, unit assessment, and Review handoff.
- [ ] M13.5 Change `kepler-code` to include scoped Generation, tests at the lowest level that can show the change, and planned infrastructure. Include output checkpoints, self-review, evidence, and Validation handoff. Change `kepler-code-feedback` to include all necessary full checks and feedback from a non-author without edits to the candidate.
- [ ] M13.6 Write `kepler-review` for the full integrated outcome and evidence applicability. Do not limit review to changed lines. Do not add an extra check without a current condition. Write `kepler-finish-work` for delivery instructions, permission checks, operations, outcome verification, partial-effect recovery, and recipient handoff.
- [ ] M13.7 Adapt `kepler-grilling`. Adapt `kepler-wayfinder-domain-modeling` and name it `kepler-domain-modelling`. Adapt `kepler-wayfinder-research` and name it `kepler-research`. Keep caller-owned paths/exit conditions and sourced findings. Do not add legacy maps/routes/tickets or extra roles. Keep necessary attribution and notices.
- [ ] M13.8 Give all eleven skills concrete CLI calls and handoff contracts. Use CLI-owned operations to read and record execution. Keep effort inheritance, original authors, opaque references, conditional approval triggers, necessary evidence, and stage-specific reopening questionnaires.
- [ ] M13.9 Examine the actual skill procedures against accepted inputs, outputs, authority, checks, correction paths, evidence, and completion conditions. Keep supporting references/examples current with them. Do not add real-agent evaluations or wording/structure tests. Use executable CLI/Core tests for mechanical obligations. State that agent behavior is not certified.

**Complete when:** All eight entry skills and three supporting skills have full v3 procedures. Use commands available through these interfaces. Do not make legacy workflow resources necessary.

## M14: Write native Construction agent prompts

**Sources:** [role bindings](docs/specs/v3/installation.md#host-capability-contract), [skills](docs/specs/v3/skills.md), and each owning contract's agent responsibilities.

- [ ] M14.1 Select the repository's versioned native-definition resource layout for the intended host integration. Write that layout in the repository. Add resources for host/skill-manager installation. Do not make `kepler setup` write native host configuration or add a profile registry.
- [ ] M14.2 Write `kepler-architect` for Functional Design, Quality Requirements, and Planning. Add bindings for `kepler-design`, `kepler-quality`, and `kepler-plan`. Include domain/quality investigation, source research, technical planning, authored artifacts, self-review, and requester-owned decisions. Keep production edits out of pre-implementation stages.
- [ ] M14.3 Write `kepler-orchestrator` for unit Implementation coordination, task Code Integration, shared revision authority, and Deliver. Add bindings for `kepler-orchestrate`/`kepler-finish-work`. Keep exact assignments. Send tasks whose dependencies are available to workers in parallel. Keep current-attempt checks, stopping/recovery, and operation permissions.
- [ ] M14.4 Write `kepler-coder` for assigned Generation through `kepler-code`. Keep authority within its assigned task, material, and context. Include necessary tests and documentation, self-review, fact reporting, and escalation. Do not let an assignment give upstream revision or delivery authority.
- [ ] M14.5 Write `kepler-reviewer` for non-author Validation through `kepler-code-feedback` and full-unit Review through `kepler-review`. Give permission for relevant reads/checks and evidence reporting. Do not give permission for authorship or edits of the reviewed implementation, or unauthorized reopening.
- [ ] M14.6 Add bindings for applicable supporting skills without adding roles. Worker-to-worker calls and reviewer spawning are not necessary. Use existing native dispatch and permission mechanisms. When necessary concurrency or independent-context capability is unavailable, set an explicit failure before affected execution. Do not silently weaken the model.
- [ ] M14.7 Examine prompts, tool permissions, entry-skill bindings, assignment/result interfaces, and installation instructions. Do interface checks on executable assignment-validation/host-adapter code. Do not add live-agent tests, Markdown-text assertions, certification claims, or Implementation topology to other stages.

**Complete when:** The four versioned definitions and native installation instructions exist. Their authority agrees with the accepted contracts. They use the exact skill/CLI interfaces available at that time without additional orchestration machinery.

## M15: Add compatible setup and installation resources

**Sources:** [installation](docs/specs/v3/installation.md), [setup](docs/specs/v3/cli.md#kepler-setup), SH114, SH116-SH117, SH124.

- [ ] M15.1 Implement the installation-generation record with its specified field names and meanings at `<Kepler global home>/installation.json`. Select minimal encodings for generation, compatibility, digest, and managed-resource receipt data not specified by the contract. Keep CLI release, bundle generation, artifact/event formats, and native resource facts distinct. Do not add a host-certification framework.
- [ ] M15.2 Add `kepler setup` without `--force` or bypass options. Resolve symlinks. Select the bundle by explicit override, installed sidecar, then source fallback only when applicable. If override validation or selected-bundle compatibility fails, return a failed result. Do not use silent fallback.
- [ ] M15.3 Do compatibility and full-bundle-digest checks before writes. Install compatible v3 templates/guidelines and only missing default settings. Change existing files only when valid ownership records and matching digests show unmodified installer-managed content.
- [ ] M15.4 Keep settings, unknown/user-modified resources, project data, and unsupported history. Necessary-path conflicts cause failure without merging or overwriting. After partial failure, keep the prior usable generation. Record known effects. Remove only operation-owned temporary/partial material.
- [ ] M15.5 Include all eleven skills and four native definitions in a versioned compatible generation. Keep native installation and upgrades with the host or skill manager. Record each installer's own facts/failures. Setup success does not show unchecked host readiness.
- [ ] M15.6 Keep existing Core global-path and safe legacy-copy public behavior. Do not use migration during v3 project resolution that does not write data. Keep v2 artifact/status conversion and pre-mission adoption outside this release. Write the between-generation rollout without changing active work.
- [ ] M15.7 Add Vitest unit tests for compatibility/preservation decisions. Add filesystem integration tests for first install/update/conflicts/interruption. Add `execa` E2E tests for standalone sidecar lookup, explicit overrides, setup again, resource preservation, and incompatible generations. Replace installer smoke coverage with actual release-asset/checksum/install/setup behavior in isolated resources, not a fake-success CLI.

**Complete when:** A compatible generation can install and update without changes to user-owned resources. An incomplete native installation stays explicitly incomplete.

## M16: Complete E2E workflows, packaging, and release gates

**Sources:** all [v3 specifications](docs/specs/v3/README.md), [Standard](docs/specs/v3/workflows/standard/README.md), SH116, and the E2E playbook above.

- [ ] M16.1 Use `execa` for a small E2E suite of necessary workflows. Do a workflow test with mission preparation, unit creation, Design, Quality, Planning, and multi-task Implementation. Include independent Validation records. Do checked Integration. Complete whole-unit Review. Then do authorized repository delivery.

  Include greenfield and existing-application paths with actual artifact, Git, and history effects.
- [ ] M16.2 Add all failure/recovery cases for:
  - Necessary approval/evidence is absent.
  - An application check has a failure.
  - A non-author separation rule is violated.
  - The candidate is unchanged, but the attempt is new.
  - A transition is invalid.
  - A write is partial.
  - A pause or resume occurs.
  - A revision occurs during Integration.
  - A retained-scope return occurs after completion.
  - Handoff material is missing.
  Keep exhaustive input combinations in unit tests.
- [ ] M16.3 Show all checkpoint roles, per-repository check results, and partial-effect reporting in a bounded multi-repository workflow. Include source-bound diff packages and unaffected-unit progress. Do not use mocks instead of Git/locking/application checks under test.
- [ ] M16.4 Add packed-Core integration tests with a disposable consumer. The consumer imports public exports and typechecks `.ts` source against tarball declarations. Include behavior and failure tests, not import-only startup.
- [ ] M16.5 Use the staged standalone binary and sidecar outside the checkout. Make Bun/Node unavailable to the CLI. Replace old smoke scripts and CI calls after substantive coverage exists. Remove obsolete references and fake-success installer fixtures. Do not keep a smoke suite.
- [ ] M16.6 Make CI use unit, integration, Docker E2E, compilation/typecheck, packed-package, and distribution gates explicitly. Use native runners for target-specific checks on Linux/macOS and `x86_64`/`arm64`. Keep cross-compilation and native execution evidence in different categories. Do not claim untested target coverage.
- [ ] M16.7 Change root README, contributor/agent guidance, and user CLI/skill documentation. Change supported workflows, native-resource installation instructions, recovery guidance, and release notes. Describe v3 behavior available at release and its limits. Do not promote deferred features, compatibility conversions, or agent certification.
- [ ] M16.8 Set root/package versions and `src/index.ts` `VERSION` to the same release version. Do checks for manifests, package exports/types, standalone compilation, sidecar compatibility/digests, checksums, and immutable release-asset provenance. Do not publish as an automatic test effect.
- [ ] M16.9 Examine the integrated changes against the coverage map. Correct each necessary gap. Remove obsolete v3-incompatible code/resources under applicable existing authority. Remove owned temporary test resources. Record actual commands/results and native-target gaps.

  Use existing authority for release publication and host deployment as separate actions. If applicable rules make requester approval necessary, get that approval.

**Complete when:** The full test pyramid shows correct behavior for the executable workflow and critical failure paths. CLI, Core, templates, skills, prompts, and distribution agree. Do not include smoke tests. Do not leave any necessary path unfinished.

## Specification coverage map

| Contract | Owning milestones |
| --- | --- |
| [Reference and scope](docs/specs/v3/README.md), [authoring register](docs/specs/v3/authoring_progress.md) | Scope, M01, M16. |
| [Unit of Work](docs/specs/v3/unit-of-work.md), [Effort](docs/specs/v3/effort.md) | M02, M07-M09, M13. |
| [Metadata](docs/specs/v3/metadata.md) | M02, M04, M15. |
| [Shared runtime](docs/specs/v3/runtime.md), [Mission](docs/specs/v3/mission.md) | M04-M11, M16. |
| [CLI](docs/specs/v3/cli.md) | M04, M06-M12, M15. |
| [Revision](docs/specs/v3/revision.md), [Activity](docs/specs/v3/activity.md) | M09-M11, M13-M14. |
| [Construction catalog](docs/specs/v3/phases/construction/README.md), [Construction runtime](docs/specs/v3/phases/construction/runtime.md), [Standard](docs/specs/v3/workflows/standard/README.md) | M06-M11, M13-M14, M16. |
| [Functional Design](docs/specs/v3/phases/construction/functional-design.md), [Quality Requirements](docs/specs/v3/phases/construction/quality-requirements.md) | M02, M07, M09, M13-M14. |
| [Implementation Planning](docs/specs/v3/phases/construction/implementation-planning.md), [task graph](docs/specs/v3/phases/construction/task-graph.md) | M02-M03, M08-M10, M13-M14. |
| [Implementation](docs/specs/v3/phases/construction/implementation.md), [shared Activities](docs/specs/v3/phases/construction/activities/README.md), [Generation](docs/specs/v3/phases/construction/activities/code-generation.md), [Validation](docs/specs/v3/phases/construction/activities/code-validation.md), [Integration](docs/specs/v3/phases/construction/activities/code-integration.md) | M06-M11, M13-M14, M16. |
| [Unit of Work Review](docs/specs/v3/phases/construction/unit-of-work-review.md), [Deliver](docs/specs/v3/phases/construction/deliver.md) | M02, M09, M11-M14, M16. |
| [Diff packages](docs/specs/v3/diff-package.md) | M10-M13, M16. |
| [Skills](docs/specs/v3/skills.md) | M13-M15. |
| [Installation](docs/specs/v3/installation.md) | M01, M14-M16. |

## Final acceptance checklist

- [ ] Use the accepted authority, attempt, evidence, approval, and completion contracts for all six Standard stages and all three task Activities.
- [ ] Add behavior tests for all accepted CLI operations, including all five audit surfaces and all three diff-package scopes. Use the shared JSON/exit/stream contracts.
- [ ] Make mission startup callable and document it. Show workspace preparation, one-unit membership, fixed baselines, scoped concurrency, recovery, and unbound-data preservation.
- [ ] Use `remark` plus `remark-frontmatter` for Markdown. Keep task graphs in their accepted closed schema. Keep authored artifacts out of execution-state storage.
- [ ] Keep authored code TypeScript-only. Use interfaces extensively and keep them replaceable. Include exported runtime and type contracts in tests.
- [ ] Use Vitest unit tests as the broad base. Use real integration tests to show collaborations. Use `execa` E2E tests with the playbook-inspired layers. Keep smoke tests out of v3 validation.
- [ ] Keep all eleven skills, four native definitions, v3 templates, compatible installation resources, and user documentation complete and consistent. Do not add live-agent/skill-text tests or certification claims.
- [ ] Complete verification only when necessary checks pass on identified material. Record actual commands and results. Keep evidence content available. State native-target gaps. Do not invent results. This plan does not give authority for release, deployment, migration, rollback, or destructive cleanup.
