import { spawnSync } from "node:child_process";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const gitEnvironment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

export const runCommand = (
  command: string,
  args: readonly string[],
  cwd: string,
): CommandResult => {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: "utf-8",
    env: gitEnvironment,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

export function git(cwd: string, ...args: string[]): string {
  const result = runCommand("git", args, cwd);
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}

const created: string[] = [];

export function makeRepo(options?: { defaultBranch?: string }): string {
  const directory = Fs.mkdtempSync(
    Path.join(Fs.realpathSync(Os.tmpdir()), "kepler-workbench-"),
  );
  created.push(directory);
  git(directory, "init", "-q", "-b", options?.defaultBranch ?? "main");
  git(directory, "config", "user.email", "test@example.com");
  git(directory, "config", "user.name", "Test");
  git(directory, "config", "commit.gpgsign", "false");
  write(directory, "README.md", "# fixture\n");
  git(directory, "add", "-A");
  git(directory, "commit", "-q", "-m", "initial");
  git(directory, "update-ref", `refs/remotes/origin/${options?.defaultBranch ?? "main"}`, "HEAD");
  return directory;
}

export function cleanupRepos(): void {
  for (const directory of created.splice(0))
    Fs.rmSync(directory, { recursive: true, force: true });
}

export function write(
  repository: string,
  relativePath: string,
  content: string,
): string {
  const fullPath = Path.join(repository, relativePath);
  Fs.mkdirSync(Path.dirname(fullPath), { recursive: true });
  Fs.writeFileSync(fullPath, content);
  return fullPath;
}

export function commitAll(repository: string, message: string): string {
  git(repository, "add", "-A");
  git(repository, "commit", "-q", "-m", message);
  return git(repository, "rev-parse", "HEAD");
}

export function commitPaths(
  repository: string,
  message: string,
  ...paths: string[]
): string {
  git(repository, "add", "--", ...paths);
  git(repository, "commit", "-q", "-m", message, "--", ...paths);
  return git(repository, "rev-parse", "HEAD");
}

export function makeChangeDir(repository: string, slug: string): string {
  const directory = Path.join(repository, ".kepler", "changes", slug);
  Fs.mkdirSync(directory, { recursive: true });
  return directory;
}
