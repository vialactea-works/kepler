# Kepler

Kepler records software work as a **mission**: a durable context for a request, selected repositories, and a workflow. Its Standard workflow carries one **Unit of Work** through design, quality requirements, planning, implementation, review, and delivery.

The CLI records state, evidence, approvals, and repository checkpoints. A checkpoint identifies a Git commit in a named repository. Skills describe the work. Your team or coding-agent host runs workers and checks. Kepler does not dispatch agents or grant permission to publish or deploy.

## Learn Kepler

- Start at the [documentation index](docs/README.md).
- Follow the [complete mission tutorial](docs/missions/tutorial.md).
- Look up commands in the [CLI reference](docs/cli.md).
- Read [state and artifacts](docs/missions/state-and-artifacts.md) to understand stored records.

## Install

Use your software manager to install and select a Kepler CLI version. Set `KEPLER_HOME` to an absolute, version-specific path before running `kepler setup`. Kepler setup initializes that home; it does not install the CLI, change `PATH`, or register resources with a coding-agent host. See [Installation](docs/installation.md) and [Configuration](docs/configuration.md).

The published `v3.0.0` release predates the versioned-home contract described here. The current source candidate is not a replacement release.

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
