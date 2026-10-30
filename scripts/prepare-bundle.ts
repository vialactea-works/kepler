import * as Fs from "node:fs";
import * as Path from "node:path";
import {
  bundleManifestContentDigest,
  parseBundleManifest,
  sha256Digest,
  type BundleCompatibility,
  type BundleManifest,
  type ContentDigest,
} from "../packages/cli/src/cli/installation-record.js";

const projectRoot = Path.resolve(import.meta.dirname, "..");
const bundleRoot = Path.join(projectRoot, "bundle");
const skillIds = [
  "kepler-design",
  "kepler-quality",
  "kepler-plan",
  "kepler-orchestrate",
  "kepler-code",
  "kepler-code-feedback",
  "kepler-review",
  "kepler-finish-work",
  "kepler-grilling",
  "kepler-domain-modelling",
  "kepler-research",
] as const;
const standardSkills = new Set(skillIds.slice(0, 8));
const hostRoles = [
  ["architect", "kepler-architect"],
  ["orchestrator", "kepler-orchestrator"],
  ["coder", "kepler-coder"],
  ["reviewer", "kepler-reviewer"],
] as const;

function listBundleFiles(directory: string): string[] {
  return Fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => {
      if (left.name < right.name) return -1;
      if (left.name > right.name) return 1;
      return 0;
    })
    .flatMap((entry) => {
      const absolutePath = Path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Bundle resources must not be symlinks: ${absolutePath}`);
      }
      if (entry.isDirectory()) return listBundleFiles(absolutePath);
      if (!entry.isFile()) {
        throw new Error(`Bundle resources must be regular files: ${absolutePath}`);
      }
      const relativePath = Path.relative(bundleRoot, absolutePath).split(Path.sep).join("/");
      return relativePath === "manifest.json" ? [] : [relativePath];
    });
}

function syncSkillResources(): void {
  for (const id of skillIds) {
    const source = Path.join(projectRoot, "skills", id);
    const target = Path.join(bundleRoot, "skills", id);
    if (!Fs.existsSync(source) || !Fs.statSync(source).isDirectory()) {
      throw new Error(`Required skill source is missing: ${source}`);
    }
    Fs.rmSync(target, { recursive: true, force: true });
    Fs.mkdirSync(Path.dirname(target), { recursive: true });
    Fs.cpSync(source, target, { recursive: true, dereference: false });
  }
}

function requiredResourceDigest(path: string): ContentDigest {
  const absolutePath = Path.join(bundleRoot, ...path.split("/"));
  if (!Fs.existsSync(absolutePath) || !Fs.statSync(absolutePath).isFile()) {
    throw new Error(`Required bundle resource is missing: ${path}`);
  }
  return sha256Digest(Fs.readFileSync(absolutePath));
}

let rootPackage: { version?: unknown };
try {
  rootPackage = JSON.parse(
    Fs.readFileSync(Path.join(projectRoot, "package.json"), "utf8"),
  ) as { version?: unknown };
} catch (error) {
  throw new Error("Root package.json must be valid JSON.", { cause: error });
}
if (typeof rootPackage.version !== "string" || rootPackage.version.trim().length === 0) {
  throw new Error("Root package.json must declare the current CLI release.");
}

syncSkillResources();

const files = Object.fromEntries(
  listBundleFiles(bundleRoot).map((path) => [
    path,
    sha256Digest(Fs.readFileSync(Path.join(bundleRoot, ...path.split("/")))),
  ]),
);
const skillsRelease =
  process.env.KEPLER_SKILLS_RELEASE ?? "kepler-skills-3.0.0";
const hostBindingsRelease =
  process.env.KEPLER_CLAUDE_CODE_BINDINGS_RELEASE ??
  "claude-code-bindings-1.0.0";
const compatibility: BundleCompatibility = {
  cli_releases: [rootPackage.version],
  skills: skillIds.map((id) => ({
    id,
    release: skillsRelease,
    digest: requiredResourceDigest(`skills/${id}/SKILL.md`),
    required: standardSkills.has(id),
  })),
  host_bindings: hostRoles.map(([role, agentId]) => ({
    role,
    agent_id: agentId,
    release: hostBindingsRelease,
    digest: requiredResourceDigest(`agents/claude-code/v1/${agentId}.md`),
  })),
};
const base: BundleManifest = {
  manifest_format_version: 1,
  bundle_release: process.env.KEPLER_BUNDLE_RELEASE ?? "kepler-bundle-3.0.1",
  files,
  content_digest: sha256Digest(new Uint8Array()),
  compatibility,
};
const manifest: BundleManifest = {
  ...base,
  content_digest: bundleManifestContentDigest(base),
};
parseBundleManifest(JSON.stringify(manifest));
Fs.writeFileSync(
  Path.join(bundleRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
