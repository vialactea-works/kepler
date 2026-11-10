import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

export async function hashArchiveFile(path: string): Promise<string> {
  let metadata: Awaited<ReturnType<typeof lstat>>;
  try {
    metadata = await lstat(path);
  } catch (error) {
    throw new Error(`Could not hash archive: ${errorMessage(error)}`, { cause: error });
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Archive digest input must be an existing regular file: ${path}`);
  }
  const digest = createHash("sha256");
  try {
    await pipeline(createReadStream(path), digest);
  } catch (error) {
    throw new Error(`Could not hash archive: ${errorMessage(error)}`, { cause: error });
  }
  return digest.digest("hex");
}

async function main(): Promise<void> {
  const [archivePath] = process.argv.slice(2);
  if (process.argv.length !== 3 || !archivePath) {
    process.stderr.write("Usage: bun scripts/archive-digest.ts <archive>\n");
    process.exitCode = 2;
    return;
  }
  try {
    process.stdout.write(`${await hashArchiveFile(archivePath)}\n`);
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
