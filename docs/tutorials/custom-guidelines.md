# Project-Owned Guidelines

Keep custom guidelines in the project and point to them explicitly from its `AGENTS.md` or a
request prompt. Kepler does not discover a global XDG guideline directory, and an explicit
reference does not guarantee that every agent will follow the instructions. See the current
[installation contract](../installation.md#setup-and-installed-resources) for the bundled
resource paths and setup behavior.

## Create a project-owned file

Choose a tracked path that fits the repository, such as `docs/guidelines/team.md`:

```markdown
## Team conventions

- Keep changes within the owning package.
- Add focused tests for behavior changes.
- Preserve unrelated user data and existing project conventions.
```

Use Markdown that is clear to the people and tools working in the project. Kepler does not
require a guideline-specific frontmatter format or directory structure.

## Reference it explicitly

Add a short reference in the project's `AGENTS.md`:

```markdown
## Project standards

Follow [team conventions](docs/guidelines/team.md) when changing this repository.
```

You can also name the file directly in a prompt. Keep project instructions consistent with the
requester's directions and higher-priority policies. The reference is an instruction for the
agent, not an automatic discovery or compliance guarantee.

## Maintain the guidelines

Review the referenced project file when its conventions change. Keep it focused, and remove or
revise guidance that no longer applies. The file is project-owned content; Kepler setup does not
copy, refresh, or manage it.

## Bundled guidelines

The complete Kepler package includes built-in guidance under
`~/.kepler-dist/current/bundle/guidelines/`, inside the selected immutable generation. Setup does
not copy these resources into the XDG Kepler home. Do not edit the selected generation in place.
A change to bundled guidelines must be included in a newly built and selected complete package
generation. Existing custom files under an XDG guideline path are preserved, but Kepler does not
automatically adopt or discover them.

| Bundled resource | Covers |
|-----------|--------|
| `general` | Cross-language coding style |
| `golang` | Go style, setup, testing, patterns, e2e |
| `typescript` | TypeScript setup, style, patterns, unit + e2e testing |
