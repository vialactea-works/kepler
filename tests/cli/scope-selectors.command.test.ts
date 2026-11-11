import "reflect-metadata";
import { Module, type INestApplicationContext } from "@nestjs/common";
import {
  Command,
  CommandFactory,
  CommandRunner,
  Option,
} from "nest-commander";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendSelectorValue,
  parseScopeSelectors,
  type ScopeSelectorParseResult,
} from "../../packages/cli/src/cli/scope-selectors.js";

const parsed: ScopeSelectorParseResult[] = [];
const unitId = "2026-10-21-selector-test";
const taskId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

@Command({ name: "scope-probe" })
class ScopeProbeCommand extends CommandRunner {
  @Option({ flags: "--unit <unit-id>" })
  parseUnit(value: string, previous: string[] = []): string[] {
    return appendSelectorValue(value, previous);
  }

  @Option({ flags: "--task <task-id>" })
  parseTask(value: string, previous: string[] = []): string[] {
    return appendSelectorValue(value, previous);
  }

  async run(
    _passedParams: string[],
    options?: Record<string, unknown>,
  ): Promise<void> {
    parsed.push(parseScopeSelectors(options ?? {}, { required: ["unit"] }));
  }
}

@Module({ providers: [ScopeProbeCommand] })
class ScopeProbeModule {}

const runCommand = async (arguments_: readonly string[]): Promise<void> => {
  const originalArgv = process.argv;
  let application: INestApplicationContext | undefined;
  parsed.length = 0;
  try {
    process.argv = [...originalArgv.slice(0, 2), "scope-probe", ...arguments_];
    application = await CommandFactory.runWithoutClosing(ScopeProbeModule, {
      errorHandler: (error) => {
        throw error;
      },
      serviceErrorHandler: (error) => {
        throw error;
      },
    });
  } finally {
    process.argv = originalArgv;
    await application?.close();
  }
};

describe("Nest scope selector parsing", () => {
  afterEach(() => {
    parsed.length = 0;
  });

  it("rejects duplicate flags after Commander parsing", async () => {
    await runCommand(["--unit", unitId, "--unit", `${unitId}-other`]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      kind: "failed",
      code: "duplicate_selector",
    });
  });

  it("keeps task selection bound to a supplied unit", async () => {
    await runCommand(["--unit", unitId, "--task", taskId]);

    expect(parsed).toEqual([
      {
        kind: "parsed",
        selectors: { unit: unitId, task: taskId },
      },
    ]);
  });
});
