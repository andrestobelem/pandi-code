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
	const clone = structuredClone(m) as AssistantMessage;
	delete (clone as { timestamp?: number }).timestamp;
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

	it("calls onPath exactly ONCE on a clean Rust-served stream", async () => {
		const model = getModel("anthropic", "claude-haiku-4-5");
		const onPath = vi.fn();
		await drain(
			streamAnthropic(model, context, {
				client: fakeClient(golden[0].chunks),
				env: { PI_RUST_STREAMING: "1" },
				onPath,
			}),
		);
		expect(onPath).toHaveBeenCalledTimes(1);
		expect(onPath).toHaveBeenCalledWith({ path: "rust" });
	});

	it("a latched SERVER error (refusal) is NOT mis-tagged as error:'adapter' and fires onPath once", async () => {
		// A refusal settles stopReason=error WITHOUT the adapter throwing (driveRustDecoder returns
		// normally; the shared terminal re-throws). It must report path:"rust" with NO adapter tag.
		const row = golden.find((r) => r.name === "refusal") ?? golden[0];
		const model = getModel("anthropic", "claude-haiku-4-5");
		const onPath = vi.fn();
		await drain(
			streamAnthropic(model, context, { client: fakeClient(row.chunks), env: { PI_RUST_STREAMING: "1" }, onPath }),
		);
		expect(onPath).toHaveBeenCalledTimes(1);
		expect(onPath).toHaveBeenCalledWith({ path: "rust" }); // exact object: no error:"adapter"
	});

	it("a non-anthropic provider is NOT served by Rust even with the flag ON (provider gate)", async () => {
		// resolveRustStreaming alone would say ON, but the fork also requires provider==="anthropic".
		const base = getModel("anthropic", "claude-haiku-4-5");
		const model = { ...base, provider: "github-copilot" } as typeof base;
		await drain(
			streamAnthropic(model, context, { client: fakeClient(golden[0].chunks), env: { PI_RUST_STREAMING: "1" } }),
		);
		expect(loadRustStreaming).not.toHaveBeenCalled();
	});

	it("preserves tool-call argument KEY ORDER (non-alphabetical) identically OFF vs ON", async () => {
		// Regression for the wasm canonical() key-sort divergence: a tool input emitted as
		// {old_string, new_string} (NOT alphabetical) must keep wire order on both paths. toEqual is
		// order-insensitive, so compare JSON.stringify (order-SENSITIVE).
		const enc = new TextEncoder();
		const frames = [
			{
				event: "message_start",
				data: { type: "message_start", message: { id: "msg_ko", usage: { input_tokens: 3, output_tokens: 0 } } },
			},
			{
				event: "content_block_start",
				data: {
					type: "content_block_start",
					index: 0,
					content_block: { type: "tool_use", id: "tu_1", name: "Edit", input: {} },
				},
			},
			{
				event: "content_block_delta",
				data: {
					type: "content_block_delta",
					index: 0,
					delta: { type: "input_json_delta", partial_json: '{"old_string":"a",' },
				},
			},
			{
				event: "content_block_delta",
				data: {
					type: "content_block_delta",
					index: 0,
					delta: { type: "input_json_delta", partial_json: '"new_string":"b"}' },
				},
			},
			{ event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
			{
				event: "message_delta",
				data: { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } },
			},
			{ event: "message_stop", data: { type: "message_stop" } },
		];
		const wire = frames.map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n`).join("\n");
		const chunks = [Array.from(enc.encode(wire))];
		const model = getModel("anthropic", "claude-haiku-4-5");

		const off = await streamAnthropic(model, context, { client: fakeClient(chunks), env: {} }).result();
		const on = await streamAnthropic(model, context, {
			client: fakeClient(chunks),
			env: { PI_RUST_STREAMING: "1" },
		}).result();
		const argsOff = (off.content[0] as { arguments: unknown }).arguments;
		const argsOn = (on.content[0] as { arguments: unknown }).arguments;
		expect(JSON.stringify(argsOn)).toBe(JSON.stringify(argsOff)); // order-sensitive
		expect(JSON.stringify(argsOn)).toBe('{"old_string":"a","new_string":"b"}'); // wire order, not sorted
	});

	it("preserves a thinking-block signature when the stream truncates after signature_delta (no content_block_stop)", async () => {
		// signature_delta mutates the Rust decoder's internal thinking_signature WITHOUT emitting a
		// canonical event, so a stream that ends before content_block_stop never carries the signed
		// snapshot through assignBlock. driveRustDecoder must reconcile thinkingSignature from
		// final_message(). Asserts OFF==ON parity for this never-recorded truncation case.
		const enc = new TextEncoder();
		const frames = [
			{
				event: "message_start",
				data: { type: "message_start", message: { id: "msg_sig", usage: { input_tokens: 2, output_tokens: 0 } } },
			},
			{
				event: "content_block_start",
				data: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
			},
			{
				event: "content_block_delta",
				data: {
					type: "content_block_delta",
					index: 0,
					delta: { type: "thinking_delta", thinking: "Let me think" },
				},
			},
			{
				event: "content_block_delta",
				data: { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig-abc" } },
			},
			// stream TRUNCATES here: no content_block_stop, no message_stop.
		];
		const wire = frames.map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n`).join("\n");
		const chunks = [Array.from(enc.encode(wire))];
		const model = getModel("anthropic", "claude-haiku-4-5");

		const off = await streamAnthropic(model, context, { client: fakeClient(chunks), env: {} }).result();
		const on = await streamAnthropic(model, context, {
			client: fakeClient(chunks),
			env: { PI_RUST_STREAMING: "1" },
		}).result();
		const sigOff = (off.content[0] as { thinkingSignature?: string }).thinkingSignature;
		const sigOn = (on.content[0] as { thinkingSignature?: string }).thinkingSignature;
		expect(sigOff).toBe("sig-abc"); // TS path preserves it via in-place mutation
		expect(sigOn).toBe(sigOff); // Rust path must reconcile it from final_message()
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

	it("a mid-stream transport reject is NOT mis-tagged as error:'adapter' (transport != adapter fault)", async () => {
		// A transport-layer reject (TCP reset / proxy 502 mid-body / premature close) rejects
		// reader.read() OUTSIDE the decoder, so it is not a Rust adapter/parity fault. It must report
		// path:"rust" with NO error:"adapter" tag, matching the TS path (whose reject is never tagged).
		const erroringClient = (() => {
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("event: message_start\ndata: {}\n\n"));
					controller.error(new Error("ECONNRESET"));
				},
			});
			const response = new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
			return { messages: { create: () => ({ asResponse: async () => response }) } } as unknown as Anthropic;
		})();

		const onPath = vi.fn();
		const evs = await drain(
			streamAnthropic(getModel("anthropic", "claude-haiku-4-5"), context, {
				client: erroringClient,
				env: { PI_RUST_STREAMING: "1" },
				onPath,
			}),
		);
		const term = evs[evs.length - 1] as { type: string };
		expect(term.type).toBe("error"); // still surfaced as a stream error
		expect(onPath).toHaveBeenCalledWith({ path: "rust" }); // exact object: NO error:"adapter"
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
