import { describe, expect, it } from "vitest"
import { readSkill } from "./helpers.js"

const writers = [
  "kepler-init",
  "kepler-compose-spec",
  "kepler-wayfinder",
  "kepler-wayfinder-domain-modeling",
  "kepler-wayfinder-research",
  "kepler-wayfinder-prototype",
  "kepler-grilling",
] as const

const readWriters = () =>
  Object.fromEntries(writers.map((name) => [name, readSkill(name)])) as Record<
    (typeof writers)[number],
    string
  >

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

describe("canonical and Wayfinder artifact lint contract", () => {
  it("maps each writer to its recognized and unrelated outputs", () => {
    const skills = readWriters()

    expect(skills["kepler-init"]).toContain(".kepler/specs/glossary.md")
    expect(skills["kepler-init"]).toContain("kepler workbench lint --file .kepler/specs/glossary.md")

    expect(skills["kepler-compose-spec"]).toContain(
      ".kepler/specs/<capability>.md",
    )
    expect(skills["kepler-compose-spec"]).toContain(
      "kepler workbench lint --file <spec-path>",
    )

    expect(skills["kepler-wayfinder"]).toContain(
      ".kepler/maps/<effort>/map.md",
    )
    expect(skills["kepler-wayfinder"]).toContain(
      ".kepler/maps/<effort>/tickets/NN-slug.md",
    )
    expect(skills["kepler-wayfinder"]).toContain(
      ".kepler/maps/<effort>/route.md",
    )
    expect(skills["kepler-wayfinder"]).toContain(
      ".kepler/specs/glossary.md",
    )
    expect(skills["kepler-wayfinder"]).toContain(
      "kepler workbench lint --file <map-path>",
    )
    expect(skills["kepler-wayfinder"]).toContain(
      "kepler workbench lint --file <ticket-path>",
    )
    expect(skills["kepler-wayfinder"]).toContain(
      "kepler workbench lint --file <route-path>",
    )
    expect(skills["kepler-wayfinder"]).toContain(
      "kepler workbench lint --file <spec-path>",
    )

    expect(skills["kepler-wayfinder-domain-modeling"]).toContain(
      ".kepler/specs/glossary.md",
    )
    expect(skills["kepler-wayfinder-domain-modeling"]).toContain(
      ".kepler/maps/<effort>/tickets/NN-slug.md",
    )
    expect(skills["kepler-wayfinder-domain-modeling"]).toContain(
      "kepler workbench lint --file <ticket-path>",
    )
    expect(skills["kepler-wayfinder-domain-modeling"]).toContain(
      "kepler workbench lint --file <spec-path>",
    )

    expect(skills["kepler-wayfinder-research"]).toContain(
      ".kepler/maps/<effort>/research/",
    )
    expect(skills["kepler-wayfinder-research"]).toContain(
      "kepler workbench lint --file <ticket-path>",
    )
    expect(skills["kepler-wayfinder-research"]).toMatch(
      /research notes.*(?:remain|are) outside lint scope|do not lint.*research notes/is,
    )
    expect(skills["kepler-wayfinder-research"]).toMatch(
      /only when.*ticket.*(?:mutated|edited)|if.*ticket.*(?:mutated|edited)/is,
    )

    expect(skills["kepler-wayfinder-prototype"]).toContain(
      "prototype/<map>/<ticket>",
    )
    expect(skills["kepler-wayfinder-prototype"]).toContain(
      "kepler workbench lint --file <ticket-path>",
    )
    expect(skills["kepler-wayfinder-prototype"]).toMatch(
      /throwaway.*(?:remain|are) outside lint scope|do not lint.*throwaway/is,
    )

    expect(skills["kepler-grilling"]).toContain("ticket's `## Answer`")
    expect(skills["kepler-grilling"]).toContain(
      "kepler workbench lint --file <ticket-path>",
    )
  })

  it("runs scoped lint after recognized mutations and before handoff", () => {
    const skills = readWriters()

    expectOrdered(
      skills["kepler-init"],
      "After creating the canonical glossary",
      "kepler workbench lint --file .kepler/specs/glossary.md",
    )
    expectOrdered(
      skills["kepler-compose-spec"],
      "After writing or editing each canonical spec",
      "kepler workbench lint --file <spec-path>",
    )
    expectOrdered(
      skills["kepler-wayfinder"],
      "After each write or edit of a recognized artifact",
      "kepler workbench lint --file <map-path>",
    )
    expectOrdered(
      skills["kepler-wayfinder"],
      "fold the working glossary's resolved terms into the canonical `.kepler/specs/glossary.md`",
      "kepler workbench lint --file <spec-path>",
    )
    expectOrdered(
      skills["kepler-wayfinder-domain-modeling"],
      "After each canonical glossary or ticket mutation",
      "kepler workbench lint --file <spec-path>",
    )
    expectOrdered(
      skills["kepler-wayfinder-domain-modeling"],
      "After each canonical glossary or ticket mutation",
      "kepler workbench lint --file <ticket-path>",
    )
    expectOrdered(
      skills["kepler-wayfinder-research"],
      "If the resolving ticket is edited",
      "kepler workbench lint --file <ticket-path>",
    )
    expectOrdered(
      skills["kepler-wayfinder-prototype"],
      "If the resolving ticket is edited",
      "kepler workbench lint --file <ticket-path>",
    )
    expectOrdered(
      skills["kepler-grilling"],
      "When the answer is written to a recognized ticket",
      "kepler workbench lint --file <ticket-path>",
    )

    for (const name of writers) {
      expect(skills[name]).toMatch(/nonzero.*lint|lint.*nonzero/is)
      expect(skills[name]).toMatch(/resolve.*finding|finding.*(?:resolve|rerun)|exact blocker/is)
      expect(skills[name]).toMatch(/before[\s\S]{0,60}(?:handoff|commit)/i)
    }
  })

  it("keeps author attribution explicit for author-bearing canonical specs", () => {
    const skills = readWriters()

    for (const name of [
      "kepler-compose-spec",
      "kepler-wayfinder",
      "kepler-wayfinder-domain-modeling",
    ] as const) {
      expect(skills[name]).toMatch(
        /git config user\.name[\s\S]*git config user\.email/i,
      )
      expect(skills[name]).toMatch(
        /preserve.*(?:recorded|existing).*author|author.*preserve.*(?:recorded|existing)/is,
      )
      expect(skills[name]).toMatch(
        /(?:missing.*identity|identity.*missing|identity.*unavailable)[\s\S]*(?:stop|report)[\s\S]*(?:(?:not|never) invent|instead of invent)/is,
      )
    }
  })
})
