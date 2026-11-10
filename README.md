# Kepler

Kepler combines a standalone workflow CLI, versioned templates and guidelines, eleven portable skills, four Pi-native agent profiles, and separate Claude Code role definitions. Its Standard Construction workflow carries a Unit of Work from Functional Design through Quality Requirements, Implementation Planning, Implementation, Unit of Work Review, and Deliver.

The CLI records scoped workflow state and evidence. Skills guide the work. On Pi, `kepler setup` registers Kepler's packaged skills and roles; Pi owns discovery, loading, and execution. Resource installation does not certify host readiness or agent behavior.

## Install

Kepler 3.0.0 is an unreleased implementation candidate. No public release is claimed here. When a compatible release is published, install its complete target archive with:

```bash
curl -fsSL https://raw.githubusercontent.com/vialactea-works/kepler/main/install.sh | bash
```

The installer selects one archive for the current OS and architecture, verifies it, then invokes the staged candidate's `kepler setup`. Setup alone activates the generation. Set `KEPLER_VERSION=v3.0.0` to select a published version explicitly or `KEPLER_REPO_SLUG` to select another repository. See [installation](docs/installation.md) for prerequisites, ownership, and upgrade limits.

Pi setup requires Pi 1.2.0, pi-subagents 0.76.1, an existing Pi agent directory, and an initialized `settings.json`. Install and configure those host prerequisites separately before installing Kepler. Kepler setup does not install Pi, pi-subagents, models, credentials, or permissions.

For non-Pi hosts, use the host or skill manager to install the portable skills from the selected generation; the Pi package registration does not configure other hosts. Keep each complete skill directory and its references together. See [skills](docs/skills.md) for responsibilities and role boundaries.

## Start a workflow

Use a coding-agent host that can load `SKILL.md` files. For help with the installed command tree and the typed mission request, see the [CLI guide](docs/cli.md).

```bash
kepler --help
kepler mission create --help
kepler workflow construction unit create --help
```

Create a mission with `kepler mission create`, prepare the selected workspaces, then create a Unit of Work bound to the `standard` workflow. Existing application code and tests are not prerequisites. The record-home still must meet the CLI's Git and `.kepler/` project-selection requirements. Mission creation does not start a stage.

If startup is interrupted, use `kepler mission prepare --mission <mission-id> --project <record-home>` to continue the same mission. Repeating `mission create` allocates another identity. A historical preparation result does not prove current workspace readiness. See [startup recovery](docs/recovery.md#continue-mission-preparation).

Follow the Standard skills in order. For each task in Implementation, Kepler keeps Code Generation, independent non-author Code Validation, and checked Code Integration as separate Activities. The CLI records state and evidence; the orchestrating host dispatches agents. Kepler does not make delivery permission automatic. Review [the workflow guide](docs/sdd-framework.md), [the skill reference](docs/skills.md), and [recovery guidance](docs/recovery.md).

## CLI and documentation

- [CLI guide](docs/cli.md): installed commands, scope, output, and legacy workbench boundary.
- [Installation](docs/installation.md): complete archives, Pi setup, host-owned prerequisites, upgrades, and release targets.
- [Recovery](docs/recovery.md): inspect and resume interrupted work without guessing or discarding effects.
- [Skills](docs/skills.md): shipped skill roles and handoffs.
- [Workflow](docs/sdd-framework.md): Standard stage order and authority boundaries.
- [Release notes](docs/releases/): shipped changes by release.
- [Version 3 contracts](docs/specs/v3/README.md): detailed behavior and implementation status.

## Limits

The current workflow CLI implements Construction. It does not implement the future Initialization or Inception phases. It does not convert version 2 artifacts or history into version 3. Existing `workbench` commands serve the earlier change-based workflow and are not a v3 migration path. Setup does not certify host readiness, skill loading, or agent behavior. Kepler does not publish, deploy, roll back, or delete data unless you separately authorize the operation.

Release artifacts target Linux and macOS on x86_64 and arm64. The workflows configure native jobs for all four targets, but a configured job is not a passed result. Only a job that builds and executes its exact target archive establishes target-specific native evidence. Cross-compilation or a local run on one host does not establish execution on another target.

## Develop Kepler

Use Bun 1.4.0, as pinned by the root `packageManager` field and the CI/release workflows.

```bash
bun install --frozen-lockfile
bun run check:typescript-sources
bun run typecheck
bun run build
bun run test:unit
bun run test:integration
bun run test:e2e
bun run test:package
```

Run tests with Vitest on Bun; do not use `bun test`. See [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) for repository rules and verification details.

## License

Kepler is licensed under the [Apache License 2.0](LICENSE). Forked skills retain their notices in the corresponding skill directories and release bundle.
