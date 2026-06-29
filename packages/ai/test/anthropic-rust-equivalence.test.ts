// PI_RUST_STREAMING flag-gate equivalence test (the key verification for the production swap).
//
// Drives the REAL anthropic stream() twice over each recorded golden row's byte chunks — OFF
// (options.env = {}) vs ON (options.env = { PI_RUST_STREAMING: "1" }) — via the same options.client
// seam the gate harness uses, and asserts the two are behavior-equivalent:
//   - the drained event SEQUENCE (type + key-set + contentIndex/delta/content/reason); the aliased
//     per-event {partial} snapshot is excluded (consumer-drain timing artifact — the contract-gate
//     settled-parts rule), and
//   - the settled message (content + usage incl. cost + stopReason/errorMessage/responseId; timestamp
//     excluded).
// Plus: abort-injection (fixture replay is blind to abort), flag-OFF does zero wasm load, process.env
// force-OFF wins (kill switch), streamSimple inherits the branch, an adapter-origin throw does NOT
// fall back to TS, and a load failure DOES fall back to TS.
//
// In vitest the loader resolves the real glue from test/gate/wasm (its dev candidate), so the ON path
// exercises the actual Rust wasm decoder.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stream as streamAnthropic } from "../src/api/anthropic-messages.ts";
import { buildBaseOptions } from "../src/api/simple-options.ts";
import { getModel } from "../src/compat.ts";
import type { AssistantMessage, AssistantMessageEvent, Context } from "../src/types.ts";

// Mock the loader so individual tests can control it; the DEFAULT delegates to the real loader, so
// the equivalence/abort cases drive the genuine wasm decoder. anthropic-messages.ts imports the same
// (mocked) module, so the spy observes its calls.
vi.mock("../src/api/rust-streaming-loader.ts", async (importActual) => {
	const actual = await importActual<typeof import("../src/api/rust-streaming-loader.ts")>();
	return { ...actual, loadRustStreaming: vi.fn(actual.loadRustStreaming) };
});

import { loadRustStreaming } from "../src/api/rust-streaming-loader.ts";

const here = dirname(fileURLToPath(import.meta.url));
type Row = { name: string; api: string; provider: string; model: string; chunks: number[][]; expected: string };
const golden = JSON.parse(readFileSync(join(here, "gate/fixtures/anthropic.golden.json"), "utf8")) as Row[];

const context: Context = { messages: [{ role: "user", content: "x", timestamp: 0 }] };

function fakeClient(chunks: number[][]): Anthropic {
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const bytes of chunks) controller.enqueue(new Uint8Array(bytes));
			controller.close();
		},
	});
	const response = new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
	return { messages: { create: () => ({ asResponse: async () => response }) } } as unknown as Anthropic;
}

// Event sequence WITHOUT the aliased per-event {partial} snapshot (timing artifact). Keeps the key-set
// so a shape divergence (e.g. toolCall vs snapshot) still fails.
function normalizeSeq(events: AssistantMessageEvent[]) {
	return events.map((e) => {
		const r = e as unknown as Record<string, unknown>;
		return {
			type: r.type,
			keys: Object.keys(r).sort().join(","),
			contentIndex: r.contentIndex,
			delta: r.delta,
			content: r.content,
			reason: r.reason,
		};
	});
}

// Settled message minus the only non-deterministic field (timestamp). Keeps content + usage (incl. cost).
function settled(m: AssistantMessage) {
	const clone = structuredClone(m) as AssistantMessage & { timestamp?: number };
	delete clone.timestamp;
	return clone;
}

async function drain(s: AsyncIterable<AssistantMessageEvent>): Promise<AssistantMessageEvent[]> {
	const out: AssistantMessageEvent[] = [];
	for await (const e of s) out.push(e);
	return out;
}

afterEach(() => {
	vi.mocked(loadRustStreaming).mockClear();
	vi.mocked(loadRustStreaming).mockRestore?.();
});

describe("PI_RUST_STREAMING flag-gate equivalence (OFF vs ON over recorded goldens)", () => {
	for (const row of golden) {
		it(`'${row.name}' is behavior-equivalent OFF vs ON`, async () => {
			const model = getModel("anthropic", "claude-haiku-4-5");

			const offStream = streamAnthropic(model, context, { client: fakeClient(row.chunks), env: {} });
			const offEvents = await drain(offStream);
			const offFinal = settled(await offStream.result());

			const onStream = streamAnthropic(model, context, {
				client: fakeClient(row.chunks),
				env: { PI_RUST_STREAMING: "1" },
			});
			const onEvents = await drain(onStream);
			const onFinal = settled(await onStream.result());

			expect(normalizeSeq(onEvents)).toEqual(normalizeSeq(offEvents));
			expect(onFinal).toEqual(offFinal);
		});
	}
});

