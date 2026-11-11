import * as Fs from "node:fs";
import * as Path from "node:path";
import { randomUUID } from "node:crypto";
import { sha256Digest } from "../packages/cli/src/cli/installation-record.js";
import { planResourceGeneration } from "./resource-generation.js";

const repositoryRoot = Path.resolve(import.meta.dirname, "..");
const rootPackage = readJsonFile(Path.join(repositoryRoot, "package.json"));
if (typeof rootPackage.version !== "string") {
  throw new Error("Root package.json must declare the Kepler release version.");
}
const releaseVersion = rootPackage.version;

const plan = planResourceGeneration(repositoryRoot, releaseVersion);
for (const change of plan.changes) {
  const target = Path.join(repositoryRoot, change.path);
  const current = readRegularFile(target);
  const currentDigest = current ? sha256Digest(current) : null;
  if (currentDigest !== change.expectedDigest) {
    throw new Error(`Resource changed after preparation: ${change.path}`);
  }
}
for (const deletion of plan.deletions) {
  const current = readRegularFile(Path.join(repositoryRoot, deletion.path));
  if (!current || sha256Digest(current) !== deletion.expectedDigest) {
    throw new Error(`Resource changed before cleanup: ${deletion.path}`);
  }
}

const changed: string[] = [];
try {
  for (const change of plan.changes) {
    const target = Path.join(repositoryRoot, change.path);
    Fs.mkdirSync(Path.dirname(target), { recursive: true });
    const temporary = `${target}.prepare-${process.pid}-${randomUUID()}`;
    let created = false;
    try {
      Fs.writeFileSync(temporary, change.contents, { flag: "wx", mode: 0o644 });
      created = true;
      Fs.renameSync(temporary, target);
    } catch (error) {
      if (created) Fs.unlinkSync(temporary);
      throw error;
    }
    changed.push(change.path);
  }
  for (const deletion of plan.deletions) {
    const target = Path.join(repositoryRoot, deletion.path);
    const current = readRegularFile(target);
    if (!current || sha256Digest(current) !== deletion.expectedDigest) {
      throw new Error(`Resource changed before cleanup: ${deletion.path}`);
    }
    Fs.unlinkSync(target);
    changed.push(deletion.path);
  }
} catch (error) {
  throw new Error(
    `Resource package preparation failed after changing ${changed.join(", ") || "no files"}: ${String(error)}`,
  );
}

process.stdout.write(
  `Prepared Kepler ${releaseVersion} resource package ${plan.resourceDigest}; changed ${changed.length} files\n`,
);

function readJsonFile(path: string): Record<string, unknown> {
  const contents = Fs.readFileSync(path, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Could not parse JSON from ${path}: ${String(error)}`);
  }
  if (!isRecord(value)) throw new Error(`${path} must contain a JSON object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readRegularFile(path: string): Uint8Array | undefined {
  try {
    const stat = Fs.lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Resource target is not a regular file: ${path}`);
    return Fs.readFileSync(path);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
