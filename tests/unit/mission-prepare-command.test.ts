import { describe, expect, it, vi } from "vitest";
import { MissionStartup, type MissionStartupPrepared } from "../../packages/cli/src/construction/mission-startup.js";
import { MissionPrepareCommand } from "../../packages/cli/src/cli/nest/capability.commands.js";
import { ResultReporter } from "../../packages/cli/src/cli/nest/result-reporter.js";

const missionId = "10000000-0000-4000-8000-000000000001" as MissionStartupPrepared["missionId"];
const historyVersion = "20000000-0000-4000-8000-000000000002";
const transferOrigins = ["worktree:prior-a", "worktree:prior-b"];

const prepared: MissionStartupPrepared = {
  kind: "prepared",
  missionId,
  recordHome: "/record",
  historical: true,
  repositories: [],
  history: { mode: "active", historyVersion, generationId: "30000000-0000-4000-8000-000000000003", coordination: "bound" },
};

const commandFixture = () => {
  const output: string[] = [];
  const reporter = new ResultReporter({ stdout: (value) => output.push(value), stderr: () => undefined }, { setExitCode: () => undefined });
  const startup = { prepare: vi.fn(async () => prepared) } as unknown as MissionStartup;
  return { command: new MissionPrepareCommand(reporter, startup), output, startup };
};

describe("mission prepare history handoff selectors", () => {
  it("passes one exact version and repeatable prior origins to startup", async () => {
    const { command, output, startup } = commandFixture();
    expect(command.parseMission(missionId)).toEqual([missionId]);
    expect(command.parseHistoryVersion(historyVersion)).toEqual([historyVersion]);
    expect(command.parseTransferOrigin(transferOrigins[0]!)).toEqual([transferOrigins[0]]);
    await command.run([], { mission: [missionId], historyVersion: [historyVersion], transferOrigin: transferOrigins });
    expect(startup.prepare).toHaveBeenCalledWith(undefined, missionId, { historyVersion, transferOriginIds: transferOrigins });
    expect(JSON.parse(output[0]!)).toMatchObject({ status: "success", data: { history: { history_version: historyVersion, generation_id: prepared.history?.generationId, coordination: "bound" }, execution_started: false } });
  });

  it.each([
    { mission: [missionId], transferOrigin: [transferOrigins[0]] },
    { mission: [missionId], historyVersion: [historyVersion, historyVersion] },
    { mission: [missionId], historyVersion: ["not-a-uuid"] },
    { mission: [missionId], historyVersion: [historyVersion], transferOrigin: [transferOrigins[0], transferOrigins[0]] },
    { mission: [missionId], historyVersion: [historyVersion], transferOrigin: [" worktree:prior"] },
  ])("rejects malformed or duplicate handoff selectors before preparation", async (options) => {
    const { command, output, startup } = commandFixture();
    await command.run([], options);
    expect(startup.prepare).not.toHaveBeenCalled();
    expect(JSON.parse(output[0]!)).toMatchObject({ status: "failed" });
  });
});
