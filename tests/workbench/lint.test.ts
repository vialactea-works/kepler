import { afterEach, describe, expect, it } from "vitest";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import {
  LintService,
  renderLintResult,
  type LintDependencies,
  type LintResult,
  type LintScope,
} from "../../packages/cli/src/workbench/lint.js";
import { validateArtifact as validateArtifactContract } from "../../packages/cli/src/workbench/artifact-contracts.js";

const temporaryDirectories: string[] = [];

const temporaryDirectory = async () => {
  const directory = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-lint-"));
  temporaryDirectories.push(directory);
  return directory;
};

const proposal = (
  body = "# Proposal: Demo\n## Why\n## Goals & Success Criteria\n## Non-Goals\n## Proposed Change\n## Capabilities\n## Impact\n",
) =>
  `---\nartifact: proposal\nchange: demo\nstatus: approved\ndecision: accepted\nauthor: caio\ncreated: 2026-09-12\nroute_unit: null\n---\n${body}`;

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

type ReviewArtifactKind = "feedback" | "review";

type ReviewGlobals = {
  readonly base?: string;
  readonly head?: string;
  readonly verdict?: string;
};

const reviewBase = "0123456789abcdef0123456789abcdef01234567";
const reviewHead = "fedcba9876543210fedcba9876543210fedcba98";
const reviewNext = "abcdef0123456789abcdef0123456789abcdef01";

const reviewPass = ({
  number,
  date,
  base = reviewBase,
  head = reviewHead,
  verdict,
  blocking = ["None."],
  suggestions = ["None."],
  fields = true,
}: {
  readonly number: number;
  readonly date: string;
  readonly base?: string;
  readonly head?: string;
  readonly verdict: string;
  readonly blocking?: readonly string[];
  readonly suggestions?: readonly string[];
  readonly fields?: boolean;
}) =>
  [
    `## Pass ${number} — ${date}`,
    "",
    ...(fields
      ? [`Base: ${base}`, `Head: ${head}`, `Verdict: ${verdict}`, ""]
      : []),
    "### Blocking",
    ...blocking.map((value) => `- ${value}`),
    "",
    "### Suggestions",
    ...suggestions.map((value) => `- ${value}`),
  ].join("\n");

const compatibilityPass = (number: number, date: string) =>
  reviewPass({ number, date, verdict: "approved", fields: false });

const reviewSource = (
  kind: ReviewArtifactKind,
  body: string,
  globals: ReviewGlobals = {},
) => {
  const globalLines = [
    globals.base === undefined ? [] : [`base: ${globals.base}`],
    globals.head === undefined ? [] : [`head: ${globals.head}`],
    globals.verdict === undefined ? [] : [`verdict: ${globals.verdict}`],
  ].flat();
  const metadata =
    kind === "feedback"
      ? [
          "artifact: feedback",
          "change: demo",
          "task: 1",
          "created: 2026-09-12",
          "status: resolved",
          "decision: accepted",
        ]
      : [
          "artifact: review",
          "change: demo",
          "created: 2026-09-12",
          "status: complete",
          "decision: accepted",
        ];
  const title =
    kind === "feedback"
      ? "# Code Feedback: Task 1 — Demo"
      : "# Whole-branch Review: Demo";
  return ["---", ...metadata, ...globalLines, "---", title, "", body, ""].join(
    "\n",
  );
};

const writeReviewArtifact = async (
  kind: ReviewArtifactKind,
  body: string,
  globals: ReviewGlobals = {},
) => {
  const directory = await temporaryDirectory();
  const file =
    kind === "feedback"
      ? Path.join(
          directory,
          ".kepler",
          "changes",
          "demo",
          "tasks",
          "task-1",
          "feedback.md",
        )
      : Path.join(directory, ".kepler", "changes", "demo", "review.md");
  const source = reviewSource(kind, body, globals);
  await Fs.mkdir(Path.dirname(file), { recursive: true });
  await Fs.writeFile(file, source);
  return { file, source };
};

const sourceLine = (
  source: string,
  text: string,
  occurrence = 0,
): number => {
  let offset = -1;
  let start = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    offset = source.indexOf(text, start);
    start = offset + text.length;
  }
  return source.slice(0, offset).split(/\r\n|\n|\r/).length;
};

const finishSource = (
  status: string,
  result: string,
  body: string,
): string => `---
artifact: finish
change: demo
status: ${status}
created: 2026-09-12
updated: 2026-09-13
strategy: no-op
result: ${result}
decision: accepted
---
${body}
`;

const reviewTitle = (kind: ReviewArtifactKind): string =>
  kind === "feedback"
    ? "# Code Feedback: Task 1 — Demo"
    : "# Whole-branch Review: Demo";

type LineLocator = (source: string, kind: ReviewArtifactKind) => number;

