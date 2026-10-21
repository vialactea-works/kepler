import { describe, expect, it } from "vitest";
import {
  ResultReporter,
  type CliResult,
} from "../../packages/cli/src/cli/nest/result-reporter.js";

type Event =
  | { readonly type: "stdout" | "stderr"; readonly value: string }
  | { readonly type: "exitCode"; readonly value: 0 | 1 | 2 };

const createReporter = () => {
  const events: Event[] = [];
  const reporter = new ResultReporter(
    {
      stdout: (value) => events.push({ type: "stdout", value }),
      stderr: (value) => events.push({ type: "stderr", value }),
    },
    { setExitCode: (value) => events.push({ type: "exitCode", value }) },
  );

  return { reporter, events };
};

describe("ResultReporter", () => {
  it.each([
    {
      name: "success",
      result: {
        stdout: "success output\n",
        stderr: "success warning\n",
        exitCode: 0,
      },
    },
    {
      name: "negative result",
      result: {
        stdout: "negative output\n",
        stderr: "negative diagnostic\n",
        exitCode: 1,
      },
    },
    {
      name: "error result",
      result: {
        stdout: "error output\n",
        stderr: "error diagnostic\n",
        exitCode: 2,
      },
    },
  ] satisfies ReadonlyArray<{ readonly name: string; readonly result: CliResult }>)(
    "reports a $name without changing either stream or its status",
    ({ result }) => {
      const { reporter, events } = createReporter();

      reporter.report(result);

      expect(events).toEqual([
        { type: "exitCode", value: result.exitCode },
        { type: "stdout", value: result.stdout },
        { type: "stderr", value: result.stderr },
      ]);
    },
  );

  it("reports an already-rendered lint string without transforming it", () => {
    const { reporter, events } = createReporter();
    const lintOutput = "lint: findings\nfile.md: invalid metadata\n";

    reporter.report({ stdout: lintOutput, stderr: "", exitCode: 1 });

    expect(events).toEqual([
      { type: "exitCode", value: 1 },
      { type: "stdout", value: lintOutput },
      { type: "stderr", value: "" },
    ]);
  });
});
