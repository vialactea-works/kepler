# Concepts

[Reference index](README.md) | Next: [Workflow map](lifecycle.md)

## 1. Goal and decision records

| Term | Meaning |
| --- | --- |
| Effort | One Wayfinder destination and its decision records. An undated directory slug identifies it. |
| Destination | The required outcome and its boundaries. It states what reaching the goal means. |
| Map | The effort's index. It holds orientation, rules, summaries, and unresolved uncertainty. |
| Ticket | One specific question whose answer supports a decision. Its number identifies it within the effort. |
| Answer | The current decision and its reason in a ticket. Supporting evidence remains linked. |
| Decision summary | One line in the map's Decisions so far, with a link to the ticket. The skill also calls this a gist. |
| Fog of war | In-scope uncertainty that cannot yet form a precise ticket question. It belongs in Not yet specified. |
| Out of scope | Work beyond the destination. It does not become a ticket without a separately authorized scope change. |
| Frontier | Open tickets whose blockers are resolved, excluding claimed tickets, in ticket file order. |
| Route | The static synthesis of the destination, chosen path, shipping rules, and delivery units. |
| Route unit | One coarse delivery outcome. A downstream change can implement it through several tasks. |

A question can become a ticket before its answer is known. Fog becomes a ticket when its question becomes precise.

A Wayfinder `task` ticket performs work needed for a decision. A construction task implements an approved change. These are different work units.

## 2. Authority and attendance

| Term | Meaning |
| --- | --- |
| Fixed authorization set | The exact tickets selected from one explicit requester instruction. Membership stays fixed during that work loop. |
| Eligibility | Current permission to claim an authorized member: it is open, unblocked, and unclaimed. |
| Claim | The ticket status change to `claimed` before work begins. It removes the ticket from the frontier. |
| HITL | Human-in-the-loop work. A live requester exchange resolves the decision. |
| AFK | Background work that can produce evidence without a live exchange. It does not replace human decision authority. |
| Operation rules | Per-effort instructions that bind covered session actions. They are separate from Notes. |
| Supersession | A new decision replaces an old answer while retaining the old reason and the replacement link. |

A named batch can contain a blocked ticket. Membership authorizes consideration at its turn; eligibility determines whether it can then start.

The SDD Always / Ask first / Never attendance model does not replace live human planning decisions.

## 3. Actors and write boundaries

| Actor | Responsibility |
| --- | --- |
| Requester | Defines the destination, authorizes tickets, makes decisions, and confirms changes to committed language. |
| Wayfinder owner | Charts the map, applies authorization, coordinates investigations, records answers, checks consistency, and compiles the route. |
| Researcher | Investigates one question against primary sources and writes cited findings. |
| Prototype owner | Creates disposable evidence on a verified prototype branch and returns to the starting branch. |
| Dialogue owner | Asks one question at a time, verifies facts, challenges a weakness once, and records requester decisions. |
| Domain-modeling owner | Maintains context-scoped terms and their sources without silently replacing canonical meanings. |
| Change owner | Claims one route unit and maintains its construction change on the bound source branch. |
| Finish owner | Applies construction finish gates, verifies the selected delivery effect, and updates permitted shipment state. |

Delegation changes who does bounded work. It does not transfer the requester's authority or the Wayfinder owner's integration responsibility.

## 4. Stored and conceptual states

| Artifact or concept | Stored values or evidence | Limit |
| --- | --- | --- |
| Map `status` | `open`, `cleared`, `shipping`, `shipped` | Aggregate effort summary, not unit availability or delivery proof. |
| Ticket `status` | `open`, `claimed`, `resolved` | There is no `blocked`, `closed`, or `interrupted` ticket status. |
| Ticket `type` | `research`, `prototype`, `grilling`, `task` | Selects the evidence-producing operation. |
| Route `status` | `open`, `shipping`, `shipped` | A route has no `cleared` value. A new route starts `open`. |
| Route unit `status` | `pending`, `in-progress`, `shipped` | Visible claim and shipment summary, not a distributed lock. |
| Held | Failed or unknown gate. | Conceptual condition. Preserve the last proven stored state. |
| Answer prepared | Evidence exists but resolution writeback is incomplete. | Conceptual condition, not a fourth ticket status. |
| Interrupted | Work stops without a complete result or writeback. | It does not prove resolution or authorize reassignment. |
| Working language | Terms in the current effort's glossary. | Proposed meanings, not canonical approval. |

Map `cleared` and route `open` describe the same handoff boundary on different artifacts. They are not contradictory values.

## 5. Branches, identity, and evidence

A source branch owns work. A target branch receives the delivery defined by Shipping rules.

Compare full named branch references and configured local/remote mappings. Equal tip commits do not make distinct branch roles equal.

A map records its working and merge-back branch at creation. The skill describes a default-branch fallback for historical maps without `branch`. Current lint requires that field; see [known source gaps](maintenance.md#known-source-gaps).

Prototype branches preserve disposable work. They are not route-unit production branches.

A canonical route path, unit ID, source revision, change identity, and owner establish the handoff binding. A workspace suffix cannot create another owner.

Lint validates supported syntax and schema. It cannot prove current facts, requester agreement, semantic consistency, or actual delivery.

## 6. Common hold and recovery contract

This contract applies to every operation in this phase. Diagrams omit these common edges.

| ID | From and to | Actor and operation | Input → output | Contract and gate |
| --- | --- | --- | --- | --- |
| WH01 | Any state → held | Current actor stops the affected operation. | Failed or unknown evidence → located report and preserved work. | Apply [WG01](gates.md#wg01-evidence-and-preservation). Do not record the intended target state. |
| WH02 | Held → last proven state | Responsible owner diagnoses and rechecks. | Changed evidence or authorized correction → current gate result. | Apply [WG18](gates.md#wg18-recovery). Do not infer rollback or reset a claim. |

File updates can partly succeed. Read the actual map, ticket, glossary, route, branch, and background result before retrying.

A retry must identify changed evidence, an external condition, or a corrected input. Elapsed time alone does not release a claimed ticket.
