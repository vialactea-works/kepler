import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { parseStrictJson } from "../../packages/cli/src/json/strict-json.js";
import type { ApplicationConnector } from "./connectors.js";
import {
  createE2EHarness,
  resumeE2EHarness,
  type E2EHarness,
} from "./harness.js";
import { TemporaryE2EResourceConnector } from "./resources.js";

const projectRoot = Path.resolve(import.meta.dirname, "../..");
const maxCheckpointBytes = 8 * 1024 * 1024;
const checkpointFields = [
  "version",
  "scenario",
  "sourceCheckout",
  "rootDirectory",
  "checkpointPath",
  "ownerNonce",
  "nextPart",
  "fixtureDigest",
  "state",
] as const;

export interface E2EWorkflowCheckpoint {
  readonly version: 1;
  readonly scenario: string;
  readonly sourceCheckout: string;
  readonly rootDirectory: string;
  readonly checkpointPath: string;
  readonly ownerNonce: string;
  readonly nextPart: 2 | 3;
  readonly fixtureDigest: string;
  readonly state: unknown;
}

export interface E2EWorkflowOptions {
  readonly checkpointPath?: string;
  readonly connector?: ApplicationConnector;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const assertJsonValue = (value: unknown, ancestors = new Set<object>()): void => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Workflow state numbers must be finite");
    return;
  }
  if (typeof value !== "object") {
    throw new TypeError("Workflow state must contain only JSON-compatible values");
  }
  if (ancestors.has(value)) throw new TypeError("Workflow state cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new TypeError("Workflow state arrays cannot have symbol properties");
      }
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== value.length + 1) {
        throw new TypeError("Workflow state arrays cannot be sparse or have extra properties");
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError("Workflow state arrays cannot be sparse");
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError("Workflow state arrays must contain enumerable data values");
        }
        assertJsonValue(descriptor.value, ancestors);
      }
      return;
    }
    if (!isPlainObject(value)) {
      throw new TypeError("Workflow state objects must be plain JSON objects");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("Workflow state objects cannot have symbol properties");
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        throw new TypeError("Workflow state object keys must be strings");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError("Workflow state objects must contain enumerable data values");
      }
      assertJsonValue(descriptor.value, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
};

export const serializeWorkflowState = (state: unknown): string => {
  assertJsonValue(state);
  const serialized = JSON.stringify(state);
  if (serialized === undefined) {
    throw new TypeError("Workflow state did not serialize as JSON");
  }
  if (Buffer.byteLength(serialized, "utf8") > maxCheckpointBytes) {
    throw new TypeError("Workflow state exceeds the checkpoint size limit");
  }
  return serialized;
};

export const parseWorkflowCheckpoint = (source: string): E2EWorkflowCheckpoint => {
  if (Buffer.byteLength(source, "utf8") > maxCheckpointBytes) {
    throw new TypeError("Workflow checkpoint exceeds the size limit");
  }
  const result = parseStrictJson(source);
  if (result.kind === "invalid") {
    throw new TypeError(result.code === "duplicate-json-key"
      ? `Workflow checkpoint has a duplicate field: ${result.pointer}`
      : "Workflow checkpoint is not strict JSON");
  }
  const parsed = result.value;
  if (!isPlainObject(parsed)) throw new TypeError("Workflow checkpoint must be an object");
  const keys = Reflect.ownKeys(parsed);
  if (
    keys.length !== checkpointFields.length ||
    checkpointFields.some((field) => !Object.hasOwn(parsed, field)) ||
    keys.some((key) => typeof key !== "string" || !checkpointFields.includes(key as typeof checkpointFields[number]))
  ) {
    throw new TypeError("Workflow checkpoint has missing or unsupported fields");
  }
  const checkpoint = parsed as unknown as E2EWorkflowCheckpoint;
  if (
    checkpoint.version !== 1 ||
    typeof checkpoint.scenario !== "string" ||
    checkpoint.scenario.length === 0 ||
    typeof checkpoint.sourceCheckout !== "string" ||
    typeof checkpoint.rootDirectory !== "string" ||
    typeof checkpoint.checkpointPath !== "string" ||
    typeof checkpoint.ownerNonce !== "string" ||
    checkpoint.ownerNonce.length < 16 ||
    (checkpoint.nextPart !== 2 && checkpoint.nextPart !== 3) ||
    typeof checkpoint.fixtureDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(checkpoint.fixtureDigest)
  ) {
    throw new TypeError("Workflow checkpoint has invalid field values");
  }
  for (const path of [checkpoint.sourceCheckout, checkpoint.rootDirectory, checkpoint.checkpointPath]) {
    if (!Path.isAbsolute(path) || Path.resolve(path) !== path) {
      throw new TypeError("Workflow checkpoint contains a non-canonical path");
    }
  }
  assertJsonValue(checkpoint.state);
  return checkpoint;
};

