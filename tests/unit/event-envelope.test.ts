import { describe, expect, it } from "vitest";
import {
  EVENT_ENVELOPE_VERSION,
  isUtcZTimestamp,
  validateEventEnvelope,
} from "../../packages/core/src/event-envelope.js";

const event = () => ({
  id: "event-1",
  phase: "construction",
  type: "construction.unit-created",
  envelope_version: EVENT_ENVELOPE_VERSION,
  event_version: 1,
  journal_id: "journal-1",
  recorded_at: "2026-10-18T14:30:00Z",
  producer: { name: "kepler", version: "0.10.3" },
  caused_by: [],
  data: { mission_id: "mission-1" },
});

describe("event envelope", () => {
  it("validates the exact ten-field shared envelope", () => {
    const result = validateEventEnvelope(event());
    expect(result.status).toBe("valid");
    if (result.status !== "valid") throw new Error("Expected valid envelope");
    expect(Object.keys(result.event)).toEqual([
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
    ]);
  });

  it("keeps envelope and phase payload versions independent", () => {
    const result = validateEventEnvelope({ ...event(), event_version: 19 });
    expect(result.status).toBe("valid");
    expect(validateEventEnvelope({ ...event(), envelope_version: 2 }).status).toBe("unsupported");
  });

  it("requires UTC timestamps with a literal Z and valid calendar values", () => {
    expect(isUtcZTimestamp("2026-10-18T14:30:00Z")).toBe(true);
    expect(isUtcZTimestamp("2026-10-18T14:30:00.123456Z")).toBe(true);
    expect(isUtcZTimestamp("2026-10-18T14:30:00+00:00")).toBe(false);
    expect(isUtcZTimestamp("2026-02-30T14:30:00Z")).toBe(false);
    expect(isUtcZTimestamp("2026-10-18T14:30:60Z")).toBe(false);
    expect(validateEventEnvelope({ ...event(), recorded_at: "2026-10-18T14:30:00+00:00" }).status).toBe("invalid");
  });

  it("requires producer, journal identity, and direct causes", () => {
    expect(validateEventEnvelope({ ...event(), producer: { name: "kepler", version: "" } }).status).toBe("invalid");
    expect(validateEventEnvelope({ ...event(), journal_id: " " }).status).toBe("invalid");
    expect(validateEventEnvelope({ ...event(), caused_by: ["event-0"] }).status).toBe("valid");
    expect(validateEventEnvelope({ ...event(), caused_by: ["event-1"] }).status).toBe("invalid");
    expect(validateEventEnvelope({ ...event(), caused_by: ["event-0", "event-0"] }).status).toBe("invalid");
  });

  it("rejects missing or additional envelope fields and non-JSON payloads", () => {
    const { data: _data, ...missingData } = event();
    expect(validateEventEnvelope(missingData).status).toBe("invalid");
    expect(validateEventEnvelope({ ...event(), extra: true }).status).toBe("invalid");
    expect(validateEventEnvelope({ ...event(), data: null }).status).toBe("invalid");
    expect(validateEventEnvelope({ ...event(), data: { absent: undefined } }).status).toBe("invalid");
  });

  it("rejects payload properties JSON serialization would omit or evaluate", () => {
    const hidden = Object.defineProperty({ visible: true }, "evidence_id", { value: "evidence-1" });
    expect(validateEventEnvelope({ ...event(), data: hidden }).status).toBe("invalid");
    let getterRan = false;
    const accessor = Object.defineProperty({}, "evidence_id", {
      enumerable: true,
      get: () => {
        getterRan = true;
        return "evidence-1";
      },
    });
    expect(validateEventEnvelope({ ...event(), data: accessor }).status).toBe("invalid");
    expect(getterRan).toBe(false);
  });
});
