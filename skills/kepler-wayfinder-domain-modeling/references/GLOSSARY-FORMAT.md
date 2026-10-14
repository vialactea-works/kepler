# Working glossary.md format

This bare Markdown format applies only to `.kepler/maps/<effort>/glossary.md`, which is outside artifact lint. The canonical `.kepler/specs/glossary.md` is a `requirements-spec` artifact: create it from the installed `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/glossary.md`, preserve requirements-spec metadata and the five canonical sections, then run `kepler workbench lint --file <spec-path>`. Do not reject a lint-valid canonical glossary because it differs from this working-note format.

## Structure

```md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Order**:
{A one or two sentence description of the term}
_Avoid_: Purchase, transaction
_Source_: docs/ordering.md#orders

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request
_Source_: docs/billing.md#invoices

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account
_Source_: docs/customers.md#customer
```

## Rules

- **Scope meanings.** The same word may have different meanings in different bounded contexts. Use the context heading to qualify entries; never overwrite a definition in another context. If a context boundary is uncertain, resolve it rather than inferring one from a package name.
- **Aliases and sources.** Pick a canonical term within its context, record relevant aliases or terms to avoid, and cite the project document or recorded requester decision that establishes the meaning. Proposed or conflicting meanings remain working notes until explicitly resolved.
- **Keep definitions tight.** Use one or two sentences. Define what the term IS, not what it does.
- **Only include terms specific to this project's context.** General programming concepts (timeouts, error types, utility patterns) do not belong, even if the project uses them extensively. Before adding a term, ask whether it is unique to this context or a general programming concept. Include only the former.
- **Group terms under subheadings** when natural clusters emerge. If all terms belong to a single cohesive area, a flat list is fine.

## Working and canonical scope

Guidance for the skill, not part of the glossary a session writes.

`kepler-init` establishes the canonical glossary; preserve an existing or migrated glossary and its author. Under Contract, give canonical entries Term, Definition, Bounded context, Aliases / terms to avoid, and Source fields. Keep other required sections concise and vocabulary-focused; they do not hold implementation decisions. Existing lint-valid canonical formats remain valid and need no reformat merely to adopt these fields.

Read the project's committed terms from `.kepler/specs/glossary.md` when it exists. Each current effort may keep a working glossary under its own `.kepler/maps/<effort>/`; create that file lazily when the first working term is resolved. Never read another effort's working glossary. When an effort closes, the Wayfinder closing act folds resolved terms into the canonical spec using its lint-valid requirements-spec format. The presence or absence of a working file does not change the canonical artifact's format.