describe("PI_RUST_STREAMING flag-gate safety properties", () => {
	it("abort mid-stream yields stopReason 'aborted' on BOTH paths (overriding any latched terminal)", async () => {
		const row = golden.find((r) => /error/i.test(r.name)) ?? golden[0];
		const model = getModel("anthropic", "claude-haiku-4-5");

		async function run(env: Record<string, string>) {
			const ac = new AbortController();
			ac.abort(); // pre-abort: the terminal block's signal.aborted check wins over any stopReason
			const s = streamAnthropic(model, context, { client: fakeClient(row.chunks), env, signal: ac.signal });
			return drain(s);
		}
		const off = await run({});
		const on = await run({ PI_RUST_STREAMING: "1" });
		const term = (evs: AssistantMessageEvent[]) =>
			evs[evs.length - 1] as { type: string; reason?: string; error?: AssistantMessage };
		expect(term(off).type).toBe("error");
		expect(term(off).reason).toBe("aborted");
		expect(term(on).reason).toBe(term(off).reason);
		expect(term(on).error?.errorMessage).toBe(term(off).error?.errorMessage);
	});

	it("flag-OFF performs ZERO wasm load", async () => {
		const model = getModel("anthropic", "claude-haiku-4-5");
		await drain(streamAnthropic(model, context, { client: fakeClient(golden[0].chunks), env: {} }));
		expect(loadRustStreaming).not.toHaveBeenCalled();
	});

	it("process.env force-OFF wins over options.env (kill switch)", async () => {
		const model = getModel("anthropic", "claude-haiku-4-5");
		const prev = process.env.PI_RUST_STREAMING;
		process.env.PI_RUST_STREAMING = "0";
		try {
			await drain(
				streamAnthropic(model, context, { client: fakeClient(golden[0].chunks), env: { PI_RUST_STREAMING: "1" } }),
			);
			expect(loadRustStreaming).not.toHaveBeenCalled();
		} finally {
			if (prev === undefined) delete process.env.PI_RUST_STREAMING;
			else process.env.PI_RUST_STREAMING = prev;
		}
	});

	it("streamSimple inherits the branch (forwards options.env into the stream() options)", () => {
		// streamSimple delegates to stream() with `{ ...buildBaseOptions(...) }`, so the flag branch is
		// inherited iff env is forwarded. assert that mechanism directly (streamSimple takes no client,
		// so an end-to-end replay through it is not possible).
		const model = getModel("anthropic", "claude-haiku-4-5");
		const base = buildBaseOptions(model, context, { env: { PI_RUST_STREAMING: "1" } }, undefined);
		expect(base.env).toEqual({ PI_RUST_STREAMING: "1" });
	});

	it("an adapter-origin throw does NOT fall back to TS and tags the path", async () => {
		const model = getModel("anthropic", "claude-haiku-4-5");
		vi.mocked(loadRustStreaming).mockReturnValueOnce({
			AnthropicIncrementalDecoder: class {
				take_start() {
					return "[]";
				}
				push() {
					throw new Error("boom-adapter");
				}
				finish() {
					return "[]";
				}
				final_message() {
					return "{}";
				}
				free() {}
			},
		} as unknown as ReturnType<typeof loadRustStreaming>);

		const onPath = vi.fn();
		const evs = await drain(
			streamAnthropic(model, context, {
				client: fakeClient(golden[0].chunks),
				env: { PI_RUST_STREAMING: "1" },
				onPath,
			}),
		);
		const term = evs[evs.length - 1] as { type: string; error?: AssistantMessage };
		expect(term.type).toBe("error"); // surfaced as a stream error, NOT silently TS-served
		expect(term.error?.errorMessage).toBe("boom-adapter");
		expect(onPath).toHaveBeenCalledWith(expect.objectContaining({ path: "rust", error: "adapter" }));
	});

	it("a load failure DOES fall back to the TS path", async () => {
		const model = getModel("anthropic", "claude-haiku-4-5");
		const off = await drain(streamAnthropic(model, context, { client: fakeClient(golden[0].chunks), env: {} }));
		vi.mocked(loadRustStreaming).mockImplementationOnce(() => {
			throw new Error("glue not found");
		});
		const onPath = vi.fn();
		const on = await drain(
			streamAnthropic(model, context, {
				client: fakeClient(golden[0].chunks),
				env: { PI_RUST_STREAMING: "1" },
				onPath,
			}),
		);
		expect(normalizeSeq(on)).toEqual(normalizeSeq(off)); // identical to OFF — fell back to TS
		expect(onPath).toHaveBeenCalledWith({ path: "ts" });
	});
});
