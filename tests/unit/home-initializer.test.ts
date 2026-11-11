import { describe, expect, it } from "vitest";
import { initializeHome, type HomeInitializationFiles } from "../../packages/cli/src/cli/home-initializer.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

function fixture() {
  const contents = new Map<string, Uint8Array>();
  let exists = false;
  let bundle = createSetupBundleFixture();
  let failOnceAt: string | undefined;
  const markers = new Set<string>();
  const files: HomeInitializationFiles = {
    readBundle: () => bundle,
    createHome: () => {
      if (exists) return "exists";
      exists = true;
      return "created";
    },
    listFiles: () => [...contents.keys()].sort(),
    listInitializationMarkers: () => [...markers].sort(),
    createInitializationMarker: (name) => { markers.add(name); },
    removeInitializationMarker: (name) => { markers.delete(name); },
    cleanupInitializationTemporaries: () => {
      for (const path of [...contents.keys()]) {
        if (/^\..+\.kepler-[0-9a-f-]{36}\.tmp$/.test(path.split("/").at(-1) ?? "")) {
          contents.delete(path);
        }
      }
    },
    readFile: (path) => contents.get(path),
    writeFile: (path, bytes) => {
      if (failOnceAt === path) {
        failOnceAt = undefined;
        throw new Error("interrupted write");
      }
      const existing = contents.get(path);
      if (existing) {
        if (!equalBytes(existing, bytes)) throw new Error("overwrite refused");
        return;
      }
      contents.set(path, new Uint8Array(bytes));
    },
    completeInitialization: (pending, ready) => {
      const current = contents.get("home-metadata.json");
      if (!current || !equalBytes(current, pending)) throw new Error("pending metadata changed");
      contents.set("home-metadata.json", new Uint8Array(ready));
    },
  };
  return {
    files,
    contents,
    markers,
    setBundle: (value: typeof bundle) => { bundle = value; },
    setHomeExists: () => { exists = true; },
    failOnce: (path: string) => { failOnceAt = path; },
  };
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;
}

function initialize(f: ReturnType<typeof fixture>, release = "3.0.0") {
  return initializeHome("/tmp/kepler/versions/3.0.0", release, f.files, "{}\n");
}

describe("initializeHome", () => {
  it("seeds the complete versioned home and commits metadata last", () => {
    const f = fixture();

    expect(initialize(f)).toEqual({
      home: "/tmp/kepler/versions/3.0.0",
      release: "3.0.0",
      status: "initialized",
    });
    expect(f.markers.size).toBe(0);
    expect(f.contents.has("templates/v3/construction/design.md")).toBe(true);
    expect(f.contents.has("guidelines/general/01-code-style.md")).toBe(true);
    expect(f.contents.has("skills/kepler-code/SKILL.md")).toBe(true);
    expect(f.contents.has("agents/pi/v1/kepler-coder.md")).toBe(true);
    expect(f.contents.has("agents/claude-code/v1/kepler-coder.md")).toBe(true);
    expect(new TextDecoder().decode(f.contents.get("settings.yaml"))).toBe("{}\n");
    expect(JSON.parse(new TextDecoder().decode(f.contents.get("home-metadata.json")))).toEqual({
      format_version: 1,
      release: "3.0.0",
      resource_digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
  });

  it("preserves user edits and deletions on repeat", () => {
    const f = fixture();
    initialize(f);
    f.contents.set("settings.yaml", new TextEncoder().encode("user: true\n"));
    f.contents.delete("skills/kepler-code/SKILL.md");

    expect(initialize(f).status).toBe("unchanged");
    expect(new TextDecoder().decode(f.contents.get("settings.yaml"))).toBe("user: true\n");
    expect(f.contents.has("skills/kepler-code/SKILL.md")).toBe(false);
  });

  it("recovers an interrupted first metadata write and removes its temporary file", () => {
    const f = fixture();
    const temporary = ".home-metadata.json.kepler-00000000-0000-4000-8000-000000000000.tmp";
    f.failOnce("home-metadata.json");

    expect(() => initialize(f)).toThrow("interrupted write");
    expect(f.markers.size).toBe(1);
    f.contents.set(temporary, new TextEncoder().encode("partial metadata"));

    expect(initialize(f).status).toBe("initialized");
    expect(f.contents.has(temporary)).toBe(false);
    expect(f.markers.size).toBe(0);
  });

  it("refuses unknown files even when a matching initialization marker exists", () => {
    const f = fixture();
    f.failOnce("home-metadata.json");
    expect(() => initialize(f)).toThrow("interrupted write");
    f.contents.set("notes.txt", new TextEncoder().encode("user-owned"));

    expect(() => initialize(f)).toThrow(/no compatible metadata/);
    expect(new TextDecoder().decode(f.contents.get("notes.txt"))).toBe("user-owned");
    expect(f.markers.size).toBe(1);
  });

  it("refuses an incompatible initialization marker", () => {
    const f = fixture();
    f.markers.add(`.kepler-home-initializing-${"0".repeat(64)}`);

    expect(() => initialize(f)).toThrow(/incompatible initialization marker/);
    expect(f.contents.size).toBe(0);
  });

  it("resumes an interrupted initial seed without replacing files already written", () => {
    const f = fixture();
    f.failOnce("skills/kepler-code/SKILL.md");

    expect(() => initialize(f)).toThrow("interrupted write");
    const completedBeforeRetry = f.contents.get("templates/v3/construction/design.md");
    expect(JSON.parse(new TextDecoder().decode(f.contents.get("home-metadata.json")))).toMatchObject({
      status: "initializing",
      release: "3.0.0",
    });

    expect(initialize(f).status).toBe("initialized");
    expect(f.contents.get("templates/v3/construction/design.md")).toBe(completedBeforeRetry);
    expect(f.contents.has("skills/kepler-code/SKILL.md")).toBe(true);
    expect(f.markers.size).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(f.contents.get("home-metadata.json")))).not.toHaveProperty("status");
  });

  it("initializes an existing empty home", () => {
    const f = fixture();
    f.setHomeExists();

    expect(initialize(f).status).toBe("initialized");
    expect(f.contents.has("home-metadata.json")).toBe(true);
  });

  it("refuses to adopt an unknown non-empty home and preserves its contents", () => {
    const f = fixture();
    f.setHomeExists();
    f.contents.set("user-data.json", new TextEncoder().encode("keep me"));

    expect(() => initialize(f)).toThrow(/no compatible metadata/);
    expect([...f.contents.keys()]).toEqual(["user-data.json"]);
  });

  it("refuses an incompatible version without changing existing files", () => {
    const f = fixture();
    initialize(f);
    const settings = f.contents.get("settings.yaml");
    f.setBundle(createSetupBundleFixture({ release: "3.0.1" }));

    expect(() => initialize(f, "3.0.1")).toThrow(/different release/);
    expect(f.contents.get("settings.yaml")).toBe(settings);
  });

  it("validates the resource package before creating a home", () => {
    const f = fixture();
    const bundle = createSetupBundleFixture();
    f.setBundle({ ...bundle, files: bundle.files.slice(1) });

    expect(() => initialize(f)).toThrow();
    expect(f.contents.size).toBe(0);
  });

  it("requires an absolute home path", () => {
    const f = fixture();

    expect(() => initializeHome("relative/home", "3.0.0", f.files, "{}\n"))
      .toThrow(/absolute path/);
    expect(f.contents.size).toBe(0);
  });
});
