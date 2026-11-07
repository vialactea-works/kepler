import {
  evaluateBundleCompatibility,
  parseBundleManifest,
  sha256Digest,
  type BundleCompatibilityDecision,
  type BundleManifest,
  type ContentDigest,
} from "./installation-record.js";

export interface SetupBundleFile {
  readonly path: string;
  readonly contents: Uint8Array;
  readonly digest: ContentDigest;
}

export interface SetupBundleSnapshot {
  readonly manifest: string;
  readonly files: readonly {
    readonly path: string;
    readonly contents: Uint8Array;
  }[];
}

export interface ValidatedSetupBundle {
  readonly manifest: BundleManifest;
  readonly compatibility: BundleCompatibilityDecision;
  readonly files: readonly SetupBundleFile[];
}

export class SetupBundleError extends Error {
  constructor(
    readonly code: "invalid_bundle" | "bundle_incompatible",
    message: string,
  ) {
    super(message);
    this.name = "SetupBundleError";
  }
}

const requiredConstructionTemplatePaths = [
  "templates/v3/construction/unit-of-work.md",
  "templates/v3/construction/design.md",
  "templates/v3/construction/quality.md",
  "templates/v3/construction/plan.md",
  "templates/v3/construction/delivery.md",
  "templates/v3/construction/supporting-document.md",
];

export function validateSetupBundle(
  snapshot: SetupBundleSnapshot,
  cliRelease: string,
): ValidatedSetupBundle {
  const manifest = parseBundleManifest(snapshot.manifest);
  const files = new Map<string, SetupBundleFile>();

  for (const file of snapshot.files) {
    if (!isNormalizedRelativePath(file.path) || file.path === "manifest.json") {
      throw new SetupBundleError(
        "invalid_bundle",
        `Bundle file path is not a normalized relative path: ${file.path}`,
      );
    }
    if (files.has(file.path)) {
      throw new SetupBundleError("invalid_bundle", `Duplicate bundle file: ${file.path}`);
    }
    files.set(file.path, {
      path: file.path,
      contents: file.contents,
      digest: sha256Digest(file.contents),
    });
  }

  for (const [path, expectedDigest] of Object.entries(manifest.files)) {
    const file = files.get(path);
    if (!file) throw new SetupBundleError("invalid_bundle", `Missing bundle file: ${path}`);
    if (file.digest !== expectedDigest) {
      throw new SetupBundleError("invalid_bundle", `Bundle file digest mismatch: ${path}`);
    }
  }

  for (const path of files.keys()) {
    if (manifest.files[path] === undefined) {
      throw new SetupBundleError("invalid_bundle", `Unexpected bundle file: ${path}`);
    }
  }

  const skillIds = new Set(
    manifest.compatibility.skills.map((skill) => skill.id),
  );
  for (const skill of manifest.compatibility.skills) {
    const path = `skills/${skill.id}/SKILL.md`;
    const file = files.get(path);
    if (!file) {
      throw new SetupBundleError("invalid_bundle", `Missing skill resource: ${path}`);
    }
    if (file.digest !== skill.digest) {
      throw new SetupBundleError(
        "invalid_bundle",
        `Skill resource digest mismatch: ${skill.id}`,
      );
    }
  }
  for (const path of files.keys()) {
    if (path.startsWith("skills/")) {
      const [, skillId] = path.split("/");
      if (!skillId || !skillIds.has(skillId)) {
        throw new SetupBundleError(
          "invalid_bundle",
          `Bundle contains an undeclared skill resource: ${path}`,
        );
      }
    }
  }

  const expectedAgentPaths = new Set(
    manifest.compatibility.host_bindings.map(
      (binding) => `agents/claude-code/v1/${binding.agent_id}.md`,
    ),
  );
  for (const binding of manifest.compatibility.host_bindings) {
    const path = `agents/claude-code/v1/${binding.agent_id}.md`;
    const file = files.get(path);
    if (!file) {
      throw new SetupBundleError(
        "invalid_bundle",
        `Missing native role definition: ${path}`,
      );
    }
    if (file.digest !== binding.digest) {
      throw new SetupBundleError(
        "invalid_bundle",
        `Native role definition digest mismatch: ${binding.role}`,
      );
    }
  }
  for (const path of files.keys()) {
    if (path.startsWith("agents/") && !expectedAgentPaths.has(path)) {
      throw new SetupBundleError(
        "invalid_bundle",
        `Bundle contains an undeclared native agent resource: ${path}`,
      );
    }
  }

  for (const path of requiredConstructionTemplatePaths) {
    if (!files.has(path)) {
      throw new SetupBundleError(
        "invalid_bundle",
        `Missing required v3 Construction template: ${path}`,
      );
    }
  }

  const hasGuidelines = [...files.keys()].some(
    (path) => path.startsWith("guidelines/") && !path.endsWith("/.gitkeep"),
  );
  if (!hasGuidelines) {
    throw new SetupBundleError(
      "invalid_bundle",
      "The selected bundle must include template and guideline resources.",
    );
  }

  const compatibility = evaluateBundleCompatibility(manifest, cliRelease);
  if (compatibility.check !== "compatible") {
    throw new SetupBundleError(
      "bundle_incompatible",
      `Selected bundle is ${compatibility.check} with CLI release ${cliRelease}`,
    );
  }

  return {
    manifest,
    compatibility,
    files: [...files.values()],
  };
}

function isNormalizedRelativePath(path: string): boolean {
  const segments = path.split("/");
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}
