# Install Kepler

Kepler installation has separate owners. A published release provides one versioned archive per target, with the standalone CLI and complete resource package. The bootstrap installer stages one archive and invokes its `kepler setup`; setup alone activates the selected generation and registers Kepler's Pi package. Pi owns discovery, loading, and execution.

**Release status:** Kepler 3.0.0 has not been published. This checkout contains an uncommitted development candidate; these instructions describe its interface for use only after publication. Verification and review evidence applies only to the exact source and archive recorded for that candidate. Any source change requires new candidate-bound checks. This document does not authorize installation, migration, deployment, or publication.

## Install the CLI and resource archive

On Linux or macOS with x86_64 or arm64, use this command only when a compatible release is published:

```bash
curl -fsSL https://raw.githubusercontent.com/vialactea-works/kepler/main/install.sh | bash
```

The installer selects the latest stable release by default. Set `KEPLER_VERSION` (for example, `v3.0.0`) to select a specific published version or `KEPLER_REPO_SLUG` to select a different repository. It downloads the target archive and `SHA256SUMS`, validates the selected archive and target identity, checks archive paths and limits, stages it, and invokes the staged candidate's `kepler setup`. The installer does not promote the selector or stable command; setup owns that activation. Failed setup leaves its candidate staging evidence in place and reports the path.

The installer and setup write under the user's home directory. Review their target paths and preserve any existing installation before running them. The installer does not install Pi or its extensions.

## Install skills and Claude Code role definitions

Pi users do not need a separate skill manager for Kepler resources: `kepler setup` registers one package at `~/.kepler-dist/current`. Its descriptor exposes eleven skills under `bundle/skills/` and four Pi-native roles under `bundle/agents/pi/v1/`. Pi and pi-subagents own loading and execution.

For other hosts, the selected generation keeps the portable skill trees under `~/.kepler-dist/current/bundle/skills/`. Install the skills that match the CLI generation with that host's skill manager. For the Vercel Skills CLI, select the exact names:

```bash
npx skills add ~/.kepler-dist/current/bundle/skills \
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

Keep each complete skill directory, including `references/` files. The host or skill manager owns installation and overwrite behavior outside Pi. Review its preview before approving writes.

The package also retains four separate Claude Code definitions under `~/.kepler-dist/current/bundle/agents/claude-code/v1/`. Pi setup does not install or translate them. Claude Code loads project definitions from `.claude/agents/` and user definitions from `~/.claude/agents/`; review definitions and existing names before copying. Installation does not prove that the host loaded a role or that an agent follows its prompt. See the [Claude Code subagent documentation](https://code.claude.com/docs/en/sub-agents).

## Setup and installed resources

Run `kepler setup` to validate and activate a complete generation. Built-in templates and guidelines remain in the selected immutable generation at `~/.kepler-dist/current/bundle/templates/` and `~/.kepler-dist/current/bundle/guidelines/`; setup does not copy them into the XDG Kepler home. That home stores the format-two installation receipt and preserves existing settings and custom assets. Setup does not create missing Kepler defaults/settings or Pi settings. First registration, explicit transfer, or repair updates only the exact managed Pi package entry in the existing Pi settings file under native coordination; a separately approved transfer may also change only the resources named in its plan. Coherent upgrades and no-ops leave Pi settings unchanged. Unknown files and user-modified resources are preserved. Setup does not write project artifacts, migrate history, install host prerequisites, or certify a host.

Pi setup requires Pi 1.2.0, pi-subagents 0.76.1, an existing Pi agent directory, and an initialized `settings.json`. Kepler resolves the agent directory from `KEPLER_PI_AGENT_DIR`, then `PI_CODING_AGENT_DIR`, then `~/.pi/agent`. Setup checks visible user/project conflicts before activation. It does not create Pi settings or install Pi, pi-subagents, models, credentials, or permissions.

The selected generation is under `~/.kepler-dist/generations/<generation-id>/`. `~/.kepler-dist/current` is its one selector and the stable Pi package source; `~/.local/bin/kepler` points through that selector. On first registration, setup creates a valid empty bootstrap package at the selected source before registering it, then selects the complete candidate. Upgrades keep the registered package path unchanged and replace only the selector after checks. The bootstrap installer does not promote either path.

Before activation, setup validates the archive's release/source/target identity, manifest, complete inventory, payload digests, and the six required v3 Construction templates: `unit-of-work.md`, `design.md`, `quality.md`, `plan.md`, `delivery.md`, and `supporting-document.md` under `templates/v3/construction/`. Missing required resources or unsupported host prerequisites fail closed. If setup reports a conflict, keep the selected generation and inspect the named path; do not force an overwrite.

## Native ownership transfer

When preflight finds an external owner of a conflicting Pi resource, ordinary setup reports the exact safe transfer plan and its digest without transferring or activating the dependent candidate. Review that plan, then pass `--accept-native-transfer <digest>` only if the exact plan remains acceptable. The digest is invalid if candidate, configuration, source, or resource facts change. Unknown, custom, modified, or mixed resources remain blocked; bootstrap never supplies consent. Keep existing custom settings and resources.

## Upgrade between changes

Treat the CLI and resource package as one compatible generation. Finish active work with the generation that started it. The release installer stages a selected target archive and calls its setup; setup changes the single selector only after validation. A normal upgrade does not rewrite the stable Pi package registration. Start a new host session after first installation and later major transitions; an existing session can retain the prior prompts and skills.

Setup does not remove unknown files, convert old artifacts, translate history, adopt v2 work as v3 authority, or restore runtime locks and worker ownership. Keep project data unchanged and use the workflow generation that created it. If an update is interrupted or setup reports incompatible resources, stop before starting new work and follow [recovery guidance](recovery.md).

## Release targets and verification limits

Release artifacts target Linux and macOS on x86_64 and arm64. The workflows configure native jobs for `linux-x64`, `linux-arm64`, `darwin-x64`, and `darwin-arm64`; each job must build and run its exact target archive. A configured job is not a passed result, and release cross-compilation on Linux x64 is build evidence only. Check the actual source-bound run before relying on a platform result; evidence from one target does not establish execution on another. Kepler does not certify agent behavior on any host.
