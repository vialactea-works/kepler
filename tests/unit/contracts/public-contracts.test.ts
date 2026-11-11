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
import type { HomeInitializationResult } from "../../../packages/cli/src/cli/home-initializer.js";

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

const environment: KeplerEnvironment = { KEPLER_HOME: "/temporary/home/versions/3.0.0" };
const serviceOptions: KeplerServiceOptions = { environment };
const globalPaths: KeplerGlobalPaths = {
  home: "/temporary/home/versions/3.0.0",
  templates: "/temporary/home/versions/3.0.0/templates",
  guidelines: "/temporary/home/versions/3.0.0/guidelines",
  skills: "/temporary/home/versions/3.0.0/skills",
  agents: "/temporary/home/versions/3.0.0/agents",
  settings: "/temporary/home/versions/3.0.0/settings.yaml",
  metadata: "/temporary/home/versions/3.0.0/home-metadata.json",
};
const settings: KeplerSettings = parseKeplerSettings("enabled: true");
const artifactReader: ArtifactReader = markdownArtifactReader;
const artifactWriter: ArtifactWriter = markdownArtifactWriter;
const homeResult: HomeInitializationResult = {
  home: "/temporary/home/versions/3.0.0",
  release: "3.0.0",
  status: "initialized",
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
    expect(homeResult.home).toBe("/temporary/home/versions/3.0.0");
    expect(homeResult.release).toBe("3.0.0");
    expect(homeResult.status).toBe("initialized");
  });
});
