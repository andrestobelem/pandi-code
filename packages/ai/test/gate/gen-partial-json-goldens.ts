// Golden generator for the partial-JSON contract gate.
//
//   npm run gate:gen -w @earendil-works/pi-ai        -> writes fixtures/partial-json.golden.json
//   npm run gate:selfcheck -w @earendil-works/pi-ai  -> regenerates in memory, diffs vs committed (drift gate)
//
// The TS implementation is the oracle: golden.expected is the canonical serialization of
// parseStreamingJson(input). The Rust port must reproduce expected byte-for-byte.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseStreamingJson } from "../../src/utils/json-parse.ts";
import { canonicalize } from "./canonical.ts";
import { cases } from "./partial-json-corpus.ts";

type GoldenRow = { name: string; input: string; expected: string };

function generate(): GoldenRow[] {
	return cases.map((c) => ({
		name: c.name,
		input: c.input,
		expected: canonicalize(parseStreamingJson(c.input) as unknown),
	}));
}

const goldenPath = fileURLToPath(new URL("./fixtures/partial-json.golden.json", import.meta.url));
const rows = generate();
const serialized = `${JSON.stringify(rows, null, 2)}\n`;

if (process.argv.includes("--check")) {
	let committed: string;
	try {
		committed = readFileSync(goldenPath, "utf8");
	} catch {
		console.error(`[gate] missing golden ${goldenPath}; run gen-partial-json-goldens without --check`);
		process.exit(1);
	}
	if (committed !== serialized) {
		console.error("[gate] partial-json golden drift: TS output no longer matches the committed golden.");
		console.error(
			"[gate] regenerate (npm run gate:gen -w @earendil-works/pi-ai), re-review, and commit fixture + Rust together.",
		);
		process.exit(1);
	}
	console.log(`[gate] partial-json golden up to date (${rows.length} cases)`);
} else {
	writeFileSync(goldenPath, serialized);
	console.log(`[gate] wrote ${rows.length} cases -> ${goldenPath}`);
}
