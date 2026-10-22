import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import type { UnitQueryDirectoryEntry, UnitQueryFileSystem } from "./unit-queries.js";

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const isWithin = (root: string, candidate: string): boolean => {
  const relative = Path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${Path.sep}`) && relative !== ".." && !Path.isAbsolute(relative));
};

const entries = async (path: string, root: string): Promise<readonly UnitQueryDirectoryEntry[]> => {
  let metadata: Awaited<ReturnType<typeof Fs.lstat>>;
  try {
    metadata = await Fs.lstat(path);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(`Expected a real directory at ${path}`);
  const canonicalRoot = await Fs.realpath(root);
  const canonicalPath = await Fs.realpath(path);
  if (!isWithin(canonicalRoot, canonicalPath)) throw new Error(`Query path escapes its selected record home: ${path}`);
  const contents = await Fs.readdir(canonicalPath, { withFileTypes: true });
  if (contents.some((entry) => entry.isSymbolicLink())) throw new Error(`Query path contains a symbolic link: ${path}`);
  return contents.map((entry) => ({
    name: entry.name,
    kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
  }));
};

export const createNodeUnitQueryFileSystem = (): UnitQueryFileSystem => ({
  entries,
  directories: async (path, root) => (await entries(path, root)).filter((entry) => entry.kind === "directory").map((entry) => entry.name),
  journals: async (path, root) => (await entries(path, root))
    .filter((entry) => entry.kind === "file" && entry.name.endsWith(".jsonl"))
    .map((entry) => entry.name.slice(0, -6)),
  read: async (path, root) => {
    const metadata = await Fs.lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`Query journal is not a regular file: ${path}`);
    const canonicalRoot = await Fs.realpath(root);
    const canonicalPath = await Fs.realpath(path);
    if (!isWithin(canonicalRoot, canonicalPath)) throw new Error(`Query journal escapes its selected record home: ${path}`);
    return new Uint8Array(await Fs.readFile(canonicalPath));
  },
});
