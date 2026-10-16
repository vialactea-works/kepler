import { createHash } from "node:crypto";
import { marked, type Token } from "marked";
import { validateTaskInputContextSchema } from "./artifact-schemas.js";
import type { RecognizedArtifact } from "./artifact-reader.js";
import { parseReviewPasses } from "./review-passes.js";
import { parseFinishRecords } from "./finish-records.js";
import { validateScopeExpansions } from "./scope-expansions.js";
import type {
  ArtifactBodyValidation,
  ArtifactContractDiagnostic,
  ArtifactContractDiagnosticCode,
  ArtifactHeading,
  ArtifactWorkflowRecord,
  ArtifactWorkflowRecordKind,
  ArtifactWorkflowState,
  CritiqueDisposition,
  InitialScaffoldProof,
  IntentApprovalReference,
  LegacyInputConfirmation,
  PlanContractProjection,
  PlanExecutionContract,
  PlanExecutionTransitionContract,
  PlanInputImpactContract,
  PlanTaskContract,
  ReviewPassEvidence,
  RouteUnitContract,
  SupportedArtifact,
  TaskInputContext,
  TaskOrderEntry,
} from "./artifact-types.js";

interface BodyContract {
  readonly heading: string;
  readonly sections: readonly string[];
  readonly records?:
    | GenericWorkflowRecordKind
    | readonly GenericWorkflowRecordKind[];
  readonly ledger?: "plan" | "progress";
}

type GenericWorkflowRecordKind = Exclude<ArtifactWorkflowRecordKind, "pass">;

const bodyContracts: Record<SupportedArtifact, BodyContract> = {
  proposal: {
    heading: "Proposal:",
    sections: [
      "Why",
      "Goals & Success Criteria",
      "Non-Goals",
      "Proposed Change",
      "Capabilities",
      "Impact",
    ],
  },
  design: {
    heading: "Design:",
    sections: [
      "Context",
      "Goals / Non-Goals",
      "Decisions",
      "Architecture & Components",
      "Testing Strategy",
      "Constraints & Boundaries",
      "Risks / Trade-offs",
    ],
  },
  "requirements-change": {
    heading: "Capability:",
    sections: [],
  },
  "requirements-spec": {
    heading: "Capability:",
    sections: ["Overview", "Contract", "Behavior", "Invariants", "Decisions"],
  },
  plan: {
    heading: "Plan:",
    sections: ["Overview", "Tasks", "Done when"],
    ledger: "plan",
  },
  progress: { heading: "Progress:", sections: [], ledger: "progress" },
  "task-progress": {
    heading: "Task Progress:",
    sections: [],
    records: "attempt",
  },
  feedback: {
    heading: "Code Feedback:",
    sections: ["Blocking", "Suggestions"],
  },
  review: {
    heading: "Whole-branch Review:",
    sections: ["Blocking", "Suggestions"],
  },
  finish: {
    heading: "Finish History:",
    sections: [],
    records: ["attempt", "outcome"],
  },
  critique: {
    heading: "Critique:",
    sections: ["Scope", "Findings", "Quality Lens", "Summary"],
  },
  map: {
    heading: "",
    sections: [
      "Destination",
      "Notes",
      "Operation rules",
      "Decisions so far",
      "Not yet specified",
      "Out of scope",
    ],
  },
  route: {
    heading: "Route —",
    sections: [
      "Point of departure",
      "Destination",
      "Path chosen",
      "Shipping rules",
      "Units",
    ],
    records: "unit",
  },
  ticket: {
    heading: "",
    sections: ["Question", "Answer", "Outdated decisions"],
  },
};

export interface ArtifactBodyView {
  readonly source: string;
  readonly lines: readonly string[];
}

export const createArtifactBodyView = (body: string): ArtifactBodyView => {
  let visible = body.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\r\n]/g, " "),
  );
  visible = visible.replace(/<!--?[\s\S]*$/g, (comment) =>
    comment.replace(/[^\r\n]/g, " "),
  );
  return { source: visible, lines: visible.split(/\r\n|\n|\r/) };
};

const bodyLines = (artifact: RecognizedArtifact): readonly string[] =>
  createArtifactBodyView(artifact.body).lines;

const visibleTaskFieldLines = (lines: readonly string[]): readonly string[] => {
  let fence: { readonly marker: string; readonly length: number } | undefined;
  return lines.map((line) => {
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!fence) {
      if (!opening) return line;
      const marker = opening[1] ?? "";
      if (marker.startsWith("`") && (opening[2] ?? "").includes("`"))
        return line;
      fence = { marker: marker[0] ?? "", length: marker.length };
      return "";
    }
    const rest = line.slice(line.match(/^ {0,3}/)?.[0].length ?? 0);
    let closingLength = 0;
    while (rest[closingLength] === fence.marker) closingLength += 1;
    if (closingLength >= fence.length && rest.slice(closingLength).trim() === "")
      fence = undefined;
    return "";
  });
};

export const visibleMarkdownLines = (source: string): readonly string[] =>
  visibleTaskFieldLines(createArtifactBodyView(source).lines);

const lineAtOffset = (source: string, offset: number): number =>
  source.slice(0, offset).split(/\r\n|\n|\r/).length;

interface ParsedHeading {
  readonly level: number;
  readonly text: string;
  readonly offset: number;
}

const markdownHeadings = (source: string): readonly ParsedHeading[] => {
  const headings: ParsedHeading[] = [];
  let offset = 0;
  let tokens: readonly Token[];
  try {
    tokens = marked.lexer(source);
  } catch {
    return headings;
  }
  for (const token of tokens) {
    const raw =
      "raw" in token && typeof token.raw === "string" ? token.raw : "";
    const tokenOffset = raw === "" ? offset : source.indexOf(raw, offset);
    const resolvedOffset = tokenOffset < 0 ? offset : tokenOffset;
    if (token.type === "heading")
      headings.push({
        level: token.depth,
        text: token.text.trim(),
        offset: resolvedOffset,
      });
    offset = resolvedOffset + raw.length;
  }
  return headings;
};

const parsePlanTaskHeading = (
  text: string,
): { readonly id: number; readonly title: string } | undefined => {
  const match = /^Task ([1-9][0-9]*):[ \t]+(.+)$/.exec(text);
  return match ? { id: Number(match[1]), title: match[2] ?? "" } : undefined;
};

export const readVisiblePlanTaskHeadings = (
  source: string,
): readonly { readonly id: number; readonly title: string }[] | undefined => {
  const taskHeadings = markdownHeadings(createArtifactBodyView(source).source).filter(
    (heading) => heading.level === 3 && heading.text.startsWith("Task "),
  );
  const seen = new Set<number>();
  const tasks: { id: number; title: string }[] = [];
  for (const heading of taskHeadings) {
    const task = parsePlanTaskHeading(heading.text);
    if (!task || seen.has(task.id)) return undefined;
    seen.add(task.id);
    tasks.push(task);
  }
  return tasks;
};

const readBodyHeadings = (
  artifact: RecognizedArtifact,
): readonly ArtifactHeading[] => {
  const source = createArtifactBodyView(artifact.body).source.replace(/\r\n|\r/g, "\n");
  return markdownHeadings(source).map((heading) => ({
    level: heading.level,
    text: heading.text,
    line:
      artifact.locations.body.startLine +
      lineAtOffset(source, heading.offset) -
      1,
  }));
};

const bodyDiagnostic = (
  artifact: RecognizedArtifact,
  code: ArtifactContractDiagnosticCode,
  message: string,
  line: number,
  expected?: string,
  actual?: unknown,
): ArtifactContractDiagnostic => ({
  _tag: "ArtifactContractDiagnostic",
  code,
  message,
  sourcePath: artifact.sourcePath,
  ...(expected === undefined ? {} : { expected }),
  ...(actual === undefined ? {} : { actual }),
  location: { line },
});

const recordLabel = (kind: GenericWorkflowRecordKind): string =>
  kind === "attempt"
    ? "Attempt"
    : kind === "outcome"
      ? "Outcome"
      : kind === "unit"
        ? "Unit"
        : "Task";

const recordHeadingMatches = (
  kind: GenericWorkflowRecordKind,
  text: string,
): boolean =>
  text.startsWith(recordLabel(kind) + " ") ||
  (kind === "unit" && /^[1-9][0-9]*\. /.test(text));

const recordLevel = (kind: GenericWorkflowRecordKind): number =>
  kind === "unit" ? 3 : 2;

type ParsedRecordHeading =
  | { readonly number: number; readonly date: string }
  | { readonly number: number; readonly title: string };

const recordHeading = (
  kind: GenericWorkflowRecordKind,
  text: string,
): ParsedRecordHeading | null => {
  const label = recordLabel(kind);
  if (kind === "unit") {
    const unit = /^([1-9][0-9]*)\. (.+)$/.exec(text);
    return unit ? { number: Number(unit[1]), title: unit[2] ?? "" } : null;
  }
  const match = new RegExp(
    "^" + label + " ([1-9][0-9]*) — ([0-9]{4}-[0-9]{2}-[0-9]{2})$",
  ).exec(text);
  return match ? { number: Number(match[1]), date: match[2] ?? "" } : null;
};

