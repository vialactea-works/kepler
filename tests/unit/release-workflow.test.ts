import * as Fs from "node:fs";
import * as Path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const repositoryRoot = Path.resolve(import.meta.dirname, "../..");
const supportedTargets = ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"];

type WorkflowStep = {
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly with?: Readonly<Record<string, unknown>>;
};

type WorkflowJob = {
  readonly needs?: string | readonly string[];
  readonly strategy?: {
    readonly matrix?: {
      readonly include?: readonly { readonly target?: string }[];
    };
  };
  readonly steps?: readonly WorkflowStep[];
};

type Workflow = {
  readonly jobs: Readonly<Record<string, WorkflowJob | undefined>>;
};

function readWorkflow(path: string): Workflow {
  const value = parse(Fs.readFileSync(Path.join(repositoryRoot, path), "utf8")) as unknown;
  if (typeof value !== "object" || value === null || !("jobs" in value)) {
    throw new Error(`Workflow is missing jobs: ${path}`);
  }
  return value as Workflow;
}

function job(workflow: Workflow, name: string): WorkflowJob {
  const value = workflow.jobs[name];
  if (!value) throw new Error(`Workflow job is missing: ${name}`);
  return value;
}

function step(workflowJob: WorkflowJob, name: string): WorkflowStep {
  const value = workflowJob.steps?.find((candidate) => candidate.name === name);
  if (!value) throw new Error(`Workflow step is missing: ${name}`);
  return value;
}

