import type { HistoryDigest } from "./control.js";

export interface HistoryLocation {
  readonly root: string;
  readonly relative: string;
}

export interface HistoryDirectoryEntry {
  readonly name: string;
  readonly kind: "file" | "directory" | "symlink" | "other";
}

export type HistoryWriteMode =
  | { readonly kind: "create" }
  | { readonly kind: "replace"; readonly expected: HistoryDigest | null };

export interface HistoryFileWrite {
  readonly status: "created" | "replaced" | "existing";
  readonly content_version: HistoryDigest;
  readonly byte_length: number;
}

export interface HistoryFiles {
  readonly read: (location: HistoryLocation) => Promise<Uint8Array | undefined>;
  readonly list: (location: HistoryLocation) => Promise<readonly HistoryDirectoryEntry[]>;
  readonly write: (location: HistoryLocation, bytes: Uint8Array, mode: HistoryWriteMode) => Promise<HistoryFileWrite>;
  readonly remove: (location: HistoryLocation, expected: HistoryDigest) => Promise<"removed" | "missing">;
  readonly removeEmptyDirectory: (location: HistoryLocation) => Promise<"removed" | "missing" | "not-empty">;
}

export interface HistorySnapshotFile {
  readonly sourceId: string;
  readonly origin: string;
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface HistoryOrigin {
  readonly id: string;
  readonly label: string;
  readonly root: string;
}

export interface HistorySnapshot {
  readonly recordHome: string;
  readonly commonDirectory: string;
  readonly missionId: string;
  readonly origins: readonly HistoryOrigin[];
  readonly files: readonly HistorySnapshotFile[];
  readonly unavailable: readonly { readonly source_id: string; readonly path: string; readonly kind: "missing" | "unreadable" | "unsafe"; readonly reason: string }[];
}

export interface HistoryRepositoryContext {
  readonly recordHome: string;
  readonly commonDirectory: string;
  readonly origins: readonly HistoryOrigin[];
  readonly unavailableOrigins: readonly { readonly id: string; readonly path: string; readonly kind: "missing" | "unreadable" | "unsafe"; readonly reason: string }[];
}

export interface HistoryRepositories {
  readonly resolve: (recordHome: string) => Promise<HistoryRepositoryContext>;
}
