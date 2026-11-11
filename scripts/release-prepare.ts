import { prepareRelease } from "./release-preparation.js";

const request = process.argv[2];
if (!request || process.argv.length !== 3) {
  throw new Error("Usage: bun run release:prepare patch|minor|major|<version>");
}

const result = prepareRelease(process.cwd(), request);
process.stdout.write(
  `Prepared Kepler ${result.version}; changed ${result.changedFiles.length} files${result.changedFiles.length ? `: ${result.changedFiles.join(", ")}` : ""}\n`,
);
