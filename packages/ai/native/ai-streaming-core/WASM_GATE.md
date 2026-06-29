# WASM FFI integration gate (Increment 4)

This crate's pure decoders (`decode_anthropic`, `decode_openai`, `canonical`) are validated
**in-process** by the native conformance tests (`cargo test --features gate`, the 18 anthropic +
38 openai + partial-json golden rows). Increment 4 re-asserts the **same equality** with the
**same decoders** and the **same goldens**, but routed through a real **JS ↔ Rust wasm-bindgen
boundary**. If the wasm transcript still matches the golden, the boundary marshalling is faithful.

This is the FFI step of the streaming-core migration: prove the decoders cross the language
boundary correctly, before any later increment wires Rust into production `src/` behind a flag.

## Boundary contract

`src/wasm.rs` (compiled **only** for `wasm32`, behind `#[cfg(target_arch = "wasm32")]`) exposes two
thin shims over the unchanged pure decoders, with a uniform string-in / string-out contract:

```
decode_anthropic_canonical(chunks_json, api, provider, model) -> canonical transcript (String)
decode_openai_canonical(chunks_json, api, provider, model)    -> canonical transcript (String)
```

`chunks_json` is `JSON.stringify` of a golden row's `chunks` field — an array of byte-arrays for
anthropic (`Vec<Vec<u8>>`), an array of chunk objects for openai (`Vec<serde_json::Value>`). The
shim deserializes into the **exact** types the native conformance tests feed the decoders, then
returns `canonical(&decode_*(...))`. Malformed JSON maps to a `JsError` (a catchable JS throw),
never a wasm trap.

The JS gate is `packages/ai/test/gate/wasm-integration.test.ts`. It loads the **committed** wasm
under `test/gate/wasm/` and asserts every golden row reproduces across the boundary. Because the
artifact is committed, the gate runs in CI via `npm test` with **no Rust toolchain**.

## Why the artifact is committed (and the `package.json` sidecar)

`test/gate/wasm/` holds generated, committed files (mirrors `packages/tui`'s committed prebuilt
`.node`, but a single platform-independent `.wasm` — no per-platform matrix):

- `ai_streaming_core.js` — wasm-bindgen `--target nodejs` glue (CommonJS).
- `ai_streaming_core_bg.wasm` — the binary module.
- `ai_streaming_core.d.ts`, `ai_streaming_core_bg.wasm.d.ts` — type stubs.
- `package.json` → `{ "type": "commonjs" }` — **hand-committed sidecar**. `packages/ai` is
  `"type":"module"`, so without this the CJS glue throws `module is not defined in ES module scope`
  when loaded. The sidecar scopes this dir back to CommonJS. It is not matched by the `packages/*`
  workspace glob and has no dependency sections, so it is invisible to workspace tooling.

## Regenerating the artifact

One-time toolchain setup (this is a developer/local step; CI never does it):

```
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.100   # MUST equal the Cargo.toml wasm-bindgen pin
```

Then, from `packages/ai/`:

```
npm run gate:wasm:build
```

which runs `cargo build --target wasm32-unknown-unknown --release` + `wasm-bindgen --target nodejs
--out-dir test/gate/wasm …`. `~/.cargo/bin` must be on `PATH`. The `wasm-bindgen` crate dependency
version (`Cargo.toml`) and the installed `wasm-bindgen-cli` version **must be identical**, or the
`.wasm` will not instantiate. `rust-toolchain.toml` pins the channel + target used.

After a rebuild, the sidecar `package.json` already lives in the out-dir (committed); the raw
two-step CLI does not emit one, so it is preserved.

## Staleness — what is and is NOT caught (no silent caps)

The committed wasm is generated once on a dev box; CI cannot rebuild it. So:

**Caught by the CI vitest gate:** a committed wasm whose decode logic disagrees with any golden
row, and coverage drift (rows asserted ≠ 56 / corpus truncation).

**NOT caught:**

1. **Stale-but-correct.** A wasm built from *older* Rust that still reproduces every golden row
   passes silently, forever. The gate proves *"committed wasm reproduces goldens"*, NOT
   *"committed wasm == build(current `src/`)"*.
2. **Uncovered behavior.** Rust changes on paths no golden exercises are invisible to both the
   vitest gate and the behavioral staleness check below.

**Compensating control (discipline, not enforced):** rebuild + recommit the wasm in the same PR
that touches `native/ai-streaming-core/src/` — mirroring the existing "commit fixture + Rust
together" rule for the golden generators.

**`npm run gate:wasm:check`** (local-only; needs the toolchain) rebuilds into a temp dir and re-runs
all 56 goldens through the freshly built wasm (behavioral re-equivalence — the trustworthy signal).
`-- --bytes` additionally byte-compares against the committed files, but wasm-bindgen output is not
bit-reproducible across toolchain versions/machines, so `--bytes` is meaningful only same-box /
same-toolchain and must never be a hard cross-machine gate.

## Input-path fidelity caveat

The boundary input path is `JS JSON.parse(golden) -> JSON.stringify(row.chunks) -> serde_json::
from_str`, whereas the native test reads the golden text straight into serde. The intermediate JS
re-serialization is a transform the native path never performs. It is verified **lossless for the
current corpus** (all anthropic bytes are integers in 0..=255; all openai chunk numbers round-trip
stably). A future fixture containing a float, an exponent, a `> 2^53` integer, or `-0` could
`JSON.stringify` to a different lexical form — re-check fidelity before relying on the gate for such
a fixture. The test includes a u8 range pre-check to surface a non-u8 anthropic fixture as a
readable assertion rather than an opaque serde error.

## Out of scope

