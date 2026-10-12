import { describe, expect, it } from "vitest"
import { readSkill, section } from "./helpers.js"
import * as Fs from "node:fs"

const changeReaders = [
  "kepler-plan",
  "kepler-code",
  "kepler-code-feedback",
  "kepler-review",
  "kepler-orchestrate",
  "kepler-finish-work",
] as const

const readPrompt = (name: string): string =>
  Fs.readFileSync(
    new URL(`../../skills/kepler-orchestrate/references/${name}`, import.meta.url),
    "utf-8",
  )

describe("lint is the artifact-format authority for pipeline skills", () => {
  it.each(changeReaders)("%s checks existing artifacts with scoped lint", (name) => {
    const skill = readSkill(name)

    expect(skill).toContain("kepler workbench lint --change-dir <change-dir>")
    expect(skill).toMatch(/(?:single source\s+of\s+truth|exit status alone|format validation|format and schema validity)/is)
  })

  it.each(["kepler-code-feedback", "kepler-review"] as const)(
    "%s does not reject lint-valid root progress for supplemental content",
    (name) => {
      const preflight = section(readSkill(name), "## Generation preflight")

      expect(preflight).toMatch(/root.*progress\.md.*(?:frontmatter|additional content|extra content)/is)
      expect(preflight).toMatch(/lint does not (?:require|check) absent files/is)
      expect(preflight).not.toMatch(/must (?:contain only|be the exact) task-only table/is)
      expect(preflight).not.toMatch(/reject a monolithic root progress file/is)
    },
  )

  it("keeps workflow gates separate from artifact-format checks", () => {
    const feedback = readSkill("kepler-code-feedback")
    const review = readSkill("kepler-review")
    const finish = readSkill("kepler-finish-work")

    expect(feedback).toContain("valid feedback Bases against the first parent")
    expect(feedback).toContain("Base-to-Head and Head-to-current-`HEAD` ancestry")
    expect(review).toMatch(/durable approved feedback.*branch inspection/is)
    expect(finish).toMatch(/precondition command.*completion readiness.*not.*artifact-format/is)
  })

  it("dispatch prompts refer to lint instead of restating pass grammars", () => {
    for (const name of ["code-feedback-prompt.md", "whole-branch-review-prompt.md"]) {
      const prompt = readPrompt(name)

      expect(prompt).toContain("kepler workbench lint --change-dir <change-dir>")
      expect(prompt).toMatch(/only lint decides whether their format is valid/is)
      expect(prompt).not.toMatch(/fail closed for partial globals/i)
    }
  })

  it("keeps canonical spec authoring guidance aligned with lint-required sections", () => {
    const template = Fs.readFileSync(new URL("../../bundle/templates/requirements-spec.md", import.meta.url), "utf-8")

    for (const name of ["kepler-compose-spec", "kepler-finish-work"]) {
      const reference = Fs.readFileSync(
        new URL(`../../skills/${name}/references/spec-altitude.md`, import.meta.url),
        "utf-8",
      )
      expect(reference).toMatch(/five sections required by `kepler workbench lint`/i)
      expect(reference).toMatch(/lint alone decides whether an existing artifact's format is valid/is)
      expect(reference).not.toMatch(/omit any section a capability has nothing for/i)
    }
    for (const heading of ["Overview", "Contract", "Behavior", "Invariants", "Decisions"])
      expect(template).toContain(`## ${heading}`)
    expect(template).toMatch(/keep all five top-level sections.*lint requires them/is)
    expect(template).not.toMatch(/omit this section if|omit if there are none/i)
  })

  it("limits bare glossary format to working notes and allows lint-valid route extensions", () => {
    const glossary = Fs.readFileSync(
      new URL("../../skills/kepler-wayfinder-domain-modeling/references/GLOSSARY-FORMAT.md", import.meta.url),
      "utf-8",
    )
    const wayfinder = readSkill("kepler-wayfinder")

    expect(glossary).toMatch(/bare Markdown format applies only to `.kepler\/maps\/.*glossary\.md`/is)
    expect(glossary).toMatch(/canonical.*requirements-spec.*kepler workbench lint/is)
    expect(wayfinder).toMatch(/lint-valid existing route.*not invalid.*other sections/is)
  })
})
