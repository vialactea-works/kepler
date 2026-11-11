# Configuration and paths

Use this reference to select project and Kepler resource paths. Kepler has no general `config` command or global `--config` option.

## Select a project

Construction, mission, audit, Git material, and metadata lint commands use the current directory unless you supply `--project <path>`.

Select a Git working-tree root. A nested directory or bare repository is not a valid project. The root must contain an existing local `.kepler/` directory. Project selection does not initialize the directory or migrate old records. A duplicate `--project` selector fails.

```bash
kepler workflow construction unit list --project /absolute/path/to/project
```

The earlier [workbench](cli/workbench.md) has its own current-directory and context rules. It does not inherit the Construction selector model.

## Kepler home

`KEPLER_HOME` is the absolute path to the resource home for the selected CLI release. Kepler does not choose a default or fall back when this variable is absent.

A common layout is:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/versions/<version>/
```

The caller chooses `<version>` to match the installed CLI. Each version has its own `settings.yaml`, templates, guidelines, skills, agent profiles, and `home-metadata.json`.

| Path | Owner and contents |
| --- | --- |
| `$KEPLER_HOME/` | User-selected version-specific resource home. |
| `$KEPLER_HOME/templates/` | Packaged templates. |
| `$KEPLER_HOME/guidelines/` | Packaged guidelines. |
| `$KEPLER_HOME/skills/` | Packaged skill trees and references. |
| `$KEPLER_HOME/agents/` | Packaged agent profiles for supported hosts. |
| `$KEPLER_HOME/settings.yaml` | Kepler settings file, initialized to an empty mapping. |
| `$KEPLER_HOME/home-metadata.json` | Release and resource-digest identity for safe initialization and resume. |
| `.kepler/missions/<mission-id>/` | Project-owned mission artifacts and history. |

Setup seeds an empty home once. Repeating setup for the same release preserves edits and deletions. It does not migrate configuration between versions or update host settings. See [Installation](installation.md).

## Optional Core settings

The Core API can read `$KEPLER_HOME/settings.yaml`. A missing file produces no configuration. An empty document produces an empty mapping. Invalid YAML or a non-mapping root raises `KeplerConfigError`.

The settings type is a generic mapping. The current CLI does not implement a global merge or precedence scheme for model, LSP, or extension keys in that file. A stored key does not enable a host capability. Hosts own their configuration and execution.

See [`config.ts`](../packages/core/src/config.ts) for the parser. See [Development](development.md) for the Core API boundary.

## Environment variables

| Variable | Use |
| --- | --- |
| `KEPLER_HOME` | Required absolute path to the selected release's resource home. There is no fallback. |
| `XDG_CONFIG_HOME` | Optional base used by the caller's conventional home path. The caller must produce an absolute `KEPLER_HOME`. |
| `HOME` | User home used by the caller when constructing the conventional XDG path. |
| `PATH` | Executable discovery managed by the caller or software manager. |
| `KEPLER_PACKAGE_ROOT` | Optional development/test package-root override. Setup validates the selected package and production-identity binaries reject the override. |
| `KEPLER_CLI_RELEASE` | Set by the CLI entrypoint. It is not a supported user version override. |
| `PI_SESSION_ID` | Worker identity input for some earlier workbench operations. Not v3 workflow authority. |

The software manager, host, or user selects the executable version and its matching home. Kepler setup does not download releases, change `PATH`, select an active CLI, or register Pi or Claude Code resources.

## Older project data

The Core service retains safe path-copy behavior for legacy `.hamilton/` project data. It copies only when the canonical `.kepler/` destination is absent and preserves the source. It does not merge existing destinations or convert workflow artifacts and history.

Construction project selection still requires an existing `.kepler/` directory. Do not move or edit old records to make them appear to be mission history.

## Sources and related guides

Implementation: [`KeplerService`](../packages/core/src/service.ts), [project selection](../packages/cli/src/cli/project-selection.ts), and [setup runtime](../packages/cli/src/cli/setup-runtime.ts).

Continue with [Installation](installation.md), [state and artifacts](missions/state-and-artifacts.md), or [Recovery](recovery.md).
