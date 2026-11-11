import { describe, expect, it, vi } from "vitest";
import type { UnitQueryFileSystem } from "../../packages/cli/src/construction/unit-queries.js";
import { UnitQueries } from "../../packages/cli/src/construction/unit-queries.js";

const root = "/tmp/kepler-unit-query-test";

const createFileSystem = (): UnitQueryFileSystem => ({
  entries: vi.fn(async () => []),
  directories: vi.fn(async () => []),
  journals: vi.fn(async () => []),
  read: vi.fn(async () => new Uint8Array()),
});

describe("UnitQueries", () => {
  it("returns an empty list for an empty record home without creating paths", async () => {
    const fileSystem = createFileSystem();
    const queries = new UnitQueries({ resolve: async () => ({ kind: "resolved", root }) }, fileSystem);

    const result = await queries.list();

    expect(result).toEqual({ kind: "listed", recordHome: root, units: [] });
    expect(fileSystem.entries).toHaveBeenCalledTimes(2);
    expect(fileSystem.directories).not.toHaveBeenCalled();
    expect(fileSystem.read).not.toHaveBeenCalled();
  });

  it("rejects an invalid exact unit selector before resolving or reading a project", async () => {
    const fileSystem = createFileSystem();
    const resolve = vi.fn(async () => ({ kind: "resolved" as const, root }));
    const queries = new UnitQueries({ resolve }, fileSystem);

    const result = await queries.show(" unit ");

    expect(result).toMatchObject({ kind: "failed", code: "invalid_unit_selector" });
    expect(resolve).not.toHaveBeenCalled();
    expect(fileSystem.entries).not.toHaveBeenCalled();
  });

  it("rejects path-bearing Construction scope IDs before resolving or reading a project", async () => {
    const fileSystem = createFileSystem();
    const resolve = vi.fn(async () => ({ kind: "resolved" as const, root }));
    const queries = new UnitQueries({ resolve }, fileSystem);

    const result = await queries.readContext("../../outside");

    expect(result).toMatchObject({ kind: "failed", code: "invalid_unit_selector" });
    expect(resolve).not.toHaveBeenCalled();
    expect(fileSystem.entries).not.toHaveBeenCalled();
  });

  it("returns a bounded read failure without attempting any write operation", async () => {
    const fileSystem = createFileSystem();
    vi.mocked(fileSystem.entries).mockRejectedValue(new Error("record home unavailable"));
    const queries = new UnitQueries({ resolve: async () => ({ kind: "resolved", root }) }, fileSystem);

    const result = await queries.list();

    expect(result).toMatchObject({
      kind: "failed",
      code: "unit_query_read_failed",
      details: { record_home: root, message: "record home unavailable" },
    });
    expect(fileSystem.entries).toHaveBeenCalledTimes(1);
    expect(fileSystem.read).not.toHaveBeenCalled();
  });
});
