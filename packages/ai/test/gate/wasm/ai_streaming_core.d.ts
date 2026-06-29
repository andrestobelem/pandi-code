/* tslint:disable */
/* eslint-disable */
/**
 * `chunks_json` = `JSON.stringify` of a golden row's `chunks` (an array of chunk objects).
 * Deserializes to the exact `Vec<serde_json::Value>` the native conformance test feeds `decode_openai`.
 */
export function decode_openai_canonical(chunks_json: string, api: string, provider: string, model: string): string;
/**
 * One-call incremental analogue of `decode_anthropic_canonical`, driving the stateful decoder under
 * a feeding `schedule` in {"oneshot","recorded","byte"}. Canonicalization is single-sourced in Rust
 * so the JS gate is a pure string-equality check against the golden.
 */
export function decode_anthropic_incremental_canonical(chunks_json: string, schedule: string, api: string, provider: string, model: string): string;
/**
 * `chunks_json` = `JSON.stringify` of a golden row's `chunks` (an array of byte-arrays).
 * Deserializes to the exact `Vec<Vec<u8>>` the native conformance test feeds `decode_anthropic`.
 */
export function decode_anthropic_canonical(chunks_json: string, api: string, provider: string, model: string): string;
/**
 * JS-consumable streaming decoder: feed byte chunks (`Uint8Array`) one at a time via `push`, then
 * `finish`. Each method returns a canonical JSON ARRAY string of the events produced by THAT call
 * (`final_message` returns the canonical settled message). This is the genuinely incremental object
 * the future production adapter will drive for time-to-first-token.
 */
export class AnthropicIncrementalDecoder {
  free(): void;
  take_start(): string;
  final_message(): string;
  constructor(api: string, provider: string, model: string);
  push(chunk: Uint8Array): string;
  finish(): string;
}
