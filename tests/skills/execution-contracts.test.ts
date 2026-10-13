import { describe, expect, it } from "vitest"
import { readSkill, section } from "./helpers.js"

describe("kepler-plan execution contract", () => {
  const skill = readSkill("kepler-plan")

  it("initializes the stable root ledger and task-local evidence paths", () => {
    const process = section(skill, "## Process")

    expect(skill).toContain("<change-dir>/progress.md")
    expect(skill).toContain("<change-dir>/tasks/task-N/progress.md")
    expect(skill).toContain("tasks/task-N/progress.md")
    expect(process).toMatch(/status vocabulary is\s+`pending`, `in-progress`, `blocked`, and `done`/)
    expect(process).toMatch(/standard Markdown table escaping/)
    expect(process).toMatch(/identity is not derived from the title/)
  })

  it("instantiates lint-valid planning artifacts with repository authorship", () => {
    const process = section(skill, "## Process")

    expect(process).toMatch(/plan\.md.*frontmatter.*`artifact`, `change`, `status`, `created`, `author`, `decision`, and `route_unit`/is)
    expect(process).toMatch(/root.*progress.*frontmatter.*`artifact`,\s+`change`,\s+`status`,\s+`updated`,\s+`decision`,\s+and\s+`tasks`/is)
    expect(process).toMatch(/each active.*tasks\/task-N\/progress\.md.*`artifact`,\s+`change`,\s+numeric `task`,\s+`status: pending`,\s+`updated`, and `decision`.*frontmatter/is)
    expect(process).toMatch(/same ordered task list.*frontmatter.*Markdown table.*one row/is)
    expect(process).toContain("# Task Progress: Task N — <title>")
    expect(process).toMatch(/`status: pending`.*no attempt|no attempt.*`status: pending`/is)
    expect(process).toMatch(/exact.*task heading|exact heading.*Task N/is)
    expect(process).toMatch(/escaped display titles|escape.*`\|`/is)
    expect(process).toMatch(/git config user\.name/)
    expect(process).toMatch(/git config user\.email/)
    expect(process).toMatch(/Name <email>/)
    expect(process).toMatch(/missing.*identity.*ask the user.*not invent/is)
    expect(process).toMatch(/preserv(?:e|es).*existing.*author/i)
    expect(process).toMatch(/after.*complete.*scaffold.*kepler workbench lint --change-dir <change-dir>/is)
    expect(process).toMatch(/map-aware.*lint.*--file|--file.*map-aware.*lint/is)
  })

  it("reconciles re-plans without rewriting task history", () => {
    const replan = section(skill, "## Re-plan mode")

    expect(replan).toContain("Tasks the root ledger marks `done` are frozen")
    expect(replan).toMatch(/Append each new active task.*status `pending`/s)
    expect(replan).toContain("A renamed non-done task")
    expect(replan).toMatch(/renamed non-done task.*exact unescaped title.*root.*frontmatter.*task-progress heading/is)
    expect(replan).toMatch(/exact unescaped title.*active plan heading/is)
    expect(replan).toMatch(/Markdown table.*escaped.*title.*root.*frontmatter.*task-progress heading/is)
    expect(replan).toMatch(/preserve.*status.*id.*path.*append-only.*attempt/is)
    expect(replan).toMatch(/done tasks.*byte-for-byte unchanged/is)
    expect(replan).toMatch(/Mark an abandoned task.*retain its existing task directory/s)
    expect(replan).toContain("Renumber nothing")
    expect(replan).toMatch(/surviving task's actual status in both the root frontmatter.*row/is)
    expect(replan).toMatch(/new active task.*matching frontmatter metadata and root row.*status `pending`/is)
    expect(replan).toContain("including frozen `done` tasks and existing non-done tasks")
  })

  it("uses only the exact canonical abandonment suffix and preserves abandoned history", () => {
    const replan = section(skill, "## Re-plan mode")
    const codeInputs = section(readSkill("kepler-code"), "## Inputs")

    for (const contract of [replan, codeInputs]) {
      expect(contract).toContain("`### Task N: <title> (abandoned — <reason>)`")
      expect(contract).toMatch(/only.*ends with.*complete\s+canonical.*nonempty reason/is)
      expect(contract).toContain("`(abandoned - reason)`")
      expect(contract).toContain("`(abandoned — )`")
      expect(contract).toContain("`(abandoned — reason) trailing`")
      expect(contract).toMatch(/active.*lint.*plan/is)
      expect(contract).not.toMatch(/begins with the literal|suffix begins with|canonical literal/)
    }
    expect(replan).toMatch(/retain its existing task directory and append-only\s+history/)
  })

  it("trusts lint when re-planning an existing artifact", () => {
    const process = section(skill, "## Process")
    const replan = section(skill, "## Re-plan mode")

    expect(process).toMatch(/`plan\.md` exists.*all initialized root\/task paths are present.*kepler workbench lint --change-dir <change-dir>/is)
    expect(process).toMatch(/successful lint.*must not be overridden.*layout or template comparison/is)
    expect(replan).toMatch(/do not reject a lint-valid artifact.*additional frontmatter or\s+body content/is)
    expect(replan).not.toMatch(/planned legacy layout is `legacy-unsupported`/i)
  })
})

describe("kepler-code execution contract", () => {
  const skill = readSkill("kepler-code")

  it("scopes lifecycle ownership and checkpoint authority by execution mode", () => {
    const process = section(skill, "## Process")
    const blocking = section(skill, "## Blocking and interruption")
    const output = section(skill, "## Output")

    expect(process).toMatch(/v2.*verified admission.*worker.*lane.*repository.*plan.*input.*prerequisite.*binding/is)
    expect(process).toMatch(/v2.*original.*admission Base.*retry.*cache loss/is)
    expect(process).toMatch(/v2.*does not mutate.*shared root/is)
    expect(process).toMatch(/v2.*Goal.*Acceptance.*goal-serving.*unlisted.*Red.*Green.*Refactor/is)
    expect(process).toMatch(/v2.*original.*signed worker commit.*coordinator.*integrat.*Verify.*root publication/is)
    expect(process).toMatch(/legacy.*execution sequence.*slot.*predecessor/is)
    expect(process).toMatch(/legacy.*root.*in-progress/is)
    expect(blocking).toMatch(/v2.*interrupted.*unavailable.*no.*root.*terminal status/is)
    expect(output).toMatch(/v2.*task-local.*terminal evidence.*coordinator.*root publication/is)
  })

  it("requires one exact active task id for referenced and inline inputs", () => {
    const inputs = section(skill, "## Inputs")

    expect(inputs).toMatch(/exactly one existing active `Task N`/)
    expect(inputs).toMatch(/inline.*numeric task id/is)
    expect(inputs).toContain("does not permit title inference")
  })

  it("loads the installed task-progress template and owns only assigned task evidence", () => {
    const process = section(skill, "## Process")

    expect(skill).toContain("${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/task-progress.md")
    expect(skill).toMatch(/installed.*template.*guides new content.*lint.*validates/is)
    expect(skill).toMatch(/frontmatter.*metadata|metadata.*frontmatter/is)
    expect(skill).toMatch(/do not\s+compare an existing task log with the installed template/is)
    expect(process).toMatch(/if evidence is missing.*name the\s+missing input/is)
    expect(process).toMatch(/Update only the assigned task's root frontmatter metadata entry and\s+Markdown row together to `in-progress`/is)
    expect(process).toMatch(/update the same root frontmatter metadata entry\s+and Markdown row together from `in-progress` to\s+the matching `done` or `blocked` status/is)
    expect(process).toMatch(/frontmatter.*(?:metadata|entry).*and.*(?:Markdown )?row.*together.*`in-progress`/is)
    expect(process).toMatch(/frontmatter.*(?:metadata|entry).*and.*(?:Markdown )?row.*together.*`(?:done|blocked)`/is)
    expect(process).toMatch(/preserv(?:e|es).*sibling.*(?:unchanged|status)/is)
    expect(skill).toContain("<change-dir>/tasks/task-N/progress.md")
    expect(skill).toMatch(/append.*next-numbered.*attempt.*physical end/is)
    expect(skill).toMatch(/preserve.*prior attempt/is)
    expect(skill).not.toMatch(/```(?:markdown)?[\s\S]*?Outcome: done \| blocked[\s\S]*?```/)
    expect(skill).toContain("Never mutate a sibling row, progress file, feedback file, or checkpoint")
  })

  it("uses the stable task checkpoint and keeps review and finish evidence separate", () => {
    expect(skill).toContain("tasks/task-N/.base")
    expect(skill).toMatch(/derives the canonical Base from the first\s+parent of the earliest committed task-progress revision/i)
    expect(skill).toMatch(/no-overwrite\s+cache, not authority/i)
    expect(skill).toMatch(/reconstructs it only when missing\s+and history proves the value/i)
    expect(skill).toMatch(/writes attempt details to the task log.*do not.*feedback.*review.*finish outcomes to root progress/is)
    expect(skill).toMatch(/writer\s+ownership rule.*not a reason to reject.*lint-accepted content/is)
  })

  it("treats root metadata and rows as one task ledger and aggregate status as implementation-only", () => {
    const process = section(skill, "## Process")

    expect(process).toMatch(/frontmatter metadata entry and\s+Markdown row together to `in-progress`/is)
    expect(process).toMatch(/aggregate `status: complete` means all active implementation\s+rows are done.*never means.*finish-work passed/is)
    expect(process).toMatch(/root metadata\/row transition.*root aggregate status as an implementation summary only/is)
  })

  it("keeps every attempt's terminal Outcome unique and append-only", () => {
    const process = section(skill, "## Process")

    expect(process).toMatch(/each attempt exactly one terminal `- Outcome: done` or `- Outcome: blocked`/is)
    expect(process).toMatch(/append a new attempt.*instead of adding a second Outcome to existing history/is)
  })

  it("finalizes assigned task-local status only with its attempt outcome", () => {
    const process = section(skill, "## Process")

    expect(process).toMatch(/empty local task log.*`status: pending`/is)
    expect(process).toMatch(/Do not set.*local.*`in-progress`.*before.*attempt/is)
    expect(process).toMatch(/append.*attempt.*set.*local.*status.*`done` or `blocked`.*before.*lint.*commit/is)
    expect(process).toMatch(/done.*local.*`done`.*blocked.*local.*`blocked`/is)
    expect(process).toMatch(/preserv(?:e|es).*prior attempts.*sibling files/is)
    expect(process).toMatch(/newly\s+initialized log.*`status: pending`.*no attempt/is)
    expect(process).toMatch(/do not\s+compare an existing task log with the installed template/is)
    expect(process).toMatch(/previously finalized.*without.*local.*`in-progress`/is)
  })

  it("creates checkpoints only before evidence-free first attempts and stops for historical recovery", () => {
    const process = section(skill, "## Process")

    expect(process).toContain("The CLI records current `HEAD` only for a clean, committed pending task")
    expect(process).toMatch(/with no\s+attempt or feedback/)
    expect(process).toMatch(/With durable task history, it derives the canonical Base from the first\s+parent of the earliest committed task-progress revision/is)
    expect(process).toMatch(/reconstructs it only when missing\s+and history proves the value/is)
    expect(process).toMatch(/Stop for a malformed or conflicting cache.*missing or ambiguous\s+history/is)
    expect(process).toMatch(/never substitute current `HEAD`, `HEAD~1`/)
  })

  it("requires semantic no-task-work inspection and a standalone checkpoint before implementation", () => {
    const process = section(skill, "## Process").replace(/\s+/g, " ")
    expect(process).toMatch(/before.*first-attempt.*--record.*inspect.*task-owned.*committed.*uncommitted/is)
    expect(process).toMatch(/mechanical eligibility.*does not prove.*absence of task-owned/is)
    expect(process).toMatch(/task-owned work.*(?:ambiguous|uncertain).*stop.*never record current `HEAD`/is)
    expect(process).toMatch(/standalone invocation.*run `kepler workbench diff --record --task N --change-dir <change-dir>`.*successful.*before.*implementation/is)
    expect(process.indexOf("successful checkpoint validation")).toBeLessThan(process.indexOf("**Begin the attempt.**"))
  })

  it("persists graceful blockers without committing partial production edits", () => {
    const blocking = section(skill, "## Blocking and interruption")

    expect(blocking).toContain("artifact-only commit path")
    expect(blocking).toMatch(/partial production\s+edits remain uncommitted/)
    expect(blocking).toContain("root row to `blocked`")
    expect(blocking).toContain("assigned task log")
  })

  it("requires the ordinary red-green-refactor cycle", () => {
    const tdd = section(skill, "## TDD implementation cycle")
    const phases = ["### Red", "### Green", "### Refactor"].map((heading) => tdd.indexOf(heading))

    expect(phases.every((index) => index >= 0)).toBe(true)
    expect(phases[0]).toBeLessThan(phases[1])
    expect(phases[1]).toBeLessThan(phases[2])
    expect(tdd).toMatch(/failing behavioral check.*before.*production edits/is)
    expect(tdd).toMatch(/smallest.*passing implementation/is)
    expect(tdd).toMatch(/behavior-preserving refactor/is)
    expect(tdd).toMatch(/green.*intermediate milestone/is)
    expect(tdd).toMatch(/green-only.*(?:prohibited|not allowed)|do not.*green-only/is)
  })

  it("requires task-local phase evidence and correction-cycle verification", () => {
    const tdd = section(skill, "## TDD implementation cycle")

    expect(tdd).toMatch(/task-local evidence/is)
    expect(tdd).toMatch(/red.*green.*refactor.*commands.*observed results/is)
    expect(tdd).toMatch(/correction cycle/is)
    expect(tdd).toMatch(/correction.*(?:repeat|rerun).*red.*green.*refactor/is)
  })

  it("requires justified alternative verification when red cannot be conventional", () => {
    const tdd = section(skill, "## TDD implementation cycle")

    expect(tdd).toMatch(/conventional failing behavioral check cannot be written/is)
    expect(tdd).toMatch(/reason/is)
    expect(tdd).toMatch(/repeatable alternative verification/is)
    expect(tdd).toMatch(/preference-based.*(?:omission|reason).*not|not.*preference-based/is)
  })

  it("does not independently reject lint-valid execution artifacts", () => {
    const process = section(skill, "## Process")

    expect(process).toMatch(/before implementation.*kepler workbench lint --change-dir <change-dir>/is)
    expect(process).toMatch(/exit status.*single source of.*artifact format and schema/is)
    expect(process).toMatch(/do not.*independently classify a layout as `legacy-unsupported`/is)
    expect(process).toMatch(/if evidence is missing.*name the\s+missing input/is)
    expect(skill).toMatch(/template guides new content.*lint.*validates the format of existing/is)
  })
})