const commentedRecordHeadings = (
  artifact: RecognizedArtifact,
  kinds: readonly GenericWorkflowRecordKind[],
): readonly ArtifactHeading[] => {
  const headings: ArtifactHeading[] = [];
  const comments = /<!--[\s\S]*?-->/g;
  let match: RegExpExecArray | null;
  while ((match = comments.exec(artifact.body)) !== null) {
    const comment = match[0];
    const inner = comment.replace(/^<!--/, "").replace(/-->$/, "");
    const normalized = inner.replace(/\r\n|\r/g, "\n");
    const precedingLines = lineAtOffset(artifact.body, match.index) - 1;
    for (const heading of markdownHeadings(normalized)) {
      const text = heading.text;
      if (kinds.some((kind) => recordHeadingMatches(kind, text)))
        headings.push({
          level: heading.level,
          text,
          line:
            artifact.locations.body.startLine +
            precedingLines +
            lineAtOffset(normalized, heading.offset) -
            1,
        });
    }
  }
  return headings;
};

const recordFields = (
  lines: readonly string[],
  start: number,
  end: number,
  allowLegacyTaskOutcome = false,
): Readonly<Record<string, string>> => {
  const fields: Record<string, string> = {};
  for (let index = start + 1; index < end; index += 1) {
    const line = lines[index] || "";
    const match = /^- ([A-Za-z][A-Za-z -]*):[ \t]*(.*)$/.exec(line);
    if (match) {
      fields[match[1]?.trim() ?? ""] = match[2]?.trim() ?? "";
    } else if (allowLegacyTaskOutcome) {
      const legacyOutcome = /^Outcome:[ \t]+(.*)$/.exec(line);
      if (legacyOutcome) fields.Outcome = legacyOutcome[1]?.trim() ?? "";
    }
  }
  return fields;
};

const readWorkflow = (
  artifact: RecognizedArtifact,
  kind: GenericWorkflowRecordKind | readonly GenericWorkflowRecordKind[] | null,
  headings: readonly ArtifactHeading[],
  allowEmpty = false,
  allowEmptyKinds: readonly GenericWorkflowRecordKind[] = [],
  validateLatestTaskOutcome = true,
): {
  readonly state: ArtifactWorkflowState;
  readonly diagnostics: readonly ArtifactContractDiagnostic[];
} => {
  if (kind === null)
    return {
      state: { classification: "supported", records: [] },
      diagnostics: [],
    };
  const kinds = Array.isArray(kind) ? kind : [kind];
  const lines = bodyLines(artifact);
  const unitsSection = headings.find(
    (heading) => heading.level === 2 && heading.text === "Units",
  );
  const unitsSectionEnd =
    unitsSection === undefined
      ? Number.POSITIVE_INFINITY
      : (headings.find(
          (heading) => heading.level === 2 && heading.line > unitsSection.line,
        )?.line ?? Number.POSITIVE_INFINITY);
  const isUnitSectionHeading = (heading: ArtifactHeading): boolean =>
    unitsSection !== undefined &&
    heading.line > unitsSection.line &&
    heading.line < unitsSectionEnd;
  const candidates = headings.filter(
    (heading) =>
      heading.level === 2 ||
      (kinds.includes("unit") &&
        heading.level === 3 &&
        isUnitSectionHeading(heading)),
  );
  const records: ArtifactWorkflowRecord[] = [];
  const diagnostics: ArtifactContractDiagnostic[] = [];
  let sawLegacy = false;
  for (const heading of headings.filter((candidate) => candidate.level > 1)) {
    const matchingKind =
      kinds.find(
        (candidate) =>
          recordHeadingMatches(candidate, heading.text) &&
          (candidate !== "unit" || isUnitSectionHeading(heading)),
      ) ?? null;
    if (matchingKind === null) {
      const legacy = /^(Pass|Attempt|Outcome|Task|Unit)\b/.exec(heading.text);
      if (legacy && !(kinds.includes("unit") && heading.level === 3)) {
        sawLegacy = true;
        diagnostics.push(
          bodyDiagnostic(
            artifact,
            "legacy-unsupported",
            `Unsupported legacy ${legacy[1]?.toLowerCase() ?? ""} record`,
            heading.line,
            kinds.join(" | "),
            heading.text,
          ),
        );
      }
      continue;
    }
    const label = recordLabel(matchingKind);
    if (heading.level !== recordLevel(matchingKind)) {
      diagnostics.push(
        bodyDiagnostic(
          artifact,
          "invalid-record",
          `${label} records must use level ${recordLevel(matchingKind)} headings`,
          heading.line,
          `${"#".repeat(recordLevel(matchingKind))} ${label} N — YYYY-MM-DD`,
          heading.text,
        ),
      );
      continue;
    }
    const parsed = recordHeading(matchingKind, heading.text);
    if (parsed === null) {
      sawLegacy = true;
      diagnostics.push(
        bodyDiagnostic(
          artifact,
          "invalid-record",
          `Malformed ${label.toLowerCase()} record`,
          heading.line,
          matchingKind === "unit" ? "N. title" : `${label} N — YYYY-MM-DD`,
          heading.text,
        ),
      );
      continue;
    }
    const start = heading.line - artifact.locations.body.startLine;
    const next =
      candidates.find((candidate) => candidate.line > heading.line) ?? null;
    const end =
      next === null
        ? lines.length
        : next.line - artifact.locations.body.startLine;
    if (
      validateLatestTaskOutcome &&
      artifact.metadata.artifact === "task-progress" &&
      matchingKind === "attempt" &&
      !candidates.some(
        (candidate) =>
          candidate.line > heading.line &&
          recordHeadingMatches("attempt", candidate.text),
      )
    ) {
      const outcomes = lines
        .slice(start + 1, end)
        .flatMap((line) => {
          const field = /^(?:-[ \t]+)?Outcome[ \t]*:(.*)$/.exec(line);
          if (field === null) return [];
          const supported =
            /^- Outcome:[ \t]*(.*)$/.exec(line) ??
            /^Outcome:[ \t]+(.*)$/.exec(line);
          return [supported?.[1]?.trim() ?? ""];
        });
      if (
        outcomes.length !== 1 ||
        !["done", "blocked"].includes(outcomes[0] ?? "")
      )
        diagnostics.push(
          bodyDiagnostic(
            artifact,
            "invalid-record",
            "Latest task attempt must declare exactly one done or blocked Outcome",
            heading.line,
          ),
        );
    }
    records.push({
      kind: matchingKind,
      number: parsed.number,
      ...(parsed && "date" in parsed ? { date: parsed.date } : {}),
      ...(parsed && "title" in parsed ? { title: parsed.title } : {}),
      line: heading.line,
      fields: recordFields(
        lines,
        start,
        end,
        artifact.metadata.artifact === "task-progress" &&
          matchingKind === "attempt",
      ),
    });
  }
  for (const heading of commentedRecordHeadings(artifact, kinds)) {
    const matchingKind =
      kinds.find((candidate) =>
        recordHeadingMatches(candidate, heading.text),
      ) ?? null;
    if (matchingKind === null) continue;
    diagnostics.push(
      bodyDiagnostic(
        artifact,
        "invalid-record",
        `${recordLabel(matchingKind)} records cannot be declared in HTML comments`,
        heading.line,
        `${"#".repeat(recordLevel(matchingKind))} ${recordLabel(matchingKind)} N — YYYY-MM-DD`,
        heading.text,
      ),
    );
  }
  for (const recordKind of kinds) {
    if (
      !records.some((record) => record.kind === recordKind) &&
      !allowEmpty &&
      !allowEmptyKinds.includes(recordKind)
    ) {
      const label = recordLabel(recordKind);
      diagnostics.push(
        bodyDiagnostic(
          artifact,
          "missing-section",
          `Body must declare at least one ${label.toLowerCase()} record`,
          artifact.locations.body.startLine,
          recordKind === "unit" ? "N. title" : `${label} N — YYYY-MM-DD`,
        ),
      );
    }
    const numbered = records.filter(
      (record) => record.kind === recordKind && record.number !== undefined,
    );
    for (let index = 0; index < numbered.length; index += 1) {
      const expected = index + 1;
      if (numbered[index]?.number !== expected) {
        diagnostics.push(
          bodyDiagnostic(
            artifact,
            "non-monotonic-record",
            "Record numbering must be append-only and contiguous",
            numbered[index]?.line ?? artifact.locations.body.startLine,
            String(expected),
            numbered[index]?.number,
          ),
        );
        break;
      }
    }
  }
  const state: ArtifactWorkflowState = {
    classification: sawLegacy ? "legacy-unsupported" : "supported",
    records,
  };
  return { state, diagnostics };
};

