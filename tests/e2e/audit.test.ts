import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditCliDriver } from "./driver/audit-cli.js";
import { createE2EHarness, type E2EHarness } from "./harness.js";
import { auditFixture, createAuditHistory as createLegacyAuditHistory } from "./fixtures/histories/audit.js";
import { selectFixtureHistory } from "../support/history-consumers.js";
import { fixtureHistorySelection } from "./driver.js";
import { exerciseAuditWorkflow } from "./specifications/audit.js";

const harnesses: E2EHarness[] = [];

const createAuditHistory = async (...args: Parameters<typeof createLegacyAuditHistory>): Promise<string> => {
  const original = await createLegacyAuditHistory(...args);
  const selected = await selectFixtureHistory(args[0], auditFixture.missionId);
  return Path.join(args[0], ".kepler", "missions", auditFixture.missionId, "history", "generations", selected.generationId, "construction", Path.basename(original));
};

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.cleanup();
});

describe("audit CLI E2E", () => {
  it("records, filters, paginates, and shows original audit events", async () => {
    const harness = await createE2EHarness({ application: "native" });
    harnesses.push(harness);
    await createAuditHistory(harness.resources.repositoryDirectory);
    const historyDirectory = fixtureHistorySelection(harness.resources.repositoryDirectory, auditFixture.missionId).directory;
    const audit = new AuditCliDriver(harness.cli, {
      journals: async () => {
        const names = (await Fs.readdir(historyDirectory)).sort();
        const records = await Promise.all(names.map(async (name) => [name, await Fs.readFile(Path.join(historyDirectory, name), "utf8")]));
        return JSON.stringify(records);
      },
    });

    await exerciseAuditWorkflow(audit);
    expect(await Fs.readdir(historyDirectory)).toHaveLength(10);
  }, 120_000);
});
