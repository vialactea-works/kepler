---
name: kepler-plan
description: "Turn a change into plan.md — an ordered ledger of small, TDD-sized, independently verifiable implementation tasks. Use after propose/design, or directly from a change request when no formal spec is needed."
---

# Planning a change

Turn a change request or approved design and requirements into `plan.md`: an ordered ledger of small, independently verifiable tasks. Each coder (human or agent) implements one assigned task at a time.

Kepler's **seven-stage core pipeline** is init → propose → plan → code → code-feedback → review → finish-work. A person or agent can run each skill. Planning is **step 2**. Wayfinder and `kepler-critique` are optional, outside the core sequence.

`plan.md` is the required handoff contract between planning and coding. Finalizing it also initializes the root task ledger and task-local evidence files. **This skill writes planning artifacts, never production code.**

## Inputs

- A change directory at `.kepler/changes/<YYYY-MM-DD-title>/`. Create it if missing — `plan.md` always lives inside one, even when the pipeline starts at this step.
- Rich path: `design.md` and `requirements/` already exist — plan from them.
- Minimal path: only a user request that preserves domain, subdomain and bounded-context contracts. Capture the why/what in the plan's Overview. Changes to those contracts require `kepler-propose` before planning.
- Project standards: `AGENTS.md`, for targeted test commands, diagnostic tooling, project structure, code style, and boundaries. Read it — do not guess conventions.
- The project's canonical specs (`.kepler/specs/`): the current requirements for each capability. Read affected specs to preserve established behavior and prior decisions. On the minimal path, no per-change `requirements/` exists, so canonical specs supply that context.
- Relevant project decision history, when the harness provides a memory search. Search only for decisions and failure modes relevant to this change; memory is optional context, never approval or lifecycle evidence.

## References

Use the Read tool to open references relative to this `SKILL.md`. They live in this skill's `references/` folder, not in the global Kepler data or templates directories.

- `references/code-quality.md` — the self-review rubric for plan quality.

## Plan format

Write and edit only plans declaring `execution: {version: 2, mode: dependencies}`. This is the planning format, not an optional execution mode. Re-planning and scaffold recovery apply only to version 2 plans.

Read version 1 plans (`execution: {version: 1, order: [...]}`) and unversioned serial plans only as historical context. Interpret their task order and Files/Steps under their recorded contract; do not edit, migrate, recover their scaffolds or dispatch work from them through this skill. If asked to revise one, preserve it and ask the requester how to establish a separate version 2 plan without changing existing ownership or history.

## Principles

### Task contract

Each task is governed by Goal, Acceptance, Depends on, Steps, Verify, and Commit. Files is optional guidance, not an allowlist. The Goal, Acceptance, approved intent, cited design and requirements, and project standards bind implementation. A coder may edit goal-serving unlisted paths when needed to satisfy those constraints; unrelated edits and changes to public APIs, security policy, dependencies, or approved intent remain out of scope. Bind implementation to task-local context and intent, not an inferred file whitelist.

Steps allow worker judgment within binding intent, design and standards. Use related checks and TDD cycles as needed, with each cycle ordered Red → Green → Refactor and Verify after Refactor. This latitude does not authorize changes to the goal, approval or architectural boundaries.

- **Plan-first, read-only.** Explore the code you will touch before writing the plan. Understand existing patterns and how tests run. Make no edits in this step.
- **TDD-sized tasks.** Each task is small enough to implement and verify in isolation — about one Red → Green → Refactor loop. "Build authentication" is too big; "add a registration endpoint that validates email format" is right.
- **One task at a time.** The coder consumes a single task and nothing else, so each task must be self-contained: its files, acceptance, and verification stand alone.
- **Task-specific execution contract.** Use the bounded-judgment contract above. Specify the complete Red → Green → Refactor sequence, or a justified alternative Red when a conventional failing check is impossible. The coder cannot omit phases or treat Green as completion.
- **Reference, don't copy.** Point to `design.md` / `requirements/`; do not duplicate them.
- **Honor the canonical specs.** Before decomposing the change, read the affected `.kepler/specs/` entries. Follow their conventions and decisions or raise the conflict with the requester; do not silently plan contradictory behavior.
- **Plan for quality.** Carry the design's constraints and project standards into independently testable tasks while preserving bounded worker judgment. Code snippets must follow those constraints. Apply `references/code-quality.md` from this skill's references directory, proportional to the change's size.
- **Detail scales to risk.** Include code or exact commands where they remove ambiguity. Otherwise state intent and leave implementation judgment to the coder. Do not pre-write the diff.
- **Write flowing prose.** Keep each paragraph in `plan.md` on one continuous line, including overviews, task descriptions and acceptance criteria. Break lines only between paragraphs, list items or headings. Preserve code and command formatting; let the reader's editor wrap prose.

