import { marked, type Token } from "marked";
import type { RecognizedArtifact } from "./artifact-reader.js";
import { visibleMarkdownLines } from "./artifact-body.js";
import { isFullTargetBranchReference } from "./git-reference.js";
import type {
  ArtifactContractDiagnostic,
  ArtifactContractDiagnosticCode,
  ReviewClearanceProvenance,
  ReviewFinding,
  ReviewFindingKind,
  ReviewFindingResolution,
  ReviewPassEvidence,
  ReviewPassParseResult,
  ReviewPassRecord,
  ReviewPassVerdict,
} from "./artifact-types.js";

interface ReviewHeading {
  readonly level: number;
  readonly text: string;
  readonly index: number;
  readonly line: number;
}

interface PassHeading {
  readonly heading: ReviewHeading;
  readonly endIndex: number;
  readonly number: number | null;
  readonly parsed: { readonly number: number; readonly date: string } | null;
}

type PassFieldName =
  | "Base"
  | "Head"
  | "Verdict"
  | "Scope"
  | "Target"
  | "Parent pass"
  | "Parent commit"
  | "Delta base"
  | "Resolutions";

interface FieldOccurrence {
  readonly name: PassFieldName;
  readonly value: string;
  readonly line: number;
}

const verdicts: readonly ReviewPassVerdict[] = [
  "approved",
  "approved-remediation",
  "changes-requested",
  "skipped",
];

const fields = ["Base", "Head", "Verdict"] as const;
const clearanceFields = [
  "Scope",
  "Target",
  "Parent pass",
  "Parent commit",
  "Delta base",
  "Resolutions",
] as const;

const fullCommit = (value: string): boolean => /^[0-9a-f]{40}$/.test(value);

const positiveNumber = (value: string): number | undefined => {
  if (!/^[1-9][0-9]*$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
};

const lineAtOffset = (source: string, offset: number): number =>
  source.slice(0, offset).split(/\r\n|\n|\r/).length;

const bodyLine = (artifact: RecognizedArtifact, index: number): number =>
  artifact.locations.body.startLine + index;

const visibleBody = (body: string): string => {
  let visible = body.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\r\n]/g, " "),
  );
  visible = visible.replace(/<!--?[\s\S]*$/g, (comment) =>
    comment.replace(/[^\r\n]/g, " "),
  );
  return visible;
};

const markdownHeadings = (source: string): readonly {
  readonly level: number;
  readonly text: string;
  readonly offset: number;
}[] => {
  const headings: Array<{
    readonly level: number;
    readonly text: string;
    readonly offset: number;
  }> = [];
  let offset = 0;
  let tokens: readonly Token[];
  try {
    tokens = marked.lexer(source);
  } catch {
    return headings;
  }
  for (const token of tokens) {
    const raw = "raw" in token && typeof token.raw === "string" ? token.raw : "";
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

const readHeadings = (artifact: RecognizedArtifact): readonly ReviewHeading[] => {
  const source = visibleBody(artifact.body).replace(/\r\n|\r/g, "\n");
  return markdownHeadings(source).map((heading) => {
    const line = lineAtOffset(source, heading.offset);
    return {
      ...heading,
      index: line - 1,
      line: bodyLine(artifact, line - 1),
    };
  });
};

const diagnostic = (
  artifact: RecognizedArtifact,
  code: ArtifactContractDiagnosticCode,
  message: string,
  line: number,
  options: {
    readonly field?: string;
    readonly expected?: string;
    readonly actual?: unknown;
    readonly actualPresent?: boolean;
  } = {},
): ArtifactContractDiagnostic => ({
  _tag: "ArtifactContractDiagnostic",
  code,
  message,
  sourcePath: artifact.sourcePath,
  ...(options.field === undefined ? {} : { field: options.field }),
  ...(options.expected === undefined ? {} : { expected: options.expected }),
  ...(options.actualPresent === true && options.actual !== undefined
    ? { actual: options.actual }
    : {}),
  location: { line },
});

const passHeadingNumber = (text: string): number | null => {
  const match = /^Pass ([1-9][0-9]*)\b/.exec(text);
  if (match === null) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) ? number : null;
};

const parsedPassHeading = (
  text: string,
): { readonly number: number; readonly date: string } | null => {
  const match = /^Pass ([1-9][0-9]*) — ([0-9]{4}-[0-9]{2}-[0-9]{2})$/.exec(
    text,
  );
  if (match === null) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number)
    ? { number, date: match[2] ?? "" }
    : null;
};

