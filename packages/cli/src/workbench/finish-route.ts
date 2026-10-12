import * as Path from "node:path";
import { createArtifactReader } from "./artifact-reader.js";
import { validateArtifact } from "./artifact-contracts.js";
import type { FinishRecordProjection } from "./artifact-types.js";
import { readContract } from "./precondition-artifacts.js";
import { gitBlobAt, gitBlobIdAt, gitResolveCommit, gitIsAncestor, relativePath, successful, text } from "./precondition-git.js";
import type { PreconditionRuntime } from "./precondition-runtime.js";

export const inspectFinishRoute = async (
  runtime: PreconditionRuntime,
  root: string,
  changeDir: string,
  original: FinishRecordProjection,
): Promise<readonly string[]> => {
  const route = original.route;
  if (!route) return [];
  const problems: string[] = [];
  const admission = original.admission;
  const changePath = relativePath(root, changeDir);
  const expected = `${route.path} — unit ${route.unit}`;
  let bound = false;
  for (const file of ["proposal.md", "plan.md"] as const) {
    const blob = await gitBlobAt(runtime, root, admission.verifiedHead, `${changePath}/${file}`);
    if (!successful(blob)) continue;
    const parsed = await createArtifactReader({ readFile: () => blob.stdout })(Path.join(changeDir, file));
    const contract = validateArtifact(parsed);
    if (contract._tag !== "valid") { problems.push(`original ${file} binding is invalid`); continue; }
    const binding = contract.metadata.route_unit;
    if (binding !== null && binding !== expected) problems.push(`original ${file} conflicts with recorded route/unit`);
    if (binding === expected) bound = true;
  }
  if (!bound || route.sourceRef !== original.source.sourceRef) problems.push("route is not bound to the original owning change/source");
  const base = await gitResolveCommit(runtime, root, route.baseCommit);
  if (!successful(base) || text(base) !== route.baseCommit || !successful(await gitIsAncestor(runtime, root, route.baseCommit, admission.verifiedHead)))
    problems.push("route base/input revision is not part of original admission");
  const source = await gitBlobIdAt(runtime, root, admission.verifiedHead, route.path);
  if (!successful(source) || text(source) !== route.sourceBlob) problems.push("original route-source identity is unverifiable");
  const changes = Path.join(root, ".kepler/changes");
  if (!runtime.fileSystem.readDirectory || !runtime.fileSystem.readFile) problems.push("visible route claims cannot be inspected");
  else {
    for (const name of await runtime.fileSystem.readDirectory(changes)) {
      if (name === Path.basename(changeDir)) continue;
      const directory = Path.join(changes, name);
      if (!(await runtime.fileSystem.directoryExists(directory))) continue;
      if (!String(await runtime.fileSystem.realpath(directory)).startsWith(`${String(await runtime.fileSystem.realpath(changes))}${Path.sep}`)) {
        problems.push(`visible claim directory escapes the change namespace: ${directory}`);
        continue;
      }
      for (const file of ["proposal.md", "plan.md"]) {
        const claim = Path.join(changes, name, file);
        if (!(await runtime.fileSystem.pathExists(claim))) continue;
        const parsed = await createArtifactReader({ readFile: (path) => runtime.fileSystem.readFile!(path) })(claim);
        if (parsed._tag === "recognized" && parsed.metadata.route_unit === expected)
          problems.push(`competing visible route claim: ${claim}`);
      }
    }
  }
  let allShipped = false;
  for (const [path, kind] of [[route.path, "route"], [route.mapPath, "map"]] as const) {
    const oldBlob = await gitBlobAt(runtime, root, admission.verifiedHead, path);
    const oldRead = successful(oldBlob) ? await createArtifactReader({ readFile: () => oldBlob.stdout })(Path.join(root, path)) : undefined;
    const old = oldRead ? validateArtifact(oldRead) : undefined;
    const current = await readContract(runtime, Path.join(root, path), kind);
    if (old?._tag !== "valid" || old.artifact !== kind || !current.artifact || oldRead?._tag !== "recognized" || !current.source) {
      problems.push(`${kind} original/current evidence is invalid or missing`);
      continue;
    }
    const newRead = await createArtifactReader({ readFile: () => current.source! })(Path.join(root, path));
    if (newRead._tag !== "recognized" || oldRead.body !== newRead.body) problems.push(`${kind} intent/body changed after admission`);
    const before = { ...old.metadata };
    const after = { ...current.artifact.metadata };
    delete before.updated;
    delete after.updated;
    const oldStatus = before.status;
    const newStatus = after.status;
    delete before.status;
    delete after.status;
    if (kind === "route") {
      const units = after.units as readonly Record<string, unknown>[];
      const oldUnits = before.units as readonly Record<string, unknown>[];
      const oldUnit = oldUnits.find((unit) => unit.id === route.unit);
      const unit = units.find((entry) => entry.id === route.unit);
      if (oldUnit?.status !== route.previousStatus || !unit || unit.status !== "in-progress" && unit.status !== "shipped")
        problems.push("named route unit is not its original in-progress or exact shipped advancement");
      allShipped = units.every((entry) => entry.status === "shipped");
      before.units = oldUnits.map(({ status: _status, ...entry }) => entry);
      after.units = units.map(({ status: _status, ...entry }) => entry);
    }
    if (JSON.stringify(before) !== JSON.stringify(after) || newStatus !== oldStatus && !(oldStatus === "shipping" && newStatus === "shipped" && allShipped))
      problems.push(`${kind} structure/condition or aggregate state exceeds the recorded advancement`);
  }
  return problems;
};
