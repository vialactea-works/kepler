import { defineConfig } from "vitest/config";

const unitTests = [
  "tests/unit/**/*.test.ts",
  "packages/core/tests/unit/**/*.test.ts",
  "tests/workbench/artifact-reader.test.ts",
  "tests/workbench/artifact-contracts.test.ts",
  "tests/workbench/artifact-schemas.test.ts",
  "tests/workbench/finish-claims.test.ts",
  "tests/workbench/finish-records.test.ts",
  "tests/workbench/finish-route.test.ts",
  "tests/workbench/legacy-input-confirmation.test.ts",
  "tests/workbench/precondition-snapshot.test.ts",
  "tests/workbench/route-relations.test.ts",
  "tests/workbench/task-admission.test.ts",
  "tests/workbench/task-ledger-history.test.ts",
  "tests/workbench/task-readiness-policy.test.ts",
];

const endToEndTests = [
  "tests/e2e/**/*.test.ts",
  "tests/cli/main.test.ts",
  "tests/cli/workbench.test.ts",
  "tests/workbench/task-state.test.ts",
];

const existingTests = [
  "tests/**/*.test.ts",
  "packages/*/tests/**/*.test.ts",
];

export default defineConfig({
  test: {
    globals: false,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: unitTests,
          globals: false,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: existingTests,
          exclude: [...unitTests, ...endToEndTests],
          globals: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "e2e",
          include: endToEndTests,
          globals: false,
          testTimeout: 120_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
