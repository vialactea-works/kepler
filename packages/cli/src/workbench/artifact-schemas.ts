import { Ajv } from "ajv";
import type {
  AnySchemaObject,
  ErrorObject,
  ValidateFunction,
} from "ajv";
import type { RecognizedArtifact } from "./artifact-reader.js";
import {
  enumValues,
  requiredFields,
  type ArtifactContractDiagnostic,
  type SupportedArtifact,
} from "./artifact-types.js";

export type ArtifactMetadataSchema = AnySchemaObject;

const nonEmptyString: ArtifactMetadataSchema = {
  type: "string",
  minLength: 1,
  pattern: "\\S",
};

const dateString: ArtifactMetadataSchema = {
  type: "string",
  pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
};

const positiveInteger: ArtifactMetadataSchema = {
  type: "integer",
  minimum: 1,
};

const sha: ArtifactMetadataSchema = {
  type: "string",
  pattern: "^[0-9a-f]{40}$",
};
const sha256: ArtifactMetadataSchema = {
  type: "string",
  pattern: "^[0-9a-f]{64}$",
};

const routeUnit: ArtifactMetadataSchema = {
  anyOf: [
    { type: "null" },
    {
      type: "string",
      pattern: "^\\.kepler/maps/[^/]+/route\\.md — unit [1-9][0-9]*$",
    },
  ],
};

const executionContract: ArtifactMetadataSchema = {
  anyOf: [
    {
      type: "object",
      required: ["version", "order"],
      additionalProperties: false,
      properties: {
        version: { const: 1 },
        order: { type: "array", items: positiveInteger, uniqueItems: true },
      },
    },
    {
      type: "object",
      required: ["version", "mode"],
      additionalProperties: false,
      properties: {
        version: { const: 2 },
        mode: { const: "dependencies" },
      },
    },
  ],
};

const inputImpactContract: ArtifactMetadataSchema = {
  type: "object",
  required: ["version", "previousPlanCommit", "reviewReference", "changes"],
  additionalProperties: false,
  properties: {
    version: { const: 1 },
    previousPlanCommit: sha,
    reviewReference: nonEmptyString,
    changes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: [
          "path",
          "previousBlob",
          "currentBlob",
          "affectedTasks",
          "unaffectedTasks",
          "newTasks",
          "unresolvedIntent",
          "rationale",
        ],
        additionalProperties: false,
        properties: {
          path: nonEmptyString,
          previousBlob: { anyOf: [sha, { type: "null" }] },
          currentBlob: { anyOf: [sha, { type: "null" }] },
          affectedTasks: { type: "array", items: positiveInteger, uniqueItems: true },
          unaffectedTasks: { type: "array", items: positiveInteger, uniqueItems: true },
          newTasks: { type: "array", items: positiveInteger, uniqueItems: true },
          unresolvedIntent: { type: "boolean" },
          rationale: nonEmptyString,
        },
      },
    },
  },
};

const executionTransitionContract: ArtifactMetadataSchema = {
  anyOf: [
    {
      type: "object",
      required: [
        "version",
        "previousPlanCommit",
        "previousOrder",
        "fullyGatedPrefix",
        "approval",
        "reason",
        "affected",
      ],
      additionalProperties: false,
      properties: {
        version: { const: 1 },
        previousPlanCommit: sha,
        previousOrder: { type: "array", items: positiveInteger, uniqueItems: true },
        fullyGatedPrefix: { type: "array", items: positiveInteger, uniqueItems: true },
        approval: nonEmptyString,
        reason: nonEmptyString,
        affected: nonEmptyString,
      },
    },
    {
      type: "object",
      required: [
        "version",
        "previousPlanCommit",
        "fullyGatedTasks",
        "approval",
        "reason",
        "affected",
      ],
      additionalProperties: false,
      properties: {
        version: { const: 2 },
        previousPlanCommit: sha,
        fullyGatedTasks: { type: "array", items: positiveInteger, uniqueItems: true },
        approval: nonEmptyString,
        reason: nonEmptyString,
        affected: nonEmptyString,
      },
    },
  ],
};

const intentApprovalReference: ArtifactMetadataSchema = {
  type: "object",
  required: ["path", "reference", "commit"],
  additionalProperties: false,
  properties: {
    path: nonEmptyString,
    reference: nonEmptyString,
    commit: sha,
  },
};

