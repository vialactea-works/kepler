import * as Fs from "node:fs";
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
}

async function runProbe() {
  const directory = process.env.PI_CODING_AGENT_DIR;
  const report = process.env.KEPLER_PI_SETTINGS_REPORT;
  if (!directory || !report) throw new Error("Owned Pi settings probe paths are required");
  const sdkEntryPath = process.env.KEPLER_PI_SDK_ENTRY_PATH;
  const sdkModuleName: string = "@earendil-works/pi-coding-agent";
  const sdk = sdkEntryPath
    ? await import(pathToFileURL(sdkEntryPath).href)
    : await import(sdkModuleName);
  const { SettingsManager } = sdk as unknown as PiCodingAgentSdk;
  const settings = SettingsManager.create(process.cwd(), directory);
  settings.setDefaultThinkingLevel("low");
  await settings.flush();
  Fs.writeFileSync(report, JSON.stringify({
    errors: settings.drainErrors().map(({ scope, error }) => ({
      scope,
      message: error.message,
      code: "code" in error ? error.code : null,
    })),
    current: JSON.parse(Fs.readFileSync(`${directory}/settings.json`, "utf8")),
  }, null, 2));
}

export default runProbe;

if (process.env.KEPLER_PI_PROBE_RUN_DIRECT === "1") await runProbe();
