# Setup and utility commands

Use this reference for installation activation, UUID allocation, and shared Markdown metadata checks. Read [Installation](../installation.md) before setup changes your home directory.

## `kepler setup`

```text
kepler setup [--accept-native-transfer <digest>]
```

| Option | Meaning |
| --- | --- |
| `--accept-native-transfer <digest>` | Accept only the exact current safe native ownership-transfer plan. No consent by default. |
| `-h, --help` | Print command help. |

Setup accepts no positional arguments or `--project` option. The invocation directory still affects visible project-resource conflict checks.

```bash
kepler setup
kepler setup --accept-native-transfer "$TRANSFER_DIGEST"
```

These are separate operations. Review the plan from ordinary setup before selecting the consent form.

### Inputs and prerequisites

Setup consumes a complete compatible generation with embedded executable identity, manifest, required resources, correct inventory, digests, and modes. It also requires supported Pi 1.2.0, pi-subagents 0.76.1, an existing agent directory, and initialized settings. See [Configuration](../configuration.md) for directory and executable selection.

A generic source runner without compiled identity cannot substitute for a valid generation. Missing or inconsistent resources fail. Production setup rejects a package-root runtime override.

### Result and effects

Success uses the standard JSON envelope and exit 0. The result contains:

| Field | Meaning |
| --- | --- |
| `generation_id`, `kepler_release` | Selected immutable generation and release. |
| `installation_mode` | `first-install`, `legacy-transition`, `upgrade`, `no-op`, or `repair`. |
| `resource_root`, `selector`, `package_source` | Verified generation resource root and stable selection paths. |
| `compatibility` | Compatible-resource check result. |
| `templates`, `guidelines` | Selected resource paths. |
| `created_files`, `updated_files` | Reported file effects. A coherent no-op has no updated files. |
| `pi_binding` | Host/loader version checks and matching registration/settings digests. |
| `native_transfer` | Optional accepted digest, prior source, and operation. |

Setup can stage immutable generation files and change the selector and stable launcher. It can write its receipt and journal. It can also register or repair the exact managed Pi package entry. An accepted transfer can affect only the resources named in the unchanged plan. It preserves unrelated settings, custom files, earlier generations, and project artifacts.

It does not install host prerequisites, create missing Pi settings, start agents, copy built-ins into XDG directories, convert history, or purge old data.

### Failures

Failure exits 1 with `code`, `message`, `details`, and `recovery`. Examples include `build_identity_missing`, unsupported host/loader, invalid package resources, visible resource conflict, changed settings preimage, uncertain transaction state, or ownership mismatch.

A conflict can return a read-only transfer plan and digest. Ordinary setup does not accept that plan automatically. A stale digest fails.

Failure after an external effect does not prove rollback. `temporary_file_evidence`, when present, distinguishes residual temporary files from changes to final settings. Unknown or replacement ownership is preserved and reported. Inspect the selector, receipt, settings, journal, and reported paths before retrying. See [setup recovery](../recovery.md#interrupted-installation-or-setup).

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

This distribution diagnostic is outside the registered public command tree. The installer and package checks use it to inspect the actual compiled executable. It is not a general global option or a workflow command.

```text
kepler --print-build-identity
```

Pass this flag alone. A complete compiled executable writes one raw identity JSON line and exits 0. The identity includes format/release, schema major, source, resources, and target. Extra arguments or an executable without compiled identity produce a text diagnostic and exit 1. This path does not use the normal result envelope or CLI help parser.

Do not infer identity from an archive filename or sidecar alone. Do not relabel a development executable as production after a later commit. See [Development](../development.md#resources-and-releases).

## Sources

[Setup command](../../packages/cli/src/cli/nest/setup.command.ts), [setup application](../../packages/cli/src/cli/setup.service.ts), [metadata lint](../../packages/cli/src/cli/metadata-lint.ts), [UUID allocation](../../packages/cli/src/cli/uuid.ts), and [entrypoint diagnostic](../../packages/cli/src/cli/main.ts).
