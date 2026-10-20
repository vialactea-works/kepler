import * as Path from "node:path";
import type {
  ApplicationConnector,
  CliInvocation,
  CommandResult,
} from "./connectors.js";
import { DockerApplicationConnector, NativeApplicationConnector } from "./connectors.js";
import type { E2EResources } from "./resources.js";

const projectRoot = Path.resolve(import.meta.dirname, "../..");
const cliPath = Path.join(projectRoot, "packages", "cli", "dist", "cli", "main.js");

export interface CliRunOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}

export class KeplerCliDriver {
  constructor(
    private readonly connector: ApplicationConnector,
    private readonly resources: E2EResources,
  ) {
    connector.assertAvailable(resources, cliPath);
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
