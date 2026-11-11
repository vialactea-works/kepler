import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm } from "node:fs/promises";
import type { MissionCoordinationFileSystem } from "./mission-coordination.js";

const missing = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

export const nodeMissionCoordinationFileSystem: MissionCoordinationFileSystem = {
  pathKind: async (path) => {
    try {
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) return "symlink";
      if (stat.isDirectory()) return "directory";
      if (stat.isFile()) return "file";
      return "other";
    } catch (error) {
      if (missing(error)) return "missing";
      throw error;
    }
  },
  pathIdentity: async (path) => {
    try {
      const stat = await lstat(path, { bigint: true });
      return { device: stat.dev.toString(), inode: stat.ino.toString() };
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
  },
  realpath: (path) => realpath(path),
  mkdir: async (path) => {
    await mkdir(path);
  },
  writeFileExclusive: async (path, content) => {
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  readFile: async (path) => await readFile(path, "utf8"),
  rename: async (from, to) => await rename(from, to),
  removeTree: async (path) => await rm(path, { recursive: true, force: false }),
  listDirectory: async (path) => await readdir(path),
};
