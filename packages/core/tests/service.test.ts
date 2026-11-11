import { afterEach, describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import {
  legacyMigrationMarkerPath,
  legacyMigrationStagingPath,
  migrationCanonicalOwnershipMarkerPath,
  migrationMarkerPath,
  migrationOwnershipMarkerPath,
  migrationStagingPath,
  type KeplerMigrationState,
} from "../src/migration.js";
import {
  KeplerConfigError,
  KeplerHomeError,
  KeplerMigrationError,
  KeplerService,
  loadKeplerSettings,
  parseKeplerSettings,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

const makeDirectory = (): string => {
  const directory = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-core-"));
  temporaryDirectories.push(directory);
  return directory;
};

const makeInterruptedProjectMigration = (root: string, createCanonical: boolean) => {
  const projectRoot = Path.join(root, "project");
  const legacyPath = Path.join(projectRoot, ".hamilton");
  const canonicalPath = Path.join(projectRoot, ".kepler");
  const transactionId = "bcd12345-6789-4abc-8def-0123456789ab";
  const stagingPath = migrationStagingPath(canonicalPath, transactionId);
  Fs.mkdirSync(legacyPath, { recursive: true });
  Fs.writeFileSync(Path.join(legacyPath, "plan.md"), "legacy history\n");
  Fs.mkdirSync(Path.dirname(stagingPath), { recursive: true });
  Fs.cpSync(legacyPath, stagingPath, { recursive: true });
  const markerPath = migrationMarkerPath(canonicalPath);
  const state: KeplerMigrationState = {
    format: "kepler-legacy-migration-v2",
    pid: Number.MAX_SAFE_INTEGER,
    processIdentity: "stale-process-instance",
    transactionId,
    legacyPath: Path.resolve(legacyPath),
    sourcePath: Fs.realpathSync(legacyPath),
    canonicalPath: Path.resolve(canonicalPath),
    stagingPath: Path.resolve(stagingPath),
    temporaryMarkerPath: `${markerPath}.tmp-${transactionId}`,
  };
  if (createCanonical) {
    Fs.mkdirSync(canonicalPath);
    Fs.writeFileSync(Path.join(canonicalPath, "partial.txt"), "partial\n");
    Fs.writeFileSync(
      migrationCanonicalOwnershipMarkerPath(state),
      `kepler-legacy-migration-canonical-owner-v1\n${transactionId}\n`,
      { flag: "wx", mode: 0o600 },
    );
  }
  Fs.writeFileSync(
    migrationOwnershipMarkerPath(state),
    `kepler-legacy-migration-owner-v1\n${transactionId}\n`,
    { flag: "wx", mode: 0o600 },
  );
  Fs.writeFileSync(state.temporaryMarkerPath, JSON.stringify(state), { mode: 0o600 });
  Fs.linkSync(state.temporaryMarkerPath, markerPath);
  return { projectRoot, legacyPath, canonicalPath, stagingPath, markerPath, state };
};

const makeLegacyProjectMigration = (root: string, canonicalName: string, createCanonical: boolean) => {
  const projectRoot = Path.join(root, "project");
  const legacyPath = Path.join(projectRoot, ".hamilton");
  const canonicalPath = Path.join(projectRoot, canonicalName);
  const transactionId = "cde12345-6789-4abc-8def-0123456789ab";
  const stagingPath = legacyMigrationStagingPath(canonicalPath, transactionId);
  Fs.mkdirSync(legacyPath, { recursive: true });
  Fs.writeFileSync(Path.join(legacyPath, "plan.md"), "legacy history\n");
  Fs.mkdirSync(Path.dirname(stagingPath), { recursive: true });
  Fs.cpSync(legacyPath, stagingPath, { recursive: true });
  if (createCanonical) {
    Fs.mkdirSync(canonicalPath);
    Fs.writeFileSync(Path.join(canonicalPath, "plan.md"), "user history\n");
  }
  const markerPath = legacyMigrationMarkerPath(canonicalPath);
  const state: KeplerMigrationState = {
    format: "kepler-legacy-migration-v1",
    pid: Number.MAX_SAFE_INTEGER,
    transactionId,
    legacyPath: Path.resolve(legacyPath),
    sourcePath: Fs.realpathSync(legacyPath),
    canonicalPath: Path.resolve(canonicalPath),
    stagingPath: Path.resolve(stagingPath),
    temporaryMarkerPath: `${markerPath}.tmp-${transactionId}`,
  };
  Fs.writeFileSync(
    migrationOwnershipMarkerPath(state),
    `kepler-legacy-migration-owner-v1\n${transactionId}\n`,
    { flag: "wx", mode: 0o600 },
  );
  Fs.writeFileSync(state.temporaryMarkerPath, JSON.stringify(state), { mode: 0o600 });
  Fs.linkSync(state.temporaryMarkerPath, markerPath);
  return { projectRoot, legacyPath, canonicalPath, stagingPath, markerPath, state };
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    Fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("KeplerService paths", () => {
  it("requires an explicit absolute KEPLER_HOME without selecting a fallback", () => {
    for (const environment of [
      {},
      { KEPLER_HOME: "" },
      { KEPLER_HOME: "relative/home" },
      { KEPLER_HOME: "/invalid\0home" },
    ]) {
      expect(() => new KeplerService({ environment }).globalHome()).toThrow(KeplerHomeError);
    }
  });

  it("resolves every resource and settings path inside the selected home", () => {
    const home = Path.resolve("/tmp/kepler/versions/3.0.0");
    const service = new KeplerService({ environment: { KEPLER_HOME: home } });

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

  it("copies project history from .hamilton to .kepler without deleting the source", () => {
    const root = makeDirectory();
    const legacyFile = Path.join(root, ".hamilton", "changes", "active", "plan.md");
    Fs.mkdirSync(Path.dirname(legacyFile), { recursive: true });
    Fs.writeFileSync(legacyFile, "legacy plan\n");
    const service = new KeplerService();

    const canonicalRoot = service.projectDataPath(root);
    expect(canonicalRoot).toBe(Path.join(root, ".kepler"));
    expect(Fs.readFileSync(Path.join(canonicalRoot, "changes", "active", "plan.md"), "utf8"))
      .toBe("legacy plan\n");
    expect(Fs.readFileSync(legacyFile, "utf8")).toBe("legacy plan\n");
  });

  it("prefers existing .kepler project data without merging legacy files", () => {
    const root = makeDirectory();
    const legacyFile = Path.join(root, ".hamilton", "changes", "plan.md");
    const canonicalFile = Path.join(root, ".kepler", "changes", "plan.md");
    Fs.mkdirSync(Path.dirname(legacyFile), { recursive: true });
    Fs.mkdirSync(Path.dirname(canonicalFile), { recursive: true });
    Fs.writeFileSync(legacyFile, "legacy\n");
    Fs.writeFileSync(canonicalFile, "canonical\n");

    expect(new KeplerService().projectDataPath(root)).toBe(Path.join(root, ".kepler"));
    expect(Fs.readFileSync(canonicalFile, "utf8")).toBe("canonical\n");
    expect(Fs.readFileSync(legacyFile, "utf8")).toBe("legacy\n");
  });

  it("recovers an interrupted project-history copy and preserves the source", () => {
    const paths = makeInterruptedProjectMigration(makeDirectory(), true);

    expect(new KeplerService().projectDataPath(paths.projectRoot)).toBe(paths.canonicalPath);
    expect(Fs.readFileSync(Path.join(paths.canonicalPath, "plan.md"), "utf8")).toBe("legacy history\n");
    expect(Fs.readFileSync(Path.join(paths.canonicalPath, "partial.txt"), "utf8")).toBe("partial\n");
    expect(Fs.existsSync(Path.join(paths.legacyPath, "plan.md"))).toBe(true);
    expect(Fs.existsSync(paths.markerPath)).toBe(false);
    expect(Fs.existsSync(paths.stagingPath)).toBe(false);
  });

  it("refuses to overwrite an unowned project directory during migration recovery", () => {
    const paths = makeInterruptedProjectMigration(makeDirectory(), false);
    Fs.mkdirSync(paths.canonicalPath);
    const userFile = Path.join(paths.canonicalPath, "user.txt");
    Fs.writeFileSync(userFile, "preserve\n");

    expect(() => new KeplerService().projectDataPath(paths.projectRoot)).toThrow(KeplerMigrationError);
    expect(Fs.readFileSync(userFile, "utf8")).toBe("preserve\n");
    expect(Fs.existsSync(paths.markerPath)).toBe(true);
    expect(Fs.existsSync(paths.stagingPath)).toBe(true);
  });

  it("recovers a legacy project migration and keeps legacy history", () => {
    const paths = makeLegacyProjectMigration(makeDirectory(), ".kepler", false);

    expect(new KeplerService().projectDataPath(paths.projectRoot)).toBe(paths.canonicalPath);
    expect(Fs.readFileSync(Path.join(paths.canonicalPath, "plan.md"), "utf8")).toBe("legacy history\n");
    expect(Fs.readFileSync(Path.join(paths.legacyPath, "plan.md"), "utf8")).toBe("legacy history\n");
    expect(Fs.existsSync(paths.markerPath)).toBe(false);
    expect(Fs.existsSync(paths.stagingPath)).toBe(false);
  });

  it("does not overwrite user project data during legacy migration recovery", () => {
    const paths = makeLegacyProjectMigration(makeDirectory(), ".kepler", true);

    expect(() => new KeplerService().projectDataPath(paths.projectRoot)).toThrow(KeplerMigrationError);
    expect(Fs.readFileSync(Path.join(paths.canonicalPath, "plan.md"), "utf8")).toBe("user history\n");
    expect(Fs.existsSync(paths.markerPath)).toBe(true);
    expect(Fs.existsSync(paths.stagingPath)).toBe(true);
  });

  it("ignores a legacy migration marker for a different project-data path", () => {
    const paths = makeLegacyProjectMigration(makeDirectory(), "kepler", false);
    const expectedCanonical = Path.join(paths.projectRoot, ".kepler");

    expect(new KeplerService().projectDataPath(paths.projectRoot)).toBe(expectedCanonical);
    expect(Fs.readFileSync(Path.join(expectedCanonical, "plan.md"), "utf8")).toBe("legacy history\n");
    expect(Fs.existsSync(paths.markerPath)).toBe(true);
    expect(Fs.existsSync(paths.stagingPath)).toBe(true);
  });
});

describe("Kepler config", () => {
  it("loads YAML mappings and accepts an empty document", () => {
    expect(parseKeplerSettings("feature:\n  enabled: true\n")).toEqual({
      feature: { enabled: true },
    });
    expect(parseKeplerSettings("")).toEqual({});
  });

  it("rejects malformed YAML and non-mapping roots", () => {
    expect(() => parseKeplerSettings("feature: [\n", "settings.yaml")).toThrow(KeplerConfigError);
    expect(() => parseKeplerSettings("- item\n", "settings.yaml")).toThrow("document root must be a mapping");
    for (const document of ["!!binary AQID\n", "!!timestamp 2020-01-01T00:00:00Z\n", "!!set {a: null}\n", "null\n"]) {
      expect(() => parseKeplerSettings(document, "settings.yaml")).toThrow(KeplerConfigError);
    }
  });

  it("reads settings from the explicitly selected versioned home", () => {
    const home = makeDirectory();
    const settingsPath = Path.join(home, "settings.yaml");
    Fs.writeFileSync(settingsPath, "models:\n  aliases:\n    fast: test-model\n");
    const service = new KeplerService({ environment: { KEPLER_HOME: home } });

    expect(service.loadConfig()).toEqual({ models: { aliases: { fast: "test-model" } } });
  });

  it("returns no config when settings do not exist and still requires KEPLER_HOME", () => {
    expect(() => new KeplerService().loadConfig()).toThrow(KeplerHomeError);
    const service = new KeplerService({ environment: { KEPLER_HOME: makeDirectory() } });
    expect(service.loadConfig()).toBeUndefined();
  });

  it("reads a settings file from disk through the parser", () => {
    const path = Path.join(makeDirectory(), "settings.yaml");
    Fs.writeFileSync(path, "models:\n  aliases:\n    fast: test-model\n");

    expect(loadKeplerSettings(path)).toEqual({ models: { aliases: { fast: "test-model" } } });
  });
});
