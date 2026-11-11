import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import type { FrontmatterContent, Root, RootContent } from "mdast";
import * as Yaml from "yaml";
import {
  validateMarkdownArtifact,
  type ArtifactDiagnostic,
  type ArtifactDiagnosticCode,
  type ArtifactHeading,
  type ArtifactLink,
  type ArtifactOwnership,
  type ArtifactParseResult,
  type ArtifactSourceLocation,
  type ArtifactType,
  type ArtifactValidationResult,
  type MarkdownArtifact,
} from "./artifact.js";

type MarkdownNode = Root | RootContent | FrontmatterContent;

const frontmatterProcessor = remark().use(remarkFrontmatter, [
  "yaml",
  { type: "yaml", fence: { open: "---", close: "..." } },
]);
const markdownProcessor = remark();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pointAt = (source: string, offset: number): ArtifactSourceLocation => {
  const end = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let column = 1;
  for (let index = 0; index < end; index += 1) {
    const character = source[index];
    if (character === "\r") {
      line += 1;
      column = 1;
      if (source[index + 1] === "\n") index += 1;
    } else if (character === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column, offset: end };
};

const nodeLocation = (source: string, node: MarkdownNode): ArtifactSourceLocation => {
  const position = node.position?.start;
  if (
    position?.line !== undefined &&
    position.column !== undefined &&
    position.offset !== undefined
  )
    return {
      line: position.line,
      column: position.column,
      offset: position.offset,
    };
  return pointAt(source, position?.offset ?? 0);
};

const nodeChildren = (node: MarkdownNode): readonly MarkdownNode[] =>
  "children" in node ? node.children : [];

const nodeText = (node: MarkdownNode): string => {
  if ("value" in node && typeof node.value === "string") return node.value;
  if (node.type === "image" || node.type === "imageReference")
    return node.alt ?? "";
  if (node.type === "break") return " ";
  return nodeChildren(node).map(nodeText).join("");
};

const nodeStartOffset = (node: MarkdownNode): number =>
  node.position?.start.offset ?? 0;

const nodeEndOffset = (node: MarkdownNode): number =>
  node.position?.end.offset ?? 0;

const nextLineOffset = (source: string, offset: number): number => {
  const lineFeed = source.indexOf("\n", offset);
  const carriageReturn = source.indexOf("\r", offset);
  const candidates = [lineFeed, carriageReturn].filter((value) => value >= 0);
  if (candidates.length === 0) return source.length;
  const lineEnd = Math.min(...candidates);
  return source[lineEnd] === "\r" && source[lineEnd + 1] === "\n"
    ? lineEnd + 2
    : lineEnd + 1;
};

const previousLineStartOffset = (source: string, offset: number): number =>
  Math.max(
    source.lastIndexOf("\n", Math.max(0, offset - 1)),
    source.lastIndexOf("\r", Math.max(0, offset - 1)),
  ) + 1;

export type MarkdownFrontmatterParseResult =
  | { readonly kind: "absent" }
  | { readonly kind: "unterminated" }
  | {
      readonly kind: "present";
      readonly yaml: string;
      readonly value: string;
      readonly yamlStartOffset: number;
      readonly valueStartOffset: number;
      readonly valueEndOffset: number;
      readonly endOffset: number;
      readonly startLine: number;
      readonly endLine: number;
      readonly body: string;
      readonly bodyStartOffset: number;
    };

const frontmatterFromRoot = (
  source: string,
  root: Root,
): MarkdownFrontmatterParseResult => {
  const firstNode = root.children[0];
  if (firstNode?.type === "yaml" && firstNode.position?.start.line === 1) {
    const nodeEnd = nodeEndOffset(firstNode);
    const yamlStartOffset = nextLineOffset(source, nodeStartOffset(firstNode));
    const foundValueStartOffset = source.indexOf(firstNode.value, yamlStartOffset);
    const valueStartOffset =
      foundValueStartOffset < 0 ? yamlStartOffset : foundValueStartOffset;
    const valueEndOffset = valueStartOffset + firstNode.value.length;
    const yamlEndOffset = previousLineStartOffset(source, nodeEnd);
    const bodyStartOffset = nextLineOffset(source, nodeEnd);
    const lineEndingLength =
      source[bodyStartOffset - 2] === "\r" &&
      source[bodyStartOffset - 1] === "\n"
        ? 2
        : source[bodyStartOffset - 1] === "\r" ||
            source[bodyStartOffset - 1] === "\n"
          ? 1
          : 0;
    const endOffset = bodyStartOffset - lineEndingLength;
    return {
      kind: "present",
      yaml: source.slice(yamlStartOffset, yamlEndOffset),
      value: firstNode.value,
      yamlStartOffset,
      valueStartOffset,
      valueEndOffset,
      endOffset,
      startLine: firstNode.position?.start.line ?? 1,
      endLine: firstNode.position?.end.line ?? 1,
      body: source.slice(bodyStartOffset),
      bodyStartOffset,
    };
  }
  if (
    firstNode?.type === "thematicBreak" &&
    firstNode.position?.start.offset === 0
  )
    return { kind: "unterminated" };
  return { kind: "absent" };
};

export const parseMarkdownFrontmatter = (
  source: string,
): MarkdownFrontmatterParseResult =>
  frontmatterFromRoot(source, frontmatterProcessor.parse(source));

const referenceKey = (identifier: string): string =>
  identifier.trim().replace(/\s+/g, " ").toLowerCase();

const structureOf = (
  source: string,
  root: Root,
): { readonly headings: readonly ArtifactHeading[]; readonly links: readonly ArtifactLink[] } => {
  const definitions = new Map<string, string>();
  const collectDefinitions = (node: MarkdownNode): void => {
    if (node.type === "code" || node.type === "yaml") return;
    if (node.type === "definition" && node.identifier !== undefined) {
      const key = referenceKey(node.identifier);
      if (!definitions.has(key)) definitions.set(key, node.url);
    }
    for (const child of nodeChildren(node)) collectDefinitions(child);
  };
  for (const node of root.children) collectDefinitions(node);

  const headings: ArtifactHeading[] = [];
  const links: ArtifactLink[] = [];
  const visit = (node: MarkdownNode, topLevel: boolean): void => {
    if (node.type === "code" || node.type === "yaml") return;
    if (node.type === "heading")
      headings.push({
        depth: node.depth,
        value: nodeText(node).trim(),
        location: nodeLocation(source, node),
        topLevel,
      });
    if ((node.type === "link" || node.type === "image") && node.url !== undefined)
      links.push({
        kind: node.type === "image" ? "image" : "link",
        url: node.url,
        location: nodeLocation(source, node),
      });
    if (
      (node.type === "linkReference" || node.type === "imageReference") &&
      definitions.has(referenceKey(node.identifier))
    )
      links.push({
        kind: node.type === "imageReference" ? "image" : "link",
        url: definitions.get(referenceKey(node.identifier)) ?? "",
        location: nodeLocation(source, node),
      });
    for (const child of nodeChildren(node)) visit(child, false);
  };
  for (const node of root.children) visit(node, true);
  return { headings, links };
};

const parseFailure = (
  sourcePath: string,
  code: ArtifactDiagnosticCode,
  message: string,
  location: ArtifactSourceLocation,
): ArtifactParseResult => ({
  kind: "invalid",
  sourcePath,
  diagnostics: [{ code, sourcePath, message, location }],
});

const fieldLocations = (
  source: string,
  yamlValueStart: number,
  document: Yaml.Document,
  metadata: unknown,
): Readonly<Record<string, ArtifactSourceLocation>> => {
  if (!isRecord(metadata)) return {};
  const locations: Record<string, ArtifactSourceLocation> = {};
  for (const field of Object.keys(metadata)) {
    const node = document.get(field, true);
    if (!isRecord(node) || !Array.isArray(node.range)) continue;
    const offset = node.range[0];
    if (typeof offset === "number")
      locations[field] = pointAt(source, yamlValueStart + offset);
  }
  return locations;
};

export const parseMarkdownArtifact = (
  sourcePath: string,
  source: string,
): ArtifactParseResult => {
  let root: Root;
  try {
    root = frontmatterProcessor.parse(source);
  } catch (error) {
    return parseFailure(
      sourcePath,
      "invalid-markdown",
      `Unable to parse Markdown: ${String(error)}`,
      pointAt(source, 0),
    );
  }

  const frontmatter = frontmatterFromRoot(source, root);
  if (frontmatter.kind === "absent")
    return parseFailure(
      sourcePath,
      "missing-frontmatter",
      "Artifact is missing YAML frontmatter at the start of the document",
      pointAt(source, 0),
    );
  if (frontmatter.kind === "unterminated")
    return parseFailure(
      sourcePath,
      "malformed-frontmatter",
      "YAML frontmatter has no closing delimiter",
      pointAt(source, 0),
    );

  const firstNode = root.children[0];
  if (firstNode?.type !== "yaml")
    return parseFailure(
      sourcePath,
      "missing-frontmatter",
      "Artifact is missing YAML frontmatter at the start of the document",
      pointAt(source, 0),
    );

  const yamlNodes = root.children.filter((node) => node.type === "yaml");
  if (yamlNodes.length !== 1)
    return parseFailure(
      sourcePath,
      "malformed-frontmatter",
      "Artifact must contain exactly one YAML frontmatter block",
      nodeLocation(source, yamlNodes[1] ?? firstNode),
    );

  const yamlValue = frontmatter.value;
  const {
    valueStartOffset,
    valueEndOffset,
    endOffset,
    bodyStartOffset,
  } = frontmatter;

  let document: Yaml.Document;
  try {
    document = Yaml.parseDocument(yamlValue, { uniqueKeys: true });
  } catch (error) {
    return parseFailure(
      sourcePath,
      "malformed-frontmatter",
      `Unable to parse YAML frontmatter: ${String(error)}`,
      pointAt(source, valueStartOffset),
    );
  }

  if (document.errors.length > 0)
    return {
      kind: "invalid",
      sourcePath,
      diagnostics: document.errors.map((error) => ({
        code: error.code === "DUPLICATE_KEY" ? "duplicate-key" : "malformed-frontmatter",
        sourcePath,
        message: error.message,
        location: pointAt(
          source,
          valueStartOffset + (error.pos?.[0] ?? 0),
        ),
      })),
    };

  let metadata: unknown;
  try {
    metadata = document.toJS();
  } catch (error) {
    return parseFailure(
      sourcePath,
      "malformed-frontmatter",
      `Unable to read YAML frontmatter: ${String(error)}`,
      pointAt(source, valueStartOffset),
    );
  }

  const structure = structureOf(source, root);
  const artifact: MarkdownArtifact = {
    sourcePath,
    source,
    metadata,
    body: source.slice(bodyStartOffset),
    headings: structure.headings,
    links: structure.links,
    frontmatter: {
      value: yamlValue,
      valueStartOffset,
      valueEndOffset,
      endOffset,
      fieldLocations: fieldLocations(source, valueStartOffset, document, metadata),
    },
  };
  return { kind: "parsed", artifact };
};

export const validateArtifact = (
  result: ArtifactParseResult,
  ownership: ArtifactOwnership,
): ArtifactValidationResult | Extract<ArtifactParseResult, { readonly kind: "invalid" }> =>
  result.kind === "invalid"
    ? result
    : validateMarkdownArtifact(result.artifact, ownership);

export interface ArtifactMetadataUpdate {
  readonly type?: ArtifactType;
  readonly unit_id?: string | null;
  readonly labels?: readonly string[] | null;
}

export interface MarkdownSectionUpdate {
  readonly heading: string;
  readonly markdown: string;
}

export interface ArtifactReader {
  parse(sourcePath: string, source: string): ArtifactParseResult;
  validate(
    artifact: MarkdownArtifact,
    ownership: ArtifactOwnership,
  ): ArtifactValidationResult;
}

export interface ArtifactWriter {
  write(
    sourcePath: string,
    source: string,
    request: ArtifactWriteRequest,
  ): ArtifactWriteResult;
}

export interface ArtifactWriteRequest {
  readonly ownership: ArtifactOwnership;
  readonly metadata?: ArtifactMetadataUpdate;
  readonly sections?: readonly MarkdownSectionUpdate[];
}

export type ArtifactWriteResult =
  | { readonly kind: "written"; readonly source: string }
  | { readonly kind: "invalid"; readonly diagnostics: readonly ArtifactDiagnostic[] };

const writeDiagnostic = (
  sourcePath: string,
  code: ArtifactDiagnosticCode,
  message: string,
): ArtifactDiagnostic => ({
  code,
  sourcePath,
  message,
  location: { line: 1, column: 1, offset: 0 },
});

const sectionHeading = (node: Root["children"][number]): string =>
  node.type === "heading" ? nodeText(node).trim().toLowerCase() : "";

interface MarkdownReferenceState {
  readonly links: ReadonlySet<string>;
  readonly definitions: ReadonlySet<string>;
}

const referenceStructure = (
  nodes: readonly MarkdownNode[],
): MarkdownReferenceState => {
  const links = new Set<string>();
  const definitions = new Set<string>();
  const visit = (node: MarkdownNode): void => {
    if (node.type === "code" || node.type === "yaml") return;
    if (node.type === "linkReference" || node.type === "imageReference")
      links.add(referenceKey(node.identifier));
    if (node.type === "definition" && node.identifier !== undefined)
      definitions.add(referenceKey(node.identifier));
    for (const child of nodeChildren(node)) visit(child);
  };
  for (const node of nodes) visit(node);
  return { links, definitions };
};

const referenceStateAfterUpdates = (
  root: Root,
  updates: readonly MarkdownSectionUpdate[],
  updateRoots: readonly Root[],
): MarkdownReferenceState => {
  const updatedSections = new Set(
    updates.map(({ heading }) => heading.trim().toLowerCase()),
  );
  const survivingNodes: MarkdownNode[] = [];
  const links = new Set<string>();
  const definitions = new Set<string>();
  const add = (structure: MarkdownReferenceState): void => {
    for (const link of structure.links) links.add(link);
    for (const definition of structure.definitions)
      definitions.add(definition);
  };
  let updatedSection = false;
  for (const node of root.children) {
    if (node.type === "heading" && node.depth === 1) updatedSection = false;
    if (node.type === "heading" && node.depth === 2) {
      updatedSection = updatedSections.has(sectionHeading(node));
      if (updatedSection) {
        add(referenceStructure([node]));
        continue;
      }
    }
    if (!updatedSection) survivingNodes.push(node);
  }

  add(referenceStructure(survivingNodes));
  for (const updateRoot of updateRoots)
    add(referenceStructure(updateRoot.children));
  return { links, definitions };
};

interface RetainedReferenceDefinition {
  readonly key: string;
  readonly source: string;
  readonly offset: number;
}

interface SectionReplacement {
  readonly start: number;
  readonly end: number;
  readonly markdown: string;
  readonly definitions: readonly RetainedReferenceDefinition[];
}

const sectionReplacement = (
  source: string,
  root: Root,
  update: MarkdownSectionUpdate,
  sourcePath: string,
  lineEnding: string,
  referenceState: MarkdownReferenceState,
): SectionReplacement | ArtifactDiagnostic => {
  const matches = root.children
    .map((node, index) => ({ node, index }))
    .filter(
      ({ node }) =>
        node.type === "heading" &&
        node.depth === 2 &&
        sectionHeading(node) === update.heading.trim().toLowerCase(),
    );
  if (matches.length === 0)
    return writeDiagnostic(
      sourcePath,
      "missing-section",
      `Cannot update missing section '${update.heading}'`,
    );
  if (matches.length > 1)
    return writeDiagnostic(
      sourcePath,
      "duplicate-section",
      `Cannot update ambiguous section '${update.heading}'`,
    );

  const { index } = matches[0];
  const heading = root.children[index];
  if (heading?.type !== "heading")
    return writeDiagnostic(
      sourcePath,
      "missing-section",
      `Cannot update missing section '${update.heading}'`,
    );

  let end = source.length;
  let sectionEndIndex = root.children.length;
  for (let childIndex = index + 1; childIndex < root.children.length; childIndex += 1) {
    const candidate = root.children[childIndex];
    if (candidate.type === "heading" && candidate.depth <= heading.depth) {
      end = nodeStartOffset(candidate);
      sectionEndIndex = childIndex;
      break;
    }
  }

  const start = nextLineOffset(source, nodeEndOffset(heading));
  const definitions: RetainedReferenceDefinition[] = [];
  const collectDefinitions = (node: MarkdownNode): void => {
    if (node.type === "code" || node.type === "yaml") return;
    if (node.type === "definition") {
      const definitionStart = node.position?.start.offset;
      const definitionEnd = node.position?.end.offset;
      if (
        node.identifier !== undefined &&
        referenceState.links.has(referenceKey(node.identifier)) &&
        !referenceState.definitions.has(referenceKey(node.identifier)) &&
        definitionStart !== undefined &&
        definitionEnd !== undefined &&
        definitionStart >= start &&
        definitionEnd <= end
      )
        definitions.push({
          key: referenceKey(node.identifier),
          source: source.slice(definitionStart, definitionEnd),
          offset: definitionStart,
        });
      return;
    }
    for (const child of nodeChildren(node)) collectDefinitions(child);
  };
  for (const node of root.children.slice(index + 1, sectionEndIndex))
    collectDefinitions(node);

  return {
    start,
    end,
    markdown: update.markdown
      .replace(/\r\n|\r|\n/g, lineEnding)
      .replace(/^(?:\r\n|\r|\n)+/, "")
      .replace(/(?:\r\n|\r|\n)+$/, ""),
    definitions,
  };
};

const validateOutput = (
  sourcePath: string,
  source: string,
  ownership: ArtifactOwnership,
): ArtifactWriteResult => {
  const parsed = parseMarkdownArtifact(sourcePath, source);
  if (parsed.kind === "invalid")
    return { kind: "invalid", diagnostics: parsed.diagnostics };
  const validation = validateMarkdownArtifact(parsed.artifact, ownership);
  if (validation.kind === "invalid")
    return { kind: "invalid", diagnostics: validation.diagnostics };
  return { kind: "written", source };
};

export const writeMarkdownArtifact = (
  sourcePath: string,
  source: string,
  request: ArtifactWriteRequest,
): ArtifactWriteResult => {
  const original = parseMarkdownArtifact(sourcePath, source);
  if (original.kind === "invalid")
    return { kind: "invalid", diagnostics: original.diagnostics };
  const validated = validateMarkdownArtifact(original.artifact, request.ownership);
  if (validated.kind === "invalid")
    return { kind: "invalid", diagnostics: validated.diagnostics };

  const metadataUpdates = request.metadata ?? {};
  const extraFields = Object.keys(metadataUpdates).filter(
    (field) => !["type", "unit_id", "labels"].includes(field),
  );
  if (extraFields.length > 0)
    return {
      kind: "invalid",
      diagnostics: extraFields.map((field) =>
        writeDiagnostic(
          sourcePath,
          "immutable-field",
          `Artifact field '${field}' cannot be changed by the supported writer`,
        ),
      ),
    };

  const hasMetadataUpdate =
    metadataUpdates.type !== undefined ||
    Object.hasOwn(metadataUpdates, "unit_id") ||
    Object.hasOwn(metadataUpdates, "labels");
  const sectionUpdates = request.sections ?? [];
  if (!hasMetadataUpdate && sectionUpdates.length === 0)
    return { kind: "written", source };

  let updatedSource = source;
  if (hasMetadataUpdate) {
    let document: Yaml.Document;
    try {
      document = Yaml.parseDocument(original.artifact.frontmatter.value, {
        uniqueKeys: true,
      });
      if (metadataUpdates.type !== undefined)
        document.set("type", metadataUpdates.type);
      if (Object.hasOwn(metadataUpdates, "unit_id")) {
        if (metadataUpdates.unit_id === null || metadataUpdates.unit_id === undefined)
          document.delete("unit_id");
        else document.set("unit_id", metadataUpdates.unit_id);
      }
      if (Object.hasOwn(metadataUpdates, "labels")) {
        if (metadataUpdates.labels === null || metadataUpdates.labels === undefined)
          document.delete("labels");
        else document.set("labels", [...metadataUpdates.labels]);
      }
    } catch (error) {
      return {
        kind: "invalid",
        diagnostics: [
          writeDiagnostic(
            sourcePath,
            "malformed-frontmatter",
            `Unable to update YAML frontmatter: ${String(error)}`,
          ),
        ],
      };
    }

    const yamlValue = document.toString({ lineWidth: 0 }).replace(/(?:\r\n|\n|\r)$/, "");
    updatedSource =
      source.slice(0, original.artifact.frontmatter.valueStartOffset) +
      yamlValue +
      source.slice(original.artifact.frontmatter.valueEndOffset);
  }
  if (sectionUpdates.length === 0)
    return validateOutput(sourcePath, updatedSource, request.ownership);

  let root: Root;
  try {
    root = frontmatterProcessor.parse(updatedSource);
  } catch (error) {
    return {
      kind: "invalid",
      diagnostics: [
        writeDiagnostic(
          sourcePath,
          "invalid-markdown",
          `Unable to parse Markdown for writing: ${String(error)}`,
        ),
      ],
    };
  }

  const lineEnding = /\r\n|\r|\n/.exec(source)?.[0] ?? "\n";
  const updateRoots: Root[] = [];
  const seenSections = new Set<string>();
  for (const update of sectionUpdates) {
    const key = update.heading.trim().toLowerCase();
    if (seenSections.has(key))
      return {
        kind: "invalid",
        diagnostics: [
          writeDiagnostic(
            sourcePath,
            "duplicate-section",
            `Section '${update.heading}' appears more than once in the write request`,
          ),
        ],
      };
    seenSections.add(key);
    try {
      updateRoots.push(markdownProcessor.parse(update.markdown));
    } catch (error) {
      return {
        kind: "invalid",
        diagnostics: [
          writeDiagnostic(
            sourcePath,
            "invalid-markdown",
            `Unable to parse replacement Markdown: ${String(error)}`,
          ),
        ],
      };
    }
  }

  const referenceState = referenceStateAfterUpdates(
    root,
    sectionUpdates,
    updateRoots,
  );
  const replacements: SectionReplacement[] = [];
  for (const update of sectionUpdates) {
    const replacement = sectionReplacement(
      updatedSource,
      root,
      update,
      sourcePath,
      lineEnding,
      referenceState,
    );
    if ("code" in replacement)
      return { kind: "invalid", diagnostics: [replacement] };
    if (replacement.start > replacement.end)
      return {
        kind: "invalid",
        diagnostics: [
          writeDiagnostic(
            sourcePath,
            "invalid-markdown",
            `Unable to locate the content of section '${update.heading}'`,
          ),
        ],
      };
    replacements.push(replacement);
  }

  const retainedReferenceKeys = new Set<string>();
  const replacementsInSourceOrder = [...replacements]
    .sort((left, right) => left.start - right.start)
    .map((replacement) => ({
      ...replacement,
      definitions: [...replacement.definitions]
        .sort((left, right) => left.offset - right.offset)
        .filter(({ key }) => {
          if (retainedReferenceKeys.has(key)) return false;
          retainedReferenceKeys.add(key);
          return true;
        }),
    }));
  let output = updatedSource;
  for (const replacement of replacementsInSourceOrder.sort(
    (left, right) => right.start - left.start,
  )) {
    const prefix = output.slice(0, replacement.start);
    const suffix = output.slice(replacement.end);
    const separator = prefix.endsWith(lineEnding)
      ? lineEnding
      : `${lineEnding}${lineEnding}`;
    const content = [
      replacement.markdown,
      ...replacement.definitions.map(({ source }) => source),
    ]
      .filter((part) => part.length > 0)
      .join(`${lineEnding}${lineEnding}`);
    const inserted =
      content.length === 0
        ? separator
        : `${separator}${content}${lineEnding}${lineEnding}`;
    output = `${prefix}${inserted}${suffix}`;
  }
  return validateOutput(sourcePath, output, request.ownership);
};

export const markdownArtifactReader: ArtifactReader = {
  parse: parseMarkdownArtifact,
  validate: validateMarkdownArtifact,
};

export const markdownArtifactWriter: ArtifactWriter = {
  write: writeMarkdownArtifact,
};
