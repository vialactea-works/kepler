# Kepler skills

Kepler ships eleven versioned portable skills. Eight are entry skills in the Standard Construction workflow; three support work when their procedures call for them. The host loads the skill files and controls agent dispatch. A skill file describes a procedure, not proof that a host or agent followed it.

Install skills from the same sidecar generation as the CLI. See [installation](installation.md#install-skills-and-claude-code-role-definitions). Read the full `SKILL.md` for required inputs, CLI operations, checks, evidence, and handoffs.

## Standard workflow

```text
Functional Design
  -> Quality Requirements
  -> Implementation Planning
  -> Implementation
  -> Unit of Work Review
  -> Deliver
```

Each stage owns its own authority and completion conditions. A clear request can enter Construction without existing application code, tests, or completed Initialization/Inception phases. Mission and workspace preparation still apply. See the [workflow guide](sdd-framework.md) and [CLI guide](cli.md).

| Skill | Stage or Activity | Responsibility |
| --- | --- | --- |
| [`kepler-design`](../skills/kepler-design/SKILL.md) | Functional Design | Clarify observable behavior and scope; maintain the unit definition and design; obtain required requester approval. |
| [`kepler-quality`](../skills/kepler-quality/SKILL.md) | Quality Requirements | Identify applicable quality obligations, targets, constraints, and evidence; obtain required requester approval. |
| [`kepler-plan`](../skills/kepler-plan/SKILL.md) | Implementation Planning | Select a technical approach and author the task graph, dependencies, prerequisites, and exact verification commands. |
| [`kepler-orchestrate`](../skills/kepler-orchestrate/SKILL.md) | Implementation and Code Integration | Admit ready tasks, dispatch scoped workers, coordinate the three task Activities, resolve authorized returns, and assess the integrated unit result. |
| [`kepler-code`](../skills/kepler-code/SKILL.md) | Code Generation | Implement one admitted task, test behavior at the lowest suitable level, self-review, and hand off output and evidence. |
| [`kepler-code-feedback`](../skills/kepler-code-feedback/SKILL.md) | Code Validation | Independently review task output as a non-author, run required full checks, record findings, and hand off validated material. |
| [`kepler-review`](../skills/kepler-review/SKILL.md) | Unit of Work Review | Review the complete integrated outcome, interactions, failure behavior, obligations, and evidence. |
| [`kepler-finish-work`](../skills/kepler-finish-work/SKILL.md) | Deliver | Verify the requested delivery outcome and perform only operations covered by explicit authority. |

For each Implementation task, the orchestrator coordinates Code Generation, non-author Code Validation, then checked Code Integration. Activities are task-scoped parts of Implementation, not additional stages. The CLI records attempts, checks, evidence, and transitions; it does not dispatch agents or promise parallel execution by itself. Compatible hosts can run independent ready tasks concurrently under the orchestrator's procedure.

## Supporting skills

| Skill | Use |
| --- | --- |
| [`kepler-grilling`](../skills/kepler-grilling/SKILL.md) | Ask focused questions that test a plan, decision, or idea. |
| [`kepler-domain-modelling`](../skills/kepler-domain-modelling/SKILL.md) | Establish domain language, model boundaries, and ownership from project sources. |
| [`kepler-research`](../skills/kepler-research/SKILL.md) | Investigate uncertain external facts against primary sources and record sourced findings. |

Supporting skills do not add agent roles or workflow stages. The installed Claude Code bindings are optional host resources; they do not certify agent behavior. See [installation](installation.md) for ownership and manual setup.

## Workflow boundaries

The current phase command tree implements Construction. It does not implement future Initialization or Inception phases, convert legacy artifacts, or move v2 history into the v3 record model. The older `kepler workbench` commands remain separate. Keep work with its original generation and use [recovery guidance](recovery.md) for interruption or upgrade issues.

The Standard sequence does not authorize push, merge, release, deployment, rollback, or cleanup by itself. The requester or applicable operator authority controls those actions. See the detailed [version 3 contracts](specs/v3/README.md) for the record model, stage/Activity contracts, evidence rules, and deferred work.
