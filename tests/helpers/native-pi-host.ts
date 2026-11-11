import * as Fs from "node:fs";

export type NativePiCliKind = "standalone" | "npm";

export interface NativePiHostConfig {
  readonly piBinary: string;
  readonly piCliKind: NativePiCliKind;
  readonly loaderRoot: string;
  readonly nodeBinary?: string;
  readonly sdkEntryPath?: string;
}

export function classifyNativePiCli(piBinary: string): NativePiCliKind {
  const descriptor = Fs.openSync(piBinary, "r");
  try {
    const header = Buffer.alloc(128);
    const bytesRead = Fs.readSync(descriptor, header, 0, header.length, 0);
    const firstLine = header.subarray(0, bytesRead).toString("utf8").split(/\r?\n/, 1)[0];
    return firstLine === "#!/usr/bin/env node" ? "npm" : "standalone";
  } finally {
    Fs.closeSync(descriptor);
  }
}

export function resolveNativePiHostConfig(
  environment: Readonly<Record<string, string | undefined>>,
): NativePiHostConfig | undefined {
  const piBinary = environment.KEPLER_PI_BINARY;
  const loaderRoot = environment.KEPLER_PI_SUBAGENTS_ROOT;
  const nodeBinary = environment.KEPLER_PI_NODE_BINARY;
  const sdkEntryPath = environment.KEPLER_PI_SDK_ENTRY_PATH;
  if (!piBinary || !loaderRoot) {
    if (environment.CI) {
      throw new Error(
        "Native target archive E2E requires pinned Pi 1.2.0 and pi-subagents 0.76.1; configure KEPLER_PI_BINARY and KEPLER_PI_SUBAGENTS_ROOT. Node-based npm Pi additionally requires KEPLER_PI_NODE_BINARY and KEPLER_PI_SDK_ENTRY_PATH.",
      );
    }
    return undefined;
  }
  const piCliKind = classifyNativePiCli(piBinary);
  if (piCliKind === "npm" && (!nodeBinary || !sdkEntryPath)) {
    throw new Error(
      "Node-based npm Pi requires an explicit Node interpreter and public Pi SDK entry path; configure KEPLER_PI_NODE_BINARY and KEPLER_PI_SDK_ENTRY_PATH.",
    );
  }
  return {
    piBinary,
    piCliKind,
    loaderRoot,
    ...(nodeBinary ? { nodeBinary } : {}),
    ...(sdkEntryPath ? { sdkEntryPath } : {}),
  };
}
