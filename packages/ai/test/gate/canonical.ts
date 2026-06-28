// Canonical serialization shared by the golden generator and the drift test.
// Object keys are sorted recursively, then JSON.stringify is applied. JSON.stringify maps
// NaN/Infinity/-Infinity to "null", which is the agreed cross-language contract (the Rust
// canonical serializer mirrors this exactly).

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortKeys);
	}
	if (value !== null && typeof value === "object") {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
		}
		return sorted;
	}
	return value;
}

export function canonicalize(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}
