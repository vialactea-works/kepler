# Kepler documentation

Use this guide to learn, operate, or extend Kepler. These documents describe implemented behavior. The [specifications](specs/v3/README.md) define requirements and contracts. They remain separate artifacts.

## Start here

1. Read [Installation](installation.md). Check the host requirements and release availability.
2. Follow [Complete a mission](missions/tutorial.md). Use one project from mission creation through delivery.
3. Keep the [CLI reference](cli.md) available while you work.
4. Use [Recovery](recovery.md) when a command or worker stops before completion.

Kepler records workflow operations. Your coding-agent host or team performs the work. Kepler does not start workers or grant delivery permission.

## Missions and workflow

| Document | Purpose and reader |
| --- | --- |
| [Complete a mission](missions/tutorial.md) | A guided exercise for a developer who is new to Kepler. |
| [State and artifacts](missions/state-and-artifacts.md) | Storage, identifiers, states, and evidence for operators and tool authors. |
| [Standard workflow](sdd-framework.md) | The execution model and system boundaries for users and contributors. |
| [Skills and roles](skills.md) | Packaged procedures and host responsibilities for agent users. |
| [Workflow versions](modes.md) | The boundary between Construction and the earlier change-based workflow. |

## Commands

| Reference | Command group |
| --- | --- |
| [CLI conventions](cli.md) | Common syntax, output, errors, and command selection. |
| [Missions](cli/mission.md) | `mission create`, `mission prepare`. |
| [Construction](cli/construction.md) | `workflow construction unit`, `stage`, `task`, `activity`, `integration`, `lint`, and `revise`. |
| [Stage assessments](cli/stage-assessments.md) | The JSON completion inputs for the six stages. |
| [Audit](cli/audit.md) | `audit record`, `audit list`, `audit show`. |
| [Git material](cli/git.md) | `git author` and `git diff-package`. |
| [Utilities](cli/utilities.md) | `setup`, `uuid`, `lint`, and build identity. |
| [Earlier workbench](cli/workbench.md) | The seven `workbench` commands. |

## Installation and operation

- [Installation](installation.md): complete archives, Pi prerequisites, setup, and upgrades.
- [Configuration](configuration.md): paths, settings, environment variables, and selection rules.
- [Recovery](recovery.md): interrupted preparation, execution, Integration, and setup.
- [Project guidelines](tutorials/custom-guidelines.md): reference your own instructions without changing the installed generation.

## Development

Read [Development](development.md) for workspace commands, tests, resource packages, and release checks. Start at [Contributing](../CONTRIBUTING.md) before changing the repository.

The [release notes](releases/) describe version changes. Historical release notes do not define the current interface. The [v3 specification index](specs/v3/README.md) provides supporting contract references. A specification or CI job declaration does not prove that a feature or target has passed execution checks.
