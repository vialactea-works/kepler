import * as Path from "node:path";
import { createArtifactReader } from "./artifact-reader.js";
import { validateArtifact } from "./artifact-contracts.js";
import type { FinishRecordProjection, FinishRemainingEffect } from "./artifact-types.js";
import { durableArtifact, readContract } from "./precondition-artifacts.js";
import { gitBlobAt, gitBlobIdAt, gitCommand, gitResolveCommit, gitIsAncestor, relativePath, successful, text } from "./precondition-git.js";
import type { PreconditionRuntime } from "./precondition-runtime.js";
import { inspectVisibleFinishClaims } from "./finish-claims.js";

export const inspectFinishRoute = async (
  runtime: PreconditionRuntime,
  root: string,
  changeDir: string,
  original: FinishRecordProjection,
  remaining: readonly FinishRemainingEffect[],
): Promise<{ readonly problems: readonly string[]; readonly completed: readonly FinishRemainingEffect[] }> => {
  const route = original.route;
  if (!route) return { problems: [], completed: [] };
  const problems: string[] = [];
  const completed: FinishRemainingEffect[] = [];
  const allows = (kind: FinishRemainingEffect["kind"], path: string) => remaining.some((effect) => effect.kind === kind && effect.path === path);
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
  const currentBranch = await gitCommand(runtime, ["symbolic-ref", "--quiet", "HEAD"], root);
  const knownRefs = new Set([route.sourceRef, route.targetRef, ...(successful(currentBranch) ? [text(currentBranch)] : [])]);
  for (const ref of [...knownRefs].filter((ref) => ref.startsWith("refs/heads/"))) {
    const upstream = await gitCommand(runtime, ["rev-parse", "--symbolic-full-name", `${ref}@{upstream}`], root);
    if (successful(upstream) && /^refs\/remotes\/[^\s]+$/.test(text(upstream))) knownRefs.add(text(upstream));
  }
  problems.push(...await inspectVisibleFinishClaims(runtime, root, Path.basename(changeDir), expected,
    { refs: [...knownRefs], worktrees: [root, original.source.root] }));
  let allShipped = false;
  for (const [path, kind] of [[route.path, "route"], [route.mapPath, "map"]] as const) {
    const oldBlob = await gitBlobAt(runtime, root, admission.verifiedHead, path);
    const oldRead = successful(oldBlob) ? await createArtifactReader({ readFile: () => oldBlob.stdout })(Path.join(root, path)) : undefined;
    const old = oldRead ? validateArtifact(oldRead) : undefined;
    const current = await readContract(runtime, Path.join(root, path), kind);
    if (old?._tag !== "valid" || old.artifact !== kind || !current.artifact || oldRead?._tag !== "recognized" || !current.source ||
        !await durableArtifact(runtime, root, Path.join(root, path))) {
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
      const shipping = oldRead.body.split(/^## /m).filter((section) => /^Shipping rules[ \t]*(?:\r?\n|$)/.test(section));
      const qualifications = shipping.flatMap((section) => [...section.matchAll(/^- Qualification: (.*)$/gm)]);
      if (shipping.length !== 1 || qualifications.length !== 1 || qualifications[0]![1]!.trim() !== route.shipping)
        problems.push("historical Shipping rules do not establish the recorded qualification; owner adjudication required");
      const units = after.units as readonly Record<string, unknown>[];
      const oldUnits = before.units as readonly Record<string, unknown>[];
      const oldUnit = oldUnits.find((unit) => unit.id === route.unit);
      const unit = units.find((entry) => entry.id === route.unit);
      if (oldUnit?.status !== route.previousStatus || !unit || unit.status !== "in-progress" && unit.status !== "shipped")
        problems.push("named route unit is not its original in-progress or exact shipped advancement");
      allShipped = units.every((entry) => entry.status === "shipped");
      if (unit?.status === "shipped") completed.push({ kind: "route", path });
      else if (unit?.status === "in-progress" && !allows("route", path))
        problems.push("remaining effects omit the unverified named route advancement");
      before.units = oldUnits.map((entry) => entry.id === route.unit ? { ...entry, status: "in-progress" } : entry);
      after.units = units.map((entry) => entry.id === route.unit ? { ...entry, status: "in-progress" } : entry);
      if (JSON.stringify(before.units) !== JSON.stringify(after.units))
        problems.push("peer route unit state or structure changed after admission; owner adjudication required");
    } else if (allShipped) {
      if (newStatus === "shipped") completed.push({ kind: "map", path });
      else if (!allows("map", path)) problems.push("remaining effects omit the required aggregate map advancement");
    } else if (allows("map", path)) problems.push("map advancement cannot precede verified shipment of every unit");
    if (JSON.stringify(before) !== JSON.stringify(after) || newStatus === "shipped" && !allShipped ||
        newStatus !== oldStatus && !(oldStatus === "shipping" && newStatus === "shipped" && allShipped))
      problems.push(`${kind} structure/condition or aggregate state exceeds the recorded advancement`);
  }
  return { problems, completed };
};
