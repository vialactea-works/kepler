# Kepler

Kepler records software work as a **mission**: a durable context for a request, selected repositories, and a workflow. Its Standard workflow carries one **Unit of Work** through design, quality requirements, planning, implementation, review, and delivery.

The CLI records state, evidence, approvals, and repository checkpoints. A checkpoint identifies a Git commit in a named repository. Skills describe the work. Your team or coding-agent host runs workers and checks. Kepler does not dispatch agents or grant permission to publish or deploy.

## Learn Kepler

- Start at the [documentation index](docs/README.md).
- Follow the [prompt-first Standard mission tutorial](docs/missions/tutorial.md); ask your coding agent to use the named skill at each step.
- Use the [CLI reference](docs/cli.md) when building agent integrations or inspecting a critical operation.
- Read [state and artifacts](docs/missions/state-and-artifacts.md) to understand stored records.

## Install

Use your software manager to install and select a Kepler CLI version. Set `KEPLER_HOME` to an absolute, version-specific path before running `kepler setup`. Kepler setup initializes that home; it does not install the CLI, change `PATH`, or register resources with a coding-agent host. See [Installation](docs/installation.md) and [Configuration](docs/configuration.md).

The `v3.0.0` tag's setup implementation requires an absolute `KEPLER_HOME` and initializes a release-bound resource home. Verify the selected binary and resources match before loading them into a host; Kepler setup does not activate host skills.

## Work through Standard

For an existing Git project that needs local preparation, `kepler-init` can establish v3 project readiness without starting a mission. Ask your coding agent to run `kepler-mission-startup` when you want to create a mission and its unit. Then use `kepler-design`, `kepler-quality`, `kepler-plan`, `kepler-orchestrate`, an independent `kepler-review`, and `kepler-finish-work` in order. Ask `kepler-resume` to inspect or reconcile interrupted work. The agent executes CLI operations and builds their JSON; you make consequential decisions and explicitly approve current Functional Design and Quality Requirements. See [Skills and roles](docs/skills.md) and the [mission tutorial](docs/missions/tutorial.md) for copyable prompts.

The [operator walkthrough](docs/cli/standard-walkthrough.md) retains complete CLI requests and the [CLI reference](docs/cli.md) documents exact commands. There is no `mission run` or global `status` command.

## Version boundaries

The current phase CLI implements Construction. Initialization and Inception are not implemented phases. The earlier `workbench` commands use change-based artifacts. They do not convert or resume v3 missions. Keep old work with its original artifact and workflow model.

The Standard workflow ends with the authorized delivery outcome. Completion alone does not authorize a push, merge, release, deployment, rollback, or deletion. See [Recovery](docs/recovery.md) before retrying uncertain work.

## Develop Kepler

Use Bun 1.4.0, as declared by `packageManager`. Read [Contributing](CONTRIBUTING.md) and [Development](docs/development.md) for workspace setup and validation.

The [specifications](docs/specs/v3/README.md) define contracts. User documentation describes implemented behavior. Neither a specification nor a configured CI matrix establishes successful native execution on a target.

## License

Kepler uses the [Apache License 2.0](LICENSE). Adapted skills retain their notices in the corresponding skill directories and package resources.
