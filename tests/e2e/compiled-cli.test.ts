import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createE2EHarness, type E2EHarness } from "./harness.js";

const harnesses: E2EHarness[] = [];

const exists = async (path: string): Promise<boolean> => {
  try {
    await Fs.access(path);
    return true;
  } catch {
    return false;
  }
};

const createHarness = async (
  application: "docker" | "native" = "docker",
): Promise<E2EHarness> => {
  const harness = await createE2EHarness({ application });
  harnesses.push(harness);
  return harness;
};

const envelope = (stdout: string): { status: string; data: Record<string, unknown> } => {
  expect(stdout.endsWith("\n")).toBe(true);
  const result = JSON.parse(stdout) as {
    status: string;
    data: Record<string, unknown>;
  };
  expect(Object.keys(result)).toEqual(["status", "data"]);
  return result;
};

const addProjectMarker = async (root: string): Promise<void> => {
  await Fs.mkdir(Path.join(root, ".kepler"), { recursive: true });
  await Fs.writeFile(Path.join(root, ".kepler", "marker"), "v3\n");
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

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.cleanup();
});

describe("compiled CLI E2E", () => {
  it("runs setup and returns structured output without inheriting host Docker or Git settings", async () => {
    const originalEnvironment = {
      DOCKER_CONTEXT: process.env.DOCKER_CONTEXT,
      DOCKER_HOST: process.env.DOCKER_HOST,
      GIT_DIR: process.env.GIT_DIR,
      GIT_WORK_TREE: process.env.GIT_WORK_TREE,
    };
    process.env.DOCKER_CONTEXT = "kepler-e2e-unavailable-context";
    process.env.DOCKER_HOST = "tcp://127.0.0.1:9";
    process.env.GIT_DIR = "/kepler-e2e-unavailable-git-dir";
    process.env.GIT_WORK_TREE = "/kepler-e2e-unavailable-work-tree";

    try {
      const e2e = await createHarness();
      const head = e2e.resources.runGit(
        e2e.resources.repositoryDirectory,
        "rev-parse",
        "HEAD",
      );
      expect(head).toMatch(/^[0-9a-f]{40}$/);
      const result = e2e.cli.run(["setup"]);
      expect(result).toMatchObject({ exitCode: 0, stderr: "" });
      expect(envelope(result.stdout)).toMatchObject({
        status: "success",
        data: { output: expect.stringContaining("Kepler set up successfully.") },
      });
      expect(
        await exists(
          Path.join(
            e2e.resources.configDirectory,
            "vialactea-works",
            "kepler",
            "templates",
            "plan.md",
          ),
        ),
      ).toBe(true);
    } finally {
      for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 120_000);

  it("reports setup failures in the shared result envelope", async () => {
    const e2e = await createHarness();
    const invalidHome = Path.join(e2e.resources.rootDirectory, "home-file");
    await Fs.writeFile(invalidHome, "not a directory\n");
    const result = e2e.cli.run(["setup"], {
      env: {
        HOME: invalidHome,
        XDG_CONFIG_HOME: Path.join(invalidHome, ".config"),
      },
    });
    const parsed = envelope(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(parsed.status).toBe("failed");
    expect(parsed.data).toMatchObject({
      code: "operation_failed",
      message: expect.stringContaining("Setup failed:"),
      details: {},
      recovery: expect.any(String),
    });
    expect(result.stderr).toContain("Setup failed:");
  }, 120_000);

  it("keeps legacy workbench operation output inside the JSON result envelope", async () => {
    const e2e = await createHarness("native");
    const file = Path.join(e2e.resources.rootDirectory, "legacy-note.md");
    await Fs.writeFile(file, "# Note\n");

    const success = e2e.cli.run(["workbench", "lint", "--file", file]);
    const successfulEnvelope = envelope(success.stdout);
    expect(success.exitCode).toBe(0);
    expect(success.stderr).toBe("");
    expect(successfulEnvelope.status).toBe("success");
    expect(Object.keys(successfulEnvelope.data)).toEqual(["output"]);
    expect(successfulEnvelope.data.output).toContain("SKIPPED");
    expect(successfulEnvelope.data.output).toContain("lint: success");

    const failure = e2e.cli.run(["workbench", "lint"]);
    const failedEnvelope = envelope(failure.stdout);
    expect(failure.exitCode).toBe(1);
    expect(failedEnvelope.status).toBe("failed");
    expect(Object.keys(failedEnvelope.data).sort()).toEqual([
      "code",
      "details",
      "message",
      "recovery",
    ]);
    expect(failedEnvelope.data).toMatchObject({
      code: "operation_failed",
      message: "error: lint requires exactly one of --file or --change-dir",
      details: {},
    });
    expect(failure.stderr).toBe(
      "error: lint requires exactly one of --file or --change-dir\n",
    );
  }, 120_000);

  it("publishes root capabilities from parser definitions and handles parser failures as structured results", async () => {
    const e2e = await createHarness();
    const help = e2e.cli.run(["--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stderr).toBe("");
    for (const command of ["setup", "uuid", "workbench", "git", "lint", "audit", "workflow"]) {
      expect(help.stdout).toContain(command);
    }
    const constructionHelp = e2e.cli.run(["workflow", "construction", "--help"]);
    expect(constructionHelp.exitCode).toBe(0);
    expect(constructionHelp.stdout).toContain("stage");
    expect(constructionHelp.stdout).toContain("task");
    expect(constructionHelp.stdout).toContain("activity");
    expect(constructionHelp.stdout).toContain("lint");
    const taskHelp = e2e.cli.run(["workflow", "construction", "task", "--help"]);
    expect(taskHelp.exitCode).toBe(0);
    for (const operation of ["list", "show", "ready"]) expect(taskHelp.stdout).toContain(operation);
    const taskScopeFailure = e2e.cli.run(["workflow", "construction", "task", "ready", "--task", "33333333-3333-4333-8333-333333333333"]);
    expect(taskScopeFailure.exitCode).toBe(1);
    expect(envelope(taskScopeFailure.stdout)).toMatchObject({
      status: "failed",
      data: { code: "required_selector_missing", message: "--task requires --unit." },
    });
    const lintE2e = await createHarness("native");
    const repository = lintE2e.resources.repositoryDirectory;
    await addProjectMarker(repository);
    const lintFailure = lintE2e.cli.run(["workflow", "construction", "lint", "--unit", "missing-unit", "--project", repository]);
    expect(lintFailure.exitCode).toBe(1);
    expect(envelope(lintFailure.stdout)).toMatchObject({ status: "failed", data: { code: "unit_not_found" } });

    const failure = e2e.cli.run(["unknown-command"]);
    const parsed = envelope(failure.stdout);
    expect(failure.exitCode).toBe(1);
    expect(parsed.status).toBe("failed");
    expect(parsed.data).toMatchObject({
      code: "invalid_arguments",
      message: expect.any(String),
      details: {},
      recovery: expect.any(String),
    });
    expect(failure.stderr).toContain("unknown command");

    const removedOption = e2e.cli.run(["setup", "--force"]);
    const removedOptionEnvelope = envelope(removedOption.stdout);
    expect(removedOption.exitCode).toBe(1);
    expect(removedOptionEnvelope).toMatchObject({
      status: "failed",
      data: {
        code: "invalid_arguments",
        message: expect.stringContaining("--force"),
      },
    });
    expect(removedOption.stderr).toContain("--force");
  }, 120_000);

  it("lists and shows known unbound units through the compiled CLI without writing state", async () => {
    const e2e = await createHarness("native");
    const repository = e2e.resources.repositoryDirectory;
    await addProjectMarker(repository);
    await Fs.mkdir(Path.join(repository, ".kepler", "units-of-work", "unbound-unit"), { recursive: true });
    const before = await snapshot(repository);

    const listed = e2e.cli.run(["workflow", "construction", "unit", "list", "--project", repository]);
    const shown = e2e.cli.run(["workflow", "construction", "unit", "show", "--unit", "unbound-unit", "--project", repository]);
    const missing = e2e.cli.run(["workflow", "construction", "unit", "show", "--unit", "unknown-unit", "--project", repository]);
    const after = await snapshot(repository);

    expect(listed.exitCode).toBe(0);
    expect(envelope(listed.stdout)).toMatchObject({
      status: "success",
      data: { units: [{ unit_id: "unbound-unit", membership: { status: "missing" } }] },
    });
    expect(shown.exitCode).toBe(0);
    expect(envelope(shown.stdout)).toMatchObject({
      status: "success",
      data: { unit: { unit_id: "unbound-unit", membership: { status: "missing" } } },
    });
    expect(missing.exitCode).toBe(1);
    expect(envelope(missing.stdout)).toMatchObject({
      status: "failed",
      data: { code: "unit_not_found" },
    });
    expect(after).toBe(before);
  }, 120_000);

  it("returns one UUIDv4 in the compiled CLI result", async () => {
    const e2e = await createHarness();
    const result = e2e.cli.run(["uuid"]);
    const parsed = envelope(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parsed).toMatchObject({ status: "success" });
    expect(parsed.data.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  }, 120_000);

  it("resolves relative project paths despite Git overrides and accepts linked worktrees read-only", async () => {
    const e2e = await createHarness("native");
    const repository = e2e.resources.repositoryDirectory;
    const caller = Path.join(e2e.resources.rootDirectory, "caller");
    const linked = Path.join(e2e.resources.rootDirectory, "linked-worktree");
    await addProjectMarker(repository);
    await Fs.mkdir(caller);
    e2e.resources.runGit(
      repository,
      "worktree",
      "add",
      "-q",
      "-b",
      "linked-branch",
      linked,
    );
    await addProjectMarker(linked);
    expect((await Fs.lstat(Path.join(linked, ".git"))).isFile()).toBe(true);
    const repositoryBefore = await snapshot(repository);
    const linkedBefore = await snapshot(linked);

    const mainResult = e2e.cli.run(
      ["git", "author", "--project", "../repository"],
      {
        cwd: caller,
        env: {
          GIT_DIR: "/kepler-e2e-unavailable-git-dir",
          GIT_WORK_TREE: "/kepler-e2e-unavailable-work-tree",
          GIT_COMMON_DIR: "/kepler-e2e-unavailable-common-dir",
          GIT_INDEX_FILE: "/kepler-e2e-unavailable-index",
        },
      },
    );
    const linkedResult = e2e.cli.run(
      ["git", "author", "--project", "../linked-worktree"],
      { cwd: caller },
    );

    expect(mainResult.exitCode).toBe(0);
    expect(mainResult.stderr).toBe("");
    expect(envelope(mainResult.stdout)).toMatchObject({
      status: "success",
      data: { name: "Kepler E2E Fixture", email: "e2e@example.invalid" },
    });
    expect(linkedResult.exitCode).toBe(0);
    expect(linkedResult.stderr).toBe("");
    expect(envelope(linkedResult.stdout)).toMatchObject({
      status: "success",
      data: { name: "Kepler E2E Fixture", email: "e2e@example.invalid" },
    });
    expect(await snapshot(repository)).toBe(repositoryBefore);
    expect(await snapshot(linked)).toBe(linkedBefore);
  }, 120_000);

  it("returns structured failures for invalid roots and duplicate project flags without writes", async () => {
    const e2e = await createHarness("native");
    const repository = e2e.resources.repositoryDirectory;
    await addProjectMarker(repository);
    const caller = Path.join(e2e.resources.rootDirectory, "caller");
    await Fs.mkdir(caller);
    const nested = Path.join(repository, ".kepler");
    const unmarked = Path.join(e2e.resources.rootDirectory, "unmarked");
    const bare = Path.join(e2e.resources.rootDirectory, "bare.git");
    await Fs.mkdir(unmarked);
    e2e.resources.runGit(unmarked, "init", "-q", "-b", "main");
    e2e.resources.runGit(e2e.resources.rootDirectory, "init", "--bare", "-q", bare);
    const unmarkedBefore = await snapshot(unmarked);
    const bareBefore = await snapshot(bare);

    const nestedResult = e2e.cli.run(["git", "author", "--project", nested]);
    const unmarkedResult = e2e.cli.run(["git", "author", "--project", unmarked]);
    const bareResult = e2e.cli.run(["git", "author", "--project", bare]);
    const duplicateResult = e2e.cli.run(
      ["git", "author", "--project", repository, "--project", bare],
      { cwd: caller },
    );

    for (const result of [nestedResult, unmarkedResult, bareResult, duplicateResult]) {
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      const failure = envelope(result.stdout);
      expect(failure.status).toBe("failed");
      expect(Object.keys(failure.data).sort()).toEqual([
        "code",
        "details",
        "message",
        "recovery",
      ]);
    }
    expect(envelope(nestedResult.stdout).data.code).toBe("project_not_root");
    expect(envelope(unmarkedResult.stdout).data.code).toBe("kepler_directory_missing");
    expect(envelope(bareResult.stdout).data.code).toBe("bare_repository");
    expect(envelope(duplicateResult.stdout).data.code).toBe("duplicate_selector");
    expect(await exists(Path.join(unmarked, ".kepler"))).toBe(false);
    expect(await snapshot(unmarked)).toBe(unmarkedBefore);
    expect(await snapshot(bare)).toBe(bareBefore);
  }, 120_000);

  it("lints only explicit Markdown files and returns findings under the shared failure envelope", async () => {
    const e2e = await createHarness("native");
    const repository = e2e.resources.repositoryDirectory;
    await addProjectMarker(repository);
    const docs = Path.join(repository, "docs");
    await Fs.mkdir(docs);
    const validPath = Path.join(docs, "reference.md");
    const invalidPath = Path.join(docs, "invalid.md");
    const validSource = "---\nid: 11111111-1111-4111-8111-111111111111\ntype: project-reference\nschema_version: 3\nauthor: Ada Lovelace <ada@example.com>\n---\n# Reference\n";
    const invalidSource = "---\nid: invalid\ntype: project-reference\nschema_version: 3\nauthor: Ada Lovelace <ada@example.com>\n---\n# Invalid\n";
    await Fs.writeFile(validPath, validSource);
    await Fs.writeFile(invalidPath, invalidSource);
    await Fs.writeFile(Path.join(docs, "unselected.md"), "not frontmatter\n");
    const before = await snapshot(repository);

    const valid = e2e.cli.run(["lint", "docs/reference.md", "--project", repository]);
    const invalid = e2e.cli.run(["lint", "docs/invalid.md", "--project", repository]);

    expect(valid.exitCode).toBe(0);
    expect(valid.stderr).toBe("");
    expect(envelope(valid.stdout)).toEqual({
      status: "success",
      data: { findings: [] },
    });
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toBe("");
    expect(envelope(invalid.stdout)).toMatchObject({
      status: "failed",
      data: {
        code: "metadata_validation_failed",
        details: {
          findings: [{ path: "docs/invalid.md", field: "id", code: "invalid-id" }],
        },
      },
    });
    expect(await Fs.readFile(invalidPath, "utf8")).toBe(invalidSource);
    expect(await snapshot(repository)).toBe(before);
  }, 120_000);

  it("reports blank or missing Git identity without writes", async () => {
    const e2e = await createHarness("native");
    const repository = e2e.resources.repositoryDirectory;
    await addProjectMarker(repository);
    e2e.resources.runGit(repository, "config", "user.name", "  ");
    e2e.resources.runGit(repository, "config", "--unset", "user.email");
    const before = await snapshot(repository);

    const result = e2e.cli.run(["git", "author"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(envelope(result.stdout)).toMatchObject({
      status: "failed",
      data: {
        code: "git_identity_missing",
        details: { missing: ["user.name", "user.email"] },
      },
    });
    expect(await snapshot(repository)).toBe(before);
  }, 120_000);
});
