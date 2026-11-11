import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  expectedTargetArchiveNames,
  validateTargetArchiveSet,
} from "../packages/cli/src/cli/release-archive.js";
import { parseReleaseVersion } from "./release-version.js";

interface ReleaseAsset {
  readonly name: string;
  readonly sha256: string;
}

interface ReleaseManifest {
  readonly format_version: 1;
  readonly version: string;
  readonly tag: string;
  readonly source: {
    readonly repository: string;
    readonly commit: string;
    readonly workflow_run_id: string;
    readonly workflow_run_attempt: string;
  };
  readonly assets: readonly ReleaseAsset[];
}

const parseArguments = (): Map<string, string> => {
  const args = process.argv.slice(2);
  if (args.length % 2 !== 0) {
    throw new Error("Expected --name value pairs");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value || values.has(key)) {
      throw new Error(`Invalid or duplicate argument: ${String(key)}`);
    }
    values.set(key, value);
  }
  return values;
};

const argumentsMap = parseArguments();
const acceptedArguments = new Set([
  "--mode",
  "--assets",
  "--version",
  "--commit",
  "--repository",
  "--run-id",
  "--run-attempt",
]);
const unknownArgument = [...argumentsMap.keys()].find(
  (argument) => !acceptedArguments.has(argument),
);
if (unknownArgument) throw new Error(`Unknown argument: ${unknownArgument}`);
const mode = argumentsMap.get("--mode");
const assetDirectory = argumentsMap.get("--assets");
const directory = assetDirectory ? resolve(assetDirectory) : "";
const version = argumentsMap.get("--version") ?? "";
const commit = argumentsMap.get("--commit") ?? "";
const repository = argumentsMap.get("--repository") ?? "";
const runId = argumentsMap.get("--run-id") ?? "";
const runAttempt = argumentsMap.get("--run-attempt") ?? "";

if (mode !== "create" && mode !== "verify") {
  throw new Error("--mode must be create or verify");
}
if (!directory || !version || !commit || !repository || !runId || !runAttempt) {
  throw new Error(
    "Expected --assets, --version, --commit, --repository, --run-id, and --run-attempt",
  );
}
parseReleaseVersion(version);
if (!/^[a-f0-9]{40}$/.test(commit)) {
  throw new Error(`Invalid source commit: ${commit}`);
}
if (!/^[^/]+\/[^/]+$/.test(repository)) {
  throw new Error(`Invalid repository slug: ${repository}`);
}
if (!/^\d+$/.test(runId) || !/^\d+$/.test(runAttempt)) {
  throw new Error("Workflow run ID and attempt must be numeric");
}

const targetArchiveNames = expectedTargetArchiveNames(version);
const assetNames = [...targetArchiveNames, `kepler-core-${version}.tgz`].sort();
const manifestName = "RELEASE-MANIFEST.json";
const checksumName = "SHA256SUMS";

const sha256 = (content: Uint8Array): string =>
  createHash("sha256").update(content).digest("hex");

const readAssetNames = (): string[] => {
  let names: string[];
  try {
    names = readdirSync(directory).sort();
  } catch (error) {
    throw new Error(`Could not read release asset directory: ${String(error)}`);
  }
  for (const name of names) {
    if (basename(name) !== name || !lstatSync(join(directory, name)).isFile()) {
      throw new Error(`Release asset is not a regular file: ${name}`);
    }
  }
  return names;
};

const readAsset = (name: string): Uint8Array => {
  try {
    return readFileSync(join(directory, name));
  } catch (error) {
    throw new Error(`Could not read release asset ${name}: ${String(error)}`);
  }
};

const readAssetText = (name: string): string => {
  try {
    return readFileSync(join(directory, name), "utf8");
  } catch (error) {
    throw new Error(`Could not read release asset ${name}: ${String(error)}`);
  }
};

const validateTargetArchives = (): void => {
  const archives = Object.fromEntries(targetArchiveNames.map((name) => [name, readAsset(name)]));
  const validated = validateTargetArchiveSet(archives, version);
  if (validated.some(({ manifest }) => manifest.source.kind !== "production" || manifest.source.commit !== commit)) {
    throw new Error("Release target archives must bind production source to the release commit");
  }
};

const create = (): void => {
  const actualNames = readAssetNames();
  if (JSON.stringify(actualNames) !== JSON.stringify(assetNames)) {
    throw new Error(
      `Release assets do not match the supported set: ${actualNames.join(", ")}`,
    );
  }
  validateTargetArchives();
  const manifest: ReleaseManifest = {
    format_version: 1,
    version,
    tag: `v${version}`,
    source: {
      repository,
      commit,
      workflow_run_id: runId,
      workflow_run_attempt: runAttempt,
    },
    assets: assetNames.map((name) => ({ name, sha256: sha256(readAsset(name)) })),
  };
  writeFileSync(
    join(directory, manifestName),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "wx" },
  );
  const checksumNames = [...assetNames, manifestName].sort();
  const checksumLines = checksumNames.map(
    (name) => `${sha256(readAsset(name))}  ${name}`,
  );
  writeFileSync(join(directory, checksumName), `${checksumLines.join("\n")}\n`, {
    flag: "wx",
  });
  process.stdout.write(
    `Created release manifest for ${manifest.tag} at ${commit} with ${assetNames.length} assets\n`,
  );
};

const parseManifest = (content: string): ReleaseManifest => {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`Release manifest is not valid JSON: ${String(error)}`);
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("Release manifest must be a JSON object");
  }
  const candidate = value as Partial<ReleaseManifest>;
  const source = candidate.source;
  if (
    candidate.format_version !== 1 ||
    candidate.version !== version ||
    candidate.tag !== `v${version}` ||
    typeof source !== "object" ||
    source === null ||
    source.repository !== repository ||
    source.commit !== commit ||
    source.workflow_run_id !== runId ||
    source.workflow_run_attempt !== runAttempt ||
    !Array.isArray(candidate.assets) ||
    candidate.assets.length !== assetNames.length
  ) {
    throw new Error("Release manifest provenance or format does not match this build");
  }
  const manifestNames = candidate.assets.map((asset) => {
    if (
      typeof asset !== "object" ||
      asset === null ||
      typeof asset.name !== "string" ||
      typeof asset.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(asset.sha256)
    ) {
      throw new Error("Release manifest contains an invalid asset entry");
    }
    return asset.name;
  });
  if (JSON.stringify(manifestNames) !== JSON.stringify(assetNames)) {
    throw new Error("Release manifest asset set or ordering is invalid");
  }
  return candidate as ReleaseManifest;
};

const verify = (): void => {
  const expectedNames = [...assetNames, manifestName, checksumName].sort();
  const actualNames = readAssetNames();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `Release directory contents do not match the asset manifest: ${actualNames.join(", ")}`,
    );
  }
  const manifest = parseManifest(readAssetText(manifestName));
  validateTargetArchives();
  for (const asset of manifest.assets) {
    if (sha256(readAsset(asset.name)) !== asset.sha256) {
      throw new Error(`Release manifest digest mismatch: ${asset.name}`);
    }
  }
  const expectedChecksums = [...assetNames, manifestName]
    .sort()
    .map((name) => `${sha256(readAsset(name))}  ${name}`)
    .join("\n");
  const actualChecksums = readAssetText(checksumName).trimEnd();
  if (actualChecksums !== expectedChecksums) {
    throw new Error("SHA256SUMS does not match the release asset contents");
  }
  process.stdout.write(
    `Verified ${manifest.tag} assets from ${manifest.source.repository}@${manifest.source.commit}\n`,
  );
};

if (mode === "create") create();
else verify();
