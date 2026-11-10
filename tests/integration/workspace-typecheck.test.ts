import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = Path.resolve(import.meta.dirname, "../..");
const temporaryRoots: string[] = [];

function createWorkspace(): string {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-workspace-typecheck-"));
  temporaryRoots.push(root);
  const manifest = JSON.parse(Fs.readFileSync(Path.join(repositoryRoot, "package.json"), "utf8"));
  const coreManifest = JSON.parse(Fs.readFileSync(Path.join(repositoryRoot, "packages/core/package.json"), "utf8"));
  for (const directory of ["packages/core/src", "tests", "node_modules/@vialactea-works", "home", "tmp"]) {
    Fs.mkdirSync(Path.join(root, directory), { recursive: true });
  }
  Fs.writeFileSync(Path.join(root, "package.json"), JSON.stringify({
    private: true,
    type: "module",
    workspaces: ["packages/*"],
    scripts: {
      typecheck: manifest.scripts.typecheck,
      "build:core": manifest.scripts["build:core"],
    },
  }));
  Fs.writeFileSync(Path.join(root, "packages/core/package.json"), JSON.stringify({
    name: coreManifest.name,
    version: coreManifest.version,
    type: coreManifest.type,
    exports: coreManifest.exports,
    scripts: { build: coreManifest.scripts.build },
  }));
  const compilerOptions = {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    skipLibCheck: true,
    lib: ["ES2022"],
    types: [],
  };
  Fs.writeFileSync(Path.join(root, "packages/core/tsconfig.json"), JSON.stringify({
    compilerOptions: { ...compilerOptions, declaration: true, rootDir: "src", outDir: "dist" },
    include: ["src/**/*.ts"],
  }));
  Fs.writeFileSync(Path.join(root, "tsconfig.tests.json"), JSON.stringify({
    compilerOptions: { ...compilerOptions, noEmit: true },
    include: ["tests/**/*.ts"],
  }));
  Fs.writeFileSync(Path.join(root, "packages/core/src/index.ts"), "export interface WorkspaceValue { value: string }\n");
  Fs.writeFileSync(Path.join(root, "tests/consumer.ts"), [
    'import type { WorkspaceValue } from "@vialactea-works/kepler-core";',
    'export const value: WorkspaceValue = { value: "checked" };',
    "",
  ].join("\n"));
  Fs.symlinkSync(Path.join(root, "packages/core"), Path.join(root, "node_modules/@vialactea-works/kepler-core"), "dir");
  return root;
}

function typecheck(root: string) {
  return execa(process.execPath, ["run", "typecheck"], {
    cwd: root,
    env: {
      PATH: `${Path.join(repositoryRoot, "node_modules/.bin")}${Path.delimiter}${process.env.PATH ?? "/usr/bin:/bin"}`,
      HOME: Path.join(root, "home"),
      TMPDIR: Path.join(root, "tmp"),
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: Path.join(root, "cache"),
    },
    extendEnv: false,
    reject: false,
    timeout: 30_000,
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) Fs.rmSync(root, { recursive: true, force: true });
});

describe("workspace typecheck command", () => {
  it("builds missing Core declarations before checking a workspace consumer", async () => {
    const root = createWorkspace();
    expect(Fs.existsSync(Path.join(root, "packages/core/dist"))).toBe(false);
    const result = await typecheck(root);
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(Fs.existsSync(Path.join(root, "packages/core/dist/index.d.ts"))).toBe(true);
  });

  it("reports consumer type errors after preparing Core declarations", async () => {
    const root = createWorkspace();
    Fs.writeFileSync(Path.join(root, "tests/consumer.ts"), [
      'import type { WorkspaceValue } from "@vialactea-works/kepler-core";',
      "export const value: WorkspaceValue = { value: 42 };",
      "",
    ].join("\n"));
    const result = await typecheck(root);
    expect(Fs.existsSync(Path.join(root, "packages/core/dist/index.d.ts"))).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("TS2322");
  });
});
