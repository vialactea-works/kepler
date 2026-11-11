import {
  parseScopeSelectors,
  type ScopeSelectorFailure,
} from "./scope-selectors.js";
import { parseProjectSelector } from "./project-selection.js";
import type { DiffPackageScope } from "../construction/diff-package-source.js";

export interface DiffPackageCommandRequest {
  readonly scope: DiffPackageScope;
  readonly project?: string;
  readonly out?: string;
}

export interface DiffPackageOptionsFailure {
  readonly kind: "failed";
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly recovery: string;
}

export type DiffPackageOptionsResult =
  | { readonly kind: "parsed"; readonly request: DiffPackageCommandRequest }
  | DiffPackageOptionsFailure;

const attemptPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const names = {
  unit: "--unit",
  task: "--task",
  implementationAttempt: "--implementation-attempt",
  generationAttempt: "--generation-attempt",
  integrationAttempt: "--integration-attempt",
  project: "--project",
  out: "--out",
} as const;

const failure = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recovery = "Correct the diff-package selectors and retry.",
): DiffPackageOptionsFailure => ({ kind: "failed", code, message, details, recovery });

const selectorFailure = (
  issue: ScopeSelectorFailure,
): DiffPackageOptionsFailure => ({
  ...issue,
  kind: "failed",
  recovery: "Provide the exact required selectors for this diff-package operation.",
});

const readOne = (
  options: Readonly<Record<string, unknown>>,
  key: string,
  required: boolean,
): string | DiffPackageOptionsFailure | undefined => {
  const raw = options[key];
  if (raw === undefined) {
    return required
      ? failure(
          "required_selector_missing",
          `${names[key as keyof typeof names]} is required.`,
          { required: [key] },
          `Provide one ${names[key as keyof typeof names]} value and retry.`,
        )
      : undefined;
  }
  const values = Array.isArray(raw) ? raw : [raw];
  if (values.length > 1) {
    return failure(
      "duplicate_selector",
      `${names[key as keyof typeof names]} may be specified only once.`,
      { selector: key },
      `Provide one ${names[key as keyof typeof names]} value and retry.`,
    );
  }
  const value = values[0];
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || value.includes("\0")) {
    return failure(
      "invalid_selector",
      `${names[key as keyof typeof names]} requires one non-empty exact value.`,
      { selector: key },
      `Provide one non-empty ${names[key as keyof typeof names]} value and retry.`,
    );
  }
  return value;
};

const allowedOptions = (
  kind: DiffPackageScope["kind"],
): ReadonlySet<string> => new Set([
  "unit",
  "implementationAttempt",
  "project",
  "out",
  ...(kind === "unit-review" ? [] : ["task"]),
  ...(kind === "validation" ? ["generationAttempt"] : []),
  ...(kind === "integration" ? ["integrationAttempt"] : []),
]);

export const parseDiffPackageOptions = (
  kind: DiffPackageScope["kind"],
  options: Readonly<Record<string, unknown>>,
): DiffPackageOptionsResult => {
  const allowed = allowedOptions(kind);
  const unsupported = Object.keys(options).find((key) => !allowed.has(key));
  if (unsupported !== undefined) {
    const flag = `--${unsupported.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    return failure(
      "invalid_selector",
      `${flag} is not accepted by the ${kind} diff-package command.`,
      { selector: unsupported, operation: kind },
      `Use only the selectors supported by git diff-package ${kind}.`,
    );
  }

  const required: ("unit" | "task" | "implementationAttempt")[] =
    kind === "unit-review"
      ? ["unit", "implementationAttempt"]
      : ["unit", "task", "implementationAttempt"];
  const parsedScope = parseScopeSelectors(options, { required });
  if (parsedScope.kind === "failed") return selectorFailure(parsedScope);

  let scope: DiffPackageScope;
  if (kind === "unit-review") {
    scope = {
      kind,
      unitId: parsedScope.selectors.unit as string,
      implementationAttemptId: parsedScope.selectors.implementationAttempt as string,
    };
  } else if (kind === "validation") {
    const generationAttempt = readOne(options, "generationAttempt", true);
    if (generationAttempt === undefined) {
      return failure("required_selector_missing", "--generation-attempt is required.", { required: ["generationAttempt"] }, "Provide one --generation-attempt value and retry.");
    }
    if (typeof generationAttempt !== "string") return generationAttempt;
    if (!attemptPattern.test(generationAttempt)) {
      return failure("invalid_identity", "--generation-attempt requires one UUIDv4 Activity attempt id.", { selector: "generationAttempt", value: generationAttempt });
    }
    scope = {
      kind,
      unitId: parsedScope.selectors.unit as string,
      taskId: parsedScope.selectors.task as string,
      implementationAttemptId: parsedScope.selectors.implementationAttempt as string,
      generationAttemptId: generationAttempt,
    };
  } else {
    const integrationAttempt = readOne(options, "integrationAttempt", true);
    if (integrationAttempt === undefined) {
      return failure("required_selector_missing", "--integration-attempt is required.", { required: ["integrationAttempt"] }, "Provide one --integration-attempt value and retry.");
    }
    if (typeof integrationAttempt !== "string") return integrationAttempt;
    if (!attemptPattern.test(integrationAttempt)) {
      return failure("invalid_identity", "--integration-attempt requires one UUIDv4 Activity attempt id.", { selector: "integrationAttempt", value: integrationAttempt });
    }
    scope = {
      kind,
      unitId: parsedScope.selectors.unit as string,
      taskId: parsedScope.selectors.task as string,
      implementationAttemptId: parsedScope.selectors.implementationAttempt as string,
      integrationAttemptId: integrationAttempt,
    };
  }

  const selectedProject = parseProjectSelector(options.project);
  if (selectedProject.kind === "failed") return selectedProject;
  const out = readOne(options, "out", false);
  if (typeof out !== "string" && out !== undefined) return out;

  return {
    kind: "parsed",
    request: {
      scope,
      ...(selectedProject.project === undefined ? {} : { project: selectedProject.project }),
      ...(out === undefined ? {} : { out }),
    },
  };
};
