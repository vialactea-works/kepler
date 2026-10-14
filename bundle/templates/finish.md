---
artifact: finish
change: <YYYY-MM-DD-change-title>
status: pending | completed | blocked
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
strategy: local-merge | pull-request | no-op | reconcile-delivery
result: completed | blocked | pending
decision: accepted | rejected | skipped
---

<!--
  Finish History: completion history for a change.
  Produced by: kepler-finish-work (step 6).
  Lives at: .kepler/changes/<change>/finish.md
  Create this artifact after the task and whole-branch gates and read-only intent validation pass. Commit Attempt before writing canonical specs or routes or performing delivery. Plan synchronization here; record its observed paths and commit, or verified no change, in the matching Outcome.

  Write JSON fields as single-line objects or arrays with exactly the documented keys and no duplicates. Capture source paths using canonical absolute Git/root identities, never a guessed branch or directory. Set materialWaiver to null unless it holds the original explicit material-ancestry authorization reference. List every approved proposal/design/requirements path and its exact committed blob ID in inputs.

  Set Route identity to null without a route; otherwise use:
  {"path":".kepler/maps/<effort>/route.md","mapPath":".kepler/maps/<effort>/map.md","unit":1,"sourceBlob":"<full blob ID>","previousStatus":"in-progress","shipping":"merge | request-open | no-op","owner":"<owner>","change":"<change>","sourceRef":"refs/heads/<source>","targetRef":"<admitted full target ref>","baseCommit":"<full SHA>"}

  Resolve the actual Shipping rules condition without writes. Stop before intent if the strategy is incompatible. The ordinary user strategies are local-merge, pull-request and no-op. Use reconcile-delivery only as a linked repair executor, never as another shipping choice.

  For a repair, copy the original Admission/Source/Route identities and record:
  - Recovery of: {"attempt":1,"outcomeCommit":"<original blocked Outcome SHA>","previousRepairCommit":null}
  - Delivery identity: <original observed delivery object>
  - Remaining effects: [{"kind":"canonical-spec | route | map | history","path":"<exact allowed path>"}]

  Bind previousRepairCommit to the latest failed-repair Outcome when one exists. Preserve original pairs. For a later failed repair, copy precondition's retry-evidence JSON unchanged:
  - Retry evidence: {"previousRepairCommit":"<latest failed repair Outcome SHA>","head":"<verified entry SHA>","changedPaths":["<changed remaining non-history path>"],"delivery":null}

  Set delivery to the reobserved original request identity only for an open-to-merged change. Unchanged paths and delivery do not justify another repair. Refer unverifiable conditions to the owner for adjudication.

  Commit each Attempt and its Outcome separately. Legacy pairs may occur only before modern history. Each modern Outcome records Result: completed | blocked and these single-line JSON fields:
  - Specification synchronization result: {"paths":[".kepler/specs/<capability>.md"],"commit":"<observed full SHA>"}
  Use {"paths":[],"commit":null} for verified no change.
  - Delivery identity: <observed delivery object, or null if no delivery was verified>
  local-merge: {"strategy":"local-merge","targetRef":"refs/heads/<surviving base>","commit":"<observed merge result SHA>"}
  pull-request: {"strategy":"pull-request","provider":"github | gitlab","repository":"<host>/<namespace>/<repo>","url":"<canonical https URL>","head":"<original delivered SHA>","targetRef":"refs/heads/<base>","state":"open | merged","mergeCommit":null}
  For a merged request, record the observed merge SHA. Refer rewritten or ambiguous content to the owner for adjudication.
  no-op: {"strategy":"no-op","sourceRef":"refs/heads/<source>","worktree":"<absolute Git worktree identity>","commit":"<verified pre-route no-op SHA>"}
  - Remaining effects: <exact typed paths, or [] only when none remain>

  Completed requires verified delivery and no remaining effects. Repairs retain the original object identity; open may advance to observed merged without a new request or an open-only readback gate. Preserve legacy records unchanged; never invent missing provenance to enable repair.
  Delete this instruction block and every inline hint before finalizing.
-->

# Finish History: <Change Title> <!-- hint: replace with the plan's exact change title -->

## Attempt N — <YYYY-MM-DD> <!-- hint: replace with the next attempt number and current date -->

- Passed preconditions: <gates and verification evidence>
- Specification synchronization: <planned exact targets and approved input identities, or planned none>
- Strategy: <local-merge | pull-request | no-op | reconcile-delivery>
- Intended workspace result: <expected branch and tree state>
- Route intent: <canonical route/unit transition and exact shipping condition, or none>
- Admission identity: {"verifiedHead":"<full SHA>","targetRef":"<full target ref>","targetCommit":"<full SHA>","reviewBase":"<full SHA>","reviewHead":"<full SHA>","reviewCommit":"<full artifact-only SHA>","materialWaiver":null,"inputs":[]}
- Source identity: {"repository":"<absolute canonical Git common directory>","root":"<absolute canonical original root>","sourceRef":"refs/heads/<source>","worktree":"<absolute Git worktree identity>"}
- Route identity: null
