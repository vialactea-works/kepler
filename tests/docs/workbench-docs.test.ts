import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const documents = ["README.md", "docs/modes.md", "docs/skills.md", "docs/sdd-framework.md"];
const content = Object.fromEntries(
  documents.map((document) => [document, readFileSync(resolve(root, document), "utf8")]),
);
const specifications = [
  ".hamilton/specs/artifact-templates.md",
  ".hamilton/specs/review.md",
  ".hamilton/specs/workbench.md",
];
const specificationContent = Object.fromEntries(
  specifications.map((document) => [document, readFileSync(resolve(root, document), "utf8")]),
);
const allDocumentation = Object.values(content).join("\n");
const contractDocuments = [
  ...specifications,
  "docs/sdd-framework.md",
  "docs/skills.md",
] as const;
const contractContent = Object.fromEntries(
  contractDocuments.map((document) => [
    document,
    document in specificationContent
      ? specificationContent[document]
      : content[document],
  ]),
);

const inventoryDocuments = ["README.md", "docs/modes.md", "docs/skills.md"];

describe("workbench documentation", () => {
  it("distinguishes dependency readiness, admission, implementation completion, and full gating", () => {
    expect(content["docs/skills.md"]).toMatch(/readiness.*admission.*implementation done.*fully gated/is);
  });

  it("states lifetime scope-expansion bounds per task", () => {
    const skills = content["docs/skills.md"];

    expect(skills).toMatch(/Each task may reserve at most two lifetime expansions, each naming at most four concrete paths/i);
    expect(skills).not.toMatch(/A plan may reserve at most two lifetime expansions/i);
  });

  it("gives readers mode-qualified dependency execution boundaries", () => {
    const readerDocs = [
      content["README.md"],
      content["docs/modes.md"],
      content["docs/sdd-framework.md"],
      readFileSync(resolve(root, "docs/change-state-machine.md"), "utf8"),
    ].join("\n");

    expect(readerDocs).toMatch(/(?:version-2|version 2|v2).*dependenc.*unversioned.*(?:version-1|version 1|v1).*serial/is);
    expect(readerDocs).toMatch(/unknown.*(?:mode|version).*fail(?:s)? closed/is);
    expect(readerDocs).toMatch(/two.*lifetime.*(?:reservation|expansion).*four.*concrete paths/is);
    expect(readerDocs).toMatch(/before.*edit.*(?:committed|reservation).*not.*(?:reset|refund)/is);
    expect(readerDocs).toMatch(/descendants.*held.*independent.*ready.*(?:may|can).*proceed/is);
    expect(readerDocs).toMatch(/(?:serialized coordinator|coordinator serializes).*integrat.*Verify.*root (?:publication|state|result)/is);
    expect(readerDocs).toMatch(/original Base.*(?:retry|rebind|cache)/is);
    expect(readerDocs).toMatch(/whole.branch review.*every active task.*fully gated/is);
  });

  it("records native dependency outcomes separately from static controls", () => {
    const nativeEvidence = readFileSync(resolve(root, "tests/skills/dependency-execution-scenarios.md"), "utf8");

    expect(nativeEvidence).toMatch(/three native outcomes/i);
    expect(nativeEvidence).toMatch(/\| Case \/ Goal binding \| Native session and runs \|/);
    expect(nativeEvidence).toMatch(/coordinator-observations\.json/);
    expect(nativeEvidence).toMatch(/prepared manifest.*historical.*pre-admission/is);
    expect(nativeEvidence).toMatch(/observed `implementation-done`/i);
    expect(nativeEvidence).toMatch(/implementation-blocked/i);
    expect(nativeEvidence).toMatch(/scope expansion lifetime limit exceeded/i);
    expect(nativeEvidence).toMatch(/not.*feedback clearance|feedback clearance.*not performed/is);
    expect(nativeEvidence).toMatch(/17f74ff795025212de719246774a84e49abae85673624853e003723daa48e6b8/);
    expect(nativeEvidence).toContain("50493ee4a6de0d58f7c5cabd9cec7e82ef7c73dc");
    expect(nativeEvidence).toContain("a13fcca8d91e19c9bcfe6f701dd9218f3b78e4b27ea8716545396f17a61172e2");
    expect(nativeEvidence).toContain("9266ae8b3acee8ef61539c8f8967ef01d0fc8e22ec998e9d8d874c7936b37394");
    expect(nativeEvidence).toMatch(/pre-replay.*not-yet-run/is);
    expect(nativeEvidence).toContain("Git public SSH signatures were verified separately");
    expect(nativeEvidence).toMatch(/not actor PI\s+identity/i);
    expect(nativeEvidence).toMatch(/bun tooling\/verify\.ts && bun --bun vitest run && bun --bun tsc --noEmit/);
    expect(nativeEvidence).toMatch(/kepler workbench task-state --reserve/);
    expect(nativeEvidence).toMatch(/static.*not native proof/i);
  });

  it("describes setup without installing helper scripts", () => {
    expect(content["README.md"]).toMatch(/kepler setup.*templates.*guidelines/s);
    expect(content["README.md"]).toMatch(/kepler workbench/);
    expect(allDocumentation).not.toMatch(/~\/\.kepler\/scripts\//);
    expect(allDocumentation).not.toMatch(
      /kepler-(artifact-contracts|change-context|diff-package|isolate|precondition-check|prototype-branch)\.sh/,
    );
  });

  it("names the supported workbench operations and lint scope", () => {
    const help = spawnSync("bun", ["packages/cli/src/cli/main.ts", "workbench", "--help"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(help.status, help.stdout + help.stderr).toBe(0);
    const subcommands = [...help.stdout.matchAll(/^ {2}([a-z][a-z-]*) /gm)].map((match) => match[1]);
    expect(subcommands).toContain("task-state");
    for (const document of inventoryDocuments) {
      for (const subcommand of subcommands) {
        expect(content[document], document).toMatch(new RegExp(`kepler workbench[^\\n]*${subcommand}`));
      }
      for (const operation of ["--admit", "--reserve", "--publish"]) {
        expect(content[document], document).toContain(operation);
      }
    }
    expect(allDocumentation).toMatch(/kepler workbench lint --file <file>/);
    expect(allDocumentation).toMatch(/kepler workbench lint --change-dir <dir>/);
    expect(allDocumentation).toMatch(/exactly one/);
    expect(allDocumentation).toMatch(/recurs/);
    expect(allDocumentation).toMatch(/skipp/);
    expect(allDocumentation).toMatch(/warning/);
    expect(allDocumentation).toMatch(/fail.?closed/);
  });

  it("documents version and legacy-data migration without claiming a CLI purge command", () => {
    expect(allDocumentation).toMatch(/CLI and (?:the )?(?:agent-loaded )?skills.*together/i);
    expect(allDocumentation).toMatch(/run `?kepler setup`?/i);
    expect(allDocumentation).toMatch(/(?:stale helper files.*(?:not|no longer).*delet|(?:not|does not).*delet.*stale helper files)/i);
    expect(allDocumentation).toMatch(/legacy `~\/.hamilton\/`.*copy.*source.*unchanged/is);
    expect(allDocumentation).toMatch(/\.hamilton\/.*\.kepler\/.*without merging/is);
    expect(allDocumentation).toMatch(/bun run purge.*preserves.*global data/is);
    expect(allDocumentation).not.toMatch(/kepler purge/);
  });

  it("documents artifact attribution and authoring-boundary lint in the SDD framework", () => {
    const framework = content["docs/sdd-framework.md"];
    expect(framework).toMatch(/newly created.*author/is);
    expect(framework).toMatch(/git config user\.name.*git config user\.email.*Name <email>/is);
    expect(framework).toMatch(/either.*configured value.*missing.*(?:ask|stop).*blocker.*(?:agent|username)/is);
    expect(framework).toMatch(/edit(?:ing)? an existing.*preserv(?:e|es).*recorded author/is);
    expect(framework).toMatch(/kepler workbench lint --change-dir <change-dir>/);
    expect(framework).toMatch(/kepler workbench lint --file <file>/);
    expect(framework).toMatch(/(?:after|post)[- ](?:the )?mutation.*(?:finding|warning|error).*before (?:handoff|commit)/is);
    expect(framework).toMatch(/unrelated.*(?:outside|not).*scope/is);
    expect(framework).toMatch(/pending task log.*(?:no|without).*attempt/is);
    expect(framework).toMatch(/lint.*(?:not|does not).*semantic gates/is);
  });

  it.each(["docs/sdd-framework.md", "docs/skills.md"])(
    "documents proportionate domain and architecture design coverage in %s", (document) => {
      const domain = content[document].split("## Domain language and capability scope\n")[1].split("\n## ")[0].replace(/\s+/g, " ");
      expect(domain).toMatch(/design.*domain model.*architecture/i);
      expect(domain).toMatch(/packages.*ports and adapters.*code attribution/i);
      expect(domain).toMatch(/existing.*proposed.*removed/i);
      expect(domain).toMatch(/seven.*headings.*optional/i);
      expect(domain).toMatch(/historical lint-valid.*not.*new.*sections/i);
      expect(domain).toMatch(/semantic.*(?:not|rather than).*schema/i);
      expect(domain).toMatch(/canonical.*Overview.*Contract.*Behavior.*Invariants.*Decisions/i);
    },
  );

  it("provides fictional multi-context and small-change examples without rewriting history", () => {
    const examples = content["docs/sdd-framework.md"].split("### Design examples\n")[1]?.split("\n## ")[0] ?? "";
    expect(examples).toContain("fictional");
    expect(examples).toContain("#### Multi-context change");
    expect(examples).toContain("#### Small change with intact boundaries");
    expect(examples).toContain("OrderStore");
    expect(examples).toMatch(/created.*modified.*removed/s);
    expect(examples).toMatch(/Order.*Ordering.*Order.*Billing/s);
    expect(examples).toMatch(/proposed.*cancelOrder/s);
    expect(examples).toMatch(/no glossary.*README/s);
    expect(examples).toMatch(/no.*(?:new|changed).*ports.*events/s);
  });

  it("summarizes architectural design ownership in the template index and README", () => {
    const templates = readFileSync(resolve(root, "bundle/templates/README.md"), "utf8");
    expect(templates).toMatch(/`design\.md`.*Domain model and architectural realization/);
    expect(templates).toMatch(/seven.*headings.*optional/is);
    expect(content["README.md"]).toMatch(/design.*package.*ports.*adapters.*code attribution/is);
  });

  it.each(contractDocuments)(
    "defines review history modes and evidence authority independently in %s",
    (document) => {
      const value = contractContent[document];
      expect(value).toMatch(/legacy-global/);
      expect(value).toMatch(/transitioned/);
      expect(value).toMatch(/modern/);
      expect(value).toMatch(
        /only fully evidenced feedback and review passes carry[^.\n]*Base[^.\n]*Head[^.\n]*Verdict/i,
      );
      expect(value).toMatch(
        /structural\s+legacy\s+records\s+are\s+provenance-free,\s*cannot\s+supply\s+a\s+verdict,\s*and\s+remain\s+distinct\s+from\s+the\s+authoritative\s+latest\s+evidenced\s+record/i,
      );
      expect(value).toMatch(/physical(?:ly)? latest.*evidenced.*(?:pass|record).*authoritative|govern/i);
      expect(value).not.toMatch(/\b(?:every|each) pass\b[^.\n]*(?:Base|Head|Verdict)/i);
    },
  );

  it.each(contractDocuments)(
    "documents the atomic first append and strict suffix independently in %s",
    (document) => {
      const value = contractContent[document];
      expect(value).toMatch(/first modern append/i);
      expect(value).toMatch(/remove(?:s|d)? exactly the global provenance/i);
      expect(value).toMatch(/preserv(?:e|es|ing).*pass bod(?:y|ies).*byte-for-byte/i);
      expect(value).toMatch(/later (?:appends?|pass(?:es)?).*pass-local/i);
      expect(value).toMatch(/malformed.*transition.*fail(?:s|ing)? closed/i);
    },
  );

  it.each(contractDocuments)(
    "keeps review evidence append-only and value-typed independently in %s",
    (document) => {
      const value = contractContent[document];
      expect(value).toMatch(/append-only.*(?:file|history)/is);
      expect(value).toMatch(
        /(?:`)?Base(?:`)?\s+and\s+(?:`)?Head(?:`)?\s+contain full commit identifiers/i,
      );
      expect(value).toMatch(
        /(?:`)?Verdict(?:`)?\s+contains (?:(?:an|the) )?allowed verdict enum value/i,
      );
      expect(value).not.toMatch(
        /full commit identifiers?[^.\n]*(?:,\s*and\s+|and\s+)`?Verdict:?`?/i,
      );
    },
  );
});
