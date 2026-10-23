import "reflect-metadata";
import { execFileSync } from "node:child_process";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import type { INestApplicationContext } from "@nestjs/common";
import { CommandFactory } from "nest-commander";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../../packages/cli/src/cli/app.module.js";

interface CapturedCli {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | undefined;
}

const temporaryDirectories: string[] = [];

interface GitFixture {
  readonly root: string;
  readonly parent: string;
  readonly globalConfig: string;
}

const isolatedGitEnvironment = (globalConfig: string): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
  };
  delete environment.GIT_DIR;
  delete environment.GIT_WORK_TREE;
  delete environment.GIT_INDEX_FILE;
  delete environment.GIT_CONFIG_PARAMETERS;
  return environment;
};

const runGit = (cwd: string, globalConfig: string, ...args: string[]): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: isolatedGitEnvironment(globalConfig),
  });

const createProject = async (name: string): Promise<GitFixture> => {
  const parent = await Fs.mkdtemp(Path.join(Os.tmpdir(), `kepler-cli-${name}-`));
  temporaryDirectories.push(parent);
  const globalConfig = Path.join(parent, "empty-global-config");
  const root = Path.join(parent, "project");
  await Fs.writeFile(globalConfig, "");
  await Fs.mkdir(root);
  runGit(root, globalConfig, "init", "-q", "-b", "main");
  runGit(root, globalConfig, "config", "user.name", "Ada Lovelace");
  runGit(root, globalConfig, "config", "user.email", "ada@example.com");
  await Fs.mkdir(Path.join(root, ".kepler"));
  await Fs.writeFile(Path.join(root, ".kepler", "marker"), "v3\n");
  await Fs.writeFile(Path.join(root, "README.md"), "# Project\n");
  runGit(root, globalConfig, "add", ".");
  runGit(root, globalConfig, "commit", "-q", "-m", "Create CLI fixture");
  return { root, parent, globalConfig };
};

const snapshot = async (root: string): Promise<string> => {
  const entries: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const children = await Fs.readdir(directory, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = Path.join(directory, child.name);
      const relative = Path.relative(root, path);
      const stat = await Fs.lstat(path);
      if (child.isDirectory()) {
        entries.push(`${relative}:directory:${stat.mtimeMs}`);
        await visit(path);
      } else if (child.isSymbolicLink()) {
        entries.push(`${relative}:link:${await Fs.readlink(path)}`);
      } else {
        entries.push(
          `${relative}:file:${stat.mtimeMs}:${(await Fs.readFile(path)).toString("base64")}`,
        );
      }
    }
  };
  await visit(root);
  return entries.join("\n");
};

