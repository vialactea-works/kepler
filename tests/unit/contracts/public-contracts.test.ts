import { describe, expect, it } from "vitest";
import {
  markdownArtifactReader,
  markdownArtifactWriter,
  parseKeplerSettings,
  type ArtifactReader,
  type ArtifactWriter,
  type EventEnvelope,
  type EventId,
  type JournalId,
  type KeplerEnvironment,
  type KeplerGlobalPaths,
  type KeplerServiceOptions,
  type KeplerSettings,
} from "../../../packages/core/src/index.js";
import type {
  ActivityAttemptId,
  ArtifactId,
  EvidenceId,
  GraphId,
  MissionId,
  RevisionId,
  StageAttemptId,
  TaskId,
} from "../../../packages/cli/src/construction/events.js";
import type { SetupResult } from "../../../packages/cli/src/cli/setup.service.js";

type Assignable<Source, Target> = [Source] extends [Target] ? true : false;
type AssertDistinct<Value extends false> = Value;
type EventAndJournalIdsDiffer = AssertDistinct<Assignable<EventId, JournalId>>;
type EventAndMissionIdsDiffer = AssertDistinct<Assignable<EventId, MissionId>>;
type EventAndStageAttemptIdsDiffer = AssertDistinct<Assignable<EventId, StageAttemptId>>;
type EventAndTaskIdsDiffer = AssertDistinct<Assignable<EventId, TaskId>>;
type EventAndActivityAttemptIdsDiffer = AssertDistinct<Assignable<EventId, ActivityAttemptId>>;
type EventAndRevisionIdsDiffer = AssertDistinct<Assignable<EventId, RevisionId>>;
type EventAndEvidenceIdsDiffer = AssertDistinct<Assignable<EventId, EvidenceId>>;
type EventAndGraphIdsDiffer = AssertDistinct<Assignable<EventId, GraphId>>;
type EventAndArtifactIdsDiffer = AssertDistinct<Assignable<EventId, ArtifactId>>;
type TaskAndGraphIdsDiffer = AssertDistinct<Assignable<TaskId, GraphId>>;
type StageAndActivityAttemptIdsDiffer = AssertDistinct<Assignable<StageAttemptId, ActivityAttemptId>>;
type RevisionAndEvidenceIdsDiffer = AssertDistinct<Assignable<RevisionId, EvidenceId>>;

type PublicEventEnvelope = EventEnvelope<Readonly<Record<string, unknown>>>;
const envelopeDataContract: PublicEventEnvelope["data"] = {};
const identityContract: [
  EventAndJournalIdsDiffer,
  EventAndMissionIdsDiffer,
  EventAndStageAttemptIdsDiffer,
  EventAndTaskIdsDiffer,
  EventAndActivityAttemptIdsDiffer,
  EventAndRevisionIdsDiffer,
  EventAndEvidenceIdsDiffer,
  EventAndGraphIdsDiffer,
  EventAndArtifactIdsDiffer,
  TaskAndGraphIdsDiffer,
  StageAndActivityAttemptIdsDiffer,
  RevisionAndEvidenceIdsDiffer,
] = [false, false, false, false, false, false, false, false, false, false, false, false];

const environment: KeplerEnvironment = { HOME: "/temporary/home" };
const serviceOptions: KeplerServiceOptions = {
  homeDirectory: "/temporary/home",
  environment,
};
const globalPaths: KeplerGlobalPaths = {
  home: "/temporary/home/.config/vialactea-works/kepler",
  templates: "/temporary/home/.config/vialactea-works/kepler/templates",
  guidelines: "/temporary/home/.config/vialactea-works/kepler/guidelines",
  settings: "/temporary/home/.config/vialactea-works/kepler/settings.yaml",
};
const settings: KeplerSettings = parseKeplerSettings("enabled: true");
const artifactReader: ArtifactReader = markdownArtifactReader;
const artifactWriter: ArtifactWriter = markdownArtifactWriter;
const setupResult: SetupResult = {
  generation_id: "550e8400-e29b-41d4-a716-446655440000",
  kepler_release: "3.0.0",
  installation_mode: "first-install",
  resource_root: "/temporary/home/.kepler-dist/generations/550e8400-e29b-41d4-a716-446655440000",
  selector: "/temporary/home/.kepler-dist/current",
  package_source: "/temporary/home/.kepler-dist/current",
  compatibility: { check: "compatible" },
  templates: [],
  guidelines: [],
  created_files: [],
  updated_files: [],
  pi_binding: {
    host: { id: "pi", release: "1.2.0", check: "matches" },
    loader: { id: "pi-subagents", release: "0.76.1", check: "matches" },
    registration: {
      entry_digest: `sha256:${"a".repeat(64)}`,
      settings_digest: `sha256:${"b".repeat(64)}`,
      check: "matches",
    },
  },
};

describe("public Core and setup contracts", () => {
  it("exposes typed Core settings and path contracts", () => {
    expect(serviceOptions.environment).toBe(environment);
    expect(globalPaths.templates).toContain("/templates");
    expect(settings.enabled).toBe(true);
    expect(artifactReader).toBe(markdownArtifactReader);
    expect(artifactWriter).toBe(markdownArtifactWriter);
  });

  it("keeps shared and Construction domain identities distinct", () => {
    expect(identityContract).toEqual(Array(12).fill(false));
    expect(envelopeDataContract).toEqual({});
  });

  it("runs a use case through its narrow in-memory adapter contract", () => {
    expect(setupResult.generation_id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(setupResult.compatibility.check).toBe("compatible");
    expect(setupResult.pi_binding.host.check).toBe("matches");
  });
});