const initialScaffoldProof: ArtifactMetadataSchema = {
  type: "object",
  required: ["version", "base", "authority", "breakdown", "taskIds"],
  additionalProperties: false,
  properties: {
    version: { const: 1 },
    base: sha,
    authority: nonEmptyString,
    breakdown: sha256,
    taskIds: { type: "array", items: positiveInteger, minItems: 1, uniqueItems: true },
  },
};

export const taskInputContextSchema: ArtifactMetadataSchema = {
  type: "object",
  required: ["version", "repository", "intentCommit", "taskDefinition", "inputs"],
  additionalProperties: false,
  properties: {
    version: { const: 1 },
    repository: nonEmptyString,
    intentCommit: {
      anyOf: [sha, { type: "string", pattern: "^tactical:\\S.+$" }],
    },
    taskDefinition: sha256,
    inputs: {
      type: "array",
      items: {
        type: "object",
        required: ["path", "blob"],
        additionalProperties: false,
        properties: { path: nonEmptyString, blob: sha },
      },
    },
    impactPlanCommit: sha,
  },
};

const legacyInputConfirmation: ArtifactMetadataSchema = {
  type: "object",
  required: [
    "version",
    "task",
    "repository",
    "taskDefinition",
    "intentCommit",
    "inputs",
    "historicalInputs",
    "owner",
    "ownerReference",
    "reviewer",
    "reviewReference",
    "rationale",
  ],
  additionalProperties: false,
  properties: {
    version: { const: 1 },
    task: positiveInteger,
    repository: nonEmptyString,
    taskDefinition: sha256,
    intentCommit: {
      anyOf: [sha, { type: "string", pattern: "^tactical:\\S.+$" }],
    },
    inputs: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["path", "blob"],
        additionalProperties: false,
        properties: { path: nonEmptyString, blob: sha },
      },
    },
    historicalInputs: { const: "unknown" },
    owner: nonEmptyString,
    ownerReference: nonEmptyString,
    reviewer: nonEmptyString,
    reviewReference: nonEmptyString,
    rationale: nonEmptyString,
  },
};

const taskMetadata: ArtifactMetadataSchema = {
  type: "object",
  required: ["id", "title", "status", "progress"],
  additionalProperties: true,
  properties: {
    id: positiveInteger,
    title: nonEmptyString,
    status: {
      enum: ["pending", "in-progress", "blocked", "done"],
    },
    progress: nonEmptyString,
  },
};

const routeUnitMetadata: ArtifactMetadataSchema = {
  type: "object",
  required: ["id", "name", "status", "depends_on", "backed_by"],
  additionalProperties: true,
  properties: {
    id: positiveInteger,
    name: nonEmptyString,
    status: { enum: ["pending", "in-progress", "shipped"] },
    depends_on: {
      type: "array",
      items: positiveInteger,
    },
    backed_by: {
      type: "array",
      items: nonEmptyString,
    },
  },
};

const propertySchemas: Record<string, ArtifactMetadataSchema> = {
  change: nonEmptyString,
  capability: nonEmptyString,
  author: nonEmptyString,
  effort: nonEmptyString,
  branch: nonEmptyString,
  scope: nonEmptyString,
  created: dateString,
  updated: dateString,
  task: positiveInteger,
  ticket: positiveInteger,
  decision: { enum: ["accepted", "rejected", "skipped"] },
  route_unit: routeUnit,
  base: sha,
  head: sha,
  tasks: {
    type: "array",
    items: taskMetadata,
  },
  blocked_by: {
    type: "array",
    items: positiveInteger,
  },
  units: {
    type: "array",
    items: routeUnitMetadata,
  },
};

const schemaProperties = (artifact: SupportedArtifact) => {
  const properties: Record<string, ArtifactMetadataSchema> = {
    artifact: { const: artifact },
  };
  const metadataFields = [
    ...requiredFields[artifact],
    ...(artifact === "feedback" || artifact === "review"
      ? ["base", "head", "verdict"]
      : []),
  ];
  for (const field of new Set(metadataFields)) {
    const property = propertySchemas[field];
    if (property) properties[field] = property;
  }
  for (const [field, values] of Object.entries(enumValues[artifact] ?? {})) {
    if (values) properties[field] = { enum: values };
  }
  if (artifact === "critique")
    properties.decision = { enum: ["accepted", "applied", "rejected", "skipped"] };
  if (artifact === "design" || artifact === "requirements-change")
    properties.status = { enum: ["draft", "approved"] };
  if (artifact === "plan") {
    properties.execution = executionContract;
    properties.execution_transition = executionTransitionContract;
     properties.input_impact = inputImpactContract;
     properties.legacy_input_confirmations = {
       type: "array",
       minItems: 1,
       items: legacyInputConfirmation,
     };
     properties.intent_approvals = {
      type: "array",
      items: intentApprovalReference,
      uniqueItems: true,
    };
    properties.initialization = initialScaffoldProof;
  }
  return properties;
};

