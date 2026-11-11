import { Inject, Injectable } from "@nestjs/common";

export type CliStatus = "success" | "failed";
export type CliExitCode = 0 | 1;

export interface CliEnvelope {
  readonly status: CliStatus;
  readonly data: Record<string, unknown>;
}

export interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: 0 | 1 | 2;
}

export interface ResultOutputSink {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

export interface ResultExitSink {
  readonly setExitCode: (value: CliExitCode) => void;
}

export interface CliResultSink extends ResultOutputSink, ResultExitSink {}

export const RESULT_OUTPUT_SINK = Symbol("RESULT_OUTPUT_SINK");
export const RESULT_EXIT_SINK = Symbol("RESULT_EXIT_SINK");

export const serializeCliResult = (result: CliEnvelope): string =>
  `${JSON.stringify(result)}\n`;

export const reportCliResult = (
  result: CliEnvelope,
  sink: CliResultSink,
  diagnostic = "",
): void => {
  sink.setExitCode(result.status === "success" ? 0 : 1);
  sink.stdout(serializeCliResult(result));
  if (diagnostic.length > 0) sink.stderr(diagnostic);
};

const legacyResult = (
  result: CliResult,
): { readonly result: CliEnvelope; readonly diagnostic: string } => {
  if (result.exitCode === 0) {
    return {
      result: {
        status: "success",
        data: result.stdout.length === 0 ? {} : { output: result.stdout },
      },
      diagnostic: result.stderr,
    };
  }

  const failureOutput = result.stderr.trim() || result.stdout.trim();
  const message =
    failureOutput.split(/\r?\n/).at(-1)?.trim() ||
    "The command did not complete successfully.";
  return {
    result: {
      status: "failed",
      data: {
        code: "operation_failed",
        message,
        details: result.stdout.length === 0 ? {} : { output: result.stdout },
        recovery: "Review the reported details and resolve the failure before retrying.",
      },
    },
    diagnostic: result.stderr,
  };
};

@Injectable()
export class ResultReporter {
  constructor(
    @Inject(RESULT_OUTPUT_SINK) private readonly output: ResultOutputSink,
    @Inject(RESULT_EXIT_SINK) private readonly exit: ResultExitSink,
  ) {}

  report(result: CliEnvelope | CliResult, diagnostic = ""): void {
    const normalized = "data" in result ? { result, diagnostic } : legacyResult(result);
    reportCliResult(
      normalized.result,
      {
        stdout: this.output.stdout,
        stderr: this.output.stderr,
        setExitCode: this.exit.setExitCode,
      },
      normalized.diagnostic || diagnostic,
    );
  }
}
