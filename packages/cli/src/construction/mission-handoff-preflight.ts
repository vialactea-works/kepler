import * as Path from "node:path";
import type { MissionId } from "./events.js";
import type { MissionWorkspaceFileSystem, MissionWorkspaceGit } from "./mission-workspace.js";

export interface MissionHandoffObjectRequirement {
  readonly repository_id: string;
  readonly repository_path: string;
  readonly object_id: string;
  readonly object_kind: "commit" | "object";
}

export interface MissionHandoffPreflightRequest {
  readonly mission_id: MissionId;
  readonly handoff_id: string;
  readonly required_objects: readonly MissionHandoffObjectRequirement[];
}

export interface MissionHandoffPreflightRuntime {
  readonly git: MissionWorkspaceGit;
  readonly fileSystem: Pick<MissionWorkspaceFileSystem, "realpath">;
}

export type MissionHandoffPreflightResult =
  | {
      readonly kind: "ready";
      readonly mission_id: MissionId;
      readonly handoff_id: string;
      readonly verified_objects: readonly {
        readonly repository_id: string;
        readonly object_id: string;
        readonly object_kind: "commit" | "object";
        readonly resolved_kind: string;
      }[];
    }
  | {
      readonly kind: "failed";
      readonly code: string;
      readonly message: string;
      readonly details: Readonly<Record<string, unknown>>;
      readonly recovery: string;
    };

const objectIdPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const missionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const failed = (
  missionId: MissionId,
  handoffId: string,
  failures: readonly Readonly<Record<string, unknown>>[],
): MissionHandoffPreflightResult => ({
  kind: "failed",
  code: "handoff_material_unavailable",
  message: "The selected handoff is missing required Git material or cannot prove its reachability.",
  details: { mission_id: missionId, handoff_id: handoffId, failures },
  recovery: "Keep the affected handoff and work unresumed. Make the required material available through separately authorized operations, then retry the preflight.",
});

const invalid = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>>,
): MissionHandoffPreflightResult => ({
  kind: "failed",
  code,
  message,
  details,
  recovery: "Correct the explicit handoff selection before transferring history or resuming affected work.",
});

export class MissionHandoffPreflight {
  constructor(private readonly runtime: MissionHandoffPreflightRuntime) {}

