import { execFileSync } from "node:child_process";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import {
  reconcileCorePackage,
  type CorePackageRegistry,
} from "./core-package-reconciliation.js";

const values = parseArguments(process.argv.slice(2));
const assetsDirectory = required(values, "--assets");
const tarballPath = required(values, "--tarball");
const packageName = required(values, "--package-name");
const version = required(values, "--version");
const sourceCommit = required(values, "--source-commit");
const registryUrl = required(values, "--registry");
const packageId = `${packageName}@${version}`;

const registry: CorePackageRegistry = {
  readTarball(name, release) {
    const id = `${name}@${release}`;
    let metadata: string;
    try {
      metadata = execFileSync("npm", ["view", id, "dist.tarball", "--json", "--registry", registryUrl], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
        env: process.env,
      });
    } catch (error) {
      const stderr = error instanceof Error && "stderr" in error ? String(error.stderr) : String(error);
      if (/\bE404\b|404 Not Found/i.test(stderr)) return undefined;
      throw new Error(`Could not determine whether ${id} exists in ${registryUrl}: ${stderr}`);
    }
    let tarballUrl: unknown;
    try {
      tarballUrl = JSON.parse(metadata) as unknown;
    } catch (error) {
      throw new Error(`Registry returned invalid tarball metadata for ${id}`, { cause: error });
    }
    if (typeof tarballUrl !== "string" || !tarballUrl.startsWith("https://")) {
      throw new Error(`Registry returned no safe HTTPS tarball URL for ${id}`);
    }
    const directory = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-core-registry-read-"));
    try {
      const packed = execFileSync("npm", [
        "pack",
        id,
        "--json",
        "--pack-destination",
        directory,
        "--registry",
        registryUrl,
      ], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
        env: process.env,
      });
      const records = JSON.parse(packed) as readonly { readonly filename?: unknown }[];
      const filename = records[0]?.filename;
      if (typeof filename !== "string" || Path.basename(filename) !== filename) {
        throw new Error(`Registry returned an invalid packed filename for ${id}`);
      }
      return new Uint8Array(Fs.readFileSync(Path.join(directory, filename)));
    } catch (error) {
      throw new Error(`Could not download the existing registry tarball for ${id}: ${errorMessage(error)}`, { cause: error });
    } finally {
      Fs.rmSync(directory, { recursive: true, force: true });
    }
  },
  publish(name, release, exactTarballPath) {
    execFileSync("npm", [
      "publish",
      exactTarballPath,
      "--registry",
      registryUrl,
    ], {
      stdio: "inherit",
      timeout: 120_000,
      env: process.env,
    });
    process.stdout.write(`Published exact verified tarball for ${name}@${release}\n`);
  },
};

try {
  const result = reconcileCorePackage({
    assetsDirectory,
    tarballPath,
    packageName,
    version,
    sourceCommit,
  }, registry);
  process.stdout.write(`${JSON.stringify({ status: "success", package: packageId, result })}\n`);
} catch (error) {
  process.stderr.write(`${errorMessage(error)}\n`);
  process.exitCode = 1;
}

function parseArguments(arguments_: readonly string[]): Map<string, string> {
  const accepted = new Set([
    "--assets",
    "--tarball",
    "--package-name",
    "--version",
    "--source-commit",
    "--registry",
  ]);
  if (arguments_.length % 2 !== 0) throw new Error("Expected --name value pairs");
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key || !accepted.has(key) || !value || values.has(key)) {
      throw new Error(`Invalid or duplicate argument: ${String(key)}`);
    }
    values.set(key, value);
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if ("stderr" in error) return String(error.stderr);
    return error.message;
  }
  return String(error);
}
