# Dependency execution native scenario evidence

## Scope and method

These are **three native outcomes**, observed on 2026-10-13 in the disposable fixture
`/private/tmp/kepler-dependency-actors.3uLFe2`. They are not a consumer workflow and do
not replace the static Vitest, Git, or CLI controls elsewhere in this repository.

Each case used the fixture's `kepler` runtime built from source (`packages/cli/src/cli/main.ts`),
Bun 1.4.0, an isolated HOME/XDG tree, fixture-local signing material, and the fixture-owned
`node_modules` namespace. The captured source version was 0.10.2; that version label alone does
not identify the generated capability. The bridge used the captured source and the fixture's
decorator configuration, not an installed `kepler`. The prepared manifest was historical
pre-admission input (`prepared-manifest.json`); it is not evidence that actors were admitted.

All three native actors used `openai-codex/gpt-6-luna:low`. Retained native session headers,
separately printed `PI_SESSION_ID`, and workspace binding independently identify the PI actor.
Git public SSH signatures were verified separately; that verifies commit signatures, not actor PI
identity or authorization to claim work. The coordinator record is `coordinator-observations.json`,
whose status is `three-native-outcomes-and-guarded-publications-verified`. Parent publication logs
are the canonical root-publication observations below. Feedback clearance was not performed in any case.

## Observed cases

| Case / Goal binding | Native session and runs | Admission and observed work | Canonical artifacts and result |
| --- | --- | --- | --- |
| latitude / `2026-10-13-native-latitude-v2`, Task 1 | session `01a1361f-0aa3-7776-9019-dfbbca7abfd5`; initial `31946e99-9537-441d-8dfe-ee96ed06da9c`; code `06333ab0-f860-4970-8cf7-1cf110426185` | Base `749dafdd4ab0eb8b3e8b1123e6b6590fb6654823`; admission `b01b7de5b919d6fa77758023257436389a7ecc94`; native TDD produced code `76c60db87091da467427c57aa97f49da3fb9f15f`. Exact Verify: `bun --bun vitest run tests/identifier.test.ts && bun --bun vitest run && bun --bun tsc --noEmit` (8 tests; passed). | Task log: `<fixture>/latitude/lane/.kepler/changes/2026-10-13-native-latitude-v2/tasks/task-1/progress.md`. Parent exact Verify/integration `1c0c1e89007e5de4160e07501bff6f05d5d6ddfb`; root publication `a6c7dcc7783a4b29a07d81e03e0240910f57c24f`; observed `implementation-done` in `<fixture>/latitude/env/parent-publication.log`. |
| prerequisite / `2026-10-13-native-prerequisite-v2`, Task 1 | session `01a1361f-0aa3-7686-82dd-639e339ba53b`; initial `66255162-0c96-499b-8812-a0576bf0155e`; code `7f65ae04-fc51-424e-a720-396b2d0dc730` | Base `f3dc192f95a583f7219f6175c170bd40d5f9d93f`; admission `878863d0086d12989df809955adf8afaba9597d9`. Guard operation `task1-test-file-repair` committed `50493ee4a6de0d58f7c5cabd9cec7e82ef7c73dc` to the v2 task progress before the first `tooling/test-file.ts` edit; it reserved the prerequisite successfully. Its first harness selected the wrong test and was not Goal red; the actor corrected the shared normalizer/display and ran the refactored matrix, two controls, and typecheck. Exact Verify: `bun tooling/verify.ts && bun --bun vitest run && bun --bun tsc --noEmit` (2 tests in each Vitest invocation; passed). Code `a34bdce499cf12225352f0b2cff6d3d0d0529685`. | Task log: `<fixture>/prerequisite/lane/.kepler/changes/2026-10-13-native-prerequisite-v2/tasks/task-1/progress.md`. Parent exact Verify/integration `e2ad7ca762be6960708afc048ccf4aeb87293d06`; root publication `0697f28577ccf8e500fc5fb25509d868111ffc4f`; observed `implementation-done` in `<fixture>/prerequisite/env/parent-publication.log`. `src/display.ts` was an unlisted Goal caller, not this prerequisite's reservation. |
| exhausted / `2026-10-13-native-exhausted-v2`, Task 1 | session `01a1361f-0aba-7476-91c1-53430ae1d066`; initial `648f32c1-7a9b-4535-8384-51d615f17a52`; replay `b8fb8025-a8da-4777-a90d-52823f87091d` | Base/admission `ff3dcdf4060e5148b1dbb9c2e0482e1d837bd61c` / `72d0d4e421dd4e9228973be894e3d573f351e12e`; pre-admission reservations `1f143569926fe1ccab5f4ea3f38320df6fb4daf5` and `ff3dcdf4060e5148b1dbb9c2e0482e1d837bd61c`. The first code run `86fc3982-24ed-489b-93b3-f6ef0b591774` was unavailable with `reservation does not descend from its task baseline`, not a quota result. The actual third guard was `kepler workbench task-state --reserve --task 1 --change-dir .kepler/changes/2026-10-13-native-exhausted-v2 --expected-head 72d0d4e421dd4e9228973be894e3d573f351e12e --reservation '<... tooling/test-file.ts ...>'` through the case-root bridge; it exited nonzero with `scope expansion lifetime limit exceeded` and made no production, test, or harness edits. | Task log: `<fixture>/exhausted/lane/.kepler/changes/2026-10-13-native-exhausted-v2/tasks/task-1/progress.md`. Evidence-only blocked attempt `059dd67b3fe58a142ac9901eaf39832885b861f5`; native owner metadata correction `73a3161121f477a3627da8a854bb4a5d507b7457` preserved that body and both reservations. Parent initially held publication because local status was pending, then integrated `daa8d3ae035da0f0ad921c8b343b194d10c458c0` and published blocked `4d33be7857f64c8900cc26fca01a5a4933c1b7c8`; observed `implementation-blocked` in `<fixture>/exhausted/env/parent-blocked-publication-corrected.log`. |

