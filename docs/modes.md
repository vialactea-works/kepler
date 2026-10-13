# Kepler mode

> **Kepler is in ALPHA.** Everything here can change without notice, and there are no
> backward-compatibility guarantees.

Kepler is a coding toolbox focused on producing high-quality code and architecture. As of 0.3.0 it
has a single mode: **Assisted** — a portable, tool-agnostic bundle of spec-driven skills that carry a
change from idea to merge, driven by you and any coding agent. The Autonomous workflow engine and
Ambient memory layer were removed; the last full-feature state is preserved on the
`archive/full-feature-pre-cleanup` branch and the `pre-cleanup-0.2.1` tag.

## Assisted — the working core

**Status: working. Start here.**

Assisted mode is a bundle of **seven core spec-driven development skills** that guide any coding
agent (Claude Code, or any agent that can load a `SKILL.md`) — or a person — through a change, one
disciplined step at a time:

```
init ──▶ [ propose ] ──▶ plan ──▶ ( code ◀──▶ code-feedback ) ──▶ review ──▶ finish-work
  0        1 optional      2          3             4                5            6
                                     repeat per task              once per change
```

Wayfinder is an optional pre-change planning stage, and `kepler-critique` is an optional
design-phase gate. Neither belongs to the seven-skill core sequence. Planning writes the declarative
`plan.md`, initializes root `progress.md` as the current task ledger, and creates each
`tasks/task-N/progress.md`. Code and code-feedback then loop per task, with verdicts in
`tasks/task-N/feedback.md`; one whole-branch review writes root `review.md`; finish-work records its
paired history in root `finish.md`.

For each task, `kepler-code` follows a red → green → refactor cycle: establish a failing test in red,
make it pass in green, then refactor while keeping the test green. The refactor phase uses
`kepler-code-feedback` as its gate; green alone does not complete a task. A `changes-requested` result
returns the same task to a fresh correction cycle, with verification before advancement. When a task has
no conventional failing test, it must record the justification and use repeatable alternative verification.

Each step is a self-contained skill that names no tool and depends on no engine internals — only on
the project's standards (`AGENTS.md`) and the shared artifacts under the project's `.kepler/`
directory. The same skill guides a human in an editor and a coding agent.

### Dependency-mode v2

New dependency-mode plans declare `execution: {version: 2, mode: dependencies}`. Each active task
has Goal, Acceptance, Depends on, Steps, Verify, and Commit; Files is optional guidance, not an
allowlist. A goal-serving unlisted edit that respects approved intent and project standards stays in
the task without re-planning. A distinct prerequisite needs a committed before-edit reservation:
at most two for the task's lifetime and at most four concrete paths in each. Retries, correction
cycles, removed records, and reverted edits neither reset nor refund that accounting. A third
reservation or work that changes dependencies, public contracts, or security authority is held for
owner-approved re-planning.

Readiness is a derived projection. A ready task is admitted through the guarded operation that retains
its original Base across retries, rebinds, and cache loss; readiness alone does not authorize edits.
Implementation `done` is not full clearance: fresh independent approved feedback is also required.
Held prerequisites hold their descendants, but independent ready work may use compatible isolated
lanes. Workers write local attempts and original commits. A coordinator serializes integration, runs
the exact Verify command after integration, and publishes root status. A Verify field contains one
executable command such as `bun --bun vitest run tests/docs && bun run build`; describe expected results
outside that field. This CLI coordination is not a distributed scheduler or a concurrency promise.

The order is Red, Green, Refactor, then Verify; corrections repeat Red, Green, Refactor, and Verify.
`done` and `blocked` are completed actor outcomes, while `interrupted` and `unavailable` are neutral
observations that require independently verified artifacts. Owner-held intent and observed worker
identity do not authenticate a signer or replace feedback. Version 1 and unversioned plans remain
serial; unsupported versions or modes fail closed. Whole-branch review waits until every active task
is fully gated.

See **[Skills reference](./skills.md)** for what each skill does and how to run it, and
**[SDD framework](./sdd-framework.md)** for the design rationale.

The code and skills live in:

- `skills/kepler-*/` — the seven pipeline skills.
- `bundle/templates/` — the artifact templates, installed to `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/` by
  `kepler setup`.
- `bundle/guidelines/` — coding guidelines, installed to `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/guidelines/` by
  `kepler setup`.
- `packages/cli/src/workbench/` — the workflow-mechanics implementation distributed through the CLI.
- a project's `.kepler/` — per-project specs and change artifacts, created by the `kepler-init`
  skill.

The distributed workbench is the supported workflow-mechanics surface. Its operations are:

- `kepler workbench isolate` — check, create, or verify an isolated workspace.
- `kepler workbench diff` — record checkpoints and package task or change diffs. Whole-change packaging requires `--target-branch refs/remotes/<remote>/<branch>` or `refs/heads/<branch>`; it never infers a default.
- `kepler workbench precondition` — evaluate finish-work gates against an explicit `--target-branch` reference.
- `kepler workbench context` — inspect change artifacts and lifecycle state.
- `kepler workbench prototype` — create, resume, or verify prototype branches.
- `kepler workbench lint` — validate one file or one change directory.

For lint, provide exactly one of `--file <file>` or `--change-dir <dir>`:

```bash
kepler workbench lint --file <file>
kepler workbench lint --change-dir <dir>
```

The file selector validates only the named regular file. The change-directory selector recursively
visits regular files within that directory and does not cross its boundary. Unrelated files are
reported as skipped; conventional artifact filenames without frontmatter produce warnings, and
malformed recognized artifacts fail closed. Lint succeeds only when no errors or warnings remain.

Upgrade the Assisted bundle only between changes. Finish an active change with the Kepler
generation that created it, update the CLI and the agent-loaded skills together from one release,
run `kepler setup`, verify `kepler workbench --help`, and then start the next change. Setup does
not delete stale helper files from an older generation. `bun run purge` removes the local CLI
symlink and `~/.kepler-dist/`, but preserves Kepler's global data. See [Upgrading to the split
workflow](./sdd-framework.md#upgrading-to-the-split-workflow) for the exact checks. Never replace
one part of the installed generation while a change is active.
