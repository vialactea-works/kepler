import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import type { TaskGraphDiagnostic } from "./task-graph.js";

export interface TaskGraphRepositoryRoot {
  readonly id: string;
  readonly path: string;
}

export interface TaskGraphPathOperand {
  readonly repositoryId: string;
  readonly basePath: string;
  readonly path: string;
  readonly pointer: string;
}

export interface TaskGraphPathFileSystem {
  readonly realpath: (path: string) => Promise<string>;
  readonly isDirectory: (path: string) => Promise<boolean>;
}

const defaultFileSystem: TaskGraphPathFileSystem = {
  realpath: (path) => Fs.realpath(path),
  isDirectory: async (path) => (await Fs.stat(path)).isDirectory(),
};

const isContained = (root: string, candidate: string): boolean => {
  const relative = Path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${Path.sep}`) &&
      !Path.isAbsolute(relative))
  );
};

const pathDiagnostic = (
  code: Extract<
    TaskGraphDiagnostic["code"],
    | "repository-path-invalid"
    | "repository-path-unknown"
    | "repository-path-outside"
    | "repository-path-missing"
  >,
  pointer: string,
  message: string,
): TaskGraphDiagnostic => ({ code, pointer, message });

export const validateTaskGraphPathOperands = async (
  repositories: readonly TaskGraphRepositoryRoot[],
  operands: readonly TaskGraphPathOperand[],
  fileSystem: TaskGraphPathFileSystem = defaultFileSystem,
): Promise<readonly TaskGraphDiagnostic[]> => {
  const diagnostics: TaskGraphDiagnostic[] = [];
  const roots = new Map<string, string>();
  const repositoryIds = new Set<string>();
  for (const repository of repositories) {
    if (repositoryIds.has(repository.id)) {
      diagnostics.push(
        pathDiagnostic(
          "repository-path-invalid",
          "",
          `Repository identity '${repository.id}' is declared more than once`,
        ),
      );
      continue;
    }
    repositoryIds.add(repository.id);
    if (
      repository.id.length === 0 ||
      repository.id.includes("\0") ||
      repository.path.length === 0 ||
      repository.path.includes("\0") ||
      !Path.isAbsolute(repository.path)
    ) {
      diagnostics.push(
        pathDiagnostic(
          "repository-path-invalid",
          "",
          "Repository roots require a non-empty identity and an absolute path",
        ),
      );
      continue;
    }
    try {
      const root = await fileSystem.realpath(repository.path);
      if (!(await fileSystem.isDirectory(root))) {
        diagnostics.push(
          pathDiagnostic(
            "repository-path-invalid",
            "",
            `Repository root '${repository.id}' is not a directory`,
          ),
        );
        continue;
      }
      roots.set(repository.id, root);
    } catch {
      diagnostics.push(
        pathDiagnostic(
          "repository-path-missing",
          "",
          `Repository root '${repository.id}' does not resolve`,
        ),
      );
    }
  }

  for (const operand of operands) {
    const root = roots.get(operand.repositoryId);
    if (root === undefined) {
      diagnostics.push(
        pathDiagnostic(
          "repository-path-unknown",
          operand.pointer,
          `Path operand names undeclared repository '${operand.repositoryId}'`,
        ),
      );
      continue;
    }
    if (
      operand.path.length === 0 ||
      operand.path.includes("\0") ||
      Path.isAbsolute(operand.basePath) ||
      operand.basePath.includes("\0")
    ) {
      diagnostics.push(
        pathDiagnostic(
          "repository-path-invalid",
          operand.pointer,
          "Path must be non-empty and contain no NUL; base path must be relative and contain no NUL",
        ),
      );
      continue;
    }
    const base = Path.resolve(root, operand.basePath);
    if (!isContained(root, base)) {
      diagnostics.push(
        pathDiagnostic(
          "repository-path-outside",
          operand.pointer,
          "Path operand base resolves outside its declared repository",
        ),
      );
      continue;
    }
    const candidate = Path.resolve(base, operand.path);
    if (!isContained(root, candidate)) {
      diagnostics.push(
        pathDiagnostic(
          "repository-path-outside",
          operand.pointer,
          "Path operand resolves outside its declared repository",
        ),
      );
      continue;
    }
    try {
      const realCandidate = await fileSystem.realpath(candidate);
      if (!isContained(root, realCandidate))
        diagnostics.push(
          pathDiagnostic(
            "repository-path-outside",
            operand.pointer,
            "Path operand resolves through a symlink outside its declared repository",
          ),
        );
    } catch {
      diagnostics.push(
        pathDiagnostic(
          "repository-path-missing",
          operand.pointer,
          "Path operand does not resolve within its declared repository",
        ),
      );
    }
  }
  return diagnostics;
};
