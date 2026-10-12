import { Ajv } from "ajv";
import { parseDocument } from "yaml";
import * as Path from "node:path";
import type { RecognizedArtifact } from "./artifact-reader.js";
import type {
  ArtifactContractDiagnostic, ArtifactWorkflowRecord, FinishRecordProjection,
} from "./artifact-types.js";
import { isFullTargetBranchReference } from "./git-reference.js";

const sha = { type: "string", pattern: "^[0-9a-f]{40}$" };
const string = { type: "string", minLength: 1, pattern: "\\S" };
const path = { type: "string", pattern: "^\\.kepler/(?!.*(?:^|/)\\.\\.(?:/|$))[^\\\\\\u0000]+$" };
const object = (properties: Record<string, unknown>) => ({
  type: "object", additionalProperties: false, required: Object.keys(properties), properties,
});
const nullable = (schema: unknown) => ({ anyOf: [schema, { type: "null" }] });
const effects = {
  type: "array", uniqueItems: true,
  items: object({ kind: { enum: ["canonical-spec", "route", "map", "history"] }, path }),
};
const delivery = nullable({ anyOf: [
  object({ strategy: { const: "local-merge" }, targetRef: string, commit: sha }),
  object({
    strategy: { const: "pull-request" }, provider: { enum: ["github", "gitlab"] },
    repository: string, url: { type: "string", pattern: "^https://[^\\s]+$" }, head: sha,
    targetRef: string, state: { enum: ["open", "merged"] }, mergeCommit: nullable(sha),
  }),
  object({ strategy: { const: "no-op" }, sourceRef: string, worktree: string, commit: sha }),
] });
const schemas = {
  "Admission identity": object({
    verifiedHead: sha, targetRef: string, targetCommit: sha, reviewBase: sha,
    reviewHead: sha, reviewCommit: sha, materialWaiver: nullable(string),
    inputs: { type: "array", uniqueItems: true, items: object({ path, blob: sha }) },
  }),
  "Source identity": object({
    repository: string, root: string, sourceRef: string, worktree: string,
  }),
  "Route identity": nullable(object({
    path, mapPath: path, unit: { type: "integer", minimum: 1 }, sourceBlob: sha,
    previousStatus: { const: "in-progress" }, shipping: { enum: ["merge", "request-open", "no-op"] },
    owner: string, change: string, sourceRef: string, targetRef: string, baseCommit: sha,
  })),
  "Recovery of": object({
    attempt: { type: "integer", minimum: 1 }, outcomeCommit: sha, previousRepairCommit: nullable(sha),
  }),
  "Delivery identity": delivery,
  "Remaining effects": effects,
  "Specification synchronization result": object({
    paths: { type: "array", uniqueItems: true, items: { type: "string", pattern: "^\\.kepler/specs/[^/\\\\]+\\.md$" } },
    commit: nullable(sha),
  }),
};
const ajv = new Ajv({ strict: true, allErrors: true });
const validators = Object.fromEntries(Object.entries(schemas).map(([key, schema]) => [key, ajv.compile(schema)]));
interface FinishJsonFields {
  readonly "Source identity": FinishRecordProjection["source"];
  readonly "Admission identity": FinishRecordProjection["admission"];
  readonly "Route identity": FinishRecordProjection["route"];
  readonly "Recovery of": NonNullable<FinishRecordProjection["recovery"]>;
  readonly "Delivery identity": NonNullable<FinishRecordProjection["outcome"]>["delivery"];
  readonly "Remaining effects": NonNullable<FinishRecordProjection["remaining"]>;
  readonly "Specification synchronization result": NonNullable<FinishRecordProjection["outcome"]>["synchronization"];
}
const fields = new Set([...Object.keys(schemas), "Strategy", "Result"]);

