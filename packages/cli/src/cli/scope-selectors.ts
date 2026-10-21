export const constructionStages = [
  "functional-design",
  "quality-requirements",
  "implementation-planning",
  "implementation",
  "unit-of-work-review",
  "deliver",
] as const;

export const constructionActivities = [
  "code-generation",
  "code-validation",
  "code-integration",
] as const;

export type ConstructionStage = (typeof constructionStages)[number];
export type ConstructionActivity = (typeof constructionActivities)[number];

export interface ScopeSelectors {
  readonly unit?: string;
  readonly stage?: ConstructionStage;
  readonly task?: string;
  readonly activity?: ConstructionActivity;
  readonly attempt?: string;
  readonly implementationAttempt?: string;
  readonly mission?: string;
}

export interface ScopeSelectorFailure {
  readonly kind: "failed";
  readonly code:
    | "invalid_selector"
    | "duplicate_selector"
    | "invalid_stage"
    | "invalid_activity"
    | "invalid_identity"
    | "mission_scope_not_allowed"
    | "unit_and_mission_conflict"
    | "required_selector_missing"
    | "scope_not_found"
    | "scope_mismatch";
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export type ScopeSelectorParseResult =
  | { readonly kind: "parsed"; readonly selectors: ScopeSelectors }
  | ScopeSelectorFailure;

export type ScopeSelectorValidationResult =
  | { readonly kind: "valid"; readonly selectors: ScopeSelectors }
  | ScopeSelectorFailure;

export interface ScopeOwnership {
  readonly unit?: { readonly id: string };
  readonly mission?: { readonly id: string };
  readonly task?: { readonly id: string; readonly unitId: string };
  readonly stage?: {
    readonly name: ConstructionStage;
    readonly unitId: string;
  };
  readonly implementationAttempt?: {
    readonly id: string;
    readonly unitId: string;
    readonly taskId?: string;
  };
  readonly activity?: {
    readonly name: ConstructionActivity;
    readonly unitId: string;
    readonly taskId: string;
    readonly implementationAttemptId: string;
  };
  readonly attempt?: {
    readonly id: string;
    readonly unitId: string;
    readonly taskId?: string;
    readonly stage?: ConstructionStage;
    readonly activity?: ConstructionActivity;
    readonly implementationAttemptId?: string;
  };
}

export interface ScopeSelectorOptions {
  readonly missionScoped?: boolean;
  readonly existingAttemptMutation?: boolean;
  readonly required?: readonly (keyof ScopeSelectors)[];
}

const selectorOptions = [
  ["unit", "unit"],
  ["stage", "stage"],
  ["task", "task"],
  ["activity", "activity"],
  ["attempt", "attempt"],
  ["implementationAttempt", "implementationAttempt"],
  ["mission", "mission"],
] as const;

const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const failed = (
  code: ScopeSelectorFailure["code"],
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): ScopeSelectorFailure => ({ kind: "failed", code, message, details });

export const appendSelectorValue = (
  value: string,
  previous: readonly string[] = [],
): string[] => [...previous, value];

const selectedValue = (
  options: Readonly<Record<string, unknown>>,
  optionName: string,
): { readonly kind: "absent" } | { readonly kind: "value"; readonly value: string } | ScopeSelectorFailure => {
  const raw = options[optionName];
  if (raw === undefined) return { kind: "absent" };
  const values = Array.isArray(raw) ? raw : [raw];
  if (values.length > 1) {
    return failed(
      "duplicate_selector",
      `--${optionName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} may be specified only once.`,
      { selector: optionName },
    );
  }
  const value = values[0];
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return failed(
      "invalid_selector",
      `--${optionName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} requires one non-empty exact value.`,
      { selector: optionName },
    );
  }
  return { kind: "value", value };
};

export const parseScopeSelectors = (
  options: Readonly<Record<string, unknown>>,
  settings: ScopeSelectorOptions = {},
): ScopeSelectorParseResult => {
  const selectors: Record<string, string> = {};
  for (const [optionName, selectorName] of selectorOptions) {
    const selected = selectedValue(options, optionName);
    if (selected.kind === "failed") return selected;
    if (selected.kind === "absent") continue;
    if (
      ["task", "attempt", "implementationAttempt", "mission"].includes(
        selectorName,
      ) && !uuidV4Pattern.test(selected.value)
    ) {
      return failed(
        "invalid_identity",
        `--${optionName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} requires a full lowercase UUIDv4.`,
        { selector: optionName },
      );
    }
    selectors[selectorName] = selected.value;
  }

  if (
    selectors.stage !== undefined &&
    !constructionStages.includes(selectors.stage as ConstructionStage)
  ) {
    return failed("invalid_stage", "--stage is not a supported Construction stage.", {
      stage: selectors.stage,
    });
  }
  if (
    selectors.activity !== undefined &&
    !constructionActivities.includes(selectors.activity as ConstructionActivity)
  ) {
    return failed(
      "invalid_activity",
      "--activity is not a supported Construction Activity.",
      { activity: selectors.activity },
    );
  }
  if (selectors.mission !== undefined && !settings.missionScoped) {
    return failed(
      "mission_scope_not_allowed",
      "--mission is valid only for mission-scoped operations without unit context.",
      { selector: "mission" },
    );
  }
  if (selectors.mission !== undefined && selectors.unit !== undefined) {
    return failed(
      "unit_and_mission_conflict",
      "--mission cannot be combined with --unit.",
      { selectors: ["mission", "unit"] },
    );
  }
  if (selectors.stage !== undefined && selectors.unit === undefined) {
    return failed(
      "required_selector_missing",
      "--stage requires --unit.",
      { required: "unit" },
    );
  }
  if (selectors.task !== undefined && selectors.unit === undefined) {
    return failed(
      "required_selector_missing",
      "--task requires --unit.",
      { required: "unit" },
    );
  }
  if (
    selectors.implementationAttempt !== undefined &&
    (selectors.unit === undefined || selectors.task === undefined)
  ) {
    return failed(
      "required_selector_missing",
      "--implementation-attempt requires --unit and --task.",
      { required: ["unit", "task"] },
    );
  }
  if (
    selectors.activity !== undefined &&
    (selectors.unit === undefined ||
      selectors.task === undefined ||
      selectors.implementationAttempt === undefined)
  ) {
    return failed(
      "required_selector_missing",
      "--activity requires --unit, --task, and --implementation-attempt.",
      { required: ["unit", "task", "implementationAttempt"] },
    );
  }
  if (
    selectors.attempt !== undefined &&
    selectors.unit === undefined
  ) {
    return failed(
      "required_selector_missing",
      "--attempt requires --unit.",
      { required: "unit" },
    );
  }
  for (const required of settings.required ?? []) {
    if (selectors[required] === undefined) {
      return failed(
        "required_selector_missing",
        `--${required.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required for this operation.`,
        { required },
      );
    }
  }
  if (
    settings.existingAttemptMutation &&
    (selectors.stage !== undefined || selectors.activity !== undefined) &&
    selectors.attempt === undefined
  ) {
    return failed(
      "required_selector_missing",
      "Mutating an existing stage or Activity attempt requires --attempt.",
      { required: "attempt" },
    );
  }

  return { kind: "parsed", selectors: selectors as ScopeSelectors };
};

