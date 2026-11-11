import { describe, expect, it } from "vitest";
import * as Path from "node:path";
import { KeplerService } from "../../src/service.js";

describe("explicit Kepler home paths", () => {
  it("requires KEPLER_HOME without deriving a HOME or XDG fallback", () => {
    for (const environment of [{}, { KEPLER_HOME: "" }, { KEPLER_HOME: "   " }, { KEPLER_HOME: "relative/home" }, { KEPLER_HOME: "/invalid\0home" }]) {
      expect(() => new KeplerService({ environment }).globalHome()).toThrow(/KEPLER_HOME/);
    }
  });

  it("resolves all resources and settings within the explicitly selected home", () => {
    const home = Path.resolve("/tmp/kepler homes/versions/3.0.0");
    const service = new KeplerService({ environment: { KEPLER_HOME: `${home}/` } });
    expect(service.globalPaths()).toEqual({
      home,
      templates: Path.join(home, "templates"),
      guidelines: Path.join(home, "guidelines"),
      skills: Path.join(home, "skills"),
      agents: Path.join(home, "agents"),
      settings: Path.join(home, "settings.yaml"),
      metadata: Path.join(home, "home-metadata.json"),
    });
  });

  it("captures the selected home independently for each service", () => {
    const environment = { KEPLER_HOME: "/tmp/kepler/versions/3.0.0" };
    const first = new KeplerService({ environment });
    environment.KEPLER_HOME = "/tmp/kepler/versions/3.1.0";
    const second = new KeplerService({ environment });
    expect(first.globalHome()).toBe("/tmp/kepler/versions/3.0.0");
    expect(second.globalHome()).toBe("/tmp/kepler/versions/3.1.0");
  });

  it("keeps project path resolution independent of global configuration", () => {
    const service = new KeplerService({ environment: {} });
    expect(service.projectDataPath("/tmp/nonexistent-kepler-unit-project")).toBe("/tmp/nonexistent-kepler-unit-project/.kepler");
  });
});
