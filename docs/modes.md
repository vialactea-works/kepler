# Kepler workflow

Kepler v3 combines the workflow CLI, a compatible sidecar bundle, portable skills, and optional host-native role definitions. The current workflow command tree implements Construction's Standard workflow. It does not run a general workflow engine or dispatch agents on its own.

## Standard Construction

Use one Unit of Work per mission. The stage sequence is Functional Design, Quality Requirements, Implementation Planning, Implementation, Unit of Work Review, and Deliver. Inside Implementation, each task passes through Code Generation, independent non-author Code Validation, and checked Code Integration.

Mission startup prepares the selected record-home and workspace resources before stage work. Existing application source and tests are optional; project selection and mission contracts still apply. The CLI records stage, task, Activity, evidence, approval, and revision history. Skills own their procedures and the host controls agent dispatch.

Start with the [CLI guide](cli.md), [skill reference](skills.md), and [workflow guide](sdd-framework.md). See [installation](installation.md) for generation and host-resource ownership, and [recovery](recovery.md) for interrupted work.

## Earlier change-based workflow

The `kepler workbench` command remains for the earlier change-based workflow. It is separate from v3 mission-owned records. Kepler does not convert old artifacts or history. Use the generation that created active work and keep its files intact.

## Scope limits

Kepler does not implement the future Initialization or Inception phases, certify agent behavior, or grant release and deployment permission. The Standard stage sequence does not require publication or deployment. Each external operation needs its own authority and verification.
