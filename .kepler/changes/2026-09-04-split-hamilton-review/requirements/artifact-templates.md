# Capability: artifact-templates

Every artifact shape Hamilton produces is defined once in the bundled templates tree and installed under `~/.hamilton/templates/`; this change separates current task status, task execution history, task feedback, whole-branch review, and finish history into shapes with unambiguous owners.

## ADDED Requirements

### Requirement: Task execution details have an installed template and nested instance path

The bundled templates tree SHALL contain `task-progress.md`, and `hamilton setup` SHALL install it as `~/.hamilton/templates/task-progress.md` and report the relative name `task-progress.md`. `hamilton-plan` SHALL initialize each instance at `.hamilton/changes/<change>/tasks/task-N/progress.md`, where `task-N` is the lowercase hyphenated encoding of the exact plan identifier `Task N`. The artifact SHALL identify that task in a `# Task Progress: Task N — <title>` heading and provide append-only dated implementation attempts headed exactly `## Attempt N — <date>`, where `N` starts at 1 and increases by one in physical order. Each attempt SHALL carry a `done` or `blocked` outcome, changed paths, verification evidence, and notes. No task-titled or otherwise alternate attempt heading SHALL be part of the accepted shape.

- Priority: must
- Rationale: task-local execution evidence needs a different shape from the root current-state index even though both instances are named `progress.md` in their owning directories.

#### Scenario: Setup installs the task progress shape

- WHEN the bundle contains `bundle/templates/task-progress.md` and `hamilton setup` completes
- THEN `~/.hamilton/templates/task-progress.md` matches the bundled content and the setup result includes `task-progress.md`

#### Scenario: Planning initializes Task 12

- WHEN `hamilton-plan` finalizes `Task 12`
- THEN it creates `.hamilton/changes/<change>/tasks/task-12/progress.md` from the installed task-progress shape

#### Scenario: A task receives another implementation attempt

- WHEN a later code attempt completes for the same task
- THEN the new dated attempt is appended to that task's existing `progress.md` and earlier attempts remain unchanged

#### Scenario: A task progress file uses an alternate attempt heading

- WHEN an attempt is headed with `## Task N: <title> — <date>` or any form other than canonical `## Attempt N — <date>`
- THEN split-layout consumers treat the task progress file as malformed rather than interpreting the alternate form

#### Approved bootstrap disposition for this change

The Task 1 and Task 4 progress files already present under `.hamilton/changes/2026-09-04-split-hamilton-review/` predate this exact syntax. Remediation for this change MAY replace only their pre-contract attempt headings with canonical, contiguously numbered `## Attempt N — <date>` headings in physical order and SHALL preserve each date, evidence body, and attempt order. The normalization SHALL land in a new remediation commit and SHALL NOT rewrite existing commits. This permission applies only to those two live artifacts and adds no accepted legacy syntax for any producer, parser, fixture, or other change.

### Requirement: Task feedback has its own installed template and nested instance path

The bundled templates tree SHALL contain `feedback.md`, and `hamilton setup` SHALL install it as `~/.hamilton/templates/feedback.md` and report the relative name `feedback.md`. `hamilton-code-feedback` SHALL create each instance at `.hamilton/changes/<change>/tasks/task-N/feedback.md`, using the same exact task-directory mapping as task progress. The artifact SHALL identify that task in a `# Code Feedback: Task N — <title>` heading, retain append-only dated passes, record the exact full commit identifiers on `Base:` and `Head:` lines in each pass, express the verdict on a `Verdict:` line as `approved` or `changes-requested`, and separate Blocking findings from Suggestions.

- Priority: must
- Rationale: a dedicated shape and task-owned location remove scope inference from a mixed change-level file while preserving Hamilton's directory-as-manifest installation model.

#### Scenario: Setup installs the feedback shape

- WHEN the bundle contains `bundle/templates/feedback.md` and `hamilton setup` completes
- THEN `~/.hamilton/templates/feedback.md` matches the bundled content and the setup result includes `feedback.md`