const parserFailureCases: readonly {
  readonly name: string;
  readonly body: string;
  readonly globals?: ReviewGlobals;
  readonly code: string;
  readonly message: string;
  readonly line: LineLocator;
}[] = [
  {
    name: "missing pass record",
    body: "### Blocking\n- None.\n\n### Suggestions\n- None.",
    code: "missing-section",
    message: "Body must declare at least one Pass record",
    line: (source, kind) => sourceLine(source, reviewTitle(kind)),
  },
  {
    name: "malformed pass heading",
    body: "## Pass 1\n\n### Blocking\n- None.\n\n### Suggestions\n- None.",
    code: "invalid-record",
    message: "Malformed pass record",
    line: (source) => sourceLine(source, "## Pass 1"),
  },
  {
    name: "nested pass heading",
    body: "### Pass 1 — 2026-09-12\n\n### Blocking\n- None.\n\n### Suggestions\n- None.",
    code: "invalid-record",
    message: "Pass records must use level 2 headings",
    line: (source) => sourceLine(source, "### Pass 1"),
  },
  {
    name: "unexpected level two heading",
    body: [
      "## Overview",
      "Text",
      "",
      reviewPass({ number: 1, date: "2026-09-12", verdict: "approved" }),
    ].join("\n"),
    code: "invalid-record",
    message: "Review bodies may only declare level 2 Pass headings",
    line: (source) => sourceLine(source, "## Overview"),
  },
  {
    name: "non-contiguous pass numbering",
    body: [
      reviewPass({ number: 1, date: "2026-09-12", verdict: "approved" }),
      reviewPass({ number: 3, date: "2026-09-13", verdict: "approved" }),
    ].join("\n\n"),
    code: "non-monotonic-record",
    message: "Pass numbering must be append-only and contiguous",
    line: (source) => sourceLine(source, "## Pass 3"),
  },
  {
    name: "pass is not physically last",
    body: [
      reviewPass({ number: 1, date: "2026-09-12", verdict: "approved" }),
      "## Notes\nText",
    ].join("\n\n"),
    code: "invalid-record",
    message: "The latest pass must be the physical last pass",
    line: (source) => sourceLine(source, "## Notes"),
  },
  {
    name: "pass in an HTML comment",
    body: [
      "<!--",
      "## Pass 99 — 2026-09-01",
      "-->",
      "",
      reviewPass({ number: 1, date: "2026-09-12", verdict: "approved" }),
    ].join("\n"),
    code: "invalid-record",
    message: "Pass records cannot be declared in HTML comments",
    line: (source) => sourceLine(source, "<!--"),
  },
  {
    name: "partial global provenance",
    body: reviewPass({ number: 1, date: "2026-09-12", verdict: "approved" }),
    globals: { base: reviewBase },
    code: "invalid-record",
    message:
      "Global review provenance must contain Base, Head, and Verdict together",
    line: (source) => sourceLine(source, "artifact:"),
  },
  {
    name: "unsupported child heading",
    body: [
      "## Pass 1 — 2026-09-12",
      "",
      `Base: ${reviewBase}`,
      `Head: ${reviewHead}`,
      "Verdict: approved",
      "",
      "### Notes",
      "Text",
      "",
      "### Blocking",
      "- None.",
      "",
      "### Suggestions",
      "- None.",
    ].join("\n"),
    code: "invalid-record",
    message:
      "Pass records may only declare Blocking and Suggestions child sections",
    line: (source) => sourceLine(source, "### Notes"),
  },
  {
    name: "duplicate blocking section",
    body: [
      "## Pass 1 — 2026-09-12",
      "",
      `Base: ${reviewBase}`,
      `Head: ${reviewHead}`,
      "Verdict: approved",
      "",
      "### Blocking",
      "- None.",
      "",
      "### Blocking",
      "- None.",
      "",
      "### Suggestions",
      "- None.",
    ].join("\n"),
    code: "invalid-record",
    message: "Pass may declare only one Blocking section",
    line: (source) => sourceLine(source, "### Blocking", 1),
  },
  {
    name: "provenance after child sections",
    body: [
      "## Pass 1 — 2026-09-12",
      "",
      "### Blocking",
      "- None.",
      "",
      `Base: ${reviewBase}`,
      `Head: ${reviewHead}`,
      "Verdict: approved",
      "",
      "### Suggestions",
      "- None.",
    ].join("\n"),
    code: "invalid-record",
    message: "Base must appear exactly once before child sections",
    line: (source) => sourceLine(source, `Base: ${reviewBase}`),
  },
  {
    name: "missing pass field",
    body: reviewPass({
      number: 1,
      date: "2026-09-12",
      verdict: "approved",
    }).replace("Verdict: approved\n", ""),
    code: "missing-section",
    message: "Pass must declare exactly one Verdict field before child sections",
    line: (source) => sourceLine(source, "## Pass 1"),
  },
  {
    name: "pass fields in the wrong order",
    body: [
      "## Pass 1 — 2026-09-12",
      "",
      "Verdict: approved",
      `Base: ${reviewBase}`,
      `Head: ${reviewHead}`,
      "",
      "### Blocking",
      "- None.",
      "",
      "### Suggestions",
      "- None.",
    ].join("\n"),
    code: "invalid-record",
    message: "Verdict must appear exactly once before child sections",
    line: (source) => sourceLine(source, "Verdict: approved"),
  },
  {
    name: "invalid pass base",
    body: reviewPass({
      number: 1,
      date: "2026-09-12",
      verdict: "approved",
      base: "short",
    }),
    code: "invalid-value",
    message: "Base must be a full lowercase commit identifier",
    line: (source) => sourceLine(source, "Base: short"),
  },
  {
    name: "invalid pass head",
    body: reviewPass({
      number: 1,
      date: "2026-09-12",
      verdict: "approved",
      head: "short",
    }),
    code: "invalid-value",
    message: "Head must be a full lowercase commit identifier",
    line: (source) => sourceLine(source, "Head: short"),
  },
  {
    name: "invalid pass verdict",
    body: reviewPass({
      number: 1,
      date: "2026-09-12",
      verdict: "pending",
    }),
    code: "invalid-value",
    message: "Verdict is not allowed",
    line: (source) => sourceLine(source, "Verdict: pending"),
  },
  {
    name: "missing blocking section",
    body: reviewPass({
      number: 1,
      date: "2026-09-12",
      verdict: "approved",
    })
      .replace("### Blocking\n- None.\n\n", "")
      .replace("### Suggestions\n- None.", "### Suggestions\n- None.\n\n## End"),
    code: "missing-section",
    message: "Pass must declare a ### Blocking section",
    line: (source) => sourceLine(source, "## End"),
  },
  {
    name: "missing suggestions section",
    body: reviewPass({
      number: 1,
      date: "2026-09-12",
      verdict: "approved",
    }).replace("### Suggestions\n- None.", "## End"),
    code: "missing-section",
    message: "Pass must declare a ### Suggestions section",
    line: (source) => sourceLine(source, "## End"),
  },
  {
    name: "blocking after suggestions",
    body: [
      "## Pass 1 — 2026-09-12",
      "",
      `Base: ${reviewBase}`,
      `Head: ${reviewHead}`,
      "Verdict: approved",
      "",
      "### Suggestions",
      "- None.",
      "",
      "### Blocking",
      "- None.",
    ].join("\n"),
    code: "invalid-record",
    message: "Blocking must appear before Suggestions",
    line: (source) => sourceLine(source, "### Suggestions"),
  },
  {
    name: "invalid blocking list entry",
    body: reviewPass({
      number: 1,
      date: "2026-09-12",
      verdict: "approved",
      blocking: ["not a list item"],
    }).replace("- not a list item", "not a list item"),
    code: "invalid-value",
    message: "Blocking entries must be non-empty list items",
    line: (source) => sourceLine(source, "not a list item"),
  },
  {
    name: "None combined with blocking findings",
    body: reviewPass({
      number: 1,
      date: "2026-09-12",
      verdict: "approved",
      blocking: ["None.", "[src/file.ts:10] Fix the issue."],
    }),
    code: "invalid-value",
    message: "Blocking cannot combine None. with findings",
    line: (source) => sourceLine(source, "### Blocking"),
  },
  {
    name: "approved pass with blocking finding",
    body: reviewPass({
      number: 1,
      date: "2026-09-12",
      verdict: "approved",
      blocking: ["[src/file.ts:10] Fix the issue."],
    }),
    code: "invalid-value",
    message: "Approved passes cannot contain blocking findings",
    line: (source) => sourceLine(source, "### Blocking"),
  },
  {
    name: "changes requested without blocking finding",
    body: reviewPass({
      number: 1,
      date: "2026-09-12",
      verdict: "changes-requested",
    }),
    code: "invalid-value",
    message: "Changes-requested passes must contain a blocking finding",
    line: (source) => sourceLine(source, "### Blocking"),
  },
  {
    name: "malformed blocking finding",
    body: reviewPass({
      number: 1,
      date: "2026-09-12",
      verdict: "changes-requested",
      blocking: ["TBD"],
    }),
    code: "invalid-value",
    message: "Blocking findings must identify a location and action",
    line: (source) => sourceLine(source, "### Blocking"),
  },
  {
    name: "ambiguous global and pass provenance",
    body: reviewPass({
      number: 1,
      date: "2026-09-12",
      verdict: "approved",
      base: reviewHead,
      head: reviewNext,
    }),
    globals: { base: reviewBase, head: reviewHead, verdict: "approved" },
    code: "invalid-record",
    message:
      "Global review provenance cannot be combined with an explicit pass suffix",
    line: (source) => sourceLine(source, "artifact:"),
  },
  {
    name: "invalid global base",
    body: compatibilityPass(1, "2026-09-12"),
    globals: { base: "short", head: reviewHead, verdict: "approved" },
    code: "invalid-value",
    message: "Global base must be a full lowercase commit identifier",
    line: (source) => sourceLine(source, "artifact:"),
  },
  {
    name: "invalid global head",
    body: compatibilityPass(1, "2026-09-12"),
    globals: { base: reviewBase, head: "short", verdict: "approved" },
    code: "invalid-value",
    message: "Global head must be a full lowercase commit identifier",
    line: (source) => sourceLine(source, "artifact:"),
  },
  {
    name: "invalid global verdict",
    body: compatibilityPass(1, "2026-09-12"),
    globals: { base: reviewBase, head: reviewHead, verdict: "pending" },
    code: "invalid-value",
    message: "Global verdict is not allowed",
    line: (source) => sourceLine(source, "artifact:"),
  },
];

