---
name: kepler-init
description: "Prepare an existing Git project for Kepler v3 Construction. Use when asked to initialize a project for Kepler or check whether its project root is ready; do not create a mission or unit."
---

# Prepare a project for Kepler v3

Kepler v3 selects an existing Git working-tree root containing a local `.kepler/` directory. This skill makes that project boundary ready without starting a mission, writing workflow records, configuring an agent host, or selecting a release. A project may be ready for CLI selection even when the caller still needs to install or load a matching CLI and its resources.

## Inspect before writing

1. Read repository instructions and inspect Git status. Resolve the requested path to its real Git working-tree root (`git rev-parse --show-toplevel`); reject a nested path, bare repository, or a directory outside the chosen working tree. Preserve unrelated changes. Do not initialize Git or choose another checkout without the owner's decision.
2. Check whether `.kepler/` exists at that root. A regular local directory is already the project marker; leave its contents alone. If the path is a file, symlink, or otherwise uncertain, stop rather than replacing or following it. If it is missing, check for historical `.hamilton/` data first. Creating the new marker would prevent Kepler's safe legacy path-copy from selecting that data later. Preserve both paths and ask for an explicit decision on legacy data before creating the marker; never use `kepler workbench` as a v3 migration step.
3. Check the selected Kepler CLI version and matching version-specific resource home if available, plus the project's Git identity and existing project rules. Report missing software, host-loaded skills/roles, or author identity separately from the project marker; do not install software, call `kepler setup`, change global configuration, or invent credentials. Read an existing `AGENTS.md` without replacing it. If the requester separately asks for project guidance, propose evidence-backed additions and confirm them before editing; an `AGENTS.md` or glossary is not a v3 project-selection requirement.

## Establish and verify the marker

If the root is confirmed, `.kepler/` is absent, and legacy data requires no unresolved decision, create only the empty directory with `mkdir -- "<git-working-tree-root>/.kepler"`. Do not create `specs/`, `changes/`, `reference/`, a glossary, a mission, a unit, or a stage attempt. Do not overwrite or clean existing data.

Check that `.kepler/` is still a local directory and that Git still identifies the selected root as a non-bare worktree. When a matching CLI is available, use a read-only v3 project query such as `kepler workflow construction unit list --project <git-working-tree-root>` and inspect its exit status and structured response. A query failure needs diagnosis; do not alter history to make it pass. If no CLI is available, say that CLI selection could not be verified rather than claiming it succeeded.

Report the exact project root, whether the marker was already present or created, the CLI/query result if checked, and any remaining host or identity prerequisites. Do not announce a next skill or perform mission startup: project initialization ends at project readiness.
