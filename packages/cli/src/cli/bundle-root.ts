import * as Fs from "node:fs";
import * as Path from "node:path";

export interface ResolveBundleRootOptions {
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  sourceDir?: string;
  existsSync?: (path: string) => boolean;
  realpathSync?: (path: string) => string;
}

export class BundleRootNotFoundError extends Error {
  constructor(checked: string[]) {
    super(
      `Could not locate the Kepler package generation. Checked:\n${checked.map((path) => `  - ${path}`).join("\n")}`,
    );
    this.name = "BundleRootNotFoundError";
  }
}

export class BundleOverrideNotFoundError extends Error {
  constructor(path: string | undefined) {
    super(
      path === undefined || path.length === 0
        ? "KEPLER_BUNDLE_DIR is set but empty"
        : `KEPLER_BUNDLE_DIR does not identify an existing bundle directory: ${path}`,
    );
    this.name = "BundleOverrideNotFoundError";
  }
}

export class PackageRootOverrideNotFoundError extends Error {
  constructor(path: string | undefined) {
    super(
      path === undefined || path.length === 0
        ? "KEPLER_PACKAGE_ROOT is set but empty"
        : `KEPLER_PACKAGE_ROOT does not identify a complete Kepler package generation: ${path}`,
    );
    this.name = "PackageRootOverrideNotFoundError";
  }
}

export function resolvePackageRoot(
  options: ResolveBundleRootOptions = {},
): string {
  const env = options.env ?? process.env;
  const execPath = options.execPath ?? process.execPath;
  const existsSync = options.existsSync ?? Fs.existsSync;
  const realpathSync = options.realpathSync ?? Fs.realpathSync;

  if (Object.hasOwn(env, "KEPLER_PACKAGE_ROOT")) {
    const override = env.KEPLER_PACKAGE_ROOT;
    const candidate = override ? Path.resolve(override) : undefined;
    if (
      !candidate ||
      !isPackageRoot(candidate, existsSync) ||
      !existsSync(candidate)
    ) {
      throw new PackageRootOverrideNotFoundError(candidate);
    }
    return realpathSync(candidate);
  }

  const resolvedExecPath = realpathSync(execPath);
  const packageRoot = Path.dirname(Path.dirname(resolvedExecPath));
  if (isPackageRoot(packageRoot, existsSync)) return packageRoot;

  throw new BundleRootNotFoundError([
    Path.join(packageRoot, "package.json"),
    Path.join(packageRoot, "bundle", "manifest.json"),
  ]);
}

export function resolveBundleRoot(
  options: ResolveBundleRootOptions = {},
): string {
  const env = options.env ?? process.env;
  const existsSync = options.existsSync ?? Fs.existsSync;

  if (Object.hasOwn(env, "KEPLER_BUNDLE_DIR")) {
    const override = env.KEPLER_BUNDLE_DIR;
    const candidate = override ? Path.resolve(override) : undefined;
    if (!candidate || !existsSync(candidate)) {
      throw new BundleOverrideNotFoundError(candidate);
    }
    return candidate;
  }

  return Path.join(resolvePackageRoot(options), "bundle");
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
