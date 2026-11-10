import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = Path.resolve(import.meta.dirname, "../..");
const temporaryRoots: string[] = [];

function makeTemporaryRoot(): string {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-e2e-admission-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("generic E2E admission", () => {
  it("does not import exact-archive tests when CI runs the generic E2E project without archive inputs", async () => {
    const packageManifest = JSON.parse(Fs.readFileSync(Path.join(repositoryRoot, "package.json"), "utf8")) as {
      readonly scripts?: Readonly<Record<string, string>>;
    };
    const command = packageManifest.scripts?.["test:e2e"];
    if (!command) throw new Error("The generic E2E command is missing");
    const vitestCommand = command.split("&&").at(-1)?.trim();
    if (!vitestCommand) throw new Error("The generic E2E command has no Vitest invocation");
    const exclusions = [...vitestCommand.matchAll(/--exclude\s+(\S+)/g)].map((match) => match[1] as string);
    expect(exclusions).toContain("tests/e2e/release-archive.test.ts");

    const root = makeTemporaryRoot();
    const result = await execa(process.execPath, [
      "--bun",
      "vitest",
      "run",
      "--project",
      "e2e",
      ...exclusions.flatMap((path) => ["--exclude", path]),
      "--passWithNoTests",
      "tests/e2e/release-archive.test.ts",
    ], {
      cwd: repositoryRoot,
      env: {
        CI: "true",
        PATH: [Path.dirname(process.execPath), "/usr/bin", "/bin"].join(Path.delimiter),
        HOME: Path.join(root, "home"),
        TMPDIR: Path.join(root, "tmp"),
        TZ: "UTC",
      },
      extendEnv: false,
      reject: false,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("No test files found, exiting with code 0");
  });
});
