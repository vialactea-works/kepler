import { randomUUID } from "node:crypto";
import { createNodeMissionWorkspaceRuntime } from "../construction/mission-workspace-runtime.js";
import type { MissionWorkspaceRuntime } from "../construction/mission-workspace.js";
import { HistoryAccess } from "./access.js";
import { createNodeHistoryFiles } from "./files-runtime.js";
import { createHistoryRepositories } from "./repositories-runtime.js";
import { HistoryStorage } from "./storage.js";

export const createNodeHistoryAccess = (workspace: MissionWorkspaceRuntime = createNodeMissionWorkspaceRuntime()): HistoryAccess => new HistoryAccess(
  new HistoryStorage(createNodeHistoryFiles(), createHistoryRepositories(workspace)),
  { coordination: workspace.coordination, identity: workspace.identity, next: randomUUID },
);
