import { describe, expect, it } from "vitest";
import { parseReviewPasses } from "../../packages/cli/src/workbench/review-passes.js";
import type { RecognizedArtifact } from "../../packages/cli/src/workbench/artifact-reader.js";

const sha = "0123456789abcdef0123456789abcdef01234567";
const head = "fedcba9876543210fedcba9876543210fedcba98";

const recognized = (
  metadata: Record<string, unknown>,
  body: string,
  sourcePath =
    metadata.artifact === "feedback"
      ? ".kepler/changes/demo/tasks/task-2/feedback.md"
      : ".kepler/changes/demo/review.md",
): RecognizedArtifact => ({
  _tag: "recognized",
  sourcePath,
  metadata,
  body,
  locations: {
    frontmatter: { startLine: 1, endLine: 6 },
    metadata: { startLine: 2, endLine: 5 },
    body: { startLine: 7, endLine: body.split(/\r\n|\n|\r/).length + 6 },
  },
});

const pass = (
  number: number,
  date: string,
  verdict: string,
  blocking: string,
  suggestions = "- None.",
  base = sha,
  passHead = head,
): string => `## Pass ${number} — ${date}

Base: ${base}
Head: ${passHead}
Verdict: ${verdict}

### Blocking
${blocking}

### Suggestions
${suggestions}`;

const fieldlessPass = (
  number: number,
  date: string,
  blocking: string,
  suggestions = "- None.",
): string => `## Pass ${number} — ${date}

### Blocking
${blocking}

### Suggestions
${suggestions}`;

const history = (...passes: readonly string[]): string =>
  `# Whole-branch Review: Demo\n\n${passes.join("\n\n")}`;

const scopedHistory = history(
  `## Pass 1 — 2026-09-12\n\nBase: ${sha}\nHead: ${head}\nVerdict: changes-requested\nScope: full\nTarget: refs/remotes/origin/main\n\n### Blocking\n- [src/main.ts:12] Fix the regression (violates: behavior)\n\n### Suggestions\n- None.`,
  `## Pass 2 — 2026-09-13\n\nBase: ${sha}\nHead: ${head}\nVerdict: approved-remediation\nScope: remediation\nTarget: refs/remotes/origin/main\nParent pass: 1\nParent commit: ${sha}\nDelta base: ${head}\nResolutions: [{"finding":"pass-1-blocking-1","evidence":["src/main.ts correction at ${head}"],"verification":"focused test passed"}]\n\n### Blocking\n- None.\n\n### Suggestions\n- Resolved the retained blocker.`,
);