const progressSource = (rows: readonly string[]): string => `---
artifact: progress
change: demo
status: in-progress
updated: 2026-09-12
decision: accepted
tasks:
  - id: 1
    title: Keep
    status: done
    progress: tasks/task-1/progress.md
  - id: 3
    title: Resume
    status: pending
    progress: tasks/task-3/progress.md
---
# Progress: Demo
| Task | Status | Progress |
| --- | --- | --- |
${rows.join("\n")}
`;

const expectExit = (result: LintResult, exitCode: 0 | 1 | 2) => {
  expect(result.exitCode).toBe(exitCode);
  expect(renderLintResult(result)).toContain(
    `lint: ${exitCode === 0 ? "success" : exitCode === 1 ? "findings" : "invalid scope"}`,
  );
};

const executeLint = (
  scope: LintScope,
  dependencies: LintDependencies = {},
): Promise<LintResult> => new LintService(dependencies).execute(scope);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => Fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("scoped artifact lint", () => {
  it("requires exactly one selector without inspecting a scope", async () => {
    const directory = await temporaryDirectory();
    const file = Path.join(directory, "plan.md");
    await Fs.writeFile(file, "# Plan: Demo\n");
    let reads = 0;
    const fileSystem = {
      stat: async (sourcePath: string) => {
        reads += 1;
        return Fs.stat(sourcePath);
      },
      lstat: async (sourcePath: string) => {
        reads += 1;
        return Fs.lstat(sourcePath);
      },
      readdir: async (sourcePath: string) => {
        reads += 1;
        return Fs.readdir(sourcePath, { withFileTypes: true });
      },
      realpath: Fs.realpath,
      readFile: (sourcePath: string) => Fs.readFile(sourcePath, "utf8"),
    };
    expectExit(await executeLint({}, { fileSystem }), 2);
    expectExit(
      await executeLint({ file, changeDir: directory }, { fileSystem }),
      2,
    );
    expect(reads).toBe(0);
  });

  it("rejects missing and non-regular file or directory scopes", async () => {
    const directory = await temporaryDirectory();
    const file = Path.join(directory, "artifact.md");
    await Fs.writeFile(file, "text");
    expectExit(
      await executeLint({ file: Path.join(directory, "missing.md") }),
      2,
    );
    expectExit(await executeLint({ file: directory }), 2);
    expectExit(
      await executeLint({ changeDir: Path.join(directory, "missing") }),
      2,
    );
    expectExit(await executeLint({ changeDir: file }), 2);
  });

  it("validates only the selected regular file", async () => {
    const directory = await temporaryDirectory();
    const file = Path.join(
      directory,
      ".kepler",
      "changes",
      "demo",
      "proposal.md",
    );
    const outside = Path.join(directory, "outside.md");
    await Fs.mkdir(Path.dirname(file), { recursive: true });
    await Fs.writeFile(file, proposal());
    await Fs.writeFile(outside, "# unrelated");
    const fileSystem = {
      readFile: (sourcePath: string) => Fs.readFile(sourcePath, "utf8"),
      stat: (sourcePath: string) => Fs.stat(sourcePath),
      readdir: (sourcePath: string) =>
        Fs.readdir(sourcePath, { withFileTypes: true }),
      realpath: (sourcePath: string) => Fs.realpath(sourcePath),
    };
    const result = await new LintService({ fileSystem }).execute({ file });
    expectExit(result, 0);
    expect(result.findings.map((finding) => finding.sourcePath)).toEqual([
      file,
    ]);
    expect(result.findings[0]?.kind).toBe("success");
  });

  it("returns an environment error when a selected file passes stat but cannot be read", async () => {
    const directory = await temporaryDirectory();
    const file = Path.join(directory, "proposal.md");
    await Fs.writeFile(file, proposal());
    let validationCalls = 0;
    const fileSystem = {
      readFile: async (sourcePath: string) => {
        throw new Error(`permission denied for ${sourcePath}`);
      },
      stat: (sourcePath: string) => Fs.stat(sourcePath),
      readdir: (sourcePath: string) =>
        Fs.readdir(sourcePath, { withFileTypes: true }),
      realpath: (sourcePath: string) => Fs.realpath(sourcePath),
    };
    const result = await executeLint(
      { file },
      {
        fileSystem,
        validateArtifact: (artifact) => {
          validationCalls += 1;
          return validateArtifactContract(artifact);
        },
      },
    );
    expect(result.status).toBe("invalid-scope");
    expect(result.exitCode).toBe(2);
    expect(result.findings).toEqual([
      expect.objectContaining({
        kind: "error",
        sourcePath: file,
        code: "read-failure",
        line: 1,
      }),
    ]);
    expect(renderLintResult(result)).toContain(
      `ERROR ${file}:1 [read-failure] Unable to read ${file}: Error: permission denied for ${file}`,
    );
    expect(validationCalls).toBe(0);
  });

  it("returns deterministic environment errors for unreadable change-directory candidates", async () => {
    const directory = await temporaryDirectory();
    const changeDirectory = Path.join(directory, "change");
    const unreadable = Path.join(changeDirectory, "a", "proposal.md");
    const readable = Path.join(changeDirectory, "b", "proposal.md");
    await Fs.mkdir(Path.dirname(unreadable), { recursive: true });
    await Fs.mkdir(Path.dirname(readable), { recursive: true });
    await Fs.writeFile(unreadable, proposal());
    await Fs.writeFile(readable, proposal());
    const validatedPaths: string[] = [];
    const fileSystem = {
      readFile: async (sourcePath: string) => {
        if (sourcePath === unreadable)
          throw new Error(`permission denied for ${sourcePath}`);
        return Fs.readFile(sourcePath, "utf8");
      },
      stat: (sourcePath: string) => Fs.stat(sourcePath),
      readdir: (sourcePath: string) =>
        Fs.readdir(sourcePath, { withFileTypes: true }),
      realpath: (sourcePath: string) => Fs.realpath(sourcePath),
    };
    const result = await executeLint(
      { changeDir: changeDirectory },
      {
        fileSystem,
        validateArtifact: (artifact) => {
          validatedPaths.push(artifact.sourcePath);
          return validateArtifactContract(artifact);
        },
      },
    );
    expect(result.status).toBe("invalid-scope");
    expect(result.exitCode).toBe(2);
    expect(result.findings).toEqual([
      expect.objectContaining({
        kind: "error",
        sourcePath: unreadable,
        code: "read-failure",
      }),
    ]);
    expect(renderLintResult(result)).toContain(
      `ERROR ${unreadable}:1 [read-failure] Unable to read ${unreadable}: Error: permission denied for ${unreadable}`,
    );
    expect(validatedPaths).toEqual([readable]);
  });

  it("keeps readable invalid YAML as an ordinary lint finding", async () => {
    const directory = await temporaryDirectory();
    const file = Path.join(directory, "proposal.md");
    await Fs.writeFile(file, "---\nartifact: [broken\n---\n# Proposal: Demo\n");
    const fileSystem = {
      readFile: (sourcePath: string) => Fs.readFile(sourcePath, "utf8"),
      stat: (sourcePath: string) => Fs.stat(sourcePath),
      readdir: (sourcePath: string) =>
        Fs.readdir(sourcePath, { withFileTypes: true }),
      realpath: (sourcePath: string) => Fs.realpath(sourcePath),
    };
    const result = await executeLint({ file }, { fileSystem });
    expect(result.status).toBe("findings");
    expect(result.exitCode).toBe(1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        kind: "error",
        sourcePath: file,
        code: "invalid-yaml",
      }),
    ]);
  });

  it("recursively considers nested regular files and ignores outside symlinks", async () => {
    const directory = await temporaryDirectory();
    const changeDirectory = Path.join(
      directory,
      ".kepler",
      "changes",
      "demo",
    );
    const nested = Path.join(changeDirectory, "nested");
    const outside = Path.join(directory, "outside.md");
    await Fs.mkdir(nested, { recursive: true });
    await Fs.writeFile(Path.join(changeDirectory, "proposal.md"), proposal());
    await Fs.writeFile(Path.join(nested, "notes.md"), "# Notes\n");
    await Fs.writeFile(outside, "---\nartifact: proposal\n---\n# invalid\n");
    await Fs.symlink(outside, Path.join(changeDirectory, "outside.md"));
    const readPaths: string[] = [];
    const fileSystem = {
      readFile: async (sourcePath: string) => {
        readPaths.push(sourcePath);
        return Fs.readFile(sourcePath, "utf8");
      },
      stat: (sourcePath: string) => Fs.stat(sourcePath),
      readdir: (sourcePath: string) =>
        Fs.readdir(sourcePath, { withFileTypes: true }),
      realpath: (sourcePath: string) => Fs.realpath(sourcePath),
    };
    const result = await new LintService({ fileSystem }).execute({
      changeDir: changeDirectory,
    });
    expectExit(result, 0);
    expect(result.findings.map((finding) => finding.sourcePath)).toEqual([
      Path.join(changeDirectory, "nested", "notes.md"),
      Path.join(changeDirectory, "proposal.md"),
    ]);
    expect(readPaths).not.toContain(outside);
  });

  it("warns for conventional artifact filenames without frontmatter and skips unrelated files", async () => {
    const directory = await temporaryDirectory();
    const plan = Path.join(directory, "plan.md");
    const notes = Path.join(directory, "notes.md");
    await Fs.writeFile(plan, "# Plan: Demo\n");
    await Fs.writeFile(notes, "# Notes\n");
    const result = await executeLint({ changeDir: directory });
    expectExit(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({ kind: "skipped", sourcePath: notes, line: 1 }),
      expect.objectContaining({ kind: "warning", sourcePath: plan, line: 1 }),
    ]);
  });

  it("lints dependency-mode task contracts and reports a missing acceptance criterion", async () => {
    const directory = await temporaryDirectory();
    const file = Path.join(directory, ".kepler", "changes", "demo", "plan.md");
    const source = `---\nartifact: plan\nchange: demo\nstatus: approved\ncreated: 2026-09-12\nauthor: test\ndecision: accepted\nroute_unit: null\nexecution:\n  version: 2\n  mode: dependencies\n---\n# Plan: Demo\n\n## Overview\n\n## Tasks\n\n### Task 1: Implement\n\n- Goal: Deliver the behavior.\n- Depends on: none\n- Acceptance:\n  - The behavior is observable.\n- Steps:\n  1. Verify the behavior.\n- Verify: bun --bun vitest run\n- Commit: feat: implement behavior\n\n## Done when\n\nThe behavior is complete.\n`;
    await Fs.mkdir(Path.dirname(file), { recursive: true });
    await Fs.writeFile(file, source);
    expectExit(await executeLint({ file }), 0);

    await Fs.writeFile(file, source.replace("- Acceptance:\n  - The behavior is observable.\n", ""));
    const invalid = await executeLint({ file });
    expectExit(invalid, 1);
    expect(renderLintResult(invalid)).toContain(
      "Task 1 requires visible nonempty Acceptance",
    );
  });

  it("reports malformed recognized artifacts and all contract findings", async () => {
    const directory = await temporaryDirectory();
    const file = Path.join(directory, "proposal.md");
    await Fs.writeFile(file, proposal("# Proposal: Demo\n## Why\n"));
    const result = await executeLint({ file });
    expectExit(result, 1);
    expect(
      result.findings.filter((finding) => finding.kind === "error").length,
    ).toBeGreaterThan(1);
    expect(
      result.findings.every(
        (finding) => finding.sourcePath === file && finding.line > 0,
      ),
    ).toBe(true);
    expect(renderLintResult(result)).toContain(`${file}:`);
    expect(renderLintResult(result)).toContain("missing-section");
  });

  it("reports malformed frontmatter with its source location", async () => {
    const directory = await temporaryDirectory();
    const file = Path.join(directory, "proposal.md");
    await Fs.writeFile(file, "---\nartifact: [broken\n---\n# Proposal: Demo\n");
    const result = await executeLint({ file });
    expectExit(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        kind: "error",
        code: "invalid-yaml",
        sourcePath: file,
        line: 3,
      }),
    ]);
  });

  it("renders deterministic path and location ordering", async () => {
    const directory = await temporaryDirectory();
    const first = Path.join(directory, "a", "proposal.md");
    const second = Path.join(directory, "b", "proposal.md");
    await Fs.mkdir(Path.dirname(first), { recursive: true });
    await Fs.mkdir(Path.dirname(second), { recursive: true });
    await Fs.writeFile(first, proposal("# Proposal: Demo\n"));
    await Fs.writeFile(second, proposal("# Proposal: Demo\n"));
    const result = await executeLint({ changeDir: directory });
    expectExit(result, 1);
    const paths = result.findings
      .filter((finding) => finding.kind === "error")
      .map((finding) => finding.sourcePath);
    expect(paths).toEqual([...paths].sort());
    expect(renderLintResult(result).indexOf(first)).toBeLessThan(
      renderLintResult(result).indexOf(second),
    );
  });

  it("maps success, findings, and invalid scope to 0, 1, and 2", async () => {
    const directory = await temporaryDirectory();
    const file = Path.join(directory, "notes.md");
    await Fs.writeFile(file, "notes\n");
    expect((await executeLint({ file })).exitCode).toBe(0);
    await Fs.writeFile(file, proposal("# Proposal: Demo\n"));
    expect((await executeLint({ file })).exitCode).toBe(1);
    expect((await executeLint({ file: directory })).exitCode).toBe(2);
  });

  it.each(parserFailureCases)(
    "surfaces $name parser diagnostics for feedback and review",
    async (failure) => {
      for (const kind of ["feedback", "review"] as const) {
        const artifact = await writeReviewArtifact(
          kind,
          failure.body,
          failure.globals,
        );
        const result = await executeLint({ file: artifact.file });
        expectExit(result, 1);
        const line = failure.line(artifact.source, kind);
        expect(result.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "error",
              sourcePath: artifact.file,
              code: failure.code,
              message: failure.message,
              line,
            }),
          ]),
        );
        expect(renderLintResult(result)).toContain(
          `ERROR ${artifact.file}:${line} [${failure.code}] ${failure.message}`,
        );
      }
    },
  );

  it("accepts abandoned middle-task gaps and rejects invalid progress neighbors", async () => {
    const cases = [
      {
        name: "abandoned middle-task gap",
        rows: [
          "| Task 1: Keep | done | [details](tasks/task-1/progress.md) |",
          "| Task 3: Resume | pending | [details](tasks/task-3/progress.md) |",
        ],
        exitCode: 0,
      },
      {
        name: "malformed row",
        rows: [
          "| Task 1: Keep | done | [details](tasks/task-1/progress.md) |",
          "| Task 3 Resume | pending | [details](tasks/task-3/progress.md) |",
        ],
        exitCode: 1,
      },
      {
        name: "duplicate row",
        rows: [
          "| Task 1: Keep | done | [details](tasks/task-1/progress.md) |",
          "| Task 1: Resume | pending | [details](tasks/task-1/progress.md) |",
        ],
        exitCode: 1,
      },
      {
        name: "descending rows",
        rows: [
          "| Task 3: Resume | pending | [details](tasks/task-3/progress.md) |",
          "| Task 1: Keep | done | [details](tasks/task-1/progress.md) |",
        ],
        exitCode: 1,
      },
      {
        name: "path mismatch",
        rows: [
          "| Task 1: Keep | done | [details](tasks/task-2/progress.md) |",
          "| Task 3: Resume | pending | [details](tasks/task-3/progress.md) |",
        ],
        exitCode: 1,
      },
    ] as const;

    for (const testCase of cases) {
      const directory = await temporaryDirectory();
      const changeDirectory = Path.join(
        directory,
        ".kepler",
        "changes",
        "demo",
      );
      await Fs.mkdir(changeDirectory, { recursive: true });
      await Fs.writeFile(
        Path.join(changeDirectory, "progress.md"),
        progressSource(testCase.rows),
      );
      expectExit(
        await executeLint({ changeDir: changeDirectory }),
        testCase.exitCode,
      );
    }
  });

  it("accepts supplemental content in root progress with both lint scopes", async () => {
    const directory = await temporaryDirectory();
    const changeDirectory = Path.join(directory, ".kepler", "changes", "demo");
    const file = Path.join(changeDirectory, "progress.md");
    const source = progressSource([
      "| Task 1: Keep | done | [details](tasks/task-1/progress.md) |",
      "| Task 3: Resume | pending | [details](tasks/task-3/progress.md) |",
    ])
      .replace("decision: accepted\n", "decision: accepted\ncontext: retained metadata\n")
      .replace("# Progress: Demo\n", "# Progress: Demo\n\n## Context\nRetained context.\n\n") +
      "\n## Notes\nAdditional lint-accepted text.\n";

    await Fs.mkdir(changeDirectory, { recursive: true });
    await Fs.writeFile(file, source);

    expectExit(await executeLint({ file }), 0);
    expectExit(await executeLint({ changeDir: changeDirectory }), 0);
  });

  it("accepts pending task logs and finish intents only in their pending states", async () => {
    const directory = await temporaryDirectory();
    const taskFile = Path.join(
      directory,
      ".kepler",
      "changes",
      "demo",
      "tasks",
      "task-1",
      "progress.md",
    );
    await Fs.mkdir(Path.dirname(taskFile), { recursive: true });
    for (const status of ["pending", "in-progress", "blocked", "done"] as const) {
      await Fs.writeFile(
        taskFile,
        `---
artifact: task-progress
change: demo
task: 1
status: ${status}
updated: 2026-09-12
decision: accepted
---
# Task Progress: Task 1 — Demo
`,
      );
      const result = await executeLint({ file: taskFile });
      expectExit(result, status === "pending" ? 0 : 1);
    }

    const finishFile = Path.join(
      directory,
      ".kepler",
      "changes",
      "demo",
      "finish.md",
    );
    const finishBody = [
      "# Finish History: Demo",
      finishAttempt(1, "2026-09-12"),
      finishOutcome(1, "2026-09-12"),
      finishAttempt(2, "2026-09-13"),
    ].join("\n\n");
    await Fs.writeFile(
      finishFile,
      `---
artifact: finish
change: demo
status: pending
created: 2026-09-12
updated: 2026-09-13
strategy: no-op
result: pending
decision: accepted
---
${finishBody}`,
    );
    expectExit(await executeLint({ file: finishFile }), 0);

    await Fs.writeFile(
      finishFile,
      `---
artifact: finish
change: demo
status: completed
created: 2026-09-12
updated: 2026-09-13
strategy: no-op
result: completed
decision: accepted
---
${finishBody}`,
    );
    expectExit(await executeLint({ file: finishFile }), 1);

    await Fs.writeFile(
      finishFile,
      `---
artifact: finish
change: demo
status: pending
created: 2026-09-12
updated: 2026-09-13
strategy: no-op
result: pending
decision: accepted
---
# Finish History: Demo

## Attempt 1 — 2026-09-12

## Outcome 1 — 2026-09-12

## Outcome 2 — 2026-09-13
`,
    );
    expectExit(await executeLint({ file: finishFile }), 1);
  });

  it("accepts the first pending finish intent and rejects neighboring histories", async () => {
    const directory = await temporaryDirectory();
    const file = Path.join(
      directory,
      ".kepler",
      "changes",
      "demo",
      "finish.md",
    );
    const writeFinish = async (
      status: string,
      result: string,
      records: readonly string[],
    ) => {
      const body = ["# Finish History: Demo", ...records].join("\n\n");
      await Fs.mkdir(Path.dirname(file), { recursive: true });
      await Fs.writeFile(file, finishSource(status, result, body));
    };
    const expectFinish = async (
      status: string,
      result: string,
      records: readonly string[],
      exitCode: 0 | 1,
    ) => {
      await writeFinish(status, result, records);
      expectExit(await executeLint({ file }), exitCode);
    };

    await expectFinish(
      "pending",
      "pending",
      [finishAttempt(1, "2026-09-12")],
      0,
    );
    await expectFinish(
      "pending",
      "pending",
      [
        finishAttempt(1, "2026-09-12"),
        finishOutcome(1, "2026-09-12"),
        finishAttempt(2, "2026-09-13"),
      ],
      0,
    );
    await expectFinish(
      "completed",
      "completed",
      [finishAttempt(1, "2026-09-12"), finishOutcome(1, "2026-09-12")],
      0,
    );
    await expectFinish(
      "pending",
      "pending",
      [
        finishAttempt(
          1,
          "2026-09-12",
          finishIntentFields.slice(1),
        ),
      ],
      1,
    );
    for (const [status, result] of [
      ["pending", "completed"],
      ["completed", "pending"],
    ] as const)
      await expectFinish(
        status,
        result,
        [finishAttempt(1, "2026-09-12")],
        1,
      );
    for (const [status, result] of [
      ["completed", "completed"],
      ["blocked", "blocked"],
    ] as const)
      await expectFinish(
        status,
        result,
        [finishAttempt(1, "2026-09-12")],
        1,
      );
    for (const records of [
      [finishOutcome(1, "2026-09-12")],
      [
        finishAttempt(1, "2026-09-12"),
        finishOutcome(1, "2026-09-12"),
        finishOutcome(2, "2026-09-13"),
      ],
      [
        finishAttempt(1, "2026-09-12"),
        finishOutcome(1, "2026-09-12"),
        finishAttempt(3, "2026-09-13"),
      ],
      [
        finishAttempt(1, "2026-09-12"),
        finishOutcome(1, "2026-09-12"),
        finishAttempt(1, "2026-09-13"),
      ],
      [finishAttempt(1, "2026-09-12"), finishAttempt(2, "2026-09-13"), finishOutcome(2, "2026-09-13")],
    ] as const)
      await expectFinish("pending", "pending", records, 1);
  });

  it("accepts valid multi-pass feedback and review evidence", async () => {
    const body = [
      reviewPass({
        number: 1,
        date: "2026-09-12",
        base: reviewBase,
        head: reviewHead,
        verdict: "changes-requested",
        blocking: ["[src/file.ts:10] Fix the issue."],
      }),
      reviewPass({
        number: 2,
        date: "2026-09-13",
        base: reviewHead,
        head: reviewNext,
        verdict: "approved",
      }),
    ].join("\n\n");
    for (const kind of ["feedback", "review"] as const) {
      const artifact = await writeReviewArtifact(kind, body);
      const result = await executeLint({ file: artifact.file });
      expectExit(result, 0);
      expect(result.findings).toEqual([
        expect.objectContaining({
          kind: "success",
          sourcePath: artifact.file,
          code: "valid",
        }),
      ]);
    }
  });

  it("accepts legacy global evidence only on the physical latest pass", async () => {
    const globals = {
      base: reviewBase,
      head: reviewHead,
      verdict: "approved",
    };
    for (const kind of ["feedback", "review"] as const) {
      const single = await writeReviewArtifact(
        kind,
        compatibilityPass(1, "2026-09-12"),
        globals,
      );
      expectExit(await executeLint({ file: single.file }), 0);

      const multiple = await writeReviewArtifact(
        kind,
        [
          reviewPass({
            number: 1,
            date: "2026-09-12",
            verdict: "changes-requested",
            blocking: ["[src/file.ts:10] Fix the issue."],
            fields: false,
          }),
          compatibilityPass(2, "2026-09-13"),
        ].join("\n\n"),
        globals,
      );
      expectExit(await executeLint({ file: multiple.file }), 0);
    }
  });

  it("accepts a migrated fieldless prefix with an explicit suffix", async () => {
    const body = [
      reviewPass({
        number: 1,
        date: "2026-09-12",
        verdict: "changes-requested",
        blocking: ["[src/file.ts:10] Fix the issue."],
        fields: false,
      }),
      reviewPass({
        number: 2,
        date: "2026-09-13",
        base: reviewHead,
        head: reviewNext,
        verdict: "approved",
      }),
    ].join("\n\n");
    for (const kind of ["feedback", "review"] as const) {
      const artifact = await writeReviewArtifact(kind, body);
      expectExit(await executeLint({ file: artifact.file }), 0);
    }
  });
});
