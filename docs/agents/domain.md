# Domain Docs

How engineering skills should consume this repository's domain documentation.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repository root. It points to the `CONTEXT.md` files relevant to each package or bounded context.
- **`docs/adr/`** for system-wide architectural decisions.
- **`packages/<context>/docs/adr/`** for package-specific decisions.

Read each `CONTEXT.md` and ADR relevant to the area being changed.

If these files do not exist, proceed silently. Do not suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terminology or decisions are resolved.

## File structure

This repository uses a multi-context layout:

```text
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/
└── packages/
    └── <context>/
        ├── CONTEXT.md
        ├── docs/
        │   └── adr/
        └── src/
```

`CONTEXT-MAP.md` identifies which package contexts apply to a task and links to their documentation.

## Use the glossary's vocabulary

When output names a domain concept—in an issue title, refactor proposal, hypothesis, or test name—use the term defined in the relevant `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If a required concept is absent, reconsider whether the term belongs to the project or record the gap for `/domain-modeling`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface the conflict explicitly rather than silently overriding it:

> Contradicts ADR-0007 (event-sourced orders), but worth reopening because…