const withGitEnvironment = async <T>(
  globalConfig: string,
  run: () => Promise<T>,
): Promise<T> => {
  const environment = isolatedGitEnvironment(globalConfig);
  const names = [
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_NOSYSTEM",
    "GIT_CONFIG_COUNT",
    "GIT_OPTIONAL_LOCKS",
    "GIT_TERMINAL_PROMPT",
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_CONFIG_PARAMETERS",
  ] as const;
  const original = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) {
    const value = environment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await run();
  } finally {
    for (const name of names) {
      const value = original.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      Fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

const runCli = async (arguments_: readonly string[]): Promise<CapturedCli> => {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  let stdout = "";
  let stderr = "";
  let application: INestApplicationContext | undefined;

  try {
    process.argv = [...originalArgv.slice(0, 2), ...arguments_];
    process.exitCode = 0;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stderr.write;

    application = await CommandFactory.runWithoutClosing(AppModule, {
      cliName: "kepler",
      serviceErrorHandler: (error) => {
        if (
          error instanceof Error &&
          "code" in error &&
          typeof error.code === "string" &&
          error.code.startsWith("commander.") &&
          "exitCode" in error &&
          error.exitCode === 0
        ) {
          process.exitCode = 0;
          return;
        }
        throw error;
      },
    });

    return { stdout, stderr, exitCode: process.exitCode };
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    await application?.close();
  }
};

describe("v3 root command tree", () => {
  it("builds root help from the Nest command definitions", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: kepler");
    expect(result.stdout).toContain("setup");
    expect(result.stdout).toContain("workbench");
    expect(result.stdout).toContain("git");
    expect(result.stdout).toContain("uuid");
    expect(result.stdout).toContain("mission");
    expect(result.stdout).toContain("lint");
    expect(result.stdout).toContain("audit");
    expect(result.stdout).toContain("workflow");
    expect(result.stderr).toBe("");
  });

  it("creates a mission and prepares its selected workspace through the root CLI", async () => {
    const fixture = await createProject("mission-startup");
    const request = JSON.stringify({
      title: "Prepare the selected capability",
      request: "Implement the requested change in the selected workspace.",
      workflow: "standard",
      recordHomeRepositoryId: "project",
      contexts: [{ reference: "opaque:request", purpose: "Accepted request" }],
      repositories: [{
        repositoryId: "application",
        workspace: { kind: "existing", path: fixture.root },
        branch: { kind: "current" },
        integrationTarget: "main",
      }],
    });

    const result = await withGitEnvironment(fixture.globalConfig, () =>
      runCli(["mission", "create", "--project", fixture.root, "--request", request]),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const response = JSON.parse(result.stdout);
    expect(response).toMatchObject({
      status: "success",
      data: {
        workflow: "standard",
        record_home: fixture.root,
        execution_started: false,
        workspaces: [{
          repository_id: "application",
          context: { kind: "existing" },
          branch: "main",
          integration_target: "refs/heads/main",
          starting_checkpoint: { kind: "commit" },
        }],
      },
    });
    const missionId = response.data.mission_id as string;
    const historyPath = Path.join(fixture.root, ".kepler", "missions", missionId, "history", "construction");
    const files = await Fs.readdir(historyPath);
    const events = (await Fs.readFile(Path.join(historyPath, files[0]!), "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; producer: { name: string; version: string } });
    expect(events.map((event) => event.type)).toEqual([
      "construction.mission-created",
      "construction.mission-workspaces-prepared",
    ]);
    expect(events.map((event) => event.producer)).toEqual([
      { name: "kepler", version: "0.10.3" },
      { name: "kepler", version: "0.10.3" },
    ]);
  });

  it("starts a Construction stage through the root CLI without dispatching work", async () => {
    const fixture = await createProject("stage-start");
    const missionRequest = JSON.stringify({
      title: "Prepare the selected capability",
      request: "Implement the requested change in the selected workspace.",
      workflow: "standard",
      recordHomeRepositoryId: "project",
      contexts: [{ reference: "request:scope", purpose: "Accepted request" }],
      repositories: [{
        repositoryId: "application",
        workspace: { kind: "existing", path: fixture.root },
        branch: { kind: "current" },
        integrationTarget: "main",
      }],
    });
    const missionResult = await withGitEnvironment(fixture.globalConfig, () =>
      runCli(["mission", "create", "--project", fixture.root, "--request", missionRequest]),
    );
    expect(missionResult.exitCode).toBe(0);
    const missionResponse = JSON.parse(missionResult.stdout);
    expect(missionResponse.status).toBe("success");
    const missionId = missionResponse.data.mission_id as string;
    const unitResult = await withGitEnvironment(fixture.globalConfig, () =>
      runCli(["workflow", "construction", "unit", "create", "stage-start", "--mission", missionId, "--project", fixture.root]),
    );
    expect(unitResult.exitCode).toBe(0);
    const unitResponse = JSON.parse(unitResult.stdout);
    expect(unitResponse.status).toBe("success");
    const unitId = unitResponse.data.unit_id as string;
    const request = JSON.stringify({
      inputs: [{ reference: "request:scope", purpose: "Requester scope for Functional Design" }],
    });

    const result = await withGitEnvironment(fixture.globalConfig, () =>
      runCli(["workflow", "construction", "stage", "start", "--unit", unitId, "--stage", "functional-design", "--request", request, "--project", fixture.root]),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "success",
      data: { unit_id: unitId, stage: "functional-design", worker_dispatched: false },
    });
  });

  it("routes Review and Deliver completion requests through their typed providers without appending on stale attempts", async () => {
    const fixture = await createProject("later-stage-completion");
    const missionRequest = JSON.stringify({
      title: "Prepare the selected capability",
      request: "Implement the requested change in the selected workspace.",
      workflow: "standard",
      recordHomeRepositoryId: "project",
      contexts: [{ reference: "request:scope", purpose: "Accepted request" }],
      repositories: [{
        repositoryId: "application",
        workspace: { kind: "existing", path: fixture.root },
        branch: { kind: "current" },
        integrationTarget: "main",
      }],
    });
    const mission = await withGitEnvironment(fixture.globalConfig, () =>
      runCli(["mission", "create", "--project", fixture.root, "--request", missionRequest]),
    );
    expect(mission.exitCode).toBe(0);
    const missionId = JSON.parse(mission.stdout).data.mission_id as string;
    const createdUnit = await withGitEnvironment(fixture.globalConfig, () =>
      runCli(["workflow", "construction", "unit", "create", "later-stage", "--mission", missionId, "--project", fixture.root]),
    );
    expect(createdUnit.exitCode).toBe(0);
    const unitId = JSON.parse(createdUnit.stdout).data.unit_id as string;
    const reviewRequest = {
      implementation_completion_event_id: "10000000-0000-4000-8000-000000000001",
      reviewed_material_bindings: [],
      final_checkpoints: [],
      reviewer: "agent:reviewer",
      implementation_authors: ["agent:builder"],
      implementation_evidence_assessment_id: "60000000-0000-4000-8000-000000000001",
      review_evidence_id: "60000000-0000-4000-8000-000000000002",
      self_review_evidence_id: "60000000-0000-4000-8000-000000000003",
      findings: { blocking: [], limitations: [] },
      additional_review: { requested: false },
      acceptance_required: false,
      handoff: { status: "ready", recipient: "deliver", summary: "Ready for delivery" },
    };
    const deliverRequest = {
      review_completion_event_id: "10000000-0000-4000-8000-000000000002",
      outcome_request_event_id: "10000000-0000-4000-8000-000000000003",
      outcome: "repository-handoff",
      requested_outcome: "Hand the reviewed repository to the recipient",
      destination: "repository:main",
      recipient: "requester",
      artifact_bindings: [],
      reviewed_checkpoints: [],
      preparation_evidence_id: "60000000-0000-4000-8000-000000000004",
      self_review_evidence_id: "60000000-0000-4000-8000-000000000005",
      operation_results: [],
      verification_evidence_ids: [],
      handoff_evidence_id: "60000000-0000-4000-8000-000000000006",
      additional_review: { requested: false },
      approval_required: false,
      handoff: { status: "ready", summary: "Repository handoff is ready" },
    };
    const historyDirectory = Path.join(fixture.root, ".kepler", "missions", missionId, "history");
    for (const [stage, request] of [["unit-of-work-review", reviewRequest], ["deliver", deliverRequest]] as const) {
      const before = await snapshot(historyDirectory);
      const result = await withGitEnvironment(fixture.globalConfig, () => runCli([
        "workflow", "construction", "stage", "complete", "--unit", unitId, "--stage", stage,
        "--attempt", "20000000-0000-4000-8000-000000000099", "--request", JSON.stringify(request), "--project", fixture.root,
      ]));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({ status: "failed", data: { code: "stage_attempt_not_current" } });
      expect(await snapshot(historyDirectory)).toBe(before);
    }
  });

  it("names the mission capability when its subcommand is missing", async () => {
    const result = await runCli(["mission"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "failed",
      data: {
        code: "invalid_arguments",
        message: "mission requires a subcommand.",
      },
    });
  });

  it("includes Construction in generated workflow help", async () => {
    const result = await runCli(["workflow", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: kepler workflow");
    expect(result.stdout).toContain("construction");
    expect(result.stderr).toBe("");
  });

  it("reports an empty capability group through the shared result reporter", async () => {
    const result = await runCli(["audit"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      '{"status":"failed","data":{"code":"invalid_arguments","message":"audit requires a subcommand.","details":{},"recovery":"Select a supported subcommand from --help."}}\n',
    );
  });

  it("generates one UUIDv4 in the command result", async () => {
    const result = await runCli(["uuid"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatch(
      /^\{"status":"success","data":\{"uuid":"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"\}\}\n$/,
    );
  });

  it("reads selected-project Git identity without changing repository files", async () => {
    const fixture = await createProject("author");
    const caller = Path.join(fixture.parent, "caller");
    await Fs.mkdir(caller);
    const previousDirectory = process.cwd();
    const before = await snapshot(fixture.root);
    let result: CapturedCli;
    try {
      process.chdir(caller);
      result = await withGitEnvironment(fixture.globalConfig, () =>
        runCli(["git", "author", "--project", "../project"]),
      );
    } finally {
      process.chdir(previousDirectory);
    }

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "success",
      data: { name: "Ada Lovelace", email: "ada@example.com" },
    });
    expect(await snapshot(fixture.root)).toBe(before);
  });

  it("reports blank and missing Git identity keys without changing the repository", async () => {
    const fixture = await createProject("missing-author");
    runGit(fixture.root, fixture.globalConfig, "config", "user.name", "");
    runGit(fixture.root, fixture.globalConfig, "config", "--unset", "user.email");
    const before = await snapshot(fixture.root);

    const result = await withGitEnvironment(fixture.globalConfig, () =>
      runCli(["git", "author", "--project", fixture.root]),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "failed",
      data: {
        code: "git_identity_missing",
        details: { missing: ["user.name", "user.email"] },
      },
    });
    expect(await snapshot(fixture.root)).toBe(before);
  });

  it("validates only explicit Markdown paths and places findings in failure details", async () => {
    const fixture = await createProject("lint");
    await Fs.mkdir(Path.join(fixture.root, "docs"));
    await Fs.writeFile(
      Path.join(fixture.root, "docs", "valid.md"),
      "---\nid: 11111111-1111-4111-8111-111111111111\ntype: project-reference\nschema_version: 3\nauthor: Ada Lovelace <ada@example.com>\n---\n# Reference\n",
    );
    const invalidPath = Path.join(fixture.root, "docs", "invalid.md");
    const invalidSource = "---\nid: invalid\ntype: project-reference\nschema_version: 3\nauthor: Ada Lovelace <ada@example.com>\n---\n# Invalid\n";
    await Fs.writeFile(invalidPath, invalidSource);
    await Fs.writeFile(Path.join(fixture.root, "docs", "unselected.md"), "---\ninvalid: true\n---\n");
    const before = await snapshot(fixture.root);

    const valid = await withGitEnvironment(fixture.globalConfig, () =>
      runCli(["lint", "docs/valid.md", "--project", fixture.root]),
    );
    const invalid = await withGitEnvironment(fixture.globalConfig, () =>
      runCli(["lint", "docs/invalid.md", "--project", fixture.root]),
    );

    expect(valid.exitCode).toBe(0);
    expect(valid.stderr).toBe("");
    expect(JSON.parse(valid.stdout)).toEqual({
      status: "success",
      data: { findings: [] },
    });
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toBe("");
    expect(JSON.parse(invalid.stdout)).toMatchObject({
      status: "failed",
      data: {
        code: "metadata_validation_failed",
        details: {
          findings: [
            { path: "docs/invalid.md", field: "id", code: "invalid-id" },
          ],
        },
      },
    });
    expect(await Fs.readFile(invalidPath, "utf8")).toBe(invalidSource);
    expect(await snapshot(fixture.root)).toBe(before);
  });

  it("rejects repeated --project flags through the shared CLI result boundary", async () => {
    const result = await runCli([
      "git",
      "author",
      "--project",
      "/one",
      "--project",
      "/two",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "failed",
      data: { code: "duplicate_selector", details: { selector: "project" } },
    });
  });
});
