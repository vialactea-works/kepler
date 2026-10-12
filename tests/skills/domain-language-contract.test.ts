import { describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import { readSkill, section } from "./helpers.js";

const compact = (content: string): string => content.replace(/\s+/g, " ");
const init = readSkill("kepler-init");
const propose = readSkill("kepler-propose");
const compose = readSkill("kepler-compose-spec");
const critique = readSkill("kepler-critique");
const modeling = readSkill("kepler-wayfinder-domain-modeling");
const wayfinder = readSkill("kepler-wayfinder");
const glossaryFormat = Fs.readFileSync(
  new URL("../../skills/kepler-wayfinder-domain-modeling/references/GLOSSARY-FORMAT.md", import.meta.url),
  "utf8",
);

const capabilityDefinition = "A capability is a cohesive, durable area of responsibility with a clear boundary and an observable contract. It can represent a domain, subdomain or bounded context, including infrastructure responsibilities.";

describe("domain-language authoring resources", () => {
  it("establishes the canonical glossary after migration and scaffolding", () => {
    const process = compact(section(init, "## Process"));
    const migration = process.indexOf("Check for legacy project data before scaffolding");
    const scaffold = process.indexOf("Scaffold `.kepler/`");
    const glossary = process.indexOf("Establish the canonical glossary");
    const confirmation = process.indexOf("Confirm or record");

    expect(migration).toBeGreaterThanOrEqual(0);
    expect(scaffold).toBeGreaterThan(migration);
    expect(glossary).toBeGreaterThan(scaffold);
    expect(confirmation).toBeGreaterThan(glossary);
    expect(process).toContain(".kepler/specs/glossary.md");
    expect(process).toContain("templates/glossary.md");
    expect(process).toMatch(/After creating the canonical glossary, run `kepler workbench lint --file \.kepler\/specs\/glossary\.md`/);
  });

  it("preserves migrated and existing language instead of regenerating it", () => {
    const process = compact(section(init, "## Process"));

    expect(process).toMatch(/If the glossary already exists.*read and preserve its content and recorded author.*do not overwrite or reformat it/i);
    expect(process).toMatch(/git config user\.name.*git config user\.email.*Name <email>/);
    expect(process).toMatch(/If either identity value is missing.*stop/i);
    expect(process).toMatch(/established project documentation.*source references/i);
    expect(process).toMatch(/unresolved.*definitions.*never invent/i);
  });

  it("holds readiness on missing or invalid vocabulary and material ambiguity", () => {
    const process = compact(section(init, "## Process"));
    const output = compact(section(init, "## Output"));

    expect(process).toMatch(/show.*AGENTS\.md.*glossary.*correction/i);
    expect(process).toMatch(/missing or lint-invalid glossary.*material terminology conflict.*unresolved/i);
    expect(output).toContain(".kepler/specs/glossary.md");
    expect(output).toMatch(/not ready.*preserve completed work/i);
  });

  it("uses context-scoped canonical meanings and sourced fallback language", () => {
    const language = compact(section(propose, "## Domain language and capability scope"));
    const process = compact(section(propose, "## Process"));

    expect(language).toMatch(/canonical glossary takes precedence.*established project documentation.*source/i);
    expect(language).toMatch(/same word.*different meanings.*different bounded contexts/i);
    expect(language).toMatch(/conflict.*requester.*do not silently redefine/i);
    expect(language).toMatch(/Open Questions.*material.*blocks approval/i);
    expect(process).toMatch(/Read the canonical glossary.*before drafting goals/i);
    expect(process).toMatch(/Domain Context.*Ubiquitous Language.*Subdomains and Bounded Contexts/i);
    expect(process).toMatch(/Affected Boundaries.*responsibility.*data ownership.*trust/i);
  });

  it("shares capability scope without excluding infrastructure contracts", () => {
    for (const content of [propose, compose]) {
      expect(compact(content)).toContain(capabilityDefinition);
      expect(content).toContain("rest-api");
      expect(compact(content)).toMatch(/REST alone does not establish a bounded context/i);
      expect(compact(content)).toMatch(/parent.*child.*duplicate.*contracts/i);
      expect(compact(content)).not.toMatch(/not a mechanism, a config surface, an integration point/i);
    }
    expect(compact(section(compose, "## Process"))).toMatch(/scope.*Overview/i);
  });

  it("preserves capability identifiers, history and the tactical path", () => {
    const language = compact(section(propose, "## Domain language and capability scope"));
    const tactical = compact(section(propose, "## Tactical requirements-only approval"));

    expect(language).toMatch(/Preserve existing capability slugs.*metadata.*file mapping/i);
    expect(language).toMatch(/Historical.*remain valid.*do not rewrite/i);
    expect(tactical).toMatch(/Apply the language-source rules/i);
    expect(tactical).toMatch(/Do not create or edit `proposal\.md`, `design\.md`/i);
    expect(tactical).not.toContain("Write Domain Context");
  });

  it("reviews meanings per context and checks scope without historical backfill", () => {
    const dimensions = compact(section(critique, "## Review dimensions"));

    expect(dimensions).toMatch(/one term per concept within each bounded context/i);
    expect(dimensions).toMatch(/Domain scope.*subdomains.*bounded contexts.*capabilit/i);
    expect(dimensions).toMatch(/Boundary impact.*ownership.*contract/i);
    expect(dimensions).toMatch(/infrastructure.*REST alone/i);
    expect(dimensions).toMatch(/historical.*missing.*Domain Context.*not.*invalid/i);
  });

  it("records outside-map naming confirmation without manufacturing a ticket", () => {
    const session = compact(section(modeling, "## During the session"));
    const flow = section(modeling, "## Process flow");

    expect(session).toMatch(/Within a map, every decision.*resolving ticket.*## Answer/i);
    expect(session).toMatch(/Outside a map.*confirmed naming decisions.*canonical glossary.*## Decisions.*Source/i);
    expect(session).toMatch(/architectural decisions.*existing project decision location/i);
    expect(flow).toContain('"Working within a map?" [shape=diamond]');
    expect(flow).toContain('"Working within a map?" -> "Naming decision?" [label="no"]');
    expect(flow).toContain('"Naming decision?" -> "Update canonical glossary\\n+ naming decision, source and lint" [label="yes"]');
    expect(flow).toContain('"Naming decision?" -> "Record architecture decision\\nin existing project location" [label="no"]');
  });

  it("keeps working language effort-local and preserves scoped canonical meanings", () => {
    const content = compact(modeling);
    const format = compact(glossaryFormat);

    expect(content).toMatch(/kepler-init.*creates.*canonical glossary/i);
    expect(content).toMatch(/working glossaries.*lazily/i);
    expect(format).toContain("templates/glossary.md");
    expect(format).toMatch(/same word.*different.*bounded contexts/i);
    expect(format).toMatch(/Source.*Aliases/i);
    expect(format).toContain("Never read another effort's working glossary");
    expect(compact(wayfinder)).toMatch(/fold.*by bounded context.*confirming with the user any change to committed language/i);
    expect(compact(wayfinder)).not.toContain("favoring the newer term");
  });
});
