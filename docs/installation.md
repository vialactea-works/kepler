# Install and upgrade Kepler

Use this guide to install the CLI and its resources. Installation changes your home directory. Read the paths and prerequisites before you run setup.

The source describes the 3.0 interface. Confirm that a compatible release has been published before you use the release installer. Before publication, follow [the repository procedure](#run-from-a-repository-checkout).

## Prerequisites

The release targets Linux and macOS on x86_64 and arm64. The bootstrap script requires Bash, `curl`, `tar`, `gzip`, and standard system utilities. It uses `sha256sum` when available, then `shasum -a 256` as the fallback. It fails if neither checksum tool exists. Git is required for mission and repository operations.

The standalone CLI does not require Bun or Node for ordinary workflow commands. Your application checks can require their own runtimes and tools.

Managed Pi setup requires all of these prerequisites:

- Pi 1.2.0.
- pi-subagents 0.76.1.
- An existing Pi agent directory.
- An initialized Pi `settings.json` file.
- A visible loader installation that preflight can resolve.

Install and configure host prerequisites through their installation owner. Kepler setup does not install Pi, pi-subagents, models, credentials, or permissions. It does not start an agent session.

## Install a published archive

Replace the placeholder with an existing compatible release tag. Download that tag's matching installer:

```bash
KEPLER_VERSION='<compatible-published-tag>'
curl -fsSL "https://raw.githubusercontent.com/vialactea-works/kepler/$KEPLER_VERSION/install.sh" -o install-kepler.sh
```

Inspect the downloaded script. Execute it only after you accept its effects:

```bash
KEPLER_VERSION="$KEPLER_VERSION" bash install-kepler.sh
```

`KEPLER_REPO_SLUG` selects another GitHub `owner/repository` for archive downloads. Use an installer that matches the selected repository and release.

The installer selects one `kepler-<version>-<os>-<arch>.tar.gz` archive. It downloads the archive and `SHA256SUMS`. It checks the target, archive checksum, member paths, archive limits, and embedded executable identity. It stages the candidate and calls its `kepler setup`.

The installer does not activate the selector or stable launcher independently. Failed setup preserves its reported staging path. Inspect the error before retrying. Do not supply transfer consent through an unreviewed wrapper.

## Setup and installed resources

`kepler setup` validates and activates a complete generation. It checks the executable identity, source identity, target, resource manifest, complete file inventory, digests, and file modes.

The package contains these six Construction templates:

- `unit-of-work.md`
- `design.md`
- `quality.md`
- `plan.md`
- `delivery.md`
- `supporting-document.md`

They are under `bundle/templates/v3/construction/`. A valid digest does not excuse missing required files.

Setup stages the complete generation at `~/.kepler-dist/generations/<generation-id>/`. It selects that generation through `~/.kepler-dist/current`. The stable command at `~/.local/bin/kepler` points through this selector.

Built-in templates and guidelines remain inside the selected generation. Setup does not copy them into the XDG Kepler home. That home stores `installation.json` and preserves existing settings and custom assets. Setup does not create missing Kepler defaults or Pi settings.

On first registration, setup registers the stable package source at `~/.kepler-dist/current`. The package descriptor exposes eleven skill trees and four Pi profiles. Upgrades keep that registration path. A coherent upgrade or no-op does not rewrite Pi settings.

First registration, an approved transfer, or repair can change the exact managed package entry. Setup preserves unrelated settings. It checks the expected settings bytes, mode, and file identity before replacement. This check is not compare-and-swap protection against arbitrary concurrent editors. Keep non-cooperating editors idle during setup.

## Agent resource ownership

### Native ownership and transfer

A visible external copy can conflict with a managed skill or role. Ordinary setup can return an exact safe transfer plan and digest without activating the dependent candidate.

1. Read the returned plan.
2. Verify every named resource and owner.
3. Keep the candidate and configuration unchanged.
4. Pass the exact accepted digest:

```bash
ACCEPTED_DIGEST='<digest-from-reviewed-plan>'
kepler setup --accept-native-transfer "$ACCEPTED_DIGEST"
```

Replace the placeholder with the digest from that reviewed plan. A changed candidate, configuration, or resource invalidates the consent. Unknown, modified, custom, or mixed resources remain blocked. Do not delete a conflicting resource merely because its name matches a packaged file.

### Install skills and Claude Code role definitions

Pi users use the package registration from setup. Do not install a second copy of the same skills with another manager.

Other hosts own their skill installation. Use the complete trees under `~/.kepler-dist/current/bundle/skills/`, including their `references/` files. Install only skills that match the CLI generation.

Separate Claude Code role definitions remain under `bundle/agents/claude-code/v1/`. Pi setup does not install or translate them. Follow the receiving host's procedure. Review existing names before copying a definition.

Resource discovery does not prove that a session loaded a role or that an agent followed it. See [Skills and roles](skills.md).

## Verify the installation

```bash
command -v kepler
kepler --version
kepler --print-build-identity
kepler --help
kepler setup
```

The identity command describes the actual compiled executable. It requires no other arguments. A source runner or unidentifiable generic build fails that command.

A coherent repeated setup reports a no-op for the same generation. Check its JSON result and receipt. Setup still checks prerequisites and relevant state; a repeated command is not an unconditional success.

Start a new host session after first registration or a major transition. An existing session can retain older loaded resources. Do not use setup as proof of model or session readiness.

## Upgrade between changes

Finish active work with the generation that started it. Install a compatible complete target archive for new work. Setup selects the new generation only after validation. It preserves earlier generations and unknown files.

A genuine format-one installation receipt can enter a guarded `legacy-transition`. Setup checks known ownership and material before changing activation state. It preserves the original receipt bytes and unknown files. Do not construct or edit a receipt to force that path.

This installation transition does not convert old change artifacts or history. Setup does not resume workers, restore lock ownership, or purge project data. Keep legacy work with its original workflow model. See [Workflow versions](modes.md).

If setup stops after an external effect, preserve the selector, receipt, settings, journal, and candidate evidence. A failed result does not prove rollback. See [Recovery](recovery.md#interrupted-installation-or-setup).

## Run from a repository checkout

Use Bun 1.4.0 and the pinned workspace dependencies. The contributor setup can install dependencies and produce build outputs, so run it only in an authorized workspace:

```bash
bun install --frozen-lockfile
bun run build
bun packages/cli/dist/cli/main.js --help
```

For ordinary CLI operations, replace `kepler` with `bun /absolute/path/to/kepler/packages/cli/dist/cli/main.js`. This uses the built package entrypoint from your target project's directory. It preserves that directory as the command's working directory.

Direct TypeScript execution from another project can fail because Bun selects compiler options from its current directory. Use the built entrypoint for the mission tutorial. This checkout runner lacks an embedded standalone build identity and cannot perform complete-generation setup.

`bun run dev:package` validates an isolated development package with existing Pi prerequisites. It removes its owned temporary package after validation. It does not install a persistent development CLI or replace your stable launcher. See [Development](development.md).

## Release targets and verification limits

The native jobs target `linux-x64`, `linux-arm64`, `darwin-x64`, and `darwin-arm64`. Each job must build and execute its exact archive. A configured matrix is not a passing result. Execution on one target does not prove execution on another target.

Publication and deployment require separate authorization. Installation does not certify a host or agent. Continue with [Configuration](configuration.md), [the mission tutorial](missions/tutorial.md), or the [setup reference](cli/utilities.md#kepler-setup).
