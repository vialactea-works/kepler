import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { classifyNativePiCli, resolveNativePiHostConfig } from "../helpers/native-pi-host.js";

const temporaryRoots: string[] = [];

function makePiCli(header: string): { readonly piBinary: string; readonly loaderRoot: string } {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-native-pi-host-"));
  temporaryRoots.push(root);
  const piBinary = Path.join(root, "pi");
  Fs.writeFileSync(piBinary, header);
  return { piBinary, loaderRoot: Path.join(root, "pi-subagents") };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) Fs.rmSync(root, { recursive: true, force: true });
});

describe("native Pi host entrypoint classification", () => {
  it("keeps standalone Pi on its native SDK extension path without Node or a public SDK path", () => {
    const host = makePiCli("\u007fELF\u0002");
    expect(resolveNativePiHostConfig({
      CI: "true",
      KEPLER_PI_BINARY: host.piBinary,
      KEPLER_PI_SUBAGENTS_ROOT: host.loaderRoot,
    })).toEqual({
      piBinary: host.piBinary,
      piCliKind: "standalone",
      loaderRoot: host.loaderRoot,
    });
  });

  it("requires explicit Node and the public SDK for the npm CLI in CI", () => {
    const host = makePiCli("#!/usr/bin/env node\n");
    expect(classifyNativePiCli(host.piBinary)).toBe("npm");
    expect(() => resolveNativePiHostConfig({
      CI: "true",
      KEPLER_PI_BINARY: host.piBinary,
      KEPLER_PI_SUBAGENTS_ROOT: host.loaderRoot,
    })).toThrow(/Node-based npm Pi requires an explicit Node.*public Pi SDK entry/i);
    expect(resolveNativePiHostConfig({
      CI: "true",
      KEPLER_PI_BINARY: host.piBinary,
      KEPLER_PI_SUBAGENTS_ROOT: host.loaderRoot,
      KEPLER_PI_NODE_BINARY: "/trusted/node/bin/node",
      KEPLER_PI_SDK_ENTRY_PATH: "/actual/pi/dist/index.js",
      KEPLER_PACKAGE_ROOT: "/must-not-be-forwarded",
    })).toEqual({
      piBinary: host.piBinary,
      piCliKind: "npm",
      loaderRoot: host.loaderRoot,
      nodeBinary: "/trusted/node/bin/node",
      sdkEntryPath: "/actual/pi/dist/index.js",
    });
  });

  it("keeps an explicitly configured Node from changing standalone Pi into npm mode", () => {
    const host = makePiCli("\u007fELF\u0002");
    expect(resolveNativePiHostConfig({
      CI: "true",
      KEPLER_PI_BINARY: host.piBinary,
      KEPLER_PI_SUBAGENTS_ROOT: host.loaderRoot,
      KEPLER_PI_NODE_BINARY: "/trusted/node/bin/node",
      KEPLER_PI_SDK_ENTRY_PATH: "/another/public-sdk/dist/index.js",
    })).toMatchObject({ piCliKind: "standalone" });
  });
});
