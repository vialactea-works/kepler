# Skills and roles

Use this reference to select a packaged procedure or assign work in an agent host. A skill is a set of instructions. It is not proof that an agent performed the work correctly.

## Resource ownership

Kepler setup seeds packaged resources into the selected `KEPLER_HOME`. It does not register or install them for Pi, Claude Code, or another host. Users and hosts choose which versioned files to expose and load. Avoid duplicate skill copies when a host has more than one discovery mechanism.

Keep each complete skill directory, including reference files and notices. Use resources from the home that matches the selected CLI. See [Installation](installation.md#resources-and-host-ownership).

The source `skills/` directory contains more procedures than the release package. The release package exposes the following eleven skills. A file in a home does not prove that a host loaded it.

## Standard procedures

| Skill | Scope | Main responsibility |
| --- | --- | --- |
| [`kepler-design`](../bundle/skills/kepler-design/SKILL.md) | Functional Design | Define observable behavior, maintain the unit and design artifacts, and obtain requester approval. |
| [`kepler-quality`](../bundle/skills/kepler-quality/SKILL.md) | Quality Requirements | Assess applicable targets and constraints. Obtain requester approval. |
| [`kepler-plan`](../bundle/skills/kepler-plan/SKILL.md) | Implementation Planning | Write the technical plan and task graph. Check dependencies, prerequisites, and verification. |
| [`kepler-orchestrate`](../bundle/skills/kepler-orchestrate/SKILL.md) | Implementation and Code Integration | Admit tasks, assign workers, integrate checked output, and assess the combined result. |
| [`kepler-code`](../bundle/skills/kepler-code/SKILL.md) | Code Generation | Implement one admitted task, run checks, and prepare its handoff. |
| [`kepler-code-feedback`](../bundle/skills/kepler-code-feedback/SKILL.md) | Code Validation | Review as a non-author and run the required checks. |
| [`kepler-review`](../bundle/skills/kepler-review/SKILL.md) | Unit of Work Review | Assess the full integrated result and its evidence. |
| [`kepler-finish-work`](../bundle/skills/kepler-finish-work/SKILL.md) | Deliver | Verify the agreed outcome and perform only authorized operations. |

Read the complete skill before using it. The host decides how to invoke a skill. Kepler does not provide a CLI command named after each skill.

Standard uses six stages. Code Generation, Code Validation, and Code Integration are Activities inside Implementation. They are not three additional stages. See [Standard workflow](sdd-framework.md) and the [mission tutorial](missions/tutorial.md).

## Supporting procedures

| Skill | Use |
| --- | --- |
| [`kepler-grilling`](../bundle/skills/kepler-grilling/SKILL.md) | Examine a plan or decision through focused questions. |
| [`kepler-domain-modelling`](../bundle/skills/kepler-domain-modelling/SKILL.md) | Establish domain terms, model boundaries, and ownership. |
| [`kepler-research`](../bundle/skills/kepler-research/SKILL.md) | Check uncertain facts against primary sources and record findings. |

These procedures do not add stages or grant authority. The planning skill's [task graph reference](../bundle/skills/kepler-plan/references/task-graph.md) describes the packaged format. Construction lint checks supported structural and semantic rules. It does not prove that the graph covers every requirement.

## Pi profiles

The release package includes four Pi-format profile files under `$KEPLER_HOME/agents/pi/v1/`. Kepler setup does not register them with Pi; the user or host selects their discovery path.

| Profile | Responsibility | Declared boundary |
| --- | --- | --- |
| `kepler-architect` | Functional Design, Quality Requirements, and Implementation Planning. | Authored documents only. No production implementation or dispatch. |
| `kepler-orchestrator` | Implementation coordination, Code Integration, and authorized delivery work. | The only Kepler profile with the `subagent` tool. |
| `kepler-coder` | One assigned Code Generation task. | Writes only within its assigned scope. |
| `kepler-reviewer` | Independent Code Validation and whole-unit Review. | No dedicated write, edit, or dispatch tool. Bash supports inspection and assigned checks. |

A declared tool list is not an operating-system sandbox. A role name does not establish independent execution or requester approval. The host must provide the required worker separation and permissions.

## Claude Code and other hosts

Claude Code definitions are seeded under `$KEPLER_HOME/agents/claude-code/v1/`. Kepler does not install or translate them into host configuration. Follow the receiving host's procedure and preserve existing definitions.

Kepler does not certify that another host loaded its files or that an agent followed them. Test CLI behavior and host loading separately from agent behavior.

## Operation boundaries

The CLI records and checks explicit operations. The host dispatches workers. A successful command does not imply that the next worker started.

Use [Recovery](recovery.md) after an interruption. Keep earlier workbench artifacts separate from v3 mission records. No skill or stage sequence grants permission to push, merge, publish, deploy, roll back, or delete data.
