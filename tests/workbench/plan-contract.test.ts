import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  critiqueDisposition,
  executionTransitionProblems,
  taskBreakdownDigest,
  taskDefinitionDigest,
  validateArtifact,
} from "../../packages/cli/src/workbench/artifact-contracts.js";
import { validateTaskInputContextSchema } from "../../packages/cli/src/workbench/artifact-schemas.js";
import type { RecognizedArtifact } from "../../packages/cli/src/workbench/artifact-reader.js";

const sha = "0123456789abcdef0123456789abcdef01234567";
const task = (id: number, title: string, dependsOn = "none") =>
  `### Task ${id}: ${title}\n\n- Depends on: ${dependsOn}\n- Files: src/task-${id}.ts\n`;
const plan = (
  metadata: Record<string, unknown> = {},
  body = `${task(1, "First")}\n${task(2, "Second", "Task 1")}\n${task(3, "Third", "Task 2")}`,
): RecognizedArtifact => ({
  _tag: "recognized",
  sourcePath: ".kepler/changes/demo/plan.md",
  metadata: {
    artifact: "plan",
    change: "demo",
    status: "approved",
    created: "2026-09-12",
    author: "test",
    decision: "accepted",
    route_unit: null,
    ...metadata,
  },
  body: `# Plan: Demo\n\n## Overview\n\n## Tasks\n\n${body}\n## Done when\n\nIt works.\n`,
  locations: {
    frontmatter: { startLine: 1, endLine: 8 },
    metadata: { startLine: 2, endLine: 8 },
    body: { startLine: 9, endLine: 40 },
  },
});
const bodyContract = (artifact: RecognizedArtifact) => {
  const result = validateArtifact(artifact);
  expect(result._tag).toBe("valid");
  if (result._tag !== "valid") throw new Error("Expected valid artifact");
  return result.body.workflow.plan;
};
const invalidMessages = (artifact: RecognizedArtifact): readonly string[] => {
  const result = validateArtifact(artifact);
  expect(result._tag).toBe("invalid");
  return result._tag === "invalid"
    ? result.diagnostics.map((diagnostic) => diagnostic.message)
    : [];
};

const inputContext = (taskBlock: string, patch: Record<string, unknown> = {}) => ({
  version: 1,
  repository: "/repo",
  intentCommit: `tactical:confirmed-by-requester`,
  taskDefinition: taskDefinitionDigest(taskBlock),
  inputs: [{ path: "AGENTS.md", blob: sha }],
  ...patch,
});

const digestTaskBlock = (id: number, title: string, dependsOn = "none") =>
  task(id, title, dependsOn).trimEnd();

const breakdownDigest = (ids: readonly number[], blocks: readonly string[]) =>
  taskBreakdownDigest(
    ids,
    ids.map((id, index) => ({
      id,
      title: `Task ${id}`,
      dependsOn: [],
      source: blocks[index] ?? "",
    })),
  );