## TDD task contract

Plan each ordinary behavior-changing task as a complete Red → Green → Refactor cycle before its final Verify command. A task may need several related checks or cycles, but split independent behaviors into separate tasks. Write the phase actions in each task's Steps so a coder who reads only that block can execute them in order:

- **Red:** Write or update a failing behavioral check and run it before production edits. Name the command and intended failure; an already-passing check or broken harness does not establish Red. If a conventional failing check is technically impossible, explain why and specify a repeatable alternative that distinguishes pre-change and post-change behavior. Run and record that alternative before production edits. Preference alone does not justify an exception.
- **Green:** Make the smallest passing implementation and rerun the same check (or documented alternative) until it passes for the intended reason. Green is not task completion.
- **Refactor:** Specify behavior-preserving cleanup and rerun relevant tests after Green. If no cleanup is needed, inspect for opportunities, record that decision, and still rerun the relevant behavioral and regression checks; do not invent a cosmetic edit to satisfy the phase.

After Refactor, run Verify: tests related to changed files and affected behavior, followed by fresh LSP diagnostics for changed files and affected dependents. Record commands, diagnostic scope and observed results. An empty or stale diagnostic cache does not prove the absence of errors. Report unavailable LSP coverage rather than claiming a clean result. Defer full-suite tests and full builds to later workflow stages; exclude them from task Verify.

Record each phase's exact commands and observed results in task-local progress, including the technical reason and observations for an alternative Red. If a phase fails for the wrong reason, Verify fails, or feedback is `changes-requested`, record the correction and repeat Red → Green → Refactor with relevant verification in the same task. If the correction exceeds Goal, Acceptance, approved intent, design or project standards, block for re-plan. Files remains optional guidance, not an allowlist.

Do not invoke feedback in task Steps during implementation: `kepler-code` owns the task attempt and commit, and the driver dispatches `kepler-code-feedback` as the refactor-phase review afterward. A fresh durable `approved` pass is required before dependent tasks or whole-branch review; independent ready tasks may proceed in compatible isolated lanes. `changes-requested` feedback returns the same task for a correction cycle with verification and another feedback pass. This handoff belongs to the driver, not the coder's Steps.

## Process

1. **Detect map-aware mode and preserve existing bindings.** If the request points at a `.kepler/maps/<effort>/` folder containing `route.md`, resolve the canonical route under this project, require its file-scoped lint and route/body identity checks to pass, and read its synthesized body as the semantic handoff. Map-level `open`, `cleared`, `shipping`, or `shipped` status cannot replace this compiled route. Before selecting a unit, resolve any existing change's `proposal.md` and `plan.md` bindings through `kepler workbench context`. A nonzero route-conflict result stops. If `plan.md` exists, its `route_unit` owns the selection; any non-null proposal reference must match it, including when the plan reference is null. If no plan exists and the proposal has a non-null `route_unit`, preserve that proposal-bound unit while creating the plan. For an existing binding, resume that exact unit for its owning change; never replace it with another pending unit because the bound unit is already in progress or a later unit is pending. If the bound unit, owner, or claim cannot be verified, stop for owner adjudication. Only a new, unbound change selects the first `pending` unit in frontmatter order and derives its title from that unit's `name`. If that first pending unit is blocked, report the exact prerequisite and stop rather than selecting a later unit; a later-unit choice needs explicit owner authorization. If there is no pending unit, resume only an existing in-progress unit demonstrably owned by this change; otherwise stop without changing unit state. In every case, verify each selected unit dependency is `shipped` **and** reachable from the actual delivery base; if finished but unmerged, stop and ask the owner to merge it or deliberately branch from its work.
2. **Resolve visible claims and source role before writes.** The designated user/controller serializes route-unit claims and delivery, with one owner per unit and one writer per change/worktree. Before creating/suffixing a workspace or changing a route unit, scan known change proposals/plans, local and visible remote branches, and `git worktree list --porcelain` for the canonical route/unit reference. Prefer resuming the existing owner's change. A competing or ambiguous claim requires owner-directed resumption or transfer; otherwise stop. Do not evade the claim with a suffix. Transfer or release requires explicit owner authorization, inspection of partial work and Git/provider effects, preservation of history/work, and dependency revalidation. Retain shared, dirty, or ambiguously owned workspaces. A local scan is not distributed exclusivity; concurrent cross-clone claims/shipping are unsupported. Do not add a claim database, distributed lock, or coordination service.

   Resolve the actual delivery target from route Shipping rules and the map's `branch:` (or the project's explicit target rules for a non-route change). `isolate --check` reports workspace shape only. Require a named source branch from `git symbolic-ref --quiet --short HEAD` and verify normalized source/target branch identity through refs and configured local/remote mapping, never tip SHAs. A detached linked worktree, non-default checkout, or `isolated: yes` is insufficient. If the source is the target or identities are unresolved, stop for owner-directed creation/switching and verify again before any plan, route, or code write.
