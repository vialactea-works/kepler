import { describe, expect, it } from "vitest";
import { authoredJavaScriptPaths } from "../../scripts/check-typescript-sources.js";

describe("authored TypeScript source rule", () => {
  it("rejects authored JavaScript and module files", () => {
    expect(
      authoredJavaScriptPaths([
        "scripts/check.js",
        "tests/fixtures/generator.mjs",
        "src/legacy.MJS",
        "src/main.ts",
      ]),
    ).toEqual([
      "scripts/check.js",
      "tests/fixtures/generator.mjs",
      "src/legacy.MJS",
    ]);
  });

  it("allows compiler output and dependencies", () => {
    expect(
      authoredJavaScriptPaths([
        "packages/core/dist/index.js",
        "node_modules/package/index.mjs",
        "coverage/report.js",
        "target/generated.mjs",
        "packages/core/src/index.ts",
      ]),
    ).toEqual([]);
  });
});
