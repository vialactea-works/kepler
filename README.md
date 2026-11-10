# Kepler

Kepler records software work as a **mission**: a durable context for a request, selected repositories, and a workflow. Its Standard workflow carries one **Unit of Work** through design, quality requirements, planning, implementation, review, and delivery.

The CLI records state, evidence, approvals, and repository checkpoints. A checkpoint identifies a Git commit in a named repository. Skills describe the work. Your team or coding-agent host runs workers and checks. Kepler does not dispatch agents or grant permission to publish or deploy.

## Learn Kepler

- Start at the [documentation index](docs/README.md).
- Follow the [complete mission tutorial](docs/missions/tutorial.md).
- Look up commands in the [CLI reference](docs/cli.md).
- Read [state and artifacts](docs/missions/state-and-artifacts.md) to understand stored records.

## Install

The source implements the 3.0 interface. Confirm that a compatible release has been published before you use its installer. Follow [Installation](docs/installation.md) to select a matching installer or run from an authorized repository checkout.

The installer downloads one complete target archive and verifies it. It then calls the candidate's `kepler setup`. Setup activates a generation and manages the Pi package registration. See [Installation](docs/installation.md) before you run commands that change your home directory.

Pi setup requires Pi 1.2.0 and pi-subagents 0.76.1. The Pi agent directory and settings file must already exist. Setup does not install these prerequisites, models, or credentials. The package contains eleven portable skills, four Pi profiles, and separate Claude Code definitions. See [Skills and roles](docs/skills.md).

## Inspect the interface

```bash
kepler --version
kepler --help
kepler mission create --help
kepler workflow construction unit create --help
```

Use the [tutorial](docs/missions/tutorial.md) for complete request bodies and a continuous workflow. There is no `mission run` or global `status` command. Query progress with `unit show`, `stage show`, `task list`, `task show`, `activity show`, or `audit list`.

## Version boundaries

The current phase CLI implements Construction. Initialization and Inception are not implemented phases. The earlier `workbench` commands use change-based artifacts. They do not convert or resume v3 missions. Keep old work with its original artifact and workflow model.

The Standard workflow ends with the authorized delivery outcome. Completion alone does not authorize a push, merge, release, deployment, rollback, or deletion. See [Recovery](docs/recovery.md) before retrying uncertain work.

## Develop Kepler

Use Bun 1.4.0, as declared by `packageManager`. Read [Contributing](CONTRIBUTING.md) and [Development](docs/development.md) for workspace setup and validation.

The [specifications](docs/specs/v3/README.md) define contracts. User documentation describes implemented behavior. Neither a specification nor a configured CI matrix establishes successful native execution on a target.

## License

Kepler uses the [Apache License 2.0](LICENSE). Adapted skills retain their notices in the corresponding skill directories and package resources.
