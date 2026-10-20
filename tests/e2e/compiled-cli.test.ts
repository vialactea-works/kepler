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

const createHarness = async (): Promise<E2EHarness> => {
  const harness = await createE2EHarness({ application: "docker" });
  harnesses.push(harness);
  return harness;
};

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.cleanup();
});

describe("compiled CLI E2E", () => {
  it("runs the compiled CLI without inheriting host Docker or Git settings", async () => {
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
      expect(result.stdout).toContain("Kepler set up successfully.");
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

  it("reports a setup failure for an invalid home and removes its resources", () => {
    const harness = createHarness();
    return harness.then(async (e2e) => {
      const invalidHome = Path.join(e2e.resources.rootDirectory, "home-file");
      await Fs.writeFile(invalidHome, "not a directory\n");
      const result = e2e.cli.run(["setup"], {
        env: {
          HOME: invalidHome,
          XDG_CONFIG_HOME: Path.join(invalidHome, ".config"),
        },
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Setup failed:");
    });
  }, 120_000);
});
