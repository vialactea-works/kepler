import type { KeplerCliDriver } from "../driver.js";
import type { CommandResult } from "../connectors.js";

export type AuditRecordKind = "evidence" | "approval" | "interaction";

export interface AuditScope {
  readonly unit: string;
  readonly stage?: string;
  readonly task?: string;
  readonly activity?: string;
  readonly attempt?: string;
  readonly implementationAttempt?: string;
}

export interface AuditListRequest extends AuditScope {
  readonly type?: string;
  readonly fields?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface AuditEnvelope {
  readonly status: "success" | "failed";
  readonly data: Record<string, unknown>;
}

export interface AuditCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly result: AuditEnvelope;
}

export interface AuditObservation {
  readonly journals: () => Promise<string>;
}

const parse = (result: CommandResult): AuditCommandResult => ({
  ...result,
  result: JSON.parse(result.stdout) as AuditEnvelope,
});

const addScope = (args: string[], scope: AuditScope): void => {
  args.push("--unit", scope.unit);
  if (scope.stage !== undefined) args.push("--stage", scope.stage);
  if (scope.task !== undefined) args.push("--task", scope.task);
  if (scope.activity !== undefined) args.push("--activity", scope.activity);
  if (scope.attempt !== undefined) args.push("--attempt", scope.attempt);
  if (scope.implementationAttempt !== undefined) args.push("--implementation-attempt", scope.implementationAttempt);
};

export class AuditCliDriver {
  constructor(
    private readonly cli: KeplerCliDriver,
    private readonly observation: AuditObservation,
  ) {}

  record(kind: AuditRecordKind, scope: AuditScope, request: unknown): AuditCommandResult {
    const args = ["audit", "record", kind];
    addScope(args, scope);
    return parse(this.cli.run(args, { stdin: JSON.stringify(request) }));
  }

  list(request: AuditListRequest): AuditCommandResult {
    const args = ["audit", "list"];
    addScope(args, request);
    if (request.type !== undefined) args.push("--type", request.type);
    if (request.fields !== undefined) args.push("--fields", request.fields);
    if (request.limit !== undefined) args.push("--limit", String(request.limit));
    if (request.cursor !== undefined) args.push("--cursor", request.cursor);
    return parse(this.cli.run(args));
  }

  show(unit: string, journal: string, id: string): AuditCommandResult {
    return parse(this.cli.run(["audit", "show", "--unit", unit, "--journal", journal, "--id", id]));
  }

  journalSnapshot(): Promise<string> {
    return this.observation.journals();
  }
}
