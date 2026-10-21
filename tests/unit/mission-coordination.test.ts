import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as Path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createMissionCoordination, type MissionCoordinationRequest } from "../../packages/cli/src/construction/mission-coordination.js";
import { nodeMissionCoordinationFileSystem } from "../../packages/cli/src/construction/mission-coordination-runtime.js";

const roots: string[] = [];
const missionId = "10000000-0000-4000-8000-000000000001";
const resourceKey = "a".repeat(64);

const setup = async () => {
  const root = await mkdtemp(Path.join(tmpdir(), "kepler-coordination-"));
  roots.push(root);
  const coordinator = createMissionCoordination(nodeMissionCoordinationFileSystem, { next: randomUUID });
  const request: MissionCoordinationRequest = {
    commonDirectory: root,
    location: { kind: "code-workspace" },
    resourceKey,
    owner: {
      machine_id: "test-host",
      process_id: 123,
      process_incarnation_id: "20000000-0000-4000-8000-000000000002",
      mission_id: missionId,
      resource_scope: `code-workspace:${resourceKey}`,
    },
  };
  return { root, coordinator, request };
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("mission local coordination", () => {
  it("atomically claims the common-directory resource, records owner identity, and releases it", async () => {
    const { root, coordinator, request } = await setup();
    const acquired = await coordinator.acquire(request);

    expect(acquired.kind).toBe("acquired");
    if (acquired.kind !== "acquired") return;
    const ownerPath = Path.join(root, "kepler", "workspaces", resourceKey, "owner.json");
    expect(JSON.parse(await readFile(ownerPath, "utf8"))).toMatchObject({
      token: acquired.lease.owner.token,
      machine_id: "test-host",
      process_id: 123,
      process_incarnation_id: "20000000-0000-4000-8000-000000000002",
      mission_id: missionId,
      resource_scope: `code-workspace:${resourceKey}`,
    });
    expect(await coordinator.acquire(request)).toMatchObject({ kind: "failed", code: "resource_contended" });

    expect(await acquired.lease.release()).toEqual({ kind: "released" });
    expect(await coordinator.acquire(request)).toMatchObject({ kind: "acquired" });
  });

  it("keeps the acquired lock intact when release-token allocation fails", async () => {
    const { request } = await setup();
    let calls = 0;
    const coordinator = createMissionCoordination(nodeMissionCoordinationFileSystem, {
      next: () => {
        calls += 1;
        if (calls === 2) throw new Error("identity source unavailable");
        return "30000000-0000-4000-8000-000000000003";
      },
    });
    const acquired = await coordinator.acquire(request);

    expect(acquired.kind).toBe("acquired");
    if (acquired.kind !== "acquired") return;
    expect(await acquired.lease.release()).toMatchObject({ kind: "failed", code: "coordination_identity_failed" });
    expect(await nodeMissionCoordinationFileSystem.pathKind(acquired.lease.lockPath)).toBe("directory");
    expect(JSON.parse(await readFile(Path.join(acquired.lease.lockPath, "owner.json"), "utf8"))).toEqual(acquired.lease.owner);
    expect(await coordinator.acquire(request)).toMatchObject({ kind: "failed", code: "resource_contended" });
  });

  it("allows exactly one concurrent acquisition of a contended resource", async () => {
    const { coordinator, request } = await setup();
    const [first, second] = await Promise.all([
      coordinator.acquire(request),
      coordinator.acquire({ ...request, owner: { ...request.owner, process_id: 124 } }),
    ]);

    expect([first.kind, second.kind].filter((kind) => kind === "acquired")).toHaveLength(1);
    expect([first, second].filter((result) => result.kind === "failed")).toMatchObject([
      { kind: "failed", code: "resource_contended" },
    ]);
    const acquired = first.kind === "acquired" ? first : second.kind === "acquired" ? second : undefined;
    expect(acquired).toBeDefined();
    if (acquired) expect(await acquired.lease.release()).toEqual({ kind: "released" });
  });

  it("places mission-local coordination under that record common directory's mission coordination sibling", async () => {
    const { root, coordinator, request } = await setup();
    const result = await coordinator.acquire({
      ...request,
      location: { kind: "mission", missionId },
      resourceKey: "c".repeat(64),
      owner: { ...request.owner, resource_scope: "mission-startup" },
    });

    expect(result.kind).toBe("acquired");
    if (result.kind !== "acquired") return;
    expect(result.lease.lockPath).toBe(Path.join(root, "kepler", "missions", missionId, "coordination", "c".repeat(64)));
    expect(await result.lease.release()).toEqual({ kind: "released" });
    expect(await nodeMissionCoordinationFileSystem.pathKind(Path.join(root, "kepler", "workspaces"))).toBe("missing");
  });

  it("fails closed on a partial lock without deleting it", async () => {
    const { root, coordinator, request } = await setup();
    const lockPath = Path.join(root, "kepler", "workspaces", resourceKey);
    await mkdir(lockPath, { recursive: true });

    const result = await coordinator.acquire(request);

    expect(result).toMatchObject({ kind: "failed", code: "resource_contended" });
    expect(await nodeMissionCoordinationFileSystem.pathKind(lockPath)).toBe("directory");
    expect(await nodeMissionCoordinationFileSystem.pathKind(Path.join(lockPath, "owner.json"))).toBe("missing");
  });

  it("leaves a replacement claim canonical and lets its holder release it", async () => {
    const { coordinator, request } = await setup();
    const acquired = await coordinator.acquire(request);
    expect(acquired.kind).toBe("acquired");
    if (acquired.kind !== "acquired") return;

    const lockPath = acquired.lease.lockPath;
    await rm(lockPath, { recursive: true });
    const replacement = await coordinator.acquire({
      ...request,
      owner: { ...request.owner, process_id: 124, resource_scope: "replacement-owner" },
    });
    expect(replacement.kind).toBe("acquired");
    if (replacement.kind !== "acquired") return;

    const released = await acquired.lease.release();

    expect(released).toMatchObject({ kind: "failed", code: "coordination_owner_replaced" });
    expect(JSON.parse(await readFile(Path.join(lockPath, "owner.json"), "utf8"))).toEqual(replacement.lease.owner);
    expect(await nodeMissionCoordinationFileSystem.pathKind(`${lockPath}.releasing`)).toBe("missing");
    const directory = Path.dirname(lockPath);
    expect((await nodeMissionCoordinationFileSystem.listDirectory(directory))
      .some((name) => name.startsWith(`${resourceKey}.owner-moving-`))).toBe(false);
    expect(await coordinator.acquire(request)).toMatchObject({ kind: "failed", code: "resource_contended" });
    expect(await replacement.lease.release()).toEqual({ kind: "released" });

    const unrelated = await coordinator.acquire({ ...request, resourceKey: "b".repeat(64) });
    expect(unrelated.kind).toBe("acquired");
    if (unrelated.kind === "acquired") expect(await unrelated.lease.release()).toEqual({ kind: "released" });
  });

  it("restores a replacement claim created during the release rename", async () => {
    const root = await mkdtemp(Path.join(tmpdir(), "kepler-coordination-release-race-"));
    roots.push(root);
    const lockPath = Path.join(root, "kepler", "workspaces", resourceKey);
    const replacement = {
      token: randomUUID(),
      machine_id: "replacement-host",
      process_id: 124,
      process_incarnation_id: "30000000-0000-4000-8000-000000000003",
      mission_id: missionId,
      resource_scope: "replacement-owner",
    };
    let replaceDuringRename = false;
    const fileSystem = {
      ...nodeMissionCoordinationFileSystem,
      rename: async (from: string, to: string): Promise<void> => {
        if (from === lockPath && replaceDuringRename) {
          replaceDuringRename = false;
          await rm(from, { recursive: true });
          await mkdir(from);
          await writeFile(Path.join(from, "owner.json"), `${JSON.stringify(replacement)}\n`);
        }
        await nodeMissionCoordinationFileSystem.rename(from, to);
      },
    };
    const coordinator = createMissionCoordination(fileSystem, { next: randomUUID });
    const request: MissionCoordinationRequest = {
      commonDirectory: root,
      location: { kind: "code-workspace" },
      resourceKey,
      owner: {
        machine_id: "test-host",
        process_id: 123,
        process_incarnation_id: "20000000-0000-4000-8000-000000000002",
        mission_id: missionId,
        resource_scope: `code-workspace:${resourceKey}`,
      },
    };
    const acquired = await coordinator.acquire(request);
    expect(acquired.kind).toBe("acquired");
    if (acquired.kind !== "acquired") return;
    replaceDuringRename = true;

    const released = await acquired.lease.release();

    expect(released).toMatchObject({ kind: "failed", code: "coordination_owner_replaced" });
    expect(JSON.parse(await readFile(Path.join(lockPath, "owner.json"), "utf8"))).toEqual(replacement);
    expect(await nodeMissionCoordinationFileSystem.pathKind(`${lockPath}.releasing`)).toBe("missing");
    expect(await coordinator.acquire(request)).toMatchObject({ kind: "failed", code: "resource_contended" });
  });

  it("checks directory identity when a replacement copies the original owner token", async () => {
    const { coordinator, request } = await setup();
    const acquired = await coordinator.acquire(request);
    expect(acquired.kind).toBe("acquired");
    if (acquired.kind !== "acquired") return;

    const lockPath = acquired.lease.lockPath;
    const originalOwner = await readFile(Path.join(lockPath, "owner.json"), "utf8");
    await rm(lockPath, { recursive: true });
    await mkdir(lockPath);
    await writeFile(Path.join(lockPath, "owner.json"), originalOwner);

    const released = await acquired.lease.release();

    expect(released).toMatchObject({ kind: "failed", code: "coordination_owner_replaced" });
    expect(JSON.parse(await readFile(Path.join(lockPath, "owner.json"), "utf8"))).toEqual(acquired.lease.owner);
    expect(await nodeMissionCoordinationFileSystem.pathKind(`${lockPath}.releasing`)).toBe("missing");
    expect((await nodeMissionCoordinationFileSystem.listDirectory(Path.dirname(lockPath)))
      .some((name) => name.startsWith(`${resourceKey}.owner-moving-`))).toBe(false);
  });
});
