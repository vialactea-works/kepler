import { spawn } from "node:child_process";

export interface RepositoryQualifiedCwd {
  readonly repository_id: string;
  readonly path: string;
}

export interface CheckRunRequest {
  readonly cwd: RepositoryQualifiedCwd;
  readonly executable: string;
  readonly argv: readonly string[];
}

export interface CheckRunOutput {
  readonly stdout: string;
  readonly stderr: string;
}

export type CheckRunResult =
  | (CheckRunOutput & {
      readonly kind: "completed";
      readonly exitCode: number;
    })
  | (CheckRunOutput & {
      readonly kind: "spawn-failed";
      readonly error: {
        readonly code?: string;
        readonly message: string;
      };
    })
  | (CheckRunOutput & {
      readonly kind: "terminated";
      readonly signal: NodeJS.Signals | null;
    });

export interface CheckRunner {
  readonly run: (request: CheckRunRequest) => Promise<CheckRunResult>;
}

const spawnFailure = (
  error: NodeJS.ErrnoException,
  stdout: string,
  stderr: string,
): CheckRunResult => ({
  kind: "spawn-failed",
  error:
    error.code === undefined
      ? { message: error.message }
      : { code: error.code, message: error.message },
  stdout,
  stderr,
});

const runCheck = (request: CheckRunRequest): Promise<CheckRunResult> =>
  new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(request.executable, [...request.argv], {
        cwd: request.cwd.path,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve(spawnFailure(error as NodeJS.ErrnoException, stdout, stderr));
      return;
    }

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      resolve(spawnFailure(error as NodeJS.ErrnoException, stdout, stderr));
    });
    child.once("close", (exitCode, signal) => {
      if (exitCode === null) {
        resolve({ kind: "terminated", signal, stdout, stderr });
        return;
      }
      resolve({ kind: "completed", exitCode, stdout, stderr });
    });
  });

export const createNodeCheckRunner = (): CheckRunner => ({ run: runCheck });