const passHeadings = (
  headings: readonly ReviewHeading[],
  lineCount: number,
): readonly PassHeading[] => {
  const levelTwo = headings.filter((heading) => heading.level === 2);
  return levelTwo
    .filter((heading) => heading.text.startsWith("Pass "))
    .map((heading) => ({
      heading,
      endIndex:
        levelTwo.find((candidate) => candidate.index > heading.index)?.index ??
        lineCount,
      number: passHeadingNumber(heading.text),
      parsed: parsedPassHeading(heading.text),
    }));
};

const fieldPattern = /^[ \t]*(Base|Head|Verdict|Scope|Target|Parent pass|Parent commit|Delta base|Resolutions):[ \t]*(.*)$/;

const fieldOccurrences = (
  lines: readonly string[],
  startIndex: number,
  endIndex: number,
  artifact: RecognizedArtifact,
): readonly FieldOccurrence[] => {
  const occurrences: FieldOccurrence[] = [];
  for (let index = startIndex; index < endIndex; index += 1) {
    const match = fieldPattern.exec(lines[index] ?? "");
    if (match === null) continue;
    occurrences.push({
      name: match[1] as FieldOccurrence["name"],
      value: match[2]?.trim() ?? "",
      line: bodyLine(artifact, index),
    });
  }
  return occurrences;
};

const isPassHeading = (heading: ReviewHeading): boolean =>
  heading.text.startsWith("Pass ");

const commentedPassDiagnostics = (
  artifact: RecognizedArtifact,
): readonly ArtifactContractDiagnostic[] => {
  const diagnostics: ArtifactContractDiagnostic[] = [];
  const comments = /<!--[\s\S]*?-->/g;
  let match: RegExpExecArray | null;
  while ((match = comments.exec(artifact.body)) !== null) {
    const inner = match[0].replace(/^<!--/, "").replace(/-->$/, "");
    const normalized = inner.replace(/\r\n|\r/g, "\n");
    const commentLine = lineAtOffset(artifact.body, match.index) - 1;
    for (const heading of markdownHeadings(normalized)) {
      if (heading.text.startsWith("Pass "))
        diagnostics.push(
          diagnostic(
            artifact,
            "invalid-record",
            "Pass records cannot be declared in HTML comments",
            bodyLine(artifact, commentLine),
            {
              expected: "## Pass N — YYYY-MM-DD",
              actual: heading.text,
            },
          ),
        );
    }
  }
  return diagnostics;
};

const fieldDiagnostic = (
  artifact: RecognizedArtifact,
  occurrence: FieldOccurrence,
): ArtifactContractDiagnostic =>
  diagnostic(
    artifact,
    "invalid-record",
    `${occurrence.name} must appear exactly once before child sections`,
    occurrence.line,
    {
      field: occurrence.name,
      expected: "Base, Head, Verdict, then optional clearance provenance",
      actual: occurrence.value,
      actualPresent: true,
    },
  );

const sectionDiagnostic = (
  artifact: RecognizedArtifact,
  code: ArtifactContractDiagnosticCode,
  message: string,
  line: number,
  expected?: string,
  actual?: unknown,
): ArtifactContractDiagnostic =>
  diagnostic(artifact, code, message, line, {
    expected,
    actual,
    actualPresent: actual !== undefined,
  });

const findingIsValid = (value: string): boolean => {
  const match = /^\[(.+)\] (.+)$/.exec(value);
  if (match === null) return false;
  const locations = match[1] ?? "";
  const action = match[2] ?? "";
  if (
    locations.includes("<") ||
    locations.includes(">") ||
    action.includes("<") ||
    action.includes(">")
  )
    return false;
  if (action.replace(/[\s\p{P}]/gu, "").toLowerCase() === "tbd") return false;
  return locations.split(";").every((location) => {
    const separator = location.indexOf(":");
    return separator > 0 && location.slice(separator + 1).trim() !== "";
  });
};

const sectionValues = (
  artifact: RecognizedArtifact,
  lines: readonly string[],
  headings: readonly ReviewHeading[],
  heading: ReviewHeading | undefined,
  endIndex: number,
  name: "Blocking" | "Suggestions",
): { readonly values: readonly string[]; readonly diagnostics: readonly ArtifactContractDiagnostic[] } => {
  if (heading === undefined)
    return {
      values: [],
      diagnostics: [
        sectionDiagnostic(
          artifact,
          "missing-section",
          `Pass must declare a ### ${name} section`,
          bodyLine(artifact, endIndex),
          `### ${name}`,
        ),
      ],
    };
  const nextHeading = headings.find(
    (candidate) => candidate.index > heading.index,
  );
  const sectionEnd = nextHeading?.index ?? endIndex;
  const entries = lines
    .slice(heading.index + 1, sectionEnd)
    .map((line, index) => ({ line: line.trim(), index: heading.index + 1 + index }))
    .filter((entry) => entry.line !== "");
  const diagnostics: ArtifactContractDiagnostic[] = [];
  const values: string[] = [];
  for (const entry of entries) {
    if (!entry.line.startsWith("- ") || entry.line.slice(2).trim() === "") {
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "invalid-value",
          `${name} entries must be non-empty list items`,
          bodyLine(artifact, entry.index),
          "- text",
          entry.line,
        ),
      );
      continue;
    }
    values.push(entry.line.slice(2).trim());
  }
  if (values.includes("None.") && values.length !== 1)
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-value",
        `${name} cannot combine None. with findings`,
        heading.line,
        "- None. or findings",
        values,
      ),
    );
  return { values, diagnostics };
};