const pendingTaskProgress = (
  artifact: RecognizedArtifact,
  kind: SupportedArtifact,
  title: ArtifactHeading | null,
): boolean =>
  kind === "task-progress" &&
  artifact.metadata.artifact === kind &&
  artifact.metadata.status === "pending" &&
  typeof artifact.metadata.task === "number" &&
  Number.isInteger(artifact.metadata.task) &&
  artifact.metadata.task > 0 &&
  title !== null &&
  new RegExp(
    `^Task Progress: Task ${artifact.metadata.task} — .+$`,
  ).test(title.text);

const pendingFinishIntent = (artifact: RecognizedArtifact): boolean =>
  artifact.metadata.artifact === "finish" &&
  artifact.metadata.status === "pending" &&
  artifact.metadata.result === "pending";

const finishIntentFields = [
  "Passed preconditions",
  "Specification synchronization",
  "Strategy",
  "Intended workspace result",
  "Route intent",
] as const;

const finishAttemptDiagnostics = (
  artifact: RecognizedArtifact,
  record: ArtifactWorkflowRecord,
): readonly ArtifactContractDiagnostic[] =>
  finishIntentFields.flatMap((field) => {
    const value = record.fields[field];
    if (
      value !== undefined &&
      value.trim() !== "" &&
      !/^<[^>]*>$/.test(value.trim())
    )
      return [];
    return [
      bodyDiagnostic(
        artifact,
        "missing-section",
        `Attempt ${record.number ?? "N"} must declare a non-empty ${field} field`,
        record.line,
        `- ${field}: value`,
        value,
      ),
    ];
  });

const finishWorkflowDiagnostics = (
  artifact: RecognizedArtifact,
  records: readonly ArtifactWorkflowRecord[],
): readonly ArtifactContractDiagnostic[] => {
  const diagnostics: ArtifactContractDiagnostic[] = [];
  const pending = pendingFinishIntent(artifact);
  let expected = 1;
  let index = 0;
  while (index < records.length) {
    const record = records[index];
    if (record === undefined) break;
    if (record.kind !== "attempt") {
      diagnostics.push(
        bodyDiagnostic(
          artifact,
          "invalid-record",
          "Finish history must pair each Attempt with its matching Outcome",
          record.line,
          "Attempt N — YYYY-MM-DD",
          `Outcome ${record.number ?? ""}`,
        ),
      );
      index += 1;
      continue;
    }
    diagnostics.push(...finishAttemptDiagnostics(artifact, record));
    const next = records[index + 1];
    if (next === undefined) {
      const allowed =
        pending &&
        record.number === expected &&
        index === records.length - 1;
      if (!allowed)
        diagnostics.push(
          bodyDiagnostic(
            artifact,
            "invalid-record",
            "Finish history cannot end with an unmatched Attempt",
            record.line,
            `Outcome ${record.number ?? "N"} — YYYY-MM-DD`,
            `Attempt ${record.number ?? ""}`,
          ),
        );
      break;
    }
    if (next.kind !== "outcome") {
      diagnostics.push(
        bodyDiagnostic(
          artifact,
          "invalid-record",
          "Finish history must place each Outcome immediately after its Attempt",
          next.line,
          `Outcome ${record.number ?? "N"} — YYYY-MM-DD`,
          next.kind,
        ),
      );
      index += 1;
      continue;
    }
    if (next.number !== record.number)
      diagnostics.push(
        bodyDiagnostic(
          artifact,
          "invalid-record",
          "Each Outcome must match the preceding Attempt number",
          next.line,
          String(record.number ?? "N"),
          next.number,
        ),
      );
    if (record.number === expected) expected += 1;
    index += 2;
  }
  return diagnostics;
};

const readReviewWorkflow = (
  artifact: RecognizedArtifact,
): {
  readonly state: ArtifactWorkflowState;
  readonly diagnostics: readonly ArtifactContractDiagnostic[];
} => {
  const parsed = parseReviewPasses(artifact);
  const records = parsed.passes.map((pass): ArtifactWorkflowRecord => {
    const fields = {
      Blocking: pass.blocking.join("\n"),
      Suggestions: pass.suggestions.join("\n"),
    };
    if (pass.provenance === "structural")
      return {
        kind: "pass",
        number: pass.number,
        date: pass.date,
        line: pass.line,
        fields,
      };
    return {
      kind: "pass",
      number: pass.number,
      date: pass.date,
      line: pass.line,
      fields: {
        ...fields,
        Base: pass.base,
        Head: pass.head,
        Verdict: pass.verdict,
        ...(pass.coverage === undefined ? {} : { Coverage: pass.coverage }),
        ...(pass.clearance === undefined
          ? {}
          : pass.clearance.scope === "full"
            ? { Scope: "full", Target: pass.clearance.target }
            : {
                Scope: "remediation",
                Target: pass.clearance.target,
                "Parent pass": String(pass.clearance.parentPass),
                "Parent commit": pass.clearance.parentCommit,
                "Delta base": pass.clearance.deltaBase,
                Resolutions: JSON.stringify(pass.clearance.resolutions),
              }),
      },
    };
  });
  const evidence = parsed.passes.filter(
    (pass): pass is ReviewPassEvidence => pass.provenance !== "structural",
  );
  return {
    state: {
      classification:
        parsed.physicalLastPass === undefined
          ? "supported"
          : "physical-last-pass",
      records,
      passes: evidence,
      ...(parsed.physicalLastPass === undefined
        ? {}
        : { physicalLastPass: parsed.physicalLastPass }),
      ...(parsed.physicalLastPass === undefined
        ? {}
        : { lastPass: parsed.physicalLastPass }),
    },
    diagnostics: parsed.diagnostics,
  };
};

const tableCells = (line: string): readonly string[] | null => {
  const opening = /^\s*\|/.exec(line);
  if (opening === null) return null;
  const content = line.slice(opening[0].length);
  let closing = content.length - 1;
  while (closing >= 0 && /\s/.test(content[closing] ?? "")) closing -= 1;
  if (content[closing] !== "|") return null;
  let backslashes = 0;
  for (
    let index = closing - 1;
    index >= 0 && content[index] === "\\";
    index -= 1
  )
    backslashes += 1;
  if (backslashes % 2 === 1) return null;

  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (let index = 0; index < closing; index += 1) {
    const character = content[index] ?? "";
    if (escaped) {
      cell += character === "|" ? "|" : `\\${character}`;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  if (escaped) cell += "\\";
  cells.push(cell.trim());
  return cells;
};

const isTableSeparator = (cells: readonly string[]): boolean =>
  cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));

const readTaskLedger = (
  artifact: RecognizedArtifact,
  ledger: "plan" | "progress",
  headings: readonly ArtifactHeading[],
): {
  readonly records: readonly ArtifactWorkflowRecord[];
  readonly diagnostics: readonly ArtifactContractDiagnostic[];
} => {
  const records: ArtifactWorkflowRecord[] = [];
  const diagnostics: ArtifactContractDiagnostic[] = [];
  const lines = bodyLines(artifact);
  if (ledger === "plan") {
    const taskHeadings = headings.filter(
      (heading) => heading.level === 3 && heading.text.startsWith("Task "),
    );
    if (taskHeadings.length === 0) {
      diagnostics.push(
        bodyDiagnostic(
          artifact,
          "missing-section",
          "Plan must declare at least one task",
          artifact.locations.body.startLine,
          "### Task N: title",
        ),
      );
    }
    for (const heading of taskHeadings) {
      const task = parsePlanTaskHeading(heading.text);
      if (!task) {
        diagnostics.push(
          bodyDiagnostic(
            artifact,
            "invalid-record",
            "Malformed task record",
            heading.line,
            "Task N: title",
            heading.text,
          ),
        );
        continue;
      }
      records.push({
        kind: "task",
        number: task.id,
        title: task.title,
        line: heading.line,
        fields: {},
      });
    }
  } else {
    const headerIndex = lines.findIndex((line) => {
      const cells = tableCells(line);
      return (
        cells?.length === 3 &&
        cells[0] === "Task" &&
        cells[1] === "Status" &&
        cells[2] === "Progress"
      );
    });
    if (headerIndex === -1) {
      diagnostics.push(
        bodyDiagnostic(
          artifact,
          "missing-section",
          "Progress must declare a task ledger",
          artifact.locations.body.startLine,
          "| Task | Status | Progress |",
        ),
      );
    } else {
      const separator = tableCells(lines[headerIndex + 1] || "");
      if (separator === null || !isTableSeparator(separator)) {
        diagnostics.push(
          bodyDiagnostic(
            artifact,
            "invalid-record",
            "Progress task ledger must declare a separator row",
            artifact.locations.body.startLine + headerIndex + 1,
            "| --- | --- | --- |",
            lines[headerIndex + 1],
          ),
        );
      }
      for (let index = headerIndex + 1; index < lines.length; index += 1) {
        const cells = tableCells(lines[index] || "");
        if (cells === null || isTableSeparator(cells)) continue;
        const line = artifact.locations.body.startLine + index;
        if (cells.length !== 3) {
          diagnostics.push(
            bodyDiagnostic(
              artifact,
              "invalid-record",
              "Malformed progress task record",
              line,
              "| Task N: title | status | [details](tasks/task-N/progress.md) |",
              lines[index],
            ),
          );
          continue;
        }
        const task = /^Task ([1-9][0-9]*):[ \t]+(.+)$/.exec(cells[0] || "");
        const status = ["pending", "in-progress", "blocked", "done"].includes(
          cells[1] || "",
        );
        const progress =
          /^\[details\]\(tasks\/task-([1-9][0-9]*)\/progress\.md\)$/.exec(
            cells[2] || "",
          );
        if (!task || !status || !progress || progress[1] !== task[1]) {
          diagnostics.push(
            bodyDiagnostic(
              artifact,
              "invalid-record",
              "Malformed progress task record",
              line,
              "| Task N: title | status | [details](tasks/task-N/progress.md) |",
              lines[index],
            ),
          );
          continue;
        }
        records.push({
          kind: "task",
          number: Number(task[1]),
          title: task[2] ?? "",
          line,
          fields: { Status: cells[1] ?? "", Progress: cells[2] ?? "" },
        });
      }
    }
  }
  for (let index = 0; index < records.length; index += 1) {
    const current = records[index]?.number;
    const previous = records[index - 1]?.number;
    const valid =
      ledger === "plan"
        ? current === index + 1
        : index === 0 ||
          (current !== undefined &&
            previous !== undefined &&
            current > previous);
    if (!valid) {
      diagnostics.push(
        bodyDiagnostic(
          artifact,
          "non-monotonic-record",
          "Task numbering must be append-only and contiguous",
          records[index]?.line ?? artifact.locations.body.startLine,
          String(index + 1),
          current,
        ),
      );
      break;
    }
  }
  return { records, diagnostics };
};

