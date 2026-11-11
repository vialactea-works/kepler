import * as Fs from "node:fs";
import * as Path from "node:path";

const generatedDirectories = new Set([
  ".git",
  "artifacts",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);

export const authoredJavaScriptPaths = (
  paths: readonly string[],
): string[] =>
  paths.filter((sourcePath) => {
    const normalized = sourcePath.replaceAll("\\", "/");
    const segments = normalized.split("/");
    if (segments.some((segment) => generatedDirectories.has(segment))) {
      return false;
    }
    return /\.(?:js|mjs)$/i.test(normalized);
  });

const sourcePaths = (directory: string, relativeDirectory = ""): string[] => {
  const paths: string[] = [];
  for (const entry of Fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (generatedDirectories.has(entry.name)) continue;
      paths.push(
        ...sourcePaths(
          Path.join(directory, entry.name),
          Path.join(relativeDirectory, entry.name),
        ),
      );
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      paths.push(Path.join(relativeDirectory, entry.name));
    }
  }
  return paths;
};

if (import.meta.main) {
  const violations = authoredJavaScriptPaths(sourcePaths(process.cwd())).sort();
  if (violations.length > 0) {
    process.stderr.write(
      `Authored JavaScript source files are not allowed:\n${violations.join("\n")}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("Authored source files use TypeScript.\n");
  }
}