3. **Ensure an isolated workspace and verify your location.** Run `kepler workbench isolate --check`; its last line is only the workspace-shape result. Once claim and target-role checks pass, `isolated: yes` permits use of that workspace; it does not grant route or change ownership. `isolated: no` means derive a kebab-case title from the change (its existing directory name, selected unit name, or the request on the minimal path) and create one:

   ```bash
   kepler workbench isolate <title>   # last line: the new worktree's path
   cd <that path>
   kepler workbench isolate --verify <title>
   ```

   If create mode reports that `.worktrees/<title>` or branch `<title>` already exists, inspect its owner and partial state. Resume only with that owner's authorization; never use a suffix to bypass a visible claim. If the Kepler CLI is not installed (`kepler setup` has not run), create or verify a named source branch only after the same ownership and target checks; workspace shape can be inspected by hand if `git rev-parse --git-dir` differs from `--git-common-dir` (a linked worktree, and you are not in a submodule) or `git rev-parse --abbrev-ref HEAD` is not the default branch; otherwise `git worktree add .worktrees/<title> -b <title>` under the git-ignored `.worktrees/` directory, `cd` in, and confirm `git rev-parse --show-toplevel` ends in `.worktrees/<title>`.

   `git worktree add` creates the worktree but leaves the shell and file tools in the original checkout. Change into the new worktree and verify that the shell and file tools target it before proceeding. **Do not proceed to step 4 until `--verify` succeeds.**

   From here on, resolve paths against the worktree root. Explore code there and create the change directory and `plan.md` inside `.worktrees/<title>/`, not the original checkout. Use the absolute path from `git rev-parse --show-toplevel` when needed.

4. **Locate the change.** Find or create `.kepler/changes/<YYYY-MM-DD-title>/`.
5. **Gather context.** If a plan exists, read its execution metadata first. Apply the read-only legacy note under **Plan format** before any re-plan, recovery or scaffold write. When an existing version 2 plan is missing root progress or any initialized task log, run read-only `kepler workbench context <change-dir>` before the normal existing-artifact lint gate. Continue only if it reports `scaffold-recovery: eligible`; inspect the original proof and every present file before writing. If the result is blocked, absent, malformed or ambiguous, stop for owner evidence and preserve all files. Follow **Initial scaffold recovery**.

   For a complete change directory, run normal scoped lint before interpreting its plan. When the change directory already holds artifacts — the rich path, or a re-plan — open with `kepler workbench context <change-dir>` to see which exist, how large they are, and where the tasks and reviews stand, then read in full only what it says is there. (If the Kepler CLI is not installed, list the directory instead.) On the minimal path, where the directory is new and empty, read the inputs directly.

   Read upstream artifacts if present (proposal, design, requirements), the canonical specs (`.kepler/specs/`) for the capabilities the change touches, and the project standards (commands, structure, style, boundaries). In map-aware mode, read the synthesized route body as the primary current context: Destination, Path chosen, Shipping rules, and the selected unit's body, including its destination contribution, goal, observable completion outcome, and binding constraints. Treat the destination and those binding constraints as committed context while leaving implementation decomposition to this planning step. Resolve implementation choices here only when they remain local and preserve the destination. If the route cannot be satisfied, return to Wayfinder. If a `route_unit` field is present in frontmatter, preserve it as the route path plus unit number and use it to follow the selected unit's `backed_by` tickets for optional drill-down only. Use the route's synthesized destination; do not reconstruct it from ticket Answers.

   In map-aware mode, preserve the selected route path and unit number in `route_unit`; it is the provenance link finish-work uses to update the unit. Resolve proposal/plan bindings through `kepler workbench context` and stop on a nonzero route-conflict result. The plan owns the selected binding; any non-null proposal reference must agree, including when the plan reference is null. A null proposal reference may accompany a valid planned binding. Preserve matching legacy references, but never mix a modern null with a legacy body guess. Record the route-source revision reported by context as the selection input, plus owner/change, named source branch, actual target, and base/input revision in the existing Overview and dispatch handoff. The route metadata is machine-readable frontmatter; the specs carry the conventions and decisions already committed for those capabilities — follow them so the plan stays consistent. On the minimal path, where no per-change `requirements/` exists, the specs are your primary source of existing behavior; summarize the why/what in two sentences in the Overview.

   Before decomposing, compare the requested behavior with the canonical specs and established domain, subdomain and bounded-context contracts. If it changes those contracts, go through `kepler-propose`'s main flow for approved proposal, requirements and design before continuing. Pass the existing change directory, affected capabilities, requested behavior and any route/source-revision binding; preserve ownership and history. Record a `Spec impact` decision in the plan `Overview`: either the approved `requirements/<capability>.md` deltas, or `no canonical behavior change` with its rationale. Internal implementation changes that preserve those contracts may stay on the minimal path; do not label changed behavior internal. If classification is unresolved, stop and ask the requester before finalizing the plan.

   If `plan.md` exists and all initialized root/task paths are present, run `kepler workbench lint --change-dir <change-dir>` before interpreting it or its linked artifacts. For a missing initial path, use only the read-only `scaffold-recovery: eligible` result described above, then run scoped lint after the complete recovered scaffold exists. Use lint's exit status to judge existing artifact format and schema. Do not reject a lint-valid artifact because it differs from the skill's layout or template. On nonzero lint, report the findings without mutating artifacts. Require the existing root ledger and task logs needed for re-planning as inputs; name missing evidence separately, since lint does not check absent files. A change without `plan.md` is pre-plan, not legacy.

   For an existing plan, require every present formal proposal/design/requirements input to have `status: approved`, `decision: accepted`, an exact `intent_approvals` entry with its owner-held reference and full commit ID, and current bytes matching that committed revision. On first planning, verify each input is explicitly approved and committed, obtain its requester-held reference from the approved handoff, and record the path/reference/full commit in the new plan. A lint-valid draft, template default, plan status, or `decision: accepted` alone does not authorize formal intent. If approval is missing or stale, return to `kepler-propose`'s main flow. Never approve formal intent during planning. Formal artifacts may be absent only for tactical changes that preserve domain, subdomain and bounded-context contracts. Authorized unattended planning may self-review the breakdown and record assumptions but cannot manufacture formal approval.
