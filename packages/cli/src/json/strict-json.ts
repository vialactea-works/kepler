export type StrictJsonParseResult =
  | { readonly kind: "parsed"; readonly value: unknown }
  | {
      readonly kind: "invalid";
      readonly code: "invalid-json" | "duplicate-json-key";
      readonly pointer: string;
      readonly message: string;
    };

const pointerSegment = (value: string): string =>
  value.replaceAll("~", "~0").replaceAll("/", "~1");

const duplicateKeyPointer = (source: string): string | undefined => {
  type Container =
    | {
        readonly kind: "object";
        readonly pointer: string;
        readonly keys: Set<string>;
        state: "key-or-end" | "key" | "colon" | "value" | "separator";
        pendingKey?: string;
      }
    | {
        readonly kind: "array";
        readonly pointer: string;
        state: "value-or-end" | "value" | "separator";
        nextIndex: number;
      };

  let index = 0;
  const stack: Container[] = [];
  const skipWhitespace = (): void => {
    while ([" ", "\t", "\r", "\n"].includes(source[index] ?? "")) index += 1;
  };
  const parseString = (): string | undefined => {
    if (source[index] !== '"') return undefined;
    const start = index;
    index += 1;
    for (; index < source.length; ) {
      const character = source[index];
      if (character === "\\") {
        index += 2;
      } else if (character === '"') {
        index += 1;
        try {
          const value: unknown = JSON.parse(source.slice(start, index));
          return typeof value === "string" ? value : undefined;
        } catch {
          return undefined;
        }
      } else {
        index += 1;
      }
    }
    return undefined;
  };
  const beginValue = (pointer: string): boolean => {
    skipWhitespace();
    if (source[index] === "{") {
      index += 1;
      stack.push({
        kind: "object",
        pointer,
        keys: new Set<string>(),
        state: "key-or-end",
      });
      return true;
    }
    if (source[index] === "[") {
      index += 1;
      stack.push({
        kind: "array",
        pointer,
        state: "value-or-end",
        nextIndex: 0,
      });
      return true;
    }
    if (source[index] === '"') return parseString() !== undefined;
    const start = index;
    while (
      index < source.length &&
      ![",", "]", "}", " ", "\t", "\r", "\n"].includes(source[index] ?? "")
    ) {
      index += 1;
    }
    return index > start;
  };

  if (!beginValue("")) return undefined;
  while (stack.length > 0) {
    const container = stack.at(-1);
    if (container === undefined) return undefined;
    skipWhitespace();
    if (container.kind === "object") {
      if (container.state === "key-or-end" || container.state === "key") {
        if (container.state === "key-or-end" && source[index] === "}") {
          index += 1;
          stack.pop();
          continue;
        }
        const key = parseString();
        if (key === undefined) return undefined;
        const keyPointer = `${container.pointer}/${pointerSegment(key)}`;
        if (container.keys.has(key)) return keyPointer;
        container.keys.add(key);
        container.pendingKey = key;
        container.state = "colon";
        continue;
      }
      if (container.state === "colon") {
        if (source[index] !== ":") return undefined;
        index += 1;
        container.state = "value";
        continue;
      }
      if (container.state === "value") {
        const key = container.pendingKey;
        if (key === undefined) return undefined;
        container.state = "separator";
        if (!beginValue(`${container.pointer}/${pointerSegment(key)}`))
          return undefined;
        continue;
      }
      if (source[index] === "}") {
        index += 1;
        stack.pop();
        continue;
      }
      if (source[index] !== ",") return undefined;
      index += 1;
      container.state = "key";
      continue;
    }
    if (container.state === "value-or-end" || container.state === "value") {
      if (container.state === "value-or-end" && source[index] === "]") {
        index += 1;
        stack.pop();
        continue;
      }
      const itemIndex = container.nextIndex;
      container.nextIndex += 1;
      container.state = "separator";
      if (!beginValue(`${container.pointer}/${itemIndex}`)) return undefined;
      continue;
    }
    if (source[index] === "]") {
      index += 1;
      stack.pop();
      continue;
    }
    if (source[index] !== ",") return undefined;
    index += 1;
    container.state = "value";
  }
  return undefined;
};

export const parseStrictJson = (source: string): StrictJsonParseResult => {
  if (typeof source !== "string")
    return {
      kind: "invalid",
      code: "invalid-json",
      pointer: "",
      message: "Input is not valid JSON text",
    };
  const duplicatePointer = duplicateKeyPointer(source);
  if (duplicatePointer !== undefined)
    return {
      kind: "invalid",
      code: "duplicate-json-key",
      pointer: duplicatePointer,
      message: "JSON object contains a duplicate key",
    };
  try {
    return { kind: "parsed", value: JSON.parse(source) as unknown };
  } catch {
    return {
      kind: "invalid",
      code: "invalid-json",
      pointer: "",
      message: "Input is not valid JSON text",
    };
  }
};
