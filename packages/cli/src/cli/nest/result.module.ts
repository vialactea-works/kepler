import { Module } from "@nestjs/common";
import {
  RESULT_EXIT_SINK,
  RESULT_OUTPUT_SINK,
  ResultReporter,
} from "./result-reporter.js";

@Module({
  providers: [
    ResultReporter,
    {
      provide: RESULT_OUTPUT_SINK,
      useValue: {
        stdout: (value: string) => {
          process.stdout.write(value);
        },
        stderr: (value: string) => {
          process.stderr.write(value);
        },
      },
    },
    {
      provide: RESULT_EXIT_SINK,
      useValue: {
        setExitCode: (value: 0 | 1) => {
          process.exitCode = value;
        },
      },
    },
  ],
  exports: [ResultReporter],
})
export class ResultModule {}
