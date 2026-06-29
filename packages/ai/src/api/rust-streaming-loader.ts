// rust-streaming-loader.ts — PRODUCTION loader for the Anthropic Rust streaming decoder
// (PI_RUST_STREAMING swap, Phase 3). Sibling of anthropic-messages.ts.
//
// Loads the wasm-bindgen `--target nodejs` CommonJS glue via createRequire (this package is
// "type":"module"). The glue compiles + instantiates the ~236KB wasm SYNCHRONOUSLY at require()
// time (new WebAssembly.Module/Instance at its tail) and module-caches it, so the load is
// once-per-process and THE LOAD SURFACE IS THE require() CALL. loadRustStreaming() THROWS on any
// load/instantiate failure; the caller treats that throw as the single load-failure fallback
// trigger (Phase 5). It MUST be called lazily, only on the flag-ON path, so flag-OFF never
// require()s the wasm.
//
// Glue location:
//   - prod  (compiled): dist/api/rust-streaming-loader.js -> dist/wasm/ai_streaming_core.js
//   - dev/test (source): src/api/rust-streaming-loader.ts  -> test/gate/wasm/ai_streaming_core.js
// We try both relative to this file so the equivalence test can drive the real glue from source.
//
// bun --compile hazard (mirrors photon.ts): the glue tail does
//   readFileSync(path.join(__dirname, 'ai_streaming_core_bg.wasm'))
// which bakes the build-machine __dirname and ENOENTs inside a bun-compiled binary. We patch
// fs.readFileSync to redirect that read to process.execPath-adjacent + cwd fallbacks, active only
// across the require(), then restore. Pair with coding-agent's copy-binary-assets shipping the
// wasm next to the bun binary.
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");

const WASM_FILENAME = "ai_streaming_core_bg.wasm";
const GLUE_FILENAME = "ai_streaming_core.js";

export interface RustIncrementalDecoder {
	/** Canonical `start` event (discarded by the adapter — TS already pushed `start`). */
	take_start(): string;
	/** JSON array of canonical events produced by this chunk. */
	push(chunk: Uint8Array): string;
	/** JSON array of the terminal canonical events (flushes the framer tail). */
	finish(): string;
	/** Canonical settled message (unused at runtime; the adapter mutates shared `output`). */
	final_message(): string;
	free(): void;
}
export interface RustStreamingGlue {
	AnthropicIncrementalDecoder: new (api: string, provider: string, model: string) => RustIncrementalDecoder;
}

let cached: RustStreamingGlue | null = null;
let loadFailure: Error | null = null; // negative cache: once load fails, fail fast (no re-read/recompile per call)

/** Absolute candidate paths to the CJS glue, prod (dist/wasm) first, then dev/test (test/gate/wasm). */
function glueCandidates(): string[] {
	const here = path.dirname(fileURLToPath(import.meta.url)); // dist/api or src/api
	return [
		path.join(here, "..", "wasm", GLUE_FILENAME), // dist/api -> dist/wasm (prod)
		path.join(here, "..", "..", "test", "gate", "wasm", GLUE_FILENAME), // src/api -> test/gate/wasm (dev/test)
	];
}

function fallbackWasmPaths(): string[] {
	const execDir = path.dirname(process.execPath);
	return [
		path.join(execDir, WASM_FILENAME),
		path.join(execDir, "wasm", WASM_FILENAME),
		path.join(process.cwd(), WASM_FILENAME),
	];
}

// photon.ts:54-110, narrowed to our wasm filename: redirect the glue's __dirname-baked readFileSync.
function patchWasmRead(): () => void {
	const original = fs.readFileSync.bind(fs);
	const fallbacks = fallbackWasmPaths();
	const mut = fs as { readFileSync: typeof fs.readFileSync };
	const patched = ((...args: Parameters<typeof fs.readFileSync>) => {
		const [file, options] = args;
		const p = typeof file === "string" ? file : file instanceof URL ? fileURLToPath(file) : null;
		if (p?.endsWith(WASM_FILENAME)) {
			try {
				return original(...args);
			} catch (e) {
				const err = e as NodeJS.ErrnoException;
				if (err?.code && err.code !== "ENOENT") throw e;
				for (const fb of fallbacks) {
					if (!fs.existsSync(fb)) continue;
					return options === undefined ? original(fb) : original(fb, options);
				}
				throw e;
			}
		}
		return original(...args);
	}) as typeof fs.readFileSync;
	try {
		mut.readFileSync = patched;
	} catch {
		Object.defineProperty(fs, "readFileSync", { value: patched, writable: true, configurable: true });
	}
	return () => {
		try {
			mut.readFileSync = original;
		} catch {
			Object.defineProperty(fs, "readFileSync", { value: original, writable: true, configurable: true });
		}
	};
}

/**
 * Lazily load + instantiate the Rust streaming glue. THROWS on any load/instantiate failure.
 * Module-cached after the first success. MUST be called only on the flag-ON path.
 */
export function loadRustStreaming(): RustStreamingGlue {
	if (cached) return cached;
	if (loadFailure) throw loadFailure; // negative cache: don't re-read 236KB + recompile on every ON stream
	const restore = patchWasmRead();
	try {
		let lastErr: unknown;
		for (const candidate of glueCandidates()) {
			if (!fs.existsSync(candidate)) continue;
			try {
				cached = require(candidate) as RustStreamingGlue;
				return cached;
			} catch (e) {
				lastErr = e;
			}
		}
		throw lastErr ?? new Error(`Rust streaming glue (${GLUE_FILENAME}) not found in any known location`);
	} catch (e) {
		loadFailure = e instanceof Error ? e : new Error(String(e));
		throw loadFailure;
	} finally {
		restore();
	}
}
