import { execa } from "execa";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = Path.resolve(import.meta.dirname, "../..");
const archiveDigestScript = Path.join(repositoryRoot, "scripts", "archive-digest.ts");
const temporaryRoots: string[] = [];

function createRoot(): string {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), "kepler-archive-digest-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    Fs.rmSync(root, { recursive: true, force: true });
    expect(Fs.existsSync(root)).toBe(false);
  }
});

describe("archive digest command", () => {
  it("hashes the actual bytes of a path containing spaces", async () => {
    const root = createRoot();
    const archive = Path.join(root, "kepler archive.tar.gz");
    Fs.writeFileSync(archive, "Kepler archive bytes with spaces\n");

    const result = await execa("bun", ["run", archiveDigestScript, archive], { timeout: 30_000 });

    expect(result.stdout).toBe("7a6d21c91d87e0673c3ff6dcf522eafac56d6de64b0afab4694be8905838b24e");
    expect(result.stderr).toBe("");
  });

  it("hashes an empty regular file", async () => {
    const root = createRoot();
    const archive = Path.join(root, "empty.tar.gz");
    Fs.writeFileSync(archive, "");

    const result = await execa("bun", ["run", archiveDigestScript, archive], {
      stripFinalNewline: false,
      timeout: 30_000,
    });

    expect(result.stdout).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n");
    expect(result.stderr).toBe("");
  });

  it("requires exactly one archive argument", async () => {
    const noArgument = await execa("bun", ["run", archiveDigestScript], {
      reject: false,
      stripFinalNewline: false,
      timeout: 30_000,
    });
    const extraArgument = await execa("bun", ["run", archiveDigestScript, "archive.tar.gz", "extra"], {
      reject: false,
      stripFinalNewline: false,
      timeout: 30_000,
    });
    const usage = "Usage: bun scripts/archive-digest.ts <archive>\n";

    expect(noArgument.exitCode).toBe(2);
    expect(noArgument.stdout).toBe("");
    expect(noArgument.stderr).toBe(usage);
    expect(extraArgument.exitCode).toBe(2);
    expect(extraArgument.stdout).toBe("");
    expect(extraArgument.stderr).toBe(usage);
  });

  it("rejects directories and missing archive inputs", async () => {
    const root = createRoot();
    const directory = await execa("bun", ["run", archiveDigestScript, root], {
      reject: false,
      timeout: 30_000,
    });
    const missing = await execa("bun", ["run", archiveDigestScript, Path.join(root, "missing.tar.gz")], {
      reject: false,
      timeout: 30_000,
    });

    expect(directory.exitCode).toBe(1);
    expect(directory.stdout).toBe("");
    expect(directory.stderr).toContain("regular file");
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toContain("Could not hash archive");
  });

  it("rejects symlinks without changing the link or target", async () => {
    const root = createRoot();
    const target = Path.join(root, "archive.tar.gz");
    const symlink = Path.join(root, "archive-link.tar.gz");
    const bytes = "original archive bytes\n";
    Fs.writeFileSync(target, bytes);
    Fs.symlinkSync(target, symlink);

    const result = await execa("bun", ["run", archiveDigestScript, symlink], {
      reject: false,
      stripFinalNewline: false,
      timeout: 30_000,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`Archive digest input must be an existing regular file: ${symlink}\n`);
    expect(Fs.lstatSync(symlink).isSymbolicLink()).toBe(true);
    expect(Fs.readlinkSync(symlink)).toBe(target);
    expect(Fs.readFileSync(target, "utf8")).toBe(bytes);
  });
});
