import * as Fs from "node:fs/promises";
import {
  createRuntime,
  type ProcessPort,
  type ProcessResult,
} from "./runtime.js";

export interface PreconditionArguments {
  readonly changeDir: string;
  readonly testCommand: string;
  readonly targetBranch: string;
  readonly wholeChangeWaived?: boolean;
  readonly recoverFinish?: number;
}

export type PreconditionResultStatus = "success" | "negative" | "error";

export interface PreconditionResult {
  readonly _tag: "PreconditionResult";
  readonly status: PreconditionResultStatus;
  readonly exitCode: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
  readonly lines: readonly string[];
  readonly lastLine: string;
}

export interface PreconditionFileSystemPort {
  readonly pathExists: (sourcePath: string) => boolean | Promise<boolean>;
  readonly directoryExists: (sourcePath: string) => boolean | Promise<boolean>;
  readonly realpath: (sourcePath: string) => string | Promise<string>;
  readonly readFile?: (sourcePath: string) => string | Promise<string>;
  readonly readDirectory?: (sourcePath: string) => readonly string[] | Promise<readonly string[]>;
}

export interface PreconditionGitPort {
  readonly changedPaths?: (cwd: string, commit: string) => ProcessResult | Promise<ProcessResult>;
  readonly pathChanges?: (cwd: string, base: string, head: string, paths: readonly string[]) => ProcessResult | Promise<ProcessResult>;
  readonly repositoryRoot: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly statusPorcelain: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly currentHead?: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly currentBranch?: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly worktreeIdentity?: (
    cwd: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly pathHistory?: (
    cwd: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly blobAt?: (
    cwd: string,
    commit: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly firstParent?: (
    cwd: string,
    commit: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly resolveCommit?: (
    cwd: string,
    reference: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly isAncestor?: (
    cwd: string,
    base: string,
    head: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly headBlob?: (
    cwd: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly worktreeBlob?: (
    cwd: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly stagedDiff?: (
    cwd: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly latestCommit?: (
    cwd: string,
    sourcePath: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly commitFiles?: (
    cwd: string,
    commit: string,
  ) => ProcessResult | Promise<ProcessResult>;
  readonly latestMaterialCommit?: (
    cwd: string,
    changePath: string,
    taskPaths: readonly string[],
  ) => ProcessResult | Promise<ProcessResult>;
}

export interface HistoricalAdmissionSource {
  readonly revision: string;
  readonly repositoryRoot: string;
  readonly sourceRoot: string;
}

export interface PreconditionRuntime {
  readonly admissionSource?: HistoricalAdmissionSource;
  readonly cwd: () => string;
  readonly process: ProcessPort;
  readonly fileSystem: PreconditionFileSystemPort;
  readonly git: PreconditionGitPort;
}

export interface PreconditionRuntimeOverrides {
  readonly cwd?: () => string;
  readonly process?: ProcessPort;
  readonly fileSystem?: PreconditionFileSystemPort;
  readonly git?: PreconditionGitPort;
}

export const createPreconditionRuntime = (
  overrides: PreconditionRuntimeOverrides = {},
): PreconditionRuntime => {
  const runtime = createRuntime({
    cwd: overrides.cwd,
    process: overrides.process,
  });
  return {
    cwd: runtime.cwd,
    process: runtime.process,
    fileSystem: overrides.fileSystem ?? {
      ...runtime.fileSystem,
      readDirectory: async (sourcePath) => Fs.readdir(sourcePath),
    },
    git: overrides.git ?? {
      repositoryRoot: runtime.git.repositoryRoot,
      statusPorcelain: runtime.git.statusPorcelain,
    },
  };
};