describe("unified release native archive workflow", () => {
  it("pins the tested Bun version in package metadata, every setup action, and the E2E image", () => {
    const packageManifest = JSON.parse(Fs.readFileSync(Path.join(repositoryRoot, "package.json"), "utf8")) as {
      readonly packageManager?: string;
    };
    expect(packageManifest.packageManager).toBe("bun@1.4.0");

    let setupActionCount = 0;
    for (const path of [".github/workflows/test.yml", ".github/workflows/release.yml"]) {
      const workflow = readWorkflow(path);
      for (const hostJob of Object.values(workflow.jobs)) {
        for (const workflowStep of hostJob?.steps ?? []) {
          if (!workflowStep.uses?.startsWith("oven-sh/setup-bun@")) continue;
          setupActionCount += 1;
          expect(workflowStep.uses).toBe("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");
          expect(workflowStep.with).toMatchObject({ "bun-version-file": "package.json" });
          expect(workflowStep.with).not.toHaveProperty("bun-version");
        }
      }
    }
    expect(setupActionCount).toBe(9);
    expect(Fs.readFileSync(Path.join(repositoryRoot, "tests/e2e/Dockerfile"), "utf8"))
      .toMatch(/^FROM oven\/bun:1\.4\.0@/m);
  });

  it("keeps exact-archive E2E out of the generic workspace test command", () => {
    const packageManifest = JSON.parse(Fs.readFileSync(Path.join(repositoryRoot, "package.json"), "utf8")) as {
      readonly scripts?: Readonly<Record<string, string>>;
    };
    expect(packageManifest.scripts?.["test:e2e"]).toContain(
      "--exclude tests/e2e/release-archive.test.ts",
    );
    expect(packageManifest.scripts?.["test:e2e"]).toContain(
      "--exclude tests/e2e/dev-package.test.ts",
    );
  });

  it("builds and tests the exact production archive on every native target", () => {
    for (const path of [".github/workflows/test.yml", ".github/workflows/release.yml"]) {
      const workflow = readWorkflow(path);
      const native = job(workflow, "native-distribution");
      expect(native.strategy?.matrix?.include?.map(({ target }) => target)).toEqual(supportedTargets);
      for (const jobName of ["verify", "native-distribution"]) {
        const hostJob = job(workflow, jobName);
        expect(step(hostJob, "Setup Node for the pinned Pi E2E host").with)
          .toMatchObject({ "node-version": "22.19.0" });
        const host = step(hostJob, "Install actual pinned Pi E2E collaborators").run ?? "";
        expect(host).toContain("KEPLER_PI_NODE_BINARY");
        expect(host).toContain("KEPLER_PI_SDK_ENTRY_PATH");
        expect(host).toContain("/dist/index.js");
        expect(host).toContain("v22.19.0");
        expect(host).toContain("--version");
      }
      const build = step(native, "Build exact native archive for public CLI tests").run ?? "";
      expect(build).toContain("scripts/build-release-binary.ts");
      expect(build).toContain("--require-clean");
      expect(build).toContain("scripts/package-target-archive.ts");
      expect(build).toContain("KEPLER_VERIFIED_ARCHIVE_PATH");
      expect(build).toContain("KEPLER_VERIFIED_ARCHIVE_SHA256");
      expect(build).toContain("$archive.sha256");
      expect(build).toContain("scripts/archive-digest.ts");
      expect(build).not.toContain("sha256sum");
      const e2e = step(native, path.includes("release.yml")
        ? "Run native target archive E2E"
        : "Run native standalone distribution E2E").run ?? "";
      expect(e2e).toContain("tests/e2e/release-archive.test.ts");
      expect(e2e).toContain("tests/e2e/dev-package.test.ts");
      expect(e2e).toContain("--no-file-parallelism");
    }
  });

  it("packages, attests, verifies, and publishes only the archives exercised by native CI", () => {
    const workflow = readWorkflow(".github/workflows/release.yml");
    expect(workflow.jobs.build).toBeUndefined();
    const packageJob = job(workflow, "package");
    expect(packageJob.needs).toContain("native-distribution");
    const download = step(packageJob, "Download tested native target archives");
    expect(download.uses).toContain("actions/download-artifact@");
    expect(download.with).toMatchObject({
      pattern: "kepler-target-archive-*",
      "merge-multiple": true,
    });
    const nativeUpload = step(job(workflow, "native-distribution"), "Upload tested native target archive");
    expect(nativeUpload.with?.path).toContain(".tar.gz.sha256");
    const stage = step(packageJob, "Verify tested native archive digests and stage release assets").run ?? "";
    expect(stage).toContain("sha256sum --check");
    expect(stage).toContain("mv artifacts/kepler-*.tar.gz release-assets/");
    expect(step(packageJob, "Create release provenance and checksums").run).toContain(
      "scripts/release-assets.ts",
    );
    expect(step(packageJob, "Attest release assets").with?.["subject-path"]).toBe("release-assets/*");
    expect(step(packageJob, "Upload complete verified release assets").with).toMatchObject({
      name: "release-assets",
      path: "release-assets/*",
    });

    const verification = job(workflow, "verify-release-assets");
    expect(step(verification, "Download release assets").with).toMatchObject({
      name: "release-assets",
      path: "release-assets",
    });
    expect(step(verification, "Verify release provenance and checksums").run).toContain("--mode verify");

    const corePublication = job(workflow, "publish-core");
    expect(corePublication.needs).toContain("verify-release-assets");
    expect(corePublication.needs).not.toContain("tag");
    expect(job(workflow, "tag").needs).toContain("publish-core");
    expect(job(workflow, "publish").needs).toContain("publish-core");
    expect(step(corePublication, "Download verified release assets").with).toMatchObject({
      name: "release-assets",
      path: "release-assets",
    });
    const reconcile = step(corePublication, "Publish or reconcile exact Core tarball").run ?? "";
    expect(reconcile).toContain("scripts/reconcile-core-package.ts");
    expect(reconcile).toContain("--tarball \"release-assets/kepler-core-$RELEASE_VERSION.tgz\"");
    expect(reconcile).toContain("--registry https://npm.pkg.github.com");
    expect(reconcile).not.toContain("npm publish ./packages/core");

    expect(step(job(workflow, "publish"), "Download verified release assets").with).toMatchObject({
      name: "release-assets",
      path: "release-assets",
    });
  });
});
