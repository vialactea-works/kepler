import { randomUUID } from "node:crypto";
import { constants as FsConstants } from "node:fs";
import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import {
  markdownArtifactReader,
  markdownArtifactWriter,
} from "@vialactea-works/kepler-core";
import type {
  ArtifactDiagnostic,
  ArtifactDiagnosticCode,
  ArtifactMetadata,
  ArtifactOwnership,
  ArtifactParseResult,
  ArtifactType,
  ArtifactWriteRequest,
  MarkdownArtifact,
} from "@vialactea-works/kepler-core";

export interface RepositoryArtifactFileIdentity {
  readonly dev: number;
  readonly ino: number;
}

export interface RepositoryArtifactFileStatus extends RepositoryArtifactFileIdentity {
  isFile(): boolean;
  isDirectory(): boolean;
}

export interface RepositoryArtifactFileSystem {
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (
    path: string,
    source: string,
    expectedIdentity: RepositoryArtifactFileIdentity,
    expectedSource: string,
  ) => Promise<void>;
  readonly realpath: (path: string) => Promise<string>;
  readonly stat: (path: string) => Promise<RepositoryArtifactFileStatus>;
}

export type ConstructionArtifactOwnership =
  | { readonly kind: "project" }
  | {
      readonly kind: "unit";
      readonly unitId: string;
      readonly unitRoot: string;
    };

export interface RepositoryArtifactPath {
  readonly repositoryRoot: string;
  readonly artifactPath: string;
}

export interface ConstructionArtifactRequest extends RepositoryArtifactPath {
  readonly ownership: ConstructionArtifactOwnership;
}

export interface ConstructionArtifactWriteRequest extends ConstructionArtifactRequest {
  readonly update: Omit<ArtifactWriteRequest, "ownership">;
}

export type RepositoryArtifactDiagnosticCode =
  | ArtifactDiagnosticCode
  | "outside-repository"
  | "read-failure"
  | "write-failure"
  | "wrong-artifact-location"
  | "artifact-type-mismatch";

export interface RepositoryArtifactDiagnostic {
  readonly code: RepositoryArtifactDiagnosticCode;
  readonly sourcePath: string;
  readonly message: string;
  readonly location?: { readonly line: number; readonly column?: number };
}

export type RepositoryArtifactReadResult =
  | { readonly kind: "read"; readonly artifact: MarkdownArtifact }
  | {
      readonly kind: "invalid";
      readonly diagnostics: readonly RepositoryArtifactDiagnostic[];
    };

export type ConstructionArtifactValidationResult =
  | {
      readonly kind: "valid";
      readonly artifact: MarkdownArtifact & { readonly metadata: ArtifactMetadata };
    }
  | {
      readonly kind: "invalid";
      readonly artifact?: MarkdownArtifact;
      readonly diagnostics: readonly RepositoryArtifactDiagnostic[];
    };

export type ConstructionArtifactWriteResult =
  | { readonly kind: "written"; readonly artifact: MarkdownArtifact }
  | {
      readonly kind: "invalid";
      readonly artifact?: MarkdownArtifact;
      readonly diagnostics: readonly RepositoryArtifactDiagnostic[];
    };

export const writeVerifiedRepositoryFile = async (
  path: string,
  source: string,
  expectedIdentity: RepositoryArtifactFileIdentity,
  expectedSource: string,
): Promise<void> => {
  const noFollowFlag = FsConstants.O_NOFOLLOW;
  if (typeof noFollowFlag !== "number" || noFollowFlag === 0)
    throw new Error("No-follow artifact writes are unsupported on this platform");

  const verifyCurrent = async (): Promise<number> => {
    const handle = await Fs.open(path, FsConstants.O_RDONLY | noFollowFlag);
    try {
      const status = await handle.stat();
      const currentPath = await Fs.realpath(path);
      if (currentPath !== path)
        throw new Error("Artifact path changed after validation");
      const currentStatus = await Fs.stat(currentPath);
      if (
        !status.isFile() ||
        !currentStatus.isFile() ||
        status.dev !== expectedIdentity.dev ||
        status.ino !== expectedIdentity.ino ||
        status.dev !== currentStatus.dev ||
        status.ino !== currentStatus.ino
      )
        throw new Error("Artifact changed after validation");
      if ((await handle.readFile({ encoding: "utf8" })) !== expectedSource)
        throw new Error("Artifact content changed after validation");
      await Fs.access(path, FsConstants.W_OK);
      return currentStatus.mode;
    } finally {
      await handle.close();
    }
  };

  let temporaryPath: string | undefined;
  try {
    const mode = await verifyCurrent();
    const parent = Path.dirname(path);
    if ((await Fs.realpath(parent)) !== parent)
      throw new Error("Artifact directory changed after validation");
    temporaryPath = Path.join(
      parent,
      `.${Path.basename(path)}.${randomUUID()}.tmp`,
    );
    const temporaryHandle = await Fs.open(
      temporaryPath,
      FsConstants.O_CREAT |
        FsConstants.O_EXCL |
        FsConstants.O_WRONLY |
        noFollowFlag,
      0o600,
    );
    try {
      await temporaryHandle.writeFile(source, { encoding: "utf8" });
      await temporaryHandle.chmod(mode & 0o7777);
      await temporaryHandle.sync();
    } finally {
      await temporaryHandle.close();
    }

    await verifyCurrent();
    if ((await Fs.realpath(parent)) !== parent)
      throw new Error("Artifact directory changed after validation");
    await Fs.rename(temporaryPath, path);
    temporaryPath = undefined;
  } finally {
    if (temporaryPath !== undefined)
      await Fs.unlink(temporaryPath).catch(() => undefined);
  }
};

