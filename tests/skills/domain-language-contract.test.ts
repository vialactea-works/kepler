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

  it("authors designs through a sourced domain model and architectural realization", () => {
    const contract = compact(section(propose, "## Design authoring contract"));
    const process = compact(section(propose, "## Process"));
    expect(contract).toMatch(/goals.*sourced.*glossary/i);
    expect(contract).toMatch(/domains.*subdomains.*bounded contexts.*relationships.*commands.*events.*states.*invariants/i);
    expect(contract).toMatch(/core.*supporting.*generic.*supported/i);
    expect(contract).toMatch(/package.*created, modified or removed.*responsibility.*exposes.*depends on/i);
    expect(contract).toMatch(/existing callers.*success.*failure.*replacement contracts.*requirements/i);
    expect(contract).toMatch(/inbound.*outbound.*owner.*adapter.*translation/i);
    expect(contract).toMatch(/affected code.*domain.*infrastructure.*existing.*proposed.*removed/i);
    expect(contract).toMatch(/undefined.*conflicting.*Open Questions.*material.*blocks approval/i);
    expect(contract).toMatch(/optional sections.*do not invent.*interfaces/i);
    expect(contract).toMatch(/historical lint-valid designs.*not.*new.*sections/i);
    expect(process).toMatch(/Write the design.*Design authoring contract.*before.*decisions/i);
    expect(process).toMatch(/Self-review each artifact.*design.*ownership.*contracts.*failed semantic gate/i);
  });

  it("critiques model, package and port coverage while distinguishing proposed code", () => {
    const dimensions = compact(section(critique, "## Review dimensions"));
    const process = compact(section(critique, "## Process"));
    expect(dimensions).toMatch(/Domain model.*relationships.*commands.*events.*states.*invariants/i);
    expect(dimensions).toMatch(/Architectural realization.*package.*created, modified or removed.*exposed.*required.*ports.*adapters/i);
    expect(dimensions).toMatch(/Code attribution.*domain.*infrastructure.*responsibility/i);
    expect(dimensions).toMatch(/current.*proposed.*unsupported.*claims/i);
    expect(dimensions).toMatch(/historical lint-valid designs.*not.*missing.*new.*sections/i);
    expect(process).toMatch(/existing, proposed or removed.*proposed.*need not exist.*owner.*contract/i);
    expect(process).toMatch(/existing.*signatures.*return types/i);
    expect(critique).not.toMatch(/Every referenced type\/function\/file\/example exists/);
    expect(critique).not.toContain("verify code exists; nothing uses removed code");
    expect(dimensions).toMatch(/missing.*material.*blocks approval.*lint/i);
  });

  it("keeps design author and reviewer quality rubrics synchronized and proportionate", () => {
    const references = ["kepler-propose", "kepler-critique"].map((name) => Fs.readFileSync(
      new URL(`../../skills/${name}/references/code-quality.md`, import.meta.url), "utf8",
    ));
    expect(references[0]).toBe(references[1]);
    const ownership = compact(section(references[0], "### Domain ownership & architectural attribution").split("\n### ")[0]);
    expect(ownership).toMatch(/glossary.*sources.*package.*ports.*adapters.*code/i);
    expect(ownership).toMatch(/proposed.*existing/i);
    expect(ownership).toMatch(/do not.*invent.*context.*interface/i);
  });

  it("maps durable model and architecture facts into canonical sections without importing mechanisms", () => {
    const inputs = compact(section(compose, "## Inputs"));
    const model = compact(section(compose, "## Domain and architecture grounding"));
    const process = compact(section(compose, "## Process"));
    expect(inputs).toMatch(/domain and architecture documentation/i);
    expect(model).toMatch(/glossary.*authoritative project.*undefined.*conflicting/i);
    expect(model).toMatch(/domains.*subdomains.*bounded contexts.*relationships.*commands.*events.*states.*invariants/i);
    expect(model).toMatch(/package.*ports.*adapters.*code.*evidence.*not.*context/i);
    expect(model).toMatch(/Overview.*Contract.*Behavior.*Invariants.*Decisions/i);
    expect(model).toMatch(/private wiring.*code attribution.*design.*not.*canonical requirements/i);
    expect(process).toMatch(/reformat.*preserve.*ownership.*translation.*current.*guarantees/i);
    expect(process).toMatch(/from-code.*proposed.*design.*not.*current/i);
    expect(process).toMatch(/Self-review.*ownership.*source.*unknown/i);
  });

  it("keeps direct-authoring and distillation architecture guidance at the same altitude", () => {
    const references = ["kepler-compose-spec", "kepler-finish-work"].map((name) => Fs.readFileSync(
      new URL(`../../skills/${name}/references/spec-altitude.md`, import.meta.url), "utf8",
    ));
    expect(references[0]).toBe(references[1]);
    const mapping = compact(section(references[0], "## Domain and architecture mapping"));
    expect(mapping).toMatch(/glossary.*authoritative.*sources/i);
    expect(mapping).toMatch(/responsibility.*Overview/);
    expect(mapping).toMatch(/ports.*commands.*events.*Contract/);
    expect(mapping).toMatch(/transitions.*Behavior/);
    expect(mapping).toMatch(/Invariants.*Decisions/);
    expect(mapping).toMatch(/private.*code attribution.*design/i);
    expect(mapping).toMatch(/preserve.*reformat/i);
    expect(mapping).toMatch(/from-code.*current behavior.*never a proposed design/i);
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
