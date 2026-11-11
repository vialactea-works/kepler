import type { ConstructionStage } from "./events.js";

export interface StageAuthorityFact {
  readonly event: {
    readonly id: string;
    readonly type: string;
    readonly data: Record<string, unknown>;
    readonly caused_by: readonly string[];
  };
}

export interface StageStartAuthorityInput {
  readonly stage: ConstructionStage;
  readonly unitId: string;
  readonly authorityEventIds: unknown;
  readonly causedBy: readonly string[];
  readonly expectedUpstreamEventIds: readonly string[];
  readonly facts: readonly StageAuthorityFact[];
}

export type StageStartAuthorityResult =
  | { readonly kind: "valid"; readonly eventIds: readonly string[] }
  | { readonly kind: "invalid"; readonly details: Readonly<Record<string, unknown>> };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const validateStageStartAuthority = (input: StageStartAuthorityInput): StageStartAuthorityResult => {
  const actual = input.authorityEventIds;
  if (!Array.isArray(actual) || !actual.every((id) => typeof id === "string") || new Set(actual).size !== actual.length) {
    return { kind: "invalid", details: { expected_upstream_event_ids: input.expectedUpstreamEventIds, actual_authority_event_ids: actual } };
  }
  const reopenEvents = input.facts.filter((fact) => fact.event.type === "construction.stage-reopened" &&
    fact.event.data.unit_id === input.unitId && fact.event.data.stage === input.stage && input.causedBy.includes(fact.event.id));
  const extras = actual.slice(input.expectedUpstreamEventIds.length);
  let expected = [...input.expectedUpstreamEventIds];
  if (reopenEvents.length === 0) {
    if (extras.length !== 0) return { kind: "invalid", details: { expected_upstream_event_ids: input.expectedUpstreamEventIds, actual_authority_event_ids: actual, reopen_events: 0 } };
  } else {
    const reopen = reopenEvents[0];
    const revisionId = reopen?.event.data.revision_id;
    const authorizations = input.facts.filter((fact) => fact.event.type === "construction.revision-authorized" &&
      fact.event.data.unit_id === input.unitId && fact.event.data.stage === input.stage && fact.event.data.revision_id === revisionId &&
      reopen?.event.caused_by.includes(fact.event.id));
    const authorization = authorizations[0];
    if (reopenEvents.length !== 1 || authorizations.length !== 1 || !reopen || !authorization || extras.length !== 2 ||
        extras[0] !== reopen.event.id || extras[1] !== authorization.event.id ||
        !input.causedBy.includes(authorization.event.id) || !isRecord(reopen.event.data) || typeof revisionId !== "string") {
      return { kind: "invalid", details: { expected_upstream_event_ids: input.expectedUpstreamEventIds, actual_authority_event_ids: actual, reopen_events: reopenEvents.length, revision_authorization_events: authorizations.length } };
    }
    expected = [...expected, reopen.event.id, authorization.event.id];
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected) || expected.some((id) => !input.causedBy.includes(id))) {
    return { kind: "invalid", details: { expected_authority_event_ids: expected, actual_authority_event_ids: actual, caused_by: input.causedBy } };
  }
  return { kind: "valid", eventIds: expected };
};
