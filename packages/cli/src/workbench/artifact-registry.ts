import type { ArtifactReadResult, RecognizedArtifact } from "./artifact-reader.js";
import {
  routeRelationProblems,
  validateArtifactBody,
} from "./artifact-body.js";
import { validateArtifactMetadataSchema } from "./artifact-schemas.js";
import {
  requiredFields,
  supportedArtifacts,
  type ArtifactContract,
  type ArtifactContractDiagnostic,
  type ArtifactContractResult,
  type RouteUnitContract,
  type SupportedArtifact,
} from "./artifact-types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const diagnostic = (
  artifact: RecognizedArtifact,
  code: ArtifactContractDiagnostic["code"],
  message: string,
  options: {
    readonly field?: string;
    readonly expected?: string;
    readonly actual?: unknown;
    readonly actualPresent?: boolean;
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
  location: { line: artifact.locations.metadata.startLine },
});

const pathSegments = (sourcePath: string): readonly string[] => {
  const normalized = sourcePath.replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  const marker = segments.lastIndexOf(".kepler");
  return marker < 0 ? [] : segments.slice(marker);
};

const pathDiagnostic = (
  artifact: RecognizedArtifact,
  expected: string,
): ArtifactContractDiagnostic =>
  diagnostic(
    artifact,
    "path-mismatch",
    `Artifact path must match ${expected}`,
    {
      field: "sourcePath",
      expected,
      actual: artifact.sourcePath,
      actualPresent: true,
    },
  );

const expectedPath = (
  artifact: RecognizedArtifact,
  metadata: Record<string, unknown>,
): ArtifactContractDiagnostic | null => {
  const kind = metadata.artifact;
  const segments = pathSegments(artifact.sourcePath);
  const expectedChange =
    typeof metadata.change === "string" ? metadata.change : "<change>";
  const expectedCapability =
    typeof metadata.capability === "string"
      ? metadata.capability
      : "<capability>";
  const expectedEffort =
    typeof metadata.effort === "string" ? metadata.effort : "<effort>";
  const expectedTask =
    typeof metadata.task === "number" ? String(metadata.task) : "<task>";
  const expectedTicket =
    typeof metadata.ticket === "number"
      ? String(metadata.ticket).padStart(2, "0")
      : "<NN>";
  let expected: readonly string[];
  switch (kind) {
    case "proposal":
      expected = [".kepler", "changes", expectedChange, "proposal.md"];
      break;
    case "design":
      expected = [".kepler", "changes", expectedChange, "design.md"];
      break;
    case "requirements-change":
      expected = [
        ".kepler",
        "changes",
        expectedChange,
        "requirements",
        `${expectedCapability}.md`,
      ];
      break;
    case "requirements-spec":
      expected = [".kepler", "specs", `${expectedCapability}.md`];
      break;
    case "plan":
      expected = [".kepler", "changes", expectedChange, "plan.md"];
      break;
    case "progress":
      expected = [".kepler", "changes", expectedChange, "progress.md"];
      break;
    case "task-progress":
      expected = [
        ".kepler",
        "changes",
        expectedChange,
        "tasks",
        `task-${expectedTask}`,
        "progress.md",
      ];
      break;
    case "feedback":
      expected = [
        ".kepler",
        "changes",
        expectedChange,
        "tasks",
        `task-${expectedTask}`,
        "feedback.md",
      ];
      break;
    case "review":
      expected = [".kepler", "changes", expectedChange, "review.md"];
      break;
    case "finish":
      expected = [".kepler", "changes", expectedChange, "finish.md"];
      break;
    case "critique":
      expected = [".kepler", "changes", expectedChange, "critique.md"];
      break;
    case "map":
      expected = [".kepler", "maps", expectedEffort, "map.md"];
      break;
    case "ticket":
      expected = [
        ".kepler",
        "maps",
        expectedEffort,
        "tickets",
        `${expectedTicket}-<slug>.md`,
      ];
      if (
        segments.length === expected.length &&
        segments
          .slice(0, -1)
          .every((segment, index) => segment === expected[index]) &&
        (segments[segments.length - 1] ?? "").startsWith(expectedTicket + "-") &&
        (segments[segments.length - 1] ?? "").endsWith(".md")
      )
        return null;
      return pathDiagnostic(artifact, expected.join("/"));
    case "route":
      expected = [".kepler", "maps", expectedEffort, "route.md"];
      break;
    default:
      return null;
  }
  if (
    segments.length !== expected.length ||
    !segments.every((segment, index) => segment === expected[index])
  )
    return pathDiagnostic(artifact, expected.join("/"));
  return null;
};

