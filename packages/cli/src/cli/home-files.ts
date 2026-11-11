import { randomUUID } from "node:crypto";
import * as Fs from "node:fs";
import * as Path from "node:path";
import { HOME_INITIALIZATION_MARKER_PREFIX, type HomeInitializationFiles } from "./home-initializer.js";
import type { ResourcePackageSnapshot } from "./release-resources.js";

export function createNodeHomeInitializationFiles(
  home: string,
  readBundle: () => ResourcePackageSnapshot,
): HomeInitializationFiles {
  return {
    readBundle,
    createHome: () => createHomeDirectory(home),
    listFiles: () => listHomeFiles(home),
    listInitializationMarkers: () => listHomeInitializationMarkers(home),
    createInitializationMarker: (name) => createHomeInitializationMarker(home, name),
    removeInitializationMarker: (name) => removeHomeInitializationMarker(home, name),
    cleanupInitializationTemporaries: () => cleanupHomeInitializationTemporaries(home),
    readFile: (relative) => readHomeFile(home, relative),
    writeFile: (relative, contents) => writeHomeFile(home, relative, contents),
    completeInitialization: (pending, ready) => completeHomeInitialization(home, pending, ready),
  };
}

function createHomeDirectory(home: string): "created" | "exists" {
  Fs.mkdirSync(Path.dirname(home), { recursive: true, mode: 0o700 });
  try {
    Fs.mkdirSync(home, { mode: 0o700 });
    return "created";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const status = Fs.lstatSync(home);
    if (!status.isDirectory() || status.isSymbolicLink()) {
      throw new Error("KEPLER_HOME is not a regular directory.");
    }
    return "exists";
  }
}

function listHomeFiles(home: string): readonly string[] {
  const output: string[] = [];
  const visit = (directory: string, relativeDirectory: string): void => {
    for (const entry of Fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        visit(Path.join(directory, entry.name), relative);
      } else {
        output.push(relative);
      }
    }
  };
  visit(home, "");
  return output.sort(compareStrings);
}

function listHomeInitializationMarkers(home: string): readonly string[] {
  return Fs.readdirSync(home)
    .filter((name) => name.startsWith(HOME_INITIALIZATION_MARKER_PREFIX))
    .sort(compareStrings);
}

function createHomeInitializationMarker(home: string, name: string): void {
  validateInitializationMarkerName(name);
  const path = resolveHomePath(home, name);
  try {
    Fs.mkdirSync(path, { mode: 0o700 });
    syncHomeDirectory(home);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const status = Fs.lstatSync(path);
    if (!status.isDirectory() || status.isSymbolicLink() || Fs.readdirSync(path).length > 0) {
      throw new Error("Kepler home initialization marker is not an empty regular directory.");
    }
  }
}

