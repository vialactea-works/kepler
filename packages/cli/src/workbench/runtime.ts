import { execFile, spawnSync } from "node:child_process";
import * as Fs from "node:fs/promises";

export interface ProcessResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessPort {
  readonly run: (
    command: string,
    args: readonly string[],
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
}

export interface IsolationFileSystemPort {
  readonly pathExists: (sourcePath: string) => boolean | Promise<boolean>;
  readonly directoryExists: (sourcePath: string) => boolean | Promise<boolean>;
  readonly realpath: (sourcePath: string) => string | Promise<string>;
  readonly readFile: (sourcePath: string) => string | Promise<string>;
  readonly mkdir: (sourcePath: string) => void | Promise<void>;
  readonly appendFile: (
    sourcePath: string,
    content: string,
  ) => void | Promise<void>;
}

export interface IsolationGitPort {
  readonly repositoryRoot: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly statusPorcelain: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly gitDirectory: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly gitCommonDirectory: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly currentBranch: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly remoteDefaultBranch: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly branchExists: (
    cwd: string,
    branch: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly ignored: (
    cwd: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly addWorktree: (
    cwd: string,
    sourcePath: string,
    branch: string,
  ) => ProcessResult | Promise<ProcessResult>;
}

export interface IsolationRuntime {
  readonly cwd: () => string;
  readonly process: ProcessPort;
  readonly fileSystem: IsolationFileSystemPort;
  readonly git: IsolationGitPort;
}

const environment = Object.freeze({
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
});

const productionProcess: ProcessPort = {
  run: (command, args, cwd) => {
    const result = spawnSync(command, [...args], {
      cwd,
      encoding: "utf-8",
      env: environment,
    });
    return {
      status: result.status === null ? -1 : result.status,
      stdout: result.stdout === null ? "" : result.stdout,
      stderr: result.stderr === null ? "" : result.stderr,
    };
  },
};

let activeReads = 0;
const waitingReads: (() => void)[] = [];

export const nativeReadProcess: ProcessPort = {
  run: async (command, args, cwd) => {
    if (activeReads < 4) activeReads += 1;
    else await new Promise<void>((resolve) => { waitingReads.push(resolve); });
    try {
      return await new Promise<ProcessResult>((resolve) => {
        execFile(command, [...args], { cwd, encoding: "utf8", env: environment }, (error, stdout, stderr) => {
          resolve({ status: error === null ? 0 : typeof error.code === "number" ? error.code : -1, stdout, stderr });
        });
      });
    } finally {
      const next = waitingReads.shift();
      if (next) next();
      else activeReads -= 1;
    }
  },
};

const productionRun = productionProcess.run;
const nativeReadRun = nativeReadProcess.run;

export const nativeProcessEnvironment = (
  port: ProcessPort,
): Readonly<Record<string, string | undefined>> | undefined =>
  (port === productionProcess && port.run === productionRun) || (port === nativeReadProcess && port.run === nativeReadRun) ? environment : undefined;

const productionFileSystem: IsolationFileSystemPort = {
  pathExists: async (sourcePath) => {
    try {
      await Fs.lstat(sourcePath);
      return true;
    } catch {
      return false;
    }
  },
  directoryExists: async (sourcePath) => {
    try {
      return (await Fs.stat(sourcePath)).isDirectory();
    } catch {
      return false;
    }
  },
  realpath: (sourcePath) => Fs.realpath(sourcePath),
  readFile: (sourcePath) => Fs.readFile(sourcePath, "utf8"),
  mkdir: async (sourcePath) => {
    await Fs.mkdir(sourcePath, { recursive: true });
  },
  appendFile: (sourcePath, content) => Fs.appendFile(sourcePath, content),
};

const gitPort = (processPort: ProcessPort): IsolationGitPort => ({
  repositoryRoot: (cwd) =>
    processPort.run("git", ["rev-parse", "--show-toplevel"], cwd),
  statusPorcelain: (cwd) =>
    processPort.run("git", ["status", "--porcelain"], cwd),
  gitDirectory: (cwd) =>
    processPort.run("git", ["rev-parse", "--git-dir"], cwd),
  gitCommonDirectory: (cwd) =>
    processPort.run("git", ["rev-parse", "--git-common-dir"], cwd),
  currentBranch: (cwd) =>
    processPort.run("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd),
  remoteDefaultBranch: (cwd) =>
    processPort.run(
      "git",
      ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
      cwd,
    ),
  branchExists: (cwd, branch) =>
    processPort.run(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      cwd,
    ),
  ignored: (cwd, sourcePath) =>
    processPort.run("git", ["check-ignore", "-q", sourcePath], cwd),
  addWorktree: (cwd, sourcePath, branch) =>
    processPort.run("git", ["worktree", "add", sourcePath, "-b", branch], cwd),
});

export interface RuntimeOverrides {
  readonly cwd?: () => string;
  readonly process?: ProcessPort;
  readonly fileSystem?: IsolationFileSystemPort;
  readonly git?: IsolationGitPort;
}

export const createRuntime = (
  overrides: RuntimeOverrides = {},
): IsolationRuntime => {
  const processPort = overrides.process ?? productionProcess;
  return {
    cwd: overrides.cwd ?? (() => process.cwd()),
    process: processPort,
    fileSystem: overrides.fileSystem ?? productionFileSystem,
    git: overrides.git ?? gitPort(processPort),
  };
};

export const productionRuntime = (): IsolationRuntime => createRuntime();
