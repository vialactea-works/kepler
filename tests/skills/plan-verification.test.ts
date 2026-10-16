import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readSkill, section } from "./helpers.js";

const resources = [
  ["kepler-plan", readSkill("kepler-plan")],
  ["plan template", readFileSync(resolve(import.meta.dirname, "../../bundle/templates/plan.md"), "utf8")],
] as const;

describe("planning verification contract", () => {
  it.each(resources)("requires project type checking instead of LSP in %s", (_, content) => {
    expect(content).toMatch(/project(?:'s)? type.check(?:ing)? command/i);
    expect(content).toMatch(/type check(?:ing)?[^.\n]*must pass/i);
    expect(content).not.toMatch(/\bLSP\b/);
  });

  it.each(resources)("allows absent linting but requires configured linting to pass in %s", (_, content) => {
    expect(content).toMatch(/linting is optional only when the project has no lint configuration/i);
    expect(content).toMatch(/lint(?:ing)?[^.\n]*not configured/i);
    expect(content).toMatch(/configured[^.\n]*lint[^.\n]*must pass/i);
    expect(content).toMatch(/unavailable[^.\n]*failed verification/i);
  });

  it("carries type checking and conditional linting in every template task", () => {
    const template = resources[1][1];
    const tasks = section(template, "## Tasks").split(/\n### Task \d+:/).slice(1);
    expect(tasks).toHaveLength(2);
    for (const task of tasks) {
      const verify = task.match(/^- Verify: (.+)$/m)?.[1];
      expect(verify).toMatch(/related test commands/);
      expect(verify).toMatch(/type.check/);
      expect(verify).toMatch(/lint.*(?:when|if).*configured/);
      expect(verify).toMatch(/pass/);
    }
  });

  it("keeps Kepler artifact lint mandatory", () => {
    expect(resources[0][1]).toContain("Resolve every lint finding and rerun before handoff");
  });
});