export const resolveRouteReferences = (
  proposal: string | null | undefined,
  plan: { readonly present: boolean; readonly reference?: string | null },
) => {
  if (plan.present && proposal && proposal !== plan.reference)
    return {
      kind: "conflict" as const,
      references: [proposal, plan.reference ?? null] as const,
    };
  return plan.present
    ? {
        kind: "resolved" as const,
        reference: plan.reference ?? undefined,
        source: "plan" as const,
      }
    : {
        kind: "resolved" as const,
        reference: proposal ?? undefined,
        source: "proposal" as const,
      };
};

export const routeRelationProblems = (
  units: readonly RouteUnitContract[],
  records: readonly ArtifactWorkflowRecord[],
): readonly string[] => {
  const problems: string[] = [];
  const ids = new Set(units.map((unit) => unit.id));
  if (ids.size !== units.length) problems.push("Route unit IDs must be unique");
  const unitRecords = records.filter((record) => record.kind === "unit");
  if (
    units.length !== unitRecords.length ||
    units.some(
      (unit, index) =>
        unit.id !== unitRecords[index]?.number ||
        unit.name !== unitRecords[index]?.title,
    )
  )
    problems.push("Route metadata and body unit identities/order must match");
  for (const unit of units) {
    if (new Set(unit.depends_on).size !== unit.depends_on.length)
      problems.push(`Unit ${unit.id} repeats a dependency`);
    for (const dependency of unit.depends_on) {
      if (!ids.has(dependency))
        problems.push(`Unit ${unit.id} has unknown dependency ${dependency}`);
      if (dependency === unit.id)
        problems.push(`Unit ${unit.id} depends on itself`);
    }
  }
  if (ids.size === units.length) {
    const indegree = new Map(units.map((unit) => [unit.id, 0]));
    const dependents = new Map<number, number[]>();
    for (const unit of units) {
      for (const dependency of new Set(unit.depends_on)) {
        if (!ids.has(dependency)) continue;
        indegree.set(unit.id, (indegree.get(unit.id) ?? 0) + 1);
        const list = dependents.get(dependency);
        if (list) list.push(unit.id);
        else dependents.set(dependency, [unit.id]);
      }
    }
    const ready = [...indegree]
      .filter(([, count]) => count === 0)
      .map(([id]) => id);
    for (let index = 0; index < ready.length; index += 1) {
      for (const id of dependents.get(ready[index]!) ?? []) {
        const next = (indegree.get(id) ?? 0) - 1;
        indegree.set(id, next);
        if (next === 0) ready.push(id);
      }
    }
    if (ready.length !== ids.size)
      problems.push("Route dependencies must be acyclic");
  }
  return problems;
};

export const progressLedgerMatches = (
  metadata: unknown,
  records: readonly ArtifactWorkflowRecord[],
): boolean => {
  if (!Array.isArray(metadata) || metadata.length !== records.length) return false;
  return metadata.every((value, index) => {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return false;
    const entry = value as Record<string, unknown>;
    const record = records[index];
    return (
      entry.id === record?.number &&
      entry.title === record?.title &&
      entry.status === record?.fields.Status &&
      entry.progress === `tasks/task-${String(entry.id)}/progress.md` &&
      `[details](${entry.progress})` === record?.fields.Progress
    );
  });
};

const hashText = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const taskDefinitionDigest = (taskBlock: string): string => {
  const lines = taskBlock.split(/\r\n|\n|\r/);
  const visibleLines = visibleTaskFieldLines(lines);
  return hashText(
    lines
      .filter(
        (line, index) =>
          visibleLines[index] !== line ||
          !/^\s*[-*]\s+Notes:[ \t]*\{.*\}\s*$/.test(line),
      )
      .join("\n")
      .trimEnd(),
  );
};

export const taskBreakdownDigestFromDefinitions = (
  taskIds: readonly number[],
  tasks: readonly { readonly id: number; readonly definitionDigest: string }[],
): string => {
  const byId = new Map(tasks.map((task) => [task.id, task.definitionDigest]));
  return hashText(
    taskIds
      .map((id) => `${id}:${byId.get(id) ?? taskDefinitionDigest("")}`)
      .join("\n"),
  );
};

export const taskBreakdownDigest = (
  taskIds: readonly number[],
  tasks: readonly { readonly id: number; readonly source: string }[],
): string =>
  taskBreakdownDigestFromDefinitions(
    taskIds,
    tasks.map((task) => ({ id: task.id, definitionDigest: taskDefinitionDigest(task.source) })),
  );

export const dependencyGraphProblems = (
  tasks: readonly TaskOrderEntry[],
): readonly string[] => {
  const active = new Set(tasks.map((task) => task.id));
  const problems: string[] = [];
  for (const task of tasks) {
    const unique = new Set(task.dependsOn);
    if (unique.size !== task.dependsOn.length)
      problems.push(`Task ${task.id} repeats a prerequisite`);
    for (const dependency of task.dependsOn) {
      if (!active.has(dependency)) {
        problems.push(`Task ${task.id} declares unknown or abandoned prerequisite ${dependency}`);
        continue;
      }
      if (dependency === task.id)
        problems.push(`Task ${task.id} cannot depend on itself`);
    }
  }
  const indegree = new Map(tasks.map((task) => [task.id, task.dependsOn.length]));
  const dependents = new Map<number, number[]>();
  for (const task of tasks)
    for (const dependency of task.dependsOn) {
      const list = dependents.get(dependency) ?? [];
      list.push(task.id);
      dependents.set(dependency, list);
    }
  const ready = tasks.filter((task) => task.dependsOn.length === 0).map((task) => task.id);
  let visited = 0;
  for (let index = 0; index < ready.length; index += 1) {
    const id = ready[index];
    visited += 1;
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }
  if (visited !== tasks.length) problems.push("Task prerequisites contain a cycle");
  return [...new Set(problems)];
};

export const executionSequenceProblems = (
  tasks: readonly TaskOrderEntry[],
  execution: Extract<PlanExecutionContract, { readonly version: 1 }>,
): readonly string[] => {
  const active = new Set(tasks.map((task) => task.id));
  const order = execution.order;
  const problems = [...dependencyGraphProblems(tasks)];
  if (
    order.length !== active.size ||
    new Set(order).size !== order.length ||
    order.some((id) => !active.has(id))
  )
    problems.push("Execution order must contain every active task exactly once");
  const positions = new Map(order.map((id, index) => [id, index]));
  for (const task of tasks) {
    const position = positions.get(task.id);
    for (const dependency of task.dependsOn) {
      const before = positions.get(dependency);
      if (position === undefined || before === undefined || before >= position)
        problems.push(
          `Task ${task.id} requires active Task ${dependency} earlier in execution order`,
        );
    }
  }
  return [...new Set(problems)];
};

