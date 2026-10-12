import * as Fs from "node:fs"
import { describe, expect, it } from "vitest"
import { readSkill, section } from "./helpers.js"

const pipelineSequence =
  /init\s+→\s+propose\s+→\s+plan\s+→\s+code\s+→\s+code-feedback\s+→\s+review\s+→\s+finish-work/

const coreSkills = [
  ["kepler-init", 0, /standing project standards/i],
  ["kepler-propose", 1, /proposal.*requirements.*design/is],
  ["kepler-plan", 2, /ordered ledger.*tasks/is],
  ["kepler-code", 3, /one active plan task/i],
  ["kepler-code-feedback", 4, /one implemented plan task.*stable diff/is],
  ["kepler-review", 5, /complete branch.*final inspection/is],
  ["kepler-finish-work", 6, /canonical specifications.*finish/is],
] as const

const liveSkills = [...coreSkills.map(([name]) => name), "kepler-critique", "kepler-orchestrate"]

describe("seven-step pipeline identity", () => {
  it.each(coreSkills)("identifies %s as core step %i with its distinct role", (name, step, role) => {
    const skill = readSkill(name)

    expect(skill).toMatch(pipelineSequence)
    expect(skill).toMatch(new RegExp(`step ${step}\\b`, "i"))
    expect(skill).toMatch(role)
  })

  it("keeps critique optional, outside the core count, and distinct from whole-branch review", () => {
    const critique = readSkill("kepler-critique")

    expect(critique).toMatch(pipelineSequence)
    expect(critique).toMatch(/optional.*outside the (?:seven-step )?core (?:pipeline|count)/is)
    expect(critique).toMatch(/proposal.*requirements.*design/is)
    expect(critique).toMatch(/kepler-review.*whole-branch/is)
  })

  it("treats the single critique decision as its terminal disposition", () => {
    const critique = readSkill("kepler-critique")
    const handoff = section(readSkill("kepler-critique"), "## Handoff")

    expect(critique).toMatch(/single `decision` field.*critique is settled/is)
    expect(critique).toMatch(/`accepted`.*needs no remediation.*`applied`.*accepts and applies.*`rejected`.*dismisses/is)
    expect(critique).toMatch(/never add a second resolution\s+field/i)
    expect(handoff).toMatch(/changes-requested.*settled only when.*`decision: applied`/is)
    expect(handoff).toMatch(/changes-requested.*settled only when.*`decision: rejected`/is)
    expect(handoff).toContain("supply no clearance")
    expect(handoff.replace(/\s+/g, " ")).toContain("A skipped decision means no owner disposition was collected")
    expect(handoff.replace(/\s+/g, " ")).toContain("A critique disposition never substitutes for explicit revision-bound requester approval")
    expect(handoff).toMatch(/never rerun.*`kepler-critique`/is)
    expect(handoff).toMatch(/no `plan\.md`.*`kepler-plan`/is)
    expect(handoff).toMatch(/existing plan.*`kepler-code`.*`kepler-orchestrate`/is)
    expect(handoff).toMatch(/invalidate an existing plan.*`kepler-plan` in re-plan mode/is)
  })

  it("keeps Wayfinder outside the core count", () => {
    for (const [name] of coreSkills) {
      expect(readSkill(name)).toMatch(/Wayfinder.*optional.*outside\s+the\s+(?:seven-step\s+)?core\s+count/is)
    }
  })

  it("uses the split task and whole-branch handoffs", () => {
    expect(readSkill("kepler-init")).toMatch(/ready for `kepler-propose`.*`kepler-plan`/s)
    expect(section(readSkill("kepler-propose"), "## Handoff")).toContain("`kepler-plan`")
    expect(readSkill("kepler-propose")).toMatch(/frontmatter.*`route_unit`/is)
    expect(section(readSkill("kepler-plan"), "## Handoff")).toMatch(/`kepler-code`.*`kepler-orchestrate`/s)
    expect(section(readSkill("kepler-code"), "## Handoff")).toMatch(/done commit.*`kepler-code-feedback`/s)
    expect(section(readSkill("kepler-code-feedback"), "## Output and handoff")).toMatch(/next task.*`kepler-code`.*whole-branch.*`kepler-review`/s)
    expect(section(readSkill("kepler-review"), "## Output and handoff")).toMatch(/approved.*`kepler-finish-work`/s)
    expect(readSkill("kepler-finish-work")).toMatch(/step 6.*last/is)
    expect(readSkill("kepler-finish-work")).toMatch(/frontmatter.*`decision`/is)
  })

  it("describes orchestration as the code-feedback loop followed by final review and finish", () => {
    const orchestrate = readSkill("kepler-orchestrate")

    expect(orchestrate).toMatch(pipelineSequence)
    expect(orchestrate).toMatch(/`kepler-code`.*↔.*`kepler-code-feedback`.*`kepler-review`.*`kepler-finish-work`/s)
    expect(orchestrate).toMatch(/Wayfinder.*critique.*optional.*outside\s+the\s+(?:seven-step\s+)?core\s+count/is)
  })

  it("does not advertise kepler-review as a task-scoped gate", () => {
    for (const name of liveSkills) {
      const skill = readSkill(name)

      expect(skill).not.toMatch(/kepler-review pass on (?:this|each|one) task/i)
      expect(skill).not.toMatch(/task-scoped `kepler-review`/i)
    }
  })

  it("makes the design testing strategy name tactical and final gates", () => {
    const design = Fs.readFileSync(new URL("../../bundle/templates/design.md", import.meta.url), "utf-8")
    const testing = section(design, "## Testing Strategy")

    expect(testing).toMatch(/tactical.*`kepler-code`.*`kepler-code-feedback`/s)
    expect(testing).toMatch(/final.*`kepler-review`.*`kepler-finish-work`/s)
  })
})