6. **Explore (read-only).** Map the files and modules involved, the patterns to follow, and the test setup. Make no edits. Test each recalled decision against current source, approved intent and standards. Carry only applicable constraints into the exact task that needs them; record stale or conflicting advice as rejected context with its current-source reason. Do not add abstractions for an inapplicable rubric principle.
7. **Decompose and build the task graph.** Break the work into TDD-sized tasks along the design's boundaries. Each task should deliver one cohesive, independently verifiable result. Before specifying the tasks:

   - Identify each task's outputs and the results it needs from other tasks to implement or verify its Goal and Acceptance.
   - Add a dependency only when a task needs another task's completed result. In the dependent task's Goal, name that result and explain why it must exist first.
   - Use `Depends on: none` for independent tasks; otherwise list `Task N` IDs separated by comma-space. These declarations are the graph's single source of truth. Do not duplicate the graph in frontmatter or infer dependencies from task numbers.
   - Record shared-file and shared-resource conflicts in the affected tasks' Steps as coordination constraints for admission. A conflict creates a dependency only when one task needs the other's result.
   - Check for missing prerequisites, self-dependencies, cycles and unnecessary edges. Do not chain independent tasks for convenience. Omit edges that merely repeat transitive ordering; retain direct dependencies on results the task consumes. Resolve cycles by revising task boundaries or extracting a shared prerequisite, not by inventing an order.

   Dependencies determine readiness; the coordinator admits compatible ready tasks into isolated lanes. Put each task's applicable quality constraints, verified decisions and sources in its own block, not just Overview. If relevant memory is unavailable, say so and use repository context. Each coder must understand the task's required inputs without reading sibling task details.
