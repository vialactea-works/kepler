import type { HistoryAccess } from "./access.js";
import type { HistoryArchives } from "./archives.js";
import { HistoryError, type HistoryDigest, type HistoryResetManifest } from "./control.js";
import type { HistorySnapshot } from "./files.js";
import type { HistoryOperationIntent } from "./operation-intent.js";
import { HistoryOperations } from "./operations.js";

export interface HistoryResetScopeCheck {
  readonly phase: "preview" | "apply";
  readonly recordHome: string;
  readonly manifest: HistoryResetManifest;
  readonly snapshot: HistorySnapshot;
  readonly intent: HistoryOperationIntent | null;
}

export interface HistoryResetRuntime {
  readonly access: HistoryAccess;
  readonly archives: HistoryArchives;
  readonly next: () => string;
  readonly clock: () => Date;
  readonly producer: { readonly name: string; readonly version: string };
  readonly verifyScope: (request: HistoryResetScopeCheck) => Promise<
    | { readonly status: "valid"; readonly reference: string; readonly content_version: HistoryDigest }
    | { readonly status: "invalid"; readonly reason: string }
  >;
}

export class HistoryReset {
  private readonly operations: HistoryOperations;

  public constructor(runtime: HistoryResetRuntime) {
    if (typeof runtime.verifyScope !== "function") throw new HistoryError("history_verifier_required", "Reset requires an actual scope verifier.");
    const verifyScope = runtime.verifyScope;
    this.operations = new HistoryOperations({ ...runtime, verifyScope: (request) => {
      if (request.manifest.format !== "kepler.mission-history-reset") throw new HistoryError("history_manifest_operation_mismatch", "Reset cannot use another operation's authority.");
      return verifyScope({ ...request, manifest: request.manifest });
    } });
  }

  public execute(scope: { readonly recordHome: string; readonly missionId: string }, input: unknown): Promise<Readonly<Record<string, unknown>>> {
    return this.operations.execute("reset", scope, input);
  }
}
