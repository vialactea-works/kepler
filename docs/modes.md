# Workflow versions

Use this page to select the correct workflow documentation. Kepler exposes two artifact models in one CLI.

## Standard Construction

Use `kepler mission` and `kepler workflow construction` for mission-owned v3 work. A mission has one Unit of Work. The Standard stages are Functional Design, Quality Requirements, Implementation Planning, Implementation, Unit of Work Review, and Deliver.

During Implementation, each task passes through Code Generation, independent Code Validation, and Code Integration. The CLI checks and records operations. A person or coding-agent host performs the work and dispatches workers.

Start with [Complete a mission](missions/tutorial.md). Use the [Construction reference](cli/construction.md) for exact commands.

## Earlier workbench

Use `kepler workbench` for the earlier change-based artifact model. Its context, task-state, and history rules differ from mission-owned Construction records. See the [workbench reference](cli/workbench.md).

Kepler does not convert old change artifacts or history into v3 mission authority. Keep the old records intact. Setup does not resume old workers or acquire their locks.

## Shared distribution

Each release package contains a CLI and matching resources. Setup initializes the version-specific home selected through `KEPLER_HOME`; it does not select an active CLI or configure a host. See [Installation](installation.md).

Initialization and Inception remain outside the implemented phase CLI. Standard completion does not grant publication or deployment permission. See [Standard workflow](sdd-framework.md) for system boundaries.