const createArtifactMetadataSchema = (
  artifact: SupportedArtifact,
): ArtifactMetadataSchema => ({
  $schema: "http://json-schema.org/draft-07/schema#",
  title: `${artifact} frontmatter`,
  type: "object",
  required: requiredFields[artifact],
  additionalProperties: true,
  properties: schemaProperties(artifact),
});

export const artifactMetadataSchemas: Readonly<
  Record<SupportedArtifact, ArtifactMetadataSchema>
> = {
  proposal: createArtifactMetadataSchema("proposal"),
  design: createArtifactMetadataSchema("design"),
  "requirements-change": createArtifactMetadataSchema("requirements-change"),
  "requirements-spec": createArtifactMetadataSchema("requirements-spec"),
  plan: createArtifactMetadataSchema("plan"),
  progress: createArtifactMetadataSchema("progress"),
  "task-progress": createArtifactMetadataSchema("task-progress"),
  feedback: createArtifactMetadataSchema("feedback"),
  review: createArtifactMetadataSchema("review"),
  finish: createArtifactMetadataSchema("finish"),
  critique: createArtifactMetadataSchema("critique"),
  map: createArtifactMetadataSchema("map"),
  ticket: createArtifactMetadataSchema("ticket"),
  route: createArtifactMetadataSchema("route"),
};

export const artifactSchemas = artifactMetadataSchemas;

const ajv = new Ajv({ allErrors: true, strict: false });
const taskInputContextValidator = ajv.compile(taskInputContextSchema);

export const validateTaskInputContextSchema = (
  value: unknown,
): readonly string[] => {
  if (taskInputContextValidator(value)) return [];
  return (taskInputContextValidator.errors ?? []).map((error) => {
    const field = fieldPath(error.instancePath, String(error.params.missingProperty ?? ""));
    return field === ""
      ? "task input context is malformed"
      : `task input context ${field} is invalid`;
  });
};

const validators: Readonly<Record<SupportedArtifact, ValidateFunction>> = {
  proposal: ajv.compile(artifactMetadataSchemas.proposal),
  design: ajv.compile(artifactMetadataSchemas.design),
  "requirements-change": ajv.compile(
    artifactMetadataSchemas["requirements-change"],
  ),
  "requirements-spec": ajv.compile(
    artifactMetadataSchemas["requirements-spec"],
  ),
  plan: ajv.compile(artifactMetadataSchemas.plan),
  progress: ajv.compile(artifactMetadataSchemas.progress),
  "task-progress": ajv.compile(artifactMetadataSchemas["task-progress"]),
  feedback: ajv.compile(artifactMetadataSchemas.feedback),
  review: ajv.compile(artifactMetadataSchemas.review),
  finish: ajv.compile(artifactMetadataSchemas.finish),
  critique: ajv.compile(artifactMetadataSchemas.critique),
  map: ajv.compile(artifactMetadataSchemas.map),
  ticket: ajv.compile(artifactMetadataSchemas.ticket),
  route: ajv.compile(artifactMetadataSchemas.route),
};

const fieldPath = (instancePath: string, property?: string): string => {
  const segments = instancePath
    .split("/")
    .slice(1)
    .filter((segment) => segment !== "")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  let path = "";
  for (const segment of segments) {
    path = /^[0-9]+$/.test(segment)
      ? `${path}[${segment}]`
      : path === ""
        ? segment
        : `${path}.${segment}`;
  }
  if (property) path = path === "" ? property : `${path}.${property}`;
  return path;
};

