import { describe, expect, it } from "vitest";
import { createArtifactReader } from "../../packages/cli/src/workbench/artifact-reader.js";
import { validateArtifact } from "../../packages/cli/src/workbench/artifact-contracts.js";

const sha = "a".repeat(40);
const admission = {
  verifiedHead: sha, targetRef: "refs/heads/main", targetCommit: sha,
  reviewBase: sha, reviewHead: sha, reviewCommit: sha, materialWaiver: null, inputs: [],
};
const source = { repository: "/fixture/.git", root: "/fixture", sourceRef: "refs/heads/change", worktree: "/fixture/.git" };
const recovery = { attempt: 1, outcomeCommit: sha, previousRepairCommit: null };
const delivery = { strategy: "local-merge", targetRef: "refs/heads/main", commit: sha };
const remaining = [{ kind: "history", path: ".kepler/changes/demo/finish.md" }];
const attempt = (n: number, strategy = "local-merge", extra: string[] = []) => [
  `## Attempt ${n} — 2026-10-12`,
  "- Passed preconditions: recorded gates passed",
  "- Specification synchronization: planned none",
  `- Strategy: ${strategy}`,
  "- Intended workspace result: base retained",
  "- Route intent: none",
  `- Admission identity: ${JSON.stringify(admission)}`,
  `- Source identity: ${JSON.stringify(source)}`,
  "- Route identity: null",
  ...extra,
].join("\n");
const outcome = (n: number, result = "blocked") => [
  `## Outcome ${n} — 2026-10-12`,
  `- Result: ${result}`,
  '- Specification synchronization result: {"paths":[],"commit":null}',
  `- Delivery identity: ${JSON.stringify(delivery)}`,
  `- Remaining effects: ${JSON.stringify(result === "completed" ? [] : remaining)}`,
].join("\n");
const validate = async (body: string, strategy = "local-merge", status = "pending") => validateArtifact(
  await createArtifactReader({ readFile: () => [
    "---", "artifact: finish", "change: demo", `status: ${status}`, "created: 2026-10-12",
    "updated: 2026-10-12", `strategy: ${strategy}`, `result: ${status}`, "decision: accepted",
    "---", "# Finish History: Demo", body,
  ].join("\n") })(".kepler/changes/demo/finish.md"),
);
const repair = () => [
  attempt(1), outcome(1),
  attempt(2, "reconcile-delivery", [
    `- Recovery of: ${JSON.stringify(recovery)}`,
    `- Delivery identity: ${JSON.stringify(delivery)}`,
    `- Remaining effects: ${JSON.stringify(remaining)}`,
  ]),
].join("\n\n");

describe("finish recovery record contract", () => {
  it("projects complete original admission and a pending linked repair", async () => {
    const result = await validate(repair(), "reconcile-delivery");
    expect(result._tag).toBe("valid");
    if (result._tag !== "valid") return;
    expect(result.body.workflow.finish).toMatchObject([
      { number: 1, admission, route: null, outcome: { result: "blocked", delivery, remaining } },
      { number: 2, strategy: "reconcile-delivery", recovery, delivery, remaining },
    ]);
  });

  it.each([
    ["missing admission field", (body: string) => body.replace('"reviewCommit":"' + sha + '",', "")],
    ["unknown admission field", (body: string) => body.replace('"inputs":[]', '"inputs":[],"approved":true')],
    ["duplicate JSON key", (body: string) => body.replace('"verifiedHead":', '"verifiedHead":"' + sha + '","verifiedHead":')],
    ["escaped duplicate JSON key", (body: string) => body.replace('"verifiedHead":', '"verifiedHead":"' + sha + '","verified\\u0048ead":')],
    ["duplicate bullet", (body: string) => body + "\n- Admission identity: " + JSON.stringify(admission)],
    ["invalid full commit", (body: string) => body.replace('"verifiedHead":"' + sha + '"', '"verifiedHead":"HEAD"')],
    ["relative target", (body: string) => body.replace('"targetRef":"refs/heads/main"', '"targetRef":"main"')],
    ["duplicate input path", (body: string) => body.replace('"inputs":[]', '"inputs":[{"path":".kepler/changes/demo/design.md","blob":"' + sha + '"},{"path":".kepler/changes/demo/design.md","blob":"' + sha + '"}]')],
    ["unsafe effect", (body: string) => body.replace('.kepler/changes/demo/finish.md', '../src/app.ts')],
    ["unknown executor", (body: string) => body.replace("- Strategy: reconcile-delivery", "- Strategy: delivery-again")],
    ["missing delivery", (body: string) => body.replaceAll(JSON.stringify(delivery), "null")],
    ["wrong original", (body: string) => body.replace('"attempt":1', '"attempt":2')],
    ["missing recovery", (body: string) => body.replace(/\n- Recovery of: .*/, "")],
  ])("rejects explicit %s without legacy fallback", async (_name, mutate) => {
    expect((await validate(mutate(repair()), "reconcile-delivery"))._tag).toBe("invalid");
  });

  it("accepts ordinary complete provenance and rejects malformed explicit legacy outcomes", async () => {
    const complete = await validate(attempt(1) + "\n" + outcome(1, "completed"), "local-merge", "completed");
    expect(complete._tag).toBe("valid");
    const legacy = attempt(1).replace(/\n- (?:Admission identity|Source identity|Route identity): .*/g, "");
    expect((await validate(legacy + "\n" + outcome(1), "local-merge", "blocked"))._tag).toBe("invalid");
  });

  it("rejects repair after completed delivery and completion with remaining effects", async () => {
    expect((await validate(repair().replace(outcome(1), outcome(1, "completed")), "reconcile-delivery"))._tag).toBe("invalid");
    expect((await validate([attempt(1), outcome(1).replace("Result: blocked", "Result: completed")].join("\n"), "local-merge", "completed"))._tag).toBe("invalid");
  });

  it("retains old paired and pending histories without inventing recovery provenance", async () => {
    const legacy = attempt(1).replace(/\n- Admission identity: .*/, "").replace(/\n- Source identity: .*/, "").replace("\n- Route identity: null", "");
    const pending = await validate(legacy);
    const paired = await validate(legacy + "\n## Outcome 1 — 2026-10-12", "local-merge", "completed");
    expect(pending._tag).toBe("valid");
    expect(paired._tag).toBe("valid");
    if (paired._tag === "valid") expect(paired.body.workflow.finish ?? []).toHaveLength(0);
  });
});