function removeHomeInitializationMarker(home: string, name: string): void {
  validateInitializationMarkerName(name);
  const path = resolveHomePath(home, name);
  try {
    const status = Fs.lstatSync(path);
    if (!status.isDirectory() || status.isSymbolicLink() || Fs.readdirSync(path).length > 0) {
      throw new Error("Kepler home initialization marker is not an empty regular directory.");
    }
    Fs.rmdirSync(path);
    syncHomeDirectory(home);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function cleanupHomeInitializationTemporaries(home: string): void {
  for (const relative of listHomeFiles(home)) {
    if (!/^\..+\.kepler-[0-9a-f-]{36}\.tmp$/.test(Path.basename(relative))) continue;
    const path = resolveHomePath(home, relative);
    const status = Fs.lstatSync(path);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error(`Kepler initialization temporary is not a regular file: ${relative}`);
    }
    Fs.unlinkSync(path);
    syncHomeDirectory(Path.dirname(path));
  }
}

function validateInitializationMarkerName(name: string): void {
  const suffix = name.startsWith(HOME_INITIALIZATION_MARKER_PREFIX)
    ? name.slice(HOME_INITIALIZATION_MARKER_PREFIX.length)
    : "";
  if (!/^[a-f0-9]{64}$/.test(suffix)) {
    throw new Error("Kepler home initialization marker name is invalid.");
  }
}

function readHomeFile(home: string, relative: string): Uint8Array | undefined {
  const path = resolveHomePath(home, relative);
  try {
    const status = Fs.lstatSync(path);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error(`Kepler home resource is not a regular file: ${relative}`);
    }
    return Fs.readFileSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function writeHomeFile(home: string, relative: string, contents: Uint8Array): void {
  const path = resolveHomePath(home, relative);
  ensureHomeParents(home, Path.dirname(path));
  const existing = readHomeFile(home, relative);
  if (existing) {
    if (!bytesEqual(existing, contents)) {
      throw new Error(`Refusing to overwrite an existing Kepler home file: ${relative}`);
    }
    return;
  }

  const temporary = Path.join(Path.dirname(path), `.${Path.basename(path)}.kepler-${randomUUID()}.tmp`);
  let created = false;
  try {
    const descriptor = Fs.openSync(temporary, "wx", 0o600);
    created = true;
    try {
      Fs.writeFileSync(descriptor, contents);
      Fs.fsyncSync(descriptor);
    } finally {
      Fs.closeSync(descriptor);
    }
    try {
      Fs.linkSync(temporary, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const concurrent = readHomeFile(home, relative);
      if (!concurrent || !bytesEqual(concurrent, contents)) {
        throw new Error(`Refusing to overwrite a concurrently created Kepler home file: ${relative}`, { cause: error });
      }
    }
    syncHomeDirectory(Path.dirname(path));
  } finally {
    if (created) Fs.unlinkSync(temporary);
  }
}

function completeHomeInitialization(
  home: string,
  pendingMetadata: Uint8Array,
  readyMetadata: Uint8Array,
): void {
  const metadataPath = resolveHomePath(home, "home-metadata.json");
  const current = readHomeFile(home, "home-metadata.json");
  if (!current || !bytesEqual(current, pendingMetadata)) {
    throw new Error("Kepler home initialization metadata changed before completion; preserve its contents.");
  }
  const temporary = Path.join(Path.dirname(metadataPath), `.home-metadata.kepler-${randomUUID()}.tmp`);
  let created = false;
  try {
    const descriptor = Fs.openSync(temporary, "wx", 0o600);
    created = true;
    try {
      Fs.writeFileSync(descriptor, readyMetadata);
      Fs.fsyncSync(descriptor);
    } finally {
      Fs.closeSync(descriptor);
    }
    const beforeCommit = readHomeFile(home, "home-metadata.json");
    if (!beforeCommit || !bytesEqual(beforeCommit, pendingMetadata)) {
      throw new Error("Kepler home initialization metadata changed before completion; preserve its contents.");
    }
    Fs.renameSync(temporary, metadataPath);
    created = false;
    syncHomeDirectory(Path.dirname(metadataPath));
  } finally {
    if (created) Fs.unlinkSync(temporary);
  }
}

function resolveHomePath(home: string, relative: string): string {
  const segments = relative.split("/");
  if (relative.length === 0 || Path.isAbsolute(relative) || relative.includes("\\") ||
      relative.includes("\0") || segments.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`Kepler home resource path is not normalized: ${relative}`);
  }
  return Path.join(home, ...segments);
}

function ensureHomeParents(home: string, parent: string): void {
  const relative = Path.relative(home, parent);
  if (relative === "" || relative.startsWith(`..${Path.sep}`) || Path.isAbsolute(relative)) {
    if (relative === "") return;
    throw new Error("Kepler home resource directory escaped KEPLER_HOME.");
  }
  let current = home;
  for (const segment of relative.split(Path.sep)) {
    current = Path.join(current, segment);
    try {
      Fs.mkdirSync(current, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const status = Fs.lstatSync(current);
      if (!status.isDirectory() || status.isSymbolicLink()) {
        throw new Error(`Kepler home resource parent is not a regular directory: ${current}`);
      }
    }
  }
}

function syncHomeDirectory(directory: string): void {
  const descriptor = Fs.openSync(directory, Fs.constants.O_RDONLY | (Fs.constants.O_DIRECTORY ?? 0));
  try {
    Fs.fsyncSync(descriptor);
  } finally {
    Fs.closeSync(descriptor);
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
