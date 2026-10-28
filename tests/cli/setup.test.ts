import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Fs from "node:fs";
import * as Path from "node:path";
import * as Os from "node:os";
import {
  parseInstallationRecord,
  sha256Digest,
} from "../../packages/cli/src/cli/installation-record.js";
import { SetupApplyFailure, SetupService } from "../../packages/cli/src/cli/setup.service.js";
import { createSetupRuntime } from "../../packages/cli/src/cli/setup-runtime.js";
import { createSetupBundleFixture } from "../helpers/setup-bundle-fixture.js";

const cliRelease = "0.10.3";
const encoder = new TextEncoder();

function writeBundle(
  bundleRoot: string,
  snapshot: ReturnType<typeof createSetupBundleFixture>,
): void {
  Fs.rmSync(bundleRoot, { recursive: true, force: true });
  Fs.mkdirSync(bundleRoot, { recursive: true });
  Fs.writeFileSync(Path.join(bundleRoot, "manifest.json"), snapshot.manifest);
  for (const file of snapshot.files) {
    const target = Path.join(bundleRoot, ...file.path.split("/"));
    Fs.mkdirSync(Path.dirname(target), { recursive: true });
    Fs.writeFileSync(target, file.contents);
  }
}

function createService(
  home: string,
  bundleRoot: string,
  options: { renameTarget?: (staged: string, target: string) => void } = {},
): SetupService {
  const runtime = createSetupRuntime({
    environment: {
      HOME: home,
      XDG_CONFIG_HOME: Path.join(home, ".config"),
    },
    renameTarget: options.renameTarget,
  });
  return new SetupService(
    runtime.files,
    () => bundleRoot,
    cliRelease,
    runtime.platform,
  );
}

