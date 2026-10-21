import * as Path from "node:path";
import type { MissionStartupFailure } from "./mission-startup.js";

export interface MissionCoordinationPathIdentity {
  readonly device: string;
  readonly inode: string;
}

export interface MissionCoordinationFileSystem {
  readonly pathKind: (path: string) => Promise<"missing" | "directory" | "file" | "symlink" | "other">;
  readonly pathIdentity: (path: string) => Promise<MissionCoordinationPathIdentity | undefined>;
  readonly realpath: (path: string) => Promise<string>;
  readonly mkdir: (path: string) => Promise<void>;
  readonly writeFileExclusive: (path: string, content: string) => Promise<void>;
  readonly readFile: (path: string) => Promise<string>;
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly removeTree: (path: string) => Promise<void>;
  readonly listDirectory: (path: string) => Promise<readonly string[]>;
}

export interface MissionCoordinationOwner {
  readonly token: string;
  readonly machine_id: string;
  readonly process_id: number;
  readonly process_incarnation_id: string;
  readonly mission_id: string;
  readonly resource_scope: string;
  readonly attempt_context?: string;
}

export interface MissionCoordinationRequest {
  readonly commonDirectory: string;
  readonly location: { readonly kind: "code-workspace" } | { readonly kind: "mission"; readonly missionId: string };
  readonly resourceKey: string;
  readonly owner: Omit<MissionCoordinationOwner, "token">;
}

export interface MissionCoordinationLease {
  readonly lockPath: string;
  readonly owner: MissionCoordinationOwner;
  readonly release: () => Promise<MissionCoordinationReleaseResult>;
}

export interface MissionCoordinationAcquired {
  readonly kind: "acquired";
  readonly lease: MissionCoordinationLease;
}

export interface MissionCoordinationReleased {
  readonly kind: "released";
}

export type MissionCoordinationReleaseResult = MissionCoordinationReleased | MissionStartupFailure;
export type MissionCoordinationAcquireResult = MissionCoordinationAcquired | MissionStartupFailure;

export interface MissionCoordinationIdentitySource {
  readonly next: () => string;
}

