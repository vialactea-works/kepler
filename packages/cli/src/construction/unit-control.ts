import { createHash } from "node:crypto";
import type { AuditHistoryReadResult } from "../audit/context.js";
import type { MissionCoordinationAcquireResult } from "./mission-coordination.js";
import { pendingRevisionBarrierFor, type RevisionBarrierTarget } from "./revision-state.js";
import type { MissionWorkspaceRuntime } from "./mission-workspace.js";

export const constructionUnitControlResourceKey = (missionId: string, unitId: string): string =>
  createHash("sha256").update(JSON.stringify([missionId, unitId, "construction-unit-control"])).digest("hex");

export const acquireConstructionUnitControl = (
  workspace: Pick<MissionWorkspaceRuntime, "coordination" | "identity">,
  commonDirectory: string,
  missionId: string,
  unitId: string,
): Promise<MissionCoordinationAcquireResult> => workspace.coordination.acquire({
  commonDirectory,
  location: { kind: "mission", missionId },
  resourceKey: constructionUnitControlResourceKey(missionId, unitId),
  owner: {
    machine_id: workspace.identity.machine_id,
    process_id: workspace.identity.process_id,
    process_incarnation_id: workspace.identity.process_incarnation_id,
    mission_id: missionId,
    resource_scope: `construction/unit-control/${unitId}`,
  },
});

export type ConstructionUnitControlResult<T> =
  | { readonly kind: "completed"; readonly value: T }
  | { readonly kind: "failed"; readonly code: string; readonly message: string; readonly details: Readonly<Record<string, unknown>>; readonly recovery: string };

export const runWithConstructionUnitControl = async <T>(
  workspace: Pick<MissionWorkspaceRuntime, "coordination" | "identity">,
  commonDirectory: string,
  missionId: string,
  unitId: string,
  operation: () => Promise<T>,
): Promise<ConstructionUnitControlResult<T>> => {
  const acquired = await acquireConstructionUnitControl(workspace, commonDirectory, missionId, unitId);
  if (acquired.kind === "failed") return {
    kind: "failed",
    code: acquired.code,
    message: acquired.message,
    details: acquired.details,
    recovery: acquired.recovery,
  };
  let value: T | undefined;
  let thrown: unknown;
  let didThrow = false;
  try {
    value = await operation();
  } catch (error) {
    didThrow = true;
    thrown = error;
  }
  const released = await acquired.lease.release();
  if (released.kind === "failed") return {
    kind: "failed",
    code: "construction_unit_control_release_failed",
    message: "Kepler could not confirm release of the Construction unit-control claim.",
    details: {
      ...(released.details ?? {}),
      operation_result: didThrow ? "failed" : "completed",
      ...(thrown instanceof Error ? { operation_error: thrown.message } : {}),
    },
    recovery: released.recovery,
  };
  if (didThrow) return {
    kind: "failed",
    code: "construction_unit_control_operation_failed",
    message: "Kepler could not complete the guarded Construction write.",
    details: { message: thrown instanceof Error ? thrown.message : String(thrown) },
    recovery: "Inspect the selected history for uncertain effects before retrying; preserve every record.",
  };
  return { kind: "completed", value: value as T };
};

export interface ConstructionRevisionFenceOptions<T> {
  readonly workspace: Pick<MissionWorkspaceRuntime, "coordination" | "identity">;
  readonly commonDirectory: string;
  readonly missionId: string;
  readonly unitId: string;
  readonly expectedRoot: string;
  readonly project?: string;
  readonly readUnit: (unitId: string, project?: string) => Promise<AuditHistoryReadResult>;
  readonly target: RevisionBarrierTarget;
  readonly failure: (code: string, message: string, details?: Readonly<Record<string, unknown>>, recovery?: string) => T;
  readonly operation: (loaded: Extract<AuditHistoryReadResult, { readonly kind: "loaded" }>) => Promise<T>;
}

export const runWithConstructionRevisionFence = async <T>(
  options: ConstructionRevisionFenceOptions<T>,
): Promise<ConstructionUnitControlResult<T>> => runWithConstructionUnitControl(
  options.workspace,
  options.commonDirectory,
  options.missionId,
  options.unitId,
  async () => {
    const loaded = await options.readUnit(options.unitId, options.project);
    if (loaded.kind === "failed") return options.failure(loaded.code, loaded.message, loaded.details, loaded.recovery);
    if (loaded.root !== options.expectedRoot || loaded.missionId !== options.missionId || loaded.unit.unitId !== options.unitId) {
      return options.failure("construction_revision_scope_changed", "Construction ownership changed before the guarded lifecycle write.", {
        expected_root: options.expectedRoot,
        actual_root: loaded.root,
        expected_mission_id: options.missionId,
        actual_mission_id: loaded.missionId,
        unit_id: options.unitId,
      });
    }
    if (loaded.unit.blocked) return options.failure("construction_revision_history_blocked", "Construction history or projection issues prevent safe guarded writes.", {
      history_issues: loaded.unit.historyIssues,
      projection_issues: loaded.unit.projectionIssues,
    }, "Resolve the recorded history issues before retrying; preserve all events and external effects.");
    const barrier = pendingRevisionBarrierFor(loaded, options.target);
    if (barrier) return options.failure("revision_barrier_pending", "The selected Construction scope is behind an authorized revision barrier.", {
      revision_id: barrier.revisionId,
      authorization_event_id: barrier.authorizationEventId,
      affected_scopes: barrier.affectedScopes,
    }, "Stop and reconcile affected workers, apply the authorized cascade, then resume affected work.");
    return options.operation(loaded);
  },
);
