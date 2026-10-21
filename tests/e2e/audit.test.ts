import * as Fs from "node:fs/promises";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditCliDriver } from "./driver/audit-cli.js";
import { createE2EHarness, type E2EHarness } from "./harness.js";
import { auditFixture, createAuditHistory } from "./fixtures/histories/audit.js";
import { exerciseAuditWorkflow } from "./specifications/audit.js";

const harnesses: E2EHarness[] = [];

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.cleanup();
});

describe("audit CLI E2E", () => {
  it("records, filters, paginates, and shows original audit events", async () => {
    const harness = await createE2EHarness({ application: "native" });
    harnesses.push(harness);
    await createAuditHistory(harness.resources.repositoryDirectory);
    const historyDirectory = Path.join(
      harness.resources.repositoryDirectory,
      ".kepler",
      "missions",
      auditFixture.missionId,
      "history",
      "construction",
    );
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
