import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import * as Path from "node:path";
import { VERSION } from "../../src/index.js";
import type { CommandResult } from "../e2e/connectors.js";
import { createE2EHarness, type E2EHarness } from "../e2e/harness.js";

const projectRoot = Path.resolve(".");
const cliPackage = JSON.parse(
  Fs.readFileSync(Path.join(projectRoot, "packages/cli/package.json"), "utf8"),
) as { bin: Record<string, string> };

let harness: E2EHarness;

const runCli = (arguments_: string[], env: NodeJS.ProcessEnv = {}) =>
  harness.cli.run(arguments_, { cwd: projectRoot, env });

const expectUsageFailure = (result: CommandResult) => {
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr.match(/error:/g) ?? []).toHaveLength(1);
};

beforeEach(async () => {
  harness = await createE2EHarness({ application: "docker" });
});

afterEach(async () => {
  await harness.cleanup();
});

describe("main CLI", () => {
  it("prints the existing root message without arguments", () => {
    const result = runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      "Kepler - Template setup CLI\n\nUse --help for available commands\n",
    );
    expect(result.stderr).toBe("");
  });

  it("publishes only the Kepler executable and rejects the old command name", () => {
    expect(cliPackage.bin).toEqual({ kepler: "./dist/cli/main.js" });

    const result = runCli(["hamilton"]);

    expectUsageFailure(result);
    expect(result.stderr).toContain("unknown command 'hamilton'");
  });

  it("shows supported root commands without retired global flags", () => {
    const result = runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: kepler");
    expect(result.stdout).toContain("setup");
    expect(result.stdout).toContain("workbench");
    expect(result.stdout).not.toContain("--completions");
    expect(result.stdout).not.toContain("--log-level");
    expect(result.stdout).not.toContain("--wizard");
    expect(result.stderr).toBe("");
  });

  it("prints the canonical project version", () => {
    const result = runCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${VERSION}\n`);
    expect(result.stderr).toBe("");
  });

  it("rejects unknown root commands and options before setup can run", () => {
    const invalidHome = Path.join(harness.resources.rootDirectory, "home-file");
    Fs.writeFileSync(invalidHome, "not a directory");

    const unknownCommand = runCli(["unknown-command"], { HOME: invalidHome });
    const unknownOption = runCli(["setup", "--unknown"], {
      HOME: invalidHome,
    });

    expectUsageFailure(unknownCommand);
    expect(unknownCommand.stderr).toContain(
      "unknown command 'unknown-command'",
    );
    expectUsageFailure(unknownOption);
    expect(unknownOption.stderr).toContain("unknown option '--unknown'");
    expect(unknownOption.stderr).not.toContain("Setup failed:");
  });

  it("rejects retired Effect global flags before setup can run", () => {
    const invalidHome = Path.join(harness.resources.rootDirectory, "home-file");
    Fs.writeFileSync(invalidHome, "not a directory");

    for (const arguments_ of [
      ["setup", "--completions", "bash"],
      ["setup", "--log-level", "info"],
      ["setup", "--wizard", "false"],
    ]) {
      const result = runCli(arguments_, { HOME: invalidHome });

      expectUsageFailure(result);
      expect(result.stderr).toMatch(
        /unknown option '--(completions|log-level|wizard)'/,
      );
      expect(result.stderr).not.toContain("Setup failed:");
    }
  });

  it("rejects surplus setup positionals before setup runs", () => {
    const invalidHome = Path.join(harness.resources.rootDirectory, "home-file");
    Fs.writeFileSync(invalidHome, "not a directory");

    const result = runCli(["setup", "extra-arg"], { HOME: invalidHome });

    expectUsageFailure(result);
    expect(result.stderr).toContain("too many arguments");
    expect(result.stderr).not.toContain("Setup failed:");
  });

  it("reports setup filesystem failures once with exit code 2", () => {
    const invalidHome = Path.join(harness.resources.rootDirectory, "home-file");
    Fs.writeFileSync(invalidHome, "not a directory");

    const result = runCli(["setup"], { HOME: invalidHome });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr.match(/Setup failed:/g) ?? []).toHaveLength(1);
  });
});
