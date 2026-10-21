import { describe, expect, it } from "vitest";
import { MissionHandoffPreflight, type MissionHandoffObjectRequirement } from "../../packages/cli/src/construction/mission-handoff-preflight.js";

const missionId = "10000000-0000-4000-8000-000000000001";
const commit = "a".repeat(40);
const blob = "b".repeat(40);

const createPreflight = (options: {
  readonly reachable?: readonly string[];
  readonly objectTypes?: Readonly<Record<string, string>>;
  readonly missing?: readonly string[];
  readonly commonDirectories?: Readonly<Record<string, string>>;
  readonly realpath?: (path: string) => Promise<string>;
} = {}) => {
  const calls: { cwd: string; args: readonly string[] }[] = [];
  const reachable = options.reachable ?? [commit, blob];
  const objectTypes = options.objectTypes ?? { [commit]: "commit", [blob]: "blob" };
  const missing = new Set(options.missing ?? []);
  const preflight = new MissionHandoffPreflight({
    fileSystem: { realpath: options.realpath ?? (async (path) => path) },
    git: {
      run: async (cwd, args) => {
        calls.push({ cwd, args });
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
          return { status: 0, stdout: `${cwd}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          const common = options.commonDirectories?.[cwd] ?? ".git";
          return { status: 0, stdout: `${common}\n`, stderr: "" };
        }
        if (args[0] === "rev-list") {
          return { status: 0, stdout: reachable.join("\n"), stderr: "" };
        }
        if (args[0] === "cat-file" && args[1] === "-t") {
          const objectId = args[2]!;
          if (missing.has(objectId) || objectTypes[objectId] === undefined) {
            return { status: 128, stdout: "", stderr: "missing object" };
          }
          return { status: 0, stdout: `${objectTypes[objectId]}\n`, stderr: "" };
        }
        return { status: 2, stdout: "", stderr: "unexpected command" };
      },
    },
  });
  return { preflight, calls };
};

const request = (handoffId: string, repositoryPath = "/repo", requiredObjects: readonly MissionHandoffObjectRequirement[] = [
  { repository_id: "application", repository_path: repositoryPath, object_id: commit, object_kind: "commit" as const },
]) => ({ mission_id: missionId, handoff_id: handoffId, required_objects: requiredObjects });

describe("mission handoff preflight", () => {
  it("verifies full commits and other required objects through existing references without write commands", async () => {
    const { preflight, calls } = createPreflight();
    const result = await preflight.execute(request("handoff-1", "/repo", [
      { repository_id: "application", repository_path: "/repo", object_id: commit, object_kind: "commit" },
      { repository_id: "application", repository_path: "/repo", object_id: blob, object_kind: "object" },
    ]));

    expect(result).toMatchObject({
      kind: "ready",
      mission_id: missionId,
      handoff_id: "handoff-1",
      verified_objects: [
        { repository_id: "application", object_id: commit, object_kind: "commit", resolved_kind: "commit" },
        { repository_id: "application", object_id: blob, object_kind: "object", resolved_kind: "blob" },
      ],
    });
    expect(calls.map((call) => call.args[0])).toEqual([
      "rev-parse",
      "rev-parse",
      "rev-parse",
      "rev-parse",
      "rev-list",
      "cat-file",
      "cat-file",
    ]);
    expect(calls.every((call) => !["fetch", "push", "commit", "update-ref", "checkout", "reset"].includes(call.args[0]!))).toBe(true);
  });

  it("fails only the selected handoff when an object is missing, unreachable, or has the wrong kind", async () => {
    const { preflight } = createPreflight({
      reachable: [commit, blob],
      objectTypes: { [commit]: "commit", [blob]: "blob", ["c".repeat(40)]: "blob" },
      missing: ["e".repeat(40)],
    });
    const result = await preflight.execute(request("affected-handoff", "/repo", [
      { repository_id: "application", repository_path: "/repo", object_id: "e".repeat(40), object_kind: "commit" },
      { repository_id: "application", repository_path: "/repo", object_id: "c".repeat(40), object_kind: "object" },
      { repository_id: "application", repository_path: "/repo", object_id: blob, object_kind: "commit" },
    ]));

    expect(result).toMatchObject({
      kind: "failed",
      code: "handoff_material_unavailable",
      details: {
        mission_id: missionId,
        handoff_id: "affected-handoff",
        failures: [
          { repository_id: "application", object_id: "e".repeat(40), reason: "object_missing" },
          { repository_id: "application", object_id: "c".repeat(40), reason: "object_unreachable" },
          { repository_id: "application", object_id: blob, reason: "object_kind_mismatch" },
        ],
      },
    });
  });

  it("accepts linked worktree paths that resolve to the same Git common directory", async () => {
    const { preflight } = createPreflight({
      commonDirectories: { "/repo/primary": "/repo/.git", "/repo/linked": "/repo/.git" },
    });
    const result = await preflight.execute(request("linked-handoff", "/repo/primary", [
      { repository_id: "application", repository_path: "/repo/primary", object_id: commit, object_kind: "commit" },
      { repository_id: "application", repository_path: "/repo/linked", object_id: blob, object_kind: "object" },
    ]));

    expect(result.kind).toBe("ready");
  });

  it("keeps an unrelated handoff available when another repository lacks its object", async () => {
    const { preflight } = createPreflight({
      reachable: [commit],
      objectTypes: { [commit]: "commit" },
    });
    const [affected, unrelated] = await Promise.all([
      preflight.execute(request("affected", "/missing-repo", [{
        repository_id: "missing-repo",
        repository_path: "/missing-repo",
        object_id: blob,
        object_kind: "commit",
      }])),
      preflight.execute(request("unrelated", "/available-repo", [{
        repository_id: "available-repo",
        repository_path: "/available-repo",
        object_id: commit,
        object_kind: "commit",
      }])),
    ]);

    expect(affected).toMatchObject({ kind: "failed", details: { handoff_id: "affected" } });
    expect(unrelated).toMatchObject({ kind: "ready", handoff_id: "unrelated" });
  });

  it("scopes post-Git path disappearance to its repository and continues unrelated repository checks", async () => {
    let missingRootChecks = 0;
    const { preflight, calls } = createPreflight({
      realpath: async (path) => {
        if (path === "/repo/disappearing" && ++missingRootChecks === 2) {
          throw new Error("worktree disappeared during identity verification");
        }
        return path;
      },
    });
    const result = await preflight.execute(request("scoped-handoff", "/repo/disappearing", [
      { repository_id: "disappearing", repository_path: "/repo/disappearing", object_id: commit, object_kind: "commit" },
      { repository_id: "unrelated", repository_path: "/repo/available", object_id: commit, object_kind: "commit" },
    ]));

    expect(result).toMatchObject({
      kind: "failed",
      code: "handoff_material_unavailable",
      details: {
        handoff_id: "scoped-handoff",
        failures: [{ repository_id: "disappearing", reason: "handoff_preflight_failed" }],
      },
    });
    expect(calls.some((call) => call.cwd === "/repo/available" && call.args[0] === "rev-list")).toBe(true);
    expect(calls.some((call) => call.cwd === "/repo/available" && call.args[0] === "cat-file")).toBe(true);
  });

  it("rejects malformed requests before invoking Git", async () => {
    const { preflight, calls } = createPreflight();
    expect(await preflight.execute(null)).toMatchObject({ kind: "failed", code: "invalid_handoff_preflight_request" });
    expect(await preflight.execute({
      mission_id: missionId,
      handoff_id: "invalid-object",
      required_objects: [{ repository_id: "application", repository_path: "relative", object_id: "short", object_kind: "commit" }],
    })).toMatchObject({ kind: "failed", code: "invalid_handoff_preflight_request" });
    expect(calls).toEqual([]);
  });
});
