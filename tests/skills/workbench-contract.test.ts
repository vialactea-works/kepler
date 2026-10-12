import * as Fs from "node:fs";
import * as Path from "node:path";
import { describe, expect, it } from "vitest";
import { readSkill } from "./helpers.js";

const skillNames = [
  "kepler-propose",
  "kepler-plan",
  "kepler-code",
  "kepler-code-feedback",
  "kepler-orchestrate",
  "kepler-review",
  "kepler-critique",
  "kepler-finish-work",
  "kepler-wayfinder-prototype",
] as const;

const obsoleteHelpers =
  /~\/\.kepler\/scripts\/|kepler-(?:artifact-contracts|change-context|diff-package|isolate|precondition-check|prototype-branch)\.sh/;

const readSkills = () =>
  Object.fromEntries(
    skillNames.map((name) => [name, readSkill(name)]),
  ) as Record<(typeof skillNames)[number], string>;

describe("Kepler skill workbench contract", () => {
  it("removes obsolete helper calls from every maintained Kepler skill", () => {
    const skillsDirectory = Path.resolve(
      Path.dirname(new URL(import.meta.url).pathname),
      "../../skills",
    );
    const maintainedSkills = Fs.readdirSync(skillsDirectory)
      .filter((name) => name.startsWith("kepler-"))
      .map((name) =>
        Fs.readFileSync(Path.join(skillsDirectory, name, "SKILL.md"), "utf-8"),
      )
      .join("\n");

    expect(maintainedSkills).not.toMatch(obsoleteHelpers);
  });

  it("maps isolation call sites to the matching workbench modes", () => {
    const skills = readSkills();

    expect(skills["kepler-propose"]).toContain(
      "kepler workbench isolate --check",
    );
    expect(skills["kepler-propose"]).toContain(
      "kepler workbench isolate <title>",
    );
    expect(skills["kepler-propose"]).toContain(
      "kepler workbench isolate --verify <title>",
    );
    expect(skills["kepler-plan"]).toContain(
      "kepler workbench isolate --check",
    );
    expect(skills["kepler-code"]).toContain(
      "kepler workbench isolate --check --change-dir <change-dir>",
    );
    expect(skills["kepler-orchestrate"]).toContain(
      "kepler workbench isolate --check --change-dir <change-dir>",
    );
    expect(skills["kepler-finish-work"]).toContain(
      "kepler workbench isolate --check",
    );
  });

  it("maps diff checkpoint and package call sites without changing their flags", () => {
    const skills = readSkills();

    expect(skills["kepler-code"]).toContain(
      "kepler workbench diff --record --task N --change-dir <change-dir>",
    );
    expect(skills["kepler-orchestrate"]).toContain(
      "kepler workbench diff --record --task N --change-dir <change-dir>",
    );
    expect(skills["kepler-orchestrate"]).toContain(
      "kepler workbench diff --task N --change-dir <change-dir>",
    );
    expect(skills["kepler-orchestrate"]).toContain(
      "kepler workbench diff --whole-change",
    );
  });

  it("maps recognized artifact mutations to scoped lint commands", () => {
    const skills = readSkills()

    for (const name of [
      "kepler-propose",
      "kepler-code",
      "kepler-code-feedback",
      "kepler-critique",
      "kepler-review",
      "kepler-finish-work",
    ] as const) {
      expect(skills[name]).toContain("kepler workbench lint")
    }

    expect(skills["kepler-propose"]).toContain(
      "kepler workbench lint --change-dir <change-dir>",
    )
    expect(skills["kepler-code"]).toContain(
      "kepler workbench lint --change-dir <change-dir>",
    )
    expect(skills["kepler-code-feedback"]).toContain(
      "kepler workbench lint --file <change-dir>/tasks/task-N/feedback.md",
    )
    expect(skills["kepler-critique"]).toContain(
      "kepler workbench lint --file <change-dir>/critique.md",
    )
    expect(skills["kepler-review"]).toContain(
      "kepler workbench lint --file <change-dir>/review.md",
    )
    expect(skills["kepler-finish-work"]).toContain(
      "kepler workbench lint --file <file>",
    )
  })

  it("maps context and precondition call sites to workbench commands", () => {
    const skills = readSkills();

    expect(skills["kepler-plan"]).toContain(
      "kepler workbench context <change-dir>",
    );
    expect(skills["kepler-orchestrate"]).toContain(
      "kepler workbench context <change-dir>",
    );
    expect(skills["kepler-critique"]).toContain(
      "kepler workbench context <change-dir>",
    );
    expect(skills["kepler-finish-work"]).toContain(
      "kepler workbench context <change-dir>",
    );
    expect(skills["kepler-finish-work"]).toContain(
      "kepler workbench precondition \\\n  --change-dir <change-dir> --test-cmd '<full test suite && build/typecheck>' \\\n  --target-branch <full-target-reference>",
    );
    expect(skills["kepler-finish-work"]).toContain("--whole-change-waived");
  });

  it("maps prototype creation and verification to workbench commands", () => {
    const skill = readSkills()["kepler-wayfinder-prototype"];

    expect(skill).toContain(
      "kepler workbench prototype <map-name> <ticket-name>",
    );
    expect(skill).toContain(
      "kepler workbench prototype --standalone <question-slug>",
    );
    expect(skill).toContain(
      "kepler workbench prototype --verify <that branch>",
    );
  });

  it("names the Kepler CLI/workbench in manual fallback paths", () => {
    const skills = readSkills();

    for (const name of [
      "kepler-code",
      "kepler-orchestrate",
      "kepler-critique",
      "kepler-finish-work",
    ] as const) {
      expect(skills[name]).toMatch(/Kepler CLI\/workbench\s+is unavailable/i);
    }
  });

  it("keeps skill-owned control flow and migration boundaries explicit", () => {
    const skills = readSkills();
    expect(skills["kepler-orchestrate"]).toContain(
      "**Coordinate; never implement.**",
    );
    expect(skills["kepler-orchestrate"]).toMatch(
      /driver adjudicates.*concrete named risk/i,
    );
    expect(skills["kepler-code"]).toMatch(
      /Do not redesign, reorder, add work/i,
    );
    expect(skills["kepler-code"]).toMatch(/fail|blocked/i);
    expect(skills["kepler-wayfinder-prototype"]).toMatch(/branch gate/i);
    expect(skills["kepler-wayfinder-prototype"]).toMatch(
      /throwaway artifact/i,
    );
  });
});
