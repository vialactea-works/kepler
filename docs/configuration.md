# Configuration and paths

Use this reference to select project, installation, and host paths. Kepler does not have a general `config` command or a global `--config` option.

## Select a project

Construction, mission, audit, Git material, and metadata lint commands use the current directory unless you supply `--project <path>`.

Select a Git working-tree root. A nested directory or bare repository is not a valid project. The root must contain an existing local `.kepler/` directory. Project selection does not initialize the directory or migrate old records. A duplicate `--project` selector fails.

```bash
kepler workflow construction unit list --project /absolute/path/to/project
```

The earlier [workbench](cli/workbench.md) has its own current-directory and context rules. It does not inherit the Construction selector model.

## Installation paths

| Path | Owner and contents |
| --- | --- |
| `~/.kepler-dist/generations/<generation-id>/` | Complete immutable generation. |
| `~/.kepler-dist/current` | The single selected-generation link. |
| `~/.local/bin/kepler` | Stable launcher through the selected generation. |
| `~/.kepler-dist/current/bundle/` | Built-in templates, guidelines, skills, and role definitions. |
| `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/installation.json` | Format-two installation receipt. |
| `.kepler/missions/<mission-id>/` | Project-owned mission artifacts and history. |

For the Core service, `XDG_CONFIG_HOME` must be absolute to override `$HOME/.config`. A relative or empty XDG value uses the default. Programmatic `KeplerService` options can supply explicit home and XDG paths. See [`service.ts`](../packages/core/src/service.ts).

Setup does not copy built-ins into XDG template or guideline directories. It preserves custom files. It does not create a missing `settings.yaml` or initialize Pi settings.

## Optional Core settings

The Core API can read `<global-home>/settings.yaml`. A missing file produces no configuration. An empty document produces an empty mapping. Invalid YAML or a non-mapping root raises `KeplerConfigError`.

The settings type is a generic mapping. The current CLI does not implement a global merge or precedence scheme for model, LSP, or extension keys in that file. A stored key does not enable a host capability. Pi owns its own configuration and execution.

See [`config.ts`](../packages/core/src/config.ts) for the parser. See [Development](development.md) for the Core API boundary.

## Pi settings selection

Setup selects the Pi agent directory in this order:

1. `KEPLER_PI_AGENT_DIR`, if the variable is present.
2. `PI_CODING_AGENT_DIR`, if the first variable is absent.
3. `~/.pi/agent`.

An explicitly empty override fails. It does not fall through to the next source. Setup requires an existing directory and initialized `settings.json`.

Setup also reads the visible project's `.pi/settings.json`, if present. User and project resource settings can affect package selection, loader discovery, and conflicts. Custom filters or overrides can block managed registration. Setup does not overwrite them to obtain a passing result.

## Environment variables

| Variable | Use and default |
| --- | --- |
| `HOME` | User home for installation and Core paths. The runtime home is the fallback when absent. |
| `XDG_CONFIG_HOME` | Absolute Core configuration base. Default: `$HOME/.config`. |
| `PATH` | Executable discovery for Git, Pi, and commands that the caller runs. |
| `KEPLER_PI_AGENT_DIR` | Explicit setup agent directory. Highest-priority agent-directory override. |
| `PI_CODING_AGENT_DIR` | Pi agent directory when the Kepler-specific override is absent. |
| `KEPLER_PI_BINARY` | Pi executable for setup's version check. Default: `pi`. |
| `PI_PACKAGE_DIR` | Optional Pi asset directory used by preflight. An empty or invalid explicit value fails. |
| `PI_SUBAGENT_EXTRA_AGENT_DIRS` | Additional agent scan directories checked for visible conflicts. |
| `KEPLER_VERSION` | Installer-only published release selection. Default: latest stable GitHub release. |
| `KEPLER_REPO_SLUG` | Installer-only GitHub `owner/repository`. Default: `vialactea-works/kepler`. |
| `KEPLER_BUNDLE_DIR` | Development/test bundle lookup override. It does not bypass compiled-generation identity checks. |
| `KEPLER_PACKAGE_ROOT` | Development/test complete-package override. Production setup rejects this override. |
| `PI_SESSION_ID` | Worker identity input for some earlier workbench operations. Not v3 workflow authority. |

The installer reads its variables before download. Runtime setup does not use `KEPLER_VERSION` to select a release. It validates the candidate that invokes it.

The native test and development-package harnesses also use `KEPLER_PI_SUBAGENTS_ROOT`, `KEPLER_PI_NODE_BINARY`, and `KEPLER_PI_SDK_ENTRY_PATH`. These variables select existing test collaborators. They are not ordinary mission settings. See [Development](development.md#native-distribution-tests).

`KEPLER_CLI_RELEASE` is set by the CLI entrypoint. It is not a supported user version override. Kepler has no documented global verbosity, output-format, or automatic-approval environment switch.

## Older data paths

The Core service retains safe path-copy behavior for `.hamilton/` project data and older global paths. It copies only when the canonical destination is absent. It preserves the source and does not merge existing destinations. The previous hidden XDG path takes precedence over `~/.hamilton/` when both exist and the canonical global path is absent.

This path-copy behavior is not a v2-to-v3 workflow conversion. Construction project selection still requires an existing `.kepler/` directory. Do not move or edit old records to make them appear to be mission history.

## Sources and related guides

Implementation: [`KeplerService`](../packages/core/src/service.ts), [project selection](../packages/cli/src/cli/project-selection.ts), [Pi preflight](../packages/cli/src/cli/pi-preflight.ts), and [setup runtime](../packages/cli/src/cli/setup-runtime.ts).

Continue with [Installation](installation.md), [state and artifacts](missions/state-and-artifacts.md), or [Recovery](recovery.md).
