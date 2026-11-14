import { describe, expect, it, vi } from "vitest";
import type { HistoryInspection } from "../../packages/cli/src/history/inspection.js";
import {
  runRecoveryRead,
  RecoveryCommand,
  RecoveryInspectCommand,
  RecoveryStatusCommand,
  type RecoveryReadDependencies,
} from "../../packages/cli/src/cli/nest/recovery.command.js";
import { parseRecoveryReadOptions } from "../../packages/cli/src/cli/nest/recovery-options.js";
import { HistoryError } from "../../packages/cli/src/history/control.js";
import { ResultReporter } from "../../packages/cli/src/cli/nest/result-reporter.js";

const missionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const validOptions = { project: "/fixture", mission: missionId };
const report = {
  mission_id: missionId,
  record_home: "/fixture",
  generation_id: null,
  history_version: null,
  mode: null,
  migration_required: false,
  execution_started: false,
  selection_status: "blocked",
  local_control: null,
  shared_binding: null,
  control_receipts: [],
  source_inventory: [],
  unavailable_sources: [],
  pending_sources: [],
  draft_source_count: 0,
  archives: [],
  issues: [],
  remaining_work: [],
} satisfies HistoryInspection;

const dependencies = (
  overrides: Partial<RecoveryReadDependencies> = {},
): RecoveryReadDependencies => ({
  projects: {
    resolve: vi.fn(async () => ({ kind: "resolved" as const, root: "/fixture" })),
  },
  inspect: vi.fn(async () => report),
  ...overrides,
});

describe("recovery read option parsing", () => {
  it("accepts one explicit project root and a full lowercase mission UUIDv4", () => {
    expect(parseRecoveryReadOptions(validOptions)).toEqual({
      kind: "parsed",
      selectors: { project: "/fixture", mission: missionId },
    });
  });

  it.each([
    [{ mission: missionId }, "required_selector_missing"],
    [{ project: "/fixture" }, "required_selector_missing"],
    [{ project: "", mission: missionId }, "invalid_selector"],
    [{ project: ["/fixture", "/other"], mission: missionId }, "duplicate_selector"],
    [{ project: "/fixture", mission: [missionId, missionId] }, "duplicate_selector"],
    [{ project: "/fixture", mission: "" }, "invalid_selector"],
    [{ project: "/fixture", mission: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }, "invalid_identity"],
    [{ project: "/fixture", mission: "aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa" }, "invalid_identity"],
    [{ project: "/fixture", mission: missionId, extra: true }, "invalid_selector"],
  ] as const)("rejects invalid or ambiguous selectors: %j", (options, code) => {
    expect(parseRecoveryReadOptions(options)).toMatchObject({
      kind: "failed",
      code,
    });
  });

  it("rejects positional arguments", () => {
    expect(parseRecoveryReadOptions(validOptions, ["unexpected"])).toMatchObject({
      kind: "failed",
      code: "invalid_arguments",
    });
  });
});

describe("recovery read handler", () => {
  it("resolves the explicit project and returns the shared detailed inspection report", async () => {
    const resolve = vi.fn(async () => ({ kind: "resolved" as const, root: "/canonical/fixture" }));
    const inspect = vi.fn(async () => report);
    const result = await runRecoveryRead([], validOptions, {
      projects: { resolve },
      inspect,
    });

    expect(result).toEqual({ status: "success", data: report });
    expect(resolve).toHaveBeenCalledWith("/fixture");
    expect(inspect).toHaveBeenCalledWith({
      recordHome: "/canonical/fixture",
      missionId,
    });
  });

  it("returns selector and project-resolution failures without inspecting history", async () => {
    const inspect = vi.fn(async () => report);
    const invalid = await runRecoveryRead([], {
      project: "/fixture",
      mission: "not-a-uuid",
    }, dependencies({ inspect }));
    const resolve = vi.fn(async () => ({
      kind: "failed" as const,
      code: "project_not_directory" as const,
      message: "The selected project path is not a directory.",
      details: { path: "/fixture" },
      recovery: "Select a Git working-tree root and retry.",
    }));
    const unresolved = await runRecoveryRead([], validOptions, {
      projects: { resolve },
      inspect,
    });

    expect(invalid).toMatchObject({
      status: "failed",
      data: { code: "invalid_identity" },
    });
    expect(unresolved).toMatchObject({
      status: "failed",
      data: { code: "project_not_directory" },
    });
    expect(inspect).not.toHaveBeenCalled();
  });

  it("retains precise history failure codes and scoped diagnostics", async () => {
    const result = await runRecoveryRead([], validOptions, dependencies({ inspect: async () => {
      throw new HistoryError("history_origin_missing", "The record home has no verified origin.", { mission_id: missionId });
    } }));
    expect(result).toMatchObject({ status: "failed", data: { code: "history_origin_missing", details: { mission_id: missionId } } });
  });

  it("reports inspection errors and rejects positional arguments", async () => {
    const inspectionFailure = await runRecoveryRead([], validOptions, dependencies({
      inspect: vi.fn(async () => {
        throw new Error("History input could not be read.");
      }),
    }));
    const positional = await runRecoveryRead(["extra"], validOptions, dependencies());

    expect(inspectionFailure).toMatchObject({
      status: "failed",
      data: {
        code: "history_inspection_failed",
        message: "History input could not be read.",
        details: {},
      },
    });
    expect(positional).toMatchObject({
      status: "failed",
      data: { code: "invalid_arguments" },
    });
  });
});

const reporting = () => {
  const output: string[] = [];
  const diagnostics: string[] = [];
  let exitCode: number | undefined;
  const reporter = new ResultReporter({ stdout: (value) => { output.push(value); }, stderr: (value) => { diagnostics.push(value); } }, { setExitCode: (value) => { exitCode = value; } });
  return { reporter, output, diagnostics, exitCode: () => exitCode };
};

describe.each([
  ["inspect", RecoveryInspectCommand],
  ["status", RecoveryStatusCommand],
] as const)("recovery %s command", (_name, CommandType) => {
  it("runs the public handler and serializes one structured result", async () => {
    const sink = reporting();
    const runtime = dependencies();
    const command = new CommandType(runtime.projects, sink.reporter, runtime.inspect);
    const project = command.parseProject("/fixture");
    const mission = command.parseMission(missionId);
    await command.run([], { project, mission });
    expect(sink.exitCode()).toBe(0);
    expect(sink.output).toHaveLength(1);
    expect(JSON.parse(sink.output[0]!)).toEqual({ status: "success", data: report });
    expect(sink.diagnostics).toEqual([]);
  });

  it("preserves duplicate selectors and rejects absent selectors without inspection", async () => {
    const sink = reporting();
    const runtime = dependencies();
    const command = new CommandType(runtime.projects, sink.reporter, runtime.inspect);
    await command.run([], { project: command.parseProject("/other", command.parseProject("/fixture")), mission: command.parseMission(missionId) });
    expect(JSON.parse(sink.output[0]!).data.code).toBe("duplicate_selector");
    expect(command.parseMission(missionId, [missionId])).toEqual([missionId, missionId]);
    await command.run([]);
    expect(JSON.parse(sink.output[1]!).data.code).toBe("required_selector_missing");
    expect(sink.exitCode()).toBe(1);
    expect(runtime.inspect).not.toHaveBeenCalled();
  });
});

describe("recovery command group", () => {
  it("requires a supported subcommand instead of performing a default operation", async () => {
    const sink = reporting();
    await new RecoveryCommand(sink.reporter).run();
    expect(sink.exitCode()).toBe(1);
    expect(JSON.parse(sink.output[0]!).data.code).toBe("invalid_arguments");
  });
});