export const dependencyTransitionProblems = (
  previousTasks: readonly TaskOrderEntry[],
  currentTasks: readonly TaskOrderEntry[],
  fullyGatedTasks: readonly number[],
): readonly string[] => {
  const previousIds = new Set(previousTasks.map((task) => task.id));
  const currentIds = new Set(currentTasks.map((task) => task.id));
  const problems: string[] = [];
  if (new Set(fullyGatedTasks).size !== fullyGatedTasks.length)
    problems.push("Fully gated task set contains duplicate task IDs");
  for (const id of fullyGatedTasks)
    if (!previousIds.has(id) || !currentIds.has(id))
      problems.push(`Fully gated Task ${id} is not active in both plan revisions`);
  return problems;
};

export const executionTransitionProblems = (
  previousOrder: readonly number[],
  nextOrder: readonly number[],
  fullyGatedPrefix: readonly number[],
): readonly string[] => {
  const problems: string[] = [];
  if (new Set(previousOrder).size !== previousOrder.length)
    problems.push("Previous execution order contains duplicate task IDs");
  if (new Set(nextOrder).size !== nextOrder.length)
    problems.push("New execution order contains duplicate task IDs");
  if (
    fullyGatedPrefix.some((id, index) => previousOrder[index] !== id) ||
    fullyGatedPrefix.some((id, index) => nextOrder[index] !== id)
  )
    problems.push("Previously fully gated prefix must remain unchanged");
  const nextPositions = new Map(nextOrder.map((id, index) => [id, index]));
  const survivors = previousOrder.filter((id) => nextPositions.has(id));
  for (let index = 1; index < survivors.length; index += 1) {
    const prior = nextPositions.get(survivors[index - 1] ?? -1) ?? -1;
    const current = nextPositions.get(survivors[index] ?? -1) ?? -1;
    if (current <= prior) {
      problems.push("Surviving tasks must retain their prior relative execution order");
      break;
    }
  }
  return problems;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFullSha = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{40}$/.test(value);

const isPositiveTaskIdArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((id) => Number.isInteger(id) && Number(id) > 0);

const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

const parseTaskDependencies = (
  lines: readonly string[],
): { readonly dependsOn: readonly number[]; readonly declared: boolean; readonly problem?: string } => {
  const declarations = lines.flatMap((line) => {
    const match = /^[ \t]*[-*][ \t]+Depends on:[ \t]*(.*?)[ \t]*$/.exec(line);
    return match === null ? [] : [match[1] ?? ""];
  });
  if (declarations.length === 0) return { dependsOn: [], declared: false };
  if (declarations.length !== 1)
    return { dependsOn: [], declared: true, problem: "has ambiguous Depends on declarations" };
  const value = declarations[0] ?? "";
  if (value === "none") return { dependsOn: [], declared: true };
  if (!/^Task [1-9][0-9]*(?:, Task [1-9][0-9]*)*$/.test(value))
    return { dependsOn: [], declared: true, problem: "Depends on must be none or a comma-separated list of Task N IDs" };
  const dependsOn = value.split(", ").map((item) => Number(item.slice(5)));
  if (new Set(dependsOn).size !== dependsOn.length)
    return { dependsOn: [], declared: true, problem: "repeats a Depends on prerequisite" };
  return { dependsOn, declared: true };
};

const taskFieldHeader = (line: string): RegExpExecArray | null =>
  /^[-*][ \t]+([A-Za-z][A-Za-z ]*):[ \t]*(.*?)[ \t]*$/.exec(line);

const readTaskField = (
  lines: readonly string[],
  name: string,
): { readonly count: number; readonly lines: readonly string[] } => {
  const declarations = lines.flatMap((line, index) => {
    const match = taskFieldHeader(line);
    return match?.[1] === name ? [{ index, value: match[2] ?? "" }] : [];
  });
  if (declarations.length !== 1) return { count: declarations.length, lines: [] };
  const declaration = declarations[0];
  if (!declaration) return { count: 0, lines: [] };
  const values = declaration.value === "" ? [] : [declaration.value];
  for (let index = declaration.index + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (taskFieldHeader(line)) break;
    values.push(line.trim());
  }
  return { count: 1, lines: values };
};

const taskFieldText = (field: { readonly lines: readonly string[] }): string =>
  field.lines
    .map((line) => line.replace(/^(?:[-*][ \t]+|[1-9][0-9]*[.)][ \t]+)/, "").trim())
    .filter(Boolean)
    .join(" ");

const safeRepositoryPath = (value: string): boolean =>
  value !== "" &&
  !value.startsWith("/") &&
  !value.includes("\\") &&
  value.split("/").every((part) => part !== "" && part !== "." && part !== "..");

const isTaskInputContext = (value: unknown): value is TaskInputContext =>
  isRecord(value) &&
  value.version === 1 &&
  typeof value.repository === "string" &&
  typeof value.intentCommit === "string" &&
  isSha256(value.taskDefinition) &&
  Array.isArray(value.inputs) &&
  value.inputs.every(
    (input) =>
      isRecord(input) &&
      typeof input.path === "string" &&
      isFullSha(input.blob),
  ) &&
  (value.impactPlanCommit === undefined || isFullSha(value.impactPlanCommit));

const isLegacyInputConfirmation = (
  value: unknown,
): value is LegacyInputConfirmation =>
  isRecord(value) &&
  value.version === 1 &&
  Number.isInteger(value.task) &&
  Number(value.task) > 0 &&
  typeof value.repository === "string" &&
  isSha256(value.taskDefinition) &&
  typeof value.intentCommit === "string" &&
  Array.isArray(value.inputs) &&
  value.inputs.length > 0 &&
  value.inputs.every(
    (input) =>
      isRecord(input) &&
      typeof input.path === "string" &&
      isFullSha(input.blob),
  ) &&
  value.historicalInputs === "unknown" &&
  typeof value.owner === "string" &&
  typeof value.ownerReference === "string" &&
  typeof value.reviewer === "string" &&
  typeof value.reviewReference === "string" &&
  typeof value.rationale === "string";

const parseTaskInputContext = (
  artifact: RecognizedArtifact,
  task: number,
  note: string,
  digest: string,
  line: number,
): { readonly value?: TaskInputContext; readonly diagnostics: readonly ArtifactContractDiagnostic[] } => {
  const diagnostics: ArtifactContractDiagnostic[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(note);
  } catch {
    diagnostics.push(
      bodyDiagnostic(artifact, "invalid-record", `Task ${task} Notes input context is not valid JSON`, line),
    );
    return { diagnostics };
  }
  const shapeProblems = validateTaskInputContextSchema(parsed);
  for (const problem of shapeProblems)
    diagnostics.push(bodyDiagnostic(artifact, "invalid-record", `Task ${task} ${problem}`, line));
  if (!isRecord(parsed) || shapeProblems.length > 0) return { diagnostics };
  if (!isTaskInputContext(parsed)) return { diagnostics };
  const value = parsed;
  if (value.taskDefinition !== digest)
    diagnostics.push(
      bodyDiagnostic(artifact, "invalid-record", `Task ${task} input context does not match its task definition`, line, digest, value.taskDefinition),
    );
  const inputPaths = new Set<string>();
  for (const input of value.inputs) {
    if (!safeRepositoryPath(input.path))
      diagnostics.push(
        bodyDiagnostic(artifact, "invalid-record", `Task ${task} input path must be a repository-relative path`, line, "relative path without dot segments", input.path),
      );
    if (inputPaths.has(input.path))
      diagnostics.push(
        bodyDiagnostic(artifact, "invalid-record", `Task ${task} repeats input path ${input.path}`, line),
      );
    inputPaths.add(input.path);
  }
  if (value.impactPlanCommit !== undefined && !isFullSha(value.impactPlanCommit))
    diagnostics.push(
      bodyDiagnostic(artifact, "invalid-record", `Task ${task} impact plan commit must be a full lowercase commit identifier`, line),
    );
  return diagnostics.length === 0 ? { value, diagnostics } : { diagnostics };
};

const recordIsAbandoned = (record: ArtifactWorkflowRecord): boolean =>
  /\(abandoned — .+\)$/.test(record.title ?? "");

const parseTaskFiles = (
  lines: readonly string[],
): { readonly declared: boolean; readonly files: readonly string[] } => {
  const start = lines.findIndex((line) => /^[ \t]*-[ \t]+Files:/.test(line));
  if (start < 0) return { declared: false, files: [] };
  const first = (lines[start] ?? "").replace(/^[ \t]*-[ \t]+Files:[ \t]*/, "").trim();
  if (first.toLowerCase() === "none") return { declared: true, files: [] };
  const files: string[] = [];
  const add = (value: string) => {
    const path = value.trim().replace(/^`|`$/g, "");
    if (path !== "" && !/^<.*>$/.test(path)) files.push(path);
  };
  if (first !== "") add(first);
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^[ \t]*-[ \t]+(?:Depends on|Files|Acceptance|Steps|Verify|Commit):/.test(line))
      break;
    const item = /^[ \t]+-[ \t]+(.+)$/.exec(line)?.[1]?.trim();
    if (!item || /^(Created|Modified|Deleted):$/.test(item)) continue;
    add(item);
  }
  return { declared: files.length > 0, files: [...new Set(files)] };
};

