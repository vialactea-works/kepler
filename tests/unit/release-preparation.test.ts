import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkReleaseConsistency,
  prepareRelease,
} from "../../scripts/release-preparation.js";

const skillIds = [
  "kepler-design",
  "kepler-quality",
  "kepler-plan",
  "kepler-orchestrate",
  "kepler-code",
  "kepler-code-feedback",
  "kepler-review",
  "kepler-finish-work",
  "kepler-grilling",
  "kepler-domain-modelling",
  "kepler-research",
];
const roles = [
  ["architect", "kepler-architect"],
  ["orchestrator", "kepler-orchestrator"],
  ["coder", "kepler-coder"],
  ["reviewer", "kepler-reviewer"],
];
const temporaryRoots: string[] = [];

function write(root: string, path: string, contents: string): void {
  const target = Path.join(root, path);
  Fs.mkdirSync(Path.dirname(target), { recursive: true });
  Fs.writeFileSync(target, contents);
}

function fixtureRepository(existingReleaseNote = false): string {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-release-prepare-"));
  temporaryRoots.push(root);
  write(root, "package.json", JSON.stringify({ name: "kepler", version: "0.11.0" }, null, 2) + "\n");
  write(root, "packages/core/package.json", JSON.stringify({ version: "0.11.0" }, null, 2) + "\n");
  write(root, "packages/cli/package.json", JSON.stringify({ version: "0.11.0" }, null, 2) + "\n");
  write(root, "src/index.ts", 'export const VERSION = "0.11.0"\n');
  write(root, "packages/cli/src/cli/version.ts", 'export const CLI_RELEASE = "0.11.0";\n');
  write(root, "packages/core/src/artifact.ts", "export const CONSTRUCTION_SCHEMA_VERSION = 3 as const;\n");
  for (const path of [
    "templates/v3/construction/unit-of-work.md",
    "templates/v3/construction/design.md",
    "templates/v3/construction/quality.md",
    "templates/v3/construction/plan.md",
    "templates/v3/construction/delivery.md",
    "templates/v3/construction/supporting-document.md",
  ]) write(root, `bundle/${path}`, `# ${path}\n`);
  write(root, "bundle/guidelines/general/style.md", "# Style\n");
  for (const host of ["pi", "claude-code"]) {
    for (const [, agentId] of roles) {
      write(root, `bundle/agents/${host}/v1/${agentId}.md`, `---\nname: ${agentId}\ndescription: role\n---\n`);
    }
  }
  for (const id of skillIds) {
    write(root, `skills/${id}/SKILL.md`, `---\nname: ${id}\ndescription: skill\n---\n`);
  }
  if (existingReleaseNote) write(root, "docs/releases/3.0.0.md", "# Existing note\n");
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("release preparation", () => {
  it("derives all current metadata and prepares a complete resource package", () => {
    const root = fixtureRepository(true);
    const originalNote = Fs.readFileSync(Path.join(root, "docs/releases/3.0.0.md"), "utf8");

    const prepared = prepareRelease(root, "3.0.0");
    const checked = checkReleaseConsistency(root);

    expect(prepared.version).toBe("3.0.0");
    expect(checked).toMatchObject({ version: "3.0.0", schemaVersion: 3 });
    expect(checked.resourceDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    for (const path of [
      "package.json",
      "packages/core/package.json",
      "packages/cli/package.json",
      "src/index.ts",
      "packages/cli/src/cli/version.ts",
      "bundle/manifest.json",
    ]) expect(prepared.changedFiles).toContain(path);
    expect(Fs.readFileSync(Path.join(root, "docs/releases/3.0.0.md"), "utf8")).toBe(originalNote);
    expect(checkReleaseConsistency(root).staleFiles).toEqual([]);
  });

  it("keeps schema 3 on patch/minor releases and blocks unproven major compatibility", () => {
    const minorRoot = fixtureRepository();
    prepareRelease(minorRoot, "3.1.0");
    expect(checkReleaseConsistency(minorRoot)).toMatchObject({ version: "3.1.0", schemaVersion: 3 });

    const majorRoot = fixtureRepository();
    prepareRelease(majorRoot, "4.0.0");
    expect(() => checkReleaseConsistency(majorRoot)).toThrow(
      "No tested compatibility evidence",
    );
  });

  it("rejects a lower target before changing any repository file", () => {
    const root = fixtureRepository();
    const before = Fs.readFileSync(Path.join(root, "package.json"), "utf8");

    expect(() => prepareRelease(root, "0.10.0")).toThrow("must not be lower");
    expect(Fs.readFileSync(Path.join(root, "package.json"), "utf8")).toBe(before);
  });

  it("refreshes equal-version derived outputs without changing coherent bytes", () => {
    const root = fixtureRepository();
    prepareRelease(root, "3.0.0");
    const repeated = prepareRelease(root, "3.0.0");

    expect(repeated.changedFiles).toEqual([]);
  });
});
