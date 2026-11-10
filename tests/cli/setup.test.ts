import { afterEach, describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import * as Path from "node:path";
import { parseInstallationReceipt } from "../../packages/cli/src/cli/installation-record.js";
import { SetupFailure } from "../../packages/cli/src/cli/setup.service.js";
import {
  createSetupApplicationFixture,
  defaultSetupRelease,
} from "../helpers/setup-application-fixture.js";

const fixtures: ReturnType<typeof createSetupApplicationFixture>[] = [];

function fixture() {
  const value = createSetupApplicationFixture();
  fixtures.push(value);
  return value;
}

afterEach(() => {
  for (const value of fixtures.splice(0)) value.cleanup();
});

describe("SetupService filesystem integration", () => {
  it("selects a complete v2 generation and registers its stable package source", () => {
    const value = fixture();
    const result = value.createService().setup();
    const distributionRoot = Path.join(value.root, ".kepler-dist");
    const selector = Path.join(distributionRoot, "current");
    const generationRoot = Path.join(distributionRoot, "generations", result.generation_id);
    const receiptPath = Path.join(value.root, ".config", "vialactea-works", "kepler", "installation.json");

    expect(result.installation_mode).toBe("first-install");
    expect(Fs.readlinkSync(selector)).toBe(`generations/${result.generation_id}`);
    expect(Fs.readFileSync(Path.join(generationRoot, "bin", "kepler"), "utf8"))
      .toContain("KEPLER_BUILD_IDENTITY_BEGIN:");
    expect(Fs.existsSync(Path.join(generationRoot, "release-manifest.json"))).toBe(true);
    expect(parseInstallationReceipt(Fs.readFileSync(receiptPath, "utf8")).kind).toBe("current-v2");
    expect(Fs.existsSync(Path.join(generationRoot, "bundle", "manifest.json"))).toBe(true);
  });

  it("fails before installation effects when the Pi prerequisite is unavailable", () => {
    const value = fixture();
    const service = value.createService(defaultSetupRelease, {
      detectPiVersion: () => { throw new Error("Pi unavailable"); },
    });

    expect(() => service.setup()).toThrow(expect.objectContaining({ code: "pi_unavailable" }));
    expect(Fs.existsSync(Path.join(value.root, ".kepler-dist"))).toBe(false);
    expect(Fs.existsSync(Path.join(value.root, ".config", "vialactea-works", "kepler"))).toBe(false);
  });
});
