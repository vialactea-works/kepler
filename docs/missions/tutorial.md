# Complete a mission

Use this tutorial to learn Kepler from mission creation through Standard workflow completion. You will implement a small access-policy function in one new project. The function permits access only when the owner and requester identifiers are equal and non-empty.

The result is a reviewed local repository and retained workflow evidence. You will not push, merge into another repository, publish, or deploy it.

## Understand the work

A **mission** stores the request and selected repository/workspace bindings. Its **Unit of Work** owns the design, quality, plan, and delivery artifacts. Each **stage** has an explicit attempt and completion assessment. Implementation contains three task **Activities**: Code Generation, Code Validation, and Code Integration.

The CLI checks and records operations. It does not write your application, run the recorded checks, dispatch agents, or obtain approval. You or your host perform those actions.

This exercise uses one task and one repository. It follows all six stages without optional additional reviews or upstream revisions. The selected delivery outcome is `repository-handoff`.

## Prerequisites

Have these tools available on `PATH`:

- A compatible Kepler 3.0 CLI, or the [repository-checkout runner](../installation.md#run-from-a-repository-checkout).
- Git with a working author identity and the signing setup required by your project.
- Bash, `jq`, Bun 1.4.0, and a TypeScript compiler that supports the flags below.

Bun and TypeScript are application-check dependencies for this example. Ordinary standalone Kepler workflow commands do not require them. The source repository pins TypeScript 5.9.3. You can use that existing compiler for this exercise.

For managed agent use, first complete [installation and Pi setup](../installation.md). Pi 1.2.0, pi-subagents 0.76.1, models, and credentials belong to the host setup. This manual CLI exercise needs no model, external service, or network access after its tools are available.

Use actual decisions and observations. Functional Design and Quality Requirements need requester approval. Code Validation and Unit of Work Review need a non-author reviewer. A role label in JSON does not create independence. Stop before those records if the required person or separate agent has not done the work. Automated validation of this tutorial uses controlled role labels to test CLI mechanics, not to certify real approval or agent behavior.

Run the blocks below in the same Bash session. Paths and IDs remain in shell variables. The helper functions construct JSON and save responses. They are tutorial helpers, not additional Kepler commands.

## Prepare an isolated project

Select the runner before you start. To use a standalone CLI, keep `KEPLER_CHECKOUT` unset. To use an already built checkout, set `KEPLER_CHECKOUT` to its absolute path in this Bash session.

`KEPLER_CHECKOUT` is a tutorial helper variable, not a Kepler configuration option. The checkout must have its existing dependencies and build outputs. Follow [the repository procedure](../installation.md#run-from-a-repository-checkout) first if they are missing.

Check the tools and existing identity before creating files:

```bash
set -euo pipefail
if [ -n "${KEPLER_CHECKOUT:-}" ]; then
  KEPLER_ENTRY="$KEPLER_CHECKOUT/packages/cli/dist/cli/main.js"
  test -f "$KEPLER_ENTRY"
  KEPLER_COMMAND=(bun "$KEPLER_ENTRY")
else
  KEPLER_COMMAND=("$(command -v kepler)")
fi
command -v jq
bun --version
tsc --version
AUTHOR_NAME=$(git config user.name)
AUTHOR_EMAIL=$(git config user.email)
AUTHOR="$AUTHOR_NAME <$AUTHOR_EMAIL>"
LAB=$(mktemp -d "${TMPDIR:-/tmp}/kepler-mission-lab.XXXXXXXX")
PROJECT="$LAB/project"
mkdir -p "$PROJECT/.kepler" "$LAB/home" "$LAB/config" "$LAB/tmp" "$LAB/requests"
```

The lab keeps CLI home, XDG configuration, and temporary paths separate from your normal installation. Git commits still use your existing signing policy. The following function uses your selected runner. It does not install another copy.

```bash
kepler() {
  env HOME="$LAB/home" XDG_CONFIG_HOME="$LAB/config" TMPDIR="$LAB/tmp" \
    KEPLER_PI_AGENT_DIR="$LAB/home/.pi/agent" PI_CODING_AGENT_DIR="$LAB/home/.pi/agent" \
    "${KEPLER_COMMAND[@]}" "$@"
}
kepler --version
kepler --help
cd "$PROJECT"
git init --initial-branch=main
git config user.name "$AUTHOR_NAME"
git config user.email "$AUTHOR_EMAIL"
printf 'v3\n' > .kepler/marker
printf 'dist/\n' > .gitignore
printf '# Owner access policy\n' > README.md
cat > package.json <<'EOF'
{
  "name": "kepler-access-policy-lab",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit --target ES2022 --module ESNext --strict src/access.ts",
    "build": "bun build src/access.ts --outdir dist",
    "test": "bun tests/access.test.ts"
  }
}
EOF
git add .
git commit -m 'Start the Kepler access-policy exercise'
kepler git author --project "$PROJECT"
```

The marker makes `.kepler/` an existing local project directory. It is not a mission initializer. Keep all later commands at `$PROJECT`, or supply its exact root through `--project`.

Both runner choices use the same workflow commands below. The checkout runner uses built package output and lacks an embedded standalone build identity. It cannot perform complete-generation setup.

Use the built entrypoint from the exercise directory. Direct TypeScript execution depends on the checkout's compiler configuration and can fail from another project's directory.

### Define small JSON helpers

These helpers keep repeated bindings consistent. `bindings` reads only the simple frontmatter that this exercise writes. It is not a replacement for Kepler's artifact reader.

```bash
new_id() { kepler uuid | jq -er '.data.uuid'; }
field() { jq -er "$2" "$LAB/$1.json"; }
checkpoints() {
  jq -n --arg commit "$(git rev-parse HEAD)" \
    '[{repository_id:"repo-main",commit:$commit}]' > "$LAB/checkpoints.json"
}
bindings() {
  bun -e 'import {createHash} from "node:crypto";
const result=[];
for (const path of process.argv.slice(1)) {
  const source=await Bun.file(path).text();
  const id=/^id: (.+)$/m.exec(source)?.[1];
  if (!id) throw new Error("Missing exercise artifact ID");
  result.push({artifact_id:id,content_version:"sha256:"+createHash("sha256").update(source).digest("hex")});
}
console.log(JSON.stringify(result.sort((a,b)=>a.artifact_id.localeCompare(b.artifact_id))));' "$@"
}
inputs() {
  jq '[.[]|{reference:("artifact:"+.artifact_id),purpose:"Current reviewed material"}]' "$BINDINGS" > "$LAB/inputs.json"
}
artifact() {
  local file=$1 type=$2 id=$3 author_json
  author_json=$(jq -cn --arg author "$AUTHOR" '$author')
  { printf '%s\n' '---' "id: $id" "type: $type" 'schema_version: 3' "unit_id: $UNIT" "author: $author_json" '---'; cat; } > "$UNIT_DIR/$file"
}
EXTRA='{}'
record() {
  local name=$1 check=$2 executor=$3
  shift 3
  jq -n --arg check "$check" --arg executor "$executor" \
    --slurpfile bindings "$BINDINGS" --slurpfile checkpoints "$LAB/checkpoints.json" \
    --slurpfile inputs "$LAB/inputs.json" --argjson extra "$EXTRA" \
    '{inputs:$inputs[0],artifact_bindings:$bindings[0],checkpoints:$checkpoints[0],check:$check,executor:$executor,
      result:{status:"passed",summary:($check+" passed for the checked exercise material.")},
      output_refs:[("assessment:"+$check)],conditions:[]} + $extra' > "$LAB/requests/$name.json"
  kepler audit record evidence "$@" --project "$PROJECT" < "$LAB/requests/$name.json" > "$LAB/$name.json"
  jq -e '.status=="success"' "$LAB/$name.json" > /dev/null
}
approve() {
  local name=$1
  shift
  jq -n --slurpfile b "$BINDINGS" --slurpfile c "$LAB/checkpoints.json" --slurpfile i "$LAB/inputs.json" \
    '{requester:"Requester",inputs:$i[0],artifact_bindings:$b[0],checkpoints:$c[0],
      decision_reference:"tutorial:explicit-approval-of-current-material"}' > "$LAB/requests/$name.json"
  kepler audit record approval "$@" --project "$PROJECT" < "$LAB/requests/$name.json" > "$LAB/$name.json"
  jq -e '.status=="success"' "$LAB/$name.json" > /dev/null
}
```

Call `record` only after the named check or review actually passes. Call `approve` only after an explicit decision for the exact material. The helpers do not perform those checks or obtain permission.

## Create the mission and unit

The mission request uses camelCase names. Prepare the exact workspace and local branch:

```bash
jq -n --arg path "$PROJECT" '{title:"Owner access policy",
  request:"Allow access only for equal non-empty owner and requester identifiers. Hand the checked repository to the requester.",
  workflow:"standard",recordHomeRepositoryId:"repo-main",contexts:[],
  repositories:[{repositoryId:"repo-main",workspace:{kind:"existing",path:$path},
    branch:{kind:"current"},integrationTarget:"refs/heads/main"}]}' > "$LAB/mission-request.json"
kepler mission create --project "$PROJECT" --request "$(cat "$LAB/mission-request.json")" > "$LAB/mission.json"
MISSION=$(field mission '.data.mission_id')
kepler workflow construction unit create owner-access --mission "$MISSION" --effort standard \
  --project "$PROJECT" > "$LAB/unit.json"
UNIT=$(field unit '.data.unit_id')
UNIT_DIR=".kepler/missions/$MISSION/$(field unit '.data.directory')"
kepler workflow construction unit list --project "$PROJECT"
kepler workflow construction unit show --unit "$UNIT" --project "$PROJECT"
```

Creation returns `execution_started: false`. The unit ID contains the local date and `owner-access`. The unit directory exists, but the authored stage files do not. No worker has started.

If startup stops before preparation completes, keep its mission ID and use `kepler mission prepare --mission "$MISSION" --project "$PROJECT"`. Do not repeat creation as a retry. A historical preparation result does not prove current readiness. See [mission reference](../cli/mission.md).

## 1. Functional Design

**Purpose:** define the behavior and scope before selecting the implementation.

**Inputs:** the mission request and prepared unit. **Outputs:** committed unit/design artifacts, three assessments, requester approval, and a Quality Requirements handoff.

Start the stage and write its material:

```bash
kepler workflow construction stage start --unit "$UNIT" --stage functional-design \
  --request '{"inputs":[{"reference":"request:owner-access","purpose":"Requested access policy"}]}' \
  --project "$PROJECT" > "$LAB/fd-start.json"
FD=$(field fd-start '.data.attempt_id')
artifact unit-of-work.md unit-of-work "$(new_id)" <<'EOF'
# Unit of Work

## Purpose

Prevent access for a different or empty identifier.

## Scope

Implement one pure TypeScript access decision and its tests.

## Context

Identifiers are strings. This example does not authenticate users.
EOF
artifact design.md functional-design "$(new_id)" <<'EOF'
# Functional Design

## Domain behavior

Return true only when both identifiers are non-empty and equal. Return false otherwise.

## Domain model

The owner identifier belongs to the data. The requester identifier belongs to the caller.

## Boundaries and interactions

Export a pure canReadStoredData function. Callers own authentication.

## Design decisions and open questions

Use exact case-sensitive comparison. No material question remains.
EOF
kepler lint "$UNIT_DIR/unit-of-work.md" "$UNIT_DIR/design.md" --project "$PROJECT"
git add .
git commit -m 'Record Functional Design material'
bindings "$UNIT_DIR/unit-of-work.md" "$UNIT_DIR/design.md" > "$LAB/fd-bindings.json"
BINDINGS="$LAB/fd-bindings.json"
inputs
checkpoints
stage_scope=(--unit "$UNIT" --stage functional-design --attempt "$FD")
```

Review the required content, observable acceptance, consistency, unresolved questions, and handoff. Resolve material decisions. Obtain the requester's approval for these exact committed files. Then record the actual results:

```bash
record fd-self functional-design-self-review agent:architect "${stage_scope[@]}"
record fd-decisions functional-design-decision-resolution agent:architect "${stage_scope[@]}"
record fd-handoff functional-design-quality-handoff agent:architect "${stage_scope[@]}"
approve fd-approval "${stage_scope[@]}"
jq -n --arg approval "$(field fd-approval '.data.id')" \
  --arg self "$(field fd-self '.data.evidence_id')" --arg decisions "$(field fd-decisions '.data.evidence_id')" \
  --arg handoff "$(field fd-handoff '.data.evidence_id')" --arg dir "$UNIT_DIR" \
  '{approval_event_id:$approval,assessments:{
    self_review:{status:"passed",evidence_id:$self,reviewer:"agent:architect",summary:"Required content and observable acceptance reviewed.",
      checks:["required-content","observable-acceptance","consistency","blocking-questions","downstream-handoff"],findings:[]},
    decision_resolution:{status:"resolved",evidence_id:$decisions,summary:"Choices resolved.",
      resolved_material_choices:[{choice:"Exact non-empty identifier comparison",owner:"Requester",resolution:"Use the stated policy without authentication services."}],
      unresolved_material_choices:[],unsupported_assumptions:[],quality_concerns:[],technical_questions:[]},
    handoff:{status:"ready",evidence_id:$handoff,summary:"Design ready for quality review.",recipient:"quality-requirements",unit_directory:$dir,
      artifacts:["unit-of-work.md","design.md"],project_references:[],known_constraints:["Authentication is outside this example."],quality_concerns:[],technical_questions:[]}}}' > "$LAB/fd-complete.json"
kepler workflow construction stage complete "${stage_scope[@]}" --request "$(cat "$LAB/fd-complete.json")" --project "$PROJECT"
kepler workflow construction stage show --unit "$UNIT" --stage functional-design --project "$PROJECT"
```

The stage reports `completed`. Approval uses an event ID. Assessments use evidence IDs. A stale hash or wrong attempt prevents completion. Continue with [Quality Requirements](#2-quality-requirements).

## 2. Quality Requirements

**Purpose:** define applicable non-functional obligations. **Inputs:** accepted Functional Design. **Outputs:** `quality.md`, category assessment, requester approval, and planning handoff.

```bash
jq -n --slurpfile i "$LAB/inputs.json" '{inputs:$i[0]}' > "$LAB/stage-inputs.json"
kepler workflow construction stage start --unit "$UNIT" --stage quality-requirements \
  --request "$(cat "$LAB/stage-inputs.json")" --project "$PROJECT" > "$LAB/q-start.json"
QUALITY=$(field q-start '.data.attempt_id')
artifact quality.md non-functional-requirements "$(new_id)" <<'EOF'
# Quality Requirements

## Quality requirements

### Security

When identifiers differ or either identifier is empty, return false.

## Constraints and dependencies

Use a pure TypeScript function. Add no runtime dependency.

## Decisions and open questions

Review all eight categories. Security applies to this example. Other categories add no material target for this pure function.
EOF
git add .
git commit -m 'Record Quality Requirements material'
bindings "$UNIT_DIR/quality.md" > "$LAB/q-bindings.json"
BINDINGS="$LAB/q-bindings.json"
inputs
checkpoints
stage_scope=(--unit "$UNIT" --stage quality-requirements --attempt "$QUALITY")
```

Assess every category. Review the target, conditions, acceptance, scope, and owner. The example has one security requirement. Do not reuse its applicability decisions for a larger application without assessment. Obtain approval before recording it.

```bash
record q-artifact quality-artifact-validation agent:architect "${stage_scope[@]}"
record q-self quality-self-review agent:architect "${stage_scope[@]}"
approve q-approval "${stage_scope[@]}"
jq -n --arg approval "$(field q-approval '.data.id')" --arg artifact "$(field q-artifact '.data.evidence_id')" \
  --arg self "$(field q-self '.data.evidence_id')" --arg dir "$UNIT_DIR" \
  '{approval_event_id:$approval,assessments:{
    artifact_validation:{evidence_id:$artifact,summary:"Quality artifact validated."},
    self_review:{status:"passed",evidence_id:$self,reviewer:"agent:architect",summary:"Applicability and objective conditions reviewed.",
      checks:["category-applicability","objective-conditions","consistency","material-decisions","planning-handoff"],
      categories:(["performance","availability","security","accessibility","compatibility","operability","observability","maintainability"]|map(
        {category:.,applies:(.=="security"),rationale:(if .=="security" then "The comparison controls access." else "No material target for this pure function." end)})),
      requirements:[{category:"security",reference:"quality.md#security",scope:"Identifier access decision",
        conditions:"When either identifier is empty or identifiers differ",target:"Return false.",acceptance_condition:"All denied-input tests return false.",owner:"agent:architect"}],
      resolved_material_choices:[],unresolved_material_choices:[],unresolved_material_targets:[],unresolved_tradeoffs:[],unsupported_assumptions:[]},
    external_review:{requested:false},
    handoff:{status:"ready",summary:"Quality ready for planning.",recipient:"implementation-planning",unit_directory:$dir,
      artifacts:["unit-of-work.md","design.md","quality.md"],requirement_references:["quality.md#security"],constraints:["No runtime dependency."],assumptions:[],planning_questions:[]}}}' > "$LAB/q-complete.json"
kepler workflow construction stage complete "${stage_scope[@]}" --request "$(cat "$LAB/q-complete.json")" --project "$PROJECT"
```

Completion retains the accepted design bindings and current quality bindings. Optional external review is explicitly unrequested here. The next stage selects a technical approach.

## 3. Implementation Planning

**Purpose:** produce an executable plan and task graph. **Inputs:** accepted design and quality material. **Outputs:** committed `plan.md`, linked `tasks-dag.json`, assessments, and Implementation handoff.

```bash
jq -s 'add|sort_by(.artifact_id)' "$LAB/fd-bindings.json" "$LAB/q-bindings.json" > "$LAB/input-bindings.json"
BINDINGS="$LAB/input-bindings.json"
inputs
jq -n --slurpfile i "$LAB/inputs.json" '{inputs:$i[0]}' > "$LAB/stage-inputs.json"
kepler workflow construction stage start --unit "$UNIT" --stage implementation-planning \
  --request "$(cat "$LAB/stage-inputs.json")" --project "$PROJECT" > "$LAB/p-start.json"
PLANNING=$(field p-start '.data.attempt_id')
TASK=$(new_id)
GRAPH=$(new_id)
jq -n --arg graph "$GRAPH" --arg task "$TASK" --arg unit "$UNIT" \
  --arg quality "$(jq -r '.[0].artifact_id' "$LAB/q-bindings.json")" \
  '{format:"kepler-task-dag",version:1,id:$graph,unit_id:$unit,tasks:[{
    id:$task,title:"Implement owner access decision",goal:"Deny different or empty identifiers.",
    inputs:[{reference:("artifact:"+$quality),purpose:"Accepted denial requirement"}],
    outputs:["src/access.ts","tests/access.test.ts"],acceptance_criteria:["Equal non-empty identifiers return true.","Different or empty identifiers return false."],
    guidance:["Keep the decision pure."],verification:[
      {scope:"typecheck",method:"Run `repo-main: bun run typecheck`.",expected_result:"Exit 0."},
      {scope:"build",method:"Run `repo-main: bun run build`.",expected_result:"Exit 0."},
      {scope:"full-test-suite",method:"Run the full test suite with `repo-main: bun run test`.",expected_result:"Exit 0."}],
    depends_on:[],prerequisites:[]}]}' > "$UNIT_DIR/tasks-dag.json"
artifact plan.md implementation-plan "$(new_id)" <<'EOF'
# Implementation Plan

## Technical solution

Compare non-empty strings in one pure function because callers own authentication.

## Task graph context

Read [the task graph](tasks-dag.json).

## Verification strategy

Run the typecheck with `repo-main: bun run typecheck`.
Run the build with `repo-main: bun run build`.
Run the full test suite with `repo-main: bun run test`.

## Decisions and open questions

One task contains code and unit coverage. No decision remains open.
EOF
kepler workflow construction lint --unit "$UNIT" --project "$PROJECT"
git add .
git commit -m 'Record Implementation Planning material'
bindings "$UNIT_DIR/plan.md" > "$LAB/p-bindings.json"
jq -s 'add|sort_by(.artifact_id)' "$LAB/input-bindings.json" "$LAB/p-bindings.json" > "$LAB/reviewed-bindings.json"
BINDINGS="$LAB/reviewed-bindings.json"
GRAPH_VERSION=$(bun -e 'import {createHash} from "node:crypto"; console.log("sha256:"+createHash("sha256").update(new Uint8Array(await Bun.file(process.argv[1]).arrayBuffer())).digest("hex"));' "$UNIT_DIR/tasks-dag.json")
inputs
jq --arg graph "$GRAPH" --arg version "$GRAPH_VERSION" \
  '[{reference:("task-graph:"+$graph+"@"+$version),purpose:"Current validated graph"}]+.' "$LAB/inputs.json" > "$LAB/planning-inputs.json"
cp "$LAB/planning-inputs.json" "$LAB/inputs.json"
checkpoints
stage_scope=(--unit "$UNIT" --stage implementation-planning --attempt "$PLANNING")
```

Review the rationale, all task obligations, dependencies, prerequisites, and command feasibility. The graph has one task with no dependencies or prerequisites. The exact repository-qualified commands appear in both the graph and the plan. The full-suite phrase is significant to the implemented command-binding parser.

```bash
record p-artifact planning-artifact-validation agent:architect "${stage_scope[@]}"
record p-graph planning-task-graph-validation agent:architect "${stage_scope[@]}"
record p-self planning-self-review agent:architect "${stage_scope[@]}"
jq -n --arg artifact "$(field p-artifact '.data.evidence_id')" --arg graphCheck "$(field p-graph '.data.evidence_id')" \
  --arg self "$(field p-self '.data.evidence_id')" --arg dir "$UNIT_DIR" --arg task "$TASK" \
  --arg graph "$GRAPH" --arg version "$GRAPH_VERSION" --slurpfile b "$LAB/input-bindings.json" --slurpfile g "$UNIT_DIR/tasks-dag.json" \
  '{assessments:{artifact_validation:{evidence_id:$artifact,summary:"Plan artifact validated."},
    task_graph_validation:{evidence_id:$graphCheck,summary:"Exact graph validated."},
    self_review:{status:"passed",evidence_id:$self,reviewer:"agent:architect",summary:"Task obligations and command feasibility reviewed.",
      checks:["decision-rationale","obligation-coverage","consistency","dependency-reasons","prerequisite-conditions","verification-feasibility","input-relevance","blocking-decisions"],
      decision_rationales:[{decision:"One pure comparison",rationale:"This keeps denial rules directly testable."}],
      task_reviews:[{task_id:$task,inputs_relevant:true,outputs_explicit:true,acceptance_testable:true,dependency_reasons_justified:true,
        prerequisites_conditioned:true,verification_feasible:true,rationale:"One independent task with complete checks."}],
      obligation_coverage:[{reference:"quality.md#security",disposition:"planned",task_ids:[$task],rationale:"The task implements and tests the denial rule."}],
      unresolved_consequential_decisions:[],unsupported_assumptions:[]},external_review:{requested:false},
    approval_requirement:{required:false,rationale:"The learning exercise has no separate planning approval requirement."},
    handoff:{status:"ready",summary:"Plan ready for implementation.",recipient:"implementation",unit_directory:$dir,artifacts:["plan.md","tasks-dag.json"],
      input_bindings:$b[0],graph_ref:{graph_id:$graph,content_version:$version},task_ids:[$task],
      verification_obligations:[$g[0].tasks[]|.id as $id|.verification[]|"task:\($id) \(.scope): \(.method); expected: \(.expected_result)"],
      prerequisite_conditions:[],coordination_constraints:["Run one task at a time."],approval_required:false}}}' > "$LAB/p-complete.json"
kepler workflow construction stage complete "${stage_scope[@]}" --request "$(cat "$LAB/p-complete.json")" --project "$PROJECT"
```

The example has no additional planning approval rule. Real requester instructions or project authority can require one. Do not use `required: false` to bypass that requirement.

## 4. Implementation

**Purpose:** implement and integrate the planned task. **Inputs:** accepted graph and material. **Outputs:** code, tests, three completed Activities, accepted Integration, and whole-unit assessment.

### Admit the task

```bash
BINDINGS="$LAB/reviewed-bindings.json"
inputs
jq --arg graph "$GRAPH" --arg version "$GRAPH_VERSION" \
  '{inputs:([{reference:("task-graph:"+$graph+"@"+$version),purpose:"Accepted graph"}]+.)}' "$LAB/inputs.json" > "$LAB/implementation-inputs.json"
kepler workflow construction stage start --unit "$UNIT" --stage implementation \
  --request "$(cat "$LAB/implementation-inputs.json")" --project "$PROJECT" > "$LAB/i-start.json"
IMPL=$(field i-start '.data.attempt_id')
kepler workflow construction task ready --unit "$UNIT" --task "$TASK" --project "$PROJECT"
kepler workflow construction task admit --unit "$UNIT" --task "$TASK" --implementation-attempt "$IMPL" \
  --prerequisites '{"prerequisite_evidence_ids":[]}' --project "$PROJECT"
```

Readiness is a query, not edit permission. Admission records the task scope and original Review baseline. Required prerequisites would need separate task-owned proof before this call.

### Code Generation

Assign this section to the coder. Start its exact Activity:

```bash
kepler workflow construction activity start --unit "$UNIT" --task "$TASK" --activity code-generation \
  --implementation-attempt "$IMPL" --project "$PROJECT" > "$LAB/g-start.json"
GENERATION=$(field g-start '.data.activity_attempt_id')
mkdir -p src tests
cat > src/access.ts <<'EOF'
export const canReadStoredData = (owner: string, requester: string): boolean =>
  owner.length > 0 && requester.length > 0 && owner === requester;
EOF
cat > tests/access.test.ts <<'EOF'
import { strict as assert } from "node:assert";
import { canReadStoredData } from "../src/access.ts";
assert.equal(canReadStoredData("owner", "owner"), true);
for (const [owner, requester] of [["owner", "other"], ["", ""], ["owner", ""], ["", "owner"], ["Owner", "owner"]]) {
  assert.equal(canReadStoredData(owner, requester), false);
}
console.log("All access-policy tests passed.");
EOF
bun run typecheck
bun run build
bun run test
git add .
git commit -m 'Implement and test the owner access policy'
checkpoints
jq '.data.inputs' "$LAB/g-start.json" > "$LAB/inputs.json"
activity_scope=(--unit "$UNIT" --task "$TASK" --activity code-generation --implementation-attempt "$IMPL" --attempt "$GENERATION")
EXTRA='{"worker_context_id":"tutorial:coder-context","output_refs":["src/access.ts","tests/access.test.ts"]}'
record g-type code-generation-typecheck agent:coder "${activity_scope[@]}"
record g-tests code-generation-related-tests agent:coder "${activity_scope[@]}"
```

Inspect the implementation, boundary cases, tests, and accepted scope. After the actual coder self-review passes:

```bash
record g-self code-generation-self-review agent:coder "${activity_scope[@]}"
jq -n --arg a "$(field g-type '.data.evidence_id')" --arg b "$(field g-tests '.data.evidence_id')" \
  --arg c "$(field g-self '.data.evidence_id')" '{evidence_ids:[$a,$b,$c]}' > "$LAB/g-evidence.json"
kepler workflow construction activity complete "${activity_scope[@]}" --evidence "$(cat "$LAB/g-evidence.json")" --project "$PROJECT"
```

The Activity records the output checkpoint. It does not replace the next independent check.

### Code Validation

Assign this section to a non-author reviewer in a separate context. The reviewer must inspect the actual output and accepted inputs. A different executor string alone does not satisfy that responsibility.

```bash
kepler workflow construction activity start --unit "$UNIT" --task "$TASK" --activity code-validation \
  --implementation-attempt "$IMPL" --project "$PROJECT" > "$LAB/v-start.json"
VALIDATION=$(field v-start '.data.activity_attempt_id')
kepler git diff-package validation --unit "$UNIT" --task "$TASK" --implementation-attempt "$IMPL" \
  --generation-attempt "$GENERATION" --project "$PROJECT" > "$LAB/validation-package.json"
bun run typecheck
bun run build
bun run test
jq '.data.inputs' "$LAB/v-start.json" > "$LAB/inputs.json"
checkpoints
activity_scope=(--unit "$UNIT" --task "$TASK" --activity code-validation --implementation-attempt "$IMPL" --attempt "$VALIDATION")
EXTRA='{"worker_context_id":"tutorial:reviewer-context","output_refs":["src/access.ts","tests/access.test.ts"]}'
record v-type code-validation-typecheck agent:reviewer "${activity_scope[@]}"
record v-build code-validation-build agent:reviewer "${activity_scope[@]}"
record v-tests code-validation-full-test-suite agent:reviewer "${activity_scope[@]}"
```

Open the package path in `data.output`. Review the complete task output and check its acceptance conditions. Then review the review itself. Record the actual conclusions only if no blocking finding remains:

```bash
record v-review code-validation-independent-review agent:reviewer "${activity_scope[@]}"
record v-self code-validation-self-review agent:reviewer "${activity_scope[@]}"
jq -n --arg a "$(field v-type '.data.evidence_id')" --arg b "$(field v-build '.data.evidence_id')" \
  --arg c "$(field v-tests '.data.evidence_id')" --arg d "$(field v-review '.data.evidence_id')" \
  --arg e "$(field v-self '.data.evidence_id')" '{evidence_ids:[$a,$b,$c,$d,$e]}' > "$LAB/v-evidence.json"
kepler workflow construction activity complete "${activity_scope[@]}" --evidence "$(cat "$LAB/v-evidence.json")" --project "$PROJECT"
```

If findings require changed code, stop and use the owning revision/recovery procedure. Do not record a passing review for unfinished work.

### Code Integration

The orchestrator owns this section. Keep the lock until safe acceptance or an eligible incomplete-work release.

```bash
kepler workflow construction activity start --unit "$UNIT" --task "$TASK" --activity code-integration \
  --implementation-attempt "$IMPL" --project "$PROJECT" > "$LAB/in-start.json"
INTEGRATION=$(field in-start '.data.activity_attempt_id')
integration_scope=(--unit "$UNIT" --task "$TASK" --activity code-integration --implementation-attempt "$IMPL" --attempt "$INTEGRATION")
kepler workflow construction integration lock "${integration_scope[@]}" --project "$PROJECT" > "$LAB/lock.json"
LOCK_TOKEN=$(field lock '.data.lock_token')
jq -n --slurpfile l "$LAB/lock.json" --slurpfile a "$LAB/in-start.json" \
  '{captured_inputs:$l[0].data.captured_inputs,candidate_checkpoints:$a[0].data.checkpoints}' > "$LAB/candidate.json"
kepler workflow construction integration prepare "${integration_scope[@]}" --lock-token "$LOCK_TOKEN" \
  --request "$(cat "$LAB/candidate.json")" --project "$PROJECT" > "$LAB/prepared.json"
PREPARED_EVENT=$(field prepared '.data.prepared_event_id')
```

The one-task example already has a committed candidate in its selected workspace. Preparation verifies it; it does not generate or merge code.

Inspect the candidate/input bindings and every acceptance condition before running the loop. Its self-review iteration records your completed assessment. Run this success-path loop only after that self-review passes. The exact binding sentence does not prove semantic correctness.

The loop submits every Integration result as `passed`. With `set -e`, a failed `bun run` stops it before that check's evidence is recorded. If a command or self-review does not pass, do not run `integration accept`. Keep the lock. Use `integration evidence` to record the actual `failed` or `inconclusive` status and result. Then follow [Integration recovery](../recovery.md#integration-acceptance-and-release). Do not submit passing evidence for a failed result.

Run the planned checks while holding the lock:

```bash
for kind in typecheck build full-test-suite self-review; do
  case "$kind" in
    typecheck) script=typecheck ;;
    build) script=build ;;
    full-test-suite) script=test ;;
    self-review) script='' ;;
  esac
  if [ -n "$script" ]; then
    bun run "$script"
    command_json=$(jq -n --arg script "$script" '{repository_id:"repo-main",executable:"bun",argv:["run",$script]}')
    conditions='[]'
  else
    command_json=null
    conditions=$(jq '[.tasks[0].acceptance_criteria[],"Integration bindings match the accepted candidate and actual inputs."]' "$UNIT_DIR/tasks-dag.json")
  fi
  jq -n --arg prepared "$PREPARED_EVENT" --arg check "code-integration-$kind" \
    --argjson command "$command_json" --argjson conditions "$conditions" \
    '{prepared_event_id:$prepared,check:$check,executor:"agent:integrator",result:{status:"passed",summary:"The actual candidate check passed."},
      output_refs:["src/access.ts","tests/access.test.ts"],conditions:$conditions}
      + (if $command==null then {} else {check_command:$command} end)' > "$LAB/requests/in-$kind.json"
  kepler workflow construction integration evidence "${integration_scope[@]}" --lock-token "$LOCK_TOKEN" \
    --request "$(cat "$LAB/requests/in-$kind.json")" --project "$PROJECT" > "$LAB/in-$kind.json"
done
kepler git diff-package integration --unit "$UNIT" --task "$TASK" --implementation-attempt "$IMPL" \
  --integration-attempt "$INTEGRATION" --project "$PROJECT" > "$LAB/integration-package.json"
kepler workflow construction integration accept "${integration_scope[@]}" --lock-token "$LOCK_TOKEN" \
  --prepared-event-id "$PREPARED_EVENT" --project "$PROJECT"
jq -n --arg a "$(field in-typecheck '.data.evidence_id')" --arg b "$(field in-build '.data.evidence_id')" \
  --arg c "$(field in-full-test-suite '.data.evidence_id')" --arg d "$(field in-self-review '.data.evidence_id')" \
  '{evidence_ids:[$a,$b,$c,$d]}' > "$LAB/in-evidence.json"
kepler workflow construction activity complete "${integration_scope[@]}" --evidence "$(cat "$LAB/in-evidence.json")" --project "$PROJECT"
```

Acceptance releases the lock. Activity completion then records task completion. Current Integration supports one repository, even though mission startup can select more.

### Complete Implementation

Inspect the complete combined output and evidence. Run the combined checks again when needed. Verify every handoff artifact. Then record the three current stage results:

```bash
EXTRA='{}'
inputs
checkpoints
stage_scope=(--unit "$UNIT" --stage implementation --attempt "$IMPL")
record i-self implementation-self-review agent:coder "${stage_scope[@]}"
record i-handoff implementation-review-handoff agent:coder "${stage_scope[@]}"
record i-combined implementation-combined-result-check agent:reviewer "${stage_scope[@]}"
jq -n --arg self "$(field i-self '.data.evidence_id')" --arg handoff "$(field i-handoff '.data.evidence_id')" \
  --arg combined "$(field i-combined '.data.evidence_id')" \
  '{self_review_evidence_id:$self,handoff_evidence_id:$handoff,unit_check_evidence_ids:[$combined],
    retained_scope_assessment_event_ids:[],additional_review:{requested:false},blocking_findings:[],
    handoff_assessment:{status:"ready",reason:"The task and combined checks passed.",recipient:"unit-of-work-review",
      artifacts:["unit-of-work.md","design.md","quality.md","plan.md","tasks-dag.json"]}}' > "$LAB/i-complete.json"
kepler workflow construction stage complete "${stage_scope[@]}" --request "$(cat "$LAB/i-complete.json")" --project "$PROJECT" > "$LAB/i-completion.json"
IMPLEMENTATION_COMPLETION=$(field i-completion '.data.id')
cp "$LAB/checkpoints.json" "$LAB/reviewed-checkpoints.json"
kepler workflow construction task show --unit "$UNIT" --task "$TASK" --project "$PROJECT"
```

The task reports `complete`. Implementation reports `completed`. These are different state values.

## 5. Unit of Work Review

**Purpose:** assess the entire integrated outcome. **Inputs:** Implementation completion, accepted artifacts, all task evidence, and final checkpoints. **Outputs:** independent review evidence and a ready Deliver handoff.

Use a non-author reviewer. Review the whole unit, not only changed lines. Inspect the implementation evidence and the original baseline comparison:

```bash
inputs
jq -n --slurpfile i "$LAB/inputs.json" '{inputs:$i[0]}' > "$LAB/stage-inputs.json"
kepler workflow construction stage start --unit "$UNIT" --stage unit-of-work-review \
  --request "$(cat "$LAB/stage-inputs.json")" --project "$PROJECT" > "$LAB/r-start.json"
REVIEW=$(field r-start '.data.attempt_id')
kepler git diff-package unit-review --unit "$UNIT" --implementation-attempt "$IMPL" --project "$PROJECT" > "$LAB/unit-review-package.json"
stage_scope=(--unit "$UNIT" --stage unit-of-work-review --attempt "$REVIEW")
record r-assessment implementation-evidence-assessment agent:reviewer "${stage_scope[@]}"
record r-review unit-of-work-review agent:reviewer "${stage_scope[@]}"
record r-self unit-of-work-review-self-review agent:reviewer "${stage_scope[@]}"
jq -n --arg implementation "$IMPLEMENTATION_COMPLETION" --slurpfile b "$BINDINGS" --slurpfile c "$LAB/reviewed-checkpoints.json" \
  --arg assessment "$(field r-assessment '.data.evidence_id')" --arg review "$(field r-review '.data.evidence_id')" --arg self "$(field r-self '.data.evidence_id')" \
  '{implementation_completion_event_id:$implementation,reviewed_material_bindings:$b[0],final_checkpoints:$c[0],
    reviewer:"agent:reviewer",implementation_authors:["agent:coder"],implementation_evidence_assessment_id:$assessment,
    review_evidence_id:$review,self_review_evidence_id:$self,findings:{blocking:[],limitations:[]},additional_review:{requested:false},acceptance_required:false,
    handoff:{status:"ready",recipient:"deliver",summary:"The complete reviewed unit is ready for handoff."}}' > "$LAB/r-complete.json"
kepler workflow construction stage complete "${stage_scope[@]}" --request "$(cat "$LAB/r-complete.json")" --project "$PROJECT" > "$LAB/r-completion.json"
REVIEW_COMPLETION=$(field r-completion '.data.id')
```

Run the three recording commands only after those actual assessments pass. The example has no additional review or separate acceptance requirement. Real findings and authority requirements must remain explicit.

## 6. Deliver

**Purpose:** hand the agreed result to its recipient. **Inputs:** ready Review, reviewed source checkpoints, and explicit delivery selection. **Outputs:** committed delivery instructions, verification, recipient handoff, and final stage completion.

Write delivery instructions without changing the reviewed implementation:

```bash
artifact delivery.md delivery-plan "$(new_id)" <<'EOF'
# Delivery Plan

## Outcome and destination

Hand the reviewed repository checkpoint and actual test results to the requester.

## Operations and prerequisites

No push, publication, deployment, or deletion is requested.

## Verification and recovery

Verify the reviewed checkpoint and six completed stage states. Preserve the journals.

## Decisions and open questions

Repository handoff is the selected outcome.
EOF
git add .
git commit -m 'Record the local repository handoff plan'
bindings "$UNIT_DIR/delivery.md" > "$LAB/d-bindings.json"
jq -s 'add' "$LAB/reviewed-bindings.json" "$LAB/d-bindings.json" > "$LAB/delivery-bindings.json"
BINDINGS="$LAB/delivery-bindings.json"
inputs
checkpoints
jq -n --slurpfile i "$LAB/inputs.json" '{inputs:$i[0]}' > "$LAB/stage-inputs.json"
kepler workflow construction stage start --unit "$UNIT" --stage deliver --request "$(cat "$LAB/stage-inputs.json")" \
  --project "$PROJECT" > "$LAB/d-start.json"
DELIVER=$(field d-start '.data.attempt_id')
stage_scope=(--unit "$UNIT" --stage deliver --attempt "$DELIVER")
cat > "$LAB/outcome.json" <<'EOF'
{"participants":["Requester"],"content":"Return the reviewed checkpoint and checked source to the tutorial requester.",
 "references":["tutorial:repository-handoff"],"delivery_outcome":{"outcome":"repository-handoff",
 "requested_outcome":"Return the reviewed checkpoint and checked source to the tutorial requester.","destination":"repository:main","recipient":"Requester"}}
EOF
kepler audit record interaction "${stage_scope[@]}" --project "$PROJECT" < "$LAB/outcome.json" > "$LAB/outcome-event.json"
OUTCOME_EVENT=$(field outcome-event '.data.id')
```

The requester selects this exact outcome before delivery. Record that actual decision. The example requires no external operation, so its `operation_results` array can be empty. Other outcome types require authorized operation results.

Prepare and verify the handoff. Confirm that the recipient can access the project, reviewed checkpoint, and retained results before recording recipient handoff. Retain the reviewed commit separately from the later delivery-instruction commit:

```bash
bun run test
jq -r '.[0].commit' "$LAB/reviewed-checkpoints.json" > "$LAB/handoff-checkpoint.txt"
git show "$(cat "$LAB/handoff-checkpoint.txt"):src/access.ts"
EXTRA='{}'
record d-preparation deliver-preparation agent:delivery-owner "${stage_scope[@]}"
record d-self deliver-self-review agent:delivery-owner "${stage_scope[@]}"
EXTRA=$(jq -n --arg request "$OUTCOME_EVENT" '{related_request_event_id:$request}')
record d-verification deliver-outcome-verification agent:delivery-owner "${stage_scope[@]}"
EXTRA=$(jq -n --arg a "$(field d-preparation '.data.id')" --arg b "$(field d-self '.data.id')" \
  --arg c "$(field d-verification '.data.id')" '{related_event_ids:[$a,$b,$c]}')
record d-handoff deliver-recipient-handoff agent:delivery-owner "${stage_scope[@]}"
jq -n --arg review "$REVIEW_COMPLETION" --arg request "$OUTCOME_EVENT" --slurpfile b "$BINDINGS" --slurpfile c "$LAB/reviewed-checkpoints.json" \
  --arg preparation "$(field d-preparation '.data.evidence_id')" --arg self "$(field d-self '.data.evidence_id')" \
  --arg verify "$(field d-verification '.data.evidence_id')" --arg handoff "$(field d-handoff '.data.evidence_id')" \
  '{review_completion_event_id:$review,outcome_request_event_id:$request,outcome:"repository-handoff",
    requested_outcome:"Return the reviewed checkpoint and checked source to the tutorial requester.",destination:"repository:main",recipient:"Requester",
    artifact_bindings:$b[0],reviewed_checkpoints:$c[0],preparation_evidence_id:$preparation,self_review_evidence_id:$self,
    operation_results:[],verification_evidence_ids:[$verify],handoff_evidence_id:$handoff,additional_review:{requested:false},approval_required:false,
    handoff:{status:"ready",summary:"The reviewed checkpoint and checked results are available to the requester."}}' > "$LAB/d-complete.json"
kepler workflow construction stage complete "${stage_scope[@]}" --request "$(cat "$LAB/d-complete.json")" --project "$PROJECT"
```

Pass event IDs through `related_event_ids`. Evidence IDs are not causal event IDs. A handoff without the required preparation, self-review, and verification causes fails.

## Verify the completed result

```bash
kepler workflow construction unit show --unit "$UNIT" --project "$PROJECT" > "$LAB/final-unit.json"
jq -e '.data.unit.blocked==false and (.data.unit.stages|all(.state=="completed"))' "$LAB/final-unit.json"
kepler audit list --unit "$UNIT" --type construction.stage-attempt-completed \
  --fields type,data --limit 100 --project "$PROJECT"
bun run test
git status --short
printf 'Project: %s\nMission: %s\nUnit: %s\nEvidence: %s\n' "$PROJECT" "$MISSION" "$UNIT" "$LAB"
```

Expect six completed stages, one completed task, and an unblocked unit. The function passes its positive and denied-input cases. `delivery.md`, the graph, assessments, and journals remain available.

New journal records can remain uncommitted. A successful workflow is not a clean-tree guarantee. Preserve them and follow your project's authorized commit procedure. Do not edit journals to obtain a preferred state.

There is no `mission complete` command or separate mission-finished state. Deliver is the final implemented Construction stage. The result is local. Nothing in this exercise publishes, deploys, or grants later permission.

Keep the lab until the recipient has the required material. Remove only your own temporary data when it is no longer needed. Keep the project and its history if you want to resume inspection. Kepler does not require a purge operation to complete the workflow.

## Inspect and recover during the exercise

Use the owning scope instead of a global status command:

```bash
kepler workflow construction stage show --unit "$UNIT" --stage implementation --project "$PROJECT"
kepler workflow construction task list --unit "$UNIT" --project "$PROJECT"
kepler workflow construction activity show --unit "$UNIT" --task "$TASK" --activity code-generation \
  --implementation-attempt "$IMPL" --project "$PROJECT"
kepler audit list --unit "$UNIT" --fields type,data --limit 100 --project "$PROJECT"
```

If an input hash or checkpoint is stale, inspect the selected material and attempt. Do not guess a new approval. If a check fails, record failure and keep the relevant lock until safe recovery. If a worker stops, confirm the exact run and reconcile its effects before pause acknowledgement or resume.

The [Construction reference](../cli/construction.md) gives pause, resume, retained-scope, revision, and Integration recovery inputs. The [Recovery guide](../recovery.md) explains safe decision order. These are alternatives when needed, not extra happy-path stages.

## Sources and next steps

This exercise follows the public six-stage workflow in [`tests/e2e/stage-completion.test.ts`](../../tests/e2e/stage-completion.test.ts). It uses the actual request validators and commands linked from [Construction](../cli/construction.md), [stage assessments](../cli/stage-assessments.md), and [Audit](../cli/audit.md).

For real projects, use the [packaged skills and roles](../skills.md) and assess actual quality obligations. Define appropriate task boundaries. Obtain the required independent reviews and delivery authority. Do not treat this small learning example as a complete authentication or production authorization system.
