const envelopeFields = [
  "id",
  "phase",
  "type",
  "envelope_version",
  "event_version",
  "journal_id",
  "recorded_at",
  "producer",
  "caused_by",
  "data",
] as const;

const producerFields = ["name", "version"] as const;

const eventIdBrand: unique symbol = Symbol("EventId");
const journalIdBrand: unique symbol = Symbol("JournalId");

export type EventId = string & { readonly [eventIdBrand]: true };
export type JournalId = string & { readonly [journalIdBrand]: true };

export interface EventProducer {
  readonly name: string;
  readonly version: string;
}

export interface EventEnvelope<TData = Readonly<Record<string, unknown>>> {
  readonly id: EventId;
  readonly phase: string;
  readonly type: string;
  readonly envelope_version: number;
  readonly event_version: number;
  readonly journal_id: JournalId;
  readonly recorded_at: string;
  readonly producer: EventProducer;
  readonly caused_by: readonly EventId[];
  readonly data: TData;
}

export const EVENT_ENVELOPE_VERSION = 1;

export type EventEnvelopeIssue = {
  readonly path: string;
  readonly message: string;
};

export type EventEnvelopeValidation =
  | { readonly status: "valid"; readonly event: EventEnvelope }
  | {
      readonly status: "unsupported";
      readonly event: EventEnvelope;
      readonly field: "envelope_version";
      readonly supportedVersion: number;
    }
  | { readonly status: "invalid"; readonly issues: readonly EventEnvelopeIssue[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && keys.every((key) =>
    typeof key === "string" && expected.includes(key),
  );
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isJsonValue = (value: unknown, ancestors = new WeakSet<object>()): boolean => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
  ancestors.add(value);
  let valid = true;
  if (Array.isArray(value)) {
    const keys = Reflect.ownKeys(value);
    valid = Object.keys(value).length === value.length && keys.length === value.length + 1;
    for (let index = 0; valid && index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      valid = descriptor !== undefined && descriptor.enumerable === true && "value" in descriptor &&
        isJsonValue(descriptor.value, ancestors);
    }
  } else {
    const keys = Reflect.ownKeys(value);
    const enumerableKeys = Object.keys(value);
    valid = keys.length === enumerableKeys.length && keys.every((key) => typeof key === "string");
    for (const key of enumerableKeys) {
      if (!valid) break;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      valid = descriptor !== undefined && descriptor.enumerable === true && "value" in descriptor &&
        isJsonValue(descriptor.value, ancestors);
    }
  }
  ancestors.delete(value);
  return valid;
};

export const isUtcZTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(value);
  if (!match) return false;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) &&
    instant.getUTCFullYear() === Number(match[1]) &&
    instant.getUTCMonth() + 1 === Number(match[2]) &&
    instant.getUTCDate() === Number(match[3]) &&
    instant.getUTCHours() === Number(match[4]) &&
    instant.getUTCMinutes() === Number(match[5]) &&
    instant.getUTCSeconds() === Number(match[6]);
};

export const validateEventEnvelope = (value: unknown): EventEnvelopeValidation => {
  const issues: EventEnvelopeIssue[] = [];
  try {
    if (!isRecord(value)) {
      return { status: "invalid", issues: [{ path: "", message: "Expected an event object" }] };
    }
    if (!hasExactKeys(value, envelopeFields)) {
      issues.push({ path: "", message: "Expected exactly the ten event envelope fields" });
    }
    if (!isNonEmptyString(value.id)) issues.push({ path: "/id", message: "Expected a non-empty event ID" });
    if (!isNonEmptyString(value.phase)) issues.push({ path: "/phase", message: "Expected a non-empty phase" });
    if (!isNonEmptyString(value.type)) issues.push({ path: "/type", message: "Expected a non-empty event type" });
    if (!isPositiveInteger(value.envelope_version)) {
      issues.push({ path: "/envelope_version", message: "Expected a positive integer" });
    }
    if (!isPositiveInteger(value.event_version)) {
      issues.push({ path: "/event_version", message: "Expected a positive integer" });
    }
    if (!isNonEmptyString(value.journal_id)) {
      issues.push({ path: "/journal_id", message: "Expected a non-empty journal ID" });
    }
    if (!isUtcZTimestamp(value.recorded_at)) {
      issues.push({ path: "/recorded_at", message: "Expected an RFC3339 UTC timestamp with a literal Z suffix" });
    }
    if (!isRecord(value.producer) || !hasExactKeys(value.producer, producerFields)) {
      issues.push({ path: "/producer", message: "Expected exactly producer name and version" });
    } else {
      if (!isNonEmptyString(value.producer.name)) {
        issues.push({ path: "/producer/name", message: "Expected a non-empty producer name" });
      }
      if (!isNonEmptyString(value.producer.version)) {
        issues.push({ path: "/producer/version", message: "Expected a non-empty producer version" });
      }
    }
    if (!Array.isArray(value.caused_by) || !value.caused_by.every(isNonEmptyString)) {
      issues.push({ path: "/caused_by", message: "Expected an array of non-empty event IDs" });
    } else {
      if (new Set(value.caused_by).size !== value.caused_by.length) {
        issues.push({ path: "/caused_by", message: "Causal event IDs must be unique" });
      }
      if (isNonEmptyString(value.id) && value.caused_by.includes(value.id)) {
        issues.push({ path: "/caused_by", message: "An event cannot directly cause itself" });
      }
    }
    if (!isRecord(value.data) || !isJsonValue(value.data)) {
      issues.push({ path: "/data", message: "Expected a JSON object" });
    }
    if (issues.length > 0) return { status: "invalid", issues };
    const event: EventEnvelope = {
      id: value.id as EventId,
      phase: value.phase as string,
      type: value.type as string,
      envelope_version: value.envelope_version as number,
      event_version: value.event_version as number,
      journal_id: value.journal_id as JournalId,
      recorded_at: value.recorded_at as string,
      producer: value.producer as EventProducer,
      caused_by: value.caused_by as EventId[],
      data: value.data as Readonly<Record<string, unknown>>,
    };
    if (event.envelope_version !== EVENT_ENVELOPE_VERSION) {
      return {
        status: "unsupported",
        event,
        field: "envelope_version",
        supportedVersion: EVENT_ENVELOPE_VERSION,
      };
    }
    return { status: "valid", event };
  } catch {
    return { status: "invalid", issues: [{ path: "", message: "Event object could not be inspected" }] };
  }
};