describe("review pass parser", () => {
  it.each([false, true])("rejects duplicate implicit identities after first-occurrence normalization (carried=%s)", (carried) => {
    const finding = "- [src/main.ts:12] kind: code-defect; Fix the regression (violates: behavior)";
    const repeated = `${finding}\n${finding}`;
    const result = parseReviewPasses(recognized(
      { artifact: "review" },
      carried
        ? history(pass(1, "2026-09-12", "changes-requested", finding), pass(2, "2026-09-13", "changes-requested", repeated))
        : history(pass(1, "2026-09-12", "changes-requested", repeated)),
    ));

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      message: "Blocking findings must have unique identities after first-occurrence normalization",
    }));
    expect(result.latest).toBeUndefined();
  });

  it.each(["legacy-global", "migrated", "migrated-explicit"])("retains first physical finding identity across %s structural history", (mode) => {
    const original = "- [src/main.ts:12] Fix the regression (violates: behavior)";
    const carried = mode === "migrated-explicit"
      ? "- [src/main.ts:12] id: pass-1-blocking-1; kind: code-defect; Fix the regression (violates: behavior)"
      : original;
    const result = parseReviewPasses(recognized(
      { artifact: "review", ...(mode === "legacy-global" ? { base: sha, head, verdict: "changes-requested" } : {}) },
      history(
        fieldlessPass(1, "2026-09-12", original),
        mode === "legacy-global"
          ? fieldlessPass(2, "2026-09-13", carried)
          : pass(2, "2026-09-13", "changes-requested", carried),
      ),
    ));

    expect(result.diagnostics).toEqual([]);
    expect(result.passes[0]).toMatchObject({ provenance: "structural", blocking: [original.slice(2)] });
    expect(result.passes[0]).not.toHaveProperty("base");
    expect(result.passes[0]).not.toHaveProperty("head");
    expect(result.latest?.findings[0]?.id).toBe("pass-1-blocking-1");
  });

  it("rejects assigning a migrated carried finding a new identity", () => {
    const result = parseReviewPasses(recognized(
      { artifact: "review" },
      history(
        fieldlessPass(1, "2026-09-12", "- [src/main.ts:12] Fix the regression (violates: behavior)"),
        pass(2, "2026-09-13", "changes-requested", "- [src/main.ts:12] id: pass-2-blocking-1; kind: code-defect; Fix the regression (violates: behavior)"),
      ),
    ));

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      message: "A carried finding must retain its first-occurrence identity",
    }));
    expect(result.latest).toBeUndefined();
  });

  it("parses complete multi-pass history including changes-requested then approved", () => {
    const result = parseReviewPasses(
      recognized(
        { artifact: "review" },
        history(
          pass(
            1,
            "2026-09-12",
            "changes-requested",
            "- [src/main.ts:12] Fix the regression (violates: behavior)",
            "- Explain the edge case.",
          ),
          pass(2, "2026-09-13", "approved", "- None."),
        ),
      ),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.passes).toEqual([
      {
        number: 1,
        date: "2026-09-12",
        provenance: "per-pass",
        base: sha,
        head,
        verdict: "changes-requested",
        blocking: [
          "[src/main.ts:12] Fix the regression (violates: behavior)",
        ],
        findings: [
          {
            id: "pass-1-blocking-1",
            text: "[src/main.ts:12] Fix the regression (violates: behavior)",
          },
        ],
        suggestions: ["Explain the edge case."],
        line: 9,
      },
      {
        number: 2,
        date: "2026-09-13",
        provenance: "per-pass",
        base: sha,
        head,
        verdict: "approved",
        blocking: [],
        findings: [],
        suggestions: [],
        line: 21,
      },
    ]);
  });

  it("parses feedback with the same per-pass grammar", () => {
    const result = parseReviewPasses(
      recognized(
        { artifact: "feedback" },
        `# Code Feedback: Task 2 — Validate

${pass(1, "2026-09-12", "approved", "- None.")}`,
      ),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.latest).toMatchObject({
      number: 1,
      verdict: "approved",
      base: sha,
      head,
    });
  });

  it("requires contiguous pass numbering", () => {
    const result = parseReviewPasses(
      recognized(
        { artifact: "feedback" },
        history(
          pass(1, "2026-09-12", "approved", "- None."),
          pass(3, "2026-09-14", "approved", "- None."),
        ),
      ),
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "non-monotonic-record",
        sourcePath: ".kepler/changes/demo/tasks/task-2/feedback.md",
        location: { line: 21 },
      }),
    );
  });

  it.each([
    [
      "duplicate Base",
      "Base: " + sha + "\nBase: " + sha,
      "invalid-record",
    ],
    ["missing Head", "Base: " + sha + "\nVerdict: approved", "missing-section"],
    [
      "misordered fields",
      "Head: " + head + "\nBase: " + sha + "\nVerdict: approved",
      "invalid-record",
    ],
  ])("rejects %s", (_name, fields, code) => {
    const result = parseReviewPasses(
      recognized(
        { artifact: "review" },
        `# Whole-branch Review: Demo\n\n## Pass 1 — 2026-09-12\n\n${fields}\n\n### Blocking\n- None.\n\n### Suggestions\n- None.`,
      ),
    );

    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code }));
  });

  it.each([
    ["invalid Base", "Base: abc"],
    ["invalid Head", "Head: ABCDEF"],
    ["invalid Verdict", "Verdict: maybe"],
  ])("rejects %s", (_name, field) => {
    const fields = `Base: ${sha}\nHead: ${head}\nVerdict: approved`.replace(
      field.startsWith("Base")
        ? `Base: ${sha}`
        : field.startsWith("Head")
          ? `Head: ${head}`
          : "Verdict: approved",
      field,
    );
    const result = parseReviewPasses(
      recognized(
        { artifact: "review" },
        `# Whole-branch Review: Demo\n\n## Pass 1 — 2026-09-12\n\n${fields}\n\n### Blocking\n- None.\n\n### Suggestions\n- None.`,
      ),
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid-value" }),
    );
  });

  it("rejects unsupported child headings and headings before Blocking", () => {
    const result = parseReviewPasses(
      recognized(
        { artifact: "review" },
        `# Whole-branch Review: Demo

## Pass 1 — 2026-09-12

Base: ${sha}
Head: ${head}
Verdict: approved

### Reviewed range
- ${sha}..${head}

### Blocking
- None.

### Suggestions
- None.`,
      ),
    );

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "invalid-record",
    );
  });

  it("rejects fields after child sections and duplicate child sections", () => {
    const result = parseReviewPasses(
      recognized(
        { artifact: "review" },
        `# Whole-branch Review: Demo

## Pass 1 — 2026-09-12

Base: ${sha}
Head: ${head}
Verdict: approved

### Blocking
- None.
Base: ${sha}

### Suggestions
- None.

### Suggestions
- None.`,
      ),
    );

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["invalid-record"]),
    );
  });

  it("rejects contradictory findings", () => {
    const result = parseReviewPasses(
      recognized(
        { artifact: "review" },
        history(
          pass(
            1,
            "2026-09-12",
            "approved",
            "- None.\n- [src/main.ts:12] This contradicts approval",
          ),
        ),
      ),
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid-value" }),
    );
  });

  it("does not revive an older approval after a malformed physical-last pass", () => {
    const result = parseReviewPasses(
      recognized(
        { artifact: "review" },
        `# Whole-branch Review: Demo

${pass(1, "2026-09-12", "approved", "- None.")}

## Pass 2 — 2026-09-13

Base: ${sha}
Head: ${head}

### Blocking
- None.

### Suggestions
- None.`,
      ),
    );

    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.physicalLastPass).toBe(2);
    expect(result.latest).toBeUndefined();
  });

  it("binds global evidence only to the physical last legacy pass", () => {
    const result = parseReviewPasses(
      recognized(
        {
          artifact: "review",
          base: sha,
          head,
          verdict: "approved",
        },
        history(
          fieldlessPass(
            1,
            "2026-09-12",
            "- [src/main.ts:12] Fix the regression (violates: behavior)",
          ),
          fieldlessPass(2, "2026-09-13", "- None."),
        ),
      ),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.passes).toHaveLength(2);
    expect(result.passes[0]).toMatchObject({
      number: 1,
      provenance: "structural",
      blocking: ["[src/main.ts:12] Fix the regression (violates: behavior)"],
    });
    expect(result.passes[0]).not.toHaveProperty("base");
    expect(result.passes[0]).not.toHaveProperty("head");
    expect(result.passes[0]).not.toHaveProperty("verdict");
    expect(result.passes[1]).toMatchObject({
      number: 2,
      provenance: "legacy-global",
      base: sha,
      head,
      verdict: "approved",
    });
    expect(result.latest).toMatchObject({
      number: 2,
      provenance: "legacy-global",
      verdict: "approved",
    });
  });

  it("accepts a fieldless legacy prefix followed by an explicit suffix", () => {
    const result = parseReviewPasses(
      recognized(
        { artifact: "review" },
        history(
          fieldlessPass(
            1,
            "2026-09-12",
            "- [src/main.ts:12] Fix the regression (violates: behavior)",
          ),
          pass(2, "2026-09-13", "approved", "- None."),
        ),
      ),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.passes[0]).toMatchObject({
      number: 1,
      provenance: "structural",
    });
    expect(result.passes[0]).not.toHaveProperty("verdict");
    expect(result.passes[1]).toMatchObject({
      number: 2,
      provenance: "per-pass",
      verdict: "approved",
    });
    expect(result.latest).toMatchObject({
      number: 2,
      provenance: "per-pass",
      base: sha,
      head,
      verdict: "approved",
    });
  });

  it("rejects contradictory findings on the globally evidenced last pass", () => {
    const result = parseReviewPasses(
      recognized(
        {
          artifact: "review",
          base: sha,
          head,
          verdict: "approved",
        },
        history(
          fieldlessPass(
            1,
            "2026-09-12",
            "- [src/main.ts:12] Fix the historical finding (violates: behavior)",
          ),
          fieldlessPass(
            2,
            "2026-09-13",
            "- [src/main.ts:13] Fix the current finding (violates: behavior)",
          ),
        ),
      ),
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "invalid-value",
        message: "Approved passes cannot contain blocking findings",
        location: { line: 19 },
      }),
    );
    expect(result.latest).toBeUndefined();
  });

  it("rejects a fieldless pass after an explicit suffix begins", () => {
    const result = parseReviewPasses(
      recognized(
        { artifact: "review" },
        history(
          pass(1, "2026-09-12", "approved", "- None."),
          fieldlessPass(2, "2026-09-13", "- None."),
        ),
      ),
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "missing-section",
        location: { line: 21 },
      }),
    );
    expect(result.latest).toBeUndefined();
  });

  it("rejects a fieldless history without global evidence", () => {
    const result = parseReviewPasses(
      recognized(
        { artifact: "review" },
        history(
          fieldlessPass(1, "2026-09-12", "- None."),
          fieldlessPass(2, "2026-09-13", "- None."),
        ),
      ),
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "invalid-record",
        location: { line: 2 },
      }),
    );
    expect(result.latest).toBeUndefined();
  });

  it("accepts one complete global-frontmatter pass for compatibility", () => {
    const result = parseReviewPasses(
      recognized(
        {
          artifact: "review",
          base: sha,
          head,
          verdict: "approved",
        },
        `# Whole-branch Review: Demo

## Pass 1 — 2026-09-12

### Blocking
- None.

### Suggestions
- None.`,
      ),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.passes[0]).toMatchObject({
      provenance: "legacy-global",
      base: sha,
      head,
      verdict: "approved",
    });
  });

  it.each([
    ["partial global frontmatter", { base: sha, head }],
    [
      "ambiguous global and per-pass provenance",
      { base: head, head: sha, verdict: "approved" },
    ],
  ])("fails closed for %s", (_name, metadata) => {
    const body =
      _name === "partial global frontmatter"
        ? `# Whole-branch Review: Demo

## Pass 1 — 2026-09-12

### Blocking
- None.

### Suggestions
- None.`
        : history(pass(1, "2026-09-12", "approved", "- None."));
    const result = parseReviewPasses(
      recognized({ artifact: "review", ...metadata }, body),
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid-record" }),
    );
  });

  it("rejects globals beside an explicit suffix", () => {
    const result = parseReviewPasses(
      recognized(
        {
          artifact: "review",
          base: sha,
          head,
          verdict: "approved",
        },
        history(
          fieldlessPass(1, "2026-09-12", "- None."),
          pass(2, "2026-09-13", "approved", "- None."),
        ),
      ),
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid-record" }),
    );
    expect(result.latest).toBeUndefined();
  });

  it("parses explicit full and bounded remediation provenance with immutable finding identity", () => {
    const result = parseReviewPasses(recognized({ artifact: "review" }, scopedHistory));

    expect(result.diagnostics).toEqual([]);
    expect(result.passes[0]).toMatchObject({
      clearance: {
        scope: "full",
        target: "refs/remotes/origin/main",
      },
      findings: [
        {
          id: "pass-1-blocking-1",
          text: "[src/main.ts:12] Fix the regression (violates: behavior)",
        },
      ],
    });
    expect(result.latest).toMatchObject({
      verdict: "approved-remediation",
      clearance: {
        scope: "remediation",
        target: "refs/remotes/origin/main",
        parentPass: 1,
        parentCommit: sha,
        deltaBase: head,
        resolutions: [
          {
            finding: "pass-1-blocking-1",
            evidence: [`src/main.ts correction at ${head}`],
            verification: "focused test passed",
          },
        ],
      },
    });
  });

  it("retains a synthesized finding identity when a later pass adds typed classification", () => {
    const result = parseReviewPasses(
      recognized(
        { artifact: "review" },
        history(
          pass(1, "2026-09-12", "changes-requested", "- [src/main.ts:12] Fix the regression"),
          pass(2, "2026-09-13", "changes-requested", "- [src/main.ts:12] id: pass-1-blocking-1; kind: code-defect; Fix the regression"),
        ),
      ),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.passes[0]).toMatchObject({
      findings: [{ id: "pass-1-blocking-1" }],
    });
    expect(result.passes[1]).toMatchObject({
      findings: [{ id: "pass-1-blocking-1", kind: "code-defect" }],
    });
  });

  it("rejects remediation clearance in task feedback and malformed resolution JSON", () => {
    const review = recognized({ artifact: "review" }, scopedHistory);
    const invalidJson = parseReviewPasses(
      recognized(
        { artifact: "review" },
        scopedHistory.replace(/^Resolutions: .*$/m, "Resolutions: not-json"),
      ),
    );
    const feedback = parseReviewPasses(
      recognized({ artifact: "feedback" }, scopedHistory),
    );

    expect(parseReviewPasses(review).diagnostics).toEqual([]);
    expect(invalidJson.diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid-value" }),
    );
    expect(feedback.diagnostics).toContainEqual(
      expect.objectContaining({ code: "invalid-value" }),
    );
    expect(feedback.latest).toBeUndefined();
  });
});
