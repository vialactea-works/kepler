import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as Fs from "node:fs";
import * as Path from "node:path";
import * as Os from "node:os";
import { SetupService } from "../../packages/cli/src/cli/setup.service.js";
import { createSetupRuntime } from "../../packages/cli/src/cli/setup-runtime.js";

const TEMPLATE_FILES = [
  "critique.md",
  "design.md",
  "feedback.md",
  "finish.md",
  "glossary.md",
  "plan.md",
  "progress.md",
  "proposal.md",
  "README.md",
  "requirements-change.md",
  "requirements-spec.md",
  "review.md",
  "task-progress.md",
];

const WAYFINDER_TEMPLATE_FILES = [
  "wayfinder/map.md",
  "wayfinder/ticket.md",
  "wayfinder/route.md",
];

const runSetup = () => {
  const runtime = createSetupRuntime();
  const service = new SetupService(
    runtime.files,
    runtime.bundleLocator,
  );
  return service.setup();
};

describe("SetupService filesystem integration", () => {
  let tmpHome: string;
  const originalHome = process.env.HOME;
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

  beforeEach(() => {
    tmpHome = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-init-"));
    process.env.HOME = tmpHome;
    process.env.XDG_CONFIG_HOME = Path.join(tmpHome, ".config");
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    Fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("creates required directories", () => {
    runSetup();

    const home = Path.join(tmpHome, ".config/vialactea-works/kepler");
    expect(Fs.existsSync(home)).toBe(true);
    expect(Fs.existsSync(Path.join(home, "templates"))).toBe(true);
    expect(Fs.existsSync(Path.join(home, "guidelines"))).toBe(true);
    expect(Fs.existsSync(Path.join(home, "scripts"))).toBe(false);
  });

  it("copies artifact templates", () => {
    runSetup();

    const templatesBase = Path.join(tmpHome, ".config/vialactea-works/kepler", "templates");
    for (const file of TEMPLATE_FILES) {
      expect(Fs.existsSync(Path.join(templatesBase, file))).toBe(true);
    }
  });

  it("installs and refreshes the bundled design and canonical spec bytes", () => {
    const templatesBase = Path.join(tmpHome, ".config/vialactea-works/kepler", "templates");
    runSetup();
    for (const file of ["design.md", "requirements-spec.md"]) {
      const installedPath = Path.join(templatesBase, file);
      const bundledPath = Path.join(process.cwd(), "bundle", "templates", file);
      expect(Fs.readFileSync(installedPath)).toEqual(Fs.readFileSync(bundledPath));
      Fs.writeFileSync(installedPath, "stale template\n");
    }
    runSetup();
    for (const file of ["design.md", "requirements-spec.md"]) {
      expect(Fs.readFileSync(Path.join(templatesBase, file))).toEqual(
        Fs.readFileSync(Path.join(process.cwd(), "bundle", "templates", file)),
      );
    }
  });

  it("copies wayfinder artifact templates", () => {
    runSetup();

    const templatesBase = Path.join(tmpHome, ".config/vialactea-works/kepler", "templates");
    for (const file of WAYFINDER_TEMPLATE_FILES) {
      expect(Fs.existsSync(Path.join(templatesBase, file))).toBe(true);
    }

    const installedRoute = Fs.readFileSync(
      Path.join(templatesBase, "wayfinder", "route.md"),
      "utf-8",
    );
    const bundledRoute = Fs.readFileSync(
      Path.join(process.cwd(), "bundle", "templates", "wayfinder", "route.md"),
      "utf-8",
    );
    expect(installedRoute).toBe(bundledRoute);
    for (const section of [
      "Point of departure",
      "Destination",
      "Path chosen",
      "Shipping rules",
      "Units",
    ]) {
      expect(installedRoute).toContain(`## ${section}`);
    }
  });

  it("copies guideline manifests", () => {
    runSetup();

    const guidelinesBase = Path.join(tmpHome, ".config/vialactea-works/kepler", "guidelines");
    expect(
      Fs.existsSync(Path.join(guidelinesBase, "general", "01-code-style.md")),
    ).toBe(true);
    expect(
      Fs.existsSync(Path.join(guidelinesBase, "typescript", "01-setup.md")),
    ).toBe(true);
    expect(
      Fs.existsSync(Path.join(guidelinesBase, "golang", "code_style.md")),
    ).toBe(true);
  });

  it("returns installed template filenames", () => {
    const result = runSetup();
    expect(result.templates).toContain("plan.md");
    expect(result.templates).toContain("task-progress.md");
    expect(result.templates).toContain("feedback.md");
    expect(result.templates).toContain("finish.md");
    expect(result.templates).toContain("glossary.md");
    expect(result.templates).toContain("wayfinder/map.md");
    expect(result.templates.length).toBeGreaterThan(0);
  });

  it("does not expose installed script filenames", () => {
    const result = runSetup();
    expect(Object.keys(result)).toEqual(["templates"]);
  });

  it("leaves an existing helper script directory unchanged", () => {
    const scriptsBase = Path.join(tmpHome, ".config/vialactea-works/kepler", "scripts");
    Fs.mkdirSync(Path.join(scriptsBase, "nested"), { recursive: true });
    Fs.writeFileSync(Path.join(scriptsBase, "legacy.sh"), "legacy helper\n");
    Fs.writeFileSync(
      Path.join(scriptsBase, "nested", "config"),
      Buffer.from([0, 1, 2, 255]),
    );
    const before = [
      Fs.readFileSync(Path.join(scriptsBase, "legacy.sh")),
      Fs.readFileSync(Path.join(scriptsBase, "nested", "config")),
    ];

    runSetup();
    expect(Fs.readdirSync(scriptsBase).sort()).toEqual(["legacy.sh", "nested"]);
    expect(Fs.readFileSync(Path.join(scriptsBase, "legacy.sh"))).toEqual(
      before[0],
    );
    expect(Fs.readFileSync(Path.join(scriptsBase, "nested", "config"))).toEqual(
      before[1],
    );
  });

  it("is idempotent", () => {
    runSetup();
    runSetup();

    expect(
      Fs.existsSync(Path.join(tmpHome, ".config/vialactea-works/kepler", "templates", "plan.md")),
    ).toBe(true);
  });

  it("creates default settings.yaml on init", () => {
    runSetup();

    const settingsPath = Path.join(tmpHome, ".config/vialactea-works/kepler", "settings.yaml");
    expect(Fs.existsSync(settingsPath)).toBe(true);

    const content = Fs.readFileSync(settingsPath, "utf-8");
    expect(content).toContain("name: rtk");
    expect(content).toContain("name: lsp");
    expect(content).toContain("name: git");
  });

  it("does not overwrite existing settings.yaml on re-init", () => {
    runSetup();

    const settingsPath = Path.join(tmpHome, ".config/vialactea-works/kepler", "settings.yaml");
    Fs.writeFileSync(
      settingsPath,
      "extensions:\n  - name: rtk\n    enabled: false\n",
    );

    runSetup();

    const content = Fs.readFileSync(settingsPath, "utf-8");
    expect(content).toContain("enabled: false");
  });
});

describe("bundle root resolution", () => {
  let tmpHome: string;
  let tmpBundleDir: string;
  const originalHome = process.env.HOME;
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  const originalBundleDir = process.env.KEPLER_BUNDLE_DIR;

  beforeEach(() => {
    tmpHome = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-setup-"));
    tmpBundleDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-bundle-"));
    process.env.HOME = tmpHome;
    process.env.XDG_CONFIG_HOME = Path.join(tmpHome, ".config");
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    delete process.env.KEPLER_BUNDLE_DIR;
    if (originalBundleDir) {
      process.env.KEPLER_BUNDLE_DIR = originalBundleDir;
    }
    Fs.rmSync(tmpHome, { recursive: true, force: true });
    Fs.rmSync(tmpBundleDir, { recursive: true, force: true });
  });

  it("uses KEPLER_BUNDLE_DIR env var to locate bundle assets", () => {
    const bundleTemplatesDir = Path.join(tmpBundleDir, "templates");
    Fs.mkdirSync(bundleTemplatesDir, { recursive: true });
    Fs.writeFileSync(
      Path.join(bundleTemplatesDir, "plan.md"),
      "# Plan Template",
    );

    process.env.KEPLER_BUNDLE_DIR = tmpBundleDir;
    runSetup();

    const copiedTemplate = Path.join(
      tmpHome,
      ".config/vialactea-works/kepler",
      "templates",
      "plan.md",
    );
    expect(Fs.existsSync(copiedTemplate)).toBe(true);
    const content = Fs.readFileSync(copiedTemplate, "utf-8");
    expect(content).toBe("# Plan Template");
    expect(Fs.existsSync(Path.join(tmpHome, ".config/vialactea-works/kepler", "scripts"))).toBe(
      false,
    );
  });

  it("succeeds when the bundle has no helper scripts", () => {
    const bundleTemplatesDir = Path.join(tmpBundleDir, "templates");
    Fs.mkdirSync(bundleTemplatesDir, { recursive: true });
    Fs.writeFileSync(
      Path.join(bundleTemplatesDir, "plan.md"),
      "# Plan Template",
    );

    process.env.KEPLER_BUNDLE_DIR = tmpBundleDir;
    runSetup();
    expect(Fs.existsSync(Path.join(tmpHome, ".config/vialactea-works/kepler", "scripts"))).toBe(
      false,
    );
  });
});
