import * as Fs from "node:fs"
import * as Path from "node:path"
import { describe, expect, it } from "vitest"
import { readSkill, section } from "./helpers.js"

const skill = readSkill("kepler-plan")
const template = Fs.readFileSync(Path.resolve("bundle/templates/plan.md"), "utf-8")
const contract = section(skill, "## TDD task contract")

describe("kepler-plan TDD handoff", () => {
  it("plans distinct red, green, and behavior-preserving refactor steps before verification", () => {
    const phases = ["**Red:**", "**Green:**", "**Refactor:**"].map((phase) => contract.indexOf(phase))
    const taskSpecification = section(skill, "## Process")
      .split("8. **Specify each task.**")[1]
      ?.split("9. **Confirm or auto-reflect.**")[0] ?? ""

    expect(phases.every((index) => index >= 0)).toBe(true)
    expect(phases[0]).toBeLessThan(phases[1])
    expect(phases[1]).toBeLessThan(phases[2])
    expect(contract).toMatch(/Red:.*failing behavioral check.*before.*production edits/is)
    expect(contract).toMatch(/Green:.*smallest passing implementation.*same check/is)
    expect(contract).toMatch(/Refactor:.*behavior-preserving.*relevant tests/is)
    expect(taskSpecification).toMatch(/Order Steps as Red.*Green.*Refactor.*followed by targeted tests and fresh LSP diagnostics/is)
    expect(contract).toMatch(/exact commands and observed\s+results.*task-local/is)
    expect(contract).toMatch(/wrong reason.*Verify fails.*changes-requested.*repeat.*Red.*Green.*Refactor/is)
    expect(contract).toMatch(/correction exceeds Goal, Acceptance, approved intent, design or project standards, block for re-plan/is)
  })

  it("plans a justified alternative Red without allowing test omission by preference", () => {
    expect(contract).toMatch(/conventional failing check is technically impossible.*explain why.*repeatable alternative.*before production edits/is)
    expect(contract).toMatch(/alternative.*distinguishes pre-change and post-change behavior/is)
    expect(contract).toMatch(/preference alone does not justify an exception/is)
  })

  it("keeps feedback outside the task steps and gates advancement on approval", () => {
    expect(contract).toMatch(/`kepler-code-feedback`.*refactor-phase review/is)
    expect(contract).toMatch(/not.*(?:invoke|run).*feedback.*(?:Steps|implementation)/is)
    expect(contract).toMatch(/fresh.*approved.*(?:next task|whole-branch)/is)
    expect(contract).toMatch(/changes-requested.*same task.*correction.*verification/is)
    expect(section(skill, "## Self-review")).toMatch(/fresh committed.*approved.*whole-branch review/is)
    const decomposition = section(skill, "## Process")
      .split("7. **Decompose and build the task graph.**")[1]
      ?.split("8. **Specify each task.**")[0] ?? ""
    expect(decomposition).toMatch(/Dependencies determine readiness.*coordinator admits compatible ready tasks into isolated lanes/is)
    expect(decomposition).toMatch(/independent tasks/is)
  })

  it("keeps remediation tasks within their own evidence ownership", () => {
    const replan = section(skill, "## Re-plan mode")

    expect(replan).toMatch(/remediation.*Red.*Green.*Refactor/is)
    expect(replan).toMatch(/(?:do not|never).*new task.*sibling.*(?:progress|feedback|checkpoint)/is)
    expect(replan).toMatch(/ownership conflict.*stop/is)
  })

  it("keeps operative v2 task rules distinct from explicit legacy rules", () => {
    const taskContract = section(skill, "## Principles")
    const legacy = section(skill, "## Plan format")
    expect(taskContract).toMatch(/Goal, Acceptance, Depends on, Steps, Verify, and Commit/is)
    expect(taskContract).toMatch(/Files is optional guidance, not an allowlist/is)
    expect(taskContract).toMatch(/goal-serving unlisted paths/is)
    expect(taskContract).toMatch(/Red.*Green.*Refactor/is)
    expect(legacy).toMatch(/version 1 plans.*historical context/is)
    expect(legacy).toMatch(/do not edit, migrate, recover.*dispatch work/is)
    expect(taskContract).not.toMatch(/Steps are executed verbatim/)
  })


  it("allows v2 task contracts to omit Files while retaining legacy Files and bounded judgment", () => {
    const principles = section(skill, "## Principles")
    const planFormat = section(skill, "## Plan format")
    const selfReview = section(skill, "## Self-review")

    expect(principles).toMatch(/Each task is governed by Goal, Acceptance, Depends on, Steps, Verify, and Commit/is)
    expect(principles).toMatch(/Files is optional guidance, not an allowlist/is)
    expect(planFormat).toMatch(/Read version 1 plans.*unversioned serial plans only as historical context/is)
    expect(selfReview).toMatch(/bounded judgment only within Goal, Acceptance, approved intent, design and standards/is)
  })

  it("ships an executable red-green-refactor example in the installed plan template", () => {
    const task = template.split("### Task 1:")[1]?.split("### Task 2:")[0] ?? ""
    const steps = task.split("- Steps:")[1]?.split("- Verify:")[0] ?? ""
    const phases = ["Red", "Green", "Refactor"].map((phase) => steps.indexOf(phase))

    expect(phases.every((index) => index >= 0)).toBe(true)
    expect(phases[0]).toBeLessThan(phases[1])
    expect(phases[1]).toBeLessThan(phases[2])
    expect(steps).toMatch(/Red.*fail.*before.*production/is)
    expect(steps).toMatch(/Green.*smallest.*same.*pass/is)
    expect(steps).toMatch(/Refactor.*preserv.*test/is)
    expect(steps).toMatch(/changes-requested.*repeat.*Red.*Green.*Refactor.*verification/is)
    expect(steps).not.toMatch(/(?:invoke|dispatch|run) `?kepler-code-feedback`?/i)
    expect(template).toMatch(/conventional failing behavioral check is technically impossible.*repeatable alternative that distinguishes pre-change and post-change behavior/is)
    expect(template).toMatch(/`kepler-code-feedback`.*refactor-phase review/is)
    expect(section(template, "## Done when")).toMatch(/fresh.*approved.*before.*whole-branch/is)
  })
})
