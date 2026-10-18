# Task graph JSON format

[Implementation Planning](implementation-planning.md) | [Construction phase index](README.md) | [Workflow phase index](../../README.md)

## Status and scope

**Status:** Accepted by the requester under [IP26](../../authoring_progress.md#implementation-planning-decisions).

Approval covers this specification's field definitions, dependency rules, prerequisite rules, example, validation rules, and JSON Schema. Task identity lifecycle and broader [Planning policies](implementation-planning.md) remain separate. This approval does not accept the complete Planning stage or an executing Unit of Work. It does not implement a writer or validator.

The requester selected a Kepler-specific JSON format and UUIDv4 task IDs. Do not adopt JGF or another graph interchange format.

This document defines the concrete representation for `tasks-dag.json`.

`plan.md` owns technical rationale. `tasks-dag.json` owns the authored task graph. Record actual progress, attempts, approvals, and check results through CLI-owned event journals, not this file.

## Root object

The file contains one JSON object with these required fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `format` | String. | Exact value `kepler-task-dag`. |
| `version` | Integer. | Exact value `1` for this JSON format definition. |
| `id` | UUIDv4 string. | Identity of the graph artifact, separate from every task identity. Preserve it across revisions and moves. |
| `unit_id` | String. | The owning Unit of Work ID. It must match the unit directory and `plan.md`. |
| `tasks` | Non-empty array of task objects. | Complete planned task set for this unit. Array order does not define dependencies or execution order. |

`version` identifies the JSON format. It is not the Kepler release, Markdown schema version, content revision, event version, or attempt identity.

Apply the shared [unit identity rules](../../unit-of-work.md#identity-and-directory).

Generate the graph artifact ID through the `kepler` CLI under the shared [artifact identity rules](../../metadata.md#identity-and-content-versions). Use a fresh, cross-project-unique UUIDv4 string. Preserve it across content revisions and moves. It must differ from every task ID and the `plan.md` artifact ID.

The graph's JSON fields are defined here, not copied from Markdown frontmatter.

## Task identity

Each task ID is an independently allocated UUIDv4 string.

Task IDs must be unique within the graph. Do not use the graph artifact's UUID as a task ID. A task title is a readable description, not its identity.

The proposed [identity lifecycle](implementation-planning.md#task-identities-and-definitions) governs continuity when tasks change. UUIDv4 selection does not accept every lifecycle proposal or transfer earlier completion into a new attempt.

## Task object

Each task contains these required fields. Use empty arrays where the table permits them; do not use `null` or omit the field.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | UUIDv4 string. | Stable task identifier, distinct from artifact and attempt IDs. |
| `title` | Non-empty string. | Readable task name. It does not determine graph order. |
| `goal` | Non-empty string. | Cohesive implementation outcome and its scope. |
| `inputs` | Array of input objects; can be empty. | Applicable requirements, quality constraints, technical decisions, existing material, and their relevance. |
| `outputs` | Non-empty array of unique non-empty strings. | Names of the results this task must produce. These are planned outputs, not completion claims. |
| `acceptance_criteria` | Non-empty array of non-empty strings. | Observable completion conditions, including relevant failures and boundaries. |
| `guidance` | Array of non-empty strings; can be empty. | Implementation instructions, affected areas, and task-wide shared-file or resource constraints. This is not a second task graph. |
| `verification` | Non-empty array of verification objects. | Task-specific checks, required setup, and expected outcomes. |
| `depends_on` | Array of dependency objects; can be empty. | Required predecessor tasks and their reasons. This is the only dependency representation. |
| `prerequisites` | Array of prerequisite objects; can be empty. | External availability conditions not supplied by another task's output. |

The task must remain understandable with its referenced inputs, without reconstructing contracts from sibling task descriptions or conversation history.

### Input object

| Field | Type | Meaning |
| --- | --- | --- |
| `reference` | Non-empty string. | Precise reference to the relevant input material. |
| `purpose` | Non-empty string. | Explain what obligation or context this input supplies to the task. |

Local references use repository-relative file paths and optional Markdown fragments. Resolve them within the repository. External references use explicit URIs. Do not store machine-local absolute paths or credentials.

A reference does not establish approval or waive the task's acceptance criteria. Evidence must identify and retain the material actually used under the shared [material rules](../../runtime.md#material-references).

### Verification object

| Field | Type | Meaning |
| --- | --- | --- |
| `scope` | Non-empty string. | Behavior, contract, or other material covered by verification. |
| `method` | Non-empty string. | Exact available command or defined verification procedure, including required fixtures, versions, resources, and isolation conditions. |
| `expected_result` | Non-empty string. | Observable condition that establishes success. |

`method` describes how to run the check, including its setup. `prerequisites` defines when required external conditions must be available.

Record expectations here, not actual results. Missing verification infrastructure must have planned coverage under the [verification strategy](implementation-planning.md#verification-strategy).

The shared stage check duties apply independently of this array. Task data cannot weaken typechecking, build, full-suite, or independent-feedback obligations where the stage contract requires them.

### Dependency object

Store each dependency on the task that requires the predecessor's work:

| Field | Type | Meaning |
| --- | --- | --- |
| `task_id` | UUIDv4 string. | Identity of the required predecessor task in this graph. |
| `reason` | Non-empty string. | Describe the predecessor work needed and why it is required. |

The dependency's `reason` explains the required work without a separate output-name list. Review the reason against the predecessor's task contract. Keep task-level `outputs` to define each task's expected results. Keep the technical decision rationale in `plan.md`; use references instead of competing explanations.

A dependency creates a directed edge from the predecessor to the task containing it. Declare at most one dependency object per predecessor.

Reject missing predecessors, self-dependencies, duplicate predecessor references, and cycles. Task array order and titles do not establish dependencies.

Only `depends_on` defines edges. Do not add a second root-level edge array or infer edges from guidance, shared files, or external prerequisites.

Graph structure does not establish readiness. Apply the shared [admission rules](../../runtime.md#task-admission-and-baselines) to actual integrated outputs and valid inputs.

### Prerequisite object

| Field | Type | Meaning |
| --- | --- | --- |
| `description` | Non-empty string. | External access, environment, information, or service needed. |
| `needed_for` | String enum. | Exact value `implementation` or `verification`. |
| `needed_when` | Non-empty string. | Point at which the condition matters within that work or verification. |
| `blocking` | Boolean. | Whether absence prevents the identified work or required verification. |
| `condition` | Non-empty string. | Observable availability condition and how to establish it. |
| `reason` | Non-empty string. | Explain the blocker or why absence does not prevent the required work or verification. |

When another task establishes a required condition, name its output and use `depends_on` instead. Do not duplicate that relationship as an external prerequisite.

These fields define future conditions, not current availability. Planning need not establish that availability before completion. Check blocking conditions before the affected work starts; independent ready work can continue.

### Shared-file and resource instructions

Record instructions in the field that owns their scope:

- Use `guidance` for task-wide shared-file and resource access constraints.
- Use verification `method` for check-specific setup and isolation conditions.
- Use `prerequisites` for blocking external availability conditions, including the affected work and required timing.

Two independent tasks can share a broker namespace and interfere with each other's test data. Separate namespaces or isolated instances can prevent that conflict without adding an execution-order dependency.

The orchestrator and workers interpret these instructions; they do not create graph edges or allocate locks automatically. Separate Git workspaces alone do not isolate shared external resources.

## Validation rules

- Parse strict JSON. Reject duplicate object keys, comments, and trailing commas.
- Require exactly the defined fields at each object level. Reject unknown fields, missing fields, incorrect types, and `null` values.
- Reject empty or whitespace-only strings. Enforce the stated array cardinalities and unique output names.
- Require `format: kepler-task-dag`, integer `version: 1`, valid artifact and task UUIDv4 values, and the owning unit identity.
- Validate dependency references, duplicate edges, and acyclicity across the complete task set.
- Resolve relevant local input paths and Markdown fragments without escaping the repository.
- Check consistency with `plan.md` and relevant upstream requirements. Structural validity alone does not establish coverage or technical correctness.
- Reject execution-state fields, including task status, completion, attempts, approvals, admission checkpoints, and actual check results.

Validation is read-only. Preserve invalid files and unsupported versions for correction; do not coerce values, allocate missing IDs, or rewrite input.

Use the existing [Planning evidence requirements](implementation-planning.md#evidence-coverage). Check the artifact pair and retain covered inputs and outputs under the shared bindings. This format adds no requester approval gate.

## Example

This example illustrates the format, not a real unit or an approved implementation plan. The second task needs the first task's integrated contract. Stage-wide checks still apply beyond the task-specific checks shown.

```json
{
  "format": "kepler-task-dag",
  "version": 1,
  "id": "7e9e09ec-0b0e-4b27-9cc7-373ad7bc869c",
  "unit_id": "2026-10-18-message-publishing",
  "tasks": [
    {
      "id": "2a0a7e72-d468-43ed-bc89-54a2139c56ab",
      "title": "Define publishing boundary",
      "goal": "Define an adapter-independent publishing contract and a test double.",
      "inputs": [
        {
          "reference": ".kepler/units-of-work/2026-10-18-message-publishing/design.md#boundaries-and-interactions",
          "purpose": "Implement the accepted publishing contract."
        }
      ],
      "outputs": ["Publishing boundary contract", "Publishing test double"],
      "acceptance_criteria": [
        "The boundary expresses the required inputs, outcomes, and failure behavior without a broker-specific client interface."
      ],
      "guidance": ["Follow the existing application boundary conventions."],
      "verification": [
        {
          "scope": "Publishing boundary behavior",
          "method": "Run the boundary's unit tests.",
          "expected_result": "Normal and failure outcomes satisfy the declared contract."
        }
      ],
      "depends_on": [],
      "prerequisites": []
    },
    {
      "id": "6fa217c8-5078-4b15-81da-a9e979d74e64",
      "title": "Implement publishing adapter",
      "goal": "Connect the publishing boundary to the selected broker without changing application rules.",
      "inputs": [
        {
          "reference": ".kepler/units-of-work/2026-10-18-message-publishing/plan.md#technical-solution",
          "purpose": "Use the selected broker and its documented error mapping."
        }
      ],
      "outputs": ["Broker publishing adapter", "Adapter integration tests"],
      "acceptance_criteria": [
        "Messages reach the broker through the publishing boundary.",
        "Provider failures produce the declared application errors."
      ],
      "guidance": [
        "Keep the broker client inside the adapter.",
        "Keep broker resources isolated from concurrent tasks."
      ],
      "verification": [
        {
          "scope": "Adapter and broker collaboration",
          "method": "Run the adapter's integration tests against a disposable broker instance with test data isolated from concurrent tasks.",
          "expected_result": "Publishing and provider-failure cases satisfy the boundary contract."
        }
      ],
      "depends_on": [
        {
          "task_id": "2a0a7e72-d468-43ed-bc89-54a2139c56ab",
          "reason": "The adapter implements the predecessor's publishing contract."
        }
      ],
      "prerequisites": [
        {
          "description": "Isolated broker test environment",
          "needed_for": "verification",
          "needed_when": "Before adapter integration tests",
          "blocking": true,
          "condition": "The test environment supplies a reachable broker and disposable test credentials.",
          "reason": "Adapter verification requires collaboration with a real broker."
        }
      ]
    }
  ]
}
```

## JSON Schema

This Draft 2020-12 schema defines the current structural format. It does not implement a production validator. The remaining Planning proposals remain open.

Configure the validator to assert the `uuid` format. The standard `uuid` format does not restrict the UUID version. Check version 4 separately and apply shared artifact identity rules to the root ID.

Separate semantic checks must establish task-ID uniqueness, artifact/task identity separation, valid predecessor references, duplicate-edge rejection, and acyclicity. Check unit ownership and local paths against the repository and `plan.md`. Assess requirement coverage and technical consistency separately.

Reject duplicate JSON object keys during parsing. Schema validation cannot recover duplicate keys after a parser has discarded them.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Kepler task DAG format version 1",
  "type": "object",
  "additionalProperties": false,
  "required": ["format", "version", "id", "unit_id", "tasks"],
  "properties": {
    "format": { "const": "kepler-task-dag" },
    "version": { "type": "integer", "const": 1 },
    "id": { "$ref": "#/$defs/uuid" },
    "unit_id": { "$ref": "#/$defs/text" },
    "tasks": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/task" }
    }
  },
  "$defs": {
    "text": {
      "type": "string",
      "minLength": 1,
      "pattern": "\\S"
    },
    "uuid": {
      "type": "string",
      "format": "uuid",
      "description": "A UUIDv4 string. Check version 4 separately."
    },
    "texts": {
      "type": "array",
      "items": { "$ref": "#/$defs/text" }
    },
    "outputs": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": { "$ref": "#/$defs/text" }
    },
    "input": {
      "type": "object",
      "additionalProperties": false,
      "required": ["reference", "purpose"],
      "properties": {
        "reference": { "$ref": "#/$defs/text" },
        "purpose": { "$ref": "#/$defs/text" }
      }
    },
    "verification": {
      "type": "object",
      "additionalProperties": false,
      "required": ["scope", "method", "expected_result"],
      "properties": {
        "scope": { "$ref": "#/$defs/text" },
        "method": { "$ref": "#/$defs/text" },
        "expected_result": { "$ref": "#/$defs/text" }
      }
    },
    "dependency": {
      "type": "object",
      "additionalProperties": false,
      "required": ["task_id", "reason"],
      "properties": {
        "task_id": { "$ref": "#/$defs/uuid" },
        "reason": { "$ref": "#/$defs/text" }
      }
    },
    "prerequisite": {
      "type": "object",
      "additionalProperties": false,
      "required": ["description", "needed_for", "needed_when", "blocking", "condition", "reason"],
      "properties": {
        "description": { "$ref": "#/$defs/text" },
        "needed_for": { "enum": ["implementation", "verification"] },
        "needed_when": { "$ref": "#/$defs/text" },
        "blocking": { "type": "boolean" },
        "condition": { "$ref": "#/$defs/text" },
        "reason": { "$ref": "#/$defs/text" }
      }
    },
    "task": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id", "title", "goal", "inputs", "outputs", "acceptance_criteria",
        "guidance", "verification", "depends_on", "prerequisites"
      ],
      "properties": {
        "id": { "$ref": "#/$defs/uuid" },
        "title": { "$ref": "#/$defs/text" },
        "goal": { "$ref": "#/$defs/text" },
        "inputs": {
          "type": "array",
          "items": { "$ref": "#/$defs/input" }
        },
        "outputs": { "$ref": "#/$defs/outputs" },
        "acceptance_criteria": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/text" }
        },
        "guidance": { "$ref": "#/$defs/texts" },
        "verification": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/verification" }
        },
        "depends_on": {
          "type": "array",
          "items": { "$ref": "#/$defs/dependency" }
        },
        "prerequisites": {
          "type": "array",
          "items": { "$ref": "#/$defs/prerequisite" }
        }
      }
    }
  }
}
```