  async execute(input: unknown): Promise<MissionHandoffPreflightResult> {
    if (!isRecord(input) || typeof input.mission_id !== "string" ||
      !missionIdPattern.test(input.mission_id) || typeof input.handoff_id !== "string" ||
      input.handoff_id.trim().length === 0 || !Array.isArray(input.required_objects)) {
      return invalid("invalid_handoff_preflight_request", "The selected handoff identity or required-material list is invalid.", {});
    }
    const missionId = input.mission_id as MissionId;
    const handoffId = input.handoff_id;
    const invalidRequirements: Readonly<Record<string, unknown>>[] = [];
    const requirements: MissionHandoffObjectRequirement[] = [];
    const seenObjects = new Set<string>();
    for (const item of input.required_objects) {
      if (!isRecord(item) || typeof item.repository_id !== "string" ||
        typeof item.repository_path !== "string" || typeof item.object_id !== "string" ||
        (item.object_kind !== "commit" && item.object_kind !== "object") ||
        item.repository_id.trim().length === 0 || !Path.isAbsolute(item.repository_path) ||
        !objectIdPattern.test(item.object_id)) {
        invalidRequirements.push({ reason: "invalid_requirement" });
        continue;
      }
      const requirement: MissionHandoffObjectRequirement = {
        repository_id: item.repository_id,
        repository_path: item.repository_path,
        object_id: item.object_id,
        object_kind: item.object_kind,
      };
      const objectKey = `${requirement.repository_id}\0${requirement.object_id}`;
      if (seenObjects.has(objectKey)) {
        invalidRequirements.push({ repository_id: requirement.repository_id, object_id: requirement.object_id, reason: "duplicate_requirement" });
        continue;
      }
      seenObjects.add(objectKey);
      requirements.push(requirement);
    }
    if (invalidRequirements.length > 0) {
      return invalid("invalid_handoff_preflight_request", "The required handoff material contains invalid or duplicate bindings.", {
        mission_id: missionId,
        handoff_id: handoffId,
        failures: invalidRequirements,
      });
    }

    const groups = new Map<string, MissionHandoffObjectRequirement[]>();
    for (const requirement of requirements) {
      const current = groups.get(requirement.repository_id) ?? [];
      current.push(requirement);
      groups.set(requirement.repository_id, current);
    }

    const verifiedObjects: {
      repository_id: string;
      object_id: string;
      object_kind: "commit" | "object";
      resolved_kind: string;
    }[] = [];
    const failures: Readonly<Record<string, unknown>>[] = [];

    for (const [repositoryId, repositoryRequirements] of groups) {
      try {
        let canonicalPath: string | undefined;
        let commonDirectory: string | undefined;
        let identityFailure: Readonly<Record<string, unknown>> | undefined;
        for (const requirement of repositoryRequirements) {
          let selectedPath: string;
          try {
            selectedPath = await this.runtime.fileSystem.realpath(requirement.repository_path);
          } catch (error) {
            identityFailure = {
              repository_id: repositoryId,
              repository_path: requirement.repository_path,
              reason: "repository_path_unavailable",
              message: error instanceof Error ? error.message : String(error),
            };
            break;
          }
          const topLevel = await this.runtime.git.run(selectedPath, ["rev-parse", "--show-toplevel"]);
          if (topLevel.status !== 0) {
            identityFailure = {
              repository_id: repositoryId,
              repository_path: selectedPath,
              reason: "repository_root_unavailable",
              stderr: topLevel.stderr.trim(),
            };
            break;
          }
          const root = await this.runtime.fileSystem.realpath(topLevel.stdout.trim());
          if (root !== selectedPath) {
            identityFailure = {
              repository_id: repositoryId,
              repository_path: selectedPath,
              reason: "repository_identity_mismatch",
              actual_root: root,
            };
            break;
          }
          canonicalPath = root;
          const common = await this.runtime.git.run(root, ["rev-parse", "--git-common-dir"]);
          if (common.status !== 0) {
            identityFailure = {
              repository_id: repositoryId,
              repository_path: root,
              reason: "repository_common_directory_unavailable",
              stderr: common.stderr.trim(),
            };
            break;
          }
          const actualCommonDirectory = await this.runtime.fileSystem.realpath(Path.resolve(root, common.stdout.trim()));
          if (commonDirectory !== undefined && commonDirectory !== actualCommonDirectory) {
            identityFailure = {
              repository_id: repositoryId,
              reason: "repository_common_directory_mismatch",
              expected_common_directory: commonDirectory,
              actual_common_directory: actualCommonDirectory,
            };
            break;
          }
          commonDirectory = actualCommonDirectory;
        }
        if (identityFailure || canonicalPath === undefined) {
          failures.push(identityFailure ?? { repository_id: repositoryId, reason: "repository_path_unavailable" });
          continue;
        }

        const reachableResult = await this.runtime.git.run(canonicalPath, ["rev-list", "--objects", "--all"]);
        if (reachableResult.status !== 0) {
          failures.push({
            repository_id: repositoryId,
            repository_path: canonicalPath,
            reason: "reachability_check_failed",
            stderr: reachableResult.stderr.trim(),
          });
          continue;
        }
        const reachableObjects = new Set<string>();
        for (const line of reachableResult.stdout.split(/\r?\n/)) {
          if (line.length === 0) continue;
          const objectId = line.split(" ", 1)[0];
          if (objectId) reachableObjects.add(objectId);
        }

        for (const requirement of repositoryRequirements) {
          const objectType = await this.runtime.git.run(canonicalPath, ["cat-file", "-t", requirement.object_id]);
          if (objectType.status !== 0) {
            failures.push({
              repository_id: repositoryId,
              object_id: requirement.object_id,
              reason: "object_missing",
              stderr: objectType.stderr.trim(),
            });
            continue;
          }
          const resolvedKind = objectType.stdout.trim();
          if (requirement.object_kind === "commit" && resolvedKind !== "commit") {
            failures.push({
              repository_id: repositoryId,
              object_id: requirement.object_id,
              reason: "object_kind_mismatch",
              expected: "commit",
              actual: resolvedKind,
            });
            continue;
          }
          if (!reachableObjects.has(requirement.object_id)) {
            failures.push({
              repository_id: repositoryId,
              object_id: requirement.object_id,
              reason: "object_unreachable",
            });
            continue;
          }
          verifiedObjects.push({
            repository_id: repositoryId,
            object_id: requirement.object_id,
            object_kind: requirement.object_kind,
            resolved_kind: resolvedKind,
          });
        }
      } catch (error) {
        failures.push({
          repository_id: repositoryId,
          reason: "handoff_preflight_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (failures.length > 0) return failed(missionId, handoffId, failures);
    return {
      kind: "ready",
      mission_id: missionId,
      handoff_id: handoffId,
      verified_objects: verifiedObjects,
    };
  }
}
