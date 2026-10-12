import * as Fs from "node:fs"
import { describe, expect, it } from "vitest"
import { readSkill, section } from "./helpers.js"
import { createArtifactReader } from "../../packages/cli/src/workbench/artifact-reader.js"
import { parseReviewPasses } from "../../packages/cli/src/workbench/review-passes.js"

const readReview = () => readSkill("kepler-review")
const readQualityRubric = () =>
  Fs.readFileSync(
    new URL("../../skills/kepler-review/references/code-quality.md", import.meta.url),
    "utf-8",
  )

describe("kepler-review contract", () => {
  it("declares the whole-branch pipeline gate", () => {
    const skill = readReview()

    expect(skill).toMatch(/^---\nname: kepler-review\n/)
    expect(skill).toMatch(/description:.*whole branch/i)
    expect(skill).toMatch(/pipeline.*step 5/is)
  })

  it("accepts only a complete merge-base-to-head evidence package", () => {
    const inputs = section(readReview(), "## Inputs")

    expect(inputs).toMatch(/only.*complete branch change/is)
    expect(inputs).toMatch(/merge base through current\s+`HEAD`/)
    expect(inputs).toContain("full merge base and head commit identifiers")
    expect(inputs).toMatch(/proposal.*requirements.*design.*plan.*root task ledger/is)
    expect(inputs).toMatch(/every active task.*latest implementation attempt.*feedback concerns/is)
    expect(inputs).toContain("complete branch diff")
    expect(inputs).toContain("Project standards")
  })

  it("uses lint for existing artifact validity before branch scope or verdict writes", () => {
    const skill = readReview()
    const preflight = section(skill, "## Generation preflight")

    expect(preflight).toMatch(/no `plan\.md`.*`pre-plan`/is)
    expect(preflight).toContain("kepler workbench lint --change-dir <change-dir>")
    expect(preflight).toMatch(/exit status alone determines.*format and schema/is)
    expect(preflight).toMatch(/frontmatter.*extra\s+content.*task-only layout/is)
    expect(preflight).toMatch(/missing evidence.*lint does not check absent files/is)
    expect(preflight).toMatch(/every active task.*feedback\.md.*review-ready/is)
    expect(preflight).toMatch(/nonzero lint.*do not write review/is)
    expect(preflight).not.toMatch(/must be the exact task-only table/is)
    expect(skill.indexOf("## Generation preflight")).toBeLessThan(skill.indexOf("## Wrong scope"))
    expect(skill.indexOf("## Generation preflight")).toBeLessThan(skill.indexOf("## Process"))
    expect(skill.indexOf("## Generation preflight")).toBeLessThan(skill.indexOf("## Review artifact"))
  })

  it("requires durable task approval before direct whole-branch review", () => {
    const preflight = section(readReview(), "## Generation preflight")

    expect(preflight).toMatch(/every active task.*status `done`/is)
    expect(preflight).toMatch(/feedback.*tracked at current `HEAD`/is)
    expect(preflight).toMatch(
      /index.*unchanged from current `HEAD`.*`git diff --cached --quiet HEAD -- <feedback-path>`/is,
    )
    expect(preflight).toMatch(
      /worktree.*unchanged from the index.*`git diff --quiet -- <feedback-path>`/is,
    )
    expect(preflight).toMatch(
      /staged.*differs.*worktree.*matches.*`HEAD`.*fail/is,
    )
    expect(preflight).toMatch(/latest commit that touched.*feedback.*artifact-only/is)
    expect(preflight).toMatch(/commit's path list.*only.*tasks\/task-N\/feedback\.md/is)
    expect(preflight).toMatch(
      /lint accepts the feedback artifact.*physical last pass.*`approved`.*no blocking findings.*fresh/is,
    )
  })

  it("fails closed for interrupted, mixed, stale, and unapproved feedback", () => {
    const preflight = section(readReview(), "## Generation preflight")

    expect(preflight).toMatch(/worktree-only.*interrupted-before-feedback-commit/is)
    expect(preflight).toMatch(/mixed feedback commit/is)
    expect(preflight).toMatch(/stale.*feedback/is)
    expect(preflight).toMatch(/`changes-requested`.*feedback/is)
    expect(preflight).toMatch(/stop without.*(?:create|append|change|write).*review\.md/is)
    expect(preflight).toMatch(/only.*durable approved.*continue.*branch inspection/is)
  })

  it("rejects an arbitrary ancestor or task checkpoint as the whole-branch base", () => {
    const inputs = section(readReview(), "## Inputs")
    const wrongScope = section(readReview(), "## Wrong scope")

    expect(inputs).toMatch(/resolve only the explicitly supplied target; never infer a default branch/is)
    expect(inputs).toMatch(/`git merge-base`.*target.*`HEAD`/is)
    expect(inputs).toMatch(/compute the actual merge\s+base.*supplied base.*equal it/is)
    expect(wrongScope).toMatch(/arbitrary ancestor.*task checkpoint/is)
    expect(wrongScope).toMatch(/stop\s+without recording a verdict/is)
    expect(wrongScope).toContain("`kepler-code-feedback`")
  })

  it("starts from the whole diff and always inspects broader repository impact", () => {
    const inspection = section(readReview(), "## Whole-branch inspection")

    expect(inspection).toMatch(/complete branch diff.*starting evidence/is)
    expect(inspection).toMatch(/not.*inspection boundary/is)
    expect(inspection).toMatch(/Every full pass.*affected consumers/is)
    expect(inspection).toContain("assumptions")
    expect(inspection).toMatch(/cross-task (composition|integration)/i)
    expect(inspection).toMatch(/missing material changes/i)
    expect(inspection).toMatch(/scope and boundary violations/i)
    expect(inspection).toMatch(/changed cause.*affected location/is)
  })

  it("ships executable single-line resolution examples and exact cumulative identity coverage", async () => {
    const template = Fs.readFileSync(new URL("../../bundle/templates/review.md", import.meta.url), "utf-8")
    for (const resource of [readReview(), template]) {
      const example = /^[ \t]*Resolutions: (\[.*\])[ \t]*$/m.exec(resource)
      expect(example, "Installed reviewer resource is missing its exact Resolutions JSON example").not.toBeNull()
      if (!example) continue
      const entries = JSON.parse(example[1]!)
      expect(entries.length).toBeGreaterThan(0)
      for (const entry of entries) {
        expect(Object.keys(entry).sort()).toEqual(["evidence", "finding", "verification"])
        expect(entry.finding).toBe("pass-1-blocking-1")
        expect(entry.evidence.length).toBeGreaterThan(0)
        expect(entry.evidence.every((value: unknown) => typeof value === "string" && value.trim() !== "")).toBe(true)
        expect(entry.verification.trim()).not.toBe("")
      }
      expect(resource).toMatch(/exact unique.*baseline.*scoped suffix/is)
      const base = "a".repeat(40)
      const fullHead = "b".repeat(40)
      const currentHead = "c".repeat(40)
      const parent = "d".repeat(40)
      const source = `---\nartifact: review\nchange: demo\ncreated: 2026-09-12\nstatus: complete\ndecision: accepted\n---\n\n# Whole-branch Review: Demo\n\n## Pass 1 — 2026-09-12\n\nBase: ${base}\nHead: ${fullHead}\nVerdict: changes-requested\nScope: full\nTarget: refs/heads/main\n\n### Blocking\n- [src/file name.ts:1] id: pass-1-blocking-1; kind: code-defect; Correct the behavior (violates: acceptance)\n\n### Suggestions\n- None.\n\n## Pass 2 — 2026-09-13\n\nBase: ${base}\nHead: ${currentHead}\nVerdict: approved-remediation\nScope: remediation\nTarget: refs/heads/main\nParent pass: 1\nParent commit: ${parent}\nDelta base: ${fullHead}\nResolutions: ${example[1]}\n\n### Blocking\n- None.\n\n### Suggestions\n- None.\n`
      const artifact = await createArtifactReader({ readFile: () => source })(".kepler/changes/demo/review.md")
      expect(artifact._tag).toBe("recognized")
      if (artifact._tag === "recognized") {
        const result = parseReviewPasses(artifact)
        expect(result.diagnostics).toEqual([])
        expect(result.latest?.clearance).toMatchObject({ scope: "remediation", resolutions: entries })
      }
    }
  })

  it("keeps inspection, graph and routing mode-specific without repeating full review", () => {
    const skill = readReview()
    const process = section(skill, "## Process")
    const flow = section(skill, "## Process flow")
    const prompt = Fs.readFileSync(new URL("../../skills/kepler-orchestrate/references/whole-branch-review-prompt.md", import.meta.url), "utf-8")
    expect(process).toMatch(/For `full`, read the complete branch diff/is)
    expect(process).toMatch(/For `remediation`,.*cumulative correction delta/is)
    expect(prompt).toMatch(/In full mode,.*complete branch diff.*broader repository/is)
    expect(prompt).toMatch(/In remediation mode,.*do not repeat a full inspection/is)
    expect(flow).toContain('"Review mode?"')
    expect(flow).toContain('label="remediation"')
    expect(flow).toContain('label="approved-remediation"')
    const handoff = section(skill, "## Output and handoff")
    expect(handoff).toMatch(/evidence-gap.*located evidence.*unchanged material range.*without inventing.*tasks/is)
    expect(handoff).toMatch(/intent-defect.*kepler-propose/is)
    expect(handoff).toMatch(/code-defect.*numbered remediation/is)
  })

  it("propagates classified routing through controller handoffs and qualifies the whole-review rubric", () => {
    const controller = readSkill("kepler-orchestrate")
    const process = section(controller, "## Process")
    const feedbackHandoff = /10\. \*\*Confirm the feedback[\s\S]*?(?=\n11\.)/.exec(process)?.[0] ?? ""
    const wholeHandoff = /14\. \*\*Route whole-branch[\s\S]*?(?=\n15\.)/.exec(process)?.[0] ?? ""
    const taskPrompt = Fs.readFileSync(new URL("../../skills/kepler-orchestrate/references/code-feedback-prompt.md", import.meta.url), "utf-8")
    const rubric = readQualityRubric()
    expect(feedbackHandoff).toMatch(/classify.*before.*freshness/is)
    expect(feedbackHandoff).toMatch(/code-defect.*same Task N.*relevant verification/is)
    expect(wholeHandoff).toMatch(/fresh or stale/is)
    expect(taskPrompt).toMatch(/code-defect.*same Task \[N\].*kepler-code/is)
    expect(taskPrompt).toMatch(/evidence-gap.*same Base and Head/is)
    expect(taskPrompt).toMatch(/intent-defect.*proposal/is)
    expect(rubric).toMatch(/In `full` mode.*complete merge-base-to-head diff/is)
    expect(rubric).toMatch(/In `remediation` mode.*cumulative correction delta.*do not repeat/is)
  })

  it("keeps diagram routes and located-evidence handoffs consistent for typed and stale findings", () => {
    const flow = section(readSkill("kepler-orchestrate"), "## Process flow")
    const prompt = Fs.readFileSync(new URL("../../skills/kepler-orchestrate/references/code-feedback-prompt.md", import.meta.url), "utf-8")
    expect(flow).toContain('label="changes-requested, fresh or stale"')
    expect(flow).toContain('label="code-defect"')
    expect(flow).toContain('label="evidence-gap"')
    expect(flow).toContain('label="intent-defect"')
    expect(flow).toContain('label="approved / approved-remediation, current"')
    expect(flow).not.toContain('label="absent / lint-invalid / stale"')
    expect(prompt).toMatch(/typed `evidence-gap`.*legacy.*cannot verify from diff/is)
    expect(prompt).toMatch(/same supplied `Base` and `Head`/is)
  })

  it("runs only focused verification for a concrete doubt", () => {
    const verification = section(readReview(), "## Focused verification")

    expect(verification).toMatch(/only.*concrete.*doubt/is)
    expect(verification).toMatch(/narrowest focused (test|check)/i)
    expect(verification).toMatch(/does not.*full test suite|never.*full test suite/is)
    expect(verification).toMatch(/does not.*build|never.*build/is)
    expect(verification).toMatch(/kepler-finish-work.*mandatory\s+full\s+verification/is)
  })

  it("instantiates the installed root template and records material freshness", () => {
    const artifact = readReview()

    expect(artifact).toContain("${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/review.md")
    expect(artifact).toMatch(/exact installed.*template/is)
    expect(artifact).toContain("<change-dir>/review.md")
    expect(artifact).toMatch(/remove.*instruction block.*inline hint/is)
    expect(artifact).toMatch(/append.*next-numbered pass.*physical end/is)
    expect(artifact).toMatch(/preserve.*prior\s+pass/is)
    expect(artifact).toMatch(/frontmatter.*only.*artifact identity.*lifecycle/is)
    expect(artifact).toMatch(
      /Each pass contains exactly one full\s+`Base:`, `Head:`, and `Verdict:` field, followed by `Scope:` and `Target:`[\s\S]*?exactly the two child sections, `### Blocking` and `### Suggestions`/,
    )
    expect(artifact).toMatch(/never rewrite a prior pass/is)
    expect(artifact).toMatch(/no `### Reviewed range`\s+heading.*allowed/is)
    expect(artifact).toMatch(/never create.*`review-<k>\.md`/is)
    expect(artifact).not.toMatch(/```(?:markdown)?[\s\S]*?### Blocking[\s\S]*?### Suggestions[\s\S]*?```/)
    expect(artifact).toMatch(/latest material change commit/i)
    expect(artifact).toMatch(/root `progress\.md`.*task-N\/progress\.md.*task-N\/feedback\.md.*root `review\.md`.*root `finish\.md`/is)
    expect(artifact).toMatch(/skills.*templates.*scripts.*documentation.*material/is)
  })

  it("uses only the physically last valid and fresh review pass", () => {
    const artifact = readReview()

    expect(artifact).toMatch(/physically last pass.*governs/is)
    expect(artifact).toMatch(/base.*ancestor.*head/is)
    expect(artifact).toMatch(/head.*ancestor.*current `HEAD`/is)
    expect(artifact).toMatch(/head.*contains.*latest material change commit/is)
    expect(artifact).toMatch(/physically last pass.*lint.*format.*numbering.*fields.*findings/is)
    expect(artifact).toMatch(/successful lint.*not subject to a second shape check/is)
    expect(artifact).toMatch(/never.*fall back.*earlier\s+approval/is)
  })

  it("defines the one-time legacy transition and strict suffix boundary", () => {
    const artifact = readReview()

    expect(artifact).toMatch(/first append.*legacy-global history/is)
    expect(artifact).toMatch(/validate the legacy-global history/is)
    expect(artifact).toMatch(/preserve every existing pass body byte-for-byte/is)
    expect(artifact).toMatch(/remove exactly\s+the\s+global `base`, `head`, and `verdict` fields/is)
    expect(artifact).toMatch(
      /append the next complete pass-local record at\s+the\s+physical end in the same mutation/is,
    )
    expect(artifact).toMatch(/never copy global provenance into historical passes/is)
    expect(artifact).toMatch(/never retain\s+global provenance beside an explicit suffix/is)
    expect(artifact).toMatch(/fieldless prefix.*explicit suffix.*already transitioned/is)
    expect(artifact).toMatch(/fail closed for partial globals/is)
    expect(artifact).toMatch(/mixed\s+global-plus-explicit evidence/is)
    expect(artifact).toMatch(/missing legacy globals without an explicit suffix/is)
    expect(artifact).toMatch(/fieldless\s+pass after the explicit suffix/is)
    expect(artifact).toMatch(/no `### Reviewed range` heading.*allowed/is)
  })

  it("commits only the root review artifact and never updates progress or task status", () => {
    const recording = section(readReview(), "## Record and commit")

    expect(recording).toContain("artifact-only bookkeeping commit")
    expect(recording).toMatch(/only.*root `review\.md`/is)
    expect(recording).toMatch(/no code or task artifact/i)
    expect(recording).toMatch(/Never.*root.*progress\.md/is)
    expect(recording).toMatch(/Never.*task-local progress/i)
    expect(recording).toMatch(/Never.*task implementation status/is)
  })

  it("protects unrelated staged work before mutating or committing review", () => {
    const skill = readReview()
    const process = section(skill, "## Process")
    const safety = section(skill, "## Commit safety preflight")
    const recording = section(skill, "## Record and commit")

    expect(safety).toContain("git diff --cached --name-only")
    expect(safety).toMatch(/before.*(?:create|append|change|write|mutat).*review/is)
    expect(safety).toMatch(/pre-staged\s+production\s+path/i)
    expect(safety).toMatch(/pre-staged\s+change-artifact\s+path/i)
    expect(safety).toMatch(/never.*(?:unstage|reset|restore)/is)
    expect(recording).toContain("git commit --only --")
    expect(recording).toMatch(/pre-existing staged.*remain staged.*unchanged/is)
    expect(recording).toMatch(/after.*commit.*verify.*only.*root `review\.md`/is)
    expect(process.indexOf("Inspect the index")).toBeLessThan(
      process.indexOf("Append one complete pass"),
    )
    expect(process.indexOf("Append one complete pass")).toBeLessThan(
      process.indexOf("Verify the committed path list"),
    )
  })

  it("stops task-scoped input and redirects it to kepler-code-feedback", () => {
    const wrongScope = section(readReview(), "## Wrong scope")

    expect(wrongScope).toMatch(/task-scoped.*stop/is)
    expect(wrongScope).toMatch(/without recording a verdict/i)
    expect(wrongScope).toContain("`kepler-code-feedback`")
  })

  it("routes final findings through re-plan or proposal revision", () => {
    const handoff = section(readReview(), "## Output and handoff")

    expect(handoff).toMatch(/changes-requested.*complete classified finding set.*re-plan/is)
    expect(handoff).toMatch(/independently verifiable.*own code and\s+code-feedback cycle/is)
    expect(handoff).toMatch(/invalidates.*approved requirement or design.*kepler-propose/is)
    expect(handoff).toMatch(/Never send whole-branch findings directly to\s+`kepler-code`/i)
  })

  it("ships a whole-branch integration and omission quality rubric", () => {
    const skill = readReview()
    const rubric = readQualityRubric()

    expect(skill).toContain("references/code-quality.md")
    expect(rubric).toContain("# Whole-branch code-quality rubric")
    expect(rubric).toContain("## Integration and composition")
    expect(rubric).toContain("## Missing material changes")
    expect(rubric).toContain("## Affected consumers and assumptions")
    expect(rubric).toMatch(/beyond the diff/i)
  })
})