8. **Specify each task.** Capture Goal, Acceptance, Depends on, Steps, Verify and Commit; Files may be omitted or supplied as optional guidance. Make Acceptance testable, cite requirement scenarios when available, and cover errors and edge cases. Order Steps as Red → Green → Refactor (or a technically justified alternative Red), followed by targeted tests and fresh LSP diagnostics with explicit expected results. In Red, run the check and observe the intended failure before production edits; in Green, rerun that check; in Refactor, rerun relevant tests after cleanup. Include the correction rule from **TDD task contract** in each task block, since the coder reads no sibling block or plan-wide instructions. Code snippets illustrate design and standards under bounded judgment; model the clean shape from `references/code-quality.md`.
9. **Confirm or auto-reflect.** If working with a person, present the task breakdown and confirm it before finalizing. If running unattended with explicit authority to plan, self-review against the checklist below and record assumptions inline in the plan. This approval covers only the breakdown; it never creates approval for formal proposal/design/requirements inputs.
10. **Write `plan.md` and initialize execution progress.** Instantiate the installed `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/plan.md`, `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/progress.md`, and `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/task-progress.md` templates. Fill their placeholders and remove opening instruction blocks and inline hints before writing.

   For a new plan, read the configured repository identity with `git config user.name` and `git config user.email`. If either Git value is missing or an identity is unavailable, ask the user for it and stop; do not invent or substitute an agent name, placeholder, or other identity. Populate `plan.md` frontmatter with concrete `artifact`, `change`, `status`, `created`, `author`, `decision`, and `route_unit` values, using `author: Name <email>` from both Git values and a valid lifecycle status. Set `execution: {version: 2, mode: dependencies}`.

   In map-aware mode, resolve proposal/plan binding through context before writes and stop on conflict. Record the canonical route and unit, owner/change, named source branch, actual delivery target, base/input revision, and exact selected route-source revision in the existing plan Overview.

   Before the first scaffold write, record the full current Git `HEAD` in `initialization.base`, an explicit requester authority reference, the SHA-256 `taskBreakdownDigest`, and the original task IDs. Preserve that initialization proof on every re-plan; it certifies only the initial breakdown. An unattended self-review reference authorizes the planning breakdown only and cannot approve formal proposal/design/requirements. On a re-plan, preserve the existing author exactly.

   Derive one ordered active-task list from the final plan and use that same ordered task list for all three artifacts. Root `progress.md` frontmatter must contain concrete `artifact`, `change`, `status`, `updated`, `decision`, and `tasks` values. Add one `tasks` metadata entry per active task in numeric identity order with its numeric `id`, exact unescaped `title`, `status: pending`, and `progress: tasks/task-N/progress.md`. The root Markdown table must contain exactly one row per active task from that same ordered list, with columns `Task`, `Status`, and `Progress`; the only status vocabulary is `pending`, `in-progress`, `blocked`, and `done`. Render each identity as `Task N: <escaped display title>`, initialize it to `pending`, and use the exact link `[details](tasks/task-N/progress.md)`. Apply standard Markdown table escaping to display titles, including escaping `|` and other delimiters; identity is not derived from the title. Derive the numeric identity and lowercase `task-N` directory from `Task N`, never from the title.

   Initialize each active `tasks/task-N/progress.md` from the cleaned task-progress template with concrete `artifact`, `change`, numeric `task`, `status: pending`, `updated`, and `decision` frontmatter, followed by the exact heading `# Task Progress: Task N — <title>` using the unescaped title. Its creation portion must have matching change and task identities, no attempt record (`## Attempt` or other execution-history record), and no template placeholder. Root progress remains only the current task ledger: it contains no changed paths, commands, notes, attempts, task feedback verdicts, whole-branch review summaries, or finish outcomes.

   After the complete scaffold of `plan.md`, root `progress.md`, and every active task log is written, recheck the route-source revision and owner binding. For a new route claim, change only the selected unit from `pending` to `in-progress`; resume an existing `in-progress` unit only when its owner/change/branch match, and never reset a shipped unit. Update map status only as an aggregate summary when its rule holds; contradictory state is a stop. After each route/map write, run `kepler workbench lint --file <path>`, then run `kepler workbench lint --change-dir <change-dir>`. Commit the matching route/map claim with the complete change scaffold, then rerun context and include its exact route-source revision in the handoff. Resolve every lint finding and rerun before handoff; do not invent an attempt or otherwise mutate execution history to satisfy lint.

## Task-sizing heuristics

- Implementable and testable in isolation — about one Red → Green → Refactor loop.
- Split independently changing behaviors, not the related checks needed to prove one behavior and its edge cases.
- A task whose title contains "and" is often two tasks.

## Re-plan mode

Use re-plan mode to correct a version 2 plan during execution, such as a poorly scoped task, wrong step or missing dependency. Keep version 1 and unversioned plans read-only. Run the existing-artifact lint gate in Process step 5 before editing; additional frontmatter or body content does not invalidate a lint-valid artifact. Read `plan.md` and the root `<change-dir>/progress.md` status table, summarized by `kepler workbench context <change-dir>`. Amend the plan without reading or rewriting sibling attempt histories.

