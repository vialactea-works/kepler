import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeCheckRunner } from "../../packages/cli/src/construction/check-runner.js";

const runner = createNodeCheckRunner();
let repositoryPath = "";

beforeAll(async () => {
  repositoryPath = await mkdtemp(join(tmpdir(), "kepler check runner "));
});

afterAll(async () => {
  if (repositoryPath !== "") await rm(repositoryPath, { recursive: true, force: true });
});

const request = (
  executable: string,
  argv: readonly string[],
) => ({
  cwd: { repository_id: "application", path: repositoryPath },
  executable,
  argv,
});

describe("no-shell construction check runner", () => {
  it("preserves argument boundaries and uses the repository-qualified cwd", async () => {
    const argv = ["first", "two words", "&&", "$(not interpreted)", "semi;colon"];
    const script = "process.stdout.write(JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(1) }))";

    const result = await runner.run(request(process.execPath, ["-e", script, ...argv]));

    expect(result).toEqual({
      kind: "completed",
      exitCode: 0,
      stdout: JSON.stringify({ cwd: repositoryPath, argv }),
      stderr: "",
    });
  });

  it("returns output for a successful process", async () => {
    const result = await runner.run(
      request(process.execPath, [
        "-e",
        "process.stdout.write('check output'); process.stderr.write('check warning')",
      ]),
    );

    expect(result).toEqual({
      kind: "completed",
      exitCode: 0,
      stdout: "check output",
      stderr: "check warning",
    });
  });

  it("returns output and the non-zero exit code", async () => {
    const result = await runner.run(
      request(process.execPath, [
        "-e",
        "process.stdout.write('partial output'); process.stderr.write('check failed'); process.exitCode = 7",
      ]),
    );

    expect(result).toEqual({
      kind: "completed",
      exitCode: 7,
      stdout: "partial output",
      stderr: "check failed",
    });
  });

  it("returns a structured failure when the executable cannot be spawned", async () => {
    const result = await runner.run(
      request(join(repositoryPath, "missing executable"), []),
    );

    expect(result).toEqual({
      kind: "spawn-failed",
      error: expect.objectContaining({ code: "ENOENT" }),
      stdout: "",
      stderr: "",
    });
  });
});