type PassMode = "structural" | "per-pass" | "legacy-global";

type ReviewHistoryState =
  | { readonly kind: "legacy-only"; readonly lastIndex: number }
  | { readonly kind: "transitioned"; readonly firstFieldfulIndex: number }
  | { readonly kind: "modern" }
  | {
      readonly kind: "invalid";
      readonly firstFieldfulIndex: number;
    };

interface PassFields {
  readonly spanHeadings: readonly ReviewHeading[];
  readonly beforeFields: readonly FieldOccurrence[];
  readonly afterFields: readonly FieldOccurrence[];
}

interface GlobalEvidence {
  readonly base: string;
  readonly head: string;
  readonly verdict: ReviewPassVerdict;
}

const passFields = (
  artifact: RecognizedArtifact,
  lines: readonly string[],
  headings: readonly ReviewHeading[],
  candidate: PassHeading,
): PassFields => {
  const spanHeadings = headings.filter(
    (heading) =>
      heading.index > candidate.heading.index &&
      heading.index < candidate.endIndex &&
      heading.level !== 2,
  );
  const firstChildIndex = spanHeadings.at(0)?.index ?? candidate.endIndex;
  return {
    spanHeadings,
    beforeFields: fieldOccurrences(
      lines,
      candidate.heading.index + 1,
      firstChildIndex,
      artifact,
    ),
    afterFields: fieldOccurrences(
      lines,
      firstChildIndex,
      candidate.endIndex,
      artifact,
    ),
  };
};

const completePassFields = (occurrences: readonly FieldOccurrence[]): boolean =>
  occurrences.length >= fields.length &&
  fields.every((name, index) => occurrences[index]?.name === name);

const orderedPassFields = (occurrences: readonly FieldOccurrence[]): boolean => {
  if (!completePassFields(occurrences)) return false;
  const optional = occurrences.slice(fields.length).map((field) => field.name);
  const expected = clearanceFields.filter((field) => optional.includes(field));
  return optional.length === expected.length && optional.every((field, index) => field === expected[index]);
};

const parseResolutions = (value: string): readonly ReviewFindingResolution[] | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const seen = new Set<string>();
  const resolutions: ReviewFindingResolution[] = [];
  for (const entry of parsed) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const record = entry as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== "evidence,finding,verification") return undefined;
    if (
      typeof record.finding !== "string" ||
      !/^pass-[1-9][0-9]*-blocking-[1-9][0-9]*$/.test(record.finding) ||
      seen.has(record.finding) ||
      !Array.isArray(record.evidence) ||
      record.evidence.length === 0 ||
      !record.evidence.every((item) => typeof item === "string" && item.trim() !== "") ||
      typeof record.verification !== "string" ||
      record.verification.trim() === ""
    ) return undefined;
    seen.add(record.finding);
    resolutions.push({
      finding: record.finding,
      evidence: record.evidence as string[],
      verification: record.verification,
    });
  }
  return resolutions;
};

const parseFinding = (
  value: string,
  passNumber: number,
  ordinal: number,
): ReviewFinding | undefined => {
  const match = /^\[(.+)\] (.+)$/.exec(value);
  if (match === null) return undefined;
  const action = match[2] ?? "";
  const idMatches = [...action.matchAll(/(?:^|;\s*)id:\s*([^;]+)/g)];
  const kindMatches = [...action.matchAll(/(?:^|;\s*)kind:\s*([^;]+)/g)];
  if (idMatches.length > 1 || kindMatches.length > 1) return undefined;
  const idValue = idMatches[0]?.[1]?.trim();
  const kindValue = kindMatches[0]?.[1]?.trim();
  if (idValue !== undefined && !/^pass-[1-9][0-9]*-blocking-[1-9][0-9]*$/.test(idValue)) return undefined;
  if (kindValue !== undefined && !/^(code-defect|evidence-gap|intent-defect)$/.test(kindValue)) return undefined;
  const id = idValue ?? `pass-${passNumber}-blocking-${ordinal}`;
  const kind = kindValue as ReviewFindingKind | undefined;
  return { id, ...(kind === undefined ? {} : { kind }), text: value };
};

