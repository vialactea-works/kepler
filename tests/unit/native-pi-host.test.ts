import { describe, expect, it } from "vitest";
import { resolveNativePiHostConfig } from "../helpers/native-pi-host.js";

describe("native Pi host test prerequisites", () => {
  it.each(["1", "true", "false"])('fails closed when CI="%s" lacks the pinned Pi or loader', (ci) => {
    expect(() => resolveNativePiHostConfig({ CI: ci })).toThrow(
      /pinned Pi 1\.2\.0.*pi-subagents 0\.76\.1/i,
    );
    expect(() => resolveNativePiHostConfig({ CI: ci, KEPLER_PI_BINARY: "/tmp/pi" })).toThrow(
      /KEPLER_PI_BINARY and KEPLER_PI_SUBAGENTS_ROOT/i,
    );
    expect(() => resolveNativePiHostConfig({ CI: ci, KEPLER_PI_SUBAGENTS_ROOT: "/tmp/pi-subagents" })).toThrow(
      /KEPLER_PI_BINARY and KEPLER_PI_SUBAGENTS_ROOT/i,
    );
  });

  it("honestly reports an optional local check as unconfigured instead of inventing substitutes", () => {
    expect(resolveNativePiHostConfig({})).toBeUndefined();
  });
});
