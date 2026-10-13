import { describe, expect, it } from "vitest"
import * as Fs from "node:fs"
import * as Path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"
import { validateArtifact } from "../../packages/cli/src/workbench/artifact-contracts.js"
import type { RecognizedArtifact } from "../../packages/cli/src/workbench/artifact-reader.js"
import { validateArtifactMetadataSchema } from "../../packages/cli/src/workbench/artifact-schemas.js"
import { validateTaskAdmission } from "../../packages/cli/src/workbench/task-admission.js"

const templatesDir = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "../../bundle/templates")
const repositoryDir = Path.resolve(templatesDir, "../..")

function readTemplate(name: string): string {
  return Fs.readFileSync(Path.join(templatesDir, name), "utf-8")
}

function readFrontmatter(template: string): string {
  const match = template.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) throw new Error("template frontmatter is missing")
  return match[1]
}

describe("split execution artifact templates", () => {
  it("distinguishes SHA-256 plan digests from Git provenance and preserves initialization history", () => {
    const instructions = readTemplate("plan.md").match(/<!--([\s\S]*?)-->/)?.[1] ?? "";

    expect(instructions).toContain("taskDefinitionDigest");
    expect(instructions).toContain("taskBreakdownDigest");
    expect(instructions).toContain("lowercase 64-hex SHA-256");
    expect(instructions).toContain("Git commits and blobs");
    expect(instructions).toContain("remain 40-hex");
    expect(instructions).toContain("Preserve the original `initialization.breakdown`");
    expect(instructions).toContain("checked against that historical plan");
  });

  it("gives every lifecycle producer disposable authoring instructions", () => {
    const lifecycleTemplates = [
      ["progress.md", "kepler-plan", ".kepler/changes/<change>/progress.md"],
      ["task-progress.md", "kepler-plan", ".kepler/changes/<change>/tasks/task-N/progress.md"],
      ["feedback.md", "kepler-code-feedback", ".kepler/changes/<change>/tasks/task-N/feedback.md"],
      ["review.md", "kepler-review", ".kepler/changes/<change>/review.md"],
      ["finish.md", "kepler-finish-work", ".kepler/changes/<change>/finish.md"],
    ]

    for (const [name, producer, instancePath] of lifecycleTemplates) {
      const template = readTemplate(name)
      const instructions = template.match(/<!--([\s\S]*?)-->/)?.[1]

      expect(instructions).toBeDefined()
      expect(template.startsWith("---\n")).toBe(true)
      expect(instructions).toContain(`Produced by: ${producer}`)
      expect(instructions).toContain(`Lives at: ${instancePath}`)
      expect(instructions).toMatch(/Delete this instruction block and every inline hint before finalizing\./)
    }
  })

  it("defines the root task index", () => {
    const template = readTemplate("progress.md")

    expect(template).toContain("artifact: progress")
    expect(template).toContain("tasks:")
    expect(template).toContain("title: \"<task title>\"")
    expect(template).toContain("progress: tasks/task-N/progress.md")
    expect(template).toContain("status: pending | in-progress | blocked | complete")
    expect(template).toContain("Root `status: complete` means all active implementation rows are done")
  })

  it("validates instantiated v2 plan task contracts and rejects missing Goal or dependency", () => {
    const template = readTemplate("plan.md")
    const metadata = parse(readFrontmatter(template).replace("<YYYY-MM-DD-change-title>", "2026-10-12-example").replace("<YYYY-MM-DD>", "2026-10-12").replace("<Name <email>>", "Test <test@example.com>").replace("<full 40-hex pre-scaffold Git commit>", "0123456789abcdef0123456789abcdef01234567").replace("<requester authority reference>", "approved request").replace("<64-hex SHA-256 task breakdown digest>", "a".repeat(64))) as Record<string, unknown>
    const makeTask = (omit?: "goal" | "dependency") => `### Task 1: Example\n\n${omit === "goal" ? "" : "- Goal: Deliver example.\n"}${omit === "dependency" ? "" : "- Depends on: none\n"}- Acceptance:\n  - Example behavior is verified.\n- Steps:\n  1. Red — observe the failing behavior.\n  2. Green — implement the smallest fix.\n  3. Refactor — preserve behavior and rerun tests.\n- Verify: bun --bun vitest run\n- Commit: feat: implement example\n`
    const artifact = (body: string): RecognizedArtifact => ({ _tag: "recognized", sourcePath: ".kepler/changes/2026-10-12-example/plan.md", metadata: { ...metadata, status: "approved", decision: "accepted", initialization: { version: 1, base: "0123456789abcdef0123456789abcdef01234567", authority: "approved request", breakdown: "a".repeat(64), taskIds: [1] } }, body: `# Plan: Example\n\n## Overview\n\n## Tasks\n\n${body}\n## Done when\n\nComplete.`, locations: { frontmatter: { startLine: 1, endLine: 10 }, metadata: { startLine: 2, endLine: 10 }, body: { startLine: 11, endLine: 30 } } })
    expect(metadata.execution).toEqual({ version: 2, mode: "dependencies" })
    expect(validateArtifact(artifact(makeTask()))._tag).toBe("valid")
    expect(validateArtifact(artifact(makeTask("goal")))._tag).toBe("invalid")
    expect(validateArtifact(artifact(makeTask("dependency")))._tag).toBe("invalid")
  })

  it("renders dependency-mode task skeletons with a complete v2 contract", () => {
    const template = readTemplate("plan.md")
    const tasks = template.split("## Tasks")[1]?.split("## Done when")[0] ?? ""
    const blocks = tasks.split(/^### Task [12]:/m).slice(1)
    expect(blocks).toHaveLength(2)
    for (const block of blocks) {
      const header = block.split(/^### Task /m)[0]
      expect(header).toMatch(/- Goal:/)
      expect(header).toMatch(/- Acceptance:/)
      expect(header).toMatch(/- Depends on:/)
      expect(header).toMatch(/- Steps:/)
      expect(header).toMatch(/- Verify:/)
      expect(header).toMatch(/- Commit:/)
      expect(header).toMatch(/Files: optional guidance/)
    }
  })

  it("parses the instantiated root template and validates omitted admission with the real schema", () => {
    const template = readTemplate("progress.md").replace("<YYYY-MM-DD-change-title>", "2026-10-12-example").replace("status: pending | in-progress | blocked | complete", "status: pending").replace("<YYYY-MM-DD>", "2026-10-12").replace("decision: accepted | rejected | skipped", "decision: accepted").replace("<Change Title>", "Example").replace("<task title>", "Example").replace("id: N", "id: 1").replace("Task N: <escaped display title>", "Task 1: Example").replace("tasks/task-N/progress.md", "tasks/task-1/progress.md")
    const metadata = parse(readFrontmatter(template)) as Record<string, unknown>
    const artifact = {
      _tag: "recognized" as const, sourcePath: "progress.md", metadata, body: "",
      locations: { frontmatter: { startLine: 1, endLine: 1 }, metadata: { startLine: 1, endLine: 1 }, body: { startLine: 1, endLine: 1 } },
    }
    expect((metadata.tasks as Record<string, unknown>[])[0]).not.toHaveProperty("admission")
    expect(validateArtifactMetadataSchema(artifact, "progress")).toEqual([])
    expect(validateArtifactMetadataSchema({ ...artifact, metadata: { ...metadata, tasks: [{ ...(metadata.tasks as Record<string, unknown>[])[0], admission: null }] } }, "progress")).not.toEqual([])
    expect(validateTaskAdmission(null)).toEqual({ kind: "invalid", reason: "task admission must be an object" })
  })

  it("provides a synchronized root task ledger skeleton", () => {
    const template = readTemplate("progress.md")

    expect(template).toContain("Root `status: complete` means all active implementation rows are done")
    expect(template).toContain("The frontmatter and table must match exactly")
    expect(template).toContain("| Task | Status | Progress |")
    expect(template).toContain("| Task N: <escaped display title> | pending | [details](tasks/task-N/progress.md) |")
    expect(template).toContain("one matching row per active task in numeric identity order")
  })

  it("guides every author-bearing template to configured Git identity", () => {
    for (const name of [
      "proposal.md",
      "requirements-change.md",
      "design.md",
      "plan.md",
      "requirements-spec.md",
      "glossary.md",
    ]) {
      const template = readTemplate(name)
      const instructions = Array.from(
        template.replaceAll("<!-- ... -->", "").matchAll(/<!--([\s\S]*?)-->/g),
        ([, body]) => body,
      ).join("\n")

      expect(instructions).not.toBe("")
      expect(template).toContain("author: <Name <email>>")
      expect(instructions).toMatch(
        /configured Git identity[\s\S]*git config user\.name[\s\S]*git config user\.email[\s\S]*Name <email>/i,
      )
      expect(instructions).toMatch(/If either\s+configured value is missing,\s+ask the user or stop with a blocker/i)
      expect(instructions).toMatch(/preserve its recorded author/i)
      expect(template).not.toMatch(/author: <name or agent>/i)
      expect(template).not.toMatch(/\b(?:name or agent|agent name|operating-system username)\b/i)
    }
  })

  it("defines the task-local progress artifact", () => {
    const template = readTemplate("task-progress.md")

    expect(template).toContain("# Task Progress: Task N — <exact unescaped plan task title>")
    expect(template).not.toContain("## Attempt N — <YYYY-MM-DD>")
    expect(template).not.toContain("- Outcome: done | blocked")
    expect(template).not.toContain("- Verified: `<command>` → <result>")
    expect(template).toMatch(/each new attempt.*exactly one terminal `- Outcome: done` or `- Outcome: blocked`/is)
    expect(template).toMatch(/append a new\s+attempt for corrections.*instead of adding another Outcome to historical attempts/is)
    expect(template).toMatch(/preserve.*historical unbulleted Outcome.*without rewriting/is)
  })

  it("defines the task-local feedback artifact", () => {
    const template = readTemplate("feedback.md")

    expect(template).toContain("# Code Feedback: Task N — <title>")
    expect(readFrontmatter(template)).toBe(
      [
        "artifact: feedback",
        "change: <YYYY-MM-DD-change-title>",
        "task: <N>",
        "created: <YYYY-MM-DD>",
        "status: open | resolved",
        "decision: accepted | rejected | skipped",
      ].join("\n"),
    )
    expect(template).toMatch(
      /## Pass N — <YYYY-MM-DD>[\s\S]*?^Base: <full commit identifier>$[\s\S]*?^Head: <full commit identifier>$[\s\S]*?^Verdict: approved \| changes-requested \| skipped$[\s\S]*?^### Blocking$[\s\S]*?^### Suggestions$/m,
    )
    expect(template.match(/^Base: .+$/gm)).toHaveLength(1)
    expect(template.match(/^Head: .+$/gm)).toHaveLength(1)
    expect(template.match(/^Verdict: .+$/gm)).toHaveLength(1)
    expect(template.match(/^### .+$/gm)).toEqual(["### Blocking", "### Suggestions"])
    expect(template).not.toContain("### Reviewed range")
  })

  it("defines the critique's terminal user decisions", () => {
    const template = readTemplate("critique.md")

    expect(template).toContain("verdict: approved | changes-requested | skipped")
    expect(template).toContain("decision: accepted | applied | rejected | skipped")
  })

  it("defines the whole-branch review artifact", () => {
    const template = readTemplate("review.md")

    expect(template).toContain("# Whole-branch Review: <Change Title>")
    expect(readFrontmatter(template)).toBe(
      [
        "artifact: review",
        "change: <YYYY-MM-DD-change-title>",
        "created: <YYYY-MM-DD>",
        "status: open | complete",
        "decision: accepted | rejected | skipped",
      ].join("\n"),
    )
    expect(template).toMatch(
      /## Pass N — <YYYY-MM-DD>[\s\S]*?^Base: <full merge-base commit identifier>$[\s\S]*?^Head: <full head commit identifier>$[\s\S]*?^Verdict: approved \| changes-requested \| skipped \| approved-remediation$[\s\S]*?^Scope: full$[\s\S]*?^Target: refs\/remotes\/<remote>\/<branch>$[\s\S]*?^### Blocking$[\s\S]*?^### Suggestions$/m,
    )
    expect(template.match(/^Base: .+$/gm)).toHaveLength(1)
    expect(template.match(/^Head: .+$/gm)).toHaveLength(1)
    expect(template.match(/^Verdict: .+$/gm)).toHaveLength(1)
    expect(template.match(/^### .+$/gm)).toEqual(["### Blocking", "### Suggestions"])
    expect(template).not.toContain("### Reviewed range")
    expect(template).not.toContain("<scope reviewed>")
  })

  it("defines one append-only transition for legacy review histories", () => {
    const templates = [
      ["feedback.md", "feedback-<k>.md"],
      ["review.md", "review-<k>.md"],
    ]

    for (const [name, numberedFile] of templates) {
      const template = readTemplate(name)

      expect(template).toMatch(/fresh files use identity and lifecycle-only frontmatter/i)
      expect(template).toMatch(/validate the legacy-global history/i)
      expect(template).toMatch(/preserve every existing pass body byte-for-byte/i)
      expect(template).toMatch(/remove exactly\s+the\s+global `base`, `head`, and `verdict` fields/is)
      expect(template).toMatch(
        /append the next complete pass-local record at\s+the\s+physical end in the same mutation/is,
      )
      expect(template).toMatch(/never copy global provenance into historical passes/i)
      expect(template).toMatch(/never retain\s+global provenance beside an explicit suffix/is)
      expect(template).toMatch(/already transitioned/i)
      expect(template).toMatch(/fail closed for partial globals/i)
      expect(template.toLowerCase()).toContain(`never create ${numberedFile}`)
      expect(template).not.toContain("### Reviewed range")
    }
  })

  it("defines finish history at first-attempt creation", () => {
    const template = readTemplate("finish.md")

    expect(template).toContain("## Attempt N — <YYYY-MM-DD>")
    expect(template).toContain("strategy: local-merge | pull-request | no-op")
    expect(template).toContain("result: completed | blocked | pending")
    expect(template).toContain("decision: accepted | rejected | skipped")
  })

  it("documents the split artifact owners and instance paths", () => {
    const template = readTemplate("README.md")

    expect(template).toContain("`task-progress.md`")
    expect(template).toContain("`feedback.md`")
    expect(template).toContain("`finish.md`")
    expect(template).toContain("tasks/task-N/progress.md")
    expect(template).toContain("tasks/task-N/feedback.md")
  })

  it("keeps bundled templates as the only repository template source", () => {
    const trackedMirror = execFileSync("git", ["ls-files", ".kepler/templates/**"], {
      cwd: repositoryDir,
      encoding: "utf-8",
    })

    expect(trackedMirror).toBe("")
    expect(Fs.existsSync(Path.join(templatesDir, "progress.md"))).toBe(true)
    expect(Fs.existsSync(Path.join(templatesDir, "task-progress.md"))).toBe(true)
    expect(Fs.existsSync(Path.join(templatesDir, "feedback.md"))).toBe(true)
    expect(Fs.existsSync(Path.join(templatesDir, "review.md"))).toBe(true)
    expect(Fs.existsSync(Path.join(templatesDir, "finish.md"))).toBe(true)
  })
})
