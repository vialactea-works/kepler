import { describe, expect, it } from "vitest";
import {
  parseKeplerSettings,
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
import {
  SetupService,
  type Setup,
  type SetupBundleLocator,
  type SetupFiles,
  type SetupResult,
} from "../../../packages/cli/src/cli/setup.service.js";

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
const setupFiles: SetupFiles = {
  ensureHome: () => {},
  copyTemplates: () => ["plan.md"],
  copyGuidelineManifests: () => {},
  writeDefaultSettings: () => {},
};
const bundleLocator: SetupBundleLocator = () => "/bundle";
const setup: Setup = new SetupService(setupFiles, bundleLocator);
const setupResult: SetupResult = setup.setup();

describe("public Core and setup contracts", () => {
  it("exposes typed Core settings and path contracts", () => {
    expect(serviceOptions.environment).toBe(environment);
    expect(globalPaths.templates).toContain("/templates");
    expect(settings.enabled).toBe(true);
  });

  it("keeps shared and Construction domain identities distinct", () => {
    expect(identityContract).toEqual(Array(12).fill(false));
    expect(envelopeDataContract).toEqual({});
  });

  it("runs a use case through its narrow in-memory adapter contract", () => {
    expect(setupResult).toEqual({ templates: ["plan.md"] });
  });
});
