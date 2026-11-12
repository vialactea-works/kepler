import * as Fs from "node:fs";
import * as Path from "node:path";
import { describe, expect, it } from "vitest";
import { planResourceGeneration } from "../../scripts/resource-generation.js";
import { validateResourcePackage } from "../../packages/cli/src/cli/release-resources.js";
import { VERSION } from "../../src/index.js";

const root = Path.resolve(import.meta.dirname, "../..");
const requiredSkills = [
  "kepler-mission-startup", "kepler-design", "kepler-quality", "kepler-plan",
  "kepler-orchestrate", "kepler-code", "kepler-code-feedback", "kepler-review", "kepler-finish-work",
];
const supportingSkills = ["kepler-grilling", "kepler-domain-modelling", "kepler-research", "kepler-resume"];

const packageSnapshot = () => {
  const plan = planResourceGeneration(root, VERSION);
  const files = Object.keys(plan.manifest.files).map((path) => ({
    path,
    contents: Fs.readFileSync(Path.join(root, "bundle", path)),
  }));
  return validateResourcePackage({ manifest: JSON.stringify(plan.manifest), files }, VERSION);
};

describe("agent-first resource package", () => {
  it("ships the full startup-to-delivery route with its intended required status", () => {
    const { manifest } = packageSnapshot();
    for (const id of requiredSkills) {
      expect(manifest.skills).toContainEqual(expect.objectContaining({ id, required: true }));
    }
    for (const id of supportingSkills) {
      expect(manifest.skills).toContainEqual(expect.objectContaining({ id, required: false }));
    }
    expect(manifest.skills).toHaveLength(requiredSkills.length + supportingSkills.length);
  });

  it("ships complete package-local operational recipes and resolvable skill references", () => {
    const { manifest } = packageSnapshot();
    const operations = "skills/kepler-mission-startup/references/agent-operations.md";
    const walkthrough = "skills/kepler-mission-startup/references/standard-cli-walkthrough.md";
    expect(manifest.files).toHaveProperty(operations);
    expect(manifest.files).toHaveProperty(walkthrough);
    for (const id of [...requiredSkills, "kepler-resume"]) {
      const skillPath = `skills/${id}/SKILL.md`;
      const text = Fs.readFileSync(Path.join(root, "bundle", skillPath), "utf8");
      const references = [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) =>
        Path.posix.normalize(Path.posix.join("skills", id, match[1]!)),
      );
      expect(references, `${id} has an agent-owned operation route`).toContain(operations);
    }
    const reference = Fs.readFileSync(Path.join(root, "bundle", operations), "utf8");
    expect(reference).toContain("standard-cli-walkthrough.md");
    expect(reference).toContain("Never fabricate approvals or successful checks");
  });

  it("keeps packaged request examples identical to the operator walkthrough", () => {
    const examples = (source: string) => [...source.matchAll(/^```(?:bash|json|text)\n([\s\S]*?)^```/gm)]
      .map((match) => match[1]);
    const packaged = Fs.readFileSync(Path.join(root, "bundle/skills/kepler-mission-startup/references/standard-cli-walkthrough.md"), "utf8");
    const operator = Fs.readFileSync(Path.join(root, "docs/cli/standard-walkthrough.md"), "utf8");
    expect(examples(packaged).length).toBeGreaterThan(10);
    expect(examples(packaged)).toEqual(examples(operator));
  });

  it("keeps both host role inventories and non-author boundaries aligned", () => {
    const { manifest } = packageSnapshot();
    for (const host of ["pi", "claude-code"]) {
      const base = `agents/${host}/v1/`;
      const orchestrator = Fs.readFileSync(Path.join(root, "bundle", base, "kepler-orchestrator.md"), "utf8");
      expect(orchestrator).toContain("kepler-mission-startup");
      expect(orchestrator).toContain("kepler-resume");
      expect(orchestrator).toContain("do not grant authority to author Functional Design");
      for (const role of ["architect", "coder", "reviewer"]) {
        const path = `${base}kepler-${role}.md`;
        expect(manifest.files).toHaveProperty(path);
        const text = Fs.readFileSync(Path.join(root, "bundle", path), "utf8");
        expect(text).toContain("kepler-resume");
        expect(text).not.toContain("kepler-mission-startup");
        expect(text).toContain("own");
      }
      const reviewer = Fs.readFileSync(Path.join(root, "bundle", base, "kepler-reviewer.md"), "utf8");
      expect(reviewer).toContain("non-author");
      expect(reviewer).not.toMatch(/\n  - (subagent|Agent)\n/);
    }
  });
});