const valueAtPath = (
  metadata: Record<string, unknown>,
  path: string,
): { readonly found: boolean; readonly value: unknown } => {
  const segments = path.match(/[^.[\]]+|\[[0-9]+\]/g) ?? [];
  let current: unknown = metadata;
  for (const segment of segments) {
    const key = segment.startsWith("[")
      ? Number(segment.slice(1, -1))
      : segment;
    if (
      typeof current !== "object" ||
      current === null ||
      !Object.hasOwn(current, key)
    )
      return { found: false, value: null };
    current = Object.getOwnPropertyDescriptor(current, String(key))?.value;
  }
  return { found: true, value: current };
};

const diagnostic = (
  artifact: RecognizedArtifact,
  code: ArtifactContractDiagnostic["code"],
  message: string,
  options: {
    readonly field?: string;
    readonly expected?: string;
    readonly actual?: unknown;
    readonly actualPresent?: boolean;
    readonly line?: number;
  } = {},
): ArtifactContractDiagnostic => ({
  _tag: "ArtifactContractDiagnostic",
  code,
  message,
  sourcePath: artifact.sourcePath,
  ...(options.field === undefined ? {} : { field: options.field }),
  ...(options.expected === undefined ? {} : { expected: options.expected }),
  ...(options.actualPresent === true && options.actual !== undefined
    ? { actual: options.actual }
    : {}),
  location: { line: options.line ?? artifact.locations.metadata.startLine },
});

const positiveIntegerField = (field: string): boolean =>
  /(?:^|\.)(id|task|ticket)$/.test(field) ||
  /(?:blocked_by|depends_on)\[[0-9]+\]$/.test(field);

const listField = (field: string): boolean =>
  /^(tasks|blocked_by|units|[^.]+\[[0-9]+\]\.(depends_on|backed_by))$/.test(
    field,
  );

const mappingField = (field: string): boolean =>
  /^(tasks|units)\[[0-9]+\]$/.test(field);

const enumField = (kind: SupportedArtifact, field: string): boolean => {
  if (field.endsWith(".status")) return true;
  return Object.hasOwn(enumValues[kind] ?? {}, field);
};

const stringField = (field: string): boolean =>
  /(?:^|\.)(change|capability|author|effort|branch|scope|title|name)$/.test(
    field,
  ) ||
  /(?:backed_by)\[[0-9]+\]$/.test(field);

const dateField = (field: string): boolean =>
  field === "created" || field === "updated";

const hashField = (field: string): boolean => field === "base" || field === "head";

const typeDiagnostic = (
  artifact: RecognizedArtifact,
  kind: SupportedArtifact,
  field: string,
  actual: unknown,
): ArtifactContractDiagnostic => {
  if (mappingField(field)) {
    const collection = field.replace(/\[[0-9]+\]$/, "");
    return diagnostic(
      artifact,
      "invalid-type",
      `${field} must be a mapping`,
      {
        field: collection,
        expected: "mapping",
        actual,
        actualPresent: true,
      },
    );
  }
  if (enumField(kind, field))
    return diagnostic(
      artifact,
      "invalid-value",
      `${field} is not allowed for ${kind}`,
      {
        field,
        expected: (enumValues[kind]?.[field] ??
          (field.endsWith(".status")
            ? field.startsWith("tasks[")
              ? ["pending", "in-progress", "blocked", "done"]
              : ["pending", "in-progress", "shipped"]
            : []))
          .join(" | "),
        actual,
        actualPresent: true,
      },
    );
  if (field === "route_unit")
    return diagnostic(
      artifact,
      "invalid-value",
      `${field} must be null or a route unit reference`,
      {
        field,
        expected: "route reference or null",
        actual,
        actualPresent: true,
      },
    );
  if (dateField(field))
    return diagnostic(
      artifact,
      "invalid-value",
      `${field} must be an ISO calendar date`,
      { field, expected: "YYYY-MM-DD", actual, actualPresent: true },
    );
  if (hashField(field))
    return diagnostic(
      artifact,
      "invalid-value",
      `${field} must be a full lowercase commit identifier`,
      {
        field,
        expected: "40 hexadecimal characters",
        actual,
        actualPresent: true,
      },
    );
  if (positiveIntegerField(field))
    return diagnostic(
      artifact,
      "invalid-type",
      `${field} must be a positive integer`,
      { field, expected: "positive integer", actual, actualPresent: true },
    );
  if (listField(field))
    return diagnostic(
      artifact,
      "invalid-type",
      `${field} must be a list`,
      { field, expected: "list", actual, actualPresent: true },
    );
  return diagnostic(
    artifact,
    "invalid-type",
    `${field} must be a non-empty string`,
    { field, expected: "non-empty string", actual, actualPresent: true },
  );
};

