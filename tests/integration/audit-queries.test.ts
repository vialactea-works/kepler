import * as Fs from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditContextResolver, createNodeAuditContextFileSystem, createNodeAuditJournalFactory } from "../../packages/cli/src/audit/context.js";
import { AuditQueries } from "../../packages/cli/src/audit/queries.js";
import { CONSTRUCTION_EVENT_VERSION, CONSTRUCTION_PHASE } from "../../packages/cli/src/construction/events.js";
import { createEventJournal } from "../../packages/cli/src/history/journal.js";
import { ProjectResolver } from "../../packages/cli/src/cli/project-selection.js";

const temporaryRoots: string[] = [];
const missionId = "10000000-0000-4000-8000-000000000001";
const unitId = "2026-10-21-audit-query-integration";
const journalId = "20000000-0000-4000-8000-000000000002";
const unitCreatedId = "30000000-0000-4000-8000-000000000003";
const interactionIds = [
  "40000000-0000-4000-8000-000000000004",
  "50000000-0000-4000-8000-000000000005",
  "60000000-0000-4000-8000-000000000006",
  "70000000-0000-4000-8000-000000000007",
];

const createProject = async (): Promise<string> => {
  const root = await Fs.mkdtemp(Path.join(Os.tmpdir(), "kepler-audit-queries-"));
  temporaryRoots.push(root);
  await Fs.mkdir(Path.join(root, ".kepler"));
  await Fs.writeFile(Path.join(root, ".kepler", "marker"), "v3\n");
  const journal = createEventJournal({ recordHome: root, missionId, journalId, phase: CONSTRUCTION_PHASE });
  await journal.append({
    id: unitCreatedId,
    phase: CONSTRUCTION_PHASE,
    type: "construction.unit-created",
    envelope_version: 1,
    event_version: CONSTRUCTION_EVENT_VERSION,
    journal_id: journalId,
    recorded_at: "2026-10-21T12:00:00Z",
    producer: { name: "kepler", version: "0.10.3" },
    caused_by: [],
    data: {
      mission_id: missionId,
      unit_id: unitId,
      directory: `units-of-work/${unitId}`,
      workflow: "standard",
      initial_effort: { default: "standard", stage_overrides: {}, selected_by: "Requester" },
    },
  });
  for (const [index, id] of interactionIds.slice(0, 3).entries()) {
    await journal.append({
      id,
      phase: CONSTRUCTION_PHASE,
      type: "construction.interaction-recorded",
      envelope_version: 1,
      event_version: CONSTRUCTION_EVENT_VERSION,
      journal_id: journalId,
      recorded_at: `2026-10-21T12:0${index + 1}:00Z`,
      producer: { name: "kepler", version: "0.10.3" },
      caused_by: [unitCreatedId],
      data: {
        mission_id: missionId,
        unit_id: unitId,
        participants: ["Requester"],
        content: `Interaction ${index + 1}`,
        references: [],
      },
    });
  }
  return root;
};

const createQueries = (root: string) => new AuditQueries(new AuditContextResolver({
  projects: new ProjectResolver({
    cwd: () => root,
    fileSystem: { realpath: (path) => Fs.realpath(path), directoryExists: async (path) => (await Fs.stat(path)).isDirectory() },
    git: { isBareRepository: async () => ({ status: 0, stdout: "false\n", stderr: "" }), repositoryRoot: async () => ({ status: 0, stdout: `${root}\n`, stderr: "" }), configValue: async () => ({ status: 0, stdout: "", stderr: "" }) },
  }),
  fileSystem: createNodeAuditContextFileSystem(),
  journals: createNodeAuditJournalFactory(),
  identities: { next: () => "80000000-0000-4000-8000-000000000008" },
}));

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await Fs.rm(root, { recursive: true, force: true });
});

describe("audit queries with real journals", () => {
  it("continues the original stable pagination view after an append", async () => {
    const root = await createProject();
    const queries = createQueries(root);
    const first = await queries.list({ selectors: { unit: unitId }, type: "construction.interaction-recorded", limit: 2 });
    expect(first).toMatchObject({ kind: "success", data: { events: expect.any(Array), next_cursor: expect.any(String) } });
    expect((first.data.events as Array<Record<string, unknown>>).map((event) => event.id)).toEqual(interactionIds.slice(0, 2));

    const journal = createEventJournal({ recordHome: root, missionId, journalId, phase: CONSTRUCTION_PHASE });
    await journal.append({
      id: interactionIds[3],
      phase: CONSTRUCTION_PHASE,
      type: "construction.interaction-recorded",
      envelope_version: 1,
      event_version: CONSTRUCTION_EVENT_VERSION,
      journal_id: journalId,
      recorded_at: "2026-10-21T12:04:00Z",
      producer: { name: "kepler", version: "0.10.3" },
      caused_by: [unitCreatedId],
      data: {
        mission_id: missionId,
        unit_id: unitId,
        participants: ["Requester"],
        content: "Appended after pagination began",
        references: [],
      },
    });

    const second = await queries.list({
      selectors: { unit: unitId },
      type: "construction.interaction-recorded",
      limit: 2,
      cursor: String(first.data.next_cursor),
    });
    expect(second.kind).toBe("success");
    expect((second.data.events as Array<Record<string, unknown>>).map((event) => event.id)).toEqual([interactionIds[2]]);
    expect(second.data.next_cursor).toBeNull();
  });
});
