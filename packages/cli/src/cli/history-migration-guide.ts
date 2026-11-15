import { parseDocument } from "yaml";
import { HistoryError } from "../history/control.js";
import { readBuildIdentity, validateBuildIdentityForRuntime } from "./build-identity.js";
import { resolvePackageRoot } from "./bundle-root.js";
import { validateTargetPackageRoot } from "./release-archive.js";
import { validateResourcePackage, type ResourcePackageSnapshot } from "./release-resources.js";
import { CLI_RELEASE } from "./version.js";

const path = "skills/kepler-lifecycle-migration/referenses/migrations/2026-11-13-mission-history-generations.md";
const version = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const available = (minimum: string, release: string): boolean => {
  if (!version.test(minimum) || !version.test(release)) return false;
  const left = minimum.split(".").map(Number);
  const right = release.split(".").map(Number);
  if (![...left, ...right].every(Number.isSafeInteger)) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index]! < right[index]!) return true;
    if (left[index]! > right[index]!) return false;
  }
  return true;
};

export const readReleasedHistoryMigrationGuide = (reference: string, snapshot: ResourcePackageSnapshot, release: string): Uint8Array => {
  if (reference !== `resource:${path}`) throw new HistoryError("history_migration_guide_unsupported", "Migration requires its supported lifecycle resource reference.");
  const resources = validateResourcePackage(snapshot, release);
  const file = resources.files.find((entry) => entry.path === path);
  if (!file) throw new HistoryError("history_migration_guide_missing", "The matched resource package has no history migration guide.");
  let metadata: unknown;
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(file.contents);
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatter) throw new Error("The guide has no YAML frontmatter");
    const parsed = parseDocument(frontmatter[1]!, { uniqueKeys: true, strict: true });
    if (parsed.errors.length) throw new Error("The guide frontmatter is invalid");
    metadata = parsed.toJS();
  } catch {
    throw new HistoryError("history_migration_guide_invalid", "The matched lifecycle guide has invalid metadata.");
  }
  const keys = ["migration_id", "status", "available_in", "source_layout", "target_layout"];
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || Object.keys(metadata).length !== keys.length || !keys.every((key) => Object.hasOwn(metadata, key))) throw new HistoryError("history_migration_guide_invalid", "The lifecycle guide metadata has unsupported fields.");
  const guide = metadata as Record<string, unknown>;
  if (guide.migration_id !== "2026-11-13-mission-history-generations" || guide.source_layout !== "mission-phase-journals" || guide.target_layout !== "mission-history-generations") throw new HistoryError("history_migration_guide_unsupported", "The lifecycle guide does not describe this supported format transition.");
  if (guide.status !== "released" || typeof guide.available_in !== "string" || !available(guide.available_in, release)) throw new HistoryError("history_migration_guide_unreleased", "The lifecycle guide is planned or unavailable in the executing release. No migration is authorized by that guide.");
  return new Uint8Array(file.contents);
};

export const createNodeHistoryMigrationGuideReader = (): ((reference: string) => Promise<Uint8Array>) => async (reference) => {
  try {
    const identity = readBuildIdentity();
    if (!identity) throw new HistoryError("history_migration_package_unverified", "Migration requires an executing CLI with a matched package build identity.");
    validateBuildIdentityForRuntime(identity, { release: CLI_RELEASE, platform: process.platform, arch: process.arch });
    if (identity.source.kind === "production" && Object.hasOwn(process.env, "KEPLER_PACKAGE_ROOT")) throw new HistoryError("history_migration_package_unverified", "A production binary cannot select a package-root override.");
    const candidate = validateTargetPackageRoot(resolvePackageRoot(), { expectedIdentity: identity, modePolicy: "runtime" });
    const manifest = candidate.files.find((entry) => entry.path === "bundle/manifest.json");
    if (!manifest) throw new HistoryError("history_migration_guide_missing", "The matched package has no resource manifest.");
    const files = candidate.files.filter((entry) => entry.path.startsWith("bundle/") && entry.path !== "bundle/manifest.json").map((entry) => ({ path: entry.path.slice("bundle/".length), contents: entry.contents }));
    return readReleasedHistoryMigrationGuide(reference, { manifest: new TextDecoder("utf-8", { fatal: true }).decode(manifest.contents), files }, CLI_RELEASE);
  } catch (error) {
    if (error instanceof HistoryError) throw error;
    throw new HistoryError("history_migration_package_unverified", error instanceof Error ? error.message : "The matched lifecycle resource package could not be verified.");
  }
};
