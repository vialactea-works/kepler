import { createHash } from "node:crypto";

export type ContentDigest = `sha256:${string}`;

export function sha256Digest(content: string | Uint8Array): ContentDigest {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