const errorField = (error: ErrorObject): string =>
  error.keyword === "required"
    ? fieldPath(error.instancePath, String(error.params.missingProperty))
    : fieldPath(error.instancePath);

const mapSchemaError = (
  artifact: RecognizedArtifact,
  kind: SupportedArtifact,
  metadata: Record<string, unknown>,
  error: ErrorObject,
): ArtifactContractDiagnostic => {
  const field = errorField(error);
  const value = valueAtPath(metadata, field);
  if (error.keyword === "required") {
    const property = String(error.params.missingProperty);
    const parent = fieldPath(error.instancePath);
    return diagnostic(
      artifact,
      "missing-field",
      parent === ""
        ? `Frontmatter is missing the ${property} field`
        : `${parent} is missing ${property}`,
      { field, line: artifact.locations.metadata.startLine },
    );
  }
  if (error.keyword === "const") {
    if (field === "artifact")
      return diagnostic(artifact, "invalid-value", `artifact must be ${kind}`, {
        field: "artifact",
        expected: kind,
        actual: metadata.artifact,
        actualPresent: true,
      });
    return diagnostic(artifact, "invalid-value", `${field} is invalid`, {
      field,
      expected: String(error.params.allowedValue),
      actual: value.value,
      actualPresent: value.found,
    });
  }
  if (error.keyword === "enum") {
    const allowed = Array.isArray(error.params.allowedValues)
      ? error.params.allowedValues.map(String).join(" | ")
      : "";
    return diagnostic(
      artifact,
      "invalid-value",
      field.includes(".") || field.includes("[")
        ? `${field} is not allowed`
        : `${field} is not allowed for ${kind}`,
      {
        field,
        expected: allowed,
        actual: value.value,
        actualPresent: value.found,
      },
    );
  }
  if (error.keyword === "anyOf")
    return diagnostic(
      artifact,
      "invalid-value",
      `${field} must be null or a route unit reference`,
      {
        field,
        expected: "route reference or null",
        actual: value.value,
        actualPresent: value.found,
      },
    );
  if (error.keyword === "pattern" && dateField(field))
    return diagnostic(
      artifact,
      "invalid-value",
      `${field} must be an ISO calendar date`,
      {
        field,
        expected: "YYYY-MM-DD",
        actual: value.value,
        actualPresent: value.found,
      },
    );
  if (error.keyword === "pattern" && hashField(field))
    return diagnostic(
      artifact,
      "invalid-value",
      `${field} must be a full lowercase commit identifier`,
      {
        field,
        expected: "40 hexadecimal characters",
        actual: value.value,
        actualPresent: value.found,
      },
    );
  if (
    (error.keyword === "minLength" || error.keyword === "pattern") &&
    stringField(field)
  )
    return diagnostic(
      artifact,
      "invalid-type",
      `${field} must be a non-empty string`,
      {
        field,
        expected: "non-empty string",
        actual: value.value,
        actualPresent: value.found,
      },
    );
  if (error.keyword === "minimum" || error.keyword === "type")
    return typeDiagnostic(artifact, kind, field, value.value);
  return diagnostic(
    artifact,
    "invalid-value",
    `${field} is invalid`,
    { field, actual: value.value, actualPresent: value.found },
  );
};

const skippedNestedRouteErrors = (error: ErrorObject): boolean =>
  error.instancePath === "/route_unit" && error.keyword !== "anyOf";

export const validateArtifactMetadataSchema = (
  artifact: RecognizedArtifact,
  kind: SupportedArtifact,
): readonly ArtifactContractDiagnostic[] => {
  const validator = validators[kind];
  const valid = validator(artifact.metadata);
  if (valid) return [];
  const errors: readonly ErrorObject[] = validator.errors ?? [];
  const seen = new Set<string>();
  return errors
    .filter((error) => !skippedNestedRouteErrors(error))
    .map((error) => mapSchemaError(artifact, kind, artifact.metadata, error))
    .filter((item) => {
      const key = `${item.code}:${item.field ?? ""}:${item.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const validateArtifactSchema = validateArtifactMetadataSchema;