const ownershipFailure = (
  code: "scope_not_found" | "scope_mismatch",
  selector: string,
  expected: string,
  actual?: string,
): ScopeSelectorFailure =>
  failed(
    code,
    code === "scope_not_found"
      ? `The selected ${selector} was not found.`
      : `The selected ${selector} does not belong to the requested scope.`,
    actual === undefined
      ? { selector, expected }
      : { selector, expected, actual },
  );

const checkOwnership = (
  selector: string,
  expected: string,
  actual: string | undefined,
): ScopeSelectorFailure | undefined =>
  actual === undefined
    ? ownershipFailure("scope_not_found", selector, expected)
    : actual !== expected
      ? ownershipFailure("scope_mismatch", selector, expected, actual)
      : undefined;

export const validateScopeOwnership = (
  selectors: ScopeSelectors,
  ownership: ScopeOwnership,
): ScopeSelectorValidationResult => {
  if (selectors.unit !== undefined) {
    const failure = checkOwnership("unit", selectors.unit, ownership.unit?.id);
    if (failure) return failure;
  }
  if (selectors.mission !== undefined) {
    const failure = checkOwnership(
      "mission",
      selectors.mission,
      ownership.mission?.id,
    );
    if (failure) return failure;
  }
  if (selectors.task !== undefined) {
    if (selectors.unit === undefined) {
      return failed("required_selector_missing", "--task requires --unit.", {
        required: "unit",
      });
    }
    const failure =
      checkOwnership("task", selectors.task, ownership.task?.id) ??
      checkOwnership("task unit", selectors.unit, ownership.task?.unitId);
    if (failure) return failure;
  }
  if (selectors.stage !== undefined) {
    if (selectors.unit === undefined) {
      return failed("required_selector_missing", "--stage requires --unit.", {
        required: "unit",
      });
    }
    const failure =
      checkOwnership("stage", selectors.stage, ownership.stage?.name) ??
      checkOwnership("stage unit", selectors.unit, ownership.stage?.unitId);
    if (failure) return failure;
  }
  if (selectors.implementationAttempt !== undefined) {
    const failure =
      checkOwnership(
        "Implementation attempt",
        selectors.implementationAttempt,
        ownership.implementationAttempt?.id,
      ) ??
      checkOwnership(
        "Implementation attempt unit",
        selectors.unit ?? "",
        ownership.implementationAttempt?.unitId,
      ) ??
      (selectors.task === undefined
        ? undefined
        : checkOwnership(
            "Implementation attempt task",
            selectors.task,
            ownership.implementationAttempt?.taskId,
          ));
    if (failure) return failure;
  }
  if (selectors.activity !== undefined) {
    const failure =
      checkOwnership("Activity", selectors.activity, ownership.activity?.name) ??
      checkOwnership("Activity unit", selectors.unit ?? "", ownership.activity?.unitId) ??
      checkOwnership("Activity task", selectors.task ?? "", ownership.activity?.taskId) ??
      checkOwnership(
        "Activity Implementation attempt",
        selectors.implementationAttempt ?? "",
        ownership.activity?.implementationAttemptId,
      );
    if (failure) return failure;
  }
  if (selectors.attempt !== undefined) {
    const selectedAttempt = ownership.attempt;
    const failure =
      checkOwnership("attempt", selectors.attempt, selectedAttempt?.id) ??
      checkOwnership("attempt unit", selectors.unit ?? "", selectedAttempt?.unitId) ??
      (selectors.task === undefined
        ? undefined
        : checkOwnership("attempt task", selectors.task, selectedAttempt?.taskId)) ??
      (selectors.stage === undefined
        ? undefined
        : checkOwnership("attempt stage", selectors.stage, selectedAttempt?.stage)) ??
      (selectors.activity === undefined
        ? undefined
        : checkOwnership("attempt Activity", selectors.activity, selectedAttempt?.activity)) ??
      (selectors.implementationAttempt === undefined
        ? undefined
        : checkOwnership(
            "attempt Implementation parent",
            selectors.implementationAttempt,
            selectedAttempt?.implementationAttemptId,
          ));
    if (failure) return failure;
  }

  return { kind: "valid", selectors };
};