const defaultFileSystem: RepositoryArtifactFileSystem = {
  readFile: (path) => Fs.readFile(path, "utf8"),
  writeFile: writeVerifiedRepositoryFile,
  realpath: (path) => Fs.realpath(path),
  stat: (path) => Fs.stat(path),
};

const requiredArtifactNames: Partial<Record<ArtifactType, string>> = {
  "unit-of-work": "unit-of-work.md",
  "functional-design": "design.md",
  "non-functional-requirements": "quality.md",
  "implementation-plan": "plan.md",
  "delivery-plan": "delivery.md",
};

const requiredSections: Partial<Record<ArtifactType, readonly string[]>> = {
  "unit-of-work": ["Purpose", "Scope", "Context"],
  "functional-design": [
    "Domain behavior",
    "Domain model",
    "Boundaries and interactions",
    "Design decisions and open questions",
  ],
  "non-functional-requirements": [
    "Quality requirements",
    "Constraints and dependencies",
    "Decisions and open questions",
  ],
  "implementation-plan": [
    "Technical solution",
    "Task graph context",
    "Verification strategy",
    "Decisions and open questions",
  ],
  "delivery-plan": [
    "Outcome and destination",
    "Operations and prerequisites",
    "Verification and recovery",
    "Decisions and open questions",
  ],
};

const supportingFolders = new Set([
  "functional-design",
  "quality-requirements",
  "implementation-planning",
  "implementation",
  "code-generation",
  "code-validation",
  "code-integration",
  "unit-of-work-review",
  "deliver",
]);

const projectReferenceRoot = ".kepler/reference";
const normalized = (path: string): string =>
  path.split(Path.sep).join("/").replaceAll("\\", "/");

