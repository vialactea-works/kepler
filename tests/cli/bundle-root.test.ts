import { describe, it, expect } from "vitest"
import {
  resolveBundleRoot,
  BundleOverrideNotFoundError,
  BundleRootNotFoundError,
  resolvePackageRoot,
} from "../../packages/cli/src/cli/bundle-root.js"

describe("resolveBundleRoot", () => {
  it("does not fall back to a source checkout for an unselected package", () => {
    const sourceDir = "/repo/packages/cli/src/cli"
    const existingPaths = new Set(["/repo/bundle"])

    expect(() => resolveBundleRoot({
      env: {},
      execPath: "/usr/local/bin/kepler",
      sourceDir,
      existsSync: (path: string) => existingPaths.has(path),
      realpathSync: (path: string) => path,
    })).toThrow(BundleRootNotFoundError)
  })

  it("resolves from binary-sibling bundle when available", () => {
    const sourceDir = "/repo/packages/cli/src/cli"
    const mockEnv = {}
    const mockExecPath = "/opt/kepler/bin/kepler"
    const existingPaths = new Set([
      "/opt/kepler",
      "/opt/kepler/package.json",
      "/opt/kepler/bundle/manifest.json",
    ])

    const result = resolveBundleRoot({
      env: mockEnv,
      execPath: mockExecPath,
      sourceDir,
      existsSync: (path: string) => existingPaths.has(path),
      realpathSync: (path: string) => path,
    })

    expect(result).toBe("/opt/kepler/bundle")
  })

  it("throws BundleRootNotFoundError when no bundle directory exists", () => {
    const sourceDir = "/repo/packages/cli/src/cli"
    const mockEnv = {}
    const mockExecPath = "/usr/local/bin/kepler"
    const existingPaths = new Set<string>()

    expect(() => {
      resolveBundleRoot({
        env: mockEnv,
        execPath: mockExecPath,
        sourceDir,
        existsSync: (path: string) => existingPaths.has(path),
        realpathSync: (path: string) => path,
      })
    }).toThrow(BundleRootNotFoundError)
  })

  it("BundleRootNotFoundError lists all checked paths", () => {
    const sourceDir = "/repo/packages/cli/src/cli"
    const mockEnv = {}
    const mockExecPath = "/usr/local/bin/kepler"
    const existingPaths = new Set<string>()

    try {
      resolveBundleRoot({
        env: mockEnv,
        execPath: mockExecPath,
        sourceDir,
        existsSync: (path: string) => existingPaths.has(path),
        realpathSync: (path: string) => path,
      })
      expect.fail("Should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(BundleRootNotFoundError)
      const error = e as BundleRootNotFoundError
      const message = error.message
      expect(message).toContain("Could not locate the Kepler package generation")
      expect(message).toContain("/usr/local/package.json")
      expect(message).toContain("/usr/local/bundle/manifest.json")
    }
  })

  it("uses KEPLER_BUNDLE_DIR env var when set and path exists", () => {
    const sourceDir = "/repo/packages/cli/src/cli"
    const mockEnv = { KEPLER_BUNDLE_DIR: "/custom/bundle" }
    const mockExecPath = "/usr/local/bin/kepler"
    const existingPaths = new Set(["/custom/bundle"])

    const result = resolveBundleRoot({
      env: mockEnv,
      execPath: mockExecPath,
      sourceDir,
      existsSync: (path: string) => existingPaths.has(path),
      realpathSync: (path: string) => path,
    })

    expect(result).toBe("/custom/bundle")
  })

  it("KEPLER_BUNDLE_DIR env var takes precedence over other branches", () => {
    const sourceDir = "/repo/packages/cli/src/cli"
    const mockEnv = { KEPLER_BUNDLE_DIR: "/custom/bundle" }
    const mockExecPath = "/opt/kepler/bin/kepler"
    const existingPaths = new Set(["/custom/bundle", "/opt/kepler/bundle", "/repo/bundle"])

    const result = resolveBundleRoot({
      env: mockEnv,
      execPath: mockExecPath,
      sourceDir,
      existsSync: (path: string) => existingPaths.has(path),
      realpathSync: (path: string) => path,
    })

    expect(result).toBe("/custom/bundle")
  })

  it("fails instead of falling back when an explicit bundle override is missing", () => {
    const sourceDir = "/repo/packages/cli/src/cli"
    const mockEnv = { KEPLER_BUNDLE_DIR: "/custom/nonexistent" }
    const existingPaths = new Set(["/repo/bundle"])
    const checked: string[] = []

    expect(() =>
      resolveBundleRoot({
        env: mockEnv,
        execPath: "/usr/local/bin/kepler",
        sourceDir,
        existsSync: (path: string) => {
          checked.push(path)
          return existingPaths.has(path)
        },
        realpathSync: (path: string) => path,
      }),
    ).toThrow(BundleOverrideNotFoundError)
    expect(checked).toEqual(["/custom/nonexistent"])
  })

  it("rejects an explicitly empty bundle override", () => {
    expect(() =>
      resolveBundleRoot({
        env: { KEPLER_BUNDLE_DIR: "" },
        execPath: "/usr/local/bin/kepler",
        sourceDir: "/repo/packages/cli/src/cli",
        existsSync: () => false,
        realpathSync: (path: string) => path,
      }),
    ).toThrow(BundleOverrideNotFoundError)
  })

  it("resolves executable symlinks before locating a sibling bundle", () => {
    const realpaths = new Map([
      ["/usr/local/bin/kepler", "/opt/kepler-dist/generations/current-id/bin/kepler"],
    ])
    const existingPaths = new Set([
      "/opt/kepler-dist/generations/current-id",
      "/opt/kepler-dist/generations/current-id/package.json",
      "/opt/kepler-dist/generations/current-id/bundle/manifest.json",
    ])

    const result = resolveBundleRoot({
      env: {},
      execPath: "/usr/local/bin/kepler",
      sourceDir: "/repo/packages/cli/src/cli",
      existsSync: (path: string) => existingPaths.has(path),
      realpathSync: (path: string) => realpaths.get(path) ?? path,
    })

    expect(result).toBe(
      "/opt/kepler-dist/generations/current-id/bundle",
    )
  })

  it("resolves an explicit complete package root before the executable path", () => {
    const existingPaths = new Set([
      "/dev/package",
      "/dev/package/package.json",
      "/dev/package/bundle/manifest.json",
    ])

    expect(
      resolvePackageRoot({
        env: { KEPLER_PACKAGE_ROOT: "/dev/package" },
        execPath: "/usr/local/bin/kepler",
        existsSync: (path: string) => existingPaths.has(path),
        realpathSync: (path: string) => path,
      }),
    ).toBe("/dev/package")
  })

})
