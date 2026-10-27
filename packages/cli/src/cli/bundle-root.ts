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
      `Could not locate the Kepler bundle directory. Checked:\n${checked.map((path) => `  - ${path}`).join("\n")}`,
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

export function resolveBundleRoot(
  options: ResolveBundleRootOptions = {},
): string {
  const env = options.env ?? process.env;
  const execPath = options.execPath ?? process.execPath;
  const sourceDir = options.sourceDir ?? import.meta.dirname;
  const existsSync = options.existsSync ?? Fs.existsSync;
  const realpathSync = options.realpathSync ?? Fs.realpathSync;
  const checked: string[] = [];

  if (Object.hasOwn(env, "KEPLER_BUNDLE_DIR")) {
    const override = env.KEPLER_BUNDLE_DIR;
    const candidate = override ? Path.resolve(override) : undefined;
    if (!candidate || !existsSync(candidate)) {
      throw new BundleOverrideNotFoundError(candidate);
    }
    return candidate;
  }

  const resolvedExecPath = realpathSync(execPath);
  const binarySibling = Path.join(
    Path.dirname(Path.dirname(resolvedExecPath)),
    "bundle",
  );
  checked.push(binarySibling);
  if (existsSync(binarySibling)) return binarySibling;

  const sourceCheckout = Path.join(
    Path.resolve(sourceDir, "..", "..", "..", ".."),
    "bundle",
  );
  checked.push(sourceCheckout);
  if (existsSync(sourceCheckout)) return sourceCheckout;

  throw new BundleRootNotFoundError(checked);
}
