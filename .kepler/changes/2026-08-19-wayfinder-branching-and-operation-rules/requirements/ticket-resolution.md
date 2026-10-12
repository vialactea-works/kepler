# Capability: ticket-resolution

The procedures a wayfinder decision ticket is resolved by — what each one investigates or builds, and where the artifact it produces comes to rest.

## ADDED Requirements

### Requirement: Prototype work is branch-gated

The prototype procedure SHALL create a branch named `prototype/<map-name>/<ticket-name>` from the current branch — where `<map-name>` is the map's effort slug and `<ticket-name>` is the ticket file's `NN-slug` — and switch to it before any prototype artifact is written. When the procedure is invoked standalone, outside any map ticket, the branch SHALL be named `prototype/<question-slug>` derived from the design question. Prototype code SHALL exist only on that branch.

- Priority: must
- Rationale: today the throwaway branch is a closing act ("capture it when done"), so prototype code is born on the working branch and pollutes it until capture — and a skipped capture leaves it there. Gating on the branch makes the discipline structural: the branch name also serves as evidence that the prototype procedure actually ran.

#### Scenario: Branch created before code

- WHEN the prototype procedure begins resolving map ticket `03-storage-model` on map `payments-redesign`
- THEN a branch `prototype/payments-redesign/03-storage-model` is created from the current branch and checked out before the first prototype file is written

#### Scenario: Standalone invocation

- WHEN the prototype procedure is invoked directly with no map ticket in play
- THEN the branch is named `prototype/<question-slug>` and created from the current branch before any code is written

#### Scenario: Working branch stays clean

- WHEN a prototype resolution completes
- THEN the branch the session started on contains no prototype code, and the resolving ticket's body points at the `prototype/...` branch

## MODIFIED Requirements

### Requirement: Prototype capture at close

When the human reaches a verdict, the verdict is written into the resolving ticket's `## Answer` and the ticket body carries a pointer to the `prototype/<map-name>/<ticket-name>` branch holding the prototype, which remains reachable there rather than being deleted. Because the branch gate places the code on its branch from the start, the closing step commits any outstanding prototype work on that branch and returns to the branch the session started from; it no longer moves code off the working branch, because the code was never on it. Any validated decision is folded into the real artifact on the working branch; the prototype branch keeps only the throwaway.

- Priority: must
- Rationale: the capture rule predates the branch gate; with the gate in place its "move the code to a throwaway branch" half is obsolete, and leaving it unchanged would instruct a session to do work that no longer exists.

#### Scenario: Close after gated prototype

- WHEN the human reaches a verdict on a gated prototype
- THEN the prototype branch holds the committed prototype, the session returns to its starting branch, the verdict lands in the ticket's `## Answer`, and the ticket body links the prototype branch

## REMOVED Requirements

### Requirement: Upstream fidelity of procedure text

- Reason: the byte-identical-to-upstream invariant (and its adaptation-surface carve-out) governed only the initial fork of the ported procedures; the owner has confirmed the fork is complete and the skill text now evolves freely. Retaining the invariant would block every substantive improvement to the procedures, starting with this change's branch gate.
- Migration: none required — the ported skill texts as they stand remain valid; future edits simply need no upstream diffability justification. The related Decision prose in the canonical spec ("Upstream prose is carried across whole…", "Nothing is trimmed for being apparently unused") is superseded alongside the invariant at finish-work.

## RENAMED Requirements

*(none)*
