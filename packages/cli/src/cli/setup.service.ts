import type { HomeInitializationResult } from "./home-initializer.js";

export const SETUP_OPERATION = Symbol.for("kepler.setup.operation");

export class SetupFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly recovery = "Preserve the existing home and resolve the reported problem before retrying.",
  ) {
    super(message);
    this.name = "SetupFailure";
  }
}

export interface Setup {
  setup(): HomeInitializationResult;
}
