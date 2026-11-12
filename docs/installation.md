# Install and initialize Kepler

Kepler setup initializes a version-specific resource home. It does not install the CLI, select a release, change `PATH`, or configure a coding-agent host. Use your existing software manager to install and select the CLI, then set `KEPLER_HOME` to the matching absolute home before running setup.

The published `v3.0.0` tag's setup runtime and Core path resolver require an absolute `KEPLER_HOME` and initialize release-bound resources. Verify the installed executable's identity and matching package, rather than inferring behavior from a specification status note or checkout runner.

## Choose a version-specific home

Use a separate home for each Kepler release. A common location is:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/versions/<version>/
```

The software manager, host, or user chooses the CLI version and constructs the path. Kepler does not select a version or infer a home. `KEPLER_HOME` must be an absolute path. If it is unset or invalid, setup fails without selecting a fallback.

**Agent operation example, not a developer instruction:** after you select the version and authorize setup, the agent supplies the absolute home for the matching installed CLI:

```bash
KEPLER_HOME="/absolute/path/to/version-specific-home" kepler setup
```

## What setup does

The release package carries the CLI and its matching resources together. Setup validates the executing package, then seeds the selected home with its templates, guidelines, skills, agent profiles, default `settings.yaml`, and `home-metadata.json`.

The initialized home has this structure:

```text
$KEPLER_HOME/
├── agents/
├── guidelines/
├── skills/
├── templates/
├── home-metadata.json
└── settings.yaml
```

Setup owns only these home-initialization writes. It does not register resources with Pi, Claude Code, another host, or a skill manager. The home makes resource files available; you or your host choose how to discover and load them. Setup does not create project markers, migrate project history, start agents, or change host settings.

## Preservation and reinitialization

Setup initializes an empty home once. A successful repeat for the same release returns `unchanged` and preserves edits and deletions. It does not restore a deleted resource or overwrite a changed file. Use a new version-specific home for another release; setup does not copy settings or resources between version homes.

If setup stops during its first initialization, it can resume only when the pending metadata matches the same release and resource digest. It creates missing files without replacing existing resources or settings, then updates the matching pending metadata to ready. Setup refuses an unknown non-empty home without compatible Kepler metadata. Preserve that home and inspect it before choosing another path.

Setup rejects a symlink or non-directory at `KEPLER_HOME`, non-regular resource paths, unsafe relative paths, and resource symlinks. Symlinked ancestors in the caller-selected absolute path follow normal filesystem resolution. Setup does not clean up unknown files or claim rollback after an interrupted write. Read the structured failure result before retrying.

## Resources and host ownership

The current source package includes fourteen portable skill trees, four Pi role definitions, four Claude Code role definitions, templates, and guidelines. An installed release may differ: inspect its matching manifest. These are packaged files, not host registrations. A host or skill manager owns installation, discovery, loading, permissions, and session lifecycle. Avoid duplicate skill copies.

For Pi, the documented `--skill <path>` option can load the complete selected `$KEPLER_HOME/skills` directory for a session; Pi also discovers directories with `SKILL.md` under configured user/project skill locations. Confirm the named skills appear and that you can load their full instructions (for example `/skill:kepler-mission-startup`). Pi's ordinary skill loader does not itself install Kepler's role definitions. Configure your existing agent host/subagent manager to expose `$KEPLER_HOME/agents/pi/v1/` and verify the four roles, their tool capabilities, and a separate non-author reviewer context before Implementation. Do not assume a Markdown file alone enables dispatch or enforces permissions.

For Claude Code, the host owns discovery of `.claude/skills/` and `.claude/agents/` in the selected user or project scope. Place or link **complete** Kepler skill directories and the matching `agents/claude-code/v1/` definitions using the host's documented configuration procedure; ask before replacing differing files or changing global settings. Claude Code's `--add-dir` alone exposes files, not arbitrary `$KEPLER_HOME/skills` as discovered skills: additional directories must have the host's `.claude/skills/` layout. Verify the named skills, role definitions, and independent reviewer actually load in a new session. Kepler does not create that layout or install a host plugin.

For another host, require equivalent skill-directory loading (including references/notices), role selection, subprocess/Git access, isolated authors, independent reviewers, and explicit permission controls. If any capability is missing, stop and report the smallest missing configuration. Resource files do not certify that a host loaded or followed them; setup success reports only home initialization.

To prepare an existing Git project without starting work, ask the agent to use optional `kepler-init`. It checks the worktree root and safely establishes the local `.kepler/` marker without scaffolding old change-based artifacts or creating a mission. Separately, before a mission, ask your coding agent: “Check that this session can use the selected Kepler CLI and matching home, load its Kepler skills and roles, and verify independent worker contexts. Tell me what needs my authorization before installing or changing host configuration.” See the [prompt-first tutorial](missions/tutorial.md).

## Project and legacy data

The project workflow stores records under `.kepler/`. Setup does not convert old change-based artifacts or workflow history. Core retains safe `.hamilton/` to `.kepler/` project path-copy behavior: it copies only when the canonical destination does not exist, preserves the source, and does not merge existing data. This path behavior is separate from home initialization.

## Run from a repository checkout

For agents or operators developing from source, use Bun 1.4.0 and the pinned workspace dependencies. Dependency installation and builds write repository outputs, so use an authorized checkout:

```bash
bun install --frozen-lockfile
bun run build
bun packages/cli/dist/cli/main.js --help
```

For ordinary CLI operations, replace `kepler` with `bun /absolute/path/to/kepler/packages/cli/dist/cli/main.js`. The checkout runner does not have a production build identity and cannot initialize a release home.

## Release targets and verification

The release targets are Linux and macOS on x86_64 and arm64. A target is verified only when its native workflow executes the exact archive. A configured matrix or cross-build does not prove native execution. Publication and deployment require separate authorization.

Continue with the [prompt-first mission tutorial](missions/tutorial.md). Agents and operators can use [Configuration](configuration.md) and the [setup command reference](cli/utilities.md#kepler-setup).
