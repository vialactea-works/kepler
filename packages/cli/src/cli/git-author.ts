import type { ProjectCommandResult, ProjectSelectionGit } from "./project-selection.js";
import { ProjectResolver } from "./project-selection.js";

export interface GitAuthorIdentity {
  readonly kind: "resolved";
  readonly name: string;
  readonly email: string;
}

export interface GitAuthorFailure {
  readonly kind: "failed";
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly recovery: string;
}

export type GitAuthorResult = GitAuthorIdentity | GitAuthorFailure;

const valueFrom = (result: ProjectCommandResult): string =>
  result.stdout.replace(/\r?\n$/, "");

const fail = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>>,
  recovery: string,
): GitAuthorFailure => ({ kind: "failed", code, message, details, recovery });

export class GitAuthorLookup {
  constructor(
    private readonly projects: ProjectResolver,
    private readonly git: Pick<ProjectSelectionGit, "configValue">,
  ) {}

  async execute(project?: string): Promise<GitAuthorResult> {
    const selected = await this.projects.resolve(project);
    if (selected.kind === "failed") return selected;

    let nameResult: ProjectCommandResult;
    let emailResult: ProjectCommandResult;
    try {
      [nameResult, emailResult] = await Promise.all([
        this.git.configValue(selected.root, "user.name"),
        this.git.configValue(selected.root, "user.email"),
      ]);
    } catch {
      return fail(
        "git_config_unavailable",
        "Git could not read the effective author identity.",
        {},
        "Check Git configuration access for the selected project and retry.",
      );
    }

    const failedKeys = [
      ...(nameResult.status !== 0 && nameResult.status !== 1
        ? ["user.name"]
        : []),
      ...(emailResult.status !== 0 && emailResult.status !== 1
        ? ["user.email"]
        : []),
    ];
    if (failedKeys.length > 0) {
      return fail(
        "git_config_unavailable",
        "Git could not read the effective author identity.",
        { keys: failedKeys },
        "Check Git configuration access for the selected project and retry.",
      );
    }

    const name = nameResult.status === 0 ? valueFrom(nameResult) : "";
    const email = emailResult.status === 0 ? valueFrom(emailResult) : "";
    const missing: string[] = [];
    if (name.trim().length === 0) missing.push("user.name");
    if (email.trim().length === 0) missing.push("user.email");
    if (missing.length > 0) {
      return fail(
        "git_identity_missing",
        `The effective Git identity is missing ${missing.join(" and ")}.`,
        { missing },
        "Set each missing Git identity value in an appropriate configuration scope, then retry.",
      );
    }

    return { kind: "resolved", name, email };
  }
}
