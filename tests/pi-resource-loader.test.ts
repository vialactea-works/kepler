import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { pathToFileURL } from "node:url";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = Path.resolve(import.meta.dirname, "..");
const loaderRoot = process.env.KEPLER_PI_SUBAGENTS_ROOT;
const requiredLoaderVersion = "0.76.1";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("installed pi-subagents package resource loader", () => {
  it.skipIf(!loaderRoot && process.env.CI !== "true")("discovers packaged Kepler skills and roles through the actual loader", async () => {
    if (!loaderRoot) throw new Error("KEPLER_PI_SUBAGENTS_ROOT is required");
    const loaderPackage = JSON.parse(
      Fs.readFileSync(Path.join(loaderRoot, "package.json"), "utf8"),
    ) as { version?: unknown };
    expect(loaderPackage.version).toBe(requiredLoaderVersion);

    const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-pi-resource-loader-"));
    temporaryRoots.push(root);
    const home = Path.join(root, "home");
    const agentDirectory = Path.join(root, "agent");
    const projectDirectory = Path.join(root, "project");
    const packageRoot = Path.join(root, "generation");
    Fs.mkdirSync(home, { recursive: true });
    Fs.mkdirSync(Path.join(root, "tmp"), { recursive: true });
    Fs.mkdirSync(agentDirectory, { recursive: true });
    Fs.mkdirSync(projectDirectory, { recursive: true });
    Fs.mkdirSync(packageRoot, { recursive: true });
    Fs.copyFileSync(
      Path.join(repositoryRoot, "bundle", "pi-package.json"),
      Path.join(packageRoot, "package.json"),
    );
    Fs.mkdirSync(Path.join(packageRoot, "bundle"), { recursive: true });
    Fs.cpSync(
      Path.join(repositoryRoot, "bundle", "skills"),
      Path.join(packageRoot, "bundle", "skills"),
      { recursive: true, dereference: false },
    );
    Fs.cpSync(
      Path.join(repositoryRoot, "bundle", "agents", "pi", "v1"),
      Path.join(packageRoot, "bundle", "agents", "pi", "v1"),
      { recursive: true, dereference: false },
    );
    Fs.writeFileSync(
      Path.join(agentDirectory, "settings.json"),
      `${JSON.stringify({ packages: [packageRoot] }, null, 2)}\n`,
    );

    const output = await execa(
      "node",
      [
        "--input-type=module",
        "-e",
        [
          'const agentsModule = await import(process.env.KEPLER_AGENTS_MODULE);',
          'const skillsModule = await import(process.env.KEPLER_SKILLS_MODULE);',
          'agentsModule.clearAgentDiscoveryCache();',
          'skillsModule.clearSkillCache();',
          'const snapshot = agentsModule.discoverAgentSnapshot(process.env.KEPLER_PROJECT_DIR, "both", undefined, { globalNpmRoot: null });',
          'const skills = skillsModule.discoverAvailableSkills(process.env.KEPLER_PROJECT_DIR);',
          'console.log(JSON.stringify({ skills, agents: snapshot.effective.agents }));',
        ].join("\n"),
      ],
      {
        cwd: projectDirectory,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: home,
          USERPROFILE: home,
          TMPDIR: Path.join(root, "tmp"),
          PI_CODING_AGENT_DIR: agentDirectory,
          PI_OFFLINE: "1",
          PI_SUBAGENT_EXTRA_AGENT_DIRS: "",
          KEPLER_PROJECT_DIR: projectDirectory,
          KEPLER_AGENTS_MODULE: pathToFileURL(Path.join(loaderRoot, "src", "agents", "agents.js")).href,
          KEPLER_SKILLS_MODULE: pathToFileURL(Path.join(loaderRoot, "src", "agents", "skills.js")).href,
        },
        extendEnv: false,
        timeout: 30_000,
      },
    );
    const discovery: {
      readonly skills: readonly { readonly name: string; readonly source: string }[];
      readonly agents: readonly { readonly name: string; readonly tools?: readonly string[] }[];
    } = JSON.parse(output.stdout);
    const discoveredSkills = new Set(discovery.skills.map((skill) => skill.name));
    for (const name of [
      "kepler-code",
      "kepler-code-feedback",
      "kepler-design",
      "kepler-domain-modelling",
      "kepler-finish-work",
      "kepler-grilling",
      "kepler-orchestrate",
      "kepler-plan",
      "kepler-quality",
      "kepler-research",
      "kepler-review",
    ]) expect(discoveredSkills.has(name)).toBe(true);
    const actualAgents = new Map(discovery.agents.map((agent) => [agent.name, agent]));
    for (const name of [
      "kepler-architect",
      "kepler-orchestrator",
      "kepler-coder",
      "kepler-reviewer",
    ]) expect(actualAgents.has(name)).toBe(true);
    expect(actualAgents.get("kepler-orchestrator")?.tools).toContain("subagent");
    expect(actualAgents.get("kepler-coder")?.tools).not.toContain("subagent");
    expect(actualAgents.get("kepler-reviewer")?.tools).not.toContain("write");
    expect(actualAgents.get("kepler-reviewer")?.tools).not.toContain("edit");
  });
});