#### Scenario: Task 12 receives its first feedback pass

- WHEN `hamilton-code-feedback` reviews `Task 12` for a change
- THEN it creates or appends `.hamilton/changes/<change>/tasks/task-12/feedback.md` from the installed feedback shape

#### Scenario: A task is re-reviewed

- WHEN a later feedback pass is recorded for the same plan task
- THEN the new dated pass is appended to that task's existing `feedback.md` and earlier passes remain unchanged

#### Scenario: A feedback pass identifies its code revision

- WHEN code feedback records a pass for a task diff
- THEN the pass includes the full base and head commit identifiers from that diff package so a helper can determine whether later task code made the verdict stale

#### Scenario: A nested artifact is copied to another task directory

- WHEN a task progress or feedback heading declares `Task 2` but the file is under `tasks/task-3/`
- THEN deterministic consumers treat the artifact as malformed rather than attributing Task 2 evidence or approval to Task 3

### Requirement: Finish history has an installed change-level template

The bundled templates tree SHALL contain `finish.md`, and `hamilton setup` SHALL install it as `~/.hamilton/templates/finish.md` and report the relative name `finish.md`. `hamilton-finish-work` SHALL instantiate it at `.hamilton/changes/<change>/finish.md` as append-only change-level history using paired `## Attempt N — <date>` and `## Outcome N — <date>` sections with the same monotonic positive integer. Attempt sections SHALL carry passed preconditions, specification synchronization, strategy, intended workspace result, and route intent; outcome sections SHALL carry `Result: completed | blocked`, verified external result, actual workspace and route state, and blockers or partial state. The shape SHALL support a temporarily dangling attempt when execution is interrupted between the two sections.

- Priority: must
- Rationale: finish history has a change-level lifecycle and external evidence that belongs neither in the task index nor in whole-branch review.

#### Scenario: Setup installs the finish shape

- WHEN the bundle contains `bundle/templates/finish.md` and `hamilton setup` completes
- THEN `~/.hamilton/templates/finish.md` matches the bundled content and the setup result includes `finish.md`

#### Scenario: Finish records a verified result

- WHEN `hamilton-finish-work` completes or blocks after beginning a finish strategy
- THEN it appends paired, equally numbered attempt and observed-outcome sections to `.hamilton/changes/<change>/finish.md` without adding a finish section to root progress

#### Scenario: Finish is interrupted after its attempt record

- WHEN `Attempt 2` is present without `Outcome 2`
- THEN the artifact unambiguously identifies one unfinished finish operation for resume to reconcile before allocating another attempt number

## MODIFIED Requirements

### Requirement: The bundle is the only repository template source

Every artifact shape in the repository SHALL have exactly one authoritative definition under `bundle/templates/`, and `hamilton setup` SHALL install that tree to the user-level `~/.hamilton/templates/` destination. The repository SHALL NOT retain or consult a project-local `.hamilton/templates/` mirror. Existing tracked files under `.hamilton/templates/` SHALL be removed in this change rather than updated alongside the bundle; project change, specification, and map artifacts under `.hamilton/` SHALL remain untouched.

- Priority: must
- Rationale: the tracked project-local copies predate the bundled installation model, have already diverged, and force every template change to choose between drift and duplicate maintenance.

#### Scenario: Contributor changes an artifact shape

- WHEN a contributor updates a template used by Hamilton
- THEN the shape is changed once under `bundle/templates/` and no corresponding `.hamilton/templates/` file exists to update

#### Scenario: Setup installs templates

- WHEN `hamilton setup` runs from the repository bundle
- THEN it copies `bundle/templates/` into `~/.hamilton/templates/` without reading a project-local `.hamilton/templates/` directory

#### Scenario: Legacy project-local templates are removed

- WHEN this change is implemented
- THEN tracked `.hamilton/templates/` files are deleted while `.hamilton/changes/`, `.hamilton/specs/`, and `.hamilton/maps/` remain intact

### Requirement: Progress template represents the root task index only

