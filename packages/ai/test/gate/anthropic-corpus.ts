// Adversarial corpus for the Anthropic byte-level SSE-decoder contract gate.
//
// Each fixture is a list of raw SSE wire chunks (strings, UTF-8 encoded to bytes at gate time).
// Splitting the wire across chunks — including mid-line and across an SSE event — exercises the
// incremental framer (TextDecoder{stream:true} + consumeLine). The TS decoder is the oracle; the
// Rust port must reproduce the normalized transcript byte-for-byte.

export type AnthropicFixture = { name: string; chunks: string[] };

// Build the SSE wire exactly like the production tests' createSseResponse:
//   each event -> `event: <event>\ndata: <data>\n`, joined with "\n" (so events are separated by a blank line).
function wire(events: Array<{ event: string; data: string }>): string {
	return events.map(({ event, data }) => `event: ${event}\ndata: ${data}\n`).join("\n");
}

function j(value: unknown): string {
	return JSON.stringify(value);
}

const usage0 = { input_tokens: 12, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const usageFinal = { input_tokens: 12, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

const helloEvents = [
	{ event: "message_start", data: j({ type: "message_start", message: { id: "msg_test", usage: usage0 } }) },
	{
		event: "content_block_start",
		data: j({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
	},
	{
		event: "content_block_delta",
		data: j({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } }),
	},
	{
		event: "content_block_delta",
		data: j({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } }),
	},
	{ event: "content_block_stop", data: j({ type: "content_block_stop", index: 0 }) },
	{
		event: "message_delta",
		data: j({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: usageFinal }),
	},
	{ event: "message_stop", data: j({ type: "message_stop" }) },
];

// A tool call whose JSON arguments arrive in fragments that split JSON tokens across deltas
// (the #1 partial-JSON-reassembly risk, now at the streaming level).
const toolFragments = ['{"path":"', "/foo/b", 'ar","text":"col1\\tcol2', '"}'];
const toolEvents = [
	{ event: "message_start", data: j({ type: "message_start", message: { id: "msg_tool", usage: usage0 } }) },
	{
		event: "content_block_start",
		data: j({
			type: "content_block_start",
			index: 0,
			content_block: { type: "tool_use", id: "toolu_1", name: "edit", input: {} },
		}),
	},
	...toolFragments.map((frag) => ({
		event: "content_block_delta",
		data: j({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: frag } }),
	})),
	{ event: "content_block_stop", data: j({ type: "content_block_stop", index: 0 }) },
	{
		event: "message_delta",
		data: j({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: usageFinal }),
	},
	{ event: "message_stop", data: j({ type: "message_stop" }) },
];

// Malformed streamed tool JSON (invalid \H escape + raw tab) — repaired by repairJson at both the
// SSE-data and the partial-json levels. Mirrors the production anthropic-sse-parsing.test.ts case.
const malformedToolDelta = String.raw`{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"path\":\"A\H\",\"text\":\"col1	col2\"}"}}`;
const malformedToolEvents = [
	{ event: "message_start", data: j({ type: "message_start", message: { id: "msg_mal", usage: usage0 } }) },
	{
		event: "content_block_start",
		data: j({
			type: "content_block_start",
			index: 0,
			content_block: { type: "tool_use", id: "toolu_mal", name: "edit", input: {} },
		}),
	},
	{ event: "content_block_delta", data: malformedToolDelta },
	{ event: "content_block_stop", data: j({ type: "content_block_stop", index: 0 }) },
	{
		event: "message_delta",
		data: j({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: usageFinal }),
	},
	{ event: "message_stop", data: j({ type: "message_stop" }) },
];

const refusalExplanation = "This request triggered restrictions and was blocked under Anthropic's Usage Policy.";
const refusalEvents = [
	{
		event: "message_start",
		data: j({
			type: "message_start",
			message: {
				id: "msg_ref",
				usage: { input_tokens: 412, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
			},
		}),
	},
	{
		event: "message_delta",
		data: j({
			type: "message_delta",
			delta: {
				stop_reason: "refusal",
				stop_details: { type: "refusal", category: "cyber", explanation: refusalExplanation },
			},
			usage: { input_tokens: 412, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
		}),
	},
	{ event: "message_stop", data: j({ type: "message_stop" }) },
];

const thinkingEvents = [
	{ event: "message_start", data: j({ type: "message_start", message: { id: "msg_think", usage: usage0 } }) },
	{
		event: "content_block_start",
		data: j({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
	},
	{
		event: "content_block_delta",
		data: j({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Let me think" } }),
	},
	{
		event: "content_block_delta",
		data: j({ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig-abc" } }),
	},
	{ event: "content_block_stop", data: j({ type: "content_block_stop", index: 0 }) },
	{
		event: "content_block_start",
		data: j({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
	},
	{
		event: "content_block_delta",
		data: j({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Answer" } }),
	},
	{ event: "content_block_stop", data: j({ type: "content_block_stop", index: 1 }) },
	{
		event: "message_delta",
		data: j({
			type: "message_delta",
			delta: { stop_reason: "end_turn" },
			usage: { ...usageFinal, output_tokens_details: { thinking_tokens: 3 } },
		}),
	},
	{ event: "message_stop", data: j({ type: "message_stop" }) },
];

// Multibyte UTF-8 (2-byte é, 3-byte ☕ and CJK, 4-byte emoji). Under the gate's byte-at-a-time
// feeding schedule every codepoint is split mid-sequence, forcing the incremental UTF-8 decoder
// (Utf8Stream.pending) to carry incomplete byte sequences across pushes — coverage the one-shot
// path (and re-feeding the recorded chunks) cannot reach.
const multibyteEvents = [
	{ event: "message_start", data: j({ type: "message_start", message: { id: "msg_mb", usage: usage0 } }) },
	{
		event: "content_block_start",
		data: j({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
	},
	{
		event: "content_block_delta",
		data: j({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "café ☕ " } }),
	},
	{
		event: "content_block_delta",
		data: j({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "日本語 🌍🎉" } }),
	},
	{ event: "content_block_stop", data: j({ type: "content_block_stop", index: 0 }) },
	{
		event: "message_delta",
		data: j({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: usageFinal }),
	},
	{ event: "message_stop", data: j({ type: "message_stop" }) },
];

// Unhandled stop reason: mapStopReason throws `Unhandled stop reason: banana`, which the decoder
// routes to the error/catch path. The content block AFTER the bad message_delta MUST be suppressed
// (the streaming decoder's terminal latch == the former `break 'assembly`); the open text block
// "Partial" is kept, "DROPPED" must never appear.
const unhandledStopEvents = [
	{ event: "message_start", data: j({ type: "message_start", message: { id: "msg_unh", usage: usage0 } }) },
	{
		event: "content_block_start",
		data: j({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
	},
	{
		event: "content_block_delta",
		data: j({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Partial" } }),
	},
	{
		event: "message_delta",
		data: j({ type: "message_delta", delta: { stop_reason: "banana" }, usage: usageFinal }),
	},
	{
		event: "content_block_start",
		data: j({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
	},
	{
		event: "content_block_delta",
		data: j({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "DROPPED" } }),
	},
	{ event: "message_stop", data: j({ type: "message_stop" }) },
];

// Cache-creation usage with a 1h breakdown. message_start carries cache_creation_input_tokens (the
// total) plus cache_creation.ephemeral_1h_input_tokens (the 1h split); the decoder copies these to
// usage.cacheWrite and usage.cacheWrite1h (anthropic-messages.ts ~L554-555). Every other fixture pins
// cacheWrite:0 / cacheWrite1h:0, so this is the only non-zero settled cache-usage coverage in the gate.
const cacheWrite1hUsage0 = {
	input_tokens: 100,
	output_tokens: 0,
	cache_read_input_tokens: 0,
	cache_creation_input_tokens: 1000000,
	cache_creation: { ephemeral_5m_input_tokens: 600000, ephemeral_1h_input_tokens: 400000 },
};
const cacheWrite1hUsageFinal = {
	input_tokens: 100,
	output_tokens: 5,
	cache_read_input_tokens: 0,
	cache_creation_input_tokens: 1000000,
};
const cacheWrite1hEvents = [
	{
		event: "message_start",
		data: j({ type: "message_start", message: { id: "msg_cache1h", usage: cacheWrite1hUsage0 } }),
	},
	{
		event: "content_block_start",
		data: j({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
	},
	{
		event: "content_block_delta",
		data: j({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } }),
	},
	{ event: "content_block_stop", data: j({ type: "content_block_stop", index: 0 }) },
	{
		event: "message_delta",
		data: j({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: cacheWrite1hUsageFinal }),
	},
	{ event: "message_stop", data: j({ type: "message_stop" }) },
];

// Thinking block that receives a thinking_delta but NO signature_delta, so it settles with the
// initialized empty-string signature (thinkingSignature:"" — anthropic-messages.ts ~L573, mutated only
// inside the signature_delta branch). The existing thinking fixture settles at "sig-abc"; "" appears
// only in transient pre-signature snapshots there, never at thinking_end or in final.content.
const emptySignatureThinkingEvents = [
	{ event: "message_start", data: j({ type: "message_start", message: { id: "msg_emptysig", usage: usage0 } }) },
	{
		event: "content_block_start",
		data: j({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
	},
	{
		event: "content_block_delta",
		data: j({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Let me think" } }),
	},
	{ event: "content_block_stop", data: j({ type: "content_block_stop", index: 0 }) },
	{
		event: "content_block_start",
		data: j({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
	},
	{
		event: "content_block_delta",
		data: j({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Answer" } }),
	},
	{ event: "content_block_stop", data: j({ type: "content_block_stop", index: 1 }) },
	{
		event: "message_delta",
		data: j({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: usageFinal }),
	},
	{ event: "message_stop", data: j({ type: "message_stop" }) },
];

const helloWire = wire(helloEvents);

// Split a string into n roughly-equal pieces (mid-line / mid-event splits stress the framer).
function splitEvenly(text: string, n: number): string[] {
	const size = Math.ceil(text.length / n);
	const out: string[] = [];
	for (let i = 0; i < text.length; i += size) {
		out.push(text.slice(i, i + size));
	}
	return out;
}

export const fixtures: AnthropicFixture[] = [
	{ name: "hello-one-chunk", chunks: [helloWire] },
	{ name: "hello-split-per-char-region", chunks: splitEvenly(helloWire, 7) },
	{ name: "hello-split-mid", chunks: [helloWire.slice(0, 30), helloWire.slice(30)] },
	{ name: "tool-partial-json-fragments", chunks: [wire(toolEvents)] },
	{ name: "tool-partial-json-fragments-split", chunks: splitEvenly(wire(toolEvents), 9) },
	{ name: "tool-malformed-json-repair", chunks: [wire(malformedToolEvents)] },
	{ name: "refusal", chunks: [wire(refusalEvents)] },
	{ name: "thinking-then-text", chunks: [wire(thinkingEvents)] },
	{ name: "thinking-then-text-split", chunks: splitEvenly(wire(thinkingEvents), 11) },
	{
		name: "unknown-events-after-stop",
		chunks: [wire([...helloEvents, { event: "done", data: "[DONE]" }, { event: "proxy.stats", data: "not json" }])],
	},
	{ name: "comment-and-heartbeat-lines", chunks: [`:heartbeat\n${helloWire}`] },
	{ name: "ended-before-message-stop", chunks: [wire(helloEvents.slice(0, 5))] },
	{ name: "event-error-midstream", chunks: [wire([helloEvents[0]]) + "\nevent: error\ndata: upstream exploded\n"] },
	{ name: "multibyte-text-emoji-cjk", chunks: [wire(multibyteEvents)] },
	{ name: "unhandled-stop-reason", chunks: [wire(unhandledStopEvents)] },
	{ name: "cache-write-1h-breakdown", chunks: [wire(cacheWrite1hEvents)] },
	{ name: "thinking-empty-signature", chunks: [wire(emptySignatureThinkingEvents)] },
];