const readPlanProjection = (
  artifact: RecognizedArtifact,
  headings: readonly ArtifactHeading[],
  records: readonly ArtifactWorkflowRecord[],
): { readonly plan: PlanContractProjection; readonly diagnostics: readonly ArtifactContractDiagnostic[] } => {
  const diagnostics: ArtifactContractDiagnostic[] = [];
  const lines = bodyLines(artifact);
  const rawExecution = artifact.metadata.execution;
  const dependencyMode = isRecord(rawExecution) && rawExecution.version === 2 && rawExecution.mode === "dependencies";
  const taskRecords = records.filter((record) => record.kind === "task");
  const taskHeadings = headings.filter(
    (heading) => heading.level === 3 && /^Task [1-9][0-9]*:/.test(heading.text),
  );
  const tasks: Array<PlanTaskContract & { readonly source: string }> = [];
  for (let index = 0; index < taskRecords.length; index += 1) {
    const record = taskRecords[index];
    const heading = taskHeadings.find((candidate) => candidate.line === record?.line);
    if (record?.number === undefined || !heading) continue;
    const start = heading.line - artifact.locations.body.startLine;
    const nextTaskLine = taskHeadings.find((candidate) => candidate.line > heading.line)?.line;
    const doneHeadingLine = headings.find(
      (candidate) => candidate.level === 2 && candidate.text === "Done when" && candidate.line > heading.line,
    )?.line;
    const endLine = Math.min(
      nextTaskLine ?? Number.POSITIVE_INFINITY,
      doneHeadingLine ?? Number.POSITIVE_INFINITY,
      lines.length + artifact.locations.body.startLine,
    );
    const blockLines = lines.slice(start, endLine - artifact.locations.body.startLine);
    const source = blockLines.join("\n").trimEnd();
    const digest = taskDefinitionDigest(source);
    const visibleFieldLines = visibleTaskFieldLines(blockLines);
    const parsedDependencies = parseTaskDependencies(visibleFieldLines);
    const parsedFiles = parseTaskFiles(visibleFieldLines);
    const goalField = readTaskField(visibleFieldLines, "Goal");
    const acceptanceField = readTaskField(visibleFieldLines, "Acceptance");
    const stepsField = readTaskField(visibleFieldLines, "Steps");
    const verifyField = readTaskField(visibleFieldLines, "Verify");
    const commitField = readTaskField(visibleFieldLines, "Commit");
    const goal = taskFieldText(goalField);
    const acceptance = acceptanceField.lines
      .map((line) => line.replace(/^(?:[-*][ \\t]+|[1-9][0-9]*[.)][ \\t]+)/, "").trim())
      .filter(Boolean);
    const steps = stepsField.lines.filter(Boolean);
    const verify = taskFieldText(verifyField);
    const commit = taskFieldText(commitField);
    if (parsedDependencies.problem)
      diagnostics.push(bodyDiagnostic(artifact, "invalid-record", `Task ${record.number} ${parsedDependencies.problem}`, record.line));
    if (dependencyMode) {
      if (!parsedDependencies.declared)
        diagnostics.push(bodyDiagnostic(artifact, "invalid-record", `Task ${record.number} requires an explicit Depends on declaration`, record.line));
      for (const [label, field, value] of [
        ["Goal", goalField, goal],
        ["Acceptance", acceptanceField, acceptance.join(" ")],
        ["Steps", stepsField, steps.join(" ")],
        ["Verify", verifyField, verify],
        ["Commit", commitField, commit],
      ] as const)
        if (field.count !== 1 || value.trim() === "")
          diagnostics.push(bodyDiagnostic(artifact, "invalid-record", `Task ${record.number} requires visible nonempty ${label}`, record.line));
    }
    const notes = visibleFieldLines.flatMap((line, offset) => {
      const match = /^[ \t]*[-*][ \t]+Notes:[ \t]*(.*?)[ \t]*$/.exec(line);
      return match === null ? [] : [{ value: match[1] ?? "", line: record.line + offset }];
    });
    const dataNotes = notes.filter((entry) => entry.value.startsWith("{"));
    let inputContext: TaskInputContext | undefined;
    if (dataNotes.length > 1)
      diagnostics.push(bodyDiagnostic(artifact, "invalid-record", `Task ${record.number} has ambiguous versioned Notes entries`, dataNotes[1]?.line ?? record.line));
    else if (dataNotes[0]) {
      const parsed = parseTaskInputContext(artifact, record.number, dataNotes[0].value, digest, dataNotes[0].line);
      diagnostics.push(...parsed.diagnostics);
      inputContext = parsed.value;
    }
    const schedulingDigest = hashText(JSON.stringify({
      title: record.title ?? "",
      filesDeclared: parsedFiles.declared,
      files: parsedFiles.files,
      goal,
      acceptance,
      steps,
      verify,
      commit,
      notes: notes.filter((entry) => !entry.value.startsWith("{")).map((entry) => entry.value),
      inputContext: inputContext === undefined
        ? null
        : { ...inputContext, taskDefinition: "" },
    }));
    tasks.push({
      id: record.number,
      title: record.title ?? "",
      dependsOn: parsedDependencies.dependsOn,
      filesDeclared: parsedFiles.declared,
      files: parsedFiles.files,
      definitionDigest: digest,
      schedulingDigest,
      ...(dependencyMode && verify !== "" ? { verify } : {}),
      ...(goal === "" ? {} : { goal }),
      ...(acceptance.length === 0 ? {} : { acceptance }),
      ...(inputContext === undefined ? {} : { inputContext }),
      source,
    });
  }
  const allTasks: PlanTaskContract[] = tasks.map(({ source: _source, ...task }) => task);
  const activeTasks = allTasks.filter((task) => {
    const record = taskRecords.find((candidate) => candidate.number === task.id);
    return record !== undefined && !recordIsAbandoned(record);
  });
  const hasExecution = Object.hasOwn(artifact.metadata, "execution");
  let execution: PlanExecutionContract | undefined;
  if (isRecord(rawExecution)) {
    if (rawExecution.version === 1 && isPositiveTaskIdArray(rawExecution.order))
      execution = { version: 1, order: rawExecution.order };
    else if (rawExecution.version === 2 && rawExecution.mode === "dependencies")
      execution = { version: 2, mode: "dependencies" };
  }
  if (hasExecution && execution === undefined)
    diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Explicit execution metadata is malformed; legacy numeric order is not used", artifact.locations.metadata.startLine));
  const identityOrder = taskRecords.flatMap((record) => record.number === undefined ? [] : [record.number]);
  const activeTaskEdges = activeTasks.map((task) => ({ id: task.id, dependsOn: task.dependsOn }));
  let executionOrder: readonly number[];
  if (execution?.version === 1) executionOrder = execution.order;
  else if (hasExecution && execution === undefined) executionOrder = [];
  else executionOrder = activeTasks.map((task) => task.id);
  if (execution?.version === 1) {
    diagnostics.push(...executionSequenceProblems(
      activeTaskEdges,
      execution,
    ).map((message) => bodyDiagnostic(artifact, "invalid-record", message, artifact.locations.metadata.startLine)));
  } else if (execution?.version === 2) {
    diagnostics.push(...dependencyGraphProblems(activeTaskEdges).map((message) => bodyDiagnostic(artifact, "invalid-record", message, artifact.locations.metadata.startLine)));
  } else if (!hasExecution) {
    const legacy = { version: 1 as const, order: executionOrder };
    diagnostics.push(...executionSequenceProblems(
      activeTasks.map((task) => ({ id: task.id, dependsOn: task.dependsOn })),
      legacy,
    ).map((message) => bodyDiagnostic(artifact, "invalid-record", message, artifact.locations.metadata.startLine)));
  }
  const overviewStart = lines.findIndex((line) => /^##[ \t]+Overview[ \t]*$/.test(line));
  const overviewEnd =
    overviewStart < 0
      ? -1
      : lines.findIndex(
          (line, index) => index > overviewStart && /^##[ \t]+/.test(line),
        );
  const overview =
    overviewStart < 0
      ? []
      : lines.slice(overviewStart + 1, overviewEnd < 0 ? lines.length : overviewEnd);
  const overviewFields = new Map<string, string[]>();
  for (const line of visibleTaskFieldLines(overview)) {
    const match = /^[ \t]*-[ \t]+(Execution approval|Previous execution order|New execution order|Fully gated prefix|Fully gated tasks|Reason|Affected obligations|Input impact review|Input impact previous plan):[ \t]*(.+?)[ \t]*$/.exec(line);
    if (!match) continue;
    const values = overviewFields.get(match[1] ?? "") ?? [];
    values.push(match[2] ?? "");
    overviewFields.set(match[1] ?? "", values);
  }
  const overviewField = (label: string): string | undefined => {
    const values = overviewFields.get(label) ?? [];
    return values.length === 1 ? values[0] : undefined;
  };
  const rawTransition = artifact.metadata.execution_transition;
  let transition: PlanExecutionTransitionContract | undefined;
  if (
    isRecord(rawTransition) &&
    isFullSha(rawTransition.previousPlanCommit) &&
    typeof rawTransition.approval === "string" &&
    rawTransition.approval.trim() !== "" &&
    typeof rawTransition.reason === "string" &&
    rawTransition.reason.trim() !== "" &&
    typeof rawTransition.affected === "string" &&
    rawTransition.affected.trim() !== ""
  ) {
    if (
      rawTransition.version === 1 &&
      isPositiveTaskIdArray(rawTransition.previousOrder) &&
      isPositiveTaskIdArray(rawTransition.fullyGatedPrefix)
    )
      transition = {
        version: 1,
        previousPlanCommit: rawTransition.previousPlanCommit,
        previousOrder: rawTransition.previousOrder,
        fullyGatedPrefix: rawTransition.fullyGatedPrefix,
        approval: rawTransition.approval,
        reason: rawTransition.reason,
        affected: rawTransition.affected,
      };
    else if (
      rawTransition.version === 2 &&
      isPositiveTaskIdArray(rawTransition.fullyGatedTasks)
    )
      transition = {
        version: 2,
        previousPlanCommit: rawTransition.previousPlanCommit,
        fullyGatedTasks: rawTransition.fullyGatedTasks,
        approval: rawTransition.approval,
        reason: rawTransition.reason,
        affected: rawTransition.affected,
      };
  }
  const hasTransition = Object.hasOwn(artifact.metadata, "execution_transition");
  if (hasTransition && transition === undefined)
    diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Explicit execution transition metadata is malformed", artifact.locations.metadata.startLine));
  if (transition !== undefined) {
    if (["approved", "accepted", "yes", "true", "done"].includes(transition.approval.toLowerCase()))
      diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Execution approval must be an explicit reference, not a decision value", artifact.locations.metadata.startLine));
    const overviewApproval = overviewField("Execution approval");
    if (transition.version === 1) {
      if (execution?.version !== 1) {
        diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Serial execution transition requires version 1 execution metadata", artifact.locations.metadata.startLine));
      } else {
        diagnostics.push(...executionTransitionProblems(
          transition.previousOrder,
          execution.order,
          transition.fullyGatedPrefix,
        ).map((message) => bodyDiagnostic(artifact, "invalid-record", message, artifact.locations.metadata.startLine)));
      }
      const previousOrder = overviewField("Previous execution order");
      const nextOrder = overviewField("New execution order");
      const prefix = overviewField("Fully gated prefix");
      if (
        previousOrder !== transition.previousOrder.join(", ") ||
        nextOrder !== (execution?.version === 1 ? execution.order.join(", ") : undefined) ||
        prefix !== (transition.fullyGatedPrefix.length === 0 ? "none" : transition.fullyGatedPrefix.join(", ")) ||
        overviewApproval !== transition.approval ||
        overviewField("Reason") !== transition.reason ||
        overviewField("Affected obligations") !== transition.affected
      )
        diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Overview must record the execution transition reference, old/new orders, gated prefix, reason, and affected obligations", artifact.locations.body.startLine));
    } else {
      if (execution?.version !== 2) {
        diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Dependency scheduling transition requires version 2 dependency execution metadata", artifact.locations.metadata.startLine));
      } else {
        diagnostics.push(...dependencyTransitionProblems(
          activeTaskEdges,
          activeTaskEdges,
          transition.fullyGatedTasks,
        ).map((message) => bodyDiagnostic(artifact, "invalid-record", message, artifact.locations.metadata.startLine)));
      }
      const fullyGatedTasks = overviewField("Fully gated tasks");
      const expectedGatedTasks = transition.fullyGatedTasks.length === 0 ? "none" : transition.fullyGatedTasks.join(", ");
      if (
        fullyGatedTasks !== expectedGatedTasks ||
        overviewApproval !== transition.approval ||
        overviewField("Reason") !== transition.reason ||
        overviewField("Affected obligations") !== transition.affected
      )
        diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Overview must record the dependency scheduling transition reference, fully gated tasks, reason, and affected obligations", artifact.locations.body.startLine));
    }
  }
  const rawApprovals = artifact.metadata.intent_approvals;
  const intentApprovals: IntentApprovalReference[] = Array.isArray(rawApprovals)
    ? rawApprovals.filter((item): item is IntentApprovalReference =>
        isRecord(item) && typeof item.path === "string" && typeof item.reference === "string" && isFullSha(item.commit),
      )
    : [];
  const approvalPaths = new Set<string>();
  for (const approval of intentApprovals) {
    if (!safeRepositoryPath(approval.path) || !/^(proposal\.md|design\.md|requirements\/[A-Za-z0-9][A-Za-z0-9._-]*\.md)$/.test(approval.path))
      diagnostics.push(bodyDiagnostic(artifact, "invalid-record", `Intent approval path is outside formal change inputs: ${approval.path}`, artifact.locations.metadata.startLine));
    if (approvalPaths.has(approval.path))
      diagnostics.push(bodyDiagnostic(artifact, "invalid-record", `Intent approval path is repeated: ${approval.path}`, artifact.locations.metadata.startLine));
    approvalPaths.add(approval.path);
  }
  const rawImpact = artifact.metadata.input_impact;
  const inputImpact: PlanInputImpactContract | undefined =
    isRecord(rawImpact) &&
    rawImpact.version === 1 &&
    isFullSha(rawImpact.previousPlanCommit) &&
    typeof rawImpact.reviewReference === "string" &&
    rawImpact.reviewReference.trim() !== "" &&
    Array.isArray(rawImpact.changes) &&
    rawImpact.changes.every(
      (change) =>
        isRecord(change) &&
        typeof change.path === "string" &&
        (change.previousBlob === null || isFullSha(change.previousBlob)) &&
        (change.currentBlob === null || isFullSha(change.currentBlob)) &&
        Array.isArray(change.affectedTasks) &&
        change.affectedTasks.every((id) => Number.isInteger(id) && Number(id) > 0) &&
        Array.isArray(change.unaffectedTasks) &&
        change.unaffectedTasks.every((id) => Number.isInteger(id) && Number(id) > 0) &&
        Array.isArray(change.newTasks) &&
        change.newTasks.every((id) => Number.isInteger(id) && Number(id) > 0) &&
        typeof change.unresolvedIntent === "boolean" &&
        typeof change.rationale === "string" &&
        change.rationale.trim() !== "",
    )
      ? {
          version: 1,
          previousPlanCommit: rawImpact.previousPlanCommit,
          reviewReference: rawImpact.reviewReference,
          changes: rawImpact.changes as PlanInputImpactContract["changes"],
        }
      : undefined;
  if (Object.hasOwn(artifact.metadata, "input_impact") && inputImpact === undefined)
    diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Explicit input impact metadata is malformed", artifact.locations.metadata.startLine));
  if (inputImpact !== undefined) {
    const changedPaths = new Set<string>();
    for (const change of inputImpact.changes) {
      if (!safeRepositoryPath(change.path) || changedPaths.has(change.path) || change.previousBlob === change.currentBlob)
        diagnostics.push(bodyDiagnostic(artifact, "invalid-record", `Input impact path is unsafe, repeated, or unchanged: ${change.path}`, artifact.locations.metadata.startLine));
      changedPaths.add(change.path);
      const taskClasses = [...change.affectedTasks, ...change.unaffectedTasks, ...change.newTasks];
      if (new Set(taskClasses).size !== taskClasses.length)
        diagnostics.push(bodyDiagnostic(artifact, "invalid-record", `Input impact task classification overlaps for ${change.path}`, artifact.locations.metadata.startLine));
    }
    const impactReview = overviewField("Input impact review");
    const impactPrevious = overviewField("Input impact previous plan");
    if (
      impactReview !== inputImpact.reviewReference ||
      impactPrevious !== inputImpact.previousPlanCommit
    )
      diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Overview must record the input-impact review reference and previous plan revision", artifact.locations.body.startLine));
  }
  const hasInputImpact = Object.hasOwn(artifact.metadata, "input_impact");
  if (
    hasInputImpact &&
    inputImpact !== undefined &&
    inputImpact.changes.some((change) => change.unresolvedIntent)
  )
    diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Input impact contains unresolved intent and must return to its owner", artifact.locations.metadata.startLine));
  const rawLegacyConfirmations = artifact.metadata.legacy_input_confirmations;
  const legacyInputConfirmations: LegacyInputConfirmation[] = Array.isArray(rawLegacyConfirmations)
    ? rawLegacyConfirmations.filter(isLegacyInputConfirmation)
    : [];
  if (Object.hasOwn(artifact.metadata, "legacy_input_confirmations") && (
    !Array.isArray(rawLegacyConfirmations) ||
    legacyInputConfirmations.length !== rawLegacyConfirmations.length
  ))
    diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Legacy input confirmation metadata is malformed", artifact.locations.metadata.startLine));
  const confirmedTasks = new Set<number>();
  for (const confirmation of legacyInputConfirmations) {
    const task = tasks.find((entry) => entry.id === confirmation.task);
    const taskRecord = taskRecords.find((entry) => entry.number === confirmation.task);
    const inputPaths = new Set<string>();
    for (const input of confirmation.inputs) {
      if (!safeRepositoryPath(input.path) || inputPaths.has(input.path))
        diagnostics.push(bodyDiagnostic(artifact, "invalid-record", `Legacy input confirmation for Task ${confirmation.task} has an unsafe or repeated input path: ${input.path}`, artifact.locations.metadata.startLine));
      inputPaths.add(input.path);
    }
    if (confirmedTasks.has(confirmation.task))
      diagnostics.push(bodyDiagnostic(artifact, "invalid-record", `Legacy input confirmation repeats Task ${confirmation.task}`, artifact.locations.metadata.startLine));
    confirmedTasks.add(confirmation.task);
    if (!task || !taskRecord || recordIsAbandoned(taskRecord) || task.inputContext !== undefined)
      diagnostics.push(bodyDiagnostic(artifact, "invalid-record", `Legacy input confirmation for Task ${confirmation.task} requires an existing active task with missing input provenance`, artifact.locations.metadata.startLine));
    if (confirmation.owner.trim().toLowerCase() === confirmation.reviewer.trim().toLowerCase())
      diagnostics.push(bodyDiagnostic(artifact, "invalid-record", `Legacy input confirmation for Task ${confirmation.task} requires a distinct reviewer`, artifact.locations.metadata.startLine));
  }
  if (Object.hasOwn(artifact.metadata, "legacy_input_confirmations") && legacyInputConfirmations.length === 0)
    diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Legacy input confirmation metadata must contain at least one record", artifact.locations.metadata.startLine));
  const rawInitialization = artifact.metadata.initialization;
  const initialization: InitialScaffoldProof | undefined = isRecord(rawInitialization) && rawInitialization.version === 1 && isFullSha(rawInitialization.base) && typeof rawInitialization.authority === "string" && isSha256(rawInitialization.breakdown) && Array.isArray(rawInitialization.taskIds) && rawInitialization.taskIds.every((id) => Number.isInteger(id) && Number(id) > 0)
    ? {
        version: 1,
        base: rawInitialization.base,
        authority: rawInitialization.authority,
        breakdown: rawInitialization.breakdown,
        taskIds: rawInitialization.taskIds as number[],
      }
    : undefined;
  if (Object.hasOwn(artifact.metadata, "initialization") && initialization === undefined)
    diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Initial scaffold proof is malformed", artifact.locations.metadata.startLine));
  if (initialization !== undefined) {
    const hasContiguousInitialIds = initialization.taskIds.every(
      (id, index) => id === index + 1,
    );
    const currentInitialIds = identityOrder.slice(0, initialization.taskIds.length);
    if (
      !hasContiguousInitialIds ||
      currentInitialIds.length !== initialization.taskIds.length ||
      initialization.taskIds.some((id, index) => currentInitialIds[index] !== id)
    )
      diagnostics.push(bodyDiagnostic(artifact, "invalid-record", "Initial scaffold proof task IDs must match its contiguous initial task list", artifact.locations.metadata.startLine));
  }
  return {
    plan: { identityOrder, executionOrder, ...(execution ? { execution } : {}), ...(transition ? { executionTransition: transition } : {}), ...(inputImpact ? { inputImpact } : {}), legacyInputConfirmations, ...(initialization ? { initialization } : {}), intentApprovals, tasks: allTasks },
    diagnostics,
  };
};

