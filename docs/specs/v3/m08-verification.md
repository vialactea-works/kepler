# M08 verification evidence

Source revision under test: `29dfea6d9820fc99d32f6269103761dbb245d082`.

The following command output was captured from the repository root. Each gate exited with code 0; the test summaries are transcribed from Vitest output.

```text
COMMAND: bun run check:typescript-sources
$ bun scripts/check-typescript-sources.ts
Authored source files use TypeScript.
EXIT_CODE: 0

COMMAND: bun run typecheck
$ bun run tsc --project tsconfig.tests.json
EXIT_CODE: 0

COMMAND: bun run build
$ bun run build:core && bun run build:cli
$ bun run --filter @vialactea-works/kepler-core build
@vialactea-works/kepler-core build: Exited with code 0
$ bun run --filter @vialactea-works/kepler-cli build
@vialactea-works/kepler-cli build: Exited with code 0
EXIT_CODE: 0

COMMAND: bun run test:unit
$ bun --bun vitest run --project unit
Test Files  43 passed (43)
Tests      687 passed (687)
EXIT_CODE: 0

COMMAND: bun run test:package
$ bun --bun vitest run --project integration packages/core/tests/integration/packed-package.test.ts
Test Files  1 passed (1)
Tests      1 passed (1)
EXIT_CODE: 0

COMMAND: bun run test:integration
$ bun --bun vitest run --project integration --no-file-parallelism
Test Files  41 passed (41)
Tests      614 passed (614)
EXIT_CODE: 0

COMMAND: bun --bun vitest run --project e2e
Test Files  6 passed (6)
Tests      66 passed (66)
EXIT_CODE: 0
```
