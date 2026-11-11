import { sha256Digest, type ContentDigest } from "./content-digest.js";
import { parseMetadataJsonObject } from "./metadata-json.js";

export interface RuntimeBuildIdentity {
  readonly format_version: 1;
  readonly kepler_release: string;
  readonly source: {
    readonly kind: "production" | "development";
    readonly commit: string;
    readonly content_digest: ContentDigest;
  };
  readonly target: {
    readonly os: "linux" | "darwin";
    readonly arch: "x64" | "arm64";
  };
  readonly resource_digest: ContentDigest;
}

export interface BuildArtifactIdentityRecord {
  readonly format_version: 1;
  readonly binary_digest: ContentDigest;
  readonly identity: RuntimeBuildIdentity;
}

const COMPILED_BUILD_IDENTITY_MARKER: string | undefined = undefined;

export class BuildIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildIdentityError";
  }
}

export function readBuildIdentity(
  _environment: NodeJS.ProcessEnv = process.env,
): RuntimeBuildIdentity | undefined {
  void _environment;
  if (COMPILED_BUILD_IDENTITY_MARKER === undefined) return undefined;
  return parseEmbeddedIdentity(COMPILED_BUILD_IDENTITY_MARKER);
}

export function readEmbeddedBuildIdentity(binary: Uint8Array): RuntimeBuildIdentity {
  const contents = Buffer.from(binary).toString("latin1");
  const matches = [...contents.matchAll(/KEPLER_BUILD_IDENTITY_BEGIN:([A-Za-z0-9+/]+={0,2}):KEPLER_BUILD_IDENTITY_END/g)];
  if (matches.length !== 1 || !matches[0]?.[1]) {
    throw new BuildIdentityError("Binary does not contain exactly one compiled Kepler build identity");
  }
  return parseEmbeddedIdentity(matches[0][0]);
}

export function buildIdentityDigest(identity: RuntimeBuildIdentity): ContentDigest {
  const normalized = parseBuildIdentity(JSON.stringify(identity));
  return sha256Digest(JSON.stringify(normalized));
}

export function encodeBuildIdentityMarker(identity: RuntimeBuildIdentity): string {
  const normalized = parseBuildIdentity(JSON.stringify(identity));
  const encoded = Buffer.from(JSON.stringify(normalized), "utf8").toString("base64");
  return `KEPLER_BUILD_IDENTITY_BEGIN:${encoded}:KEPLER_BUILD_IDENTITY_END`;
}

function parseEmbeddedIdentity(marker: string): RuntimeBuildIdentity {
  const match = /^KEPLER_BUILD_IDENTITY_BEGIN:([A-Za-z0-9+/]+={0,2}):KEPLER_BUILD_IDENTITY_END$/.exec(marker);
  if (!match?.[1]) throw new BuildIdentityError("Compiled Kepler build identity marker is malformed");
  const decoded = Buffer.from(match[1], "base64");
  if (decoded.toString("base64") !== match[1]) {
    throw new BuildIdentityError("Compiled Kepler build identity encoding is invalid");
  }
  return parseBuildIdentity(decoded.toString("utf8"));
}

export function parseBuildArtifactIdentity(content: string): BuildArtifactIdentityRecord {
  let value: Record<string, unknown>;
  try {
    value = parseMetadataJsonObject(content, "build artifact identity");
  } catch (error) {
    throw new BuildIdentityError(errorMessage(error));
  }
  assertClosedKeys(value, ["format_version", "binary_digest", "identity"], "build artifact identity");
  if (value.format_version !== 1) throw new BuildIdentityError("Unsupported build artifact identity format");
  if (!isDigest(value.binary_digest)) throw new BuildIdentityError("Build artifact binary digest is invalid");
  return {
    format_version: 1,
    binary_digest: value.binary_digest,
    identity: parseBuildIdentity(JSON.stringify(value.identity)),
  };
}

export function parseBuildIdentity(content: string): RuntimeBuildIdentity {
  let value: Record<string, unknown>;
  try {
    value = parseMetadataJsonObject(content, "build identity");
  } catch (error) {
    throw new BuildIdentityError(errorMessage(error));
  }
  assertClosedKeys(value, [
    "format_version",
    "kepler_release",
    "source",
    "target",
    "resource_digest",
  ], "build identity");
  if (value.format_version !== 1) {
    throw new BuildIdentityError(`Unsupported build identity format: ${String(value.format_version)}`);
  }
  if (typeof value.kepler_release !== "string" || !isStableVersion(value.kepler_release)) {
    throw new BuildIdentityError("Build identity has an invalid Kepler release");
  }
  if (!isDigest(value.resource_digest)) {
    throw new BuildIdentityError("Build identity has an invalid resource digest");
  }
  const source = asObject(value.source);
  const target = asObject(value.target);
  if (!source || !target) throw new BuildIdentityError("Build identity source or target is invalid");
  assertClosedKeys(source, ["kind", "commit", "content_digest"], "build identity source");
  assertClosedKeys(target, ["os", "arch"], "build identity target");
  if (source.kind !== "production" && source.kind !== "development") {
    throw new BuildIdentityError("Build identity source kind is invalid");
  }
  if (
    typeof source.commit !== "string" ||
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(source.commit)
  ) {
    throw new BuildIdentityError("Build identity source commit is invalid");
  }
  if (!isDigest(source.content_digest)) {
    throw new BuildIdentityError("Build identity source digest is invalid");
  }
  if (
    (target.os !== "linux" && target.os !== "darwin") ||
    (target.arch !== "x64" && target.arch !== "arm64")
  ) {
    throw new BuildIdentityError("Build identity target is unsupported");
  }
  return {
    format_version: 1,
    kepler_release: value.kepler_release,
    source: {
      kind: source.kind,
      commit: source.commit,
      content_digest: source.content_digest,
    },
    target: { os: target.os, arch: target.arch },
    resource_digest: value.resource_digest,
  };
}

export function validateBuildIdentityForRuntime(
  identity: RuntimeBuildIdentity,
  input: {
    readonly release: string;
    readonly platform: NodeJS.Platform;
    readonly arch: string;
  },
): void {
  if (identity.kepler_release !== input.release) {
    throw new BuildIdentityError(
      `Build identity release ${identity.kepler_release} does not match CLI release ${input.release}`,
    );
  }
  const runtimeTarget = {
    os: input.platform === "win32" ? "windows" : input.platform === "darwin" ? "darwin" : input.platform,
    arch: input.arch === "x64" || input.arch === "arm64" ? input.arch : "unsupported",
  };
  if (identity.target.os !== runtimeTarget.os || identity.target.arch !== runtimeTarget.arch) {
    throw new BuildIdentityError(
      `Build identity target ${identity.target.os}/${identity.target.arch} does not match runtime ${runtimeTarget.os}/${runtimeTarget.arch}`,
    );
  }
}

function isStableVersion(value: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) &&
    value.split(".").every((component) => Number.isSafeInteger(Number(component)));
}

function isDigest(value: unknown): value is ContentDigest {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function assertClosedKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  description: string,
): void {
  const keys = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (
    keys.length !== allowed.length ||
    keys.some((key, index) => key !== allowed[index])
  ) {
    throw new BuildIdentityError(`${description} contains missing or unsupported fields`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
