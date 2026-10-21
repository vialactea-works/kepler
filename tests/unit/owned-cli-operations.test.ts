import { describe, expect, it } from "vitest";
import { GitAuthorLookup } from "../../packages/cli/src/cli/git-author.js";
import {
  parseProjectSelector,
  ProjectResolver,
  type ProjectCommandResult,
  type ProjectSelectionRuntime,
} from "../../packages/cli/src/cli/project-selection.js";
import { generateUuid } from "../../packages/cli/src/cli/uuid.js";

const projectRoot = "/workspace/repo";
const uuid = "11111111-1111-4111-8111-111111111111";

interface RuntimeOptions {
  readonly invalidPath?: boolean;
  readonly bare?: string;
  readonly config?: Partial<Record<"user.name" | "user.email", ProjectCommandResult>>;
}

const createRuntime = (options: RuntimeOptions = {}) => {
  const calls: string[] = [];
  const runtime: ProjectSelectionRuntime = {
    cwd: () => projectRoot,
    fileSystem: {
      realpath: async (path) => {
        calls.push(`realpath:${path}`);
        if (options.invalidPath) throw new Error("ENOENT");
        if (path === projectRoot || path === `${projectRoot}/.kepler`) return path;
        throw new Error("ENOENT");
      },
      directoryExists: async (path) => {
        calls.push(`directory:${path}`);
        return path === projectRoot || path === `${projectRoot}/.kepler`;
      },
    },
    git: {
      isBareRepository: async (cwd) => {
        calls.push(`bare:${cwd}`);
        return { status: 0, stdout: `${options.bare ?? "false"}\n`, stderr: "" };
      },
      repositoryRoot: async (cwd) => {
        calls.push(`root:${cwd}`);
        return { status: 0, stdout: `${projectRoot}\n`, stderr: "" };
      },
      configValue: async (cwd, key) => {
        calls.push(`config:${cwd}:${key}`);
        return (
          options.config?.[key] ??
          (key === "user.name"
            ? { status: 0, stdout: "Ada Lovelace\n", stderr: "" }
            : { status: 0, stdout: "ada@example.com\n", stderr: "" })
        );
      },
    },
  };
  return { runtime, calls };
};

const identityLookup = (options: RuntimeOptions = {}) => {
  const { runtime, calls } = createRuntime(options);
  return { lookup: new GitAuthorLookup(new ProjectResolver(runtime), runtime.git), calls };
};

describe("parseProjectSelector", () => {
  it("accepts the absent or one explicit project path", () => {
    expect(parseProjectSelector(undefined)).toEqual({ kind: "parsed" });
    expect(parseProjectSelector(["../project path"])).toEqual({
      kind: "parsed",
      project: "../project path",
    });
  });

  it.each([
    [[], "invalid_selector"],
    [["one", "two"], "duplicate_selector"],
    ["", "invalid_selector"],
    [42, "invalid_selector"],
  ] as const)("rejects malformed project selectors %j", (value, code) => {
    expect(parseProjectSelector(value)).toMatchObject({ kind: "failed", code });
  });
});

describe("GitAuthorLookup", () => {
  it("returns effective repository Git identity values", async () => {
    const { lookup, calls } = identityLookup();

    await expect(lookup.execute()).resolves.toEqual({
      kind: "resolved",
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(calls).toContain(`config:${projectRoot}:user.name`);
    expect(calls).toContain(`config:${projectRoot}:user.email`);
  });

  it.each([
    {
      name: "reports missing user.name",
      config: { "user.name": { status: 1, stdout: "", stderr: "" } },
      missing: ["user.name"],
    },
    {
      name: "reports missing user.email",
      config: { "user.email": { status: 1, stdout: "", stderr: "" } },
      missing: ["user.email"],
    },
    {
      name: "reports whitespace-only identity values",
      config: {
        "user.name": { status: 0, stdout: " \t\n", stderr: "" },
        "user.email": { status: 0, stdout: "\n", stderr: "" },
      },
      missing: ["user.name", "user.email"],
    },
  ] satisfies ReadonlyArray<{
    readonly name: string;
    readonly config: RuntimeOptions["config"];
    readonly missing: readonly string[];
  }>)("$name", async ({ config, missing }) => {
    const { lookup } = identityLookup({ config });

    await expect(lookup.execute()).resolves.toMatchObject({
      kind: "failed",
      code: "git_identity_missing",
      details: { missing },
    });
  });

  it("reports configuration read failures without falling back", async () => {
    const { lookup } = identityLookup({
      config: {
        "user.name": { status: 128, stdout: "", stderr: "bad config" },
      },
    });

    await expect(lookup.execute()).resolves.toMatchObject({
      kind: "failed",
      code: "git_config_unavailable",
      details: { keys: ["user.name"] },
    });
  });

  it("fails project selection before reading identity", async () => {
    const { lookup, calls } = identityLookup({ invalidPath: true });

    await expect(lookup.execute()).resolves.toMatchObject({
      kind: "failed",
      code: "invalid_project_path",
    });
    expect(calls.some((call) => call.startsWith("config:"))).toBe(false);
  });
});

describe("generateUuid", () => {
  it("returns one lowercase hyphenated UUIDv4", () => {
    expect(generateUuid(() => uuid)).toEqual({ kind: "generated", uuid });
  });

  it("fails closed when generation throws or returns an invalid value", () => {
    expect(generateUuid(() => "not-a-uuid")).toMatchObject({
      kind: "failed",
      code: "uuid_generation_failed",
    });
    expect(
      generateUuid(() => {
        throw new Error("entropy unavailable");
      }),
    ).toMatchObject({ kind: "failed", code: "uuid_generation_failed" });
  });
});
