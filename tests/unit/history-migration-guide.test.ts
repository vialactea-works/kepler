import { describe, expect, it } from "vitest";
import { createNodeHistoryMigrationGuideReader, readReleasedHistoryMigrationGuide } from "../../packages/cli/src/cli/history-migration-guide.js";
import { createResourceManifest } from "../../packages/cli/src/cli/release-resources.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

const path = "skills/kepler-lifecycle-migration/referenses/migrations/2026-11-13-mission-history-generations.md";
const reference = `resource:${path}`;
const metadata = "migration_id: 2026-11-13-mission-history-generations\nstatus: released\navailable_in: 3.1.0\nsource_layout: mission-phase-journals\ntarget_layout: mission-history-generations";
const fixture = (header = metadata) => {
  const guide = new TextEncoder().encode(`---\n${header}\n---\n\nFixture migration resource\n`);
  const files = [...createSetupBundleFixture({ release: "3.1.0" }).files, { path, contents: guide }];
  return { guide, snapshot: { manifest: JSON.stringify(createResourceManifest("3.1.0", files)), files } };
};

describe("matched released history migration guide", () => {
  it("returns exact validated resource bytes only for the supported released transition", () => {
    const { guide, snapshot } = fixture();
    const actual = readReleasedHistoryMigrationGuide(reference, snapshot, "3.1.0");
    expect(actual).toEqual(guide);
    actual.fill(0);
    expect(readReleasedHistoryMigrationGuide(reference, snapshot, "3.1.0")).toEqual(guide);
  });

  it.each([
    metadata.replace("status: released", "status: planned").replace("available_in: 3.1.0", "available_in: null"),
    metadata.replace("available_in: 3.1.0", "available_in: 3.1.1"),
    metadata.replace("available_in: 3.1.0", "available_in: 03.1.0"),
    metadata.replace("available_in: 3.1.0", "available_in: 9007199254740992.0.0"),
  ])("rejects planned, future, or invalid release availability", (header) => {
    expect(() => readReleasedHistoryMigrationGuide(reference, fixture(header).snapshot, "3.1.0")).toThrow(expect.objectContaining({ code: "history_migration_guide_unreleased" }));
  });

  it.each([
    metadata.replace("mission-phase-journals", "unrelated-layout"),
    metadata.replace("2026-11-13-mission-history-generations", "other-transition"),
    `${metadata}\nunknown: true`,
    `${metadata}\nstatus: released`,
  ])("rejects mismatched, unknown, or duplicate guide fields", (header) => {
    expect(() => readReleasedHistoryMigrationGuide(reference, fixture(header).snapshot, "3.1.0")).toThrow();
  });

  it("rejects arbitrary paths, missing bytes, changed resources and mismatched releases", () => {
    const { snapshot } = fixture();
    for (const value of [path, `resource:../${path}`, "mission-file:guide.md"]) expect(() => readReleasedHistoryMigrationGuide(value, snapshot, "3.1.0")).toThrow(expect.objectContaining({ code: "history_migration_guide_unsupported" }));
    expect(() => readReleasedHistoryMigrationGuide(reference, { ...snapshot, files: snapshot.files.slice(0, -1) }, "3.1.0")).toThrow();
    expect(() => readReleasedHistoryMigrationGuide(reference, { ...snapshot, files: snapshot.files.map((file) => file.path === path ? { ...file, contents: new TextEncoder().encode("changed") } : file) }, "3.1.0")).toThrow();
    expect(() => readReleasedHistoryMigrationGuide(reference, snapshot, "3.2.0")).toThrow();
  });

  it("does not grant migration from an unverified source-mode package", async () => {
    await expect(createNodeHistoryMigrationGuideReader()(reference)).rejects.toMatchObject({ code: "history_migration_package_unverified" });
  });
});