const reviewHistoryState = (
  globalCount: number,
  fieldShapes: readonly ("fieldless" | "explicit" | "partial")[],
  passCount: number,
): ReviewHistoryState => {
  const firstFieldfulIndex = fieldShapes.findIndex(
    (shape) => shape !== "fieldless",
  );
  if (globalCount === 3 && firstFieldfulIndex === -1)
    return { kind: "legacy-only", lastIndex: passCount - 1 };
  if (globalCount === 0 && firstFieldfulIndex === 0)
    return { kind: "modern" };
  if (globalCount === 0 && firstFieldfulIndex > 0)
    return { kind: "transitioned", firstFieldfulIndex };
  return { kind: "invalid", firstFieldfulIndex };
};

const passMode = (
  state: ReviewHistoryState,
  index: number,
): PassMode => {
  if (state.kind === "legacy-only")
    return index === state.lastIndex ? "legacy-global" : "structural";
  if (state.kind === "transitioned")
    return index < state.firstFieldfulIndex ? "structural" : "per-pass";
  if (state.kind === "modern") return "per-pass";
  return state.firstFieldfulIndex !== -1 && index >= state.firstFieldfulIndex
    ? "per-pass"
    : "structural";
};

const parseGlobalEvidence = (
  artifact: RecognizedArtifact,
): { readonly evidence?: GlobalEvidence; readonly diagnostics: readonly ArtifactContractDiagnostic[] } => {
  const diagnostics: ArtifactContractDiagnostic[] = [];
  const globalBase = artifact.metadata.base;
  const globalHead = artifact.metadata.head;
  const globalVerdict = artifact.metadata.verdict;
  let base: string | undefined;
  let head: string | undefined;
  let verdict: ReviewPassVerdict | undefined;
  if (typeof globalBase !== "string" || !fullCommit(globalBase))
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-value",
        "Global base must be a full lowercase commit identifier",
        artifact.locations.metadata.startLine,
        "40 hexadecimal characters",
        globalBase,
      ),
    );
  else base = globalBase;
  if (typeof globalHead !== "string" || !fullCommit(globalHead))
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-value",
        "Global head must be a full lowercase commit identifier",
        artifact.locations.metadata.startLine,
        "40 hexadecimal characters",
        globalHead,
      ),
    );
  else head = globalHead;
  if (
    typeof globalVerdict !== "string" ||
    !verdicts.includes(globalVerdict as ReviewPassVerdict)
  )
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-value",
        "Global verdict is not allowed",
        artifact.locations.metadata.startLine,
        verdicts.join(" | "),
        globalVerdict,
      ),
    );
  else verdict = globalVerdict as ReviewPassVerdict;
  if (base === undefined || head === undefined || verdict === undefined)
    return { diagnostics };
  return { evidence: { base, head, verdict }, diagnostics };
};