describe("plan contract", () => {
  it("ignores fenced task fields while keeping fenced text in the task digest", () => {
    const taskOne = [
      "### Task 1: First",
      "",
      "- Depends on: none",
      "- Files: src/real.ts",
      "~~~~md",
      "- Files: src/fake.ts",
      '- Notes: {"not":"a task context"}',
      "~~~~",
      "```text",
      "- Depends on: Task 99",
      "```",
      "````md",
      '- Notes: {"not":"visible"}',
      "````",
      "```",
      "- Depends on: Task 98",
      "```",
      "- Acceptance:",
      "  - The task remains valid.",
      "- Steps:",
      "  1. Verify it.",
      "- Verify: true",
      "- Commit: test",
    ].join("\n");
    const projected = bodyContract(
      plan(
        {},
        `${taskOne}\n${task(2, "Second", "Task 1")}${task(3, "Third", "Task 2")}`,
      ),
    );
    expect(projected?.tasks[0]).toMatchObject({
      id: 1,
      dependsOn: [],
      filesDeclared: true,
      files: ["src/real.ts"],
      definitionDigest: taskDefinitionDigest(taskOne),
    });
    expect(projected?.tasks[0]?.inputContext).toBeUndefined();
    expect(taskDefinitionDigest(taskOne)).not.toBe(
      taskDefinitionDigest(taskOne.replace("Task 99", "Task 97")),
    );
  });

  it("uses numeric identity order for legacy plans and keeps explicit execution separate", () => {
    const legacy = bodyContract(plan());
    expect(legacy).toMatchObject({
      identityOrder: [1, 2, 3],
      executionOrder: [1, 2, 3],
    });
    expect(legacy?.execution).toBeUndefined();

    const reordered = bodyContract(
      plan(
        { execution: { version: 1, order: [1, 4, 2, 3] } },
        `${task(1, "First")}\n${task(2, "Second", "Task 4")}\n${task(3, "Third", "Task 2")}\n${task(4, "Prerequisite", "Task 1")}`,
      ),
    );
    expect(reordered).toMatchObject({
      identityOrder: [1, 2, 3, 4],
      executionOrder: [1, 4, 2, 3],
      execution: { version: 1, order: [1, 4, 2, 3] },
    });
    expect(
      invalidMessages(
        plan(
          { execution: { version: 1, order: [1, 2, 4, 3] } },
          `${task(1, "First")}\n${task(2, "Second", "Task 4")}\n${task(3, "Third", "Task 2")}\n${task(4, "Prerequisite", "Task 1")}`,
        ),
      ),
    ).toContain("Task 2 requires active Task 4 earlier in execution order");
  });

  it.each([
    [{ version: 2, order: [1, 2, 3] }, "Explicit execution metadata is malformed; legacy numeric order is not used"],
    [{ version: 1, order: [1, 2, 2] }, "Execution order must contain every active task exactly once"],
    [{ version: 1, order: [1, 2, 9] }, "Execution order must contain every active task exactly once"],
    [{ version: 1, order: [1, 3] }, "Execution order must contain every active task exactly once"],
  ])("rejects invalid explicit execution metadata %o", (execution, message) => {
    const artifact = plan({ execution });
    expect(invalidMessages(artifact)).toContain(message);
    const result = validateArtifact(artifact);
    if (result._tag === "invalid") {
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message }),
        ]),
      );
    }
  });

  it("binds execution amendments to previous order and overview approval evidence", () => {
    const transition = {
      version: 1,
      previousPlanCommit: sha,
      previousOrder: [1, 2, 3],
      fullyGatedPrefix: [1],
      approval: "requester-message-18",
      reason: "Task 4 supplies the prerequisite for Task 2.",
      affected: "Task 2 blocked acceptance; Task 3 waits on Task 2.",
    };
    const body = `# Plan: Demo\n\n## Overview\n\n- Execution approval: requester-message-18\n- Previous execution order: 1, 2, 3\n- New execution order: 1, 4, 2, 3\n- Fully gated prefix: 1\n- Reason: Task 4 supplies the prerequisite for Task 2.\n- Affected obligations: Task 2 blocked acceptance; Task 3 waits on Task 2.\n\n## Tasks\n\n${task(1, "First")}\n${task(2, "Second", "Task 4")}\n${task(3, "Third", "Task 2")}\n${task(4, "Prerequisite", "Task 1")}\n## Done when\n\nIt works.\n`;
    const amended = plan(
      {
        execution: { version: 1, order: [1, 4, 2, 3] },
        execution_transition: transition,
      },
      body.split("## Tasks\n\n")[1]?.split("## Done when")[0] ?? "",
    );
    const withOverview = { ...amended, body };
    expect(bodyContract(withOverview)?.executionTransition).toEqual(transition);

    const withoutReference = {
      ...withOverview,
      metadata: {
        ...withOverview.metadata,
        execution_transition: { ...transition, approval: "approved" },
      },
    };
    expect(invalidMessages(withoutReference)).toContain(
      "Execution approval must be an explicit reference, not a decision value",
    );
    const noOverview = { ...amended, body: body.replace("- Fully gated prefix: 1\n", "") };
    expect(invalidMessages(noOverview)).toContain(
      "Overview must record the execution transition reference, old/new orders, gated prefix, reason, and affected obligations",
    );
  });

  it("projects explicit input-impact classifications without treating them as approval", () => {
    const inputImpact = {
      version: 1,
      previousPlanCommit: sha,
      reviewReference: "independent-review-21",
      changes: [
        {
          path: "AGENTS.md",
          previousBlob: sha,
          currentBlob: "abcdef0123456789abcdef0123456789abcdef01",
          affectedTasks: [2],
          unaffectedTasks: [1],
          newTasks: [],
          unresolvedIntent: false,
          rationale: "The command change affects Task 2 only.",
        },
      ],
    };
    const source = plan({ input_impact: inputImpact });
    const withImpact = {
      ...source,
      body: `# Plan: Demo\n\n## Overview\n\n- Input impact review: independent-review-21\n- Input impact previous plan: ${sha}\n\n## Tasks\n\n${task(1, "First")}\n${task(2, "Second", "Task 1")}\n## Done when\n\nIt works.\n`,
    };
    expect(bodyContract(withImpact)?.inputImpact).toEqual(inputImpact);
    expect(
      invalidMessages({
        ...withImpact,
        metadata: {
          ...withImpact.metadata,
          input_impact: {
            ...inputImpact,
            changes: [
              {
                ...inputImpact.changes[0],
                unresolvedIntent: true,
              },
            ],
          },
        },
      }),
    ).toContain("Input impact contains unresolved intent and must return to its owner");
  });

  it("rejects dependency errors and cycles while accepting visible declarations only", () => {
    expect(invalidMessages(plan({}, `${task(1, "First", "Task 1")}`))).toEqual(
      expect.arrayContaining(["Task 1 cannot depend on itself"]),
    );
    expect(invalidMessages(plan({}, `${task(1, "First")}\n${task(2, "Second", "Task 9")}`))).toEqual(
      expect.arrayContaining(["Task 2 declares unknown or abandoned prerequisite 9"]),
    );
    expect(invalidMessages(plan({}, `${task(1, "First", "Task 2")}\n${task(2, "Second", "Task 1")}`))).toEqual(
      expect.arrayContaining(["Task prerequisites contain a cycle"]),
    );
    expect(invalidMessages(plan({}, `${task(1, "First")}\n${task(2, "Second", "Task 1, Task 1")}`))).toEqual(
      expect.arrayContaining(["Task 2 repeats a Depends on prerequisite"]),
    );
    expect(invalidMessages(plan({}, `${task(1, "First")}\n${task(2, "Second", "Task 1 Task 1")}`))).toEqual(
      expect.arrayContaining(["Task 2 Depends on must be none or a comma-separated list of Task N IDs"]),
    );
  });

  it("ignores hidden dependency declarations and refuses ambiguous visible declarations", () => {
    const hidden = plan({}, `${task(1, "First")}\n### Task 2: Second\n\n<!-- - Depends on: Task 1 -->\n`);
    expect(bodyContract(hidden)?.tasks[1]?.dependsOn).toEqual([]);
    const ambiguous = plan({}, `${task(1, "First")}\n### Task 2: Second\n\n- Depends on: Task 1\n- Depends on: none\n`);
    expect(invalidMessages(ambiguous)).toContain("Task 2 has ambiguous Depends on declarations");
  });

  it("preserves previously gated prefixes and surviving execution order on amendment", () => {
    expect(executionTransitionProblems([1, 2, 3], [1, 4, 2, 3], [1])).toEqual([]);
    expect(executionTransitionProblems([1, 2, 3], [4, 1, 2, 3], [1])).toContain(
      "Previously fully gated prefix must remain unchanged",
    );
    expect(executionTransitionProblems([1, 2, 3], [1, 3, 2, 4], [1])).toContain(
      "Surviving tasks must retain their prior relative execution order",
    );
    expect(executionTransitionProblems([1, 2], [1, 3, 2], [1, 2])).toContain(
      "Previously fully gated prefix must remain unchanged",
    );
  });

  it("parses a versioned task input context bound to its selected block", () => {
    const block = digestTaskBlock(1, "First");
    const notes = JSON.stringify(inputContext(block));
    const projection = bodyContract(plan({}, `${block}\n- Notes: ${notes}`));
    expect(projection?.tasks[0]?.inputContext).toEqual(inputContext(block));
    expect(validateTaskInputContextSchema(inputContext(block))).toEqual([]);
    expect(
      validateTaskInputContextSchema({
        ...inputContext(block),
        taskDefinition: "f".repeat(40),
      }),
    ).not.toEqual([]);
  });

  it("rejects malformed, stale, duplicate and unsafe task input snapshots", () => {
    const block = digestTaskBlock(1, "First");
    const changedDigest = { ...inputContext(block), taskDefinition: "f".repeat(64) };
    expect(invalidMessages(plan({}, `${block}\n- Notes: ${JSON.stringify(changedDigest)}`))).toContain(
      "Task 1 input context does not match its task definition",
    );
    expect(invalidMessages(plan({}, `${block}\n- Notes: {broken json`)).some((message) => message.includes("not valid JSON"))).toBe(true);
    const unsafe = { ...inputContext(block), inputs: [{ path: "../AGENTS.md", blob: sha }] };
    expect(invalidMessages(plan({}, `${block}\n- Notes: ${JSON.stringify(unsafe)}`)).some((message) => message.includes("repository-relative path"))).toBe(true);
    const duplicate = { ...inputContext(block), inputs: [{ path: "AGENTS.md", blob: sha }, { path: "AGENTS.md", blob: sha }] };
    expect(invalidMessages(plan({}, `${block}\n- Notes: ${JSON.stringify(duplicate)}`))).toContain(
      "Task 1 repeats input path AGENTS.md",
    );
  });

  it("uses SHA-256 for task and breakdown digests while preserving original proof shape", () => {
    const block = digestTaskBlock(1, "First");
    const taskDigest = createHash("sha256").update(block).digest("hex");
    const expectedBreakdown = createHash("sha256")
      .update(`1:${taskDigest}`)
      .digest("hex");
    expect(taskDefinitionDigest(block)).toBe(taskDigest);
    expect(breakdownDigest([1], [block])).toBe(expectedBreakdown);
    expect(taskDigest).toHaveLength(64);
    expect(expectedBreakdown).toHaveLength(64);

    const proof = {
      version: 1,
      base: sha,
      authority: "requester-message-17",
      breakdown: expectedBreakdown,
      taskIds: [1],
    };
    expect(bodyContract(plan({ initialization: proof }))).toMatchObject({
      initialization: proof,
      identityOrder: [1, 2, 3],
    });
    expect(bodyContract(plan({ initialization: { ...proof, breakdown: "f".repeat(64) } })))
      .toMatchObject({ initialization: { ...proof, breakdown: "f".repeat(64) } });
    expect(invalidMessages(plan({ initialization: { ...proof, breakdown: "f".repeat(40) } })))
      .toContain("Initial scaffold proof is malformed");
    expect(invalidMessages(plan({ initialization: { ...proof, taskIds: [9] } }))).toContain(
      "Initial scaffold proof task IDs must match its contiguous initial task list",
    );
    const renamed = plan(
      { initialization: proof },
      `${task(1, "Renamed")}${task(2, "Second", "Task 1")}${task(3, "Third", "Task 2")}`,
    );
    expect(bodyContract(renamed)?.initialization).toEqual(proof);
    const abandoned = plan(
      {
        initialization: {
          ...proof,
          breakdown: breakdownDigest(
            [1, 2, 3],
            [task(1, "First"), task(2, "Second", "Task 1"), task(3, "Third", "Task 2")],
          ),
          taskIds: [1, 2, 3],
        },
      },
      `${task(1, "First (abandoned — superseded)")}${task(2, "Second (abandoned — superseded)")}${task(3, "Third (abandoned — superseded)")}`,
    );
    expect(bodyContract(abandoned)?.identityOrder).toEqual([1, 2, 3]);
    expect(bodyContract(abandoned)?.executionOrder).toEqual([]);
  });

  it("consumes the plan template's initialization and canonical amendment Overview fields", () => {
    const template = readFileSync("bundle/templates/plan.md", "utf8");
    const frontmatter = template.match(/^---\n([\s\S]*?)\n---/)?.[1];
    if (!frontmatter) throw new Error("Plan template frontmatter is missing");
    const metadata = parse(frontmatter
      .replace(/^  base:.*$/m, `  base: ${sha}`)
      .replace(/^  authority:.*$/m, "  authority: requester-template-approval")
      .replace(/^  breakdown:.*$/m, `  breakdown: ${"f".repeat(64)}`));
    expect(bodyContract(plan({ initialization: metadata.initialization }))?.initialization)
      .toMatchObject({ taskIds: [1, 2], base: sha, authority: "requester-template-approval" });

    const transition = { version: 1, previousPlanCommit: sha, previousOrder: [1, 2, 3], fullyGatedPrefix: [1], approval: "requester-template-order", reason: "Task 4 supplies Task 2.", affected: "Task 2 waits for Task 4." };
    const impact = { version: 1, previousPlanCommit: sha, reviewReference: "template-independent-review", changes: [{ path: "AGENTS.md", previousBlob: sha, currentBlob: "f".repeat(40), affectedTasks: [2], unaffectedTasks: [1], newTasks: [4], unresolvedIntent: false, rationale: "Current task context requires the prerequisite." }] };
    const fields = new Map([
      ["Execution approval", transition.approval],
      ["Previous execution order", "1, 2, 3"],
      ["New execution order", "1, 4, 2, 3"],
      ["Fully gated prefix", "1"],
      ["Reason", transition.reason],
      ["Affected obligations", transition.affected],
      ["Input impact review", impact.reviewReference],
      ["Input impact previous plan", sha],
    ]);
    const overview = template.split("## Overview\n")[1]?.split("\n## Tasks")[0] ?? "";
    const instantiated = [...overview.matchAll(/^- ([^:\n]+):[^\n]*$/gm)]
      .filter((match) => fields.has(match[1] ?? ""))
      .map((match) => `- ${match[1]}: ${fields.get(match[1] ?? "")}`);
    expect(instantiated).toHaveLength(fields.size);
    const artifact = plan({ execution: { version: 1, order: [1, 4, 2, 3] }, execution_transition: transition, input_impact: impact }, `${task(1, "First")}${task(2, "Second", "Task 4")}${task(3, "Third", "Task 2")}${task(4, "Prerequisite", "Task 1")}`);
    const instantiatedPlan = { ...artifact, body: artifact.body.replace("## Overview\n", `## Overview\n${instantiated.join("\n")}\n`) };
    const validation = validateArtifact(instantiatedPlan);
    expect(validation._tag, JSON.stringify(validation)).toBe("valid");
    expect(bodyContract(instantiatedPlan)).toMatchObject({ executionTransition: transition, inputImpact: impact });
  });

  it("validates formal intent reference paths and leaves tactical absence explicit", () => {
    const refs = [{ path: "proposal.md", reference: "requester-message-18", commit: sha }];
    expect(bodyContract(plan({ intent_approvals: refs }))?.intentApprovals).toEqual(refs);
    expect(invalidMessages(plan({ intent_approvals: [refs[0], refs[0]] }))).toContain(
      "Intent approval path is repeated: proposal.md",
    );
    expect(invalidMessages(plan({ intent_approvals: [{ ...refs[0], path: "../proposal.md" }] })).some((message) => message.includes("outside formal change inputs"))).toBe(true);
    expect(bodyContract(plan())?.intentApprovals).toEqual([]);
  });
});

describe("critique disposition", () => {
  it.each([
    ["approved", "accepted", "settled"],
    ["approved", "applied", "settled"],
    ["approved", "rejected", "settled"],
    ["approved", "skipped", "owner-decision-required"],
    ["changes-requested", "accepted", "application-required"],
    ["changes-requested", "applied", "settled"],
    ["changes-requested", "rejected", "settled"],
    ["changes-requested", "skipped", "owner-decision-required"],
    ["skipped", "accepted", "no-clearance"],
    ["skipped", "applied", "no-clearance"],
    ["skipped", "rejected", "no-clearance"],
    ["skipped", "skipped", "no-clearance"],
  ] as const)("maps %s/%s to %s without inferring approval", (verdict, decision, expected) => {
    expect(critiqueDisposition(verdict, decision)).toBe(expected);
  });
});
