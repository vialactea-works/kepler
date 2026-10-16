import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { marked } from "marked";

const root = resolve(import.meta.dirname, "../..");
const reference = join(root, "docs/workflow_v2");
const construction = ["README", "concepts", "lifecycle", "preparation", "task-cycle", "branch-review", "finish", "gates", "artifacts", "support", "maintenance"];
const inception = ["README", "concepts", "lifecycle", "charting", "ticket-cycle", "investigations", "domain-modeling", "route", "handoff", "gates", "artifacts", "maintenance"];
const read = (path: string): string => readFileSync(join(reference, path), "utf8");
const files = (): readonly string[] => readdirSync(reference, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => join(entry.parentPath, entry.name));
const slug = (heading: string): string => heading.toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, "").replace(/ /g, "-");

const operationPages = ["charting", "ticket-cycle", "investigations", "domain-modeling", "route", "handoff"];

describe("workflow phase reference", () => {
  it("indexes inception and construction without adding SDD step numbers", () => {
    expect(read("README.md")).toContain("phase_inception/README.md");
    expect(read("README.md")).toContain("phase_construction/README.md");
    for (const name of construction) {
      expect(existsSync(join(reference, `phase_construction/${name}.md`)), name).toBe(true);
      if (name !== "README") expect(existsSync(join(reference, `${name}.md`)), name).toBe(false);
    }
    for (const name of inception) expect(existsSync(join(reference, `phase_inception/${name}.md`)), name).toBe(true);
    expect(read("phase_construction/lifecycle.md")).toContain('I["0 · init"]');
    expect(read("phase_construction/lifecycle.md")).toContain('W["6 · finish-work"]');
    expect(read("phase_inception/README.md")).toMatch(/does not add.*seven.*steps/i);
  });

  it("keeps local links and section targets reachable in both phases", () => {
    const entryPoints = ["README.md", "CONTRIBUTING.md", "docs/skills.md", "docs/sdd-framework.md"].map((path) => join(root, path));
    for (const file of [...files(), ...entryPoints]) {
      const source = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]+`/g, "");
      for (const match of source.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
        const href = match[1] ?? "";
        if (/^[a-z]+:/i.test(href)) continue;
        const [path, anchor] = href.split("#");
        const target = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
        expect(existsSync(target), `${file}: ${href}`).toBe(true);
        if (anchor) {
          const headings = [...readFileSync(target, "utf8").matchAll(/^#{1,6} (.+)$/gm)].map((heading) => slug(heading[1] ?? ""));
          expect(headings, `${file}: ${href}`).toContain(decodeURIComponent(anchor));
        }
      }
    }
  });

  it("renders each reference page with headings, tables, and closed code fences", () => {
    for (const file of files()) {
      const source = readFileSync(file, "utf8");
      const tokens = marked.lexer(source);
      expect(tokens.filter((token) => token.type === "heading" && token.depth === 1), file).toHaveLength(1);
      expect(tokens.some((token) => token.type === "table"), file).toBe(true);
      expect([...source.matchAll(/^```/gm)].length % 2, file).toBe(0);
      expect(marked.parse(source), file).toContain("<table>");
    }
  });

  it.each(operationPages)("defines states, operation contracts, and gate references for %s", (name) => {
    const source = read(`phase_inception/${name}.md`);
    expect(source).toMatch(/###? States/);
    expect(source).toMatch(/###? Transitions/);
    expect(source).toContain("| State | Responsibility | Input evidence | Output or artifact | State contract |");
    expect(source).toContain("| ID | From → to | Actor and operation | Input → output and artifacts | Gates and contract |");
    const diagrams = [...source.matchAll(/```mermaid\n([\s\S]*?)```/g)];
    expect(diagrams.length).toBeGreaterThan(0);
    for (const diagram of diagrams) {
      for (const edge of (diagram[1] ?? "").matchAll(/-->\|"([A-Z]+[0-9]+) · ([^"]+)"\|/g)) {
        expect(source).toContain(`| ${edge[1]} |`);
        expect(edge[2]).not.toMatch(/\bif\b|\bunless\b|\bonly when\b|\bpasses?\b|\bfailed?\b/i);
      }
    }
    expect(source).toMatch(/\[WG[0-9]+\]\(gates\.md#/);
  });

  it.each(["lifecycle", ...operationPages])("matches every %s diagram edge to its transition and state contracts", (name) => {
    const source = read(`phase_inception/${name}.md`);
    const diagrams = [...source.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((match) => match[1]).join("\n");
    const states = [...source.matchAll(/^\| ([A-Z]+[0-9]+) · /gm)].map((match) => match[1]);
    const edges = [...diagrams.matchAll(/^\s+([A-Z]+[0-9]+)(?:\["[^"]+"\])? -->\|"([A-Z]+[0-9]+) · [^"]+"\| ([A-Z]+[0-9]+)/gm)];
    const rows = [...source.matchAll(/^\| ([A-Z]+[0-9]+) \| ([A-Z]+[0-9]+) → ([A-Z]+[0-9]+) \|/gm)];
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.map((edge) => `${edge[2]}:${edge[1]}:${edge[3]}`).sort()).toEqual(rows.map((row) => `${row[1]}:${row[2]}:${row[3]}`).sort());
    for (const edge of edges) {
      expect(states).toContain(edge[1]);
      expect(states).toContain(edge[3]);
    }
  });

  it("preserves ticket authorization and returned-research boundaries", () => {
    const source = read("phase_inception/ticket-cycle.md");
    expect(source).toMatch(/orientation.*does not authorize/is);
    expect(source).toMatch(/fixed authorization set/i);
    expect(source).toMatch(/file order/i);
    expect(source).toMatch(/skip.*without substitution/i);
    expect(source).toMatch(/newly.*unblocked.*(?:do not|does not|cannot).*set/is);
    expect(source).toMatch(/prior authorization/i);
    expect(source).toMatch(/no automatic.*(?:expiry|expiration)/i);
  });

  it("separates planning answers, canonical language, and construction authority", () => {
    const route = read("phase_inception/route.md");
    for (const section of ["Point of departure", "Destination", "Path chosen", "Shipping rules", "Units"]) expect(route).toContain(section);
    expect(route).toMatch(/glossary.*before.*route/is);
    expect(route).toMatch(/contradiction.*map open/is);
    const handoff = read("phase_inception/handoff.md");
    expect(handoff).toMatch(/route unit is not.*task/i);
    expect(handoff).toMatch(/not.*distributed lock/i);
    expect(handoff).toContain("request-open");
    expect(handoff).toMatch(/formal.*approval/i);
    expect(read("phase_inception/artifacts.md")).toMatch(/working glossary.*not.*recognized/i);
    expect(read("phase_inception/maintenance.md")).toContain("closed");
  });
});