- Tasks the root ledger marks `done` are frozen: do not alter their task definition, title, status row, identifier, link, directory, or task-local history.
- Renumber nothing and never reuse an abandoned task id. Stable numeric task ids and `tasks/task-N/` paths are the execution identity.
- Preserve each surviving task's actual status in both the root frontmatter `tasks` metadata entry and Markdown row, including frozen `done` tasks and existing non-done tasks. Keep their exact numeric identity, title, link, directory, and append-only history.
- Append each new active task with a new numeric id, add matching frontmatter metadata and root row in amended plan order with status `pending`, and initialize its `tasks/task-N/progress.md` heading. Give remediation tasks the same Red → Green → Refactor steps, exceptional Red rule, and feedback handoff as ordinary tasks; an evidence-only task must observe a real pre-change defect, not manufacture one.
- Before renaming, inspect the assigned `tasks/task-N/feedback.md` path. If it exists, preserve the task title, ID, path, task-progress heading and every feedback pass. Do not rewrite reviewer-owned feedback. If a new identity is needed, explicitly abandon the unfinished task with the canonical suffix and append a new max+1 ID, retaining all history. If feedback exists but is incomplete or ambiguous, stop for owner diagnosis. Only a feedback-free non-done task may use the existing synchronized rename transition; never rename a done task.
- A renamed non-done task updates its root Markdown table display title with correct Markdown escaping, while the exact unescaped title is written to its assigned root frontmatter metadata entry, active plan heading, and task-progress heading. Preserve its current status in both root representations, numeric id, exact path and link, and every existing append-only `## Attempt N` block; leave done tasks byte-for-byte unchanged. After the complete amendment, run `kepler workbench lint --change-dir <change-dir>`.
- Preserve an existing plan's `author` attribution exactly across re-plans; do not replace it with current Git values, an agent name, or a placeholder. If a new plan needs attribution and either `git config user.name` or `git config user.email` is unavailable, ask the user instead of inventing an identity.
- Mark an abandoned task with the canonical heading `### Task N: <title> (abandoned — <reason>)`. Only a heading that ends with this complete canonical form and supplies a nonempty reason is abandoned. Headings that use `(abandoned - reason)`, `(abandoned — )`, or `(abandoned — reason) trailing` do not match; retain them as active unless lint rejects the plan. Remove an exactly abandoned task's row from the active root table and retain its existing task directory and append-only history. Do not delete them or reuse the numeric id.
- Do not make a new task edit a sibling's task progress, feedback, checkpoint, root metadata entry, or status row. Each task owns its goal-bounded implementation work and its own execution evidence; optional Files guidance does not authorize edits to sibling evidence. If correcting a frozen task requires editing its owned evidence, report the ownership conflict and stop for adjudication instead of planning a task that `kepler-code` cannot execute.
- Preserve all other existing task directories and append-only evidence, and record the reason for the amendment in the plan's Overview.

Only re-plan mode may change `plan.md` after coding begins. Other skills treat it as read-only.

## Input impact and task-local decision context

