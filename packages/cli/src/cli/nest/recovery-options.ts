import { parseScopeSelectors } from "../scope-selectors.js";
import { parseProjectSelector } from "../project-selection.js";

export interface RecoveryReadSelectors {
  readonly project: string;
  readonly mission: string;
}

export interface RecoveryReadOptionFailure {
  readonly kind: "failed";
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly recovery: string;
}

export type RecoveryReadOptionResult =
  | { readonly kind: "parsed"; readonly selectors: RecoveryReadSelectors }
  | RecoveryReadOptionFailure;

const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>>,
  recovery: string,
): RecoveryReadOptionFailure => ({
  kind: "failed",
  code,
  message,
  details,
  recovery,
});

export const parseRecoveryReadOptions = (
  options: Readonly<Record<string, unknown>>,
  passedParams: readonly string[] = [],
): RecoveryReadOptionResult => {
  if (passedParams.length > 0) {
    return failure(
      "invalid_arguments",
      "Recovery read commands do not accept positional arguments.",
      { count: passedParams.length },
      "Remove positional arguments and provide --project and --mission.",
    );
  }

  const unknown = Object.keys(options).filter((key) => key !== "project" && key !== "mission");
  if (unknown.length) return failure("invalid_selector", "Recovery read commands accept only project and mission selectors.", { selectors: unknown }, "Remove unsupported selectors and retry.");
  const project = parseProjectSelector(options.project);
  if (project.kind === "failed") return project;
  if (project.project === undefined) {
    return failure(
      "required_selector_missing",
      "Recovery inspection requires one explicit --project path.",
      { required: "project" },
      "Provide the Git working-tree root with --project and retry.",
    );
  }
  if (project.project.trim().length === 0) {
    return failure(
      "invalid_selector",
      "--project requires one non-empty path.",
      { selector: "project" },
      "Provide one non-empty --project path and retry.",
    );
  }

  const mission = parseScopeSelectors(options, {
    required: ["mission"],
    missionScoped: true,
  });
  if (mission.kind === "failed") {
    return failure(
      mission.code,
      mission.message,
      mission.details,
      "Provide one full lowercase mission UUIDv4 and retry.",
    );
  }

  return {
    kind: "parsed",
    selectors: {
      project: project.project,
      mission: mission.selectors.mission!,
    },
  };
};

