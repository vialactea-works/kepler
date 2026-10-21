import type { KeplerCliDriver } from "../driver.js";
import type { AuditCommandResult, AuditEnvelope } from "./audit-cli.js";

export class StageCompletionCliDriver {
  constructor(private readonly cli: KeplerCliDriver) {}

  complete(unit: string, attempt: string, request: unknown): AuditCommandResult {
    const result = this.cli.run([
      "workflow",
      "construction",
      "stage",
      "complete",
      "--unit",
      unit,
      "--stage",
      "functional-design",
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
