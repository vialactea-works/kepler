# Kepler

Kepler combines a standalone workflow CLI, versioned templates and guidelines, portable skills, and optional Claude Code role definitions. Its Standard Construction workflow carries a Unit of Work from Functional Design through Quality Requirements, Implementation Planning, Implementation, Unit of Work Review, and Deliver.

The CLI records scoped workflow state and evidence. Skills guide the work. The host or skill manager installs and loads skills and agent definitions; Kepler does not certify agent behavior.

## Install

Install the CLI and its compatible sidecar bundle:

```bash
curl -fsSL https://raw.githubusercontent.com/vialactea-works/kepler/main/install.sh | bash
```

Install the eight Standard entry skills and three supporting skills into your coding-agent host with the [Skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add ~/.kepler-dist/bundle/skills \
  --skill kepler-design \
  --skill kepler-quality \
  --skill kepler-plan \
  --skill kepler-orchestrate \
  --skill kepler-code \
  --skill kepler-code-feedback \
  --skill kepler-review \
  --skill kepler-finish-work \
  --skill kepler-grilling \
  --skill kepler-domain-modelling \
  --skill kepler-research
```

Keep each skill directory and its bundled references together. The stage skills include their reopening questions; Planning includes the task-graph field contract, example, and schema.

Run `kepler setup` to install compatible templates and guidelines and create missing default settings. Setup rejects bundles missing any of the six required v3 Construction templates before installation writes. It preserves settings and user-modified resources. It does not install skills or host-native agent definitions. See [installation](docs/installation.md) for Claude Code role definitions, upgrades, and target limits.

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
- [Installation](docs/installation.md): bundle setup, host-managed resources, upgrades, and release targets.
- [Recovery](docs/recovery.md): inspect and resume interrupted work without guessing or discarding effects.
- [Skills](docs/skills.md): shipped skill roles and handoffs.
- [Workflow](docs/sdd-framework.md): Standard stage order and authority boundaries.
- [Release notes](docs/releases/): shipped changes by release.
- [Version 3 contracts](docs/specs/v3/README.md): detailed behavior and implementation status.

## Limits

The current workflow CLI implements Construction. It does not implement the future Initialization or Inception phases. It does not convert version 2 artifacts or history into version 3. Existing `workbench` commands serve the earlier change-based workflow and are not a v3 migration path. Setup does not certify host readiness, skill loading, or agent behavior. Kepler does not publish, deploy, roll back, or delete data unless you separately authorize the operation.

The release artifacts target Linux and macOS on x86_64 and arm64. CI configures native standalone checks for all four targets; a green run is evidence for that run only. Cross-compilation does not establish native execution.

## Develop Kepler

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
