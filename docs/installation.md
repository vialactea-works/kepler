# Install Kepler

Kepler installation has separate owners. The release installer installs the standalone CLI and its compatible sidecar bundle. `kepler setup` installs Kepler-owned templates, guidelines, and missing default settings. Your coding-agent host or skill manager owns portable skills and native agent definitions.

## Install the CLI and bundle

On Linux or macOS with x86_64 or arm64, run:

```bash
curl -fsSL https://raw.githubusercontent.com/vialactea-works/kepler/main/install.sh | bash
```

The installer selects the latest release by default. Set `KEPLER_VERSION` to select a specific published version or `KEPLER_REPO_SLUG` to select a different repository. It downloads the target binary, `kepler-bundle.tar.gz`, and `SHA256SUMS`, verifies checksums, installs the binary under `~/.kepler-dist/bin/kepler`, links it at `~/.local/bin/kepler`, extracts the sidecar, then runs `kepler setup`.

The installer writes under the user's home directory. Review the script and its target paths before running it. It does not install coding-agent skills or native role definitions.

## Install skills and Claude Code role definitions

The release sidecar contains eleven versioned portable skills under `~/.kepler-dist/bundle/skills/`. Install the skills that match the CLI generation with your host's skill manager. For the Vercel Skills CLI, select the exact names and use the local sidecar so the skill source matches the installed release:

```bash
npx skills add ~/.kepler-dist/bundle/skills \
  --skill kepler-design \
  --skill kepler-quality \
  --skill kepler-plan \
  --skill kepler-orchestrate \
  --skill kepler-code \
  --skill kepler-code-feedback \
  --skill kepler-review \
  --skill kepler-finish-work \
  --skill kepler-grilling \
  --skill kepler-domain-modelling \
  --skill kepler-research
```

Add `--global` to install for your user rather than the current project. Select agent targets with the skill manager's `--agent` option when needed. Read the manager's preview before approving writes; its installation directory and overwrite behavior belong to that tool.

The sidecar includes four Claude Code agent definitions under `~/.kepler-dist/bundle/agents/claude-code/v1/`. Claude Code loads project definitions from `.claude/agents/` and user definitions from `~/.claude/agents/`. Review the definitions and existing names before copying them. Installing them does not prove that Claude Code loaded them or that an agent follows its prompt. For current host behavior, see the [Claude Code subagent documentation](https://code.claude.com/docs/en/sub-agents).

## Setup and installed resources

Run `kepler setup` to recheck the selected compatible bundle and install its templates and guidelines in `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/`. Setup creates default settings only when absent and records an installation receipt. It keeps existing settings, unknown files, and user-modified resources. It does not install host-native skills or agents, create project artifacts, migrate history, or certify a host.

The release installer runs setup after installing the binary and bundle. Run `kepler setup` again to verify or complete that Kepler-owned installation. If setup reports a necessary-path conflict or incompatible bundle, keep the current installation and inspect the named path; do not force an overwrite.

## Upgrade between changes

Treat the CLI, sidecar, and host-loaded skills as one compatible generation. Finish active work with the generation that started it. Then install the selected CLI release, update host-loaded skills and role definitions from that release's sidecar, run `kepler setup`, and check `kepler --help` plus the command-specific help you use.

Setup updates only verified, unmodified installer-managed resources. It does not remove stale helper files, convert old artifacts, translate history, adopt v2 work as v3 authority, or restore runtime locks and worker ownership. Keep old project data unchanged and use the workflow generation that created it. If an update is interrupted or setup reports incompatible resources, stop before starting new work and follow [recovery guidance](recovery.md).

## Release targets and verification limits

Release artifacts target Linux and macOS on x86_64 and arm64. Pull-request and release workflows configure native standalone installer checks for `linux-x64`, `linux-arm64`, `darwin-x64`, and `darwin-arm64`. Release cross-compilation runs on Linux x64 and is build evidence only; it does not prove execution on a target. Check the actual CI run before relying on a platform result. Kepler does not certify agent behavior on any host.
