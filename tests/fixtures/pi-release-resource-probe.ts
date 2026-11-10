import * as Fs from "node:fs";
import * as Path from "node:path";
import { pathToFileURL } from "node:url";

interface PiSettingsManager {
  setDefaultThinkingLevel(level: "low"): void;
  flush(): Promise<void>;
  drainErrors(): readonly { readonly scope: string; readonly error: { readonly message: string; readonly code?: unknown } }[];
}

interface PiCodingAgentSdk {
  readonly SettingsManager: {
    create(projectDirectory: string, agentDirectory: string): PiSettingsManager;
  };
  readonly DefaultResourceLoader: new (options: {
    readonly cwd: string;
    readonly agentDir: string;
    readonly settingsManager: PiSettingsManager;
    readonly noExtensions: true;
    readonly noPromptTemplates: true;
    readonly noThemes: true;
    readonly noContextFiles: true;
  }) => {
    reload(): Promise<void>;
    getSkills(): {
      readonly skills: readonly { readonly name?: unknown }[];
      readonly diagnostics: readonly unknown[];
    };
  };
}

async function runProbe() {
  const agentDirectory = process.env.PI_CODING_AGENT_DIR;
  const projectDirectory = process.env.KEPLER_PROJECT_DIR;
  const loaderRoot = process.env.KEPLER_PI_SUBAGENTS_ROOT;
  const reportPath = process.env.KEPLER_PI_PROBE_REPORT;
  const packageSource = process.env.KEPLER_PACKAGE_SOURCE;
  if (!agentDirectory || !projectDirectory || !loaderRoot || !reportPath || !packageSource) {
    throw new Error("Owned archive resource-probe paths are required");
  }

  const sdkEntryPath = process.env.KEPLER_PI_SDK_ENTRY_PATH;
  const sdkModuleName: string = "@earendil-works/pi-coding-agent";
  const sdk = sdkEntryPath
    ? await import(pathToFileURL(sdkEntryPath).href)
    : await import(sdkModuleName);
  const { SettingsManager } = sdk as unknown as PiCodingAgentSdk;
  const settingsManager = SettingsManager.create(projectDirectory, agentDirectory);
  settingsManager.setDefaultThinkingLevel("low");
  await settingsManager.flush();
  const resourceLoader = new (sdk as unknown as PiCodingAgentSdk).DefaultResourceLoader({
    cwd: projectDirectory,
    agentDir: agentDirectory,
    settingsManager,
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  const sdkSkills = resourceLoader.getSkills();
  const sdkKeplerSkills = sdkSkills.skills
    .map(({ name }) => name)
    .filter((name): name is string => typeof name === "string" && name.startsWith("kepler-"));
  const settingsErrors = settingsManager.drainErrors().map(({ scope, error }) => ({
    scope,
    message: error.message,
    code: "code" in error ? error.code : null,
  }));

  const agentsModule = await import(pathToFileURL(Path.join(loaderRoot, "src", "agents", "agents.js")).href) as {
    clearAgentDiscoveryCache(): void;
    discoverAgentSnapshot(
      project: string,
      scope: "both",
      preferredModelProvider?: undefined,
      options?: { readonly globalNpmRoot?: null },
    ): { readonly effective: { readonly agents: readonly Record<string, unknown>[] }; readonly diagnostics?: readonly unknown[] };
  };
  const skillsModule = await import(pathToFileURL(Path.join(loaderRoot, "src", "agents", "skills.js")).href) as {
    clearSkillCache(): void;
    discoverAvailableSkills(project: string): readonly Record<string, unknown>[];
  };
  agentsModule.clearAgentDiscoveryCache();
  skillsModule.clearSkillCache();
  const agents = agentsModule.discoverAgentSnapshot(projectDirectory, "both", undefined, {
    globalNpmRoot: null,
  });
  const skills = skillsModule.discoverAvailableSkills(projectDirectory);
  const settings = JSON.parse(Fs.readFileSync(Path.join(agentDirectory, "settings.json"), "utf8")) as {
    readonly packages?: unknown;
    readonly defaultThinkingLevel?: unknown;
    readonly customSentinel?: unknown;
  };
  Fs.writeFileSync(reportPath, `${JSON.stringify({
    packageSource,
    packages: settings.packages,
    defaultThinkingLevel: settings.defaultThinkingLevel,
    customSentinel: settings.customSentinel,
    settingsErrors,
    sdkKeplerSkills,
    sdkSkillDiagnostics: sdkSkills.diagnostics,
    skills,
    roles: agents.effective.agents,
    diagnostics: agents.diagnostics ?? [],
  }, null, 2)}\n`);
}

export default runProbe;

if (process.env.KEPLER_PI_PROBE_RUN_DIRECT === "1") await runProbe();
