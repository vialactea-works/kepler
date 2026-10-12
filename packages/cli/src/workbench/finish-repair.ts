import * as Path from "node:path";
import { createArtifactReader } from "./artifact-reader.js";
import { validateArtifact } from "./artifact-contracts.js";
import type { FinishDeliveryIdentity, FinishRecordProjection } from "./artifact-types.js";
import { durableArtifact, inspectTasks, readContract } from "./precondition-artifacts.js";
import { inspectFreshness, inspectReviews } from "./precondition-reviews.js";
import { historicalAdmissionRuntime } from "./precondition-source.js";
import { inspectFinishRoute } from "./finish-route.js";
import {
  fullCommit, gitBlobAt, gitBlobIdAt, gitCommand, gitCommitFiles, gitCurrentHead, gitFirstParent,
  gitIsAncestor, gitPathHistory, gitResolveCommit, relativePath, successful, text,
} from "./precondition-git.js";
import type { PreconditionArguments, PreconditionRuntime } from "./precondition-runtime.js";

export interface FinishInspection {
  readonly passed: boolean;
  readonly output: string;
  readonly remaining?: NonNullable<FinishRecordProjection["remaining"]>;
}
const inspection = (problems: readonly string[], remaining?: FinishInspection["remaining"]): FinishInspection => ({
  passed: problems.length === 0,
  output: problems.length === 0 ? "[PASS] Finish history and finalization boundary\n" : `[FAIL] Finish history (${problems.join("; ")})\n`,
  ...(remaining === undefined ? {} : { remaining }),
});

const historyAt = async (runtime: PreconditionRuntime, root: string, revision: string, path: string) => {
  const blob = await gitBlobAt(runtime, root, revision, path);
  if (!successful(blob)) return undefined;
  const read = await createArtifactReader({ readFile: () => blob.stdout })(Path.join(root, path));
  const contract = validateArtifact(read);
  if (contract._tag !== "valid" || contract.artifact !== "finish") return undefined;
  const lines = blob.stdout.split(/\r\n|\n|\r/);
  const records = contract.body.workflow.records.map((record, index, all) => ({
    key: `${record.kind}:${record.number}`,
    body: lines.slice(record.line - 1, (all[index + 1]?.line ?? lines.length + 1) - 1).join("\n").trimEnd(),
  }));
  return { contract, records };
};

export const inspectFinishHistory = async (
  runtime: PreconditionRuntime,
  root: string,
  changeDir: string,
): Promise<FinishInspection> => {
  const path = Path.join(changeDir, "finish.md");
  if (!(await runtime.fileSystem.pathExists(path))) return inspection([]);
  const read = await readContract(runtime, path, "finish");
  if (!read.artifact) return inspection([`history is ${read.reason ?? "unreadable"}`]);
  if (!await durableArtifact(runtime, root, path)) return inspection(["existing finish history is not committed exactly at HEAD"]);
  const records = read.artifact.body.workflow.records;
  if (records.at(-1)?.kind === "attempt") return inspection(["dangling Attempt must be reconciled before ordinary admission"]);
  const latest = read.artifact.body.workflow.finish?.at(-1);
  if (latest?.outcome?.delivery) return inspection([latest.outcome.result === "blocked" ? "verified delivery requires finalization-repair admission; do not deliver again" : "delivery is already completed; do not deliver again"]);
  const relative = relativePath(root, path);
  const current = await historyAt(runtime, root, text(await gitCurrentHead(runtime, root)), relative);
  const commits = await gitPathHistory(runtime, root, relative);
  if (!current || !successful(commits)) return inspection(["existing finish history provenance is unavailable"]);
  for (const revision of text(commits).split(/\r?\n/).filter(Boolean)) {
    const previous = await historyAt(runtime, root, revision, relative);
    if (!previous || previous.records.some((record) => current.records.find((item) => item.key === record.key)?.body !== record.body))
      return inspection(["immutable finish history was erased, rewritten or downgraded to legacy provenance"]);
  }
  return inspection([]);
};

const contains = async (runtime: PreconditionRuntime, root: string, base: string, head: string): Promise<boolean> =>
  successful(await gitIsAncestor(runtime, root, base, head));

const targetMatches = async (runtime: PreconditionRuntime, root: string, actual: string, recorded: string): Promise<boolean> => {
  if (actual === recorded) return true;
  if (!actual.startsWith("refs/heads/") || !recorded.startsWith("refs/remotes/")) return false;
  const name = actual.slice("refs/heads/".length);
  const remote = await gitCommand(runtime, ["config", `branch.${name}.remote`], root);
  const merge = await gitCommand(runtime, ["config", `branch.${name}.merge`], root);
  return successful(remote) && successful(merge) && recorded === `refs/remotes/${text(remote)}/${text(merge).replace(/^refs\/heads\//, "")}`;
};

