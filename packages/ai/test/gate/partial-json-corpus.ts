// Adversarial corpus for the partial-JSON contract gate (Rust migration pilot).
//
// Each case is a single input string fed to `parseStreamingJson` (the function the
// streaming tool-call reassembler calls on every accumulated argument buffer). The
// gate captures TS behavior as the oracle and requires the Rust port to reproduce it
// exactly. This is the #1 divergence risk in the ai streaming-core pilot.
//
// Cases are chosen to pin the load-bearing behaviors confirmed by reading the source:
// - json-parse.ts: repairJson (UTF-16 indexed), the parseStreamingJson ladder, and the
//   `?? {}` coalescing that ONLY collapses null/undefined (0/false/""/NaN/Infinity survive).
// - partial-json 0.1.7 `parse` = parseJSON with default Allow.ALL (every partial type).

export type GateCase = { name: string; input: string };

export const cases: GateCase[] = [
	// --- empty / whitespace -> {} ---
	{ name: "empty", input: "" },
	{ name: "whitespace-only", input: "   \n\t  " },

	// --- complete JSON: fast path (parseJsonWithRepair success, NO ?? coalescing) ---
	{ name: "complete-object", input: '{"a":1,"b":"hi"}' },
	{ name: "complete-array", input: "[1,2,3]" },
	{ name: "complete-nested", input: '{"a":{"b":[1,{"c":true}]},"d":null}' },
	{ name: "complete-empty-object", input: "{}" },
	{ name: "complete-string-toplevel", input: '"hello"' },
	{ name: "complete-number-toplevel", input: "42" },
	{ name: "complete-decimal", input: '{"x":1.5,"y":0.5,"z":1.0}' },
	{ name: "complete-true-toplevel", input: "true" },
	{ name: "complete-null-toplevel", input: "null" },

	// --- partial objects/arrays (b6/b7) -> partial-json Allow.OBJ/ARR ---
	{ name: "partial-obj-after-colon", input: '{"a":1,"b":' },
	{ name: "partial-obj-mid-key", input: '{"a"' },
	{ name: "partial-obj-open", input: "{" },
	{ name: "partial-obj-key-only-prefix", input: '{"a":1,"b' },
	{ name: "partial-arr-trailing-comma", input: "[1,2," },
	{ name: "partial-nested-collection", input: '{"a":[1,2,' },

	// --- partial strings (b3, Allow.STR) ---
	{ name: "partial-string-value", input: '{"a":"hel' },
	{ name: "partial-string-toplevel", input: '"incompl' },

	// --- repairJson: lone trailing backslash at EOF (b4) ---
	{ name: "trailing-backslash-eof", input: '{"a":"foo\\' },

	// --- repairJson: invalid escape doubling + valid \t kept (b5, the real SSE case) ---
	// Actual string content: {"path":"A\H","text":"col1\tcol2"} (backslash-H invalid, backslash-t valid)
	{ name: "malformed-escape-repair", input: '{"path":"A\\H","text":"col1\\tcol2"}' },

	// --- repairJson: raw control char inside string gets escaped ---
	{ name: "raw-newline-in-string", input: '{"a":"line1\nline2"}' },
	{ name: "raw-tab-in-string", input: '{"a":"c1\tc2"}' },

	// --- unicode escapes + truncation (b10) ---
	{ name: "unicode-escape-complete", input: '{"a":"\\u00e9"}' },
	{ name: "unicode-escape-truncated", input: '{"a":"x\\u00' },

	// --- partial keyword literals: nu/tr/fa coalescing distinctions ---
	{ name: "partial-null-keyword", input: "nu" }, // partialParse -> null -> ?? {} => {}
	{ name: "partial-true-keyword", input: "tr" }, // partialParse -> true (survives ??)
	{ name: "partial-false-keyword", input: "fal" },

	// --- b-falsy: pin the ?? boundary (only null coalesces) ---
	{ name: "falsy-zero", input: "0" },
	{ name: "falsy-false", input: "false" },
	{ name: "falsy-empty-string", input: '""' },
	{ name: "falsy-bare-string", input: '"abc"' },

	// --- NaN / Infinity: partial-json SPECIAL branches; survive ?? then canonicalize to null ---
	{ name: "special-nan-toplevel", input: "NaN" },
	{ name: "special-infinity-toplevel", input: "Infinity" },
	{ name: "special-neg-infinity-toplevel", input: "-Infinity" },
	{ name: "special-nan-nested", input: '{"x":NaN,"y":1}' },

	// --- numbers via parseNum partial paths ---
	{ name: "partial-number-trailing", input: '{"a":123' },
	{ name: "negative-number", input: '{"a":-5}' },
];