At each planning handoff, capture the exact task definition and the selected relevant approved requirements/design/specs, route constraints, project standards and repository identity. Use `kepler workbench context <change-dir> --input <repository-relative-path>` for each selected input blob and record the resulting version-1 input-context JSON handoff (a separate schema from the plan's execution version) in that task's `Notes`: canonical repository identity, formal approval commit or explicit tactical authority reference, the task's SHA-256 definition digest, selected input paths and full 40-hex Git blob IDs. Record an applicable `impactPlanCommit` only when that handoff is introduced by a committed input-impact plan. These hashes identify revisions; they do not judge semantic equivalence or authorize work.

Before reusing prior tasks after a selected input changes, classify each change at the actual preceding plan revision. Record `input_impact` with prior/current blobs, affected unfinished tasks, unaffected tasks, new obligations, unresolved-intent state and a rationale. Require an independent review of the impact reasoning and preserve its owner-held reference; if no independent reviewer is available, stop before dispatch. Return unresolved formal intent to its owner. Revise affected unfinished work through planning, append new obligations under new IDs after frozen done tasks, and retain unaffected approvals and historical definitions. A completed task cannot be rewritten or reclassified as affected. Commit the impact classification first; then bind affected/new task Notes to that plan commit in a follow-up plan revision. Do not invent legacy snapshots or rerun unrelated tasks solely because an input blob changed.

Within a version 2 plan, for a historical task whose versioned input provenance is genuinely absent, keep its existing task block, Notes, IDs, attempts, feedback, and approvals frozen. Never reconstruct historical hashes. Use a scoped current confirmation only when the committed plan at that task's implementation also has no versioned input context and the task definition is unchanged. Add one optional, version-1 `legacy_input_confirmations` frontmatter record for that task, with its canonical repository path, current `taskDefinition` digest, current approved `intentCommit` (or `tactical:<ownerReference>`), selected current committed `inputs` and full Git blob IDs, `historicalInputs: "unknown"`, distinct `owner` and `reviewer` identities and references, and a concrete `rationale`. Capture each input with `kepler workbench context <change-dir> --input <repository-relative-path>`; require matching HEAD, index, and worktree bytes, and commit the confirmation in the plan authority. Context and the finish gate must report `legacy-current-confirmed` only while this exact scope remains current. These references are asserted evidence, not authentication or semantic review, and they waive no intent, task-feedback, whole-review, test, or finish gate. Missing, malformed, dirty, stale, mismatched, or unverifiable evidence stays held. If a known changed input affects a frozen task, append new obligations rather than confirming a rewritten task. Do not add this metadata to ordinary new plans.

Before code generation, put applicable quality constraints and their sources in the task block, with verified decision context or a reason it does not apply. Check relevant memories against current source and approved intent; record stale or conflicting advice as rejected context. If memory is unavailable, continue using repository-owned specs, standards and task constraints.

## Prerequisite planning

A new task dependency requires owner-approved re-planning. Pause current task writers before amending the plan. If a blocked task has partial production edits, obtain its owner's and requester's approval for a scoped preservation method and a verifiable restoration locator before dispatching another writer. Name the paths and method, verify the preserved bytes, and do not stage, commit, broadly stash or discard them. If safe preservation or restoration authority is unavailable, stop for owner intervention. Reconcile the work through its original task owner after the prerequisite clears, retaining its original Base and history.

Keep `execution: {version: 2, mode: dependencies}`. Append prerequisites under new max+1 task IDs, initialize their pending logs, and declare their `Depends on` relationships. Follow the re-plan rules for affected unfinished tasks and preserve frozen definitions, approvals, initialization and history. Keep headings, directories and root-ledger rows in numeric identity order; scheduling follows dependencies, not that physical order. Reject missing prerequisites and cycles.

When inputs also change, apply the input-impact review and commit sequence above. Run scoped lint and derive readiness again through `kepler workbench context <change-dir>` before dispatch. Revalidate any pending dispatch when its task, inputs, worker, branch or repository identity changes. The coordinator admits compatible ready tasks; descendants stay held until their prerequisites have fresh approved feedback.

## Initial scaffold recovery

Before writing a version 2 scaffold, record the original full pre-scaffold `HEAD`, authorized breakdown digest, task IDs and owner authority in the plan's initialization proof. If interruption leaves any initial root or task file missing, distinguish recovery from re-plan and code. Run read-only `kepler workbench context <change-dir>` and proceed only when `scaffold-recovery: eligible`.

Before writing, inspect that exact original revision, complete task definitions and IDs, and every present file. Inspect staged state as well as committed and working bytes. A staged scaffold, input, source or checkpoint path requires owner reconciliation; do not unstage it or overwrite it to obtain eligibility. Confirm all present state is pending and history-free, no attempt/feedback/checkpoint or task-owned work exists since the base, and no missing path has earlier execution-bearing history.

Fill only missing files from the proven original task list; preserve every present byte, author and identity. If proof or a locator is unavailable, any task has begun, or deleted history is found, stop for owner diagnosis. Never synthesize an Attempt. Run full scoped lint on the complete scaffold and commit it before code dispatch. A truly empty new plan remains invalid; all-abandoned plans follow their separate existing path.

## Self-review

Before finishing, confirm:

- You are inside the intended worktree, not the default branch: `git rev-parse --show-toplevel` ends in `.worktrees/<title>` (or you were legitimately working in place per step 3), and `plan.md` was written under that root.
- The plan declares `execution: {version: 2, mode: dependencies}`; no legacy plan or its execution evidence was modified.
- Every task is independently verifiable through tests scoped to changed files and affected behavior, plus fresh LSP diagnostics with no errors. Full-suite tests and full builds are deferred.
- Each task's Steps run Red before production edits, rerun the same check to Green, and verify behavior after Refactor. Any alternative Red has a concrete technical reason and repeatable pre-change/post-change check; none is a preference-based omission.
- Each task includes the conditional correction cycle and its own task-local phase evidence; no task Step invokes `kepler-code-feedback` or edits sibling evidence. The driver obtains fresh approval before dependent work advances.
- Steps permit bounded judgment within Goal, Acceptance, approved intent, design and standards; Files is optional guidance rather than an allowlist.
- Each acceptance criterion ties to a requirement scenario where one exists.
- Every task declares `Depends on`, using `none` for independent tasks. Each dependent task's Goal names the required results and explains its dependencies. All prerequisites exist and are active; none are missing, self-referential or cyclic.
- No edge merely follows task numbering, chains independent tasks, serializes conflicting work or repeats transitive ordering. Shared-file and shared-resource conflicts are recorded as coordination constraints.
- The task seams follow the design's boundaries; no task bundles unrelated changes, and each lands a unit that can be tested in isolation (`references/code-quality.md`, proportional to the change).
- Code snippets model the clean shape as design/standards examples under bounded judgment.
- "Done when" requires all tasks `done`, related tests passing, no LSP errors in the affected scope, fresh committed `approved` feedback for every task before dependent work advances, and an approved whole-branch review. Leave full-suite tests and full builds to later workflow stages.
- Root progress has exactly one correctly ordered row per active task, uses only `pending`, `in-progress`, `blocked`, and `done`, and every link resolves to an initialized task progress file.
- Display titles are Markdown-escaped, while numeric ids and `tasks/task-N/` paths remain stable.

**Blocking.** For a non-trivial change — one that adds or restructures units, not a mechanical or single-file edit — do not finalize `plan.md` while a task carries an unresolved structural smell (bundles unrelated changes, cannot be tested in isolation, or embeds a snippet with a shortcut the coder will copy). Re-slice the tasks, or record a deliberate exception in the plan's **Quality notes** (Overview). Coders use bounded judgment only within Goal, Acceptance, approved intent, design and standards.

## Output

`.kepler/changes/<change>/plan.md`, `<change-dir>/progress.md`, and one initialized `<change-dir>/tasks/task-N/progress.md` per active task, following the installed plan, root progress, and task-progress templates. Re-plan reconciles those artifacts without rewriting done tasks or append-only attempt history.

## Handoff

Close with the workspace, next step and decision needed.

- **Disclose the workspace.** If step 3 created a worktree, state its path (`.worktrees/<title>`) and branch. Make clear that `plan.md` and subsequent code belong there. If you worked in place, name that branch.
- **Name the next step.** `plan.md` is the handoff contract; what follows is `kepler-code` (one task at a time) or `kepler-orchestrate` (the whole plan in one session).
- **Hand back the decision.** When attended, ask whether to proceed to implementation. Never invoke the next skill yourself. When unattended, name the next step and return; the driver controls execution.

## Process flow

```dot
digraph kepler_plan {
    "Resolve existing route binding\n(or select first pending for an unbound change)" [shape=box];
    "Ensure isolated workspace\n(worktree if on default branch)" [shape=box];
    "Locate / create change dir\n(no route mutation before ownership/binding checks)" [shape=box];
    "Gather context\n(upstream artifacts + canonical specs + standards)" [shape=box];
    "Explore code (read-only)" [shape=box];
    "Decompose into TDD-sized tasks\n(build dependency graph)" [shape=box];
    "Specify each task\n(files, acceptance, steps, verify, commit)" [shape=box];
    "Interactive?" [shape=diamond];
    "Confirm breakdown with user" [shape=box];
    "Auto-reflect + record assumptions" [shape=box];
    "Write plan.md + initialize task ledger + self-review\n(claim unit when eligible; commit scaffold)" [shape=doublecircle];

    "Resolve existing route binding\n(or select first pending for an unbound change)" -> "Ensure isolated workspace\n(worktree if on default branch)";
    "Ensure isolated workspace\n(worktree if on default branch)" -> "Locate / create change dir\n(no route mutation before ownership/binding checks)";
    "Locate / create change dir\n(no route mutation before ownership/binding checks)" -> "Gather context\n(upstream artifacts + canonical specs + standards)";
    "Gather context\n(upstream artifacts + canonical specs + standards)" -> "Explore code (read-only)";
    "Explore code (read-only)" -> "Decompose into TDD-sized tasks\n(build dependency graph)";
    "Decompose into TDD-sized tasks\n(build dependency graph)" -> "Specify each task\n(files, acceptance, steps, verify, commit)";
    "Specify each task\n(files, acceptance, steps, verify, commit)" -> "Interactive?";
    "Interactive?" -> "Confirm breakdown with user" [label="yes"];
    "Interactive?" -> "Auto-reflect + record assumptions" [label="no"];
    "Confirm breakdown with user" -> "Write plan.md + initialize task ledger + self-review";
    "Auto-reflect + record assumptions" -> "Write plan.md + initialize task ledger + self-review";
}
```

## Readiness and scope reservations

Derive readiness with `kepler workbench context <change-dir>`; its verified ready, fullyGated or held projection informs coordinator admission but does not authorize scheduling on its own.

A new prerequisite needs an immutable task-local `scope_expansions` reservation before production edits: at most two lifetime reservations and at most four concrete implementation, test or documentation paths each. It records id, attempt, prerequisite, necessity, evidence, paths and verify. Retries, abandonment and corrections do not refund it. A third reservation, more paths, new dependency, public contract or security-policy change is blocked for owner-approved re-planning.