const observeRequest = async (
  runtime: PreconditionRuntime, root: string, delivery: Extract<FinishDeliveryIdentity, { strategy: "pull-request" }>, sourceRef: string,
): Promise<{ readonly passed: boolean; readonly merged: boolean; readonly mergeCommit?: string }> => {
  let url: URL;
  try {
    url = new URL(delivery.url);
  } catch {
    return { passed: false, merged: false };
  }
  const match = delivery.provider === "github" ? /^(.*)\/pull\/([1-9][0-9]*)$/.exec(url.pathname) : /^(.*)\/-\/merge_requests\/([1-9][0-9]*)$/.exec(url.pathname);
  if (!match || url.username || url.password || url.search || url.hash || delivery.repository !== `${url.host}${match[1]}`)
    return { passed: false, merged: false };
  const origin = await gitCommand(runtime, ["remote", "get-url", "origin"], root);
  const canonicalOrigin = text(origin).replace(/\.git$/, "").replace(/^https?:\/\//, "").replace(/^git@([^:]+):/, "$1/").replace(/\/$/, "");
  if (!successful(origin) || canonicalOrigin !== delivery.repository) return { passed: false, merged: false };
  const result = delivery.provider === "github"
    ? await runtime.process.run("gh", ["pr", "view", delivery.url, "--json", "url,state,headRefOid,headRefName,baseRefName,mergeCommit"], root)
    : await runtime.process.run("glab", ["api", `projects/${encodeURIComponent(match[1]!.slice(1))}/merge_requests/${match[2]}`, "--hostname", url.host], root);
  if (!successful(result)) return { passed: false, merged: false };
  try {
    const data: Record<string, unknown> = JSON.parse(result.stdout);
    const github = delivery.provider === "github";
    const observedUrl = github ? data.url : data.web_url;
    const head = github ? data.headRefOid : data.sha;
    const source = github ? data.headRefName : data.source_branch;
    const target = github ? data.baseRefName : data.target_branch;
    const state = github ? data.state : data.state === "opened" ? "OPEN" : typeof data.state === "string" ? data.state.toUpperCase() : "";
    const merge = github && data.mergeCommit && typeof data.mergeCommit === "object" ? (data.mergeCommit as { oid?: string }).oid : data.merge_commit_sha;
    const passed = observedUrl === delivery.url && fullCommit(head) && sourceRef === `refs/heads/${source}` &&
      delivery.targetRef === `refs/heads/${target}` && (state === "OPEN" || state === "MERGED") &&
      await contains(runtime, root, delivery.head, head);
    return { passed, merged: state === "MERGED", ...(fullCommit(merge) ? { mergeCommit: merge } : {}) };
  } catch {
    return { passed: false, merged: false };
  }
};

export const inspectFinishRepair = async (
  runtime: PreconditionRuntime,
  root: string,
  changeDir: string,
  args: PreconditionArguments,
): Promise<FinishInspection> => {
  const problems: string[] = [];
  const path = relativePath(root, Path.join(changeDir, "finish.md"));
  const read = await readContract(runtime, Path.join(root, path), "finish");
  if (!read.artifact || !(await durableArtifact(runtime, root, Path.join(root, path))))
    return inspection(["repair requires a valid finish history committed exactly at HEAD"]);
  const all = read.artifact.body.workflow.finish ?? [];
  const original = all.find((record) => record.number === args.recoverFinish);
  const latest = all.at(-1);
  if (!original || original.strategy === "reconcile-delivery" || original.outcome?.result !== "blocked" || !original.outcome.delivery ||
      !latest?.outcome || latest.outcome.result !== "blocked" ||
      latest.number !== original.number && latest.recovery?.attempt !== original.number ||
      all.some((record) => record.number > original.number && record.strategy !== "reconcile-delivery"))
    return inspection(["repair must name the original blocked delivery and reconcile the latest paired failed repair; no dangling, unrelated, or completed attempt may be bypassed"]);
  if (await targetMatches(runtime, root, original.source.sourceRef, original.admission.targetRef))
    problems.push("original generation source was the delivery target or its configured local mapping");
  if (args.wholeChangeWaived || args.targetBranch !== original.admission.targetRef)
    problems.push("repair must reuse the recorded target and original waiver, not a new waiver");
  const head = text(await gitCurrentHead(runtime, root));
  const current = await historyAt(runtime, root, head, path);
  if (!current) return inspection(["current committed history cannot be read"]);
  const commits = await gitPathHistory(runtime, root, path);
  if (!successful(commits)) return inspection(["finish history commits cannot be read"]);
  const introductions = new Map<string, string>();
  for (const commit of text(commits).split(/\r?\n/).filter(Boolean).reverse()) {
    const history = await historyAt(runtime, root, commit, path);
    if (!history) return inspection([`committed finish history is invalid at ${commit}`]);
    for (const record of history.records) {
      if (current.records.find((item) => item.key === record.key)?.body !== record.body)
        problems.push(`immutable ${record.key} changed or disappeared after ${commit}`);
      if (!introductions.has(record.key)) introductions.set(record.key, commit);
    }
  }
  const attemptCommit = introductions.get(`attempt:${original.number}`);
  const outcomeCommit = introductions.get(`outcome:${original.number}`);
  if (!attemptCommit || !outcomeCommit) return inspection(["original delivery pair provenance is missing"]);
  const latestOutcomeCommit = introductions.get(`outcome:${latest.number}`);
  for (const record of all.filter((entry) => entry.recovery?.attempt === original.number)) {
    const previous = all.filter((entry) => entry.number < record.number && entry.recovery?.attempt === original.number).at(-1);
    if (record.recovery!.outcomeCommit !== outcomeCommit ||
        record.recovery!.previousRepairCommit !== (previous ? introductions.get(`outcome:${previous.number}`) : null))
      problems.push(`repair ${record.number} does not bind the original outcome and latest failed repair commit`);
  }
  for (const commit of [attemptCommit, outcomeCommit, latestOutcomeCommit]) {
    if (!commit || !fullCommit(commit)) { problems.push("finish pair introduction is unverifiable"); continue; }
    const files = await gitCommitFiles(runtime, root, commit);
    if (!successful(files) || text(files) !== path) problems.push(`finish intent/outcome ${commit} is not an artifact-only commit`);
  }
  const admission = original.admission;
  for (const revision of [admission.verifiedHead, admission.targetCommit, admission.reviewCommit]) {
    const resolved = await gitResolveCommit(runtime, root, revision);
    if (!successful(resolved) || text(resolved) !== revision) problems.push("recorded admission revision is missing or ambiguous");
  }
  if (text(await gitFirstParent(runtime, root, attemptCommit)) !== admission.verifiedHead)
    problems.push("original Attempt was not the first commit after its verified admission");
  const repository = await gitCommand(runtime, ["rev-parse", "--path-format=absolute", "--git-common-dir"], root);
  if (!successful(repository) || await runtime.fileSystem.realpath(text(repository)) !== original.source.repository)
    problems.push("repair repository does not match the original canonical Git repository");
  const historical = historicalAdmissionRuntime(runtime, { revision: admission.verifiedHead, repositoryRoot: root, sourceRoot: original.source.root });
  const historicalChange = Path.join(original.source.root, relativePath(root, changeDir));
  const tasks = await inspectTasks(historical, original.source.root, historicalChange);
  const reviews = await inspectReviews(historical, original.source.root, historicalChange, tasks, admission.targetRef, admission.targetCommit);
  const freshness = await inspectFreshness(historical, original.source.root, tasks, reviews, admission.materialWaiver !== null);
  if (!tasks.passed || !reviews.passed || !freshness.passed)
    problems.push(`historical admission failed: ${(tasks.output + reviews.output + freshness.output).trim()}`);
  const reviewCommit = await gitCommand(historical, ["log", "-1", "--format=%H", "HEAD", "--", `${relativePath(root, changeDir)}/review.md`], original.source.root);
  if (text(reviewCommit) !== admission.reviewCommit || reviews.review?.base !== admission.reviewBase || reviews.review.head !== admission.reviewHead)
    problems.push("recorded review artifact revision or range differs from original admission");
  const changePaths = await gitCommand(runtime, ["ls-tree", "-r", "--name-only", admission.verifiedHead, "--", relativePath(root, changeDir)], root);
  for (const file of text(changePaths).split(/\r?\n/).filter(Boolean).filter((file) => file !== path)) {
    const before = await gitBlobIdAt(runtime, root, admission.verifiedHead, file);
    const now = await gitBlobIdAt(runtime, root, head, file);
    if (!successful(before) || !successful(now) || text(before) !== text(now)) problems.push(`repair cannot change original task/intent/review evidence: ${file}`);
  }
  const formalPaths = text(changePaths).split(/\r?\n/).filter((file) =>
    file === `${relativePath(root, changeDir)}/proposal.md` || file === `${relativePath(root, changeDir)}/design.md` ||
    file.startsWith(`${relativePath(root, changeDir)}/requirements/`) && file.endsWith(".md"),
  );
  if (JSON.stringify([...formalPaths].sort()) !== JSON.stringify(admission.inputs.map((input) => input.path).sort()))
    problems.push("Admission identity must name every original approved synchronization input");
  for (const input of admission.inputs) {
    const before = await gitBlobIdAt(runtime, root, admission.verifiedHead, input.path);
    const now = await gitBlobIdAt(runtime, root, head, input.path);
    if (!successful(before) || !successful(now) || text(before) !== input.blob || text(now) !== input.blob)
      problems.push(`approved input identity changed: ${input.path}`);
  }
  const delivery = original.outcome.delivery;
  const effectHead = delivery.strategy === "pull-request" ? delivery.head : delivery.commit;
  const ownedSpecs = admission.inputs.flatMap((input) => {
    const capability = /^\.kepler\/changes\/[^/]+\/requirements\/([^/]+)\.md$/.exec(input.path)?.[1];
    return capability === undefined ? [] : [`.kepler/specs/${capability}.md`];
  });
  const postGate = await gitCommand(runtime, ["diff", "--name-only", admission.verifiedHead, effectHead], root);
  const changed = text(postGate).split(/\r?\n/).filter(Boolean);
  if (!successful(postGate) || changed.some((file) => file !== path && !ownedSpecs.includes(file)))
    problems.push("delivery includes an unadmitted post-gate mutation or premature route advancement");
  const synchronized = original.outcome.synchronization;
  if (JSON.stringify(changed.filter((file) => ownedSpecs.includes(file)).sort()) !== JSON.stringify([...synchronized.paths].sort()))
    problems.push("observed synchronization paths differ from admitted delivery");
  if (synchronized.commit) {
    const files = await gitCommitFiles(runtime, root, synchronized.commit);
    if (!successful(files) || JSON.stringify(text(files).split(/\r?\n/).filter(Boolean).sort()) !== JSON.stringify([...synchronized.paths].sort()) ||
        !await contains(runtime, root, attemptCommit, synchronized.commit) || !await contains(runtime, root, synchronized.commit, effectHead))
      problems.push("synchronization commit is missing, outside the Attempt, or changes unowned paths");
  }
  let survivingRef = original.source.sourceRef;
  if (delivery.strategy === "local-merge") {
    survivingRef = delivery.targetRef;
    if (!await targetMatches(runtime, root, delivery.targetRef, admission.targetRef) ||
        !await contains(runtime, root, attemptCommit, delivery.commit) || !await contains(runtime, root, delivery.commit, head))
      problems.push("recorded local merge is absent or does not preserve the admitted Attempt on its target");
  } else if (delivery.strategy === "pull-request") {
    const observed = await observeRequest(runtime, root, delivery, original.source.sourceRef);
    if (!observed.passed || !await contains(runtime, root, attemptCommit, delivery.head)) problems.push("request provider/repository/URL/head/base or reviewed-content provenance cannot be verified");
    if (original.route?.shipping === "merge" && !observed.merged) problems.push("request has not satisfied merge-required shipping qualification");
    if (observed.merged) {
      survivingRef = delivery.targetRef;
      if (!observed.mergeCommit || !await contains(runtime, root, attemptCommit, observed.mergeCommit) || !await contains(runtime, root, observed.mergeCommit, head))
        problems.push("merged request provenance is missing or rewritten; owner adjudication required");
    }
  } else {
    const worktree = await gitCommand(runtime, ["rev-parse", "--absolute-git-dir"], root);
    if (delivery.sourceRef !== original.source.sourceRef || text(worktree) !== delivery.worktree || delivery.worktree !== original.source.worktree ||
        !await contains(runtime, root, attemptCommit, delivery.commit) || !await contains(runtime, root, delivery.commit, head) || original.route && original.route.shipping !== "no-op")
      problems.push("no-op branch/worktree or explicit shipping condition changed");
  }
  const branch = await gitCommand(runtime, ["symbolic-ref", "--quiet", "HEAD"], root);
  if (!successful(branch) || text(branch) !== survivingRef) problems.push("repair is not on the recorded surviving branch/base");
  problems.push(...await inspectFinishRoute(runtime, root, changeDir, original));
  const remaining = latest.outcome.remaining;
  return inspection(problems, remaining);
};
