import { describe, expect, it } from "vitest"
import { readSkill, section } from "./helpers.js"

const changeScopedWriters = [
  "kepler-propose",
  "kepler-code",
  "kepler-code-feedback",
  "kepler-critique",
  "kepler-review",
  "kepler-finish-work",
] as const

const readWriters = () =>
  Object.fromEntries(
    changeScopedWriters.map((name) => [name, readSkill(name)]),
  ) as Record<(typeof changeScopedWriters)[number], string>

const expectOrdered = (
  content: string,
  earlier: string,
  later: string,
): void => {
  const earlierIndex = content.indexOf(earlier)
  const laterIndex = content.indexOf(later, earlierIndex + earlier.length)

  expect(earlierIndex, `missing mutation marker: ${earlier}`).toBeGreaterThanOrEqual(0)
  expect(laterIndex, `missing lint marker: ${later}`).toBeGreaterThan(earlierIndex)
}

describe("change-scoped artifact lint contract", () => {
  it("covers every recognized change-scoped artifact writer", () => {
    const skills = readWriters()

    for (const name of changeScopedWriters) {
      expect(skills[name]).toContain("kepler workbench lint")
      expect(skills[name]).toMatch(/nonzero.*lint|lint.*nonzero/is)
    }
  })

  it("uses complete-tree lint for change mutations and file lint for owned histories", () => {
    const skills = readWriters()

    for (const name of [
      "kepler-propose",
      "kepler-code",
    ] as const) {
      expect(skills[name]).toContain(
        "kepler workbench lint --change-dir <change-dir>",
      )
    }

    expect(skills["kepler-critique"]).toContain(
      "kepler workbench lint --file <change-dir>/critique.md",
    )
    expect(skills["kepler-code-feedback"]).toContain(
      "kepler workbench lint --file <change-dir>/tasks/task-N/feedback.md",
    )
    expect(skills["kepler-review"]).toContain(
      "kepler workbench lint --file <change-dir>/review.md",
    )
    expect(skills["kepler-finish-work"]).toContain(
      "kepler workbench lint --file <file>",
    )
    expect(skills["kepler-finish-work"]).toContain(
      "kepler workbench lint --file <change-dir>/finish.md",
    )
    expect(skills["kepler-propose"]).toContain(
      "kepler workbench lint --file <path>",
    )
    expect(skills["kepler-finish-work"]).toContain(
      "kepler workbench lint --file <path>",
    )
  })

  it("runs lint after each recognized mutation and before handoff or commit", () => {
    const skills = readWriters()

    expectOrdered(
      section(skills["kepler-propose"], "## Process"),
      "After every proposal artifact mutation",
      "kepler workbench lint --change-dir <change-dir>",
    )
    expectOrdered(
      section(skills["kepler-code"], "## Process"),
      "root metadata/row transition",
      "kepler workbench lint --change-dir <change-dir>",
    )
    expectOrdered(
      section(skills["kepler-code-feedback"], "## Record and commit"),
      "After appending the complete pass",
      "kepler workbench lint --file <change-dir>/tasks/task-N/feedback.md",
    )
    expectOrdered(
      section(skills["kepler-critique"], "## Process"),
      "write the report",
      "kepler workbench lint --file <change-dir>/critique.md",
    )
    expectOrdered(
      section(skills["kepler-review"], "## Record and commit"),
      "After appending the complete pass",
      "kepler workbench lint --file <change-dir>/review.md",
    )
    expectOrdered(
      section(skills["kepler-finish-work"], "## Process"),
      "Append the template-defined `Attempt N`",
      "kepler workbench lint --file <change-dir>/finish.md",
    )
    const proposeProcess = section(skills["kepler-propose"], "## Process")
    const codeProcess = section(skills["kepler-code"], "## Process")
    const feedbackRecording = section(
      skills["kepler-code-feedback"],
      "## Record and commit",
    )
    const critiqueProcess = section(skills["kepler-critique"], "## Process")
    const reviewRecording = section(skills["kepler-review"], "## Record and commit")
    const finishProcess = section(skills["kepler-finish-work"], "## Process")

    expectOrdered(
      proposeProcess,
      "kepler workbench lint --change-dir <change-dir>",
      "the next mutation or handoff",
    )
    expectOrdered(
      codeProcess,
      "kepler workbench lint --change-dir <change-dir>",
      "without committing or claiming compliance",
    )
    expectOrdered(
      feedbackRecording,
      "kepler workbench lint --file <change-dir>/tasks/task-N/feedback.md",
      "before staging or",
    )
    expectOrdered(
      critiqueProcess,
      "kepler workbench lint --file <change-dir>/critique.md",
      "before printing it or handing it off",
    )
    expectOrdered(
      reviewRecording,
      "kepler workbench lint --file <change-dir>/review.md",
      "before staging or",
    )
    expectOrdered(
      finishProcess,
      "kepler workbench lint --file <change-dir>/finish.md",
      "Commit that attempt alone",
    )
  })

  it("attributes each new proposed artifact to the effective Git identity", () => {
    const propose = section(readWriters()["kepler-propose"], "## Process")
    const creationGuidance = propose.match(
      /For every\s+new author-bearing output[\s\S]*?before writing;[\s\S]*?never use an agent name,[\s\S]*?operating-system username,[\s\S]*?unresolved template placeholder\./i,
    )?.[0]

    expect(creationGuidance).toBeDefined()
    for (const artifact of [
      "proposal.md",
      "requirements/<capability>.md",
      "design.md",
    ]) {
      expect(creationGuidance).toContain(artifact)
    }
    expect(creationGuidance).toMatch(/effective repository[\s\S]*git config user\.name/i)
    expect(creationGuidance).toMatch(/git config user\.name[\s\S]*git config user\.email/i)
    expect(creationGuidance).toMatch(/author: Name <email>/i)
    expect(creationGuidance).toMatch(/even when[\s\S]*`proposal\.md` already exists/i)
  })

  it("stops every proposed output when either Git identity value is unavailable", () => {
    const propose = section(readWriters()["kepler-propose"], "## Process")

    expect(propose).toMatch(
      /If either configured Git value is unavailable[\s\S]*ask the user or\s+stop with a blocker before writing/i,
    )
    expect(propose).toMatch(
      /never use an agent name,[\s\S]*?operating-system username,[\s\S]*?unresolved template placeholder/i,
    )

    for (const artifact of [
      "proposal.md",
      "requirements/<capability>.md",
      "design.md",
    ]) {
      const escapedArtifact = artifact.replace(/\./g, "\\.")

      expect(propose).toMatch(
        new RegExp(
          `For every\\s+new author-bearing output[\\s\\S]*?${escapedArtifact}[\\s\\S]*?git config user\\.name[\\s\\S]*?git config user\\.email[\\s\\S]*?If either configured Git value is unavailable[\\s\\S]*?ask the user or\\s+stop with a blocker before writing`,
          "i",
        ),
      )
    }
  })

  it("preserves each existing proposed artifact author on revisions", () => {
    const propose = section(readWriters()["kepler-propose"], "## Process")
    const revisionGuidance = propose.match(
      /On (?:a\s+)?revisions?[\s\S]*?unless explicitly directed otherwise\./i,
    )?.[0]

    expect(revisionGuidance).toBeDefined()
    for (const artifact of [
      "proposal.md",
      "requirements/<capability>.md",
      "design.md",
    ]) {
      expect(revisionGuidance).toContain(artifact)
    }
    expect(revisionGuidance).toMatch(/preserve[\s\S]*recorded author[\s\S]*exactly/i)
  })

  it("preserves semantic and authorship gates around lint", () => {
    const skills = readWriters()

    expect(skills["kepler-propose"]).toMatch(
      /git config user\.name[\s\S]*git config user\.email/i,
    )
    expect(skills["kepler-propose"]).toMatch(
      /On a revision[\s\S]*preserve.*existing.*author attribution/i,
    )
    expect(skills["kepler-finish-work"]).toMatch(
      /git config user\.name[\s\S]*git config user\.email/i,
    )
    expect(skills["kepler-finish-work"]).toMatch(
      /existing canonical spec[\s\S]*preserve.*author metadata exactly/i,
    )
    expect(skills["kepler-code-feedback"]).toMatch(
      /lint.*before stag(?:e|ing).*commit/is,
    )
    expect(skills["kepler-review"]).toMatch(/lint.*before stag(?:e|ing).*commit/is)
    expect(skills["kepler-finish-work"]).toMatch(
      /lint.*does not replace.*(?:freshness|ancestry|completion|semantic)/is,
    )
  })
})
