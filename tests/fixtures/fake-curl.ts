#!/usr/bin/env bun
import { copyFileSync } from "node:fs";
import * as Path from "node:path";

const args = process.argv.slice(2);
const outputIndex = args.indexOf("-o");
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
const assetUrl = args.at(-1);
const assetDirectory = process.env.KEPLER_TEST_ASSETS;

if (!outputPath || !assetUrl || !assetDirectory) {
  process.stderr.write("invalid local release-asset request\n");
  process.exitCode = 2;
} else {
  try {
    const assetName = Path.basename(new URL(assetUrl).pathname);
    copyFileSync(
      Path.join(assetDirectory, assetName),
      Path.resolve(process.cwd(), outputPath),
    );
  } catch (error) {
    process.stderr.write(
      `local release asset unavailable: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 22;
  }
}
