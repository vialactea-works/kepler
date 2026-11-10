import { execFileSync } from "node:child_process";
import * as Fs from "node:fs";
import * as Path from "node:path";
import {
  sha256Digest,
  type ContentDigest,
} from "../packages/cli/src/cli/installation-record.js";
import { parseReleaseVersion } from "./release-version.js";

export type SourceKind = "production" | "development";

export interface SourceFileInput {
  readonly path: string;
  readonly contents: Uint8Array;
  readonly executable?: boolean;
}

export interface SourceIdentity {
  readonly kind: SourceKind;
  readonly commit: string;
  readonly content_digest: ContentDigest;
}

export interface SourceSnapshot {
  readonly identity: SourceIdentity;
  readonly files: readonly SourceFileInput[];
}

export interface BuildTarget {
  readonly os: "linux" | "darwin";
  readonly arch: "x64" | "arm64";
}

export interface BuildIdentity {
  readonly format_version: 1;
  readonly kepler_release: string;
  readonly source: SourceIdentity;
  readonly target: BuildTarget;
  readonly resource_digest: ContentDigest;
}

export function sourceContentDigest(files: readonly SourceFileInput[]): ContentDigest {
  const seen = new Set<string>();
  const entries = files.map((file) => {
    if (!isNormalizedRelativePath(file.path)) {
      throw new Error(`Source identity path is not normalized and relative: ${file.path}`);
    }
    if (seen.has(file.path)) throw new Error(`Duplicate source identity path: ${file.path}`);
    seen.add(file.path);
    return {
      path: file.path,
      executable: file.executable === true,
      digest: sha256Digest(file.contents),
    };
  });
  entries.sort((left, right) => compareStrings(left.path, right.path));
  return sha256Digest(JSON.stringify(entries));
}

export function createSourceIdentity(input: {
  readonly commit: string;
  readonly clean: boolean;
  readonly files: readonly SourceFileInput[];
}): SourceIdentity {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(input.commit)) {
    throw new Error(`Invalid full source commit: ${input.commit}`);
  }
  return {
    kind: input.clean ? "production" : "development",
    commit: input.commit,
    content_digest: sourceContentDigest(input.files),
  };
}

export function createDevelopmentSourceIdentity(source: SourceIdentity): SourceIdentity {
  return {
    kind: "development",
    commit: source.commit,
    content_digest: source.content_digest,
  };
}

export function readSourceIdentity(repositoryRoot: string): SourceIdentity {
  return readSourceSnapshot(repositoryRoot).identity;
}

export function readSourceSnapshot(repositoryRoot: string): SourceSnapshot {
  const root = Path.resolve(repositoryRoot);
  const requestedRoot = Fs.realpathSync(root);
  const gitRoot = Fs.realpathSync(
    runGit(root, ["rev-parse", "--show-toplevel"]).trim(),
  );
  if (gitRoot !== requestedRoot) {
    throw new Error(
      `Git repository root does not match the requested source root: ${repositoryRoot}`,
    );
  }
  const commit = runGit(root, ["rev-parse", "HEAD"]).trim();
  const status = runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const fileNames = runGit(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter((path) => path.length > 0)
    .filter((path) => !isGeneratedPath(path));
  const files: SourceFileInput[] = [];
  for (const relativePath of fileNames) {
    const absolutePath = Path.join(root, relativePath);
    let stat: Fs.Stats;
    try {
      stat = Fs.lstatSync(absolutePath);
    } catch (error) {
      if (isMissingPath(error)) continue;
      throw new Error(`Could not inspect source identity input ${relativePath}: ${String(error)}`);
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Source identity inputs must be regular files: ${relativePath}`);
    }
    files.push({
      path: relativePath.split(Path.sep).join("/"),
      contents: new Uint8Array(Fs.readFileSync(absolutePath)),
      executable: (stat.mode & 0o111) !== 0,
    });
  }
  return {
    identity: createSourceIdentity({ commit, clean: status.length === 0, files }),
    files,
  };
}

export function createBuildIdentity(
  keplerRelease: string,
  source: SourceIdentity,
  resourceDigest: ContentDigest,
  target: BuildTarget,
): BuildIdentity {
  parseReleaseVersion(keplerRelease);
  if (!/^sha256:[a-f0-9]{64}$/.test(resourceDigest)) {
    throw new Error("Resource identity must be a SHA-256 digest");
  }
  if (!isSupportedTarget(target)) {
    throw new Error(`Unsupported Kepler build target: ${target.os}/${target.arch}`);
  }
  return {
    format_version: 1,
    kepler_release: keplerRelease,
    source: { ...source },
    target: { ...target },
    resource_digest: resourceDigest,
  };
}

export function buildIdentityDigest(identity: BuildIdentity): ContentDigest {
  return sha256Digest(JSON.stringify(identity));
}

export function serializeBuildIdentity(identity: BuildIdentity): string {
  const normalized = createBuildIdentity(
    identity.kepler_release,
    identity.source,
    identity.resource_digest,
    identity.target,
  );
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

function runGit(repositoryRoot: string, arguments_: readonly string[]): string {
  try {
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_OPTIONAL_LOCKS: "0",
    };
    for (const key of Object.keys(environment)) {
      if (
        key.startsWith("GIT_") &&
        !["GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_NOSYSTEM", "GIT_OPTIONAL_LOCKS"].includes(key)
      ) {
        delete environment[key];
      }
    }
    return execFileSync("git", [...arguments_], {
      cwd: repositoryRoot,
      env: environment,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`Could not read Git source identity: ${String(error)}`);
  }
}

const generatedFiles = new Set([
  "bundle/manifest.json",
  "bundle/pi-package.json",
]);
const generatedDirectories = [
  "node_modules/",
  "packages/cli/node_modules/",
  "packages/core/node_modules/",
  "dist/",
  "packages/cli/dist/",
  "packages/core/dist/",
  "coverage/",
  "packages/cli/coverage/",
  "packages/core/coverage/",
  ".cache/",
  "packages/cli/.cache/",
  "packages/core/.cache/",
  ".vitest/",
  "packages/cli/.vitest/",
  "packages/core/.vitest/",
];

function isGeneratedPath(path: string): boolean {
  const normalized = path.split(/[\\/]/).join("/");
  return (
    generatedFiles.has(normalized) ||
    normalized.startsWith("bundle/skills/") ||
    generatedDirectories.some((directory) => normalized.startsWith(directory))
  );
}

function isNormalizedRelativePath(path: string): boolean {
  const segments = path.split("/");
  return (
    path.length > 0 &&
    !Path.isAbsolute(path) &&
    !Path.win32.isAbsolute(path) &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}

function isSupportedTarget(target: BuildTarget): boolean {
  return (
    (target.os === "linux" || target.os === "darwin") &&
    (target.arch === "x64" || target.arch === "arm64")
  );
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
