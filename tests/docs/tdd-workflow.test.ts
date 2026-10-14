import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const documents = ["docs/skills.md", "docs/sdd-framework.md", "docs/modes.md"] as const;
const dependencyDocuments = ["docs/sdd-framework.md", "docs/modes.md"] as const;
const content = Object.fromEntries(
  documents.map((document) => [document, readFileSync(resolve(root, document), "utf8")]),
);

describe("TDD workflow documentation", () => {
  it.each(documents)("documents the TDD task loop independently in %s", (document) => {
    const value = content[document];

    expect(value).toMatch(/`?kepler-code`?\s+follows a red\s*(?:→|->)\s*green\s*(?:→|->)\s*refactor cycle/i);
    expect(value).toMatch(/refactor phase.*kepler-code-feedback.*gate/is);
    expect(value).toMatch(/green alone does not complete a task/i);
  });

  it.each(documents)("documents the correction loop independently in %s", (document) => {
    const value = content[document];

    expect(value).toMatch(
      /changes-requested.*returns the same task.*fresh correction cycle.*verification.*before advancement/is,
    );
  });

  it.each(documents)("documents exceptional verification independently in %s", (document) => {
    const value = content[document];

    expect(value).toMatch(
      /no conventional failing test.*justification.*repeatable alternative verification/i,
    );
  });

  it.each(dependencyDocuments)("keeps dependency-mode corrections inside the TDD contract in %s", (document) => {
    const value = content[document];

    expect(value).toMatch(/dependency-mode v2.*Goal.*Acceptance.*Depends on.*Steps.*Verify.*Commit/is);
    expect(value).toMatch(/Files.*optional\s+guidance.*not\s+an\s+allowlist/is);
    expect(value).toMatch(/correction.*Red.*Green.*Refactor.*Verify/is);
    expect(value).toMatch(/goal-serving unlisted.*(?:edit|path).*without.*re-planning/is);
  });
});
