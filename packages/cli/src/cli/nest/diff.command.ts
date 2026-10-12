import { CommandRunner, Option, SubCommand } from "nest-commander";
import {
  DiffService,
  type DiffArguments,
} from "../../workbench/diff.js";
import { ResultReporter } from "./result-reporter.js";

@SubCommand({
  name: "diff",
  description: "Record checkpoints and package review diffs",
})
export class DiffCommand extends CommandRunner {
  constructor(
    private readonly diffService: DiffService,
    private readonly reporter: ResultReporter,
  ) {
    super();
  }

  @Option({ flags: "--record", description: "Record a task checkpoint" })
  parseRecord(): boolean {
    return true;
  }

  @Option({
    flags: "--whole-change",
    description: "Package the complete change diff",
  })
  parseWholeChange(): boolean {
    return true;
  }

  @Option({
    flags: "--base <commit>",
    description: "Select an explicit diff base",
  })
  parseBase(base: string): string {
    return base;
  }

  @Option({
    flags: "--change-dir <directory>",
    name: "changeDir",
    description: "Select the change directory",
  })
  parseChangeDir(directory: string): string {
    return directory;
  }

  @Option({
    flags: "--target-branch <reference>",
    name: "targetBranch",
    description: "Select the whole-change review target branch",
  })
  parseTargetBranch(reference: string): string {
    return reference;
  }

  @Option({ flags: "--task <number>", description: "Select a task number" })
  parseTask(task: string): string {
    return task;
  }

  @Option({
    flags: "--out <file>",
    description: "Write the packaged diff to a file",
  })
  parseOut(file: string): string {
    return file;
  }

  async run(
    _passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    const record = options?.record === true;
    const wholeChange = options?.wholeChange === true;
    const base = typeof options?.base === "string" ? options.base : undefined;
    const changeDir =
      typeof options?.changeDir === "string" ? options.changeDir : undefined;
    const targetBranch =
      typeof options?.targetBranch === "string" ? options.targetBranch : undefined;
    const task = typeof options?.task === "string" ? options.task : undefined;
    const out = typeof options?.out === "string" ? options.out : undefined;

    if (record) {
      if (
        wholeChange ||
        base !== undefined ||
        targetBranch !== undefined ||
        task === undefined ||
        out !== undefined
      ) {
        this.reportUsageError(
          "--record requires --task and cannot be combined with --base, --whole-change, or --out",
        );
        return;
      }
      await this.execute({
        mode: "record",
        task,
        ...(changeDir === undefined ? {} : { changeDir }),
      });
      return;
    }

    if (wholeChange) {
      if (base !== undefined || changeDir !== undefined || task !== undefined) {
        this.reportUsageError(
          "--whole-change cannot be combined with --base, --change-dir, or --task",
        );
        return;
      }
      if (targetBranch === undefined) {
        this.reportUsageError("--whole-change requires --target-branch");
        return;
      }
      await this.execute({
        mode: "whole-change",
        targetBranch,
        ...(out === undefined ? {} : { out }),
      });
      return;
    }

    if (base !== undefined) {
      if (targetBranch !== undefined) {
        this.reportUsageError("--target-branch is only valid with --whole-change");
        return;
      }
      if (task !== undefined) {
        this.reportUsageError("--task is meaningless with --base");
        return;
      }
      await this.execute({
        mode: "base",
        base,
        ...(changeDir === undefined ? {} : { changeDir }),
        ...(out === undefined ? {} : { out }),
      });
      return;
    }

    if (targetBranch !== undefined) {
      this.reportUsageError("--target-branch is only valid with --whole-change");
      return;
    }

    if (task === undefined) {
      this.reportUsageError("--task is required when --base is not given");
      return;
    }

    await this.execute({
      mode: "task",
      task,
      ...(changeDir === undefined ? {} : { changeDir }),
      ...(out === undefined ? {} : { out }),
    });
  }

  private async execute(args: DiffArguments): Promise<void> {
    const result = await this.diffService.execute(args);
    this.reporter.report({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  }

  private reportUsageError(message: string): void {
    this.reporter.report({
      stdout: "",
      stderr: `error: ${message}\n`,
      exitCode: 2,
    });
  }
}