The bundled `progress.md` template SHALL define the task-only index instantiated at `.hamilton/changes/<change>/progress.md`. Its body SHALL be a Markdown table with exactly the columns Task, Status, and Progress; each Task cell SHALL use `Task N: <Markdown-escaped title>`; its allowed status vocabulary SHALL be `pending`, `in-progress`, `blocked`, and `done`; and each Progress cell SHALL hold a Markdown link targeting the exact relative path `tasks/task-N/progress.md`. The shape SHALL contain no task attempt block and no review or finish section. `hamilton setup` SHALL continue installing and reporting `progress.md` at the templates root.

- Priority: must
- Rationale: the existing root filename remains the familiar resume entry point while its compact shape becomes an index and authoritative current-state ledger.

#### Scenario: Planner instantiates root progress

- WHEN a plan contains Task 1 and Task 2
- THEN the root artifact contains two plan-ordered pending rows whose links point to `tasks/task-1/progress.md` and `tasks/task-2/progress.md`

#### Scenario: A task attempt completes

- WHEN `hamilton-code` completes Task 1
- THEN it changes Task 1's Status cell and records details in the linked task file without appending an attempt section to root progress

### Requirement: Review template represents whole-branch review only

The bundled `review.md` template SHALL define the append-only whole-branch review artifact created at `.hamilton/changes/<change>/review.md`. Its scope SHALL be fixed to the complete branch rather than parameterized as `Task N` or `whole change`, and each dated pass SHALL record the exact full merge-base and head commit identifiers on `Base:` and `Head:` lines, express `approved` or `changes-requested` on a `Verdict:` line, and separate Blocking findings from Suggestions. `hamilton setup` SHALL continue installing and reporting `review.md` at the templates root.

- Priority: must
- Rationale: once task feedback owns its own artifact, the change-level review shape can state one scope without a machine-classified placeholder.

#### Scenario: Whole branch receives its first review pass

- WHEN `hamilton-review` reviews the complete branch for a change
- THEN it creates or appends `.hamilton/changes/<change>/review.md` from the installed whole-branch review shape

#### Scenario: Task feedback is being recorded

- WHEN `hamilton-code-feedback` records a verdict for `Task 4`
- THEN it does not write a task section into `.hamilton/changes/<change>/review.md`

### Requirement: Template documentation presents all split execution and review artifacts

The template catalog and artifact layout SHALL distinguish root `progress.md` as the task index produced by `hamilton-plan` and updated by `hamilton-code`; `task-progress.md` as the Task Progress shape instantiated at `tasks/task-N/progress.md`; `feedback.md` as the Task Feedback shape instantiated at `tasks/task-N/feedback.md`; `review.md` as Whole-branch Review at the change root; and `finish.md` as Finish History at the change root. Template source filenames SHALL remain root-level even when their live instances are nested by task.

- Priority: must
- Rationale: the installed source path identifies the reusable shape, while the per-change instance path communicates lifecycle ownership; readers need both to apply the contract correctly.

#### Scenario: Reader inspects the template catalog

- WHEN a reader opens the bundled templates README or framework artifact layout
- THEN they can distinguish each source template, producer or updater, and instance path without inferring ownership from another document

## REMOVED Requirements

### Requirement: Root progress stores append-only task attempts and stage summaries

- Reason: detailed task attempts move to `tasks/task-N/progress.md`, review owns `review.md`, feedback owns `feedback.md`, and finish owns `finish.md`; retaining any of them at root would recreate a mixed stream.
- Migration: use root progress only for current task rows and follow each row's link for implementation evidence on changes started with the new artifact generation.

### Requirement: One review template serves task and whole-change scopes

- Reason: a parameterized scope in one `review.md` shape enables the ambiguity this change removes and conflicts with task-owned feedback artifacts.
- Migration: install the complete new template and skill set between changes; use `feedback.md` for new task feedback and the narrowed `review.md` for new whole-branch review.

## RENAMED Requirements

*(none)*
