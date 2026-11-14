import { describe, expect, it, vi } from "vitest";
import { runRecoveryMutation, RecoveryMigrateCommand, RecoveryResetCommand, RecoveryReconstructCommand, RecoveryPublishCommand, type RecoveryMutationDependencies } from "../../packages/cli/src/cli/nest/recovery-mutation.command.js";
import { ResultReporter } from "../../packages/cli/src/cli/nest/result-reporter.js";
import { HistoryError } from "../../packages/cli/src/history/control.js";

const mission = "10000000-0000-4000-8000-000000000001";
const options = { project: "/selected", mission };
const raw = '{"phase":"preview","manifest":{"same":1,"same":2}}';
const fixture = (overrides: Partial<RecoveryMutationDependencies> = {}): RecoveryMutationDependencies => ({
  projects: { resolve: vi.fn(async () => ({ kind: "resolved" as const, root: "/canonical" })) },
  input: { read: vi.fn(async () => ({ kind: "read" as const, value: raw })) },
  execute: vi.fn(async () => ({ execution_started: false, phase: "preview" })),
  ...overrides,
});

describe("recovery mutation command boundary", () => {
  it.each(["migrate", "reset", "reconstruct", "publish"] as const)("passes exact stdin and independently selected scope for %s", async (operation) => {
    const dependencies = fixture();
    expect(await runRecoveryMutation(operation, [], options, dependencies)).toEqual({ status: "success", data: { execution_started: false, phase: "preview" } });
    expect(dependencies.execute).toHaveBeenCalledWith(operation, { recordHome: "/canonical", missionId: mission }, raw);
  });

  it("rejects missing, ambiguous and positional selectors before reading stdin", async () => {
    const dependencies = fixture();
    for (const [params, selected] of [[[], { mission }], [[], { ...options, mission: [mission, mission] }], [["extra"], options], [[], { ...options, historyVersion: mission }]] as const) {
      expect((await runRecoveryMutation("reset", params, selected, dependencies)).status).toBe("failed");
    }
    expect(dependencies.input.read).not.toHaveBeenCalled();
    expect(dependencies.execute).not.toHaveBeenCalled();
  });

  it("retains project failures and does not read or execute a request", async () => {
    const dependencies = fixture({ projects: { resolve: vi.fn(async () => ({ kind: "failed" as const, code: "project_not_directory" as const, message: "Not a directory", details: {}, recovery: "Select a project" })) } });
    expect(await runRecoveryMutation("reset", [], options, dependencies)).toMatchObject({ status: "failed", data: { code: "project_not_directory", execution_started: false } });
    expect(dependencies.input.read).not.toHaveBeenCalled();
    expect(dependencies.execute).not.toHaveBeenCalled();
  });

  it("reports missing or invalid input without entering the operation", async () => {
    const dependencies = fixture({ input: { read: vi.fn(async () => ({ kind: "failed" as const, code: "audit_request_missing", message: "Missing", details: {}, recovery: "Pipe JSON" })) } });
    expect(await runRecoveryMutation("publish", [], options, dependencies)).toMatchObject({ status: "failed", data: { code: "history_recovery_request_invalid", details: { input_code: "audit_request_missing" } } });
    expect(dependencies.execute).not.toHaveBeenCalled();
  });

  it("preserves partial effects and precise original operation errors", async () => {
    const dependencies = fixture({ execute: async () => { throw new HistoryError("history_activation_failed", "Activation was not confirmed", { known_partial_effects: ["archive-created"], pending_reference: "original-intent" }); } });
    expect(await runRecoveryMutation("reset", [], options, dependencies)).toMatchObject({ status: "failed", data: { code: "history_activation_failed", details: { known_partial_effects: ["archive-created"], pending_reference: "original-intent" }, execution_started: false } });
  });

  it.each([undefined, null, 0, ""])("does not report a thrown value as operation success: %s", async (failure) => {
    expect(await runRecoveryMutation("reset", [], options, fixture({ execute: async () => { throw failure; } }))).toMatchObject({ status: "failed", data: { code: "history_recovery_failed", execution_started: false } });
  });

  it.each([RecoveryMigrateCommand, RecoveryResetCommand, RecoveryReconstructCommand, RecoveryPublishCommand])("reports one structured result through the concrete command", async (Command) => {
    const output: string[] = [];
    const reporter = new ResultReporter({ stdout: (text) => output.push(text), stderr: () => undefined }, { setExitCode: () => undefined });
    const dependencies = fixture();
    const command = new Command(reporter, dependencies.projects, dependencies.input, dependencies.execute);
    expect(command.parseMission(mission)).toEqual([mission]);
    expect(command.parseProject("/selected")).toEqual(["/selected"]);
    await command.run([], options);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)).toMatchObject({ status: "success", data: { execution_started: false } });
  });
});
