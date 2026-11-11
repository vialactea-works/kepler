# Use project guidelines

Use this guide to give a team or coding agent explicit project instructions. These instructions are project-owned documentation. Kepler does not manage or automatically discover them.

## Create a guideline file

Choose a tracked path such as `docs/guidelines/team.md`. Write the instructions that apply to that project:

```markdown
# Team conventions

Keep each change in its owning package.
Add focused tests for changed behavior.
Preserve unrelated files and user data.
```

Kepler does not require guideline-specific frontmatter or a fixed directory name.

## Reference the file

Add an explicit reference in the project's `AGENTS.md`:

```markdown
## Project instructions

Read [Team conventions](docs/guidelines/team.md) before changing this project.
```

You can name the file directly in a request instead. Follow higher-priority instructions when they conflict with a project guideline. An explicit reference does not prove that an agent read or followed it.

## Maintain the file

Review the guideline when project conventions change. Keep each instruction specific. Remove instructions that no longer apply. Kepler setup does not copy, update, or adopt this file.

## Keep built-in resources separate

Built-in guidelines are seeded under `$KEPLER_HOME/guidelines/` for the selected CLI release.

| Resource | Subject |
| --- | --- |
| `general` | Cross-language conventions. |
| `golang` | Go structure, testing, and implementation guidance. |
| `typescript` | TypeScript structure, testing, and implementation guidance. |

Setup seeds the version-specific home once and preserves edits and deletions on repeat. Use a separate home for another release. Hosts choose whether and how to load guidelines; setup does not discover project-owned files.

See [Installation](../installation.md#what-setup-does), [Configuration](../configuration.md), and [Skills and roles](../skills.md).
