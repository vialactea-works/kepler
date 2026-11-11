export class MetadataJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetadataJsonError";
  }
}

export function parseMetadataJsonObject(
  content: string,
  label: string,
): Record<string, unknown> {
  rejectDuplicateJsonMembers(content, label);
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    throw new MetadataJsonError(`Invalid ${label} JSON`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new MetadataJsonError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectDuplicateJsonMembers(content: string, label: string): void {
  let cursor = 0;
  const skipWhitespace = (): void => {
    while (/\s/.test(content[cursor] ?? "")) cursor += 1;
  };
  const readString = (): string => {
    const start = cursor;
    if (content[cursor] !== '"') throw new Error("Expected a JSON string");
    cursor += 1;
    while (cursor < content.length) {
      const character = content[cursor];
      if (character === "\\") {
        cursor += 2;
      } else if (character === '"') {
        cursor += 1;
        try {
          return JSON.parse(content.slice(start, cursor)) as string;
        } catch (error) {
          throw new Error(`Invalid JSON string: ${String(error)}`);
        }
      } else {
        if ((character?.charCodeAt(0) ?? 0) < 0x20) {
          throw new Error("Invalid control character in JSON string");
        }
        cursor += 1;
      }
    }
    throw new Error("Unterminated JSON string");
  };
  const readValue = (): void => {
    skipWhitespace();
    const character = content[cursor];
    if (character === "{") {
      readObject();
      return;
    }
    if (character === "[") {
      readArray();
      return;
    }
    if (character === '"') {
      readString();
      return;
    }
    const start = cursor;
    while (cursor < content.length && !/[\s,\]}]/.test(content[cursor] ?? "")) {
      cursor += 1;
    }
    if (cursor === start) throw new Error("Invalid JSON value");
  };
  const readObject = (): void => {
    cursor += 1;
    skipWhitespace();
    if (content[cursor] === "}") {
      cursor += 1;
      return;
    }
    const keys = new Set<string>();
    while (cursor < content.length) {
      skipWhitespace();
      const key = readString();
      if (keys.has(key)) {
        throw new MetadataJsonError(`Duplicate JSON object member in ${label}: ${key}`);
      }
      keys.add(key);
      skipWhitespace();
      if (content[cursor] !== ":") throw new Error("Expected a JSON colon");
      cursor += 1;
      readValue();
      skipWhitespace();
      if (content[cursor] === "}") {
        cursor += 1;
        return;
      }
      if (content[cursor] !== ",") throw new Error("Expected a JSON comma");
      cursor += 1;
    }
    throw new Error("Unterminated JSON object");
  };
  const readArray = (): void => {
    cursor += 1;
    skipWhitespace();
    if (content[cursor] === "]") {
      cursor += 1;
      return;
    }
    while (cursor < content.length) {
      readValue();
      skipWhitespace();
      if (content[cursor] === "]") {
        cursor += 1;
        return;
      }
      if (content[cursor] !== ",") throw new Error("Expected a JSON comma");
      cursor += 1;
    }
    throw new Error("Unterminated JSON array");
  };

  try {
    readValue();
    skipWhitespace();
    if (cursor !== content.length) throw new Error("Trailing JSON content");
  } catch (error) {
    if (error instanceof MetadataJsonError) throw error;
    throw new MetadataJsonError(`Invalid ${label} JSON`);
  }
}
