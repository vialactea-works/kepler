export const hasRequesterParticipant = (value: unknown): boolean =>
  Array.isArray(value) && value.some((participant) =>
    typeof participant === "string" && participant.trim().toLowerCase() === "requester",
  );
