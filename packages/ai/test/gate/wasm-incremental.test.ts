// Increment 5 — WASM INCREMENTAL (streaming) INTEGRATION GATE (Anthropic).
//
// Proves the STATEFUL AnthropicStreamDecoder, driven across the real JS<->Rust wasm-bindgen
// boundary, reproduces the committed goldens under three feeding schedules — including byte-at-a-time
// (maximal fragmentation), the genuinely new coverage that the one-shot gate (and re-feeding the
// recorded chunks, which parse_sse already loops over) cannot reach: incomplete-multibyte carry,
// mid-line/mid-event/mid-json-fragment line buffering, and terminal deferral across arbitrary splits.
//
// Two assertion paths, both against the COMMITTED wasm (no Rust toolchain; runs in CI via `npm test`):
//   - convenience fn: decode_anthropic_incremental_canonical(chunks, schedule, ...) === golden, ×3 schedules.
//     Canonicalization is single-sourced in Rust, so this is a pure string-equality check.
//   - class path: drive `new AnthropicIncrementalDecoder` with a real Uint8Array per recorded chunk
//     (take_start -> push* -> finish), accumulate, and cross-check the assembled {events, final}
//     against the convenience fn's "recorded" output — proving the per-push boundary marshalling agrees.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type GoldenRow = {
	name: string;
	api: string;
	provider: string;
	model: string;
	chunks: unknown[];
	expected: string;
};

type IncrementalDecoder = {
	take_start(): string;
	push(chunk: Uint8Array): string;
	finish(): string;
	final_message(): string;
};

type WasmIncrementalGate = {
	decode_anthropic_incremental_canonical(
		chunksJson: string,
		schedule: string,
		api: string,
		provider: string,
		model: string,
	): string;
	AnthropicIncrementalDecoder: new (api: string, provider: string, model: string) => IncrementalDecoder;
};

const here = dirname(fileURLToPath(import.meta.url));
const requireCjs = createRequire(import.meta.url);
const wasm = requireCjs(join(here, "wasm", "ai_streaming_core.js")) as WasmIncrementalGate;

const anthropicGolden = JSON.parse(
	readFileSync(join(here, "fixtures", "anthropic.golden.json"), "utf8"),
) as GoldenRow[];

const SCHEDULES = ["oneshot", "recorded", "byte"];

let rowsAsserted = 0;

describe("wasm incremental FFI gate (stateful streaming decoder across the boundary)", () => {
	it("covers the full committed anthropic corpus (no silent truncation)", () => {
		expect(anthropicGolden.length).toBe(18);
	});

	for (const row of anthropicGolden) {
		for (const schedule of SCHEDULES) {
			it(`anthropic '${row.name}' [${schedule}] reproduces golden via the convenience fn`, () => {
				// u8 sanity: surface a future non-u8 fixture as a readable JS assertion.
				for (const chunk of row.chunks as number[][]) {
					for (const b of chunk) {
						expect(Number.isInteger(b) && b >= 0 && b <= 255).toBe(true);
					}
				}
				const out = wasm.decode_anthropic_incremental_canonical(
					JSON.stringify(row.chunks),
					schedule,
					row.api,
					row.provider,
					row.model,
				);
				expect(out).toBe(row.expected);
				rowsAsserted++;
			});
		}

		it(`anthropic '${row.name}' class path (per-chunk Uint8Array) matches the convenience fn`, () => {
			const dec = new wasm.AnthropicIncrementalDecoder(row.api, row.provider, row.model);
			const events: unknown[] = JSON.parse(dec.take_start()) as unknown[];
			for (const chunk of row.chunks as number[][]) {
				events.push(...(JSON.parse(dec.push(new Uint8Array(chunk))) as unknown[]));
			}
			events.push(...(JSON.parse(dec.finish()) as unknown[]));
			const classResult = { events, final: JSON.parse(dec.final_message()) as unknown };
			const recorded = wasm.decode_anthropic_incremental_canonical(
				JSON.stringify(row.chunks),
				"recorded",
				row.api,
				row.provider,
				row.model,
			);
			expect(classResult).toEqual(JSON.parse(recorded));
			rowsAsserted++;
		});
	}

	it("asserted exactly 72 rows (18 × 3 convenience + 18 class)", () => {
		expect(rowsAsserted).toBe(72);
	});
});
