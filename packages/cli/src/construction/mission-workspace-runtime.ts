import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { open, lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { MissionCoordination } from "./mission-coordination.js";
import { createMissionCoordination } from "./mission-coordination.js";
import { nodeMissionCoordinationFileSystem } from "./mission-coordination-runtime.js";
import type {
  MissionWorkspaceCommandResult,
  MissionWorkspaceFileSystem,
  MissionWorkspaceGit,
  MissionWorkspaceRuntime,
} from "./mission-workspace.js";

const processIncarnationId = randomUUID();

const gitEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
  };
  delete environment.GIT_DIR;
  delete environment.GIT_WORK_TREE;
  delete environment.GIT_COMMON_DIR;
  delete environment.GIT_INDEX_FILE;
  return environment;
};

const runGit = (
  cwd: string,
  args: readonly string[],
): Promise<MissionWorkspaceCommandResult> =>
  new Promise((resolve) => {
    execFile(
      "git",
      [...args],
      { cwd, encoding: "utf8", env: gitEnvironment() },
      (error, stdout, stderr) => {
        const code = error !== null && "code" in error ? error.code : undefined;
        resolve({ status: error === null ? 0 : typeof code === "number" ? code : -1, stdout, stderr });
      },
    );
  });

const missing = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

const fileSystem: MissionWorkspaceFileSystem = {
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
  realpath: (path) => realpath(path),
  mkdir: async (path) => {
    await mkdir(path);
  },
  readFile: async (path) => await readFile(path, "utf8"),
  writeFileExclusive: async (path, content) => {
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
};

const git: MissionWorkspaceGit = { run: runGit };

export const createNodeMissionWorkspaceRuntime = (
  options: {
    readonly cwd?: string;
    readonly fileSystem?: MissionWorkspaceFileSystem;
    readonly git?: MissionWorkspaceGit;
    readonly coordination?: MissionCoordination;
    readonly identity?: MissionWorkspaceRuntime["identity"];
  } = {},
): MissionWorkspaceRuntime => ({
  cwd: options.cwd ?? process.cwd(),
  git: options.git ?? git,
  fileSystem: options.fileSystem ?? fileSystem,
  coordination: options.coordination ?? createMissionCoordination(nodeMissionCoordinationFileSystem, { next: randomUUID }),
  identity: options.identity ?? {
    machine_id: hostname(),
    process_id: process.pid,
    process_incarnation_id: processIncarnationId,
  },
});
