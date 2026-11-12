import * as Fs from "node:fs";
import * as Path from "node:path";
import { marked } from "marked";
import { describe, expect, it } from "vitest";

const root = Path.resolve(import.meta.dirname, "../..");
const read = (path: string) => Fs.readFileSync(Path.join(root, path), "utf8");

const steps = [
  ["0. Prepare the agent session", "kepler-mission-startup"],
  ["1. Create the mission and unit", "kepler-mission-startup"],
  ["2. Define behavior", "kepler-design"],
  ["3. Agree quality targets", "kepler-quality"],
  ["4. Plan the work", "kepler-plan"],
  ["5. Implement and integrate", "kepler-orchestrate"],
  ["6. Review the complete unit", "kepler-review"],
  ["7. Deliver the requested outcome", "kepler-finish-work"],
];

describe("agent-first developer guides", () => {
  it("gives a sequential prompt path with requester decisions and recovery", () => {
    const tutorial = read("docs/missions/tutorial.md");
    const headings = marked.lexer(tutorial).flatMap((token) => token.type === "heading" ? [token.text] : []);
    let position = -1;
    for (const [heading, skill] of steps) {
      const current = headings.findIndex((text) => text.startsWith(heading));
      expect(current, heading).toBeGreaterThan(position);
      position = current;
      expect(tutorial).toContain(skill);
    }
    expect(tutorial).toContain("I approve the Functional Design material");
    expect(tutorial).toContain("I approve the Quality Requirements material");
    expect(tutorial).toContain("non-author");
    expect(tutorial).toContain("kepler-resume");
    expect(tutorial).toContain("reads back results");
  });

  it("keeps command examples agent-labeled and retains complete operator mechanics", () => {
    const tutorial = read("docs/missions/tutorial.md");
    const commands = tutorial.split("\n").filter((line) => line.startsWith("**Agent operation example, not a developer instruction:**"));
    expect(commands).toHaveLength(4);
    expect(marked.lexer(tutorial).filter((token) => token.type === "code")).toHaveLength(0);
    const operator = read("docs/cli/standard-walkthrough.md");
    expect(operator).toContain("## Create the mission and unit");
    expect(operator).toContain("kepler audit record evidence");
    expect(operator).toContain("kepler workflow construction integration accept");
    expect(operator).toContain("## 6. Deliver");
    expect(read("docs/recovery.md")).toContain("kepler-resume");
    expect(read("docs/cli/recovery-operations.md")).toContain("stage resume");
  });
});