const encodeCheckpoint = (checkpoint: E2EWorkflowCheckpoint): Buffer => {
  const state = serializeWorkflowState(checkpoint.state);
  const { state: _state, ...fields } = checkpoint;
  const envelope = JSON.stringify(fields);
  const encoded = Buffer.from(`${envelope.slice(0, -1)},"state":${state}}\n`, "utf8");
  if (encoded.byteLength > maxCheckpointBytes) {
    throw new TypeError("Workflow checkpoint exceeds the size limit");
  }
  return encoded;
};

const canonicalCheckpointPath = async (
  checkpointPath: string,
  generatedDefault: boolean,
): Promise<string> => {
  const absolutePath = Path.resolve(checkpointPath);
  const realParent = await Fs.realpath(Path.dirname(absolutePath));
  const canonicalPath = Path.join(realParent, Path.basename(absolutePath));
  if (!generatedDefault && canonicalPath !== absolutePath) {
    throw new Error(`E2E workflow checkpoint has a symlinked parent: ${absolutePath}`);
  }
  return canonicalPath;
};

const assertCheckpointStat = (path: string, stat: Stats): void => {
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
    throw new Error(`E2E workflow checkpoint is not an owned regular file: ${path}`);
  }
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw new Error(`E2E workflow checkpoint is not private: ${path}`);
  }
};

const readCheckpointBytes = async (path: string): Promise<Buffer> => {
  const handle = await Fs.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    assertCheckpointStat(path, stat);
    if (stat.size > maxCheckpointBytes) {
      throw new Error(`E2E workflow checkpoint exceeds the size limit: ${path}`);
    }
    const bytes = Buffer.allocUnsafe(stat.size + 1);
    let length = 0;
    while (length < bytes.byteLength) {
      const result = await handle.read(bytes, length, bytes.byteLength - length, length);
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    if (length !== stat.size) {
      throw new Error(`E2E workflow checkpoint changed while being read; preserving it: ${path}`);
    }
    return bytes.subarray(0, length);
  } finally {
    await handle.close();
  }
};

const decodeCheckpointBytes = (bytes: Buffer): string =>
  new TextDecoder("utf-8", { fatal: true }).decode(bytes);

const writeTempCheckpoint = async (path: string, bytes: Buffer): Promise<string> => {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  const handle = await Fs.open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await Fs.chmod(temporaryPath, 0o600);
  return temporaryPath;
};

const writeNewCheckpoint = async (path: string, bytes: Buffer): Promise<void> => {
  let temporaryPath: string | undefined;
  try {
    temporaryPath = await writeTempCheckpoint(path, bytes);
    await Fs.link(temporaryPath, path);
  } finally {
    if (temporaryPath) await Fs.rm(temporaryPath, { force: true });
  }
};

const replaceCheckpoint = async (
  path: string,
  previous: Buffer,
  next: Buffer,
): Promise<void> => {
  let temporaryPath: string | undefined;
  try {
    temporaryPath = await writeTempCheckpoint(path, next);
    const current = await readCheckpointBytes(path);
    if (!current.equals(previous)) {
      throw new Error(`E2E workflow checkpoint changed while the part was running: ${path}`);
    }
    await Fs.rename(temporaryPath, path);
    temporaryPath = undefined;
  } finally {
    if (temporaryPath) await Fs.rm(temporaryPath, { force: true });
  }
};

