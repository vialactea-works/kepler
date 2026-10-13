import { describe, expect, it } from "vitest";
import {
  validateArtifact,
  validateArtifactBody,
  type ArtifactContractResult,
} from "../../packages/cli/src/workbench/artifact-contracts.js";
import type {
  ArtifactReadResult,
  RecognizedArtifact,
} from "../../packages/cli/src/workbench/artifact-reader.js";

const sha = "0123456789abcdef0123456789abcdef01234567";

const finishIntentFields = [
  "- Passed preconditions: all required gates passed",
  "- Specification synchronization: canonical specs unchanged",
  "- Strategy: no-op",
  "- Intended workspace result: branch and working tree unchanged",
  "- Route intent: none",
] as const;

const finishAttempt = (
  number: number,
  date: string,
  fields: readonly string[] = finishIntentFields,
): string =>
  [`## Attempt ${number} — ${date}`, "", ...fields].join("\n");

const finishOutcome = (number: number, date: string): string =>
  `## Outcome ${number} — ${date}`;

const bodyFor = (artifact: string): string => {
  const sections: Record<string, string[]> = {
    proposal: [
      "Why",
      "Goals & Success Criteria",
      "Non-Goals",
      "Proposed Change",
      "Capabilities",
      "Impact",
    ],
    design: [
      "Context",
      "Goals / Non-Goals",
      "Decisions",
      "Architecture & Components",
      "Testing Strategy",
      "Constraints & Boundaries",
      "Risks / Trade-offs",
    ],
    "requirements-change": ["ADDED Requirements"],
    "requirements-spec": [
      "Overview",
      "Contract",
      "Behavior",
      "Invariants",
      "Decisions",
    ],
    plan: ["Overview", "Tasks", "Done when", "### Task 1: Validate"],
    progress: [
      "| Task | Status | Progress |",
      "| --- | --- | --- |",
      "| Task 1: Lint | done | [details](tasks/task-1/progress.md) |",
    ],
    "task-progress": ["Attempt 1 — 2026-09-12\n\n- Outcome: done"],
    feedback: ["Pass 1 — 2026-09-12", "### Blocking", "### Suggestions"],
    review: ["Pass 1 — 2026-09-12", "### Blocking", "### Suggestions"],
    finish: [
      finishAttempt(1, "2026-09-12").replace(/^## /, ""),
      finishOutcome(1, "2026-09-12").replace(/^## /, ""),
    ],
    critique: ["Scope", "Findings", "Quality Lens", "Summary"],
    map: [
      "Destination",
      "Notes",
      "Operation rules",
      "Decisions so far",
      "Not yet specified",
      "Out of scope",
    ],
    ticket: ["Question", "Answer", "Outdated decisions"],
    route: [
      "Point of departure",
      "Destination",
      "### 2. Destination checkpoint",
      "### Concrete shape",
      "### Guardrails and boundaries",
      "### Builder latitude",
      "Path chosen",
      "Shipping rules",
      "Units",
      "### 1. Research",
      "**Destination contribution:** Researches the route contract.",
      "- **Status:** pending",
    ],
  };
  const titles: Record<string, string> = {
    proposal: "Proposal: Demo",
    design: "Design: Demo",
    "requirements-change": "Capability: workbench",
    "requirements-spec": "Capability: workbench",
    plan: "Plan: Demo",
    progress: "Progress: Demo",
    "task-progress": "Task Progress: Task 2 — Validate",
    feedback: "Code Feedback: Task 2 — Validate",
    review: "Whole-branch Review: Demo",
    finish: "Finish History: Demo",
    critique: "Critique: Demo",
    map: "Effort",
    ticket: "Ticket",
    route: "Route — Effort",
  };
  const title = titles[artifact];
  return [
    `# ${title}`,
    ...(sections[artifact] ?? []).map((section) =>
      section.startsWith("###") || section.startsWith("|")
        ? section
        : `## ${section}`
    ),
    artifact === "plan" ? "- Depends on: none" : "",
  ].join("\n");
};

const recognized = (
  sourcePath: string,
  metadata: Record<string, unknown>,
  body = bodyFor(String(metadata.artifact)),
): RecognizedArtifact => ({
  _tag: "recognized",
  sourcePath,
  metadata,
  body,
  locations: {
    frontmatter: { startLine: 1, endLine: 2 },
    metadata: { startLine: 2, endLine: 2 },
    body: { startLine: 3, endLine: 3 },
  },
});

const validArtifacts: Array<[string, Record<string, unknown>]> = [
  [
    ".kepler/changes/demo/proposal.md",
    {
      artifact: "proposal",
      change: "demo",
      status: "approved",
      decision: "accepted",
      author: "caio",
      created: "2026-09-12",
      route_unit: null,
    },
  ],
  [
    ".kepler/changes/demo/design.md",
    {
      artifact: "design",
      change: "demo",
      status: "draft",
      created: "2026-09-12",
      author: "caio",
      decision: "accepted",
      route_unit: null,
    },
  ],
  [
    ".kepler/changes/demo/requirements/workbench.md",
    {
      artifact: "requirements-change",
      capability: "workbench",
      change: "demo",
      status: "draft",
      created: "2026-09-12",
      author: "caio",
      decision: "accepted",
    },
  ],
  [
    ".kepler/specs/workbench.md",
    {
      artifact: "requirements-spec",
      capability: "workbench",
      status: "current",
      updated: "2026-09-12",
      author: "caio",
      decision: "accepted",
    },
  ],
  [
    ".kepler/changes/demo/plan.md",
    {
      artifact: "plan",
      change: "demo",
      status: "approved",
      created: "2026-09-12",
      author: "caio",
      decision: "accepted",
      route_unit: null,
    },
  ],
  [
    ".kepler/changes/demo/progress.md",
    {
      artifact: "progress",
      change: "demo",
      status: "in-progress",
      updated: "2026-09-12",
      decision: "accepted",
      tasks: [
        {
          id: 1,
          title: "Lint",
          status: "done",
          progress: "tasks/task-1/progress.md",
        },
      ],
    },
  ],
  [
    ".kepler/changes/demo/tasks/task-2/progress.md",
    {
      artifact: "task-progress",
      change: "demo",
      task: 2,
      status: "done",
      updated: "2026-09-12",
      decision: "accepted",
    },
  ],
  [
    ".kepler/changes/demo/tasks/task-2/feedback.md",
    {
      artifact: "feedback",
      change: "demo",
      task: 2,
      created: "2026-09-12",
      status: "resolved",
      verdict: "approved",
      decision: "accepted",
      base: sha,
      head: sha,
    },
  ],
  [
    ".kepler/changes/demo/review.md",
    {
      artifact: "review",
      change: "demo",
      created: "2026-09-12",
      status: "complete",
      verdict: "approved",
      decision: "accepted",
      base: sha,
      head: sha,
    },
  ],
  [
    ".kepler/changes/demo/finish.md",
    {
      artifact: "finish",
      change: "demo",
      status: "completed",
      created: "2026-09-12",
      updated: "2026-09-12",
      strategy: "no-op",
      result: "completed",
      decision: "accepted",
    },
  ],
  [
    ".kepler/changes/demo/critique.md",
    {
      artifact: "critique",
      change: "demo",
      created: "2026-09-12",
      verdict: "approved",
      decision: "accepted",
      scope: "design.md",
    },
  ],
  [
    ".kepler/maps/effort/map.md",
    {
      artifact: "map",
      effort: "effort",
      status: "open",
      branch: "main",
      created: "2026-09-12",
      updated: "2026-09-12",
      decision: "accepted",
    },
  ],
  [
    ".kepler/maps/effort/tickets/01-research.md",
    {
      artifact: "ticket",
      effort: "effort",
      ticket: 1,
      type: "research",
      status: "open",
      blocked_by: [],
      created: "2026-09-12",
      updated: "2026-09-12",
      decision: "accepted",
    },
  ],
  [
    ".kepler/maps/effort/route.md",
    {
      artifact: "route",
      effort: "effort",
      status: "open",
      created: "2026-09-12",
      updated: "2026-09-12",
      decision: "accepted",
      units: [
        {
          id: 1,
          name: "Research",
          status: "pending",
          depends_on: [],
          backed_by: ["tickets/01-research.md"],
        },
      ],
    },
  ],
];

const expectInvalid = (result: ArtifactContractResult, code: string) => {
  expect(result._tag).toBe("invalid");
  if (result._tag === "invalid") {
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      code,
    );
  }
};

describe("artifact metadata contracts", () => {
  it("projects validated goal and acceptance from dependency-mode plans", () => {
    const task = [
      "### Task 1: Implement",
      "",
      "- Goal: Deliver the approved behavior.",
      "- Depends on: none",
      "- Acceptance:",
      "  - The behavior is observable.",
      "- Steps:",
      "  1. Verify the behavior.",
      "- Verify: bun --bun vitest run",
      "- Commit: feat: implement behavior",
    ].join("\n");
    const metadata = {
      artifact: "plan",
      change: "demo",
      status: "approved",
      created: "2026-09-12",
      author: "test",
      decision: "accepted",
      route_unit: null,
      execution: { version: 2, mode: "dependencies" },
    };
    const result = validateArtifact(
      recognized(
        ".kepler/changes/demo/plan.md",
        metadata,
        `# Plan: Demo\n\n## Overview\n\n## Tasks\n\n${task}\n\n## Done when\n\nIt works.\n`,
      ),
    );

    expect(result._tag).toBe("valid");
    if (result._tag === "valid")
      expect(result.body.workflow.plan?.tasks[0]).toMatchObject({
        id: 1,
        goal: "Deliver the approved behavior.",
        acceptance: ["The behavior is observable."],
      });
  });

  it.each(validArtifacts)("accepts %s", (sourcePath, metadata) => {
    const result = validateArtifact(recognized(sourcePath, metadata));
    expect(result._tag).toBe("valid");
    if (result._tag === "valid") {
      expect(result.artifact).toBe(metadata.artifact);
      expect(result.sourcePath).toBe(sourcePath);
      expect(result.metadata).toEqual(metadata);
      expect(result.body.diagnostics).toEqual([]);
    }
  });

  it("accepts applied only as a critique decision", () => {
    const critique = validArtifacts.find(([path]) => path.endsWith("/critique.md"))!
    const proposal = validArtifacts.find(([path]) => path.endsWith("/proposal.md"))!
    const acceptedCritique = validateArtifact(
      recognized(critique[0], { ...critique[1], decision: "applied" }),
    )
    const rejectedProposal = validateArtifact(
      recognized(proposal[0], { ...proposal[1], decision: "applied" }),
    )

    expect(acceptedCritique._tag).toBe("valid")
    expectInvalid(rejectedProposal, "invalid-value")
  })

  it("accepts any requirements delta section and rejects a delta with none", () => {
    const [path, metadata] = validArtifacts.find(([source]) => source.endsWith("/requirements/workbench.md"))!

    for (const operation of ["ADDED", "MODIFIED", "REMOVED", "RENAMED"]) {
      const artifact = recognized(path, metadata, `# Capability: workbench\n\n## ${operation} Requirements`)
      expect(validateArtifact(artifact)._tag).toBe("valid")
    }
    expectInvalid(validateArtifact(recognized(path, metadata, "# Capability: workbench")), "missing-section")
  })

  it("accepts additional sections in a route and prose instead of tables in a canonical spec", () => {
    const [routePath, routeMetadata] = validArtifacts.find(([path]) => path.endsWith("/route.md"))!
    const [specPath, specMetadata] = validArtifacts.find(([path]) => path.endsWith("/specs/workbench.md"))!

    expect(
      validateArtifact(recognized(routePath, routeMetadata, `${bodyFor("route")}\n## Notes to readers`))._tag,
    ).toBe("valid")
    expect(
      validateArtifact(recognized(specPath, specMetadata, `${bodyFor("requirements-spec")}\nThe contract uses prose.`))._tag,
    ).toBe("valid")
  })

  it.each([
    "Point of departure",
    "Destination",
    "Path chosen",
    "Shipping rules",
    "Units",
  ])("requires the route section %s at level 2", (section) => {
    const body = bodyFor("route")
      .split("\n")
      .map((line) => (line === `## ${section}` ? `### ${section}` : line))
      .join("\n");
    const result = validateArtifact(
      recognized(".kepler/maps/effort/route.md", validArtifacts[13][1], body),
    );
    expectInvalid(result, "missing-section");
    expect(
      result.diagnostics.find(
        (diagnostic) =>
          diagnostic.code === "missing-section" &&
          diagnostic.expected === section,
      ),
    ).toBeDefined();
  });

  it("keeps route subheadings and local labels out of unit records", () => {
    const result = validateArtifact(
      recognized(".kepler/maps/effort/route.md", validArtifacts[13][1]),
    );
    expect(result._tag).toBe("valid");
    if (result._tag === "valid") {
      expect(result.body.workflow.records).toMatchObject([
        { kind: "unit", number: 1, title: "Research" },
      ]);
      expect(result.body.workflow.records).toHaveLength(1);
    }
  });

  it("requires every declared metadata field", () => {
    const metadata = { ...validArtifacts[0][1] };
    delete metadata.author;
    expectInvalid(
      validateArtifact(recognized(validArtifacts[0][0], metadata)),
      "missing-field",
    );
  });

  it("rejects invalid enumerated metadata", () => {
    const metadata = { ...validArtifacts[0][1], status: "unknown" };
    expectInvalid(
      validateArtifact(recognized(validArtifacts[0][0], metadata)),
      "invalid-value",
    );
  });

  it("rejects unsupported artifact values", () => {
    expectInvalid(
      validateArtifact(
        recognized(".kepler/changes/demo/unknown.md", {
          artifact: "unknown",
        }),
      ),
      "unsupported-artifact",
    );
  });

  it.each([
    [".kepler/changes/other/proposal.md", validArtifacts[0][1]],
    [".kepler/changes/demo/requirements/other.md", validArtifacts[2][1]],
    [".kepler/changes/demo/tasks/task-3/progress.md", validArtifacts[6][1]],
    [".kepler/maps/other/map.md", validArtifacts[11][1]],
    [".kepler/maps/effort/tickets/02-research.md", validArtifacts[12][1]],
  ])("rejects path identity conflicts for %s", (sourcePath, metadata) => {
    expectInvalid(
      validateArtifact(recognized(sourcePath, metadata)),
      "path-mismatch",
    );
  });

  it("rejects headings supplied only by HTML comments", () => {
    const artifact = recognized(
      ".kepler/changes/demo/proposal.md",
      validArtifacts[0][1],
      "<!-- # Proposal: Demo -->\n<!-- ## Why -->",
    );
    const body = validateArtifactBody(artifact, "proposal");
    expect(body.diagnostics.map((item) => item.code)).toContain(
      "missing-heading",
    );
    expect(body.diagnostics[0]?.location?.line).toBeGreaterThan(0);
  });

  it("extracts Markdown headings while ignoring fenced and commented headings", () => {
    const artifact = recognized(
      ".kepler/changes/demo/review.md",
      validArtifacts[8][1],
      "# Whole-branch Review: Demo\n\n```md\n## Pass 99 — 2026-09-99\n```\n\n<!-- ## Pass 98 — 2026-09-98 -->\n\n## Pass 1 — 2026-09-12\n\n### Blocking\n- None.\n\n### Suggestions\n- None.",
    );

    const body = validateArtifactBody(artifact, "review");

    expect(body.workflow.records.map((record) => record.number)).toEqual([1]);
    expect(body.diagnostics.map((item) => item.code)).toContain(
      "invalid-record",
    );
  });

  it("extracts physical-last pass records", () => {
    const metadata = { ...validArtifacts[8][1] };
    delete metadata.verdict;
    delete metadata.base;
    delete metadata.head;
    const artifact = recognized(
      ".kepler/changes/demo/review.md",
      metadata,
      `# Whole-branch Review: Demo
## Pass 1 — 2026-09-12
Base: ${sha}
Head: ${sha}
Verdict: approved
### Blocking
- None.
### Suggestions
- None.
## Pass 2 — 2026-09-13
Base: ${sha}
Head: ${sha}
Verdict: approved
### Blocking
- None.
### Suggestions
- None.`,
    );
    const body = validateArtifactBody(artifact, "review");
    expect(body.diagnostics).toEqual([]);
    expect(body.workflow.classification).toBe("physical-last-pass");
    expect(body.workflow.physicalLastPass).toBe(2);
    expect(body.workflow.records.map((record) => record.number)).toEqual([
      1, 2,
    ]);
  });

  it("accepts per-pass review evidence without global range metadata", () => {
    const metadata = {
      artifact: "review",
      change: "demo",
      created: "2026-09-12",
      status: "complete",
      decision: "accepted",
    };
    const artifact = recognized(
      ".kepler/changes/demo/review.md",
      metadata,
      `# Whole-branch Review: Demo
## Pass 1 — 2026-09-12
Base: ${sha}
Head: ${sha}
Verdict: changes-requested
### Blocking
- [src/main.ts:1] Fix this (violates: behavior)
### Suggestions
- None.
## Pass 2 — 2026-09-13
Base: ${sha}
Head: ${sha}
Verdict: approved
### Blocking
- None.
### Suggestions
- None.`,
    );

    const result = validateArtifact(artifact);

    expect(result._tag).toBe("valid");
    if (result._tag === "valid") {
      expect(
        result.body.workflow.records.map((record) => record.number),
      ).toEqual([1, 2]);
    }
  });

  it("accepts per-pass feedback evidence without global range metadata", () => {
    const metadata = {
      artifact: "feedback",
      change: "demo",
      task: 2,
      created: "2026-09-12",
      status: "resolved",
      decision: "accepted",
    };
    const artifact = recognized(
      ".kepler/changes/demo/tasks/task-2/feedback.md",
      metadata,
      `# Code Feedback: Task 2 — Validate
## Pass 1 — 2026-09-12
Base: ${sha}
Head: ${sha}
Verdict: approved
### Blocking
- None.
### Suggestions
- None.`,
    );

    expect(validateArtifact(artifact)._tag).toBe("valid");
  });

  it("accepts one-pass global review evidence for compatibility", () => {
    const artifact = recognized(
      ".kepler/changes/demo/review.md",
      {
        artifact: "review",
        change: "demo",
        created: "2026-09-12",
        status: "complete",
        verdict: "approved",
        decision: "accepted",
        base: sha,
        head: sha,
      },
      `# Whole-branch Review: Demo
## Pass 1 — 2026-09-12
### Blocking
- None.
### Suggestions
- None.`,
    );

    expect(validateArtifact(artifact)._tag).toBe("valid");
  });

  it("accepts legacy multi-pass review history without applying global evidence to the prefix", () => {
    const artifact = recognized(
      ".kepler/changes/demo/review.md",
      {
        artifact: "review",
        change: "demo",
        created: "2026-09-12",
        status: "complete",
        verdict: "approved",
        decision: "accepted",
        base: sha,
        head: sha,
      },
      `# Whole-branch Review: Demo
## Pass 1 — 2026-09-12
### Blocking
- [src/main.ts:12] Fix the regression (violates: behavior)
### Suggestions
- None.
## Pass 2 — 2026-09-13
### Blocking
- None.
### Suggestions
- None.`,
    );

    const result = validateArtifact(artifact);

    expect(result._tag).toBe("valid");
    if (result._tag === "valid") {
      expect(result.body.workflow.records).toHaveLength(2);
      expect(result.body.workflow.records[0]?.fields).toEqual({
        Blocking: "[src/main.ts:12] Fix the regression (violates: behavior)",
        Suggestions: "",
      });
      expect(result.body.workflow.records[0]?.fields).not.toHaveProperty(
        "Base",
      );
      expect(result.body.workflow.records[1]?.fields).toMatchObject({
        Base: sha,
        Head: sha,
        Verdict: "approved",
      });
      expect(result.body.workflow.passes).toHaveLength(1);
      expect(result.body.workflow.passes?.[0]).toMatchObject({
        number: 2,
        provenance: "legacy-global",
        verdict: "approved",
      });
    }
  });

  it("accepts the migrated fieldless-prefix and explicit-suffix review shape", () => {
    const artifact = recognized(
      ".kepler/changes/demo/review.md",
      {
        artifact: "review",
        change: "demo",
        created: "2026-09-12",
        status: "complete",
        decision: "accepted",
      },
      `# Whole-branch Review: Demo
## Pass 1 — 2026-09-12
### Blocking
- [src/main.ts:12] Fix the regression (violates: behavior)
### Suggestions
- None.
## Pass 2 — 2026-09-13
Base: ${sha}
Head: ${sha}
Verdict: approved
### Blocking
- None.
### Suggestions
- None.`,
    );

    const result = validateArtifact(artifact);

    expect(result._tag).toBe("valid");
    if (result._tag === "valid") {
      expect(result.body.workflow.records[0]?.fields).not.toHaveProperty(
        "Verdict",
      );
      expect(result.body.workflow.records[1]?.fields).toMatchObject({
        Base: sha,
        Head: sha,
        Verdict: "approved",
      });
      expect(result.body.workflow.passes?.[0]).toMatchObject({
        number: 2,
        provenance: "per-pass",
      });
    }
  });

  it.each([
    [
      "legacy history without global provenance",
      {
        artifact: "review",
        change: "demo",
        created: "2026-09-12",
        status: "complete",
        decision: "accepted",
      },
      `# Whole-branch Review: Demo
## Pass 1 — 2026-09-12
### Blocking
- None.
### Suggestions
- None.`,
    ],
    [
      "global provenance beside an explicit suffix",
      {
        artifact: "review",
        change: "demo",
        created: "2026-09-12",
        status: "complete",
        verdict: "approved",
        decision: "accepted",
        base: sha,
        head: sha,
      },
      `# Whole-branch Review: Demo
## Pass 1 — 2026-09-12
### Blocking
- None.
### Suggestions
- None.
## Pass 2 — 2026-09-13
Base: ${sha}
Head: ${sha}
Verdict: approved
### Blocking
- None.
### Suggestions
- None.`,
    ],
    [
      "fieldless pass after explicit suffix",
      {
        artifact: "review",
        change: "demo",
        created: "2026-09-12",
        status: "complete",
        decision: "accepted",
      },
      `# Whole-branch Review: Demo
## Pass 1 — 2026-09-12
Base: ${sha}
Head: ${sha}
Verdict: approved
### Blocking
- None.
### Suggestions
- None.
## Pass 2 — 2026-09-13
### Blocking
- None.
### Suggestions
- None.`,
    ],
  ])("rejects %s", (_name, metadata, body) => {
    const result = validateArtifact(
      recognized(".kepler/changes/demo/review.md", metadata, body),
    );
    const expectedCode =
      _name === "fieldless pass after explicit suffix"
        ? "missing-section"
        : "invalid-record";
    expectInvalid(result, expectedCode);
    if (result._tag === "invalid")
      expect(result.diagnostics[0]?.location?.line).toBeGreaterThan(0);
  });

  it("rejects a malformed physical-last review pass instead of reviving approval", () => {
    const artifact = recognized(
      ".kepler/changes/demo/review.md",
      {
        artifact: "review",
        change: "demo",
        created: "2026-09-12",
        status: "complete",
        decision: "accepted",
      },
      `# Whole-branch Review: Demo
## Pass 1 — 2026-09-12
Base: ${sha}
Head: ${sha}
Verdict: approved
### Blocking
- None.
### Suggestions
- None.
## Pass 2 — 2026-09-13
Base: ${sha}
Head: ${sha}
### Blocking
- None.
### Suggestions
- None.`,
    );

    expectInvalid(validateArtifact(artifact), "missing-section");
  });

  it("extracts and validates plan and progress task ledgers", () => {
    const plan = recognized(
      ".kepler/changes/demo/plan.md",
      validArtifacts[4][1],
      "# Plan: Demo\n## Overview\n## Tasks\n### Task 1: Validate\n### Task 2: Ship\n## Done when",
    );
    const planBody = validateArtifactBody(plan, "plan");
    expect(planBody.diagnostics).toEqual([]);
    expect(planBody.workflow.records.map((record) => record.number)).toEqual([
      1, 2,
    ]);
    const progress = recognized(
      ".kepler/changes/demo/progress.md",
      {
        ...validArtifacts[5][1],
        tasks: [
          {
            id: 1,
            title: "Lint",
            status: "done",
            progress: "tasks/task-1/progress.md",
          },
          {
            id: 2,
            title: "Ship",
            status: "pending",
            progress: "tasks/task-2/progress.md",
          },
        ],
      },
      "# Progress: Demo\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: Lint | done | [details](tasks/task-1/progress.md) |\n| Task 2: Ship | pending | [details](tasks/task-2/progress.md) |",
    );
    const progressBody = validateArtifactBody(progress, "progress");
    expect(progressBody.diagnostics).toEqual([]);
    expect(progressBody.workflow.records).toMatchObject([
      { kind: "task", number: 1, title: "Lint", fields: { Status: "done" } },
      {
        kind: "task",
        number: 2,
        title: "Ship",
        fields: { Status: "pending" },
      },
    ]);
  });

  it("accepts abandoned middle-task gaps while keeping the plan ledger contiguous", () => {
    const plan = recognized(
      ".kepler/changes/demo/plan.md",
      validArtifacts[4][1],
      "# Plan: Demo\n## Overview\n## Tasks\n### Task 1: Keep\n### Task 2: Skip (abandoned — no longer needed)\n### Task 3: Resume\n## Done when",
    );
    const planBody = validateArtifactBody(plan, "plan");
    expect(planBody.diagnostics).toEqual([]);
    expect(planBody.workflow.records.map((record) => record.number)).toEqual([
      1, 2, 3,
    ]);

    const progress = recognized(
      ".kepler/changes/demo/progress.md",
      {
        ...validArtifacts[5][1],
        tasks: [
          {
            id: 1,
            title: "Keep",
            status: "done",
            progress: "tasks/task-1/progress.md",
          },
          {
            id: 3,
            title: "Resume",
            status: "pending",
            progress: "tasks/task-3/progress.md",
          },
        ],
      },
      "# Progress: Demo\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: Keep | done | [details](tasks/task-1/progress.md) |\n| Task 3: Resume | pending | [details](tasks/task-3/progress.md) |",
    );
    const progressBody = validateArtifactBody(progress, "progress");
    expect(progressBody.diagnostics).toEqual([]);
    expect(progressBody.workflow.records.map((record) => record.number)).toEqual([
      1, 3,
    ]);
  });

  it("parses escaped progress-table delimiters inside task titles", () => {
    const progress = recognized(
      ".kepler/changes/demo/progress.md",
      {
        ...validArtifacts[5][1],
        tasks: [
          {
            id: 1,
            title: "Parse A | B",
            status: "done",
            progress: "tasks/task-1/progress.md",
          },
        ],
      },
      "# Progress: Demo\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: Parse A \\| B | done | [details](tasks/task-1/progress.md) |",
    );

    const body = validateArtifactBody(progress, "progress");

    expect(body.diagnostics).toEqual([]);
    expect(body.workflow.records).toHaveLength(1);
    expect(body.workflow.records[0]).toMatchObject({
      kind: "task",
      number: 1,
      title: "Parse A | B",
      fields: {
        Status: "done",
        Progress: "[details](tasks/task-1/progress.md)",
      },
    });
  });

  it.each([
    [
      "unescaped title delimiters",
      "| Task 1: Parse A | B | done | [details](tasks/task-1/progress.md) |",
    ],
    [
      "invalid statuses",
      "| Task 1: Parse A | shipped | [details](tasks/task-1/progress.md) |",
    ],
    [
      "invalid progress links",
      "| Task 1: Parse A | done | [task](tasks/task-1/progress.md) |",
    ],
    [
      "invalid task identities",
      "| Task 0: Parse A | done | [details](tasks/task-1/progress.md) |",
    ],
  ])("rejects progress rows with %s", (_case, row) => {
    const progress = recognized(
      ".kepler/changes/demo/progress.md",
      validArtifacts[5][1],
      `# Progress: Demo\n| Task | Status | Progress |\n| --- | --- | --- |\n${row}`,
    );

    const body = validateArtifactBody(progress, "progress");
    const diagnostic = body.diagnostics.find(
      (item) => item.code === "invalid-record",
    );

    expect(body.workflow.records).toEqual([]);
    expect(diagnostic?.location?.line).toBe(6);
  });

  it.each([
    [
      "status",
      [
        {
          id: 1,
          title: "Lint",
          status: "pending",
          progress: "tasks/task-1/progress.md",
        },
      ],
      "| Task 1: Lint | done | [details](tasks/task-1/progress.md) |",
    ],
    [
      "title",
      [
        {
          id: 1,
          title: "Other",
          status: "done",
          progress: "tasks/task-1/progress.md",
        },
      ],
      "| Task 1: Lint | done | [details](tasks/task-1/progress.md) |",
    ],
    [
      "id",
      [
        {
          id: 2,
          title: "Lint",
          status: "done",
          progress: "tasks/task-2/progress.md",
        },
      ],
      "| Task 1: Lint | done | [details](tasks/task-1/progress.md) |",
    ],
    [
      "order",
      [
        {
          id: 2,
          title: "Ship",
          status: "pending",
          progress: "tasks/task-2/progress.md",
        },
        {
          id: 1,
          title: "Lint",
          status: "done",
          progress: "tasks/task-1/progress.md",
        },
      ],
      "| Task 1: Lint | done | [details](tasks/task-1/progress.md) |\n| Task 2: Ship | pending | [details](tasks/task-2/progress.md) |",
    ],
    [
      "link",
      [
        {
          id: 1,
          title: "Lint",
          status: "done",
          progress: "tasks/task-2/progress.md",
        },
      ],
      "| Task 1: Lint | done | [details](tasks/task-1/progress.md) |",
    ],
    [
      "empty body ledger",
      [
        {
          id: 1,
          title: "Lint",
          status: "pending",
          progress: "tasks/task-1/progress.md",
        },
      ],
      "",
    ],
  ] as const)(
    "rejects progress metadata/body %s disagreement",
    (_case, tasks, rows) => {
      const progress = recognized(
        ".kepler/changes/demo/progress.md",
        { ...validArtifacts[5][1], tasks },
        `# Progress: Demo\n| Task | Status | Progress |\n| --- | --- | --- |\n${rows}`,
      );

      const result = validateArtifact(progress);

      expect(result._tag).toBe("invalid");
      if (result._tag === "invalid")
        expect(result.diagnostics.map((item) => item.message)).toContain(
          "progress metadata ledger does not match",
        );
    },
  );

  it("preserves supported in-progress and correction task-log boundaries", () => {
    const inProgress = validateArtifact(
      recognized(
        ".kepler/changes/demo/progress.md",
        {
          ...validArtifacts[5][1],
          status: "in-progress",
          tasks: [
            {
              id: 1,
              title: "Lint",
              status: "in-progress",
              progress: "tasks/task-1/progress.md",
            },
          ],
        },
        "# Progress: Demo\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 1: Lint | in-progress | [details](tasks/task-1/progress.md) |",
      ),
    );
    const pendingLog = validateArtifact(
      recognized(
        ".kepler/changes/demo/tasks/task-1/progress.md",
        { ...validArtifacts[6][1], task: 1, status: "pending" },
        "# Task Progress: Task 1 — Lint",
      ),
    );
    const finalizedCorrectionLog = validateArtifact(
      recognized(
        ".kepler/changes/demo/tasks/task-1/progress.md",
        { ...validArtifacts[6][1], task: 1, status: "done" },
        "# Task Progress: Task 1 — Lint\n\n## Attempt 1 — 2026-09-12\n- Outcome: done",
      ),
    );

    expect(inProgress._tag).toBe("valid");
    expect(pendingLog._tag).toBe("valid");
    expect(finalizedCorrectionLog._tag).toBe("valid");
  });

  it("accepts an empty pending task-progress artifact only", () => {
    const sourcePath = ".kepler/changes/demo/tasks/task-2/progress.md";
    const body = "# Task Progress: Task 2 — Validate";
    const pending = {
      ...validArtifacts[6][1],
      status: "pending",
    };

    expect(
      validateArtifact(recognized(sourcePath, pending, body))._tag,
    ).toBe("valid");
    for (const status of ["in-progress", "blocked", "done"] as const)
      expectInvalid(
        validateArtifact(
          recognized(sourcePath, { ...pending, status }, body),
        ),
        "missing-section",
      );
  });

  it("accepts a first pending finish intent with complete fields", () => {
    const sourcePath = ".kepler/changes/demo/finish.md";
    const body = [
      "# Finish History: Demo",
      finishAttempt(1, "2026-09-12"),
    ].join("\n\n");
    const pending = {
      ...validArtifacts[9][1],
      status: "pending",
      result: "pending",
    };

    const result = validateArtifact(recognized(sourcePath, pending, body));

    expect(result._tag).toBe("valid");
    if (result._tag === "valid")
      expect(result.body.workflow.records).toMatchObject([
        { kind: "attempt", number: 1 },
      ]);
  });

  it("accepts a pending finish intent after paired history", () => {
    const sourcePath = ".kepler/changes/demo/finish.md";
    const body = [
      "# Finish History: Demo",
      finishAttempt(1, "2026-09-12"),
      finishOutcome(1, "2026-09-12"),
      finishAttempt(2, "2026-09-13"),
    ].join("\n\n");
    const pending = {
      ...validArtifacts[9][1],
      status: "pending",
      result: "pending",
    };

    expect(validateArtifact(recognized(sourcePath, pending, body))._tag).toBe(
      "valid",
    );
    for (const [status, result] of [
      ["completed", "completed"],
      ["blocked", "blocked"],
    ] as const)
      expectInvalid(
        validateArtifact(
          recognized(sourcePath, { ...pending, status, result }, body),
        ),
        "invalid-record",
      );
  });

  it.each([
    ["completed", "completed"],
    ["blocked", "blocked"],
  ] as const)("accepts a complete paired %s finish history", (status, result) => {
    const body = [
      "# Finish History: Demo",
      finishAttempt(1, "2026-09-12"),
      finishOutcome(1, "2026-09-12"),
    ].join("\n\n");
    expect(
      validateArtifact(
        recognized(".kepler/changes/demo/finish.md", {
          ...validArtifacts[9][1],
          status,
          result,
        }, body),
      )._tag,
    ).toBe("valid");
  });

  it.each(
    finishIntentFields.map((field, index) => [field, index] as const),
  )("rejects a pending attempt missing %s", (_field, missingIndex) => {
    const body = [
      "# Finish History: Demo",
      finishAttempt(
        1,
        "2026-09-12",
        finishIntentFields.filter((_field, index) => index !== missingIndex),
      ),
    ].join("\n\n");
    expectInvalid(
      validateArtifact(
        recognized(
          ".kepler/changes/demo/finish.md",
          {
            ...validArtifacts[9][1],
            status: "pending",
            result: "pending",
          },
          body,
        ),
      ),
      "missing-section",
    );
  });

  it.each([
    ["unmatched outcome", [finishOutcome(1, "2026-09-12")]],
    [
      "non-contiguous numbering",
      [
        finishAttempt(1, "2026-09-12"),
        finishOutcome(1, "2026-09-12"),
        finishAttempt(3, "2026-09-13"),
      ],
    ],
    [
      "duplicate numbering",
      [
        finishAttempt(1, "2026-09-12"),
        finishOutcome(1, "2026-09-12"),
        finishAttempt(1, "2026-09-13"),
      ],
    ],
    [
      "non-final unmatched attempt",
      [finishAttempt(1, "2026-09-12"), finishAttempt(2, "2026-09-13"), finishOutcome(2, "2026-09-13")],
    ],
    [
      "malformed attempt",
      ["## Attempt 1 - 2026-09-12"],
    ],
  ] as const)("rejects %s finish history", (_name, records) => {
    const body = ["# Finish History: Demo", ...records].join("\n\n");
    expectInvalid(
      validateArtifact(
        recognized(
          ".kepler/changes/demo/finish.md",
          {
            ...validArtifacts[9][1],
            status: "pending",
            result: "pending",
          },
          body,
        ),
      ),
      "invalid-record",
    );
  });

  it.each([
    ["blocked then done", "- Outcome: blocked\n- Outcome: done"],
    ["done then blocked", "- Outcome: done\n- Outcome: blocked"],
    ["repeated done", "- Outcome: done\n- Outcome: done"],
    ["mixed bulleted and legacy", "- Outcome: done\nOutcome: blocked"],
    ["supported plus malformed legacy", "- Outcome: done\nOutcome:done"],
    ["supported plus malformed bulleted", "- Outcome: done\n- Outcome : blocked"],
  ])(
    "rejects duplicate terminal outcomes in the latest task attempt: %s",
    (_case, outcomes) => {
      const result = validateArtifact(
        recognized(
          ".kepler/changes/demo/tasks/task-2/progress.md",
          validArtifacts[6][1],
          `# Task Progress: Task 2 — Validate\n\n## Attempt 1 — 2026-09-12\n${outcomes}`,
        ),
      );

      expectInvalid(result, "invalid-record");
      if (result._tag === "invalid")
        expect(result.diagnostics.map((item) => item.message)).toContain(
          "Latest task attempt must declare exactly one done or blocked Outcome",
        );
    },
  );

  it("ignores historical duplicate outcomes when the latest task attempt is unambiguous", () => {
    const result = validateArtifact(
      recognized(
        ".kepler/changes/demo/tasks/task-2/progress.md",
        validArtifacts[6][1],
        "# Task Progress: Task 2 — Validate\n\n## Attempt 1 — 2026-09-11\n- Outcome: blocked\n- Outcome: done\n\n## Attempt 2 — 2026-09-12\n- Outcome: done",
      ),
    );

    expect(result._tag).toBe("valid");
  });

  it.each(["done", "blocked"])("accepts one bulleted task Outcome: %s", (outcome) => {
    const result = validateArtifact(
      recognized(
        ".kepler/changes/demo/tasks/task-2/progress.md",
        validArtifacts[6][1],
        `# Task Progress: Task 2 — Validate\n\n## Attempt 1 — 2026-09-12\n- Outcome: ${outcome}`,
      ),
    );

    expect(result._tag).toBe("valid");
  });

  it("accepts one historical unbulleted task Outcome", () => {
    const result = validateArtifact(
      recognized(
        ".kepler/changes/demo/tasks/task-2/progress.md",
        validArtifacts[6][1],
        "# Task Progress: Task 2 — Validate\n\n## Attempt 1 — 2026-09-12\nOutcome: done",
      ),
    );

    expect(result._tag).toBe("valid");
  });

  it("reports malformed and non-monotonic records", () => {
    const malformed = recognized(
      ".kepler/changes/demo/feedback.md",
      validArtifacts[7][1],
      "# Code Feedback: Task 2\n## Pass 1 - 2026-09-12\n### Blocking\n- None.\n### Suggestions\n- None.",
    );
    expectInvalid(validateArtifact(malformed), "invalid-record");
    const stale = recognized(
      ".kepler/changes/demo/feedback.md",
      validArtifacts[7][1],
      "# Code Feedback: Task 2\n## Pass 1 — 2026-09-12\n### Blocking\n- None.\n### Suggestions\n- None.\n## Pass 3 — 2026-09-13\n### Blocking\n- None.\n### Suggestions\n- None.",
    );
    expectInvalid(validateArtifact(stale), "non-monotonic-record");
    const trailing = recognized(
      ".kepler/changes/demo/feedback.md",
      validArtifacts[7][1],
      "# Code Feedback: Task 2\n## Pass 1 — 2026-09-12 garbage\n### Blocking\n- None.\n### Suggestions\n- None.",
    );
    const trailingBody = validateArtifactBody(trailing, "feedback");
    const invalidRecord = trailingBody.diagnostics.find(
      (diagnostic) => diagnostic.code === "invalid-record",
    );
    expect(invalidRecord?.location?.line).toBe(4);
    expect(invalidRecord?.actual).toBe("Pass 1 — 2026-09-12 garbage");
    const malformedProgress = recognized(
      ".kepler/changes/demo/progress.md",
      validArtifacts[5][1],
      "# Progress: Demo\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 2 Lint | done | [details](tasks/task-2/progress.md) |",
    );
    const malformedProgressBody = validateArtifactBody(
      malformedProgress,
      "progress",
    );
    const progressDiagnostic = malformedProgressBody.diagnostics.find(
      (diagnostic) => diagnostic.code === "invalid-record",
    );
    expect(progressDiagnostic?.location?.line).toBe(6);
    const staleProgress = recognized(
      ".kepler/changes/demo/progress.md",
      validArtifacts[5][1],
      "# Progress: Demo\n| Task | Status | Progress |\n| --- | --- | --- |\n| Task 2: Lint | done | [details](tasks/task-2/progress.md) |\n| Task 1: Lint | done | [details](tasks/task-1/progress.md) |",
    );
    const staleProgressBody = validateArtifactBody(staleProgress, "progress");
    expect(staleProgressBody.diagnostics.map((item) => item.code)).toContain(
      "non-monotonic-record",
    );
  });

  it("classifies unsupported legacy record layouts", () => {
    const legacy = recognized(
      ".kepler/changes/demo/tasks/task-2/progress.md",
      validArtifacts[6][1],
      "# Task Progress: Task 2\n## Attempt 1 - 2026-09-12",
    );
    const body = validateArtifactBody(legacy, "task-progress");
    expect(body.workflow.classification).toBe("legacy-unsupported");
    expect(body.diagnostics.map((item) => item.code)).toContain(
      "invalid-record",
    );
  });

  it("requires valid records for every declared workflow shape", () => {
    const commentOnly = validateArtifactBody(
      recognized(
        ".kepler/changes/demo/feedback.md",
        validArtifacts[7][1],
        "# Code Feedback: Task 2\n<!-- ## Pass 1 — 2026-09-12 -->\n### Blocking\n### Suggestions",
      ),
      "feedback",
    );
    const commentDiagnostic = commentOnly.diagnostics.find(
      (item) => item.code === "invalid-record",
    );
    expect(commentOnly.workflow.records).toEqual([]);
    expect(commentDiagnostic?.location?.line).toBe(4);

    const wrongLevel = validateArtifactBody(
      recognized(
        ".kepler/changes/demo/review.md",
        validArtifacts[8][1],
        "# Whole-branch Review: Demo\n### Pass 1 — 2026-09-12\n### Blocking\n### Suggestions",
      ),
      "review",
    );
    const wrongLevelDiagnostic = wrongLevel.diagnostics.find(
      (item) => item.code === "invalid-record",
    );
    expect(wrongLevel.workflow.records).toEqual([]);
    expect(wrongLevelDiagnostic?.location?.line).toBe(4);

    const missingOutcome = validateArtifactBody(
      recognized(
        ".kepler/changes/demo/finish.md",
        validArtifacts[9][1],
        "# Finish History: Demo\n## Attempt 1 — 2026-09-12",
      ),
      "finish",
    );
    expect(
      missingOutcome.workflow.records.map((record) => record.kind),
    ).toEqual(["attempt"]);
    expect(missingOutcome.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "missing-section",
        expected: "Outcome N — YYYY-MM-DD",
        location: { line: 3 },
      }),
    );
  });

  it("preserves unrelated files as skipped and reader failures as invalid", () => {
    const unrelated: ArtifactReadResult = {
      _tag: "unrelated",
      sourcePath: "notes.md",
      reason: "no-frontmatter",
      body: "notes",
      locations: { body: { startLine: 1, endLine: 1 } },
    };
    const invalid: ArtifactReadResult = {
      _tag: "invalid",
      sourcePath: "broken.md",
      diagnostic: {
        _tag: "ArtifactDiagnostic",
        code: "invalid-yaml",
        message: "broken",
        sourcePath: "broken.md",
      },
    };
    expect(validateArtifact(unrelated)).toEqual({
      _tag: "skipped",
      sourcePath: "notes.md",
    });
    expect(validateArtifact(invalid)).toEqual({
      _tag: "invalid",
      sourcePath: "broken.md",
      diagnostics: [invalid.diagnostic],
    });
  });
});
