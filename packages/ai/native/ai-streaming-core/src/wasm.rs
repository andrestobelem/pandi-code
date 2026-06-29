//! wasm-bindgen FFI shim over the UNCHANGED pure decoders, exercised by the JS integration gates
//! (packages/ai/test/gate/wasm-integration.test.ts one-shot, wasm-incremental.test.ts streaming).
//! NOT wired into production `src/`.
//!
//! Increment 4: the one-shot shims `decode_anthropic_canonical` / `decode_openai_canonical` (whole
//! input as a JSON string -> whole canonical transcript string).
//! Increment 5: the streaming `AnthropicIncrementalDecoder` class (feed `Uint8Array` chunks one at a
//! time, drain events per push) + `decode_anthropic_incremental_canonical` (one call, a feeding
//! `schedule`, the whole canonical transcript) — the genuinely incremental boundary.
//!
//! Compiled ONLY for wasm32 (see the cfg-gated `pub mod wasm;` in lib.rs), so the native
//! conformance build (`cargo test --features gate`) never sees wasm-bindgen.

use wasm_bindgen::prelude::*;

use crate::{canonical, decode_anthropic, decode_openai, js_obj, AnthropicStreamDecoder, JsVal};

/// `chunks_json` = `JSON.stringify` of a golden row's `chunks` (an array of byte-arrays).
/// Deserializes to the exact `Vec<Vec<u8>>` the native conformance test feeds `decode_anthropic`.
#[wasm_bindgen]
pub fn decode_anthropic_canonical(
    chunks_json: &str,
    api: &str,
    provider: &str,
    model: &str,
) -> Result<String, JsError> {
    let chunks: Vec<Vec<u8>> =
        serde_json::from_str(chunks_json).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(canonical(&decode_anthropic(&chunks, api, provider, model)))
}

/// `chunks_json` = `JSON.stringify` of a golden row's `chunks` (an array of chunk objects).
/// Deserializes to the exact `Vec<serde_json::Value>` the native conformance test feeds `decode_openai`.
#[wasm_bindgen]
pub fn decode_openai_canonical(
    chunks_json: &str,
    api: &str,
    provider: &str,
    model: &str,
) -> Result<String, JsError> {
    let chunks: Vec<serde_json::Value> =
        serde_json::from_str(chunks_json).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(canonical(&decode_openai(&chunks, api, provider, model)))
}

// ── Increment 5: incremental (streaming) Anthropic decoder across the boundary ──

/// JS-consumable streaming decoder: feed byte chunks (`Uint8Array`) one at a time via `push`, then
/// `finish`. Each method returns a canonical JSON ARRAY string of the events produced by THAT call
/// (`final_message` returns the canonical settled message). This is the genuinely incremental object
/// the future production adapter will drive for time-to-first-token.
#[wasm_bindgen]
pub struct AnthropicIncrementalDecoder(AnthropicStreamDecoder);

#[wasm_bindgen]
impl AnthropicIncrementalDecoder {
    #[wasm_bindgen(constructor)]
    pub fn new(api: &str, provider: &str, model: &str) -> Self {
        Self(AnthropicStreamDecoder::new(api, provider, model))
    }

    pub fn take_start(&mut self) -> String {
        canonical(&JsVal::Arr(self.0.take_start()))
    }

    pub fn push(&mut self, chunk: &[u8]) -> String {
        canonical(&JsVal::Arr(self.0.push(chunk)))
    }

    pub fn finish(&mut self) -> String {
        canonical(&JsVal::Arr(self.0.finish()))
    }

    pub fn final_message(&self) -> String {
        canonical(&self.0.final_message())
    }
}

/// One-call incremental analogue of `decode_anthropic_canonical`, driving the stateful decoder under
/// a feeding `schedule` in {"oneshot","recorded","byte"}. Canonicalization is single-sourced in Rust
/// so the JS gate is a pure string-equality check against the golden.
#[wasm_bindgen]
pub fn decode_anthropic_incremental_canonical(
    chunks_json: &str,
    schedule: &str,
    api: &str,
    provider: &str,
    model: &str,
) -> Result<String, JsError> {
    let chunks: Vec<Vec<u8>> =
        serde_json::from_str(chunks_json).map_err(|e| JsError::new(&e.to_string()))?;
    let seq: Vec<Vec<u8>> = match schedule {
        "oneshot" => vec![chunks.concat()],
        "recorded" => chunks,
        "byte" => chunks.concat().into_iter().map(|b| vec![b]).collect(),
        other => return Err(JsError::new(&format!("unknown schedule {other}"))),
    };
    let mut d = AnthropicStreamDecoder::new(api, provider, model);
    let mut events = d.take_start();
    for c in &seq {
        events.extend(d.push(c));
    }
    events.extend(d.finish());
    Ok(canonical(&js_obj(vec![
        ("events", JsVal::Arr(events)),
        ("final", d.final_message()),
    ])))
}