## Reproducibility resources and source-candidate boundary

The fixture-root resource bytes were read-only: `source-snapshot/skills-kepler-code/SKILL.md`
SHA-256 `a13fcca8d91e19c9bcfe6f701dd9218f3b78e4b27ea8716545396f17a61172e2`,
accepted-source `skills/kepler-plan/references/code-quality.md` SHA-256
`05eb769cdb88cf00eb611765de06104bc335c332a82ed0a240d5ed4e4b7e3025`, and
`source-snapshot/templates/task-progress.md` SHA-256
`9266ae8b3acee8ef61539c8f8967ef01d0fc8e22ec998e9d8d874c7936b37394`.
The copied fixture resource paths are evaluation inputs only: they impose no consumer source path,
hardcoded installed version, software installation, or global configuration requirement.

The exhausted replay used a pending runtime candidate, not accepted Task 5 implementation:
`source-snapshot-task6-repair/manifest.json` records the one-file overlay
`packages/cli/src/workbench/scope-expansions.ts` and SHA-256
`17f74ff795025212de719246774a84e49abae85673624853e003723daa48e6b8`. Its accepted source
barrier was `5a6472d329b54459cc9f63aa1b1cb70f7713969b`; current repository head at capture was
`3d8de5c0b7eb2df2f6778ef521be90dc09801466`. This is a captured **pre-replay** manifest: its
historical `nativeReplay: not-yet-run` field is not current replay status. The current coordinator
record observes replay `b8fb8025-a8da-4777-a90d-52823f87091d`, correction
`15ac1753-cf6f-4267-a2b0-e4f79bda8f64`, and blocked publication
`4d33be7857f64c8900cc26fca01a5a4933c1b7c8`. Neither record claims the candidate as accepted.

The positive publications and the negative blocked publication are separate observations. A root
done or blocked publication is not full gating, and no independent fixture feedback was performed.
The broader chain, diamond, finish, and two-lane controls remain existing Vitest/Git/CLI checks,
not new native cases. Static contracts supplement this evidence; they are **not native proof**.
