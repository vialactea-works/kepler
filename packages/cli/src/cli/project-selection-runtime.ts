import { execFile } from "node:child_process";
import * as Fs from "node:fs/promises";
import type {
  ProjectCommandResult,
  ProjectSelectionFileSystem,
  ProjectSelectionGit,
  ProjectSelectionRuntime,
} from "./project-selection.js";

const gitEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_OPTIONAL_LOCKS: "0",
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
): Promise<ProjectCommandResult> =>
  new Promise((resolve) => {
    execFile(
      "git",
      [...args],
      {
        cwd,
        encoding: "utf8",
        env: gitEnvironment(),
      },
      (error, stdout, stderr) => {
        const code = error !== null && "code" in error ? error.code : undefined;
        resolve({
          status: error === null ? 0 : typeof code === "number" ? code : -1,
          stdout,
          stderr,
        });
      },
    );
  });

const nodeFileSystem: ProjectSelectionFileSystem = {
  realpath: (path) => Fs.realpath(path),
  directoryExists: async (path) => {
    try {
      return (await Fs.stat(path)).isDirectory();
    } catch {
      return false;
    }
  },
};

const nodeGit: ProjectSelectionGit = {
  isBareRepository: (cwd) => runGit(cwd, ["rev-parse", "--is-bare-repository"]),
  repositoryRoot: (cwd) => runGit(cwd, ["rev-parse", "--show-toplevel"]),
  configValue: (cwd, key) => runGit(cwd, ["config", "--get", key]),
};

export const createProjectSelectionRuntime = (
  overrides: Partial<ProjectSelectionRuntime> = {},
): ProjectSelectionRuntime => ({
  cwd: overrides.cwd ?? (() => process.cwd()),
  fileSystem: overrides.fileSystem ?? nodeFileSystem,
  git: overrides.git ?? nodeGit,
});
