import { createHash } from "node:crypto";
import * as Path from "node:path";
import {
  HOME_RESOURCE_PREFIXES,
  validateResourcePackage,
  type ResourcePackageSnapshot,
} from "./release-resources.js";
import type { ContentDigest } from "./content-digest.js";

export const HOME_INITIALIZATION_MARKER_PREFIX = ".kepler-home-initializing-";

export interface HomeInitializationFiles {
  readBundle(): ResourcePackageSnapshot;
  createHome(): "created" | "exists";
  listFiles(): readonly string[];
  listInitializationMarkers(): readonly string[];
  createInitializationMarker(name: string): void;
  removeInitializationMarker(name: string): void;
  cleanupInitializationTemporaries(): void;
  readFile(relativePath: string): Uint8Array | undefined;
  writeFile(relativePath: string, contents: Uint8Array): void;
  completeInitialization(pendingMetadata: Uint8Array, readyMetadata: Uint8Array): void;
}

export interface HomeInitializationResult {
  readonly home: string;
  readonly release: string;
  readonly status: "initialized" | "unchanged";
}

export class HomeInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HomeInitializationError";
  }
}

interface HomeMetadata {
  readonly format_version: 1;
  readonly release: string;
  readonly resource_digest: ContentDigest;
}

interface PendingHomeMetadata extends HomeMetadata {
  readonly status: "initializing";
}

export function initializeHome(
  home: string,
  release: string,
  files: HomeInitializationFiles,
  settings: string,
): HomeInitializationResult {
  if (!Path.isAbsolute(home) || home.includes("\0")) {
    throw new HomeInitializationError("KEPLER_HOME must be an absolute path.");
  }
  const resources = validateResourcePackage(files.readBundle(), release);
  const resolvedHome = Path.resolve(home);
  files.createHome();
  const pendingMetadata = encodeMetadata({
    format_version: 1,
    status: "initializing",
    release,
    resource_digest: resources.manifest.resource_digest,
  });
  const marker = initializationMarkerName(release, resources.manifest.resource_digest);
  const markers = files.listInitializationMarkers();
  const metadataBytes = files.readFile("home-metadata.json");

  if (metadataBytes) {
    const metadata = parseMetadata(metadataBytes);
    if (metadata.status === "ready") {
      if (metadata.value.release !== release) {
        throw new HomeInitializationError(
          "Existing Kepler home belongs to a different release; preserve its contents.",
        );
      }
      const completedMarker = initializationMarkerName(metadata.value.release, metadata.value.resource_digest);
      if (markers.includes(completedMarker)) {
        files.cleanupInitializationTemporaries();
        files.removeInitializationMarker(completedMarker);
      }
      return { home: resolvedHome, release, status: "unchanged" };
    }
    if (metadata.value.release !== release || metadata.value.resource_digest !== resources.manifest.resource_digest) {
      throw new HomeInitializationError(
        "Existing Kepler home initialization is incompatible with this release; preserve its contents.",
      );
    }
    if (markers.some((name) => name !== marker)) {
      throw new HomeInitializationError(
        "Existing Kepler home has an incompatible initialization marker; preserve its contents.",
      );
    }
    files.createInitializationMarker(marker);
    files.cleanupInitializationTemporaries();
  } else {
    if (markers.some((name) => name !== marker)) {
      throw new HomeInitializationError(
        "Existing Kepler home has an incompatible initialization marker; preserve its contents.",
      );
    }
    const existingFiles = files.listFiles();
    if (markers.length === 0 && existingFiles.length > 0) {
      throw new HomeInitializationError(
        "Existing Kepler home has no compatible metadata; preserve its contents.",
      );
    }
    files.createInitializationMarker(marker);
    files.cleanupInitializationTemporaries();
    if (files.listFiles().length > 0) {
      throw new HomeInitializationError(
        "Existing Kepler home has no compatible metadata; preserve its contents.",
      );
    }
    files.writeFile("home-metadata.json", pendingMetadata);
  }
  for (const file of resources.files) {
    if (isHomeResource(file.path)) files.writeFile(file.path, file.contents);
  }
  files.writeFile("settings.yaml", new TextEncoder().encode(settings));
  const readyMetadata = encodeMetadata({
    format_version: 1,
    release,
    resource_digest: resources.manifest.resource_digest,
  });
  files.completeInitialization(pendingMetadata, readyMetadata);
  files.removeInitializationMarker(marker);
  return { home: resolvedHome, release, status: "initialized" };
}

function isHomeResource(path: string): boolean {
  return HOME_RESOURCE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function initializationMarkerName(release: string, digest: ContentDigest): string {
  const identity = createHash("sha256").update(`${release}\0${digest}`).digest("hex");
  return `${HOME_INITIALIZATION_MARKER_PREFIX}${identity}`;
}


function encodeMetadata(metadata: HomeMetadata | PendingHomeMetadata): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(metadata, null, 2)}\n`);
}

function parseMetadata(
  contents: Uint8Array,
): { readonly status: "ready"; readonly value: HomeMetadata } | { readonly status: "initializing"; readonly value: PendingHomeMetadata } {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(contents)) as unknown;
  } catch (error) {
    throw new HomeInitializationError(
      `Existing Kepler home has missing or invalid metadata; preserve its contents: ${String(error)}`,
    );
  }
  if (!isRecord(value)) {
    throw new HomeInitializationError("Existing Kepler home metadata is incompatible; preserve its contents.");
  }
  if (value.status === "initializing") {
    if (!hasExactKeys(value, ["format_version", "status", "release", "resource_digest"]) ||
        value.format_version !== 1 || typeof value.release !== "string" || !isDigest(value.resource_digest)) {
      throw new HomeInitializationError("Existing Kepler home initialization metadata is incompatible; preserve its contents.");
    }
    return {
      status: "initializing",
      value: {
        format_version: 1,
        status: "initializing",
        release: value.release,
        resource_digest: value.resource_digest,
      },
    };
  }
  if (!hasExactKeys(value, ["format_version", "release", "resource_digest"]) ||
      value.format_version !== 1 || typeof value.release !== "string" || !isDigest(value.resource_digest)) {
    throw new HomeInitializationError("Existing Kepler home metadata is incompatible; preserve its contents.");
  }
  return {
    status: "ready",
    value: {
      format_version: 1,
      release: value.release,
      resource_digest: value.resource_digest,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function isDigest(value: unknown): value is ContentDigest {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}