describe("SetupService filesystem integration", () => {
  let tmpHome: string;
  let bundleRoot: string;

  beforeEach(() => {
    tmpHome = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-setup-home-"));
    bundleRoot = Path.join(tmpHome, "distribution", "bundle");
    writeBundle(bundleRoot, createSetupBundleFixture());
  });

  afterEach(() => {
    Fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("installs templates, guidelines, settings, and a versioned record in an isolated home", () => {
    const result = createService(tmpHome, bundleRoot).setup();
    const home = Path.join(tmpHome, ".config/vialactea-works/kepler");
    const templatePath = Path.join(
      home,
      "templates/v3/construction/design.md",
    );
    const guidelinePath = Path.join(
      home,
      "guidelines/general/01-code-style.md",
    );
    const settingsPath = Path.join(home, "settings.yaml");
    const recordPath = Path.join(home, "installation.json");

    expect(Fs.readFileSync(templatePath, "utf8")).toBe("# Design template\n");
    expect(Fs.readFileSync(guidelinePath, "utf8")).toBe("# Code style\n");
    expect(Fs.readFileSync(settingsPath, "utf8")).toContain("name: rtk");
    const record = parseInstallationRecord(Fs.readFileSync(recordPath, "utf8"));
    expect(record.generation_id).toBe(result.generation_id);
    expect(record.bundle_release.installed_files).toEqual({
      "guidelines/general/01-code-style.md": sha256Digest(
        Fs.readFileSync(guidelinePath),
      ),
      "templates/v3/construction/design.md": sha256Digest(
        Fs.readFileSync(templatePath),
      ),
    });
    expect(result.host_binding.host.check).toBe("not_checked");
    expect(result.skills.every((skill) => skill.check === "not_checked")).toBe(
      true,
    );
  });

  it("repeats setup without changing files or generation identity", () => {
    const service = createService(tmpHome, bundleRoot);
    const first = service.setup();
    const home = Path.join(tmpHome, ".config/vialactea-works/kepler");
    const templatePath = Path.join(home, "templates/v3/construction/design.md");
    const firstStat = Fs.statSync(templatePath);
    const second = service.setup();

    expect(second.generation_id).toBe(first.generation_id);
    expect(Fs.statSync(templatePath).mtimeMs).toBe(firstStat.mtimeMs);
  });

  it("updates only prior installer-owned files and leaves settings and unknown files intact", () => {
    const service = createService(tmpHome, bundleRoot);
    const first = service.setup();
    const home = Path.join(tmpHome, ".config/vialactea-works/kepler");
    const settingsPath = Path.join(home, "settings.yaml");
    const userFile = Path.join(home, "templates", "user-owned.md");
    const originalSettings = "extensions:\n  - name: rtk\n    enabled: false\n";
    Fs.writeFileSync(settingsPath, originalSettings);
    Fs.writeFileSync(userFile, "user-owned content\n");
    writeBundle(
      bundleRoot,
      createSetupBundleFixture({
        bundleRelease: "kepler-bundle-3.0.1",
        templateContent: "# Updated design template\n",
      }),
    );

    const second = createService(tmpHome, bundleRoot).setup();

    expect(second.generation_id).not.toBe(first.generation_id);
    expect(
      Fs.readFileSync(
        Path.join(home, "templates/v3/construction/design.md"),
        "utf8",
      ),
    ).toBe("# Updated design template\n");
    expect(Fs.readFileSync(settingsPath, "utf8")).toBe(originalSettings);
    expect(Fs.readFileSync(userFile, "utf8")).toBe("user-owned content\n");
  });

  it("preserves a user-modified owned file and reports a necessary-path conflict", () => {
    createService(tmpHome, bundleRoot).setup();
    const home = Path.join(tmpHome, ".config/vialactea-works/kepler");
    const target = Path.join(home, "templates/v3/construction/design.md");
    const userContent = "# User's design template\n";
    Fs.writeFileSync(target, userContent);

    expect(() => createService(tmpHome, bundleRoot).setup()).toThrow(
      "cannot replace safely",
    );
    expect(Fs.readFileSync(target, "utf8")).toBe(userContent);
  });

  it("fails before writes when a necessary destination path is a directory", () => {
    const home = Path.join(tmpHome, ".config/vialactea-works/kepler");
    const target = Path.join(home, "templates/v3/construction/design.md");
    Fs.mkdirSync(target, { recursive: true });
    Fs.writeFileSync(Path.join(target, "preserve.txt"), "user data\n");

    expect(() => createService(tmpHome, bundleRoot).setup()).toThrow(
      "cannot replace safely",
    );
    expect(
      Fs.readFileSync(Path.join(target, "preserve.txt"), "utf8"),
    ).toBe("user data\n");
    expect(Fs.existsSync(Path.join(home, "installation.json"))).toBe(false);
  });

  it("rejects incompatible or tampered bundles before creating the global home", () => {
    writeBundle(
      bundleRoot,
      createSetupBundleFixture({ cliReleases: ["0.10.2"] }),
    );
    expect(() => createService(tmpHome, bundleRoot).setup()).toThrow(
      "unsupported",
    );
    expect(
      Fs.existsSync(Path.join(tmpHome, ".config/vialactea-works/kepler")),
    ).toBe(false);

    writeBundle(bundleRoot, createSetupBundleFixture());
    Fs.writeFileSync(
      Path.join(bundleRoot, "templates/v3/construction/design.md"),
      "tampered\n",
    );
    expect(() => createService(tmpHome, bundleRoot).setup()).toThrow(
      "digest mismatch",
    );
    expect(
      Fs.existsSync(Path.join(tmpHome, ".config/vialactea-works/kepler")),
    ).toBe(false);
  });

  it("keeps the prior record and recovery backups when an update is interrupted", () => {
    const firstService = createService(tmpHome, bundleRoot);
    const first = firstService.setup();
    const home = Path.join(tmpHome, ".config/vialactea-works/kepler");
    const templatePath = Path.join(home, "templates/v3/construction/design.md");
    const guidelinePath = Path.join(
      home,
      "guidelines/general/01-code-style.md",
    );
    const recordPath = Path.join(home, "installation.json");
    const oldRecord = Fs.readFileSync(recordPath);
    writeBundle(
      bundleRoot,
      createSetupBundleFixture({
        bundleRelease: "kepler-bundle-3.0.1",
        templateContent: "# Updated design template\n",
        guidelineContent: "# Updated code style\n",
      }),
    );
    let renames = 0;
    const interrupted = createService(tmpHome, bundleRoot, {
      renameTarget: (staged, target) => {
        renames += 1;
        if (renames === 2) throw new Error("injected interruption");
        Fs.renameSync(staged, target);
      },
    });
    let failure: SetupApplyFailure | undefined;
    try {
      interrupted.setup();
    } catch (error) {
      if (error instanceof SetupApplyFailure) failure = error;
      else throw error;
    }

    expect(failure).toBeDefined();
    expect(Fs.readFileSync(recordPath)).toEqual(oldRecord);
    const recoveryPath = failure?.details.recovery_path;
    expect(typeof recoveryPath).toBe("string");
    if (typeof recoveryPath !== "string") throw new Error("missing recovery path");
    const recoveryManifest = JSON.parse(
      Fs.readFileSync(Path.join(recoveryPath, "recovery.json"), "utf8"),
    ) as { generation_id: string; previous_generation_id: string; completed_paths: string[] };
    expect(recoveryManifest.previous_generation_id).toBe(first.generation_id);
    expect(recoveryManifest.completed_paths).toHaveLength(1);
    const targetByRelative: Record<string, string> = {
      "templates/v3/construction/design.md": templatePath,
      "guidelines/general/01-code-style.md": guidelinePath,
    };
    const originalContentByRelative: Record<string, string> = {
      "templates/v3/construction/design.md": "# Design template\n",
      "guidelines/general/01-code-style.md": "# Code style\n",
    };
    const updatedContentByRelative: Record<string, string> = {
      "templates/v3/construction/design.md": "# Updated design template\n",
      "guidelines/general/01-code-style.md": "# Updated code style\n",
    };
    const completedPath = recoveryManifest.completed_paths[0];
    const untouchedPath = Object.keys(targetByRelative).find(
      (path) => path !== completedPath,
    );
    if (!completedPath || !untouchedPath) throw new Error("invalid recovery manifest");
    expect(Fs.readFileSync(targetByRelative[completedPath], "utf8")).toBe(
      updatedContentByRelative[completedPath],
    );
    expect(Fs.readFileSync(targetByRelative[untouchedPath], "utf8")).toBe(
      originalContentByRelative[untouchedPath],
    );
    const backupPath = Path.join(recoveryPath, "backups", completedPath);
    expect(Fs.readFileSync(backupPath, "utf8")).toBe(
      originalContentByRelative[completedPath],
    );
    expect(() => createService(tmpHome, bundleRoot).setup()).toThrow(
      "manual recovery",
    );

    Fs.copyFileSync(backupPath, targetByRelative[completedPath]);
    Fs.rmSync(recoveryPath, { recursive: true, force: true });
    const completed = createService(tmpHome, bundleRoot).setup();
    expect(completed.generation_id).not.toBe(first.generation_id);
    expect(Fs.readFileSync(templatePath, "utf8")).toBe(
      "# Updated design template\n",
    );
    expect(Fs.readFileSync(guidelinePath, "utf8")).toBe(
      "# Updated code style\n",
    );
    expect(Fs.readFileSync(recordPath, "utf8")).toContain(
      '"bundle_release": {',
    );
  });

  it("preserves an invalid installation record rather than trusting its receipts", () => {
    const home = Path.join(tmpHome, ".config/vialactea-works/kepler");
    Fs.mkdirSync(home, { recursive: true });
    const recordPath = Path.join(home, "installation.json");
    const invalidRecord = "{\"format_version\":1,\"format_version\":2}\n";
    Fs.writeFileSync(recordPath, invalidRecord);

    expect(() => createService(tmpHome, bundleRoot).setup()).toThrow(
      "existing installation record is invalid",
    );
    expect(Fs.readFileSync(recordPath, "utf8")).toBe(invalidRecord);
    expect(Fs.existsSync(Path.join(home, "templates"))).toBe(false);
  });
});