Wiring Rust into production `src/` (the `PI_RUST_STREAMING` swap); NAPI / native `.node`;
multi-platform prebuilds; a partial-json wasm export; OpenAI incremental decode; any CI change
(no Rust toolchain in `ci.yml`). The behavioral gate rides the existing `npm test`; the staleness
guard and `gate:rust` stay manual/local. (Increment 5 added the Anthropic *incremental* decoder
below — still gate-only, no production wiring.)

## Increment 5 — incremental (streaming) Anthropic decoder

The decoder is split into a stateful core `AnthropicStreamDecoder` (`new` / `take_start` /
`push(&[u8])` / `finish` / `final_message`) in `src/anthropic.rs`; the one-shot `decode_anthropic`
is re-expressed on top of it (`new + push(each chunk) + finish`), so the unchanged one-shot gate
(`anthropic_conformance.rs`) is the proof the split is byte-identical. `src/sse.rs` similarly exposes
`SseFramer` (`new`/`push`/`flush`); `parse_sse` is now a thin wrapper over it.

**Boundary (`wasm.rs`, wasm32-only):** `AnthropicIncrementalDecoder` — a JS class: feed a
`Uint8Array` per `push`, each call returns a canonical JSON array string of the events it produced,
`final_message` returns the canonical settled message. Plus `decode_anthropic_incremental_canonical(
chunks_json, schedule, …)` — one call that canonicalizes `{events, final}` in Rust, so the JS gate
is a pure string-equality check.

**Three feeding schedules** (`anthropic_incremental_conformance.rs` cargo + `wasm-incremental.test.ts`
JS): `oneshot` (all bytes one push — the floor proving the wrapper still matches), `recorded` (the
recorded network chunks — NOT new coverage; `parse_sse` already loops over those boundaries), and
**`byte`** (every byte its own push — the genuinely new coverage: incomplete-multibyte carry via
`Utf8Stream.pending`, mid-line/mid-event/mid-json line buffering, terminal deferral across arbitrary
splits). All assert `== row.expected`; the JS class path additionally cross-checks against the
convenience fn's `recorded` output (so the per-push boundary marshalling is proven to agree).

**Latch-and-defer terminal contract:** `push` never emits the terminal done/error. A terminal
(event:error / parse-fail → `terminal`; unhandled stop reason → `runtime_error`) is latched and
drained in `finish` (precedence: runtime_error > terminal > ended-before-message_stop). After a latch,
all further events are dropped — faithful to the former `iterate_anthropic_events` early-return and
`break 'assembly`.

**Two fixtures added** (corpus 13→15) to make the new coverage real — the adversarial review found the
prior corpus was 100% ASCII with no unhandled-stop case: `multibyte-text-emoji-cjk` (2/3/4-byte UTF-8;
exercises `Utf8Stream.pending` under the `byte` schedule) and `unhandled-stop-reason` (drives the
`runtime_error` path and proves post-terminal content is suppressed).

**Corpus harvest (15→17).** A dedicated pass over the original anthropic SSE tests harvested two more
genuinely-new decoder dimensions the prior corpus missed: `cache-write-1h-breakdown` (non-zero
`usage.cacheWrite` plus `usage.cacheWrite1h` from `message_start`'s `cache_creation.ephemeral_1h_input_tokens`
— every other fixture pins both to 0) and `thinking-empty-signature` (a thinking block that receives no
`signature_delta`, settling with `thinkingSignature:""` — the existing thinking fixture settles at
`"sig-abc"`). The Rust decoder already ported both fields, so `gate:rust` reproduced all 17 with no
`src/` change (the gate confirming the port was faithful, not flagging a gap).

**Phase 0 — progressive message-level fields (`message_meta`, corpus 17→18).** Decision A of the
production-swap design: the decoder now emits two discrete `message_meta` canonical events at the
byte-deterministic set-points — `phase:"start"` (responseId + initial usage) right after the `start`
event, and `phase:"delta"` (stopReason + errorMessage-if-any + merged usage) right before the terminal,
emitted ONLY when the `message_delta` arm completes (so the unhandled-stop / ended-before-stop /
event:error fixtures carry start-meta only). This closes the mid-stream parity gap the design found: the
TS path carries usage/responseId/stopReason on every `partial`, but the decoder previously emitted
nothing at those points. It is gated DIFFERENTIALLY without touching the wire protocol — a GATE-ONLY
`onMeta` callback on `AnthropicOptions` (same injection category as `client`, undefined in production)
fires synchronously at the TS set-points, and the replay harness splices the normalized meta events into
the oracle transcript at the same fixed positions the Rust decoder emits them, so the gate verifies them
with no consumer-drain timing dependence. `meta_usage()` is the single shared source for both `snapshot`
and the meta events. The +1 fixture `delta-meta-then-ended-before-stop` locks the gate's independence
(delta-meta.stopReason `stop` vs final `error`). Counts are now 18 anthropic + 38 openai = 56 one-shot
(+ 18×3 incremental); the message_meta events live inside each row's transcript and do not change row
counts. STILL no production wiring (no adapter yet).

**Still gate-only.** Forward-looking, NOT implemented: a production `PI_RUST_STREAMING` adapter would,
in `anthropic-messages.ts` `stream()`, replace the `iterateSseMessages` / `iterateAnthropicEvents`
byte loop — feed `response.body` reader chunks to `AnthropicIncrementalDecoder.push`, route the
returned events to `stream.push`, and keep the abort/error path in the TS adapter (the decoder owns
neither I/O nor cancellation).

## tsgo / biome notes

The generated `.d.ts` matches the root `tsconfig` `packages/*/test/**` include but is safe only
because `skipLibCheck: true` (don't flip that without re-checking the bindgen types). `biome.json`
excludes `packages/ai/test/gate/wasm/**`; the `.js`/`.wasm` are out of biome's `*.ts` scope anyway.