export const parseFinishRecords = (
  artifact: RecognizedArtifact,
  records: readonly ArtifactWorkflowRecord[],
  lines: readonly string[],
): { readonly records: readonly FinishRecordProjection[]; readonly diagnostics: readonly ArtifactContractDiagnostic[] } => {
  const diagnostics: ArtifactContractDiagnostic[] = [];
  const projected: FinishRecordProjection[] = [];
  const fail = (record: ArtifactWorkflowRecord, message: string) => diagnostics.push({
    _tag: "ArtifactContractDiagnostic", code: "invalid-record", sourcePath: artifact.sourcePath,
    message: `Finish ${record.kind} ${record.number}: ${message}`, location: { line: record.line },
  });
  const json = <K extends keyof FinishJsonFields>(record: ArtifactWorkflowRecord, field: K): FinishJsonFields[K] | undefined => {
    const source = record.fields[field];
    try {
      if (source === undefined) throw new Error("missing field");
      const value: unknown = JSON.parse(source);
      if (parseDocument(source, { uniqueKeys: true }).errors.length !== 0)
        throw new Error("duplicate JSON key");
      const validate = validators[field]!;
      if (!validate(value)) throw new Error(ajv.errorsText(validate.errors));
      return value as FinishJsonFields[K];
    } catch (error) {
      fail(record, `${field} is invalid: ${String(error)}`);
      return undefined;
    }
  };
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const start = record.line - artifact.locations.body.startLine + 1;
    const end = records[index + 1] === undefined ? lines.length : records[index + 1]!.line - artifact.locations.body.startLine;
    const seen = new Set<string>();
    for (const line of lines.slice(start, end)) {
      const name = /^- ([^:]+):/.exec(line)?.[1];
      if (name && fields.has(name)) {
        if (seen.has(name)) fail(record, `duplicate ${name} field`);
        seen.add(name);
      }
    }
    if (record.kind !== "attempt") {
      if (record.kind === "outcome" && records[index - 1]?.fields["Admission identity"] === undefined &&
          Object.keys(schemas).some((field) => record.fields[field] !== undefined))
        fail(record, "explicit outcome metadata requires recorded Admission identity");
      continue;
    }
    const modern = record.fields["Admission identity"] !== undefined;
    const repair = record.fields.Strategy === "reconcile-delivery";
    if (!modern) {
      if (repair || Object.keys(schemas).some((field) => record.fields[field] !== undefined))
        fail(record, "explicit recovery metadata requires Admission identity; legacy provenance cannot be invented");
      continue;
    }
    const strategy = record.fields.Strategy;
    if (!["local-merge", "pull-request", "no-op", "reconcile-delivery"].includes(strategy ?? ""))
      fail(record, "unsupported Strategy");
    const admission = json(record, "Admission identity");
    const route = json(record, "Route identity");
    const source = json(record, "Source identity");
    if (source && (![source.repository, source.root, source.worktree].every((path) => Path.isAbsolute(path) && !path.includes("\0")) ||
        !isFullTargetBranchReference(source.sourceRef) || !source.sourceRef.startsWith("refs/heads/") || source.sourceRef === admission?.targetRef))
      fail(record, "source identity must name a generation branch distinct from target");
    if (admission) {
      if (!isFullTargetBranchReference(admission.targetRef)) fail(record, "targetRef must be a full target reference");
      if (new Set(admission.inputs.map((input) => input.path)).size !== admission.inputs.length)
        fail(record, "approved input paths must be unique");
      if (admission.inputs.some((input) => !input.path.startsWith(`.kepler/changes/${artifact.metadata.change}/`)))
        fail(record, "approved inputs must belong to this change");
    }
    if (route) {
      if (route.change !== artifact.metadata.change || !isFullTargetBranchReference(route.sourceRef) ||
          !isFullTargetBranchReference(route.targetRef) || route.sourceRef === route.targetRef ||
          route.targetRef !== admission?.targetRef || !route.path.match(/^\.kepler\/maps\/[^/]+\/route\.md$/) ||
          route.mapPath !== route.path.replace(/route\.md$/, "map.md")) fail(record, "route identity is inconsistent");
      if (!repair && records[index + 1]?.kind !== "outcome" && (route.shipping === "merge" && strategy !== "local-merge" ||
          route.shipping === "request-open" && strategy === "no-op" || route.shipping === "no-op" && strategy !== "no-op"))
        fail(record, "strategy cannot satisfy the route shipping condition");
    }
    const recovery = repair ? json(record, "Recovery of") : undefined;
    const repairDelivery = repair ? json(record, "Delivery identity") : undefined;
    const remaining = repair ? json(record, "Remaining effects") : undefined;
    if (!repair && record.fields["Recovery of"] !== undefined) fail(record, "ordinary attempt cannot claim recovery authority");
    const next = records[index + 1];
    let outcome: FinishRecordProjection["outcome"];
    if (next?.kind === "outcome") {
      const result = next.fields.Result;
      if (result !== "completed" && result !== "blocked") fail(next, "Result must be completed or blocked");
      const synchronization = json(next, "Specification synchronization result");
      const observedDelivery = json(next, "Delivery identity");
      const observedRemaining = json(next, "Remaining effects");
      if (synchronization && observedDelivery !== undefined && observedRemaining && (result === "completed" || result === "blocked")) {
        if (result === "completed" && (observedDelivery === null || observedRemaining.length !== 0)) fail(next, "completed requires verified delivery and no remaining effects");
        if (observedDelivery && observedDelivery.strategy !== (repair ? repairDelivery?.strategy : strategy)) fail(next, "delivery strategy does not match intent");
        if (repair && observedDelivery && repairDelivery) {
          const same = observedDelivery.strategy === "pull-request" && repairDelivery.strategy === "pull-request"
            ? observedDelivery.provider === repairDelivery.provider && observedDelivery.repository === repairDelivery.repository &&
              observedDelivery.url === repairDelivery.url && observedDelivery.head === repairDelivery.head && observedDelivery.targetRef === repairDelivery.targetRef &&
              (observedDelivery.state === repairDelivery.state || observedDelivery.state === "merged" && repairDelivery.state === "open")
            : JSON.stringify(observedDelivery) === JSON.stringify(repairDelivery);
          if (!same) fail(next, "repair must retain the original delivery identity");
        } else if (repair) fail(next, "repair cannot erase observed delivery");
        if (observedDelivery) {
          const ref = observedDelivery.strategy === "no-op" ? observedDelivery.sourceRef : observedDelivery.targetRef;
          if (!isFullTargetBranchReference(ref)) fail(next, "delivery must use a full branch reference");
          if (observedDelivery.strategy === "pull-request" && (observedDelivery.state === "merged") !== (observedDelivery.mergeCommit !== null))
            fail(next, "request state and merge commit must agree");
        }
        if (synchronization.paths.length === 0 && synchronization.commit !== null || synchronization.paths.length !== 0 && synchronization.commit === null)
          fail(next, "synchronization paths and commit must agree");
        outcome = { result, synchronization, delivery: observedDelivery, remaining: observedRemaining };
      }
    }
    const permitted = (effect: { kind: string; path: string }) => {
      if (effect.path.split("/").some((part) => part === ".." || part === "." || part === "")) return false;
      if (effect.kind === "history") return effect.path === `.kepler/changes/${artifact.metadata.change}/finish.md`;
      if (effect.kind === "route") return effect.path === route?.path;
      if (effect.kind === "map") return effect.path === route?.mapPath;
      return admission?.inputs.some((input) => {
        const capability = /^\.kepler\/changes\/[^/]+\/requirements\/([^/]+)\.md$/.exec(input.path)?.[1];
        return capability !== undefined && effect.path === `.kepler/specs/${capability}.md`;
      }) ?? false;
    };
    if ([...(remaining ?? []), ...(outcome?.remaining ?? [])].some((effect) => !permitted(effect)))
      fail(record, "remaining effects exceed the exact finish-owned path boundary");
    if (repair) {
      const original = projected.find((candidate) => candidate.number === recovery?.attempt);
      if (!original || original.strategy === "reconcile-delivery" || original.outcome?.result !== "blocked" || original.outcome.delivery === null ||
          recovery!.attempt >= (record.number ?? 0) || !repairDelivery || remaining === undefined ||
          JSON.stringify(original.admission) !== JSON.stringify(admission) || JSON.stringify(original.source) !== JSON.stringify(source) || JSON.stringify(original.route) !== JSON.stringify(route) ||
          JSON.stringify(original.outcome.delivery) !== JSON.stringify(repairDelivery))
        fail(record, "repair must reference this change's earlier blocked, delivered pair and exact original identities");
      const previous = projected.filter((candidate) => candidate.recovery?.attempt === recovery?.attempt).at(-1) ?? original;
      if (remaining?.some((effect) => !previous?.outcome?.remaining.some((allowed) => allowed.kind === effect.kind && allowed.path === effect.path)))
        fail(record, "repair cannot add an effect absent from the latest blocked boundary");
      if (projected.some((candidate) => candidate.recovery?.attempt === recovery?.attempt && candidate.outcome?.result === "completed"))
        fail(record, "delivery already has a completed repair");
    }
    if (admission && source && route !== undefined && strategy && ["local-merge", "pull-request", "no-op", "reconcile-delivery"].includes(strategy))
      projected.push({ number: record.number!, strategy: strategy as FinishRecordProjection["strategy"], admission, source, route,
        ...(recovery ? { recovery } : {}), ...(repairDelivery !== undefined ? { delivery: repairDelivery } : {}),
        ...(remaining ? { remaining } : {}), ...(outcome ? { outcome } : {}),
      });
  }
  const latest = projected.at(-1);
  if (latest) {
    if (artifact.metadata.strategy !== latest.strategy) fail(records.at(-1)!, "metadata strategy does not match latest intent");
    if (latest.outcome && (artifact.metadata.result !== latest.outcome.result || artifact.metadata.status !== latest.outcome.result))
      fail(records.at(-1)!, "metadata status/result do not match latest outcome");
  }
  return { records: projected, diagnostics };
};
