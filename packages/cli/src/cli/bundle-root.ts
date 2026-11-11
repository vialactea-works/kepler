import * as Fs from "node:fs";
import * as Path from "node:path";

export interface ResolvePackageRootOptions {
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  existsSync?: (path: string) => boolean;
  realpathSync?: (path: string) => string;
}

export class PackageRootNotFoundError extends Error {
  constructor(checked: string[]) {
    super(
      `Could not locate a complete Kepler package. Checked:\n${checked.map((path) => `  - ${path}`).join("\n")}`,
    );
    this.name = "PackageRootNotFoundError";
  }
}

export class PackageRootOverrideNotFoundError extends Error {
  constructor(path: string | undefined) {
    super(
      path === undefined || path.length === 0
        ? "KEPLER_PACKAGE_ROOT is set but empty"
        : `KEPLER_PACKAGE_ROOT does not identify a complete Kepler package: ${path}`,
    );
    this.name = "PackageRootOverrideNotFoundError";
  }
}

export function resolvePackageRoot(
  options: ResolvePackageRootOptions = {},
): string {
  const env = options.env ?? process.env;
  const execPath = options.execPath ?? process.execPath;
  const existsSync = options.existsSync ?? Fs.existsSync;
  const realpathSync = options.realpathSync ?? Fs.realpathSync;

  if (Object.hasOwn(env, "KEPLER_PACKAGE_ROOT")) {
    const override = env.KEPLER_PACKAGE_ROOT;
    const candidate = override ? Path.resolve(override) : undefined;
    if (!candidate || !isPackageRoot(candidate, existsSync)) {
      throw new PackageRootOverrideNotFoundError(candidate);
    }
    return realpathSync(candidate);
  }

  const resolvedExecPath = realpathSync(execPath);
  const packageRoot = Path.dirname(Path.dirname(resolvedExecPath));
  if (isPackageRoot(packageRoot, existsSync)) return packageRoot;

  throw new PackageRootNotFoundError([
    Path.join(packageRoot, "package.json"),
    Path.join(packageRoot, "bundle", "manifest.json"),
  ]);
}

function isPackageRoot(
  candidate: string,
  existsSync: (path: string) => boolean,
): boolean {
  return (
    existsSync(candidate) &&
    existsSync(Path.join(candidate, "package.json")) &&
    existsSync(Path.join(candidate, "bundle", "manifest.json"))
  );
}
