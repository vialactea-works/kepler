import { randomUUID } from "node:crypto";

export interface GeneratedUuid {
  readonly kind: "generated";
  readonly uuid: string;
}

export interface UuidGenerationFailure {
  readonly kind: "failed";
  readonly code: "uuid_generation_failed";
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly recovery: string;
}

export type UuidGenerationResult = GeneratedUuid | UuidGenerationFailure;

const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const generateUuid = (
  generate: () => string = randomUUID,
): UuidGenerationResult => {
  try {
    const uuid = generate();
    if (uuidV4Pattern.test(uuid)) return { kind: "generated", uuid };
    return {
      kind: "failed",
      code: "uuid_generation_failed",
      message: "The UUID generator returned a value outside the UUIDv4 format.",
      details: {},
      recovery: "Retry the command; if generation keeps failing, check the runtime environment.",
    };
  } catch {
    return {
      kind: "failed",
      code: "uuid_generation_failed",
      message: "Kepler could not generate a UUIDv4.",
      details: {},
      recovery: "Retry the command; if generation keeps failing, check the runtime environment.",
    };
  }
};
