import * as Fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeplerCliDriver, fixtureHistorySelection } from "../e2e/driver.js";
import type { ApplicationConnector } from "../e2e/connectors.js";
import type { E2EResources } from "../e2e/resources.js";
import { historyGenerationFixture, historyTestBytes } from "../support/history-generation.js";
import { createHistoryControl, historyDigest } from "../../packages/cli/src/history/control.js";
import { historyState } from "../../packages/cli/src/history/gateway.js";
import { collectHistory } from "../../packages/cli/src/history/collection.js";

vi.mock("node:fs", async (original) => ({
  ...await original<typeof Fs>(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

const root = "/fixture/repository";
const resources: E2EResources = {
  rootDirectory: "/fixture", ownerNonce: "fixture-owner-0000000000000000", homeDirectory: "/fixture/home", configDirectory: "/fixture/config",
  cacheDirectory: "/fixture/cache", temporaryDirectory: "/fixture/tmp", repositoryDirectory: root,
  workspaceDirectory: "/fixture/workspace", gitConfigPath: "/fixture/config/git", dockerConfigDirectory: "/fixture/docker",
  environment: () => ({ PATH: "/bin" }), dockerEnvironment: () => ({}),
  runGit: () => { throw new Error("Request construction must not execute Git."); }, cleanup: async () => undefined,
};
const connector: ApplicationConnector = {
  kind: "native", assertAvailable: () => undefined,
  invoke: vi.fn(() => ({ exitCode: 0, stdout: "", stderr: "" })),
};
const directory = (name: string) => ({ name, isDirectory: () => true }) as Fs.Dirent;

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.clearAllMocks());

const prepare = () => {
  const fixture = historyGenerationFixture();
  vi.mocked(Fs.readdirSync).mockReturnValue([directory(fixture.missionId)] as unknown as ReturnType<typeof Fs.readdirSync>);
  vi.mocked(Fs.readFileSync).mockReturnValue(`${JSON.stringify(fixture.control)}\n`);
  const driver = new KeplerCliDriver(connector, resources);
  const args = ["workflow", "construction", "stage", "start", "--unit", fixture.unitId, "--stage", "functional-design"];
  return { fixture, driver, args };
};

describe("fresh E2E history requests", () => {
  it("constructs a new explicit-version request without changing the supplied arguments", () => {
    const { fixture, driver, args } = prepare();
    Object.freeze(args);
    expect(driver.freshMutationArguments(args)).toEqual([...args, "--history-version", fixture.control.id]);
    expect(args).not.toContain("--history-version");
    expect(fixtureHistorySelection(root, fixture.missionId)).toMatchObject({ historyVersion: fixture.control.id, generationId: fixture.generationId });
  });

  it("executes the fresh request through the configured public connector and preserves invocation options", () => {
    const { fixture, driver, args } = prepare();
    const result = { exitCode: 7, stdout: "structured result", stderr: "" };
    vi.mocked(connector.invoke).mockReturnValue(result);
    expect(driver.runFreshMutation(args, { stdin: "{}", cwd: `${root}/child`, timeoutMs: 12345 })).toBe(result);
    expect(connector.invoke).toHaveBeenCalledWith(expect.objectContaining({ args: [...args, "--history-version", fixture.control.id], stdin: "{}", cwd: `${root}/child`, timeoutMs: 12345 }));
  });

  it.each(["--history-version", "--history-version=90000000-0000-4000-8000-000000000009"])("preserves the caller version form %s, including stale values", (flag) => {
    const { driver, args } = prepare();
    const explicit = [...args, flag, ...(flag.includes("=") ? [] : ["90000000-0000-4000-8000-000000000009"])];
    expect(driver.freshMutationArguments(explicit)).toBe(explicit);
    expect(Fs.readFileSync).not.toHaveBeenCalled();
  });

  it.each(["unit", "mission", "out"])("binds fresh requests with inline %s options", (kind) => {
    const { driver, fixture } = prepare();
    const args = kind === "unit"
      ? ["workflow", "construction", "stage", "start", `--unit=${fixture.unitId}`, "--stage=functional-design"]
      : kind === "mission"
        ? ["workflow", "construction", "unit", "create", "new-unit", `--mission=${fixture.missionId}`]
        : ["git", "diff-package", "unit-review", `--unit=${fixture.unitId}`, "--out=package.md"];
    expect(driver.freshMutationArguments(args)).toEqual([...args, "--history-version", fixture.control.id]);
  });

  it("does not register a mutation version for read-only inspection", () => {
    const { driver, fixture } = prepare();
    const args = ["workflow", "construction", "unit", "show", "--unit", fixture.unitId];
    expect(driver.freshMutationArguments(args)).toBe(args);
    expect(Fs.readdirSync).not.toHaveBeenCalled();
  });

  it("leaves missing or damaged selections for the real CLI to reject", () => {
    const { driver, args } = prepare();
    vi.mocked(Fs.readFileSync).mockImplementation(() => { throw new Error("ENOENT"); });
    expect(driver.freshMutationArguments(args)).toBe(args);
    vi.mocked(Fs.readFileSync).mockReturnValue("{damaged");
    expect(driver.freshMutationArguments(args)).toBe(args);
  });

  it("does not choose an arbitrary mission for an ambiguous unit", () => {
    const { driver, fixture, args } = prepare();
    vi.mocked(Fs.readdirSync).mockReturnValue([directory(fixture.missionId), directory("90000000-0000-4000-8000-000000000009")] as unknown as ReturnType<typeof Fs.readdirSync>);
    expect(driver.freshMutationArguments(args)).toBe(args);
  });

  it("recognizes units appended after the initialization manifest", () => {
    const { driver, fixture, args } = prepare();
    const bytes = historyTestBytes([fixture.creation, fixture.prepared]);
    const control = createHistoryControl({
      id: fixture.control.id, journalId: fixture.control.journal_id, recordedAt: fixture.control.recorded_at,
      producer: fixture.control.producer, decisionReference: "request:original", causes: [fixture.creation.id],
      manifest: { ...fixture.manifest, mission_binding: { ...fixture.manifest.mission_binding, unit_ids: [] },
        candidate_journals: [{ ...fixture.manifest.candidate_journals[0]!, byte_length: bytes.length, content_version: historyDigest(bytes) }],
        expected_state: historyState(collectHistory(fixture.missionId, [{ ...fixture.legacy, bytes }], { completeness: "complete" })),
      },
    });
    vi.mocked(Fs.readFileSync).mockReturnValue(`${JSON.stringify(control)}\n`);
    vi.mocked(Fs.existsSync).mockReturnValue(true);
    expect(driver.freshMutationArguments(args)).toEqual([...args, "--history-version", fixture.control.id]);
  });
});
