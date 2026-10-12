# SDD artifact templates

Every generated artifact begins with one YAML frontmatter block. Scalar identity,
lifecycle, provenance, and review metadata belong in frontmatter; Markdown headings,
prose, lists, tables, and append-only findings remain in the body. Repeated records,
such as plan tasks and route units, remain body collections unless the record carries
independent state; those records use a nested frontmatter list or a dedicated file.

When authoring a new artifact, keep frontmatter as the machine-readable metadata source; avoid
duplicating its fields as `Key: value` body lines or metadata table rows. These templates guide
new writing. For an existing artifact, `kepler workbench lint` alone determines format and
schema validity; a lint-valid file is not invalid because its presentation differs from a
template.

Templates for the seven-stage spec-driven pipeline. Each maps to a well-known standard,
taken in spirit (right-sized), not by conformance.

| Template | Document | Owns | Instance path | Produced or updated by |
| --- | --- | --- | --- | --- |
| `glossary.md` | Canonical glossary | Context-scoped language | `.kepler/specs/glossary.md` | kepler-init / domain modeling / Wayfinder closing act |
| `proposal.md` | PRD | Why, domain scope and boundary impact | `<change>/proposal.md` | kepler-propose |
| `requirements-change.md` | SRS (delta) | What | `<change>/requirements/<capability>.md` | kepler-propose |
| `requirements-spec.md` | SRS (canonical) | What | `.kepler/specs/<capability>.md` | kepler-finish-work |
| `design.md` | SDD | How | `<change>/design.md` | kepler-propose |
| `plan.md` | Plan | Steps | `<change>/plan.md` | kepler-plan |
| `progress.md` | Task index | Current task status | `<change>/progress.md` | kepler-plan (initialize) / kepler-code (update assigned row) |
| `task-progress.md` | Task Progress | Task execution history | `<change>/tasks/task-N/progress.md` | kepler-plan (initialize) / kepler-code (append attempts) |
| `feedback.md` | Code Feedback | Task feedback | `<change>/tasks/task-N/feedback.md` | kepler-code-feedback |
| `review.md` | Whole-branch Review | Whole-branch verdict | `<change>/review.md` | kepler-review |
| `finish.md` | Finish History | Finish attempts and outcomes | `<change>/finish.md` | kepler-finish-work |

The two SRS forms are the same content in two states: `requirements-change.md` is the
delta a change proposes; `requirements-spec.md` is the consolidated truth it folds into.

`glossary.md` reuses requirements-spec metadata and the five canonical sections for lint compatibility, with vocabulary entries under Contract. It is language support, not an automatic application capability. Preserve an existing glossary rather than regenerating it from the new template.

New full-path proposals add Domain Context (scoped language and involved subdomains/contexts) and Affected Boundaries under Impact. Capability entries identify their domain, subdomain or bounded-context scope, including infrastructure responsibilities with a durable contract. Scope remains prose; slugs and delta-to-spec mappings stay unchanged. These authoring rules do not retroactively invalidate historical lint-valid proposals or require a proposal on the tactical path.

## Required vs optional

`plan.md` is the only required declarative input to execution. `proposal.md`, `design.md`, and
`requirements/` are optional: small or mechanical changes may start directly at kepler-plan.

Kepler-plan also creates the required operational scaffold: root `progress.md` and one linked
`tasks/task-N/progress.md` file for every active task. Later stages consume that plan and operational
state; only planning works directly from a raw request when richer upstream artifacts are absent.

## Wayfinder templates

These templates support wayfinding—the optional pre-change stage that clarifies a change's
shape before committing to the SDD loop. They are not SDD pipeline artifacts.

| Template | Artifact | Produced by |
| --- | --- | --- |
| `wayfinder/map.md` | Map | kepler-wayfinder |
| `wayfinder/ticket.md` | Decision ticket | kepler-wayfinder |
| `wayfinder/route.md` | Route | kepler-wayfinder |

The artifacts these templates produce live under `.kepler/maps/<effort>/`: `map.md` and
`route.md` at the root, and decision tickets at `tickets/NN-slug.md`. A route is Wayfinder's
compiled destination-and-path handoff, not a static unit list. Its stable synthesized body has
five sections — Point of departure, Destination, Path chosen, Shipping rules, and Units — while
frontmatter owns route status and each unit's identity, lifecycle status, dependencies, and
backing tickets. Downstream processes update that mutable metadata without rewriting the body;
Wayfinder clears fog, propose and plan create implementation artifacts, and code and finish-work
build and ship them. Unlike `specs/` and `changes/`, the `.kepler/maps/` directory is not
scaffolded by `kepler-init`; the wayfinder skill creates it on first use.

## Where these templates live

These templates are global, not per-project. They are bundled here in `bundle/templates/`
and copied to `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/` by the `kepler setup` command. The pipeline steps
read the installed copy at `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/<name>.md`.

## Where the artifacts they produce live

Per-project, under the project's `.kepler/` directory (created by `kepler-init`):

```text
.kepler/
  specs/
    glossary.md
    <capability>.md
  changes/
    <YYYY-MM-DD-change-title>/
      proposal.md
      design.md
      requirements/
        <capability>.md
      plan.md
      progress.md
      tasks/
        task-N/
          progress.md
          feedback.md
      review.md
      finish.md
```

`plan.md` is the declarative task contract authored up front. Kepler-plan initializes the root
`progress.md` current-task ledger and each linked task progress file from the installed templates.
Kepler-code updates only its assigned root row and appends implementation attempts to that task's
progress file. Task feedback is kept alongside task progress, while `review.md` and `finish.md`
remain change-level artifacts.

`requirements/*.md` inside a change use delta headers (ADDED / MODIFIED / REMOVED /
RENAMED). `kepler-finish-work` folds those deltas into the canonical
`.kepler/specs/<capability>.md`, which holds no delta markers.