export interface MissionCoordination {
  readonly acquire: (request: MissionCoordinationRequest) => Promise<MissionCoordinationAcquireResult>;
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const workspaceKey = /^[a-f0-9]{64}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const failed = (
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>>,
  recovery: string,
): MissionStartupFailure => ({ kind: "failed", code, message, details, recovery });

const readOwner = async (
  fileSystem: MissionCoordinationFileSystem,
  lockPath: string,
): Promise<MissionCoordinationOwner | undefined> => {
  try {
    if (await fileSystem.pathKind(lockPath) !== "directory" ||
      await fileSystem.pathKind(Path.join(lockPath, "owner.json")) !== "file") return undefined;
    const parsed: unknown = JSON.parse(await fileSystem.readFile(Path.join(lockPath, "owner.json")));
    if (!isRecord(parsed)) return undefined;
    const value = parsed;
    const token = value.token;
    const machineId = value.machine_id;
    const processId = value.process_id;
    const processIncarnationId = value.process_incarnation_id;
    const missionId = value.mission_id;
    const resourceScope = value.resource_scope;
    const attemptContext = value.attempt_context;
    if (typeof token !== "string" || typeof machineId !== "string" ||
      typeof processId !== "number" || typeof processIncarnationId !== "string" ||
      typeof missionId !== "string" || typeof resourceScope !== "string" ||
      (attemptContext !== undefined && typeof attemptContext !== "string")) return undefined;
    return {
      token,
      machine_id: machineId,
      process_id: processId,
      process_incarnation_id: processIncarnationId,
      mission_id: missionId,
      resource_scope: resourceScope,
      attempt_context: attemptContext,
    };
  } catch {
    return undefined;
  }
};

const samePathIdentity = (
  observed: MissionCoordinationPathIdentity | undefined,
  expected: MissionCoordinationPathIdentity | undefined,
): boolean => observed !== undefined && expected !== undefined &&
  observed.device === expected.device && observed.inode === expected.inode;

const matchesOwner = (
  observed: MissionCoordinationOwner | undefined,
  expected: MissionCoordinationOwner,
): boolean => observed !== undefined &&
  observed.token === expected.token &&
  observed.machine_id === expected.machine_id &&
  observed.process_id === expected.process_id &&
  observed.process_incarnation_id === expected.process_incarnation_id &&
  observed.mission_id === expected.mission_id &&
  observed.resource_scope === expected.resource_scope &&
  observed.attempt_context === expected.attempt_context;

const releaseNames = (names: readonly string[], prefix: string): readonly string[] =>
  names.filter((name) => name.startsWith(prefix));

type OwnedDirectoryRemovalResult =
  | { readonly kind: "removed" }
  | { readonly kind: "replaced"; readonly observedToken?: string; readonly preservedPath: string; readonly restorationError?: string }
  | { readonly kind: "failed"; readonly path: string; readonly message: string };

const removeOwnedDirectory = async (
  fileSystem: MissionCoordinationFileSystem,
  path: string,
  releasePath: string,
  expectedIdentity: MissionCoordinationPathIdentity,
  expectedOwner: MissionCoordinationOwner,
): Promise<OwnedDirectoryRemovalResult> => {
  let currentOwner: MissionCoordinationOwner | undefined;
  let currentIdentity: MissionCoordinationPathIdentity | undefined;
  try {
    currentOwner = await readOwner(fileSystem, path);
    currentIdentity = await fileSystem.pathIdentity(path);
    if (!samePathIdentity(currentIdentity, expectedIdentity) || !matchesOwner(currentOwner, expectedOwner)) {
      return {
        kind: "replaced",
        ...(currentOwner ? { observedToken: currentOwner.token } : {}),
        preservedPath: path,
      };
    }
    await fileSystem.rename(path, releasePath);
  } catch (error) {
    return { kind: "failed", path, message: error instanceof Error ? error.message : String(error) };
  }

  let movedOwner: MissionCoordinationOwner | undefined;
  let movedIdentity: MissionCoordinationPathIdentity | undefined;
  try {
    movedOwner = await readOwner(fileSystem, releasePath);
    movedIdentity = await fileSystem.pathIdentity(releasePath);
  } catch (error) {
    return { kind: "failed", path: releasePath, message: error instanceof Error ? error.message : String(error) };
  }
  if (!samePathIdentity(movedIdentity, expectedIdentity) || !matchesOwner(movedOwner, expectedOwner)) {
    let restorationError: string | undefined;
    if (movedIdentity) {
      try {
        if (await fileSystem.pathKind(path) === "missing" &&
          samePathIdentity(await fileSystem.pathIdentity(releasePath), movedIdentity)) {
          await fileSystem.rename(releasePath, path);
          if (samePathIdentity(await fileSystem.pathIdentity(path), movedIdentity)) {
            return {
              kind: "replaced",
              ...(movedOwner ? { observedToken: movedOwner.token } : {}),
              preservedPath: path,
            };
          }
        }
      } catch (error) {
        restorationError = error instanceof Error ? error.message : String(error);
      }
    }
    return {
      kind: "replaced",
      ...(movedOwner ? { observedToken: movedOwner.token } : {}),
      preservedPath: releasePath,
      ...(restorationError ? { restorationError } : {}),
    };
  }

  try {
    await fileSystem.removeTree(releasePath);
    return { kind: "removed" };
  } catch (error) {
    return { kind: "failed", path: releasePath, message: error instanceof Error ? error.message : String(error) };
  }
};

export const createMissionCoordination = (
  fileSystem: MissionCoordinationFileSystem,
  identities: MissionCoordinationIdentitySource,
): MissionCoordination => {
  const acquire = async (request: MissionCoordinationRequest): Promise<MissionCoordinationAcquireResult> => {
    if (!Path.isAbsolute(request.commonDirectory) || !workspaceKey.test(request.resourceKey) ||
      !uuidV4.test(request.owner.process_incarnation_id) || !uuidV4.test(request.owner.mission_id) ||
      (request.location.kind === "mission" && request.location.missionId !== request.owner.mission_id) ||
      (request.location.kind === "mission" && !uuidV4.test(request.location.missionId)) ||
      !Number.isInteger(request.owner.process_id) || request.owner.process_id < 1 ||
      request.owner.machine_id.trim().length === 0 || request.owner.resource_scope.trim().length === 0) {
      return failed(
        "invalid_coordination_scope",
        "The selected coordination resource or owner identity is invalid.",
        { resource_key: request.resourceKey },
        "Resolve the repository identity and process owner before acquiring the selected resource.",
      );
    }

    const resourceSegments = request.location.kind === "mission"
      ? ["kepler", "missions", request.location.missionId, "coordination"]
      : ["kepler", "workspaces"];
    let directory = request.commonDirectory;
    try {
      if (await fileSystem.realpath(directory) !== directory) {
        return failed("coordination_root_invalid", "The Git common directory is not canonical.", { common_directory: directory }, "Resolve the actual Git common directory before creating local coordination data.");
      }
      for (const segment of resourceSegments) {
        const next = Path.join(directory, segment);
        let kind = await fileSystem.pathKind(next);
        if (kind === "missing") {
          try {
            await fileSystem.mkdir(next);
          } catch {
            kind = await fileSystem.pathKind(next);
          }
          if (kind === "missing") kind = await fileSystem.pathKind(next);
        }
        if (kind !== "directory" || await fileSystem.realpath(next) !== next) {
          return failed("coordination_path_invalid", "A Git common-directory coordination path contains a non-directory or symbolic link.", { path: next, path_kind: kind }, "Preserve the path and resolve it explicitly before acquiring this resource.");
        }
        directory = next;
      }
    } catch (error) {
      return failed("coordination_storage_failed", "Kepler could not prepare the selected common-directory coordination path.", { common_directory: request.commonDirectory, message: error instanceof Error ? error.message : String(error) }, "Check access to the actual Git common directory and preserve any partial local paths.");
    }
    const lockPath = Path.join(directory, request.resourceKey);
    const markerPath = `${lockPath}.releasing`;
    const releasePrefix = `${request.resourceKey}.releasing-`;
    const movingPrefix = `${request.resourceKey}.owner-moving-`;
    try {
      const markerKind = await fileSystem.pathKind(markerPath);
      const directoryEntries = await fileSystem.listDirectory(directory);
      const pendingReleases = [...releaseNames(directoryEntries, releasePrefix), ...releaseNames(directoryEntries, movingPrefix)];
      if (markerKind !== "missing" || pendingReleases.length > 0) {
        return failed(
          "coordination_release_in_progress",
          "The selected resource has an unresolved coordination release.",
          { resource_key: request.resourceKey, pending_releases: pendingReleases },
          "Reconcile the existing owner artifact before retrying; do not remove an owner record automatically.",
        );
      }

      let token: string;
      try {
        token = identities.next();
      } catch (error) {
        return failed("coordination_identity_failed", "Kepler could not allocate a coordination ownership token.", {
          message: error instanceof Error ? error.message : String(error),
        }, "Retry after checking the local identity source.");
      }
      if (!uuidV4.test(token)) {
        return failed("coordination_identity_failed", "Kepler could not allocate a coordination ownership token.", {}, "Retry after checking the local identity source.");
      }
      const owner: MissionCoordinationOwner = { ...request.owner, token };
      try {
        await fileSystem.mkdir(lockPath);
      } catch {
        return failed(
          "resource_contended",
          "Another operation owns the selected workspace or shared resource.",
          { resource_key: request.resourceKey },
          "Preserve the selected work and choose an isolated workspace or retry after the owner releases the resource.",
        );
      }

      const lockIdentity = await fileSystem.pathIdentity(lockPath);
      if (!lockIdentity) {
        return failed("coordination_identity_unavailable", "Kepler could not capture the acquired lock directory identity.", { resource_key: request.resourceKey }, "Keep the lock artifact unavailable and reconcile it before retrying.");
      }
      try {
        await fileSystem.writeFileExclusive(Path.join(lockPath, "owner.json"), `${JSON.stringify(owner)}\n`);
      } catch (error) {
        return failed(
          "coordination_owner_record_failed",
          "The coordination directory exists, but its owner record could not be completed.",
          { resource_key: request.resourceKey, message: error instanceof Error ? error.message : String(error) },
          "Keep the partial lock artifact unavailable and reconcile it before retrying.",
        );
      }

      const postMarkerKind = await fileSystem.pathKind(markerPath);
      const postEntries = await fileSystem.listDirectory(directory);
      const postPendingReleases = [...releaseNames(postEntries, releasePrefix), ...releaseNames(postEntries, movingPrefix)];
      const postLockIdentity = await fileSystem.pathIdentity(lockPath);
      if (!samePathIdentity(postLockIdentity, lockIdentity)) {
        return failed("coordination_lock_replaced", "The acquired lock directory changed before ownership was returned.", { resource_key: request.resourceKey, owner_token: token }, "Preserve the replacement and reconcile the resource before retrying.");
      }
      if (postMarkerKind !== "missing" || postPendingReleases.length > 0) {
        return failed(
          "coordination_release_race",
          "A release began while this resource was being acquired; the resource remains unavailable.",
          { resource_key: request.resourceKey, owner_token: token, pending_releases: postPendingReleases },
          "Reconcile the lock artifacts before retrying; Kepler will not remove a possibly replaced claim.",
        );
      }

      const release = async (): Promise<MissionCoordinationReleaseResult> => {
        const currentOwner = await readOwner(fileSystem, lockPath);
        const currentIdentity = await fileSystem.pathIdentity(lockPath);
        if (!samePathIdentity(currentIdentity, lockIdentity) || !matchesOwner(currentOwner, owner)) {
          return failed(
            "coordination_owner_replaced",
            "The canonical lock path no longer contains this operation's owner; the replacement remains available to its holder.",
            {
              resource_key: request.resourceKey,
              expected_token: owner.token,
              ...(currentOwner ? { observed_token: currentOwner.token } : {}),
              lock_path: lockPath,
            },
            "Preserve the current owner record and release only through the matching holder.",
          );
        }
        let releaseToken: string;
        try {
          releaseToken = identities.next();
        } catch (error) {
          return failed("coordination_identity_failed", "Kepler could not allocate a release ownership token.", {
            resource_key: request.resourceKey,
            message: error instanceof Error ? error.message : String(error),
          }, "Reconcile the held lock manually after confirming its owner.");
        }
        const markerOwner: MissionCoordinationOwner = { ...owner, token: releaseToken };
        if (!uuidV4.test(markerOwner.token)) {
          return failed("coordination_identity_failed", "Kepler could not allocate a release ownership token.", { resource_key: request.resourceKey }, "Reconcile the held lock manually after confirming its owner.");
        }
        let markerIdentity: MissionCoordinationPathIdentity | undefined;
        try {
          await fileSystem.mkdir(markerPath);
          markerIdentity = await fileSystem.pathIdentity(markerPath);
          if (!markerIdentity) throw new Error("Release marker identity is unavailable");
          await fileSystem.writeFileExclusive(Path.join(markerPath, "owner.json"), `${JSON.stringify(markerOwner)}\n`);
        } catch (error) {
          return failed(
            "coordination_release_marker_failed",
            "Kepler could not establish a safe release boundary; the resource remains unavailable.",
            { resource_key: request.resourceKey, message: error instanceof Error ? error.message : String(error) },
            "Reconcile the release marker and owner artifact before retrying.",
          );
        }

        const releasePath = Path.join(directory, `${request.resourceKey}.owner-moving-${markerOwner.token}`);
        const markerReleasePath = Path.join(directory, `${request.resourceKey}.releasing-${markerOwner.token}`);
        const lockRemoval = await removeOwnedDirectory(fileSystem, lockPath, releasePath, lockIdentity, owner);
        if (lockRemoval.kind === "replaced") {
          const markerRemoval = await removeOwnedDirectory(fileSystem, markerPath, markerReleasePath, markerIdentity, markerOwner);
          if (markerRemoval.kind !== "removed") {
            return failed(
              "coordination_release_incomplete",
              "A replacement claim remains preserved, but Kepler could not clear its own release marker.",
              {
                resource_key: request.resourceKey,
                preserved_at: lockRemoval.preservedPath,
                release_marker: markerRemoval.kind === "failed" ? markerRemoval.path : markerRemoval.preservedPath,
                ...(lockRemoval.restorationError ? { restoration_error: lockRemoval.restorationError } : {}),
                ...(markerRemoval.kind === "failed" ? { message: markerRemoval.message } : {}),
              },
              "Keep the resource unavailable and reconcile the replacement and release marker before retrying.",
            );
          }
          return failed(
            "coordination_owner_replaced",
            "The replacement claim remains at its canonical path and was not released by the stale holder.",
            {
              resource_key: request.resourceKey,
              expected_token: owner.token,
              ...(lockRemoval.observedToken ? { observed_token: lockRemoval.observedToken } : {}),
              preserved_at: lockRemoval.preservedPath,
              ...(lockRemoval.restorationError ? { restoration_error: lockRemoval.restorationError } : {}),
            },
            "Preserve the current owner record and release only through the matching holder.",
          );
        }
        if (lockRemoval.kind === "failed") {
          return failed(
            "coordination_release_incomplete",
            "Kepler could not safely remove the owned lock directory.",
            { resource_key: request.resourceKey, release_path: lockRemoval.path, message: lockRemoval.message },
            "Keep the resource unavailable and reconcile the release artifact before retrying.",
          );
        }

        const markerRemoval = await removeOwnedDirectory(fileSystem, markerPath, markerReleasePath, markerIdentity, markerOwner);
        if (markerRemoval.kind !== "removed") {
          return failed(
            markerRemoval.kind === "replaced" ? "coordination_release_marker_replaced" : "coordination_release_incomplete",
            markerRemoval.kind === "replaced"
              ? "The release boundary changed owner and was preserved."
              : "The resource lock was removed, but its release marker could not be cleared.",
            {
              resource_key: request.resourceKey,
              release_marker: markerRemoval.kind === "failed" ? markerRemoval.path : markerRemoval.preservedPath,
              ...(markerRemoval.kind === "failed" ? { message: markerRemoval.message } : {}),
              ...(markerRemoval.kind === "replaced" && markerRemoval.restorationError
                ? { restoration_error: markerRemoval.restorationError }
                : {}),
            },
            "Keep the resource unavailable and reconcile the release marker before retrying.",
          );
        }
        return { kind: "released" };
      };

      return { kind: "acquired", lease: { lockPath, owner, release } };
    } catch (error) {
      return failed(
        "coordination_storage_failed",
        "Kepler could not inspect or create the selected coordination resource.",
        { resource_key: request.resourceKey, message: error instanceof Error ? error.message : String(error) },
        "Check local Git common-directory access and preserve any partial coordination artifacts.",
      );
    }
  };

  return { acquire };
};
