import * as Path from "node:path";

export interface ProjectCommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProjectSelectionFileSystem {
  readonly realpath: (path: string) => string | Promise<string>;
  readonly directoryExists: (path: string) => boolean | Promise<boolean>;
}

export interface ProjectSelectionGit {
  readonly isBareRepository: (
    cwd: string,
  ) => ProjectCommandResult | Promise<ProjectCommandResult>;
  readonly repositoryRoot: (
    cwd: string,
  ) => ProjectCommandResult | Promise<ProjectCommandResult>;
  readonly configValue: (
    cwd: string,
    key: "user.name" | "user.email",
  ) => ProjectCommandResult | Promise<ProjectCommandResult>;
}

export interface ProjectSelectionRuntime {
  readonly cwd: () => string;
  readonly fileSystem: ProjectSelectionFileSystem;
  readonly git: ProjectSelectionGit;
}

export interface ResolvedProject {
  readonly kind: "resolved";
  readonly root: string;
}

export interface ProjectSelectionFailure {
  readonly kind: "failed";
  readonly code:
    | "invalid_project_path"
    | "project_not_directory"
    | "project_not_worktree"
    | "bare_repository"
    | "project_not_root"
    | "kepler_directory_missing"
    | "kepler_directory_not_local";
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly recovery: string;
}

export type ProjectSelectionResult = ResolvedProject | ProjectSelectionFailure;

export interface ProjectSelectorFailure {
  readonly kind: "failed";
  readonly code: "duplicate_selector" | "invalid_selector";
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly recovery: string;
}

export type ProjectSelectorParseResult =
  | { readonly kind: "parsed"; readonly project?: string }
  | ProjectSelectorFailure;

export const parseProjectSelector = (
  value: unknown,
): ProjectSelectorParseResult => {
  if (value === undefined) return { kind: "parsed" };
  const values = Array.isArray(value) ? value : [value];
  if (values.length > 1) {
    return {
      kind: "failed",
      code: "duplicate_selector",
      message: "--project may be specified only once.",
      details: { selector: "project" },
      recovery: "Provide one --project path and retry.",
    };
  }
  if (typeof values[0] !== "string" || values[0].length === 0) {
    return {
      kind: "failed",
      code: "invalid_selector",
      message: "--project requires one non-empty path.",
      details: { selector: "project" },
      recovery: "Provide one non-empty --project path and retry.",
    };
  }
  return { kind: "parsed", project: values[0] };
};

const lineValue = (value: string): string => value.replace(/\r?\n$/, "");

const isWithin = (root: string, path: string): boolean => {
  const relative = Path.relative(root, path);
  return relative !== "" && !relative.startsWith(`..${Path.sep}`) && relative !== ".." && !Path.isAbsolute(relative);
};

const failure = (
  code: ProjectSelectionFailure["code"],
  message: string,
  path?: string,
): ProjectSelectionFailure => ({
  kind: "failed",
  code,
  message,
  details: path === undefined ? {} : { path },
  recovery:
    "Select a Git working-tree root containing an existing local .kepler directory, then retry.",
});

export class ProjectResolver {
  constructor(private readonly runtime: ProjectSelectionRuntime) {}

  async resolve(project?: string): Promise<ProjectSelectionResult> {
    const invocationDirectory = Path.resolve(this.runtime.cwd());
    if (project !== undefined && project.length === 0) {
      return failure(
        "invalid_project_path",
        "The --project path must not be empty.",
        project,
      );
    }

    const selectedPath = Path.resolve(invocationDirectory, project ?? ".");
    let selectedRoot: string;
    try {
      selectedRoot = await this.runtime.fileSystem.realpath(selectedPath);
    } catch {
      return failure(
        "invalid_project_path",
        "The selected project path does not exist.",
        selectedPath,
      );
    }

    let selectedRootIsDirectory = false;
    try {
      selectedRootIsDirectory = await this.runtime.fileSystem.directoryExists(
        selectedRoot,
      );
    } catch {
      selectedRootIsDirectory = false;
    }
    if (!selectedRootIsDirectory) {
      return failure(
        "project_not_directory",
        "The selected project path is not a directory.",
        selectedRoot,
      );
    }

    let bareRepository: ProjectCommandResult;
    try {
      bareRepository = await this.runtime.git.isBareRepository(selectedRoot);
    } catch {
      return failure(
        "project_not_worktree",
        "Git could not verify the selected working tree.",
        selectedRoot,
      );
    }
    if (bareRepository.status !== 0) {
      return failure(
        "project_not_worktree",
        "The selected directory is not a Git working tree.",
        selectedRoot,
      );
    }
    if (lineValue(bareRepository.stdout) === "true") {
      return failure(
        "bare_repository",
        "Bare Git repositories are not supported as projects.",
        selectedRoot,
      );
    }
    if (lineValue(bareRepository.stdout) !== "false") {
      return failure(
        "project_not_worktree",
        "Git could not verify the selected working tree.",
        selectedRoot,
      );
    }

    let repositoryRoot: ProjectCommandResult;
    try {
      repositoryRoot = await this.runtime.git.repositoryRoot(selectedRoot);
    } catch {
      return failure(
        "project_not_worktree",
        "Git could not resolve the selected working tree root.",
        selectedRoot,
      );
    }
    if (repositoryRoot.status !== 0 || repositoryRoot.stdout.length === 0) {
      return failure(
        "project_not_worktree",
        "Git could not resolve the selected working tree root.",
        selectedRoot,
      );
    }

    let canonicalRepositoryRoot: string;
    try {
      canonicalRepositoryRoot = await this.runtime.fileSystem.realpath(
        Path.resolve(selectedRoot, lineValue(repositoryRoot.stdout)),
      );
    } catch {
      return failure(
        "project_not_worktree",
        "Git returned a working tree root that does not exist.",
        selectedRoot,
      );
    }

    if (canonicalRepositoryRoot !== selectedRoot) {
      return {
        ...failure(
          "project_not_root",
          "The selected directory is inside a Git working tree, not its root.",
          selectedRoot,
        ),
        details: { path: selectedRoot, root: canonicalRepositoryRoot },
      };
    }

    const metadataDirectory = Path.join(canonicalRepositoryRoot, ".kepler");
    let metadataDirectoryExists = false;
    try {
      metadataDirectoryExists = await this.runtime.fileSystem.directoryExists(
        metadataDirectory,
      );
    } catch {
      metadataDirectoryExists = false;
    }
    if (!metadataDirectoryExists) {
      return failure(
        "kepler_directory_missing",
        "The selected project root must contain an existing .kepler directory.",
        metadataDirectory,
      );
    }

    let canonicalMetadataDirectory: string;
    try {
      canonicalMetadataDirectory = await this.runtime.fileSystem.realpath(
        metadataDirectory,
      );
    } catch {
      return failure(
        "kepler_directory_missing",
        "The selected project root must contain an existing .kepler directory.",
        metadataDirectory,
      );
    }

    if (!isWithin(canonicalRepositoryRoot, canonicalMetadataDirectory)) {
      return failure(
        "kepler_directory_not_local",
        "The project's .kepler directory must resolve inside its working tree.",
        metadataDirectory,
      );
    }

    return { kind: "resolved", root: canonicalRepositoryRoot };
  }
}
