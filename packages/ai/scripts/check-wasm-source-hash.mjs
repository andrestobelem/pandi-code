// check-wasm-source-hash.mjs — toolchain-free staleness tripwire (PI_RUST_STREAMING Phase 6).
//
// Hashes packages/ai/native/ai-streaming-core/src/**/*.rs + Cargo.lock into a committed digest at
// test/gate/wasm/.source-hash. `npm run check` (root) asserts the digest matches, so a Rust-source
// change WITHOUT a wasm rebuild fails CI. Pure file hashing — NO Rust toolchain required — so it is
// safe to run in CI, unlike gate:wasm:check (which rebuilds the wasm and is local-only).
//
// SCOPE: proves source<->wasm coherence ONLY. It does NOT catch (a) a toolchain / wasm-bindgen
// version bump that changes the wasm output with no src change, (b) a hand-edited committed .wasm,
// or (c) a Cargo dependency resolved outside Cargo.lock. Behavioral parity is owned by the gate
// fixtures + gate:wasm:check + the OFF-vs-ON equivalence test, not by this hash.
//
// Regenerate the digest with `--write`; gate:wasm:build calls this with --write after rebuilding
// the wasm, so a rebuild and its digest always land together.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // packages/ai/scripts
const aiRoot = dirname(here); // packages/ai
const crate = join(aiRoot, "native/ai-streaming-core"); // REAL crate path (NOT repo-root native/)
const hashFile = join(aiRoot, "test/gate/wasm/.source-hash");

function walkRs(dir) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walkRs(p));
		else if (entry.name.endsWith(".rs")) out.push(p);
	}
	return out;
}

const srcDir = join(crate, "src");
const files = walkRs(srcDir).sort();
if (files.length === 0) {
	console.error(`[wasm-source-hash] no .rs files under ${srcDir} — wrong crate path; the tripwire would be a no-op.`);
	process.exit(1);
}
const lock = join(crate, "Cargo.lock");
if (!existsSync(lock)) {
	console.error(`[wasm-source-hash] missing ${lock} — cannot hash the dependency lock.`);
	process.exit(1);
}

const hash = createHash("sha256");
for (const f of [...files, lock]) {
	hash.update(f.slice(aiRoot.length)); // stable, machine-independent relative path
	hash.update("\0");
	hash.update(readFileSync(f));
	hash.update("\0");
}
const digest = hash.digest("hex");

if (process.argv.includes("--write")) {
	writeFileSync(hashFile, `${digest}\n`);
	console.log(`[wasm-source-hash] wrote ${digest}`);
	process.exit(0);
}

const committed = existsSync(hashFile) ? readFileSync(hashFile, "utf8").trim() : "";
if (committed !== digest) {
	console.error(
		"[wasm-source-hash] STALE: the Rust source / Cargo.lock changed without a wasm rebuild.\n" +
			`  committed = ${committed || "(none)"}\n` +
			`  current   = ${digest}\n` +
			"  Run: npm run gate:wasm:build (rebuilds the wasm + rewrites .source-hash), then recommit both.",
	);
	process.exit(1);
}
console.log("[wasm-source-hash] OK");
