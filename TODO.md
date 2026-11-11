# Kepler To Do (archival pre-unified record)

> This file preserves historical checklist entries and their original checked/unchecked status;
> it is not a current backlog or setup contract. Current setup activates a complete immutable
> package generation and does not copy built-in templates or guidelines into the XDG Kepler
> home. See the current [installation contract](docs/installation.md#setup-and-installed-resources)
> and [release design](docs/unified-release-design.md). Historical task status has not been
> re-evaluated.

## Historical Next Up (unchecked status preserved)

- [ ] Review XDG_CONFIG_HOME settings-path behavior
- [ ] Improve settings.yaml structure
- [ ] Keep improving the Assisted skills (`skills/kepler-*`)
- [ ] Keep artifact templates in `bundle/templates/` aligned with what the skills expect

## Historical Completed (pre-unified records preserved)

- [x] Strip Kepler to a template-setup CLI: removed the Autonomous engine and Ambient memory code (0.3.0). Full-feature state preserved on `archive/full-feature-pre-cleanup` and tag `pre-cleanup-0.2.1`
- [x] `kepler setup` copies `bundle/templates/` into `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/` (SDD framework artifact templates)
- [x] `kepler setup` copies `bundle/guidelines/` into `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/guidelines/`
