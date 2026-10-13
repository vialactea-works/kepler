import { CommandRunner, Option, SubCommand } from "nest-commander";
import { TaskStateService, type TaskStateArguments } from "../../workbench/task-state.js";
import { ResultReporter } from "./result-reporter.js";

@SubCommand({ name: "task-state", description: "Guarded admission, prerequisite reservations, and integrated publication" })
export class TaskStateCommand extends CommandRunner {
  constructor(private readonly service: TaskStateService, private readonly reporter: ResultReporter) { super(); }

  @Option({ flags: "--admit", description: "Admit an eligible task into its isolated lane" }) admit(): boolean { return true; }
  @Option({ flags: "--retry", description: "Rebind an eligible recovery without resetting original Base" }) retry(): boolean { return true; }
  @Option({ flags: "--reserve", description: "Commit a finite before-edit prerequisite reservation" }) reserve(): boolean { return true; }
  @Option({ flags: "--publish", description: "Integrate and verify an admitted terminal implementation" }) publish(): boolean { return true; }
  @Option({ flags: "--task <number>" }) task(value: string): string { return value; }
  @Option({ flags: "--change-dir <directory>", name: "changeDir" }) changeDir(value: string): string { return value; }
  @Option({ flags: "--expected-head <commit>", name: "expectedHead" }) expectedHead(value: string): string { return value; }
  @Option({ flags: "--worker <identity>" }) worker(value: string): string { return value; }
  @Option({ flags: "--worktree <directory>" }) worktree(value: string): string { return value; }
  @Option({ flags: "--target-branch <ref>", name: "targetBranch" }) targetBranch(value: string): string { return value; }
  @Option({ flags: "--task-head <commit>", name: "taskHead" }) taskHead(value: string): string { return value; }
  @Option({ flags: "--reservation <json>" }) reservation(value: string): string { return value; }
  @Option({ flags: "--verify <command>" }) verify(value: string): string { return value; }
  @Option({ flags: "--response <outcome>" }) response(value: string): string { return value; }

  async run(passed: string[], options?: Record<string, unknown>): Promise<void> {
    if (passed.length > 0) return this.usage("task-state takes no positional arguments");
    const selected = [options?.admit, options?.reserve, options?.publish].filter((value) => value === true).length;
    if (selected !== 1) return this.usage("Select exactly one --admit, --reserve, or --publish operation");
    const string = (key: string) => typeof options?.[key] === "string" ? options[key] : undefined;
    const taskSource = string("task");
    const task = taskSource && /^[1-9][0-9]*$/.test(taskSource) ? Number(taskSource) : undefined;
    if (!Number.isSafeInteger(task)) return this.usage("--task requires a positive safe integer");
    if (options?.admit && ["taskHead", "reservation", "verify", "response"].some((key) => options[key] !== undefined)) return this.usage("Admission cannot select reservation or publication arguments");
    if (options?.reserve && ["retry", "worker", "worktree", "taskHead", "verify", "response"].some((key) => options[key] !== undefined)) return this.usage("Reservation cannot select admission or publication arguments");
    if (options?.publish && ["retry", "worker", "worktree", "targetBranch", "reservation"].some((key) => options[key] !== undefined)) return this.usage("Publication cannot select admission or reservation arguments");
    const response = string("response");
    if (response !== undefined && !["done", "blocked", "interrupted", "unavailable"].includes(response)) return this.usage("--response must be done, blocked, interrupted, or unavailable");
    this.reporter.report(await this.service.execute({
      admit: options?.admit === true, retry: options?.retry === true, reserve: options?.reserve === true, publish: options?.publish === true,
      task, changeDir: string("changeDir"), expectedHead: string("expectedHead"), worker: string("worker"), worktree: string("worktree"), targetBranch: string("targetBranch"), taskHead: string("taskHead"), reservation: string("reservation"), verify: string("verify"), response: response as TaskStateArguments["response"],
    }));
  }

  private usage(message: string): void { this.reporter.report({ stdout: "", stderr: `error: ${message}\n`, exitCode: 2 }); }
}
