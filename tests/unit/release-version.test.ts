import { describe, expect, it } from "vitest";
import {
  deriveReleaseVersion,
  parseReleaseVersion,
} from "../../scripts/release-version.js";

describe("release version derivation", () => {
  it.each([
    ["patch", "3.0.0", "3.0.1"],
    ["minor", "3.0.4", "3.1.0"],
    ["major", "3.7.9", "4.0.0"],
    ["3.0.0", "0.11.0", "3.0.0"],
  ] as const)("derives %s from %s", (target, current, expected) => {
    expect(deriveReleaseVersion(current, target)).toBe(expected);
  });

  it.each([
    "03.0.0",
    "3.00.0",
    "3.0.00",
    "3.0",
    "3.0.0-rc.1",
    "3.0.0+build.1",
    "9007199254740992.0.0",
  ])("rejects non-stable or unsafe version %s", (value) => {
    expect(() => parseReleaseVersion(value)).toThrow();
  });

  it("rejects lower explicit targets and increments that overflow safe integers", () => {
    expect(() => deriveReleaseVersion("3.0.1", "3.0.0")).toThrow(
      "must not be lower",
    );
    expect(() => deriveReleaseVersion("9007199254740991.0.0", "major")).toThrow(
      "safe integer",
    );
  });
});
