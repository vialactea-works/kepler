export interface ReleaseVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export type ReleaseRequest = "patch" | "minor" | "major" | string;

export function parseReleaseVersion(value: string): ReleaseVersion {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid stable release version: ${value}`);
  }
  const components = match.slice(1).map(Number);
  if (components.some((component) => !Number.isSafeInteger(component))) {
    throw new Error(`Release version components must be safe integers: ${value}`);
  }
  const [major, minor, patch] = components;
  if (major === undefined || minor === undefined || patch === undefined) {
    throw new Error(`Invalid stable release version: ${value}`);
  }
  return { major, minor, patch };
}

export function deriveReleaseVersion(
  currentVersion: string,
  request: ReleaseRequest,
): string {
  const current = parseReleaseVersion(currentVersion);
  let target: ReleaseVersion;
  if (request === "patch") {
    target = { ...current, patch: increment(current.patch) };
  } else if (request === "minor") {
    target = { major: current.major, minor: increment(current.minor), patch: 0 };
  } else if (request === "major") {
    target = { major: increment(current.major), minor: 0, patch: 0 };
  } else {
    target = parseReleaseVersion(request);
  }
  if (compareReleaseVersions(target, current) < 0) {
    throw new Error(`Release version ${formatReleaseVersion(target)} must not be lower than ${currentVersion}`);
  }
  return formatReleaseVersion(target);
}

export function compareReleaseVersions(
  left: ReleaseVersion,
  right: ReleaseVersion,
): number {
  for (const key of ["major", "minor", "patch"] as const) {
    const difference = left[key] - right[key];
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

function increment(value: number): number {
  const next = value + 1;
  if (!Number.isSafeInteger(next)) {
    throw new Error("Release version increment exceeds safe integer range");
  }
  return next;
}

function formatReleaseVersion(version: ReleaseVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}