const validateMetadataRelationships = (
  artifact: RecognizedArtifact,
  kind: SupportedArtifact,
): readonly ArtifactContractDiagnostic[] => {
  if (kind !== "progress" || !Array.isArray(artifact.metadata.tasks)) return [];
  const diagnostics: ArtifactContractDiagnostic[] = [];
  for (const [index, task] of artifact.metadata.tasks.entries()) {
    if (!isRecord(task)) continue;
    if (
      typeof task.id === "number" &&
      Number.isInteger(task.id) &&
      task.id > 0 &&
      typeof task.progress === "string" &&
      task.progress !== `tasks/task-${task.id}/progress.md`
    )
      diagnostics.push(
        diagnostic(
          artifact,
          "path-mismatch",
          "Task progress must identify its task",
          {
            field: `tasks[${index}].progress`,
            expected: `tasks/task-${task.id}/progress.md`,
            actual: task.progress,
            actualPresent: true,
          },
        ),
      );
  }
  return diagnostics;
};

const validateContract = (
  artifact: RecognizedArtifact,
  kind: SupportedArtifact,
): readonly ArtifactContractDiagnostic[] => {
  const identity = expectedPath(artifact, artifact.metadata);
  return [
    ...validateArtifactMetadataSchema(artifact, kind),
    ...validateMetadataRelationships(artifact, kind),
    ...(identity === null ? [] : [identity]),
  ];
};

export const artifactContracts: Readonly<
  Record<SupportedArtifact, ArtifactContract>
> = Object.fromEntries(
  supportedArtifacts.map((artifact) => [
    artifact,
    {
      artifact,
      requiredFields: requiredFields[artifact],
      validate: (source) => validateContract(source, artifact),
      validateBody: (source) => validateArtifactBody(source, artifact),
    },
  ]),
) as Record<SupportedArtifact, ArtifactContract>;

export const artifactContractRegistry = artifactContracts;

export const validateArtifact = (
  result: ArtifactReadResult,
): ArtifactContractResult => {
  if (result._tag === "unrelated")
    return { _tag: "skipped", sourcePath: result.sourcePath };
  if (result._tag === "invalid")
    return {
      _tag: "invalid",
      sourcePath: result.sourcePath,
      diagnostics: [result.diagnostic],
    };
  const artifact = result.metadata.artifact;
  if (
    typeof artifact !== "string" ||
    !Object.hasOwn(artifactContracts, artifact)
  )
    return {
      _tag: "invalid",
      sourcePath: result.sourcePath,
      diagnostics: [
        diagnostic(
          result,
          "unsupported-artifact",
          "Frontmatter declares an unsupported artifact value",
          {
            field: "artifact",
            expected: supportedArtifacts.join(" | "),
            actual: artifact,
            actualPresent: true,
          },
        ),
      ],
    };
  const contract = artifactContracts[artifact as SupportedArtifact];
  const body = contract.validateBody(result);
  const diagnostics = [...contract.validate(result), ...body.diagnostics];
  if (artifact === "route" && diagnostics.length === 0) {
    const units = result.metadata.units as RouteUnitContract[];
    for (const problem of routeRelationProblems(units, body.workflow.records))
      diagnostics.push(
        diagnostic(result, "invalid-value", problem, {
          field: "units",
          expected: "unique, body-aligned acyclic route dependencies",
        }),
      );
  }
  return diagnostics.length === 0
    ? {
        _tag: "valid",
        artifact: contract.artifact,
        sourcePath: result.sourcePath,
        metadata: result.metadata,
        body,
        diagnostics: [],
      }
    : { _tag: "invalid", sourcePath: result.sourcePath, diagnostics };
};

export const validateArtifactContract = validateArtifact;
export const validateArtifactMetadata = validateArtifact;
