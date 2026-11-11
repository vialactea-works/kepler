import { describe, expect, it } from "vitest";
import {
  PackageRootNotFoundError,
  PackageRootOverrideNotFoundError,
  resolvePackageRoot,
} from "../../packages/cli/src/cli/bundle-root.js";

describe("resolvePackageRoot", () => {
  it("does not fall back to an unselected source checkout", () => {
    const existingPaths = new Set(["/repo/bundle"]);

    expect(() => resolvePackageRoot({
      env: {},
      execPath: "/usr/local/bin/kepler",
      existsSync: (path: string) => existingPaths.has(path),
      realpathSync: (path: string) => path,
    })).toThrow(PackageRootNotFoundError);
  });

  it("resolves the package root next to the executable", () => {
    const existingPaths = new Set([
      "/opt/kepler",
      "/opt/kepler/package.json",
      "/opt/kepler/bundle/manifest.json",
    ]);

    expect(resolvePackageRoot({
      env: {},
      execPath: "/opt/kepler/bin/kepler",
      existsSync: (path: string) => existingPaths.has(path),
      realpathSync: (path: string) => path,
    })).toBe("/opt/kepler");
  });

  it("reports both package paths checked when no package exists", () => {
    try {
      resolvePackageRoot({
        env: {},
        execPath: "/usr/local/bin/kepler",
        existsSync: () => false,
        realpathSync: (path: string) => path,
      });
      expect.fail("Expected package lookup to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PackageRootNotFoundError);
      expect((error as Error).message).toContain("/usr/local/package.json");
      expect((error as Error).message).toContain("/usr/local/bundle/manifest.json");
    }
  });

  it("rejects an empty or incomplete explicit package root without fallback", () => {
    for (const value of ["", "/custom/incomplete"]) {
      expect(() => resolvePackageRoot({
        env: { KEPLER_PACKAGE_ROOT: value },
        execPath: "/opt/kepler/bin/kepler",
        existsSync: (path: string) => path.startsWith("/opt/kepler/"),
        realpathSync: (path: string) => path,
      })).toThrow(PackageRootOverrideNotFoundError);
    }
  });

  it("resolves a valid explicit package root before the executable path", () => {
    const existingPaths = new Set([
      "/dev/package",
      "/dev/package/package.json",
      "/dev/package/bundle/manifest.json",
    ]);

    expect(resolvePackageRoot({
      env: { KEPLER_PACKAGE_ROOT: "/dev/package" },
      execPath: "/usr/local/bin/kepler",
      existsSync: (path: string) => existingPaths.has(path),
      realpathSync: (path: string) => path,
    })).toBe("/dev/package");
  });

  it("resolves executable symlinks before locating the package", () => {
    const existingPaths = new Set([
      "/opt/kepler/versions/3.0.0",
      "/opt/kepler/versions/3.0.0/package.json",
      "/opt/kepler/versions/3.0.0/bundle/manifest.json",
    ]);

    expect(resolvePackageRoot({
      env: {},
      execPath: "/usr/local/bin/kepler",
      existsSync: (path: string) => existingPaths.has(path),
      realpathSync: (path: string) => path === "/usr/local/bin/kepler"
        ? "/opt/kepler/versions/3.0.0/bin/kepler"
        : path,
    })).toBe("/opt/kepler/versions/3.0.0");
  });
});