export const critiqueDisposition = (
  verdict: unknown,
  decision: unknown,
): CritiqueDisposition => {
  if (verdict === "skipped") return "no-clearance";
  if (decision === "skipped") return "owner-decision-required";
  if (verdict === "changes-requested" && decision === "accepted")
    return "application-required";
  if (
    (verdict === "approved" && ["accepted", "applied", "rejected"].includes(String(decision))) ||
    (verdict === "changes-requested" && ["applied", "rejected"].includes(String(decision)))
  )
    return "settled";
  return "no-clearance";
};

export const validateArtifactBody = (
  artifact: RecognizedArtifact,
  kind: SupportedArtifact,
  taskProgressSnapshot: "current" | "historical" = "current",
): ArtifactBodyValidation => {
  const headings = readBodyHeadings(artifact);
  const contract = bodyContracts[kind];
  const diagnostics: ArtifactContractDiagnostic[] = [];
  const title = headings.find((heading) => heading.level === 1) ?? null;
  if (
    title === null ||
    (contract.heading !== "" && !title.text.startsWith(contract.heading))
  ) {
    diagnostics.push(
      bodyDiagnostic(
        artifact,
        "missing-heading",
        `Body is missing the # ${contract.heading || "artifact title"} heading`,
        title?.line ?? artifact.locations.body.startLine,
        contract.heading || "# title",
        title?.text,
      ),
    );
  }
  for (const section of contract.sections) {
    if (
      !headings.some(
        (heading) =>
          heading.text === section &&
          (kind === "route" ? heading.level === 2 : heading.level >= 2),
      )
    ) {
      diagnostics.push(
        bodyDiagnostic(
          artifact,
          "missing-section",
          `Body is missing the ## ${section} section`,
          artifact.locations.body.startLine,
          section,
        ),
      );
    }
  }
  if (
    kind === "requirements-change" &&
    !headings.some(
      (heading) =>
        heading.level >= 2 &&
        ["ADDED", "MODIFIED", "REMOVED", "RENAMED"].some(
          (operation) => heading.text === `${operation} Requirements`,
        ),
    )
  ) {
    diagnostics.push(
      bodyDiagnostic(
        artifact,
        "missing-section",
        "Body is missing a requirements delta section",
        artifact.locations.body.startLine,
        "ADDED | MODIFIED | REMOVED | RENAMED Requirements",
      ),
    );
  }
  const scope = validateScopeExpansions(kind === "task-progress" && Object.hasOwn(artifact.metadata, "scope_expansions") ? artifact.metadata.scope_expansions : []);
  if (scope.kind === "invalid")
    diagnostics.push(bodyDiagnostic(artifact, "invalid-value", scope.reason, artifact.locations.metadata.startLine));
  const allowEmptyTaskProgress = pendingTaskProgress(artifact, kind, title);
  const allowEmptyFinishOutcome: readonly GenericWorkflowRecordKind[] =
    kind === "finish" && pendingFinishIntent(artifact) ? ["outcome"] : [];
  const workflow =
    kind === "feedback" || kind === "review"
      ? readReviewWorkflow(artifact)
      : readWorkflow(
          artifact,
          contract.records ?? null,
          headings,
          allowEmptyTaskProgress,
          allowEmptyFinishOutcome,
          taskProgressSnapshot === "current",
        );
  diagnostics.push(...workflow.diagnostics);
  if (kind === "finish")
    diagnostics.push(
      ...finishWorkflowDiagnostics(artifact, workflow.state.records),
    );
  const finish = kind === "finish" ? parseFinishRecords(artifact, workflow.state.records, visibleMarkdownLines(artifact.body)) : undefined;
  if (finish) diagnostics.push(...finish.diagnostics);
  const workflowRecords = [...workflow.state.records];
  let plan: PlanContractProjection | undefined;
  let critique: CritiqueDisposition | undefined;
  if (contract.ledger) {
    const ledger = readTaskLedger(artifact, contract.ledger, headings);
    diagnostics.push(...ledger.diagnostics);
    workflowRecords.push(...ledger.records);
    if (
      kind === "progress" &&
      !progressLedgerMatches(artifact.metadata.tasks, ledger.records)
    )
      diagnostics.push(
        bodyDiagnostic(
          artifact,
          "invalid-record",
          "progress metadata ledger does not match",
          title?.line ?? artifact.locations.body.startLine,
        ),
      );
    if (kind === "plan") {
      const projection = readPlanProjection(artifact, headings, ledger.records);
      plan = projection.plan;
      diagnostics.push(...projection.diagnostics);
    }
  }
  if (kind === "critique")
    critique = critiqueDisposition(artifact.metadata.verdict, artifact.metadata.decision);
  return {
    headings,
    sections: headings
      .filter((heading) => heading.level === 2)
      .map((heading) => heading.text),
    workflow: {
      ...workflow.state,
      records: workflowRecords,
      ...(plan === undefined ? {} : { plan }),
      ...(finish === undefined ? {} : { finish: finish.records }),
      ...(kind === "task-progress" && Object.hasOwn(artifact.metadata, "scope_expansions") && scope.kind === "valid" ? { scopeExpansions: scope.entries } : {}),
      ...(critique === undefined ? {} : { critiqueDisposition: critique }),
    },
    diagnostics,
  };
};
