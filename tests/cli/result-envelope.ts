export interface CliEnvelope {
  readonly status: "success" | "failed";
  readonly data: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseCliEnvelope = (stdout: string): CliEnvelope => {
  if (!stdout.endsWith("\n") || stdout.indexOf("\n") !== stdout.length - 1) {
    throw new Error("Expected one JSON result followed by a newline.");
  }

  const value: unknown = JSON.parse(stdout);
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== "data,status" ||
    (value.status !== "success" && value.status !== "failed") ||
    !isRecord(value.data)
  ) {
    throw new Error("Expected the shared CLI result envelope.");
  }

  return value as unknown as CliEnvelope;
};

export const unwrapLegacyOutput = (stdout: string): string => {
  if (!stdout.startsWith("{")) return stdout;

  const result = parseCliEnvelope(stdout);
  if (result.status === "success") {
    return typeof result.data.output === "string" ? result.data.output : "";
  }

  const details = result.data.details;
  return isRecord(details) && typeof details.output === "string"
    ? details.output
    : "";
};
