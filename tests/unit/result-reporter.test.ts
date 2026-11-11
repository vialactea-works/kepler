import { describe, expect, it } from "vitest";
import {
  ResultReporter,
  type CliResult,
} from "../../packages/cli/src/cli/nest/result-reporter.js";

type Event =
  | { readonly type: "stdout" | "stderr"; readonly value: string }
  | { readonly type: "exitCode"; readonly value: 0 | 1 };

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

const failure = {
  status: "failed" as const,
  data: {
    code: "invalid_arguments",
    message: "A required argument is missing.",
    details: {},
    recovery: "Provide the required argument and retry.",
  },
};

describe("ResultReporter", () => {
  it("writes the exact success envelope and exit code", () => {
    const { reporter, events } = createReporter();

    reporter.report({ status: "success", data: { id: "artifact-id" } });

    expect(events).toEqual([
      { type: "exitCode", value: 0 },
      {
        type: "stdout",
        value: '{"status":"success","data":{"id":"artifact-id"}}\n',
      },
    ]);
  });

  it("writes the required failure fields and sends diagnostics only to stderr", () => {
    const { reporter, events } = createReporter();

    reporter.report(failure, "Parser diagnostic\n");

    expect(events).toEqual([
      { type: "exitCode", value: 1 },
      {
        type: "stdout",
        value: `${JSON.stringify(failure)}\n`,
      },
      { type: "stderr", value: "Parser diagnostic\n" },
    ]);
  });

  it("converts existing successful operation output into structured data", () => {
    const { reporter, events } = createReporter();
    const result: CliResult = {
      stdout: "legacy operation result\n",
      stderr: "",
      exitCode: 0,
    };

    reporter.report(result);

    expect(events).toEqual([
      { type: "exitCode", value: 0 },
      {
        type: "stdout",
        value: '{"status":"success","data":{"output":"legacy operation result\\n"}}\n',
      },
    ]);
  });

  it("uses the final output line as the concise failure message when stderr is empty", () => {
    const { reporter, events } = createReporter();

    reporter.report({
      stdout: "[PASS] Checks\n[FAIL] Review\ngate: closed (1 failing)\n",
      stderr: "",
      exitCode: 1,
    });

    const output = events.find((event) => event.type === "stdout");
    expect(output?.type).toBe("stdout");
    if (output?.type !== "stdout") throw new Error("Expected stdout result");
    expect(JSON.parse(output.value)).toEqual({
      status: "failed",
      data: {
        code: "operation_failed",
        message: "gate: closed (1 failing)",
        details: {
          output: "[PASS] Checks\n[FAIL] Review\ngate: closed (1 failing)\n",
        },
        recovery: "Review the reported details and resolve the failure before retrying.",
      },
    });
    expect(events).toContainEqual({ type: "exitCode", value: 1 });
  });

  it("converts failed operations without losing known output or diagnostics", () => {
    const { reporter, events } = createReporter();

    reporter.report({
      stdout: "partial result\n",
      stderr: "operation failed\n",
      exitCode: 2,
    });

    const output = events.find((event) => event.type === "stdout");
    expect(output?.type).toBe("stdout");
    if (output?.type !== "stdout") throw new Error("Expected stdout result");
    expect(JSON.parse(output.value)).toEqual({
      status: "failed",
      data: {
        code: "operation_failed",
        message: "operation failed",
        details: { output: "partial result\n" },
        recovery: "Review the reported details and resolve the failure before retrying.",
      },
    });
    expect(output.value.endsWith("\n")).toBe(true);
    expect(events).toContainEqual({ type: "exitCode", value: 1 });
    expect(events).toContainEqual({ type: "stderr", value: "operation failed\n" });
  });
});
