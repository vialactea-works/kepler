import type { KeplerCliDriver } from "../driver.js";
import type { AuditCommandResult, AuditEnvelope } from "./audit-cli.js";

export class StageCompletionCliDriver {
  constructor(private readonly cli: KeplerCliDriver) {}

  assessRetainedScopes(unit: string, attempt: string, request: unknown): AuditCommandResult {
    const result = this.cli.run([
      "workflow",
      "construction",
      "stage",
      "assess-retained-scopes",
      "--unit",
      unit,
      "--stage",
      "implementation",
      "--attempt",
      attempt,
      "--request",
      JSON.stringify(request),
    ]);
    return {
      ...result,
      result: JSON.parse(result.stdout) as AuditEnvelope,
    };
  }

  complete(unit: string, attempt: string, request: unknown, stage = "functional-design"): AuditCommandResult {
    const result = this.cli.run([
      "workflow",
      "construction",
      "stage",
      "complete",
      "--unit",
      unit,
      "--stage",
      stage,
      "--attempt",
      attempt,
      "--request",
      JSON.stringify(request),
    ]);
    return {
      ...result,
      result: JSON.parse(result.stdout) as AuditEnvelope,
    };
  }
}
