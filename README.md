# Kepler

Kepler is a coding toolbox focused on producing high-quality code and architecture. It brings
structure to AI-assisted coding — carrying a change from idea to merge through disciplined,
spec-driven steps that any coding agent can follow.

Kepler is now a **simple CLI that sets up the Assisted workflow**: `kepler setup` installs the
spec-driven-development artifact templates and coding guidelines into `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/`, while
`kepler workbench` provides the supported workflow-mechanics surface used by the skills. The
Autonomous workflow engine and Ambient memory layer were removed in 0.3.0; the last full-feature
state is preserved on the `archive/full-feature-pre-cleanup` branch and the `pre-cleanup-0.2.1` tag.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/vialactea-works/kepler/main/install.sh | bash

npx skills add https://github.com/vialactea-works/kepler
```

The first command installs the platform-specific standalone Bun executable and its sidecar bundle,
then sets up artifacts in `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler`. The second installs the skills in your preferred coding agent.

Kepler stores global files under `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/` and project artifacts under `.kepler/`. If the previous hidden global directory `${XDG_CONFIG_HOME:-$HOME/.config}/.vialactea-works/kepler/`, legacy `~/.hamilton/`, or project `.hamilton/` contains data and the corresponding canonical path does not exist, Kepler copies the data and leaves the source unchanged. Existing canonical data takes precedence without merging or deleting legacy data; when both legacy global directories exist, Kepler uses the previous hidden directory.

**Environment variables** (optional):
- `KEPLER_VERSION` — install a specific release version (default: latest)
- `KEPLER_REPO_SLUG` — GitHub repo slug to download from (default: `vialactea-works/kepler`)
- `KEPLER_BUNDLE_DIR` — override where `kepler setup` reads `bundle/` from (for development)

See the **[Skills reference](docs/skills.md)** for what each skill does, its inputs, and its outputs,
and the **[SDD framework](docs/sdd-framework.md)** for the design rationale.
The **[Change state machine](docs/change-state-machine.md)** documents lifecycle states,
skill ownership, and transition guards with their artifact-field inputs.

## Nest CLI migration

The CLI now uses NestJS with `nest-commander`; releases provide a standalone Bun executable with its
sidecar `bundle/`. The former Effect-generated global options `--completions`, `--log-level`, and
`--wizard` are removed, absent from help, and rejected as usage errors with exit code `2`.
A setup failure exits with status `2` instead of `0`.

## What the CLI does

`kepler setup` bootstraps `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/`:

```
${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/
  templates/     # SDD artifact templates (plan.md, design.md, proposal.md, ...)
  guidelines/    # coding guidelines (general, golang, typescript)
  settings.yaml  # default settings
```

The distributed `kepler workbench` command is the supported surface for workflow mechanics. Its
operations are `kepler workbench isolate`, `kepler workbench diff`,
`kepler workbench precondition`, `kepler workbench context`, and
`kepler workbench prototype`. Artifact validation uses `kepler workbench lint`.

```bash
kepler setup          # bootstrap ${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/ (preserves existing settings)
kepler setup --force  # rerun setup; preserves existing settings
kepler workbench --help
kepler --help
```

## Assisted skills — start here

The **[spec-driven development skills](docs/sdd-framework.md)** carry a change through a fixed
seven-step sequence, one disciplined stage at a time:

```
init ──▶ [ propose ] ──▶ plan ──▶ ( code ◀──▶ code-feedback ) ──▶ review ──▶ finish-work
  0        1 optional      2          3             4                5            6
                                     repeat per task              once per change
```

Each step is a self-contained `SKILL.md` that names no engine internals. It depends on the project's
standards (`AGENTS.md`), the artifact templates and coding guidelines Kepler installs under
`${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/` with `kepler setup`, the distributed `kepler workbench` command, and the
per-change artifacts under the project's own `.kepler/` directory. The same skill guides a person
in an editor or an agent like Claude Code. The heavyweight front door (`propose`) is optional; a
tactical change starts at `plan`.

The workbench provides the supported mechanics for stable checkpoints, diff packaging, change
context, precondition gates, isolation, and prototype branches. Skills retain judgment and sequencing
around those operations.

### Artifacts

The skills produce durable, per-project artifacts under `.kepler/`:

```text
.kepler/
  specs/                              # canonical capability truth and project language
    glossary.md                       # context-scoped ubiquitous language
    <capability>.md
  changes/
    <YYYY-MM-DD-title>/
      proposal.md                     # optional — why
      design.md                       # optional — domain model and architecture
      requirements/<capability>.md    # optional — what (delta form)
      plan.md                         # required — the handoff contract
      progress.md                     # required — current task ledger
      tasks/
        task-N/
          progress.md                 # implementation attempt history
          feedback.md                 # task-feedback verdict history
      review.md                       # whole-branch review history
      finish.md                       # finish attempt and outcome history
```

Changes are ephemeral; specs are durable. When a change finishes, its requirement deltas fold into
`specs/`, the project's always-current requirements truth. Init establishes the canonical glossary;
new proposals use its scoped language and describe involved contexts and boundary impact. A capability
may represent a domain, subdomain or bounded context, including infrastructure responsibilities.
A design explains the relevant model, package responsibilities, ports and adapters, and code attribution
before its supporting decisions. Coverage scales to the change; unresolved language is surfaced, not invented.
See [domain language and capability scope](docs/skills.md#domain-language-and-capability-scope).

When upgrading this workflow, first finish any active change with the Kepler generation that
created it. Between changes, update the CLI and the agent-loaded skills together from one Kepler
generation, run `kepler setup`, verify `kepler workbench --help`, and then start the next change.
Setup does not delete stale helper files from an older generation. `bun run purge` removes the local
CLI symlink and `~/.kepler-dist/`, but preserves Kepler's global data. See the **[between-changes migration guidance](docs/sdd-framework.md#upgrading-to-the-split-workflow)**
for the exact procedure. Never replace one part of the installed generation while a change is active.

## Requirements

- **A coding agent that loads `SKILL.md` files** (e.g. Claude Code).
- **An existing git repo** — Kepler operates on an existing repository (no greenfield support yet).

## Development

### Quick start

```bash
# 1. Install the CLI

# For end users, use the install.sh script:
curl -fsSL https://raw.githubusercontent.com/vialactea-works/kepler/main/install.sh | bash

# For contributors building from source:
bun install
bun run build                  # compile TypeScript
bun run install-local          # symlink to ~/.local/bin/
kepler setup                 # install bundle/{templates,guidelines}/ → ${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/

# 2. Make the pipeline skills available to your coding agent.
#    The skills live in skills/kepler-*/ — copy or symlink them into a
#    skills directory your agent loads (e.g. ~/.claude/skills/), or point
#    the agent at the SKILL.md paths.

# 3. In your project, run the skills through your agent, in order:
#    kepler-init         → standards + canonical glossary + .kepler/ workspace (once)
#    kepler-propose      → proposal + requirements + design (optional)
#    kepler-plan         → plan.md + root task ledger + task progress files
#    kepler-code         → implement one task and record its attempt
#    kepler-code-feedback → review that task; loop with code until approved
#    kepler-review       → inspect the whole branch once after all tasks
#    kepler-finish-work  → gate, sync specs, record intent, merge / PR / no-op, verify, record outcome
```

**Build and test commands** (for contributors):

```bash
bun install                    # install dependencies
bun run build                  # compile TypeScript (tsc -p tsconfig.json)
bun run test                   # run Vitest on Bun
bun run install-local          # build + symlink the CLI locally
bun run purge                  # remove the CLI symlink and ~/.kepler-dist/; preserves Kepler data
```

**Do not use `bun test`** — it selects Bun's native test runner. Use `bun --bun vitest run` or
`bun run test` instead. See [AGENTS.md](AGENTS.md) for conventions and
[CONTRIBUTING.md](CONTRIBUTING.md) for the docs-sync rules.

## License

Kepler is licensed under the [Apache License 2.0](LICENSE). Some skills in this repository are adapted from other projects; their original licences are reproduced in [NOTICE](NOTICE) and in a `NOTICE` file beside each forked skill directory.
