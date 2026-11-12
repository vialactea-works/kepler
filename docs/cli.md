# CLI reference

This is the complete command and JSON reference for coding agents and operators. Developers should follow the [prompt-first mission tutorial](missions/tutorial.md), while the [Standard CLI walkthrough](cli/standard-walkthrough.md) preserves a continuous mechanics exercise. These pages describe executable behavior; they do not replace the [specifications](specs/v3/README.md).

## Find a command

| Group | Public operations | Reference |
| --- | --- | --- |
| `mission` | `create`, `prepare` | [Missions](cli/mission.md) |
| `workflow construction unit` | `create`, `list`, `show` | [Construction](cli/construction.md#units) |
| `workflow construction stage` | `show`, `start`, `pause`, `resume`, `assess-retained-scopes`, `complete` | [Construction](cli/construction.md#stages) |
| `workflow construction task` | `list`, `show`, `ready`, `admit` | [Construction](cli/construction.md#tasks) |
| `workflow construction activity` | `show`, `start`, `pause`, `resume`, `complete` | [Construction](cli/construction.md#activities) |
| `workflow construction integration` | `lock`, `prepare`, `evidence`, `accept`, `release` | [Construction](cli/construction.md#integration) |
| `workflow construction` | `lint`, `revise` | [Construction](cli/construction.md#lint-and-revision) |
| `audit record` | `evidence`, `approval`, `interaction` | [Audit](cli/audit.md#record-facts) |
| `audit` | `list`, `show` | [Audit](cli/audit.md#query-history) |
| `git` | `author`, `diff-package validation`, `diff-package integration`, `diff-package unit-review` | [Git material](cli/git.md) |
| `workbench` | `isolate`, `diff`, `context`, `precondition`, `prototype`, `lint`, `task-state` | [Earlier workbench](cli/workbench.md) |
| Root utilities | `setup`, `uuid`, `lint` | [Utilities](cli/utilities.md) |

There are 46 registered leaf commands. `--print-build-identity` is a separate entrypoint operation. No `mission run`, global `status`, `mission complete`, or task-graph authoring command is registered.

## Syntax and help

```text
kepler [options] [command]
```

| Root option | Meaning |
| --- | --- |
| `-V, --version` | Print the CLI release version and exit 0. |
| `-h, --help` | Print help and exit 0. Available on command groups and leaves. |

```bash
kepler --help
kepler mission create --help
kepler workflow construction integration evidence --help
```

Running the root without a command prints help. Running a command group without its required subcommand returns a failure. Unknown commands, unknown options, and excess positional arguments fail.

`<value>` means a required value in syntax. `[value]` means optional syntax. These angle and square brackets are notation, not literal input. Options normally use exact long names. Short aliases are listed only where the command defines them. There is no general command-abbreviation or shortcut contract.

Some Construction commands share option declarations. Their help can show flags that the selected operation rejects or ignores. See the [Construction reference](cli/construction.md) for each operation's accepted flags.

## Project and identifiers

For the v3 commands, optional `--project <path>` defaults to the invocation directory. Select the Git working-tree root, not a nested directory or bare repository. It must contain an existing local `.kepler/` directory. Project selection does not initialize or migrate that directory.

Use an exact Unit of Work ID. Mission, task, stage-attempt, Activity-attempt, graph, event, and evidence identities are distinct. UUID selectors use full lowercase UUIDv4 values. Kepler does not select an implicit current unit or active attempt.

Most explicit selectors reject duplicate occurrences. `unit create --stage-effort <stage=level>` can repeat for distinct stages. Do not infer the same repetition rule for other flags.

The earlier workbench uses a different context and argument model. See [Workbench](cli/workbench.md).

## JSON input

Mission and most Construction mutations accept one JSON value through `--request`. Task admission uses `--prerequisites`. Activity completion uses `--evidence`. Audit recording and Construction revision read one JSON object from stdin.

```bash
kepler mission create --project "$PROJECT" --request "$(cat mission-request.json)"
kepler audit record evidence --project "$PROJECT" --unit "$UNIT" \
  --stage functional-design --attempt "$ATTEMPT" < evidence.json
```

The filenames in these examples are caller-owned inputs. Kepler does not create them. JSON options do not accept a filename in place of JSON. There is no `--request-file` option.

Use strict JSON. Typed validators reject unsupported fields, duplicate selectors, and invalid identity formats. Some parsers also reject duplicate JSON object keys. The [stage assessment reference](cli/stage-assessments.md) describes completion inputs. The [operator walkthrough](cli/standard-walkthrough.md) supplies complete request construction.

## Output and exit behavior

Normal operations write one JSON line to stdout:

```json
{"status":"success","data":{"uuid":"11111111-1111-4111-8111-111111111111"}}
```

The UUID above illustrates the shape. Each actual `uuid` call allocates a new UUIDv4.

Failures normally use the same stdout transport:

```json
{"status":"failed","data":{"code":"required_selector_missing","message":"...","details":{},"recovery":"..."}}
```

| Result | Process exit | Interpretation |
| --- | --- | --- |
| Normal success | `0` | The selected operation succeeded. Inspect its data for workflow state. |
| Normal failure | `1` | The operation failed. Read `code`, `details`, and `recovery`. |
| Help or version | `0` | Human-readable text, not the normal JSON envelope. |
| Build identity | `0` or `1` | Raw identity JSON on success; text diagnostic on failure. See [Utilities](cli/utilities.md#kepler---print-build-identity). |

A successful state query can report blocked or unknown work. Exit 0 does not imply readiness, approval, or mission completion. The CLI normalizes the older workbench's operation results into the envelope. Its textual result is usually in `data.output`. Internal legacy exit distinctions do not create a public exit-2 result through this reporter.

Stderr can contain a separate diagnostic. Do not assume failure JSON appears on stderr. Capture stdout, stderr, and exit status separately when automating.

## Interaction and logging

The registered commands do not provide a general interactive questionnaire, verbosity flag, log-level option, or output-format selector. Supply required decisions and typed requests explicitly. Skills or a host can conduct a dialogue before the command runs.

The CLI does not infer approval from silence or a successful check. It does not run models or dispatch workers. A process timeout does not prove that an operation had no effect.

Some operations append journals or create local ownership and recovery files. These are operation effects, not a configurable global CLI log stream. See [State and artifacts](missions/state-and-artifacts.md).

## Configuration and side effects

See [Configuration](configuration.md) for exact environment variables and path rules. The CLI has no general configuration-file precedence or project settings override that applies to every command.

Queries are read-only within their documented scope. Mutations can write history, artifacts, local coordination files, Git refs, or the `KEPLER_HOME` resource files during setup. Host resource installation and settings remain external. Each reference lists the relevant effects. A failed response can follow a partial effect. Use [Recovery](recovery.md) before retrying uncertain work.

## Maintenance sources

The public tree starts in [`root.command.ts`](../packages/cli/src/cli/nest/root.command.ts). Definitions are in [`cli/nest/`](../packages/cli/src/cli/nest/). Request validators and application operations determine semantic requirements. [`result-reporter.ts`](../packages/cli/src/cli/nest/result-reporter.ts) defines normal output and exits.

Validate command coverage with actual help output. Help alone does not describe JSON payloads, state guards, or partial effects. No dedicated CLI-reference generator is registered in the repository scripts.
