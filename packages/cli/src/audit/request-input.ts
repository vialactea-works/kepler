export type AuditInputResult =
  | { readonly kind: "read"; readonly value: string }
  | { readonly kind: "failed"; readonly code: string; readonly message: string; readonly details: Readonly<Record<string, unknown>>; readonly recovery: string };

export interface AuditInputStream {
  readonly isTTY: boolean;
  readonly chunks: () => AsyncIterable<Uint8Array | string>;
}

const maximumRequestBytes = 16 * 1024 * 1024;

export class AuditRequestInput {
  constructor(private readonly stream: AuditInputStream = {
    isTTY: process.stdin.isTTY ?? false,
    chunks: () => process.stdin,
  }) {}

  async read(): Promise<AuditInputResult> {
    if (this.stream.isTTY) {
      return {
        kind: "failed",
        code: "audit_request_missing",
        message: "Audit recording requires one JSON request on stdin.",
        details: {},
        recovery: "Pipe one complete JSON object to the command and retry.",
      };
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for await (const chunk of this.stream.chunks()) {
        const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
        length += bytes.length;
        if (length > maximumRequestBytes) {
          return {
            kind: "failed",
            code: "audit_request_too_large",
            message: "The audit request exceeds the maximum supported input size.",
            details: { maximum_bytes: maximumRequestBytes },
            recovery: "Reduce the request size and retry.",
          };
        }
        chunks.push(bytes);
      }
    } catch (error) {
      return {
        kind: "failed",
        code: "audit_request_read_failed",
        message: "Kepler could not read the audit request from stdin.",
        details: { message: error instanceof Error ? error.message : String(error) },
        recovery: "Provide one complete JSON object on stdin and retry.",
      };
    }
    if (length === 0) {
      return {
        kind: "failed",
        code: "audit_request_missing",
        message: "Audit recording requires one JSON request on stdin.",
        details: {},
        recovery: "Pipe one complete JSON object to the command and retry.",
      };
    }
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return { kind: "read", value: new TextDecoder("utf-8", { fatal: true }).decode(joined) };
    } catch {
      return {
        kind: "failed",
        code: "invalid_audit_request_encoding",
        message: "The audit request is not valid UTF-8.",
        details: {},
        recovery: "Encode the JSON request as UTF-8 and retry.",
      };
    }
  }
}
