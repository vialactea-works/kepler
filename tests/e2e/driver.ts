import * as Path from "node:path";
import * as Fs from "node:fs";
import { parseHistoryControl } from "../../packages/cli/src/history/control.js";
import type {
  ApplicationConnector,
  CliInvocation,
  CommandResult,
} from "./connectors.js";
import { DockerApplicationConnector, NativeApplicationConnector } from "./connectors.js";
import type { E2EResources } from "./resources.js";

const projectRoot = Path.resolve(import.meta.dirname, "../..");
const cliPath = Path.join(projectRoot, "packages", "cli", "dist", "cli", "main.js");

export const fixtureHistorySelection = (root: string, missionId: string) => {
  const control = parseHistoryControl(Fs.readFileSync(Path.join(root, ".kepler", "missions", missionId, "history", "control", "active.json"), "utf8"));
  return { control, historyVersion: control.id, generationId: control.data.generation_id, directory: Path.join(root, ".kepler", "missions", missionId, "history", "generations", control.data.generation_id, "construction") };
};

export interface CliRunOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly stdin?: string;
}

export class KeplerCliDriver {
  constructor(
    private readonly connector: ApplicationConnector,
    private readonly resources: E2EResources,
  ) {
    connector.assertAvailable(resources, cliPath);
  }

  runFreshMutation(args: readonly string[], options: CliRunOptions = {}): CommandResult {
    return this.run(this.freshMutationArguments(args), options);
  }

  freshMutationArguments(args: readonly string[]): readonly string[] {
    const construction = args[0] === "workflow" && args[1] === "construction";
    const mutation = args[0] === "audit" && args[1] === "record" || args[0] === "git" && args[1] === "diff-package" && args.some((argument) => argument === "--out" || argument.startsWith("--out=")) || construction && (
      args[2] === "revise" ||
      args[2] === "unit" && args[3] === "create" ||
      args[2] === "stage" && ["start", "complete", "pause", "resume", "assess-retained-scopes"].includes(args[3] ?? "") ||
      args[2] === "task" && args[3] === "admit" ||
      args[2] === "activity" && ["start", "complete", "pause", "resume"].includes(args[3] ?? "") ||
      args[2] === "integration" && ["lock", "prepare", "evidence", "accept", "release"].includes(args[3] ?? "")
    );
    if (!mutation || args.some((argument) => argument === "--history-version" || argument.startsWith("--history-version="))) return args;
    const option = (flag: string): string | undefined => {
      const at = args.indexOf(flag);
      return at >= 0 ? args[at + 1] : args.find((argument) => argument.startsWith(`${flag}=`))?.slice(flag.length + 1);
    };
    const selectedMission = option("--mission");
    const unit = option("--unit");
    const root = Path.join(this.resources.repositoryDirectory, ".kepler", "missions");
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const matches: string[] = [];
    try {
      for (const entry of Fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || !uuid.test(entry.name) || selectedMission !== undefined && entry.name !== selectedMission) continue;
        const control = parseHistoryControl(Fs.readFileSync(Path.join(root, entry.name, "history", "control", "active.json"), "utf8"));
        const unitIds = "mission_binding" in control.data.manifest ? control.data.manifest.mission_binding.unit_ids : [];
        const unitRoot = unit && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(unit) ? Path.join(root, entry.name, "construction", "units-of-work", unit) : undefined;
        if (selectedMission !== undefined || unit !== undefined && (unitIds.includes(unit) || unitRoot !== undefined && Fs.existsSync(unitRoot))) matches.push(control.id);
      }
    } catch {
      return args;
    }
    return matches.length === 1 ? [...args, "--history-version", matches[0]!] : args;
  }

  run(args: readonly string[], options: CliRunOptions = {}): CommandResult {
    const overrides = { ...options.env };
    if (
      options.env?.HOME !== undefined &&
      options.env.XDG_CONFIG_HOME === undefined
    ) {
      overrides.XDG_CONFIG_HOME = Path.join(options.env.HOME, ".config");
    }
    const env = {
      ...this.resources.environment(),
      ...overrides,
    };
    const invocation: CliInvocation = {
      cliPath,
      projectRoot,
      args,
      cwd: Path.resolve(options.cwd ?? this.resources.repositoryDirectory),
      env,
      timeoutMs: options.timeoutMs ?? 30_000,
      ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
      resources: this.resources,
    };
    return this.connector.invoke(invocation);
  }
}

export const createApplicationConnector = (
  kind: "docker" | "native",
): ApplicationConnector =>
  kind === "docker"
    ? new DockerApplicationConnector()
    : new NativeApplicationConnector();
