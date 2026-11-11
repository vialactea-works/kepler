import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeHome, type HomeInitializationFiles } from "../../packages/cli/src/cli/home-initializer.js";
import { createNodeHomeInitializationFiles } from "../../packages/cli/src/cli/home-files.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

const roots: string[] = [];

function createHome(): string {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-home-integration-"));
  roots.push(root);
  return Path.join(root, "versions", "3.0.0");
}

function initialize(home: string, files = createNodeHomeInitializationFiles(home, createSetupBundleFixture)) {
  return initializeHome(home, "3.0.0", files, "{}\n");
}

function failOnceAt(base: HomeInitializationFiles, relative: string): HomeInitializationFiles {
  let failed = false;
  return {
    ...base,
    writeFile(path, contents) {
      if (!failed && path === relative) {
        failed = true;
        throw new Error("simulated interrupted write");
      }
      base.writeFile(path, contents);
    },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("versioned home initialization filesystem integration", () => {
  it("creates an editable home with resource files and commits ready metadata last", () => {
    const home = createHome();
    const resources = createSetupBundleFixture();

    expect(initialize(home, createNodeHomeInitializationFiles(home, () => resources))).toEqual({
      home,
      release: "3.0.0",
      status: "initialized",
    });
    expect(Fs.statSync(home).mode & 0o777).toBe(0o700);
    expect(Fs.readFileSync(Path.join(home, "settings.yaml"), "utf8")).toBe("{}\n");
    expect(JSON.parse(Fs.readFileSync(Path.join(home, "home-metadata.json"), "utf8"))).toEqual({
      format_version: 1,
      release: "3.0.0",
      resource_digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    for (const resource of resources.files) {
      expect(Buffer.compare(Fs.readFileSync(Path.join(home, ...resource.path.split("/"))), Buffer.from(resource.contents))).toBe(0);
    }
    expect(Fs.statSync(Path.join(home, "settings.yaml")).mode & 0o777).toBe(0o600);
  });

  it("preserves edited and deleted files when setup runs again", () => {
    const home = createHome();
    const files = createNodeHomeInitializationFiles(home, createSetupBundleFixture);
    initialize(home, files);
    const settings = Buffer.from("user: true\n");
    Fs.writeFileSync(Path.join(home, "settings.yaml"), settings);
    Fs.unlinkSync(Path.join(home, "skills", "kepler-code", "SKILL.md"));

    expect(initialize(home, files).status).toBe("unchanged");
    expect(Fs.readFileSync(Path.join(home, "settings.yaml"))).toEqual(settings);
    expect(Fs.existsSync(Path.join(home, "skills", "kepler-code", "SKILL.md"))).toBe(false);
  });

  it("resumes a partially written home after an interrupted resource write", () => {
    const home = createHome();
    const files = createNodeHomeInitializationFiles(home, createSetupBundleFixture);
    const interrupted = failOnceAt(files, "skills/kepler-code/SKILL.md");

    expect(() => initialize(home, interrupted)).toThrow("simulated interrupted write");
    const pending = JSON.parse(Fs.readFileSync(Path.join(home, "home-metadata.json"), "utf8"));
    expect(pending.status).toBe("initializing");
    const firstResource = Path.join(home, "templates", "v3", "construction", "unit-of-work.md");
    const firstResourceBeforeRetry = Fs.readFileSync(firstResource);

    expect(initialize(home, files).status).toBe("initialized");
    expect(Fs.readFileSync(firstResource)).toEqual(firstResourceBeforeRetry);
    expect(Fs.existsSync(Path.join(home, "skills", "kepler-code", "SKILL.md"))).toBe(true);
    expect(JSON.parse(Fs.readFileSync(Path.join(home, "home-metadata.json"), "utf8"))).not.toHaveProperty("status");
  });

  it("recovers when initial metadata publication leaves a partial temporary file", () => {
    const home = createHome();
    const files = createNodeHomeInitializationFiles(home, createSetupBundleFixture);
    const temporaryPath = Path.join(
      home,
      ".home-metadata.json.kepler-00000000-0000-4000-8000-000000000000.tmp",
    );
    let interrupted = false;
    const beforeLink = {
      ...files,
      writeFile(path: string, contents: Uint8Array) {
        if (!interrupted && path === "home-metadata.json") {
          interrupted = true;
          Fs.writeFileSync(temporaryPath, "partial metadata");
          throw new Error("simulated interrupted metadata publication");
        }
        files.writeFile(path, contents);
      },
    };

    expect(() => initialize(home, beforeLink)).toThrow("simulated interrupted metadata publication");
    expect(Fs.existsSync(temporaryPath)).toBe(true);
    expect(Fs.readdirSync(home).some((name) => name.startsWith(".kepler-home-initializing-"))).toBe(true);

    expect(initialize(home, files).status).toBe("initialized");
    expect(Fs.existsSync(temporaryPath)).toBe(false);
    expect(Fs.readdirSync(home).some((name) => name.startsWith(".kepler-home-initializing-"))).toBe(false);
  });

  it("resumes after pending metadata is linked but before marker cleanup", () => {
    const home = createHome();
    const files = createNodeHomeInitializationFiles(home, createSetupBundleFixture);
    let interrupted = false;
    const afterLink = {
      ...files,
      writeFile(path: string, contents: Uint8Array) {
        files.writeFile(path, contents);
        if (!interrupted && path === "home-metadata.json") {
          interrupted = true;
          throw new Error("simulated interruption after metadata link");
        }
      },
    };

    expect(() => initialize(home, afterLink)).toThrow("simulated interruption after metadata link");
    expect(JSON.parse(Fs.readFileSync(Path.join(home, "home-metadata.json"), "utf8")).status).toBe("initializing");
    expect(Fs.readdirSync(home).some((name) => name.startsWith(".kepler-home-initializing-"))).toBe(true);

    expect(initialize(home, files).status).toBe("initialized");
    expect(Fs.readdirSync(home).some((name) => name.startsWith(".kepler-home-initializing-"))).toBe(false);
  });

  it("recovers when ready metadata replacement leaves a partial temporary file", () => {
    const home = createHome();
    const files = createNodeHomeInitializationFiles(home, createSetupBundleFixture);
    const temporaryPath = Path.join(
      home,
      ".home-metadata.kepler-00000000-0000-4000-8000-000000000000.tmp",
    );
    const beforeReady = {
      ...files,
      completeInitialization() {
        Fs.writeFileSync(temporaryPath, "partial ready metadata");
        throw new Error("simulated interrupted ready metadata replacement");
      },
    };

    expect(() => initialize(home, beforeReady)).toThrow("simulated interrupted ready metadata replacement");
    expect(JSON.parse(Fs.readFileSync(Path.join(home, "home-metadata.json"), "utf8")).status).toBe("initializing");
    expect(Fs.existsSync(temporaryPath)).toBe(true);

    expect(initialize(home, files).status).toBe("initialized");
    expect(Fs.existsSync(temporaryPath)).toBe(false);
    expect(JSON.parse(Fs.readFileSync(Path.join(home, "home-metadata.json"), "utf8"))).not.toHaveProperty("status");
  });

  it("refuses to adopt unknown user files and preserves them", () => {
    const home = createHome();
    Fs.mkdirSync(home, { recursive: true });
    const sentinel = Buffer.from("user-owned\n");
    Fs.writeFileSync(Path.join(home, "notes.txt"), sentinel);

    expect(() => initialize(home)).toThrow(/no compatible metadata/);
    expect(Fs.readFileSync(Path.join(home, "notes.txt"))).toEqual(sentinel);
    expect(Fs.readdirSync(home)).toEqual(["notes.txt"]);
  });

  it("does not follow a symlinked resource parent while resuming", () => {
    const home = createHome();
    const root = Path.dirname(Path.dirname(home));
    const outside = Path.join(root, "outside");
    Fs.mkdirSync(outside);
    const sentinel = Buffer.from("outside user data\n");
    Fs.writeFileSync(Path.join(outside, "sentinel.txt"), sentinel);
    const files = createNodeHomeInitializationFiles(home, createSetupBundleFixture);
    const interrupted = failOnceAt(files, "templates/v3/construction/design.md");

    expect(() => initialize(home, interrupted)).toThrow("simulated interrupted write");
    Fs.symlinkSync(outside, Path.join(home, "skills"), "dir");

    expect(() => initialize(home, files)).toThrow(/not a regular directory/);
    expect(Fs.readFileSync(Path.join(outside, "sentinel.txt"))).toEqual(sentinel);
    expect(Fs.existsSync(Path.join(outside, "kepler-code", "SKILL.md"))).toBe(false);
  });

  it("refuses a symlink as KEPLER_HOME without modifying its target", () => {
    const home = createHome();
    const target = Path.join(Path.dirname(home), "target");
    Fs.mkdirSync(target, { recursive: true });
    const sentinel = Buffer.from("untouched\n");
    Fs.writeFileSync(Path.join(target, "sentinel.txt"), sentinel);
    Fs.symlinkSync(target, home, "dir");

    expect(() => initialize(home)).toThrow("KEPLER_HOME is not a regular directory.");
    expect(Fs.readFileSync(Path.join(target, "sentinel.txt"))).toEqual(sentinel);
    expect(Fs.readdirSync(target)).toEqual(["sentinel.txt"]);
  });

  it("honors a caller-selected symlinked KEPLER_HOME ancestor", () => {
    const home = createHome();
    const root = Path.dirname(Path.dirname(home));
    const physicalParent = Path.join(root, "physical-parent");
    const aliasParent = Path.join(root, "alias-parent");
    Fs.mkdirSync(physicalParent);
    Fs.symlinkSync(physicalParent, aliasParent, "dir");
    const aliasedHome = Path.join(aliasParent, "versions", "3.0.0");

    expect(initialize(aliasedHome).home).toBe(aliasedHome);
    expect(Fs.existsSync(Path.join(aliasedHome, "home-metadata.json"))).toBe(true);
    expect(Fs.realpathSync(aliasedHome)).toBe(Path.join(physicalParent, "versions", "3.0.0"));
  });
});
