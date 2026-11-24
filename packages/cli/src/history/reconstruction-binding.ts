import type { HistoryCollection } from "./collection.js";
import { HistoryError, type MissionHistoryBinding } from "./control.js";

type CandidateFact = { readonly id: string; readonly type: string; readonly data: Record<string, unknown> };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

const candidateFact = (value: unknown): CandidateFact | null => {
  if (!record(value) || typeof value.id !== "string" || typeof value.type !== "string" || !record(value.data)) return null;
  return value as CandidateFact;
};

export const missionBindingMatchesCreationIdentity = (binding: MissionHistoryBinding, value: unknown): boolean => {
  const event = candidateFact(value);
  if (!event || event.type !== "construction.mission-created") return false;
  const home = event.data.record_home;
  return event.data.mission_id === binding.mission_id && record(home) && home.repository_id === binding.record_home_repository_id &&
    event.data.workflow === binding.workflow;
};

export const missionBindingReferencesCreation = (binding: MissionHistoryBinding, value: unknown): boolean => {
  const event = candidateFact(value);
  if (!event || event.type !== "construction.mission-created" || !missionBindingMatchesCreationIdentity(binding, event)) return false;
  const contexts = event.data.contexts;
  return `event:${event.id}` === binding.request_reference ||
    Array.isArray(contexts) && contexts.some((context: unknown) => record(context) && context.reference === binding.request_reference);
};

export const missionBindingMatchesCreation = (binding: MissionHistoryBinding, value: unknown): boolean => {
  const event = candidateFact(value);
  return event?.type === "construction.mission-created" && missionBindingMatchesCreationIdentity(binding, event) &&
    (event.data.request === binding.request_reference || missionBindingReferencesCreation(binding, event));
};

export const validateCandidateMissionIdentity = (
  binding: MissionHistoryBinding,
  history: HistoryCollection,
  errorCode: string,
): void => {
  const creations = history.events.flatMap((entry) => {
    const event = candidateFact(entry.constructionEvent);
    return entry.status === "valid" && event?.type === "construction.mission-created" ? [event] : [];
  });
  if (creations.length !== 1 || !missionBindingMatchesCreationIdentity(binding, creations[0])) {
    throw new HistoryError(errorCode, "The candidate mission creation does not match the selected reset identity.", {
      mission_id: binding.mission_id,
      creation_count: creations.length,
    });
  }
  const candidateUnitIds = history.events.flatMap((entry) => {
    const event = candidateFact(entry.constructionEvent);
    return entry.status === "valid" && event?.type === "construction.unit-created" && event.data.mission_id === binding.mission_id && typeof event.data.unit_id === "string"
      ? [event.data.unit_id]
      : [];
  }).sort();
  const knownUnitIds = [...binding.unit_ids].sort();
  if (candidateUnitIds.length !== knownUnitIds.length || candidateUnitIds.some((unitId, index) => unitId !== knownUnitIds[index])) {
    throw new HistoryError(errorCode, "The candidate unit identities do not match the selected reset binding.", {
      mission_id: binding.mission_id,
      expected_unit_ids: binding.unit_ids,
      candidate_unit_ids: candidateUnitIds,
    });
  }
};
