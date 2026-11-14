import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createE2EHarness, type E2EHarness } from "./harness.js";

const harnesses: E2EHarness[] = [];
const missionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rawControl = "private recovery source bytes that must not be printed";

const envelope = (stdout: string): { status: string; data: Record<string, unknown> } => {
  expect(stdout.endsWith("\n")).toBe(true);
  const result = JSON.parse(stdout) as {
    status: string;
    data: Record<string, unknown>;
  };
  expect(Object.keys(result)).toEqual(["status", "data"]);
  return result;
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
        entries.push(`${relative}:file:${stat.mtimeMs}:${(await Fs.readFile(path)).toString("base64")}`);
      }
    }
  };
  await visit(root);
  return entries.join("\n");
};

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.cleanup();
});

describe.each(["native", "docker"] as const)("recovery read commands (%s)", (application) => {
  it("wires inspect and status to raw history inspection without changing the selected repository", async () => {
    const harness = await createE2EHarness({ application });
    harnesses.push(harness);
    const repository = harness.resources.repositoryDirectory;
    const controlPath = Path.join(
      repository,
      ".kepler",
      "missions",
      missionId,
      "history",
      "control",
      "active.json",
    );
    await Fs.mkdir(Path.dirname(controlPath), { recursive: true });
    await Fs.writeFile(Path.join(repository, ".kepler", "marker"), "v3\n");
    await Fs.writeFile(controlPath, rawControl);
    const before = await snapshot(repository);

    const inspect = harness.cli.run([
      "recovery",
      "inspect",
      "--project",
      repository,
      "--mission",
      missionId,
    ]);
    const status = harness.cli.run([
      "recovery",
      "status",
      "--project",
      repository,
      "--mission",
      missionId,
    ]);

    const inspected = envelope(inspect.stdout);
    const reported = envelope(status.stdout);
    expect(inspect.exitCode).toBe(0);
    expect(status.exitCode).toBe(0);
    expect(inspect.stderr).toBe("");
    expect(status.stderr).toBe("");
    expect(inspected.status).toBe("success");
    expect(inspected.data).toEqual(reported.data);
    expect(inspected.data).toMatchObject({
      mission_id: missionId,
      record_home: application === "docker" ? "/test/repository" : repository,
      execution_started: false,
      selection_status: "blocked",
    });
    expect(inspected.data.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "history_control_invalid" }),
    ]));
    expect(inspect.stdout).not.toContain(rawControl);
    expect(status.stdout).not.toContain(rawControl);
    expect(await snapshot(repository)).toBe(before);
  }, 120_000);
});
