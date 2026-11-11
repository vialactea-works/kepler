# Setup and utility commands

Use this reference for version-specific home initialization, UUID allocation, and shared Markdown metadata checks. Read [Installation](../installation.md) before setup writes to a home.

## `kepler setup`

```text
kepler setup
```

Setup accepts no positional arguments or command-specific options. It does not use `--project`; the invocation directory does not affect home initialization.

```bash
KEPLER_HOME="/absolute/path/to/version-specific-home" kepler setup
```

### Inputs and prerequisites

`KEPLER_HOME` must be an absolute path. There is no fallback. Select an empty, version-specific path that matches the CLI release. Setup validates the executing build identity and complete matching resource package before writing. A source runner without a valid package identity cannot initialize a release home.

### Result and effects

Success uses the standard JSON envelope and exit 0. `data` contains:

| Field | Meaning |
| --- | --- |
| `home` | Absolute path selected through `KEPLER_HOME`. |
| `release` | Release identity of the executing CLI and resources. |
| `status` | `initialized` for first initialization or `unchanged` for a ready home of the same release. |

On first setup, Kepler seeds templates, guidelines, skills, agent profiles, `settings.yaml`, and `home-metadata.json`. A successful repeat does not reconcile resources, restore deletions, or overwrite edits. It does not copy settings between version homes or configure host discovery.

### Failures and recovery

Failure exits 1 with `code`, `message`, `details`, and `recovery`. Missing or invalid `KEPLER_HOME` returns `kepler_home_required`. Other identity, resource, metadata, path, or filesystem failures return `home_initialization_failed`.

A compatible pending initialization can resume with the same release and resource digest. An unknown non-empty home, malformed metadata, or incompatible home fails closed. First initialization can leave partial files after an error; failure does not prove rollback. Inspect `$KEPLER_HOME/home-metadata.json` and preserve existing content before retrying. See [setup recovery](../recovery.md#interrupted-installation-or-setup).

## `kepler uuid`

```text
kepler uuid
```

```bash
kepler uuid
```

Allocates one fresh UUIDv4. Success returns `data.uuid` and exits 0. It accepts no positional arguments or command-specific options. `-h, --help` prints help. It requires no project and writes no project files. Allocation failure exits 1.

Use different identities for different artifacts, graphs, and tasks. Do not substitute an evidence ID for the event ID that records it.

## `kepler lint`

```text
kepler lint <path...> [--project <path>]
```

| Input | Requirement |
| --- | --- |
| `<path...>` | One or more explicit existing Markdown files ending in `.md`. |
| `--project <path>` | Optional Git project root containing `.kepler/`. Default: invocation directory. |
| `-h, --help` | Print help. |

```bash
kepler lint "$UNIT_DIRECTORY/unit-of-work.md" "$UNIT_DIRECTORY/design.md" --project "$PROJECT"
```

Paths resolve against the selected project. Their canonical targets must stay inside it. The command rejects unavailable files, non-files, outside-project targets, and invalid extensions. It does not scan a directory automatically.

The operation reads files and validates shared metadata. Success returns `findings: []`. Invalid metadata fails with `metadata_validation_failed` and path/field/code/message findings. Other input failures use their own structured code. Normal exits are 0 and 1.

It does not edit the files or prove stage-specific content, technical correctness, approval, or completion. Distinguish it from [Construction graph lint](construction.md#lint) and [legacy artifact lint](workbench.md#workbench-lint).

## `kepler --print-build-identity`

This distribution diagnostic is outside the registered public command tree. Release packaging checks use it to inspect the actual compiled executable. It is not a general global option or a workflow command.

```text
kepler --print-build-identity
```

Pass this flag alone. A complete compiled executable writes one raw identity JSON line and exits 0. The identity includes format/release, schema major, source, resources, and target. Extra arguments or an executable without compiled identity produce a text diagnostic and exit 1. This path does not use the normal result envelope or CLI help parser.

Do not infer identity from an archive filename alone. Do not relabel a development executable as production after a later commit. See [Development](../development.md#resources-and-releases).

## Sources

[Setup command](../../packages/cli/src/cli/nest/setup.command.ts), [setup application](../../packages/cli/src/cli/setup.service.ts), [metadata lint](../../packages/cli/src/cli/metadata-lint.ts), [UUID allocation](../../packages/cli/src/cli/uuid.ts), and [entrypoint diagnostic](../../packages/cli/src/cli/main.ts).
