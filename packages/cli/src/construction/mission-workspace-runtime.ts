import { execFile, spawn } from "node:child_process";
import { hostname } from "node:os";
import { open, lstat, mkdir, readFile, readdir, realpath } from "node:fs/promises";
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

const findReachableObjects: MissionWorkspaceGit["findReachableObjects"] = (cwd, objectIds) =>
  new Promise((resolve) => {
    const requested = new Set(objectIds);
    const reachable = new Set<string>();
    const maxStderrCharacters = 16_384;
    let stdoutRemainder = "";
    let stderr = "";
    let settled = false;
    const finish = (result: { status: number; objectIds: readonly string[]; stderr: string }): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = spawn("git", ["rev-list", "--objects", "--all"], {
      cwd,
      env: gitEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const collectLine = (line: string): void => {
      const separator = line.indexOf(" ");
      const objectId = separator < 0 ? line : line.slice(0, separator);
      if (requested.has(objectId)) reachable.add(objectId);
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      const lines = (stdoutRemainder + chunk).split(/\r?\n/);
      stdoutRemainder = lines.pop() ?? "";
      for (const line of lines) collectLine(line);
    });
    child.stdout.on("error", (error) => finish({
      status: -1,
      objectIds: [...reachable],
      stderr: error.message,
    }));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const remaining = maxStderrCharacters - stderr.length;
      if (remaining > 0) stderr += chunk.slice(0, remaining);
    });
    child.stderr.on("error", (error) => finish({
      status: -1,
      objectIds: [...reachable],
      stderr: error.message,
    }));
    child.once("error", (error) => finish({
      status: -1,
      objectIds: [...reachable],
      stderr: error.message,
    }));
    child.once("close", (code) => {
      if (stdoutRemainder.length > 0) collectLine(stdoutRemainder);
      finish({ status: code ?? -1, objectIds: [...reachable], stderr });
    });
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
  readDirectory: async (path) => await readdir(path),
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

const git: MissionWorkspaceGit = { run: runGit, findReachableObjects };

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
