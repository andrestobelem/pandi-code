// TS self-conformance (drift gate): regenerate canonical output from the CURRENT TS oracle and
// assert it still matches the committed golden. Failure means TS behavior changed and the golden +
// Rust port must be re-reviewed together in the same PR. This keeps the Rust gate validating
// Rust-vs-current-TS, never a stale ghost.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseStreamingJson } from "../../src/utils/json-parse.ts";
import { canonicalize } from "./canonical.ts";
import { cases } from "./partial-json-corpus.ts";

type GoldenRow = { name: string; input: string; expected: string };

const goldenPath = fileURLToPath(new URL("./fixtures/partial-json.golden.json", import.meta.url));
const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as GoldenRow[];
const byName = new Map(golden.map((row) => [row.name, row]));

describe("partial-json contract gate (TS self-conformance)", () => {
	it("covers every committed golden case", () => {
		expect(cases.map((c) => c.name).sort()).toEqual(golden.map((r) => r.name).sort());
	});

	for (const c of cases) {
		it(`'${c.name}' matches committed golden`, () => {
			const row = byName.get(c.name);
			expect(row, `golden missing case '${c.name}' — regenerate gen-partial-json-goldens`).toBeDefined();
			expect(row?.input).toBe(c.input);
			expect(canonicalize(parseStreamingJson(c.input) as unknown)).toBe(row?.expected);
		});
	}
});
