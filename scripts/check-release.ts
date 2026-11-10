import { readSourceIdentity } from "./release-identity.js";
import { checkReleaseConsistency } from "./release-preparation.js";

const root = process.cwd();
const result = checkReleaseConsistency(root);
if (result.staleFiles.length > 0) {
  throw new Error(`Derived resource outputs are stale: ${result.staleFiles.join(", ")}`);
}
const source = readSourceIdentity(root);
const sourceStatus = source.kind === "production"
  ? "frozen source"
  : "development source; not eligible for production packaging";
process.stdout.write(
  `Kepler ${result.version} is internally consistent with schema ${result.schemaVersion} and resources ${result.resourceDigest}; ${sourceStatus} ${source.commit} (${source.content_digest})\n`,
);
