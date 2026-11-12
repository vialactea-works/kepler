# Kepler documentation

Use this guide to learn, operate, or extend Kepler. These documents describe implemented behavior. The [specifications](specs/v3/README.md) define requirements and contracts. They remain separate artifacts.

## Start here

1. Read [Installation](installation.md). Choose the CLI and matching version-specific home through your software manager.
2. Follow [Complete a mission with a coding agent](missions/tutorial.md). Use one project and the named skills from mission creation through delivery.
3. Read [Skills and roles](skills.md) to select the owning agent and load the packaged resources.
4. Ask the agent to use [Recovery](recovery.md) when a command or worker stops. The [CLI reference](cli.md) is for agents and operators who need exact mechanics.

Kepler records workflow operations. Your coding-agent host or team performs the work. Kepler does not start workers or grant delivery permission.

## Missions and workflow

| Document | Purpose and reader |
| --- | --- |
| [Complete a mission with a coding agent](missions/tutorial.md) | Copyable skill prompts for a developer, from startup through delivery. |
| [Standard CLI walkthrough](cli/standard-walkthrough.md) | Complete request and evidence mechanics for agents and operators. |
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

- [Installation](installation.md): version-specific home initialization and resource ownership.
- [Configuration](configuration.md): project paths, Kepler home, settings, and environment variables.
- [Recovery](recovery.md): developer prompts for interrupted preparation, execution, Integration, and setup.
- [Recovery operations](cli/recovery-operations.md): exact command and reconciliation mechanics for agents and operators.
- [Project guidelines](tutorials/custom-guidelines.md): keep project-specific instructions separate from packaged Kepler resources.

## Development

Read [Development](development.md) for workspace commands, tests, resource packages, and release checks. Start at [Contributing](../CONTRIBUTING.md) before changing the repository.

The [release notes](releases/) describe version changes. The `v3.0.0` tag's setup code requires an absolute `KEPLER_HOME` and initializes a release-bound home; verify the exact installed binary before treating a source candidate or specification status note as release evidence. Historical release notes do not define the current interface. The [v3 specification index](specs/v3/README.md) provides supporting contract references. A specification or CI job declaration does not prove that a feature or target has passed execution checks.
