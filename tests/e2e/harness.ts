import { createApplicationConnector, KeplerCliDriver } from "./driver.js";
import type { ApplicationConnector } from "./connectors.js";
import {
  TemporaryE2EResourceConnector,
  type E2EResources,
} from "./resources.js";

export interface E2EHarness {
  readonly resources: E2EResources;
  readonly cli: KeplerCliDriver;
  cleanup(): Promise<void>;
}

export interface E2EHarnessOptions {
  readonly application?: "docker" | "native";
  readonly connector?: ApplicationConnector;
}

export const createE2EHarness = async (
  options: E2EHarnessOptions = {},
): Promise<E2EHarness> => {
  const resources = await new TemporaryE2EResourceConnector().create();
  try {
    const connector =
      options.connector ?? createApplicationConnector(options.application ?? "docker");
    const cli = new KeplerCliDriver(connector, resources);
    return {
      resources,
      cli,
      cleanup: () => resources.cleanup(),
    };
  } catch (error) {
    await resources.cleanup();
    throw error;
  }
};

export const withE2EHarness = async <T>(
  action: (harness: E2EHarness) => Promise<T> | T,
  options: E2EHarnessOptions = {},
): Promise<T> => {
  const harness = await createE2EHarness(options);
  try {
    return await action(harness);
  } finally {
    await harness.cleanup();
  }
};
