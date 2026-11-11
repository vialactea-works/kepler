import type { ConstructionHistoryFact } from "./projection.js";
import type { TaskGraphPrerequisite } from "./task-graph.js";

export interface TaskPrerequisiteEvidenceScope {
  readonly taskId: string;
  readonly implementationAttemptId?: string;
  readonly historyBlocked?: boolean;
}

export interface UnknownTaskPrerequisite {
  readonly [key: string]: unknown;
  readonly index: number;
  readonly description: string;
  readonly needed_for: TaskGraphPrerequisite["needed_for"];
  readonly needed_when: string;
  readonly blocking: boolean;
  readonly condition: string;
  readonly reason: string;
  readonly status: "unknown";
}

export interface DiscoveredTaskPrerequisiteEvidence {
  readonly knownFacts: readonly { readonly evidence_id: string; readonly event_id: string; readonly type: string }[];
  readonly unknownPrerequisites: readonly UnknownTaskPrerequisite[];
}

export type SelectedTaskPrerequisiteEvidence =
  | { readonly kind: "valid"; readonly facts: readonly ConstructionHistoryFact[] }
  | { readonly kind: "invalid"; readonly missing: readonly string[]; readonly invalid: readonly string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAdmissionPrerequisite = (prerequisite: TaskGraphPrerequisite): boolean =>
  prerequisite.blocking && prerequisite.needed_for === "implementation";

const evidenceById = (facts: readonly ConstructionHistoryFact[]): ReadonlyMap<string, readonly ConstructionHistoryFact[]> => {
  const grouped = new Map<string, ConstructionHistoryFact[]>();
  for (const fact of facts) {
    if (fact.event.type !== "construction.evidence-recorded") continue;
    const id = fact.event.data.evidence_id;
    if (typeof id !== "string") continue;
    grouped.set(id, [...(grouped.get(id) ?? []), fact]);
  }
  return grouped;
};

const validEvidenceForScope = (
  fact: ConstructionHistoryFact | undefined,
  scope: TaskPrerequisiteEvidenceScope,
): fact is ConstructionHistoryFact & { readonly event: { readonly type: "construction.evidence-recorded" } } => {
  if (!fact || scope.historyBlocked || !scope.implementationAttemptId || fact.event.type !== "construction.evidence-recorded") return false;
  const data = fact.event.data;
  return data.stage === "implementation" && data.stage_attempt_id === scope.implementationAttemptId &&
    data.task_id === scope.taskId && data.activity === undefined && data.activity_attempt_id === undefined &&
    data.check === "task-prerequisite" && isRecord(data.result) && data.result.status === "passed" &&
    Array.isArray(data.inputs);
};

const covers = (
  fact: ConstructionHistoryFact,
  prerequisite: TaskGraphPrerequisite,
): boolean => fact.event.type === "construction.evidence-recorded" &&
  Array.isArray(fact.event.data.inputs) && fact.event.data.inputs.some((input) => isRecord(input) &&
    (input.reference === prerequisite.condition || input.reference === prerequisite.description));

const unknownPrerequisites = (
  prerequisites: readonly TaskGraphPrerequisite[],
  covered: ReadonlySet<number>,
): readonly UnknownTaskPrerequisite[] => prerequisites.flatMap((prerequisite, index) =>
  covered.has(index) ? [] : [{ index, ...prerequisite, status: "unknown" as const }],
);

export const discoverTaskPrerequisiteEvidence = (
  prerequisites: readonly TaskGraphPrerequisite[],
  facts: readonly ConstructionHistoryFact[],
  scope: TaskPrerequisiteEvidenceScope,
): DiscoveredTaskPrerequisiteEvidence => {
  const byId = evidenceById(facts);
  const validFacts: ConstructionHistoryFact[] = [];
  if (!scope.historyBlocked && scope.implementationAttemptId) {
    for (const matches of byId.values()) {
      const candidate = matches.length === 1 ? matches[0] : undefined;
      if (validEvidenceForScope(candidate, scope)) validFacts.push(candidate);
    }
  }
  const covered = new Set<number>();
  const known = new Map<string, { readonly evidence_id: string; readonly event_id: string; readonly type: string }>();
  for (const fact of validFacts) {
    for (const [index, prerequisite] of prerequisites.entries()) {
      if (!covers(fact, prerequisite)) continue;
      covered.add(index);
      if (fact.event.type === "construction.evidence-recorded" && typeof fact.event.data.evidence_id === "string") {
        known.set(fact.event.data.evidence_id, {
          evidence_id: fact.event.data.evidence_id,
          event_id: fact.event.id,
          type: fact.event.type,
        });
      }
    }
  }
  return { knownFacts: [...known.values()], unknownPrerequisites: unknownPrerequisites(prerequisites, covered) };
};

export const validateSelectedTaskPrerequisiteEvidence = (
  prerequisites: readonly TaskGraphPrerequisite[],
  facts: readonly ConstructionHistoryFact[],
  scope: TaskPrerequisiteEvidenceScope,
  evidenceIds: readonly string[],
): SelectedTaskPrerequisiteEvidence => {
  const byId = evidenceById(facts);
  const invalid = new Set<string>();
  const selected: ConstructionHistoryFact[] = [];
  const duplicateIds = new Set(evidenceIds.filter((id, index) => evidenceIds.indexOf(id) !== index));
  for (const id of evidenceIds) {
    const matches = byId.get(id) ?? [];
    const fact = matches.length === 1 ? matches[0] : undefined;
    if (duplicateIds.has(id) || !validEvidenceForScope(fact, scope)) invalid.add(id);
    else selected.push(fact);
  }
  const missing = prerequisites.flatMap((prerequisite) => {
    if (!isAdmissionPrerequisite(prerequisite) || selected.some((fact) => covers(fact, prerequisite))) return [];
    return [prerequisite.description];
  });
  return missing.length > 0 || invalid.size > 0
    ? { kind: "invalid", missing, invalid: [...invalid] }
    : { kind: "valid", facts: selected };
};