const isContained = (root: string, candidate: string): boolean => {
  const relative = Path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${Path.sep}`) &&
      !Path.isAbsolute(relative))
  );
};

const diagnostic = (
  sourcePath: string,
  code: RepositoryArtifactDiagnosticCode,
  message: string,
  location?: { readonly line: number; readonly column?: number },
): RepositoryArtifactDiagnostic => {
  const base = { code, sourcePath, message };
  if (location !== undefined) return { ...base, location };
  return base;
};

const sharedDiagnostics = (
  diagnostics: readonly ArtifactDiagnostic[],
): readonly RepositoryArtifactDiagnostic[] => diagnostics;

interface ResolvedRepositoryFile {
  readonly root: string;
  readonly absolutePath: string;
  readonly realPath: string;
  readonly sourcePath: string;
  readonly identity: RepositoryArtifactFileIdentity;
}

const resolveRepositoryFile = async (
  request: RepositoryArtifactPath,
  fileSystem: RepositoryArtifactFileSystem,
): Promise<ResolvedRepositoryFile | RepositoryArtifactDiagnostic> => {
  const sourcePath = normalized(request.artifactPath);
  if (Path.isAbsolute(request.artifactPath) || sourcePath.length === 0)
    return diagnostic(
      sourcePath,
      "invalid-path",
      "Artifact path must be a non-empty repository-relative path",
    );

  let root: string;
  try {
    root = await fileSystem.realpath(request.repositoryRoot);
  } catch (error) {
    return diagnostic(
      sourcePath,
      "invalid-path",
      `Unable to resolve repository root: ${String(error)}`,
    );
  }

  const absolutePath = Path.resolve(root, sourcePath);
  if (!isContained(root, absolutePath))
    return diagnostic(
      sourcePath,
      "outside-repository",
      "Artifact path resolves outside the selected repository",
    );

  try {
    const realPath = await fileSystem.realpath(absolutePath);
    if (!isContained(root, realPath))
      return diagnostic(
        sourcePath,
        "outside-repository",
        "Artifact path resolves through a symlink outside the selected repository",
      );
    const status = await fileSystem.stat(realPath);
    if (!status.isFile())
      return diagnostic(
        sourcePath,
        "invalid-path",
        "Artifact path must identify a regular file",
      );
    return {
      root,
      absolutePath,
      realPath,
      sourcePath,
      identity: { dev: status.dev, ino: status.ino },
    };
  } catch (error) {
    return diagnostic(
      sourcePath,
      "invalid-path",
      `Unable to inspect artifact path: ${String(error)}`,
    );
  }
};

const readResolvedArtifact = async (
  resolved: ResolvedRepositoryFile,
  fileSystem: RepositoryArtifactFileSystem,
): Promise<RepositoryArtifactReadResult> => {
  try {
    const source = await fileSystem.readFile(resolved.realPath);
    const parsed = markdownArtifactReader.parse(resolved.sourcePath, source);
    if (parsed.kind === "invalid")
      return {
        kind: "invalid",
        diagnostics: sharedDiagnostics(parsed.diagnostics),
      };
    return { kind: "read", artifact: parsed.artifact };
  } catch (error) {
    return {
      kind: "invalid",
      diagnostics: [
        diagnostic(
          resolved.sourcePath,
          "read-failure",
          `Unable to read artifact: ${String(error)}`,
        ),
      ],
    };
  }
};

const coreOwnership = (
  ownership: ConstructionArtifactOwnership,
): ArtifactOwnership =>
  ownership.kind === "project"
    ? { scope: "project" }
    : { scope: "unit", unitId: ownership.unitId };

const unitRootParts = (
  root: string,
  ownership: Extract<ConstructionArtifactOwnership, { readonly kind: "unit" }>,
): readonly string[] | RepositoryArtifactDiagnostic => {
  if (Path.isAbsolute(ownership.unitRoot))
    return diagnostic(
      ownership.unitRoot,
      "invalid-path",
      "Unit root must be repository-relative",
    );
  const absolute = Path.resolve(
    root,
    ...normalized(ownership.unitRoot).split("/"),
  );
  if (!isContained(root, absolute))
    return diagnostic(
      ownership.unitRoot,
      "outside-repository",
      "Unit root resolves outside the selected repository",
    );
  const parts = normalized(Path.relative(root, absolute)).split("/");
  if (
    parts.length !== 6 ||
    parts[0] !== ".kepler" ||
    parts[1] !== "missions" ||
    parts[2]?.length === 0 ||
    parts[3] !== "construction" ||
    parts[4] !== "units-of-work" ||
    parts[5] !== ownership.unitId
  )
    return diagnostic(
      ownership.unitRoot,
      "wrong-artifact-location",
      "Unit root must be .kepler/missions/<mission-id>/construction/units-of-work/<unit-id>",
    );
  return parts;
};

const locationDiagnostics = (
  root: string,
  resolved: ResolvedRepositoryFile,
  artifact: MarkdownArtifact & { readonly metadata: { readonly type: ArtifactType } },
  ownership: ConstructionArtifactOwnership,
): readonly RepositoryArtifactDiagnostic[] => {
  const artifactPath = normalized(Path.relative(root, resolved.absolutePath));
  if (ownership.kind === "project") {
    if (
      artifact.metadata.type !== "project-reference" &&
      artifact.metadata.type !== "supporting-document"
    )
      return [
        diagnostic(
          resolved.sourcePath,
          "artifact-type-mismatch",
          `Artifact type '${artifact.metadata.type}' requires unit ownership`,
        ),
      ];
    if (!artifactPath.startsWith(`${projectReferenceRoot}/`))
      return [
        diagnostic(
          resolved.sourcePath,
          "wrong-artifact-location",
          `Project-scoped artifacts must live under ${projectReferenceRoot}/`,
        ),
      ];
    return [];
  }

  const unitParts = unitRootParts(root, ownership);
  if ("code" in unitParts) return [unitParts];
  const expectedName = requiredArtifactNames[artifact.metadata.type];
  const unitRoot = unitParts.join("/");
  if (expectedName !== undefined) {
    const expectedPath = `${unitRoot}/${expectedName}`;
    return artifactPath === expectedPath
      ? []
      : [
          diagnostic(
            resolved.sourcePath,
            "wrong-artifact-location",
            `Artifact type '${artifact.metadata.type}' belongs at ${expectedPath}`,
          ),
        ];
  }
  if (artifact.metadata.type === "project-reference")
    return [
      diagnostic(
        resolved.sourcePath,
        "artifact-type-mismatch",
        "Project references cannot be unit-owned",
      ),
    ];

  const detailParts = normalized(
    Path.relative(
      Path.resolve(root, ...normalized(ownership.unitRoot).split("/")),
      resolved.absolutePath,
    ),
  ).split("/");
  if (
    detailParts.length < 3 ||
    detailParts[0] !== "details" ||
    !supportingFolders.has(detailParts[1] ?? "") ||
    Path.extname(detailParts.at(-1) ?? "") !== ".md"
  )
    return [
      diagnostic(
        resolved.sourcePath,
        "wrong-artifact-location",
        "Unit supporting documents must live under details/<stage-or-activity>/",
      ),
    ];
  return [];
};

const sectionDiagnostics = (
  artifact: MarkdownArtifact & { readonly metadata: ArtifactMetadata },
): readonly RepositoryArtifactDiagnostic[] => {
  const required = requiredSections[artifact.metadata.type] ?? [];
  const headings: string[] = [];
  for (const heading of artifact.headings)
    if (heading.topLevel && heading.depth === 2)
      headings.push(heading.value.trim().toLowerCase());
  const diagnostics: RepositoryArtifactDiagnostic[] = [];
  for (const section of required) {
    let count = 0;
    for (const heading of headings)
      if (heading === section.toLowerCase()) count += 1;
    if (count === 0)
      diagnostics.push(
        diagnostic(
          artifact.sourcePath,
          "missing-section",
          `Required section '## ${section}' is missing`,
        ),
      );
    if (count > 1)
      diagnostics.push(
        diagnostic(
          artifact.sourcePath,
          "duplicate-section",
          `Required section '## ${section}' appears more than once`,
        ),
      );
  }
  return diagnostics;
};

const linkTarget = (
  url: string,
): { readonly kind: "external" } | { readonly kind: "local"; readonly path: string } | { readonly kind: "invalid"; readonly message: string } => {
  if (url.startsWith("//")) return { kind: "external" };
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url)?.[1]?.toLowerCase();
  if (scheme !== undefined)
    return scheme === "file"
      ? { kind: "invalid", message: "file: links are not repository-scoped" }
      : { kind: "external" };
  const suffixIndex = url.search(/[?#]/);
  const rawPath = suffixIndex < 0 ? url : url.slice(0, suffixIndex);
  try {
    return { kind: "local", path: decodeURIComponent(rawPath) };
  } catch {
    return { kind: "invalid", message: "Link contains invalid percent-encoding" };
  }
};

const validateLinks = async (
  root: string,
  resolved: ResolvedRepositoryFile,
  artifact: MarkdownArtifact,
  fileSystem: RepositoryArtifactFileSystem,
): Promise<readonly RepositoryArtifactDiagnostic[]> => {
  const diagnostics: RepositoryArtifactDiagnostic[] = [];
  for (const link of artifact.links) {
    const target = linkTarget(link.url);
    if (target.kind === "external") continue;
    if (target.kind === "invalid") {
      diagnostics.push(
        diagnostic(
          resolved.sourcePath,
          "invalid-link",
          target.message,
          link.location,
        ),
      );
      continue;
    }

    let candidate: string;
    if (target.path.length === 0) candidate = resolved.absolutePath;
    else if (target.path.startsWith("/"))
      candidate = Path.resolve(root, `.${target.path}`);
    else candidate = Path.resolve(Path.dirname(resolved.absolutePath), target.path);
    if (!isContained(root, candidate)) {
      diagnostics.push(
        diagnostic(
          resolved.sourcePath,
          "outside-repository",
          `Link '${link.url}' resolves outside the selected repository`,
          link.location,
        ),
      );
      continue;
    }
    try {
      const realTarget = await fileSystem.realpath(candidate);
      if (!isContained(root, realTarget)) {
        diagnostics.push(
          diagnostic(
            resolved.sourcePath,
            "outside-repository",
            `Link '${link.url}' resolves through a symlink outside the selected repository`,
            link.location,
          ),
        );
      }
    } catch {
      diagnostics.push(
        diagnostic(
          resolved.sourcePath,
          "missing-link",
          `Linked path '${link.url}' does not exist`,
          link.location,
        ),
      );
    }
  }
  return diagnostics;
};

const validateSource = async (
  request: ConstructionArtifactRequest,
  resolved: ResolvedRepositoryFile,
  source: string,
  fileSystem: RepositoryArtifactFileSystem,
): Promise<ConstructionArtifactValidationResult> => {
  const parsed: ArtifactParseResult = markdownArtifactReader.parse(
    resolved.sourcePath,
    source,
  );
  if (parsed.kind === "invalid")
    return {
      kind: "invalid",
      diagnostics: sharedDiagnostics(parsed.diagnostics),
    };

  const shared = markdownArtifactReader.validate(
    parsed.artifact,
    coreOwnership(request.ownership),
  );
  if (shared.kind === "invalid")
    return {
      kind: "invalid",
      artifact: shared.artifact,
      diagnostics: sharedDiagnostics(shared.diagnostics),
    };

  const diagnostics = [
    ...locationDiagnostics(
      resolved.root,
      resolved,
      shared.artifact,
      request.ownership,
    ),
    ...sectionDiagnostics(shared.artifact),
    ...(await validateLinks(resolved.root, resolved, shared.artifact, fileSystem)),
  ];
  return diagnostics.length > 0
    ? { kind: "invalid", artifact: shared.artifact, diagnostics }
    : { kind: "valid", artifact: shared.artifact };
};

export const readRepositoryArtifact = async (
  request: RepositoryArtifactPath,
  fileSystem: RepositoryArtifactFileSystem = defaultFileSystem,
): Promise<RepositoryArtifactReadResult> => {
  const resolved = await resolveRepositoryFile(request, fileSystem);
  if ("code" in resolved)
    return { kind: "invalid", diagnostics: [resolved] };
  return readResolvedArtifact(resolved, fileSystem);
};

export const validateConstructionArtifact = async (
  request: ConstructionArtifactRequest,
  fileSystem: RepositoryArtifactFileSystem = defaultFileSystem,
): Promise<ConstructionArtifactValidationResult> => {
  const resolved = await resolveRepositoryFile(request, fileSystem);
  if ("code" in resolved)
    return { kind: "invalid", diagnostics: [resolved] };
  const read = await readResolvedArtifact(resolved, fileSystem);
  if (read.kind === "invalid") return read;
  return validateSource(request, resolved, read.artifact.source, fileSystem);
};

export const writeConstructionArtifact = async (
  request: ConstructionArtifactWriteRequest,
  fileSystem: RepositoryArtifactFileSystem = defaultFileSystem,
): Promise<ConstructionArtifactWriteResult> => {
  const resolved = await resolveRepositoryFile(request, fileSystem);
  if ("code" in resolved)
    return { kind: "invalid", diagnostics: [resolved] };
  const read = await readResolvedArtifact(resolved, fileSystem);
  if (read.kind === "invalid") return read;

  const written = markdownArtifactWriter.write(
    resolved.sourcePath,
    read.artifact.source,
    { ...request.update, ownership: coreOwnership(request.ownership) },
  );
  if (written.kind === "invalid")
    return {
      kind: "invalid",
      artifact: read.artifact,
      diagnostics: sharedDiagnostics(written.diagnostics),
    };

  const validation = await validateSource(
    request,
    resolved,
    written.source,
    fileSystem,
  );
  if (validation.kind === "invalid") return validation;
  if (written.source === read.artifact.source)
    return { kind: "written", artifact: validation.artifact };

  try {
    const currentRealPath = await fileSystem.realpath(resolved.absolutePath);
    if (!isContained(resolved.root, currentRealPath))
      return {
        kind: "invalid",
        artifact: validation.artifact,
        diagnostics: [
          diagnostic(
            resolved.sourcePath,
            "outside-repository",
            "Artifact path now resolves outside the selected repository",
          ),
        ],
      };
    if (currentRealPath !== resolved.realPath)
      return {
        kind: "invalid",
        artifact: validation.artifact,
        diagnostics: [
          diagnostic(
            resolved.sourcePath,
            "invalid-path",
            "Artifact path changed while the update was being validated",
          ),
        ],
      };
    await fileSystem.writeFile(
      resolved.realPath,
      written.source,
      resolved.identity,
      read.artifact.source,
    );
  } catch (error) {
    return {
      kind: "invalid",
      artifact: validation.artifact,
      diagnostics: [
        diagnostic(
          resolved.sourcePath,
          "write-failure",
          `Unable to write artifact: ${String(error)}`,
        ),
      ],
    };
  }
  return { kind: "written", artifact: validation.artifact };
};