const removeCheckpointIfExact = async (path: string, expected: Buffer): Promise<void> => {
  const current = await readCheckpointBytes(path);
  if (!current.equals(expected)) {
    throw new Error(`E2E workflow checkpoint changed before cleanup; preserving it: ${path}`);
  }
  await Fs.unlink(path);
};

const fixtureDigest = async (
  harness: E2EHarness,
  ownerNonce: string,
): Promise<string> => {
  await new TemporaryE2EResourceConnector().resume(
    harness.resources.rootDirectory,
    ownerNonce,
  );
  const hash = createHash("sha256");
  const walk = async (directory: string, relativeDirectory: string): Promise<void> => {
    const entries = await Fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of entries) {
      const fullPath = Path.join(directory, entry.name);
      const relativePath = relativeDirectory === ""
        ? entry.name
        : Path.join(relativeDirectory, entry.name);
      const stat = await Fs.lstat(fullPath);
      const relativeBytes = Buffer.from(relativePath.split(Path.sep).join("/"), "utf8");
      if (stat.isSymbolicLink()) {
        throw new Error(`E2E fixture contains a symbolic link: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        hash.update("D\0");
        hash.update(relativeBytes);
        hash.update("\0");
        await walk(fullPath, relativePath);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`E2E fixture contains a non-file entry: ${relativePath}`);
      }
      const contents = await Fs.readFile(fullPath);
      hash.update("F\0");
      hash.update(relativeBytes);
      hash.update("\0");
      hash.update(String(contents.byteLength));
      hash.update("\0");
      hash.update(contents);
      hash.update("\0");
    }
  };
  await walk(harness.resources.rootDirectory, "");
  return hash.digest("hex");
};

const appendCleanupFailures = (original: unknown, failures: unknown[]): never => {
  if (failures.length === 0) throw original;
  throw new AggregateError(
    [original, ...failures],
    "E2E workflow failed and cleanup was incomplete; owned data may remain",
  );
};

export class E2EWorkflow {
  private readonly scenario: string;
  private readonly checkpointPath: string;
  private readonly generatedDefault: boolean;
  private readonly connector: ApplicationConnector | undefined;

  constructor(scenario: string, options: E2EWorkflowOptions = {}) {
    if (typeof scenario !== "string" || scenario.trim().length === 0 || scenario.length > 200) {
      throw new TypeError("E2E workflow scenario must be a non-empty string of at most 200 characters");
    }
    const suppliedPath = options.checkpointPath ?? process.env.KEPLER_E2E_WORKFLOW_CHECKPOINT;
    this.generatedDefault = suppliedPath === undefined;
    const checkpointPath = suppliedPath ?? Path.join(
      Os.tmpdir(),
      `kepler-e2e-workflow-${randomUUID()}.json`,
    );
    if (checkpointPath.length === 0) {
      throw new TypeError("E2E workflow checkpoint path must not be empty");
    }
    this.scenario = scenario;
    this.checkpointPath = Path.resolve(checkpointPath);
    this.connector = options.connector;
  }

  async start<T>(operation: (harness: E2EHarness) => Promise<T>): Promise<void> {
    const checkpointPath = await canonicalCheckpointPath(
      this.checkpointPath,
      this.generatedDefault,
    );
    try {
      await Fs.lstat(checkpointPath);
      throw new Error(`E2E workflow checkpoint already exists; refusing to overwrite: ${checkpointPath}`);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }
    const harness = await createE2EHarness({
      application: "native",
      ...(this.connector ? { connector: this.connector } : {}),
    });
    try {
      const state = await operation(harness);
      const stateJson = serializeWorkflowState(state);
      const digest = await fixtureDigest(harness, harness.resources.ownerNonce);
      const sourceCheckout = await Fs.realpath(projectRoot);
      const checkpoint: E2EWorkflowCheckpoint = {
        version: 1,
        scenario: this.scenario,
        sourceCheckout,
        rootDirectory: harness.resources.rootDirectory,
        checkpointPath,
        ownerNonce: harness.resources.ownerNonce,
        nextPart: 2,
        fixtureDigest: digest,
        state: JSON.parse(stateJson) as unknown,
      };
      await writeNewCheckpoint(checkpointPath, encodeCheckpoint(checkpoint));
    } catch (error) {
      const failures: unknown[] = [];
      try {
        await harness.cleanup();
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
      appendCleanupFailures(error, failures);
    }
  }

  async continue<T, U>(
    part: number,
    operation: (harness: E2EHarness, state: T) => Promise<U>,
  ): Promise<void> {
    if (part !== 2) throw new Error(`E2E workflow continuation part must be 2, received ${part}`);
    const { checkpointPath, checkpoint, bytes, harness } = await this.restore(part);
    try {
      const state = await operation(harness, checkpoint.state as T);
      const stateJson = serializeWorkflowState(state);
      const digest = await fixtureDigest(harness, checkpoint.ownerNonce);
      const next: E2EWorkflowCheckpoint = {
        ...checkpoint,
        nextPart: 3,
        fixtureDigest: digest,
        state: JSON.parse(stateJson) as unknown,
      };
      await replaceCheckpoint(checkpointPath, bytes, encodeCheckpoint(next));
    } catch (error) {
      await this.failAndClean(harness, checkpointPath, bytes, error);
    }
  }

  async finish<T>(
    part: number,
    operation: (harness: E2EHarness, state: T) => Promise<void>,
  ): Promise<void> {
    if (part !== 3) throw new Error(`E2E workflow final part must be 3, received ${part}`);
    const { checkpointPath, checkpoint, bytes, harness } = await this.restore(part);
    try {
      await operation(harness, checkpoint.state as T);
    } catch (error) {
      await this.failAndClean(harness, checkpointPath, bytes, error);
    }
    const failures: unknown[] = [];
    try {
      await harness.cleanup();
    } catch (error) {
      failures.push(error);
    }
    if (failures.length === 0) {
      try {
        await removeCheckpointIfExact(checkpointPath, bytes);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "E2E workflow finished but cleanup was incomplete");
    }
  }

  private async restore(part: 2 | 3): Promise<{
    readonly checkpointPath: string;
    readonly checkpoint: E2EWorkflowCheckpoint;
    readonly bytes: Buffer;
    readonly harness: E2EHarness;
  }> {
    const checkpointPath = await canonicalCheckpointPath(
      this.checkpointPath,
      this.generatedDefault,
    );
    const bytes = await readCheckpointBytes(checkpointPath);
    const checkpoint = parseWorkflowCheckpoint(decodeCheckpointBytes(bytes));
    const sourceCheckout = await Fs.realpath(projectRoot);
    if (
      checkpoint.scenario !== this.scenario ||
      checkpoint.sourceCheckout !== sourceCheckout ||
      checkpoint.checkpointPath !== checkpointPath ||
      checkpoint.nextPart !== part
    ) {
      throw new Error("E2E workflow checkpoint does not match this scenario, checkout, path, or part");
    }
    const harness = await resumeE2EHarness(
      checkpoint.rootDirectory,
      checkpoint.ownerNonce,
      {
        application: "native",
        ...(this.connector ? { connector: this.connector } : {}),
      },
    );
    const actualDigest = await fixtureDigest(harness, checkpoint.ownerNonce);
    if (actualDigest !== checkpoint.fixtureDigest) {
      throw new Error("E2E workflow fixture changed after its checkpoint was settled");
    }
    return { checkpointPath, checkpoint, bytes, harness };
  }

  private async failAndClean(
    harness: E2EHarness,
    checkpointPath: string,
    bytes: Buffer,
    original: unknown,
  ): Promise<never> {
    const failures: unknown[] = [];
    let fixtureRemoved = false;
    try {
      await harness.cleanup();
      fixtureRemoved = true;
    } catch (error) {
      failures.push(error);
    }
    if (fixtureRemoved) {
      try {
        await removeCheckpointIfExact(checkpointPath, bytes);
      } catch (error) {
        failures.push(error);
      }
    }
    return appendCleanupFailures(original, failures);
  }
}
