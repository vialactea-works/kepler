import { describe, expect, it } from "vitest"
import { readSkill, section } from "./helpers.js"

const readFinishWork = () => readSkill("kepler-finish-work")

describe("kepler-finish-work contract", () => {
  it("consumes the exact split-pipeline evidence package", () => {
    const inputs = section(readFinishWork(), "## Inputs")

    expect(inputs).toContain("<change-dir>/progress.md")
    expect(inputs).toContain("<change-dir>/tasks/task-N/progress.md")
    expect(inputs).toContain("<change-dir>/tasks/task-N/feedback.md")
    expect(inputs).toContain("<change-dir>/review.md")
    expect(inputs).toContain("<change-dir>/finish.md")
    expect(inputs).toMatch(/physically last.*attempt.*feedback pass.*whole-branch.*pass/is)
    expect(inputs).toContain("Project standards")
  })

  it("fails closed on every exact ledger, feedback, and review gate", () => {
    const preconditions = section(readFinishWork(), "## Preconditions")

    expect(preconditions).toContain("kepler workbench precondition")
    expect(preconditions).not.toContain("~/.kepler/scripts/")
    expect(preconditions).toContain("--change-dir <change-dir>")
    expect(preconditions).toContain("--test-cmd '<full test suite && build/typecheck>'")
    expect(preconditions).toMatch(/exact root task ledger/i)
    expect(preconditions).toMatch(/physically last\s+task\s+attempt.*(?:`done`|`Outcome: done`)/is)
    expect(preconditions).toMatch(/physically last task feedback pass.*valid.*fresh.*`approved`/is)
    expect(preconditions).toMatch(/task-progress artifact is tracked and committed at `HEAD`.*latest\s+implementation commit resolves/is)
    expect(preconditions).toMatch(/physically last whole-branch review pass.*valid.*`approved`/is)
    expect(preconditions).toMatch(/no blocking findings/i)
    expect(preconditions).toMatch(/full test suite.*build/is)
    expect(preconditions).toMatch(/output verbatim/i)
    expect(preconditions).toMatch(/do not.*(?:create|change|write).*`finish\.md`/is)
    expect(preconditions).toMatch(/`verified-head: <full-commit>`.*compare it with current\s+`HEAD`/is)
  })

  it("limits the explicit waiver to material-change ancestry", () => {
    const preconditions = section(readFinishWork(), "## Preconditions")

    expect(preconditions).toMatch(/`--whole-change-waived`.*explicit/is)
    expect(preconditions).toContain("kepler workbench precondition")
    expect(preconditions).toMatch(/only.*material.*ancestry/is)
    expect(preconditions).toMatch(/does not waive.*ledger.*task feedback.*whole-branch.*validity.*verdict.*blocking/is)
  })

  it("instantiates the installed finish template and preserves finish history", () => {
    const skill = readFinishWork()
    const history = section(skill, "## Finish history")

    expect(history).toContain("${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/finish.md")
    expect(history).toMatch(/exact installed.*template/i)
    expect(history).toContain("<change-dir>/finish.md")
    expect(history).toMatch(/remove.*instruction block.*inline\s+hint/is)
    expect(history).not.toMatch(/```(?:markdown)?[\s\S]*?Passed preconditions:[\s\S]*?Route intent:[\s\S]*?```/)
    expect(history).toMatch(/append-only/i)
    expect(history).toMatch(/next integer.*highest.*Attempt.*Outcome/is)
    expect(history).toMatch(/Outcome N.*matching.*Attempt N/is)
    expect(history).toMatch(/Never.*root\s+`progress\.md`/is)
    expect(skill).not.toMatch(/append(?:s|ing)? (?:a )?finish (?:entry|section) to `?progress\.md`?/i)
  })

  it("commits the attempt after read-only gates and before specs or delivery", () => {
    const process = section(readFinishWork(), "## Process")

    expect(process.indexOf("**Validate synchronization read-only.**")).toBeLessThan(process.indexOf("**Commit intent.**"))
    expect(process.indexOf("**Commit intent.**")).toBeLessThan(process.indexOf("**Synchronize inside the Attempt.**"))
    expect(process.indexOf("**Synchronize inside the Attempt.**")).toBeLessThan(process.indexOf("**Execute then qualify the strategy.**"))
    expect(process).toContain("before canonical specifications or any external finish action")
    expect(process).toMatch(/append.*`Attempt N`.*commit.*change branch/is)
    expect(process).toMatch(/before.*external.*finish\s+action/is)
    expect(process).toMatch(/template-defined.*attempt.*durable.*intent/is)
  })

  it("reconciles a dangling attempt before allocating or executing another", () => {
    const recovery = section(readFinishWork(), "## Resume and recovery")

    expect(recovery).toMatch(/Attempt N.*without.*Outcome N/is)
    expect(recovery).toMatch(/inspect.*git.*remote.*pull\s+request.*route.*workspace/is)
    expect(recovery).toMatch(/append.*matching.*Outcome N.*continue.*same attempt/is)
    expect(recovery).toMatch(/never.*allocate.*duplicate.*attempt/is)
    expect(recovery).toMatch(/before.*(?:new|another).*(?:action|attempt)/is)
  })

  it("allows only finish-owned post-gate mutations for the same attempt", () => {
    const boundary = section(readFinishWork(), "## Post-gate mutation boundary")

    expect(boundary).toMatch(/gate's `verified-head` as gate-entry `HEAD`/is)
    expect(boundary).toMatch(/recheck.*branch.*worktree identity.*target repository/is)
    expect(boundary).toMatch(/branch change keeps the same\s+commit SHA/is)
    expect(boundary).toMatch(/canonical.*specs.*route.*map.*numbered.*finish/is)
    expect(boundary).toMatch(/finish-owned.*do not stale.*same attempt/is)
    expect(boundary).toMatch(/unrelated material edit.*abort/is)
    expect(boundary).toMatch(/return.*whole-branch review/is)
    expect(boundary).toMatch(/waiver.*does\s+not.*post-gate/is)
  })

  it("routes missing or incorrect change requirements out of finish-work", () => {
    const skill = readFinishWork()
    const synchronization = section(skill, "## Specification synchronization")
    const boundary = section(skill, "## Post-gate mutation boundary")

    expect(synchronization).toMatch(/canonical.*\.kepler\/specs\/.*already approved.*artifacts/is)
    expect(synchronization).toMatch(/missing or incorrect.*change requirement.*abort/is)
    expect(synchronization).toMatch(/artifact revision.*fresh whole-branch review/is)
    expect(synchronization).toMatch(/never.*(?:add|edit|rewrite).*requirements\//is)
    expect(boundary).toMatch(/only.*canonical.*\.kepler\/specs\/.*route.*map.*finish\.md/is)
    expect(boundary).toMatch(/change requirement.*not finish-owned/is)
    expect(boundary).not.toMatch(/supporting delta/i)
    expect(skill).not.toMatch(/write the missing delta|first add .*delta/is)
  })

  it("persists a verified local-merge outcome on the base branch", () => {
    const strategies = section(readFinishWork(), "## Strategy execution")

    expect(strategies).toMatch(/local-merge:.*merge.*attempt\s+commit.*base branch/is)
    expect(strategies).toMatch(/local-merge:[\s\S]*remove.*worktree/is)
    expect(strategies).toMatch(/local-merge:[\s\S]*read back.*base.*workspace/is)
    expect(strategies).toMatch(/local-merge:[\s\S]*matching `Outcome N`.*base branch.*commit/is)
  })

  it("pushes and reads back a pull-request outcome", () => {
    const strategies = section(readFinishWork(), "## Strategy execution")

    expect(strategies).toMatch(/pull-request:[\s\S]*push.*open.*(?:pull|merge) request/is)
    expect(strategies).toMatch(/pull-request:[\s\S]*read back.*URL.*head.*base/is)
    expect(strategies).toMatch(/pull-request:[\s\S]*matching `Outcome N`.*commit.*push/is)
    expect(strategies).toMatch(/pull-request:[\s\S]*verify.*request.*outcome\s+commit/is)
  })

  it("verifies and persists no-op without moving the workspace", () => {
    const strategies = section(readFinishWork(), "## Strategy execution")

    expect(strategies).toMatch(/no-op:[\s\S]*verify.*branch.*worktree.*remain/is)
    expect(strategies).toMatch(/no-op:[\s\S]*matching `Outcome N`.*change branch.*commit/is)
  })

  it("records verified partial failure without claiming completion", () => {
    const failures = section(readFinishWork(), "## Partial failure")

    expect(failures).toMatch(/after.*action.*begins/is)
    expect(failures).toMatch(/inspect.*actual.*partial state/is)
    expect(failures).toMatch(/matching.*Outcome N.*`blocked`/is)
    expect(failures).toMatch(/surviving branch or base/i)
    expect(failures).toMatch(/push.*read\s+back.*remote/is)
    expect(failures).toMatch(/never.*report.*completed/is)
  })

  it("separates linked repair from delivery and qualifies routes on the surviving branch", () => {
    const skill = readFinishWork()
    const recovery = section(skill, "## Resume and recovery")
    const process = section(skill, "## Process")
    const flow = section(skill, "## Process flow")
    expect(recovery).toContain("--recover-finish <original-delivery-attempt>")
    expect(recovery).toContain("gate: repair-open")
    expect(recovery).toMatch(/cannot enter the ordinary synchronization\/delivery path/)
    expect(recovery).toMatch(/Never repeat merge,.*request creation, or branch\/worktree cleanup/is)
    expect(recovery).toMatch(/dirty surviving tree.*closes automated repair.*Do not discard, stage, pre-commit/is)
    expect(process).toMatch(/Require the strategy to satisfy.*before any Attempt or effects/is)
    expect(process).toMatch(/merge-required route.*request-open strategy stops.*do not create.*request or spec write/is)
    expect(process).toMatch(/Read back.*qualifying.*effect before route mutation/is)
    expect(flow).toContain('"Append and commit Attempt N" -> "Synchronize specs + commit inside Attempt"')
    expect(flow).toContain('"Observed shipping qualification?" -> "Apply route intent + verify on surviving branch" [label="yes"]')
    expect(flow).not.toContain('"Synchronize specs + commit" -> "Resolve strategy + route intent"')
    expect(flow).toContain('"Gate repair-open?" -> "Commit linked reconcile-delivery Attempt"')
  })

  it("reports only verified effects and persisted history", () => {
    const output = section(readFinishWork(), "## Output")
    const flow = section(readFinishWork(), "## Process flow")

    expect(output).toMatch(/verified.*external\s+result/i)
    expect(output).toMatch(/persisted.*Outcome N/i)
    expect(output).toMatch(/never claim.*merge.*pull request.*no-op.*route.*workspace.*outcome/is)
    expect(flow).toMatch(/Attempt N.*finish action.*read back.*Outcome N/is)
  })
})