const parsePass = (
  artifact: RecognizedArtifact,
  lines: readonly string[],
  headings: readonly ReviewHeading[],
  candidate: PassHeading,
  mode: PassMode,
  globalEvidence: GlobalEvidence | undefined,
): { readonly record?: ReviewPassRecord; readonly diagnostics: readonly ArtifactContractDiagnostic[] } => {
  const diagnostics: ArtifactContractDiagnostic[] = [];
  if (candidate.parsed === null) {
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-record",
        "Malformed pass record",
        candidate.heading.line,
        "## Pass N — YYYY-MM-DD",
        candidate.heading.text,
      ),
    );
    return { diagnostics };
  }
  const fieldsInPass = passFields(artifact, lines, headings, candidate);
  const { spanHeadings, beforeFields, afterFields } = fieldsInPass;
  const firstChildIndex = spanHeadings.at(0)?.index ?? candidate.endIndex;
  for (const heading of spanHeadings) {
    if (
      heading.level !== 3 ||
      (heading.text !== "Blocking" && heading.text !== "Suggestions")
    )
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "invalid-record",
          "Pass records may only declare Blocking and Suggestions child sections",
          heading.line,
          "### Blocking | ### Suggestions",
          heading.text,
        ),
      );
  }
  const childHeadings = spanHeadings.filter((heading) => heading.level === 3);
  const blockingHeadings = childHeadings.filter(
    (heading) => heading.text === "Blocking",
  );
  const suggestionHeadings = childHeadings.filter(
    (heading) => heading.text === "Suggestions",
  );
  if (blockingHeadings.length > 1)
    for (const heading of blockingHeadings.slice(1))
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "invalid-record",
          "Pass may declare only one Blocking section",
          heading.line,
          "### Blocking",
          heading.text,
        ),
      );
  if (suggestionHeadings.length > 1)
    for (const heading of suggestionHeadings.slice(1))
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "invalid-record",
          "Pass may declare only one Suggestions section",
          heading.line,
          "### Suggestions",
          heading.text,
        ),
      );
  for (const occurrence of afterFields)
    diagnostics.push(fieldDiagnostic(artifact, occurrence));
  for (let index = candidate.heading.index + 1; index < firstChildIndex; index += 1) {
    if (fieldPattern.test(lines[index] ?? "")) continue;
    if ((lines[index] ?? "").trim() !== "")
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "invalid-record",
          "Pass provenance must appear before child sections",
          bodyLine(artifact, index),
          "Base, Head, Verdict",
          (lines[index] ?? "").trim(),
        ),
      );
  }
  const counts = new Map<string, number>();
  for (const occurrence of beforeFields)
    counts.set(occurrence.name, (counts.get(occurrence.name) ?? 0) + 1);
  if (mode === "per-pass") {
    for (const name of fields) {
      const count = counts.get(name) ?? 0;
      if (count === 0)
        diagnostics.push(
          sectionDiagnostic(
            artifact,
            "missing-section",
            `Pass must declare exactly one ${name} field before child sections`,
            candidate.heading.line,
            `${name}: <value>`,
          ),
        );
      if (count > 1) {
        const occurrences = beforeFields.filter(
          (field) => field.name === name,
        );
        for (const occurrence of occurrences.slice(1))
          diagnostics.push(fieldDiagnostic(artifact, occurrence));
      }
    }
    if (fields.every((name) => (counts.get(name) ?? 0) === 1) && !orderedPassFields(beforeFields))
      for (const occurrence of beforeFields)
        diagnostics.push(fieldDiagnostic(artifact, occurrence));
    for (const name of clearanceFields) {
      if ((counts.get(name) ?? 0) > 1)
        for (const occurrence of beforeFields.filter((field) => field.name === name).slice(1))
          diagnostics.push(fieldDiagnostic(artifact, occurrence));
    }
  } else if (beforeFields.length > 0) {
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-record",
        "Structural legacy passes cannot declare pass-local provenance",
        candidate.heading.line,
        "no Base, Head, or Verdict fields",
        beforeFields.map((field) => field.name),
      ),
    );
  }
  const blockingHeading = blockingHeadings[0];
  const suggestionsHeading = suggestionHeadings[0];
  if (
    blockingHeading !== undefined &&
    suggestionsHeading !== undefined &&
    blockingHeading.index > suggestionsHeading.index
  )
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-record",
        "Blocking must appear before Suggestions",
        suggestionsHeading.line,
        "### Blocking followed by ### Suggestions",
        suggestionsHeading.text,
      ),
    );
  const blocking = sectionValues(
    artifact,
    lines,
    spanHeadings,
    blockingHeading,
    candidate.endIndex,
    "Blocking",
  );
  const suggestions = sectionValues(
    artifact,
    lines,
    spanHeadings,
    suggestionsHeading,
    candidate.endIndex,
    "Suggestions",
  );
  diagnostics.push(...blocking.diagnostics, ...suggestions.diagnostics);
  const structural: ReviewPassRecord = {
    provenance: "structural",
    number: candidate.parsed.number,
    date: candidate.parsed.date,
    blocking:
      blocking.values.length === 1 && blocking.values[0] === "None."
        ? []
        : blocking.values,
    suggestions:
      suggestions.values.length === 1 && suggestions.values[0] === "None."
        ? []
        : suggestions.values,
    line: candidate.heading.line,
  };
  if (mode === "structural") return { record: structural, diagnostics };
  let base: string | undefined;
  let head: string | undefined;
  let verdict: ReviewPassVerdict | undefined;
  if (mode === "legacy-global") {
    if (globalEvidence === undefined) return { record: structural, diagnostics };
    base = globalEvidence.base;
    head = globalEvidence.head;
    verdict = globalEvidence.verdict;
  } else {
    const valueByName = new Map(
      beforeFields.map((occurrence) => [occurrence.name, occurrence.value]),
    );
    const baseValue = valueByName.get("Base");
    const headValue = valueByName.get("Head");
    const verdictValue = valueByName.get("Verdict");
    if (baseValue !== undefined) {
      if (!fullCommit(baseValue))
        diagnostics.push(
          sectionDiagnostic(
            artifact,
            "invalid-value",
            "Base must be a full lowercase commit identifier",
            beforeFields.find((field) => field.name === "Base")?.line ??
              candidate.heading.line,
            "40 hexadecimal characters",
            baseValue,
          ),
        );
      else base = baseValue;
    }
    if (headValue !== undefined) {
      if (!fullCommit(headValue))
        diagnostics.push(
          sectionDiagnostic(
            artifact,
            "invalid-value",
            "Head must be a full lowercase commit identifier",
            beforeFields.find((field) => field.name === "Head")?.line ??
              candidate.heading.line,
            "40 hexadecimal characters",
            headValue,
          ),
        );
      else head = headValue;
    }
    if (verdictValue !== undefined) {
      if (!verdicts.includes(verdictValue as ReviewPassVerdict))
        diagnostics.push(
          sectionDiagnostic(
            artifact,
            "invalid-value",
            "Verdict is not allowed",
            beforeFields.find((field) => field.name === "Verdict")?.line ??
              candidate.heading.line,
            verdicts.join(" | "),
            verdictValue,
          ),
        );
      else verdict = verdictValue as ReviewPassVerdict;
    }
  }
  if (base === undefined || head === undefined || verdict === undefined)
    return { diagnostics };
  const blockingIsNone =
    blocking.values.length === 0 ||
    (blocking.values.length === 1 && blocking.values[0] === "None.");
  if (verdict === "approved" && !blockingIsNone)
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-value",
        "Approved passes cannot contain blocking findings",
        blockingHeading?.line ?? candidate.heading.line,
        "- None.",
        blocking.values,
      ),
    );
  if (verdict === "changes-requested" && blockingIsNone)
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-value",
        "Changes-requested passes must contain a blocking finding",
        blockingHeading?.line ?? candidate.heading.line,
        "blocking finding",
        blocking.values,
      ),
    );
  if (
    blocking.values.length > 0 &&
    blocking.values[0] !== "None." &&
    !blocking.values.every((value) => findingIsValid(value))
  )
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-value",
        "Blocking findings must identify a location and action",
        blockingHeading?.line ?? candidate.heading.line,
        "[path:line] action",
        blocking.values,
      ),
    );
  const valueByName = new Map(
    beforeFields.map((occurrence) => [occurrence.name, occurrence.value]),
  );
  const scopeValue = valueByName.get("Scope");
  const hasClearanceFields = clearanceFields.some((name) => valueByName.has(name));
  let clearance: ReviewClearanceProvenance | undefined;
  if (mode === "per-pass" && scopeValue === undefined && hasClearanceFields)
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-record",
        "Review clearance provenance requires Scope",
        candidate.heading.line,
        "Scope: full or Scope: remediation",
      ),
    );
  if (mode === "per-pass" && scopeValue !== undefined) {
    const target = valueByName.get("Target");
    if (!isFullTargetBranchReference(target ?? ""))
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "invalid-value",
          "Target must be an explicit full branch reference",
          beforeFields.find((field) => field.name === "Target")?.line ?? candidate.heading.line,
          "refs/heads/<branch> or refs/remotes/<remote>/<branch>",
          target,
        ),
      );
    if (scopeValue === "full") {
      if (clearanceFields.slice(2).some((name) => valueByName.has(name)))
        diagnostics.push(
          sectionDiagnostic(
            artifact,
            "invalid-record",
            "Full review provenance cannot contain remediation fields",
            candidate.heading.line,
            "Scope, Target",
          ),
        );
      if (isFullTargetBranchReference(target ?? "")) clearance = { scope: "full", target: target! };
    } else if (scopeValue === "remediation") {
      const parentPassValue = valueByName.get("Parent pass");
      const parentCommit = valueByName.get("Parent commit");
      const deltaBase = valueByName.get("Delta base");
      const resolutionsValue = valueByName.get("Resolutions");
      const parentPass = parentPassValue === undefined ? undefined : positiveNumber(parentPassValue);
      const resolutions = resolutionsValue === undefined ? undefined : parseResolutions(resolutionsValue);
      if (
        parentPass === undefined ||
        !fullCommit(parentCommit ?? "") ||
        !fullCommit(deltaBase ?? "") ||
        resolutions === undefined ||
        !isFullTargetBranchReference(target ?? "")
      )
        diagnostics.push(
          sectionDiagnostic(
            artifact,
            "invalid-value",
            "Remediation clearance requires a full baseline, delta base, target, and valid resolutions array",
            candidate.heading.line,
            "Scope, Target, Parent pass, Parent commit, Delta base, Resolutions",
          ),
        );
      else
        clearance = {
          scope: "remediation",
          target: target!,
          parentPass,
          parentCommit: parentCommit!,
          deltaBase: deltaBase!,
          resolutions,
        };
    } else {
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "invalid-value",
          "Scope must be full or remediation",
          beforeFields.find((field) => field.name === "Scope")?.line ?? candidate.heading.line,
          "full | remediation",
          scopeValue,
        ),
      );
    }
  }
  if (verdict === "approved-remediation") {
    if (artifact.metadata.artifact !== "review")
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "invalid-value",
          "approved-remediation is only valid for root whole-branch review",
          candidate.heading.line,
          "root review artifact",
          artifact.metadata.artifact,
        ),
      );
    if (clearance?.scope !== "remediation")
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "invalid-value",
          "approved-remediation requires remediation scope provenance",
          candidate.heading.line,
          "Scope: remediation",
        ),
      );
    if (!blockingIsNone)
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "invalid-value",
          "Approved remediation passes cannot contain blocking findings",
          blockingHeading?.line ?? candidate.heading.line,
          "- None.",
          blocking.values,
        ),
      );
  }
  if (scopeValue === "remediation" && verdict === "approved")
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-value",
        "Remediation scope must use the approved-remediation or changes-requested verdict",
        candidate.heading.line,
        "approved-remediation | changes-requested | skipped",
        verdict,
      ),
    );
  const passNumber = candidate.parsed.number;
  const findings = blocking.values.flatMap((value, index) => {
    if (value === "None.") return [];
    const finding = parseFinding(value, passNumber, index + 1);
    if (finding === undefined)
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "invalid-value",
          "Blocking finding identity or kind is malformed",
          blockingHeading?.line ?? candidate.heading.line,
          "[path:line] id: pass-N-blocking-M; kind: code-defect | evidence-gap | intent-defect; description",
          value,
        ),
      );
    return finding === undefined ? [] : [finding];
  });
  if (new Set(findings.map((finding) => finding.id)).size !== findings.length)
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-value",
        "Blocking findings must have unique identities within a pass",
        blockingHeading?.line ?? candidate.heading.line,
      ),
    );
  if (diagnostics.length > 0) return { diagnostics };
  return {
    record: {
      ...structural,
      provenance: mode === "legacy-global" ? "legacy-global" : "per-pass",
      base,
      head,
      verdict,
      findings,
      ...(clearance === undefined ? {} : { clearance }),
    },
    diagnostics,
  };
};

