---
status: accepted
---

# Consume upstream Pi libraries under their upstream package names

Pandi will publish the application as `pandi-code` while continuing to consume reusable Pi libraries under their existing `@earendil-works/*` identities. Those libraries remain upstream dependencies and compatibility contracts, not Pandi-owned publication targets; renaming them now would duplicate maintenance, fragment extension imports, and imply npm ownership that this repository does not have.

## Package inventory

| Workspace or package | Relationship | Decision |
|---|---|---|
| `pandi-code` | Pandi application, CLI, SDK, and extension host | Publish from this repository. |
| `@earendil-works/pi-ai` | Published upstream LLM library; used by agent core, storage, and Pandi | Keep the upstream name and consume an upstream-published version. |
| `@earendil-works/pi-agent-core` | Published upstream runtime; depends on `pi-ai`; used by storage and Pandi | Keep the upstream name and consume an upstream-published version. |
| `@earendil-works/pi-tui` | Published upstream terminal UI library; used by Pandi | Keep the upstream name and consume an upstream-published version. |
| `@earendil-works/pi-storage-sqlite-node` | Published upstream storage adapter; depends on `pi-ai` and `pi-agent-core` | Keep the upstream name; do not publish it from Pandi. |
| `@earendil-works/pi-server` | Unpublished experimental workspace; depends on `pandi-code` | Keep it workspace-only and exclude it from publication. Give it a Pandi-owned identity before any future public release. |
| `pandi-code-install` | Private generated installer lock root | Keep private; it is a release artifact, not a package publication. |
| `pi-monorepo` | Private workspace root | Keep private; its name has no registry or runtime compatibility effect. |
| `pi-extension-*` examples | Private example workspaces | Keep private. Their retained `pi` manifest key is part of upstream package compatibility. |

Local builds and release smoke tests may pack the upstream workspaces from this checkout to test the exact integrated source tree. That does not make those tarballs publication targets.

## Considered options

### Keep upstream identities

This preserves existing extension imports, avoids duplicate copies of shared runtime and TUI types, and lets Pandi synchronize reusable library code directly from Pi. It also matches npm ownership: the `@earendil-works` scope is maintained upstream.

### Fork every library into a Pandi namespace

This would provide independent publication control, but every package manifest, source import, TypeScript path, lockfile, generated artifact, example, and extension alias would need an expand-contract migration. Pandi would also become responsible for publishing and maintaining parallel AI, agent, TUI, and storage libraries. That cost is not justified while those workspaces remain upstream-compatible.

## Consequences

- Pandi release automation must publish only Pandi-owned packages, currently `pandi-code`. It must never attempt to publish `@earendil-works/*` packages.
- `pandi-code` dependency ranges must resolve to versions already published by Earendil Works. A release must verify those versions before tagging.
- The vendored upstream library workspaces should remain synchronized with Pi. Reusable changes should be contributed upstream where practical instead of creating silent Pandi-only forks.
- Pandi keeps extension aliases for `pandi-code`, `@earendil-works/pi-coding-agent`, and legacy `@mariozechner/*` imports. The package manifest key remains `pi` for ecosystem compatibility.
- The experimental server remains unpublished. Publishing it requires a separate decision on its supported API and a Pandi-owned package name.

Reconsider this decision if Pandi requires sustained incompatible library changes, upstream packages become unavailable, or Pandi establishes a package namespace and accepts the ongoing parallel-release burden.
