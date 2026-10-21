import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { ResultModule } from "../../packages/cli/src/cli/nest/result.module.js";
import { ResultReporter } from "../../packages/cli/src/cli/nest/result-reporter.js";

describe("ResultModule", () => {
  it("exports ResultReporter through its Nest module", async () => {
    const module = await Test.createTestingModule({ imports: [ResultModule] }).compile();

    try {
      expect(module.get(ResultReporter)).toBeInstanceOf(ResultReporter);
    } finally {
      await module.close();
    }
  });
});