const globalFieldPresence = (artifact: RecognizedArtifact): number =>
  ["base", "head", "verdict"].filter((field) =>
    Object.hasOwn(artifact.metadata, field),
  ).length;

export const parseReviewPasses = (
  artifact: RecognizedArtifact,
): ReviewPassParseResult => {
  const headings = readHeadings(artifact);
  const lines = visibleMarkdownLines(artifact.body);
  const candidates = passHeadings(headings, lines.length);
  const diagnostics: ArtifactContractDiagnostic[] = [
    ...commentedPassDiagnostics(artifact),
  ];
  for (const heading of headings.filter(isPassHeading))
    if (heading.level !== 2)
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "invalid-record",
          "Pass records must use level 2 headings",
          heading.line,
          "## Pass N — YYYY-MM-DD",
          heading.text,
        ),
      );
  for (const heading of headings.filter(
    (candidate) => candidate.level === 2 && !isPassHeading(candidate),
  ))
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-record",
        "Review bodies may only declare level 2 Pass headings",
        heading.line,
        "## Pass N — YYYY-MM-DD",
        heading.text,
      ),
    );
  if (candidates.length === 0)
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "missing-section",
        "Body must declare at least one Pass record",
        artifact.locations.body.startLine,
        "## Pass N — YYYY-MM-DD",
      ),
    );
  const numbered = candidates.flatMap((candidate) =>
    candidate.parsed === null ? [] : [candidate],
  );
  for (let index = 0; index < numbered.length; index += 1) {
    const expected = index + 1;
    const actual = numbered[index]?.parsed?.number;
    if (actual !== expected) {
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "non-monotonic-record",
          "Pass numbering must be append-only and contiguous",
          numbered[index]?.heading.line ?? artifact.locations.body.startLine,
          String(expected),
          actual,
        ),
      );
      break;
    }
  }
  const lastLevelTwo = headings.filter((heading) => heading.level === 2).at(-1);
  const lastPass = candidates.at(-1);
  if (lastPass !== undefined && lastLevelTwo?.index !== lastPass.heading.index)
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-record",
        "The latest pass must be the physical last pass",
        lastLevelTwo?.line ?? lastPass.heading.line,
        "physical last pass",
        lastLevelTwo?.text,
      ),
    );
  const fieldStates = candidates.map((candidate) =>
    passFields(artifact, lines, headings, candidate),
  );
  const fieldShapes = fieldStates.map((state) =>
    state.beforeFields.length === 0
      ? "fieldless"
      : completePassFields(state.beforeFields)
        ? "explicit"
        : "partial",
  );
  const globalCount = globalFieldPresence(artifact);
  const historyState = reviewHistoryState(
    globalCount,
    fieldShapes,
    candidates.length,
  );
  const hasFieldful =
    historyState.kind === "modern" ||
    historyState.kind === "transitioned" ||
    (historyState.kind === "invalid" &&
      historyState.firstFieldfulIndex !== -1);
  if (globalCount > 0 && globalCount < 3)
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-record",
        "Global review provenance must contain Base, Head, and Verdict together",
        artifact.locations.metadata.startLine,
        "Base, Head, and Verdict",
      ),
    );
  if (globalCount === 3 && hasFieldful)
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-record",
        "Global review provenance cannot be combined with an explicit pass suffix",
        artifact.locations.metadata.startLine,
        "global-only or no global provenance",
      ),
    );
  if (globalCount === 0 && !hasFieldful && candidates.length > 0)
    diagnostics.push(
      sectionDiagnostic(
        artifact,
        "invalid-record",
        "Fieldless review history must declare global Base, Head, and Verdict provenance",
        artifact.locations.metadata.startLine,
        "Base, Head, and Verdict",
      ),
    );
  const globalResult =
    globalCount === 3
      ? parseGlobalEvidence(artifact)
      : { diagnostics: [] as readonly ArtifactContractDiagnostic[] };
  diagnostics.push(...globalResult.diagnostics);
  const passes: ReviewPassRecord[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate === undefined) continue;
    const parsed = parsePass(
      artifact,
      lines,
      headings,
      candidate,
      passMode(historyState, index),
      globalResult.evidence,
    );
    diagnostics.push(...parsed.diagnostics);
    if (parsed.record !== undefined) passes.push(parsed.record);
  }
  const findingIdentityByText = new Map<string, string>();
  const firstPassForFindingId = new Map<string, number>();
  const stablePasses: ReviewPassRecord[] = passes.map((record) => {
    const originalFindings = record.provenance === "structural"
      ? record.blocking.map((value, index) => parseFinding(value, record.number, index + 1))
      : record.findings;
    const findings = originalFindings.flatMap((finding, index) => {
      if (finding === undefined) return [];
      const location = /^\[[^\]]+\]/.exec(finding.text)?.[0] ?? "";
      const action = finding.text.slice(location.length).trim();
      const explicit = /(?:^|;\s*)id:\s*(pass-[1-9][0-9]*-blocking-[1-9][0-9]*)(?=;|$)/.exec(action)?.[1];
      const fingerprint = `${location} ${action
        .split(";")
        .map((part) => part.trim())
        .filter((part) => !/^(?:id|kind):/.test(part))
        .join("; ")}`.trim();
      const existingIdentity = findingIdentityByText.get(fingerprint);
      const id = explicit ?? existingIdentity ?? finding.id;
      const firstPass = firstPassForFindingId.get(id);
      if (explicit !== undefined && firstPass === undefined && explicit !== `pass-${record.number}-blocking-${index + 1}`)
        diagnostics.push(
          sectionDiagnostic(
            artifact,
            "invalid-record",
            "A new finding identity must name its first physical pass and blocking position",
            record.line,
            `pass-${record.number}-blocking-${index + 1}`,
            explicit,
          ),
        );
      if (existingIdentity !== undefined && explicit !== undefined && existingIdentity !== explicit)
        diagnostics.push(
          sectionDiagnostic(
            artifact,
            "invalid-record",
            "A carried finding must retain its first-occurrence identity",
            record.line,
            existingIdentity,
            explicit,
          ),
        );
      if (firstPass === undefined) firstPassForFindingId.set(id, record.number);
      if (existingIdentity === undefined) findingIdentityByText.set(fingerprint, id);
      return [{ ...finding, id }];
    });
    if (record.provenance === "structural") return record;
    if (new Set(findings.map((finding) => finding.id)).size !== findings.length)
      diagnostics.push(
        sectionDiagnostic(
          artifact,
          "invalid-value",
          "Blocking findings must have unique identities after first-occurrence normalization",
          record.line,
        ),
      );
    return { ...record, findings };
  });
  const physicalLastPass = lastPass?.number ?? undefined;
  const lastRecord = stablePasses.at(-1);
  const latest: ReviewPassEvidence | undefined =
    diagnostics.length === 0 &&
    stablePasses.length === candidates.length &&
    lastRecord !== undefined &&
    lastRecord.number === physicalLastPass &&
    lastRecord.provenance !== "structural"
      ? lastRecord
      : undefined;
  return {
    passes: stablePasses,
    diagnostics,
    ...(physicalLastPass === undefined ? {} : { physicalLastPass }),
    ...(latest === undefined ? {} : { latest }),
  };
};
