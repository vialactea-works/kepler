# Kepler roadmap (archival pre-unified record)

> This file preserves the pre-unified roadmap and its historical items; it is not current setup
> or release authority. Current setup activates a complete immutable package generation and does
> not copy built-in templates or guidelines into the XDG Kepler home. See the current
> [installation contract](docs/installation.md#setup-and-installed-resources) and
> [release design](docs/unified-release-design.md). The historical summary and unchecked steps
> below have not been re-evaluated.

## Historical pre-unified summary

Kepler is a simple CLI that installs the Assisted-mode artifact templates and
coding guidelines into `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/`. Legacy
`~/.hamilton/` global data is copied to this canonical location when it is absent, without deleting
the source. The Autonomous workflow engine and Ambient memory layer were removed; the last
full-feature state is preserved on the `archive/full-feature-pre-cleanup` branch and the
`pre-cleanup-0.2.1` tag.

## Historical next steps

- Keep the [Assisted skills](docs/skills.md) and the [SDD framework](docs/sdd-framework.md) sharp:
  each `SKILL.md` should stay tool-agnostic and self-contained.
- Keep the artifact templates in `bundle/templates/` aligned with what the skills expect.
- Keep the guidelines in `bundle/guidelines/` current for the reference stacks (general, golang, typescript).
