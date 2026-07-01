# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start here: AGENTS.md

**Read `AGENTS.md` before making any changes.** It is the authoritative rules file for this repo (conversational style, code quality, commands, git workflow, changelog, release process) and applies to Claude Code exactly as it does to other agents. This file only adds architecture context that AGENTS.md doesn't cover. Do not duplicate or restate AGENTS.md rules here — if the two ever conflict, AGENTS.md wins.

Key things from AGENTS.md worth internalizing immediately:
- Build from first principles: start simple, inspect state directly, verify assumptions, and make complexity earn its place.
- Use AI for acceleration, but treat prompts/context/tools/evals as program surfaces and verify outputs with inspectable evidence.
- Use `karpathy-guidelines` for code changes, `modern-software-engineering` for architecture/review/test strategy, and `ai-assisted-engineering` for AI delegation/workflow design.
- Use dynamic workflows only when they earn their cost; scout inline first, then graph/start background runs with explicit limits and inspect artifacts.
- When a task or workflow specifies the `openai` provider, use Codex models; when it specifies `anthropic`, use Claude models.
- For `pi-dynamic-workflows` onboarding, follow that repo's README Quickstart and `npm run doctor`; install/reload/trust extensions rather than guessing setup steps.
- After any code change, run `npm run check` (fixes/lints/type-checks everything) and fix all errors/warnings/infos before considering work done.
- Never run the full `npm test` / vitest suite directly (it activates real-provider e2e tests). Use `./test.sh` from repo root, or target a specific file from the package directory.
- Never run `npm run build` or `npm test` unless the user asks.
- Only stage and commit files you changed; never `git add -A`/`git add .`, never force-push, never `--no-verify`.
- Keep commits atomic; never add `Co-Authored-By:` or tool-attribution lines; never amend blindly without confirming `HEAD` is yours.
- Never touch `packages/ai/src/models.generated.ts` by hand — edit `packages/ai/scripts/generate-models.ts` and regenerate.

## Repository shape

This is the **pi agent harness** monorepo (npm workspaces, ESM, TypeScript, Node >=22.19). Four published packages plus one experimental one, built in dependency order:

```
packages/tui      -> packages/ai -> packages/agent -> packages/coding-agent -> packages/orchestrator
```

- **`packages/ai`** (`@earendil-works/pi-ai`) — unified multi-provider LLM API (Anthropic, OpenAI, Google, Bedrock, Vertex, Groq, Mistral, xAI, and many OpenAI-compatible providers under `src/providers/`). `src/index.ts` is deliberately side-effect-free/minimal — provider factories live under `providers/*`, wire-format implementations under `api/*`, and the legacy global API under `compat.ts`. `src/models.generated.ts` and `src/image-models.generated.ts` are generated catalogs; regenerate via `packages/ai/scripts/generate-models.ts`, never hand-edit. Auth/OAuth/credential storage lives in `src/auth/`.
  - **Rust/WASM streaming core**: `packages/ai/native/ai-streaming-core/` is a Rust crate compiled to WASM (`packages/ai/dist/wasm/`) that implements a stateful incremental SSE/streaming decoder as a parity-faithful, opt-in replacement for the TS streaming path. It's gated behind `PI_RUST_STREAMING` (default OFF) via `src/api/rust-streaming-loader.ts`; `scripts/check-wasm-source-hash.mjs` (run by `npm run check`) is a tripwire that fails if the Rust source changes without the compiled WASM being refreshed. See `packages/ai/native/ai-streaming-core/WASM_GATE.md` for the gate contract.
- **`packages/agent`** (`@earendil-works/pi-agent-core`) — provider-agnostic agent runtime: the tool-calling loop (`agent.ts`, `agent-loop.ts`), transport abstraction, and the reusable "harness" building blocks (`harness/`: system prompt assembly, prompt templates, skills, session persistence in `harness/session/` with a JSONL-backed repo, and context compaction in `harness/compaction/`). This package has no CLI/TUI/provider-selection concerns — those live in `coding-agent`.
- **`packages/coding-agent`** (`@earendil-works/pi-coding-agent`) — the `pi` CLI itself; the biggest package. `src/core/` holds the interactive session engine (`agent-session.ts`, `agent-session-runtime.ts`, `agent-session-services.ts`), built-in tools (`core/tools/`), the extension system (`core/extensions/`: loader/wrapper/runner for user-authored extensions), skills, slash commands, settings/config/trust management, and telemetry. `src/modes/` has the three run modes: `interactive` (TUI), `print-mode.ts` (`-p` one-shot), and `rpc/` (programmatic/SDK entry, also exposed via `rpc-entry.ts`). `src/bun/` supports the Bun-compiled binary distribution.
- **`packages/tui`** (`@earendil-works/pi-tui`) — standalone terminal UI library (differential rendering, editor component, keybindings, components) used by coding-agent's interactive mode. Has native prebuilds for darwin/win32.
- **`packages/orchestrator`** (`@earendil-works/pi-orchestrator`, experimental) — supervises/multiplexes multiple `pi` subprocesses over an IPC protocol (`src/ipc/`); not part of the core dependency chain.

## Extending pi's own behavior

Two independent extension surfaces exist in this repo, both scoped to *this* checkout (not the packages being built):

- **`.claude/`** — Claude Code's own config: skills, commands, and dynamic **workflows** (multi-agent orchestration scripts consumed by the `Workflow` tool).
- **`.pi/`** — the `pi` CLI's own dogfood config for this repo: `.pi/extensions/` (TS extensions loaded into local `pi` sessions), `.pi/prompts/` (slash-command prompt templates like `wr`, `pr`, `sa`, `cl`, `is`), `.pi/skills/`.

Don't confuse the two — a change under `.pi/` affects how `pi` behaves when run from this repo; a change under `.claude/` affects how Claude Code behaves in this repo.

## Common commands

```bash
npm install --ignore-scripts   # install deps without lifecycle scripts
npm run build                  # build all packages, in dependency order
npm run check                  # biome (lint+format+write) + pinned-deps + ts-imports + shrinkwrap + wasm-hash + tsgo typecheck + browser-smoke
./test.sh                      # run tests with provider API keys/OAuth stripped from env (see script for the full unset list)
./pi-test.sh                   # run pi from source, from any directory
```

Running a single test (per AGENTS.md — never run the bare vitest suite):

```bash
cd packages/<pkg> && node ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts
```

`packages/tui` uses Node's built-in test runner instead of vitest: `node --test test/*.test.ts`.

`packages/coding-agent/test/suite/` is a separate harness-based suite (`test/suite/harness.ts` + a faux provider) that must never call real provider APIs — see AGENTS.md for where issue regressions go (`test/suite/regressions/<issue>-<slug>.test.ts`).
