//! Differential conformance: the Rust parse_streaming_json port must reproduce, byte-for-byte,
//! the canonical output captured from the TypeScript oracle in
//! packages/ai/test/gate/fixtures/partial-json.golden.json.

use ai_streaming_core::{canonical, parse_streaming_json};
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Deserialize)]
struct Row {
	name: String,
	input: String,
	expected: String,
}

#[test]
fn partial_json_parity() {
	let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
		.join("../../test/gate/fixtures/partial-json.golden.json");
	let data = fs::read_to_string(&path)
		.unwrap_or_else(|e| panic!("read golden {}: {e}", path.display()));
	let rows: Vec<Row> = serde_json::from_str(&data).expect("parse golden json");

	let mut failures = Vec::new();
	for row in &rows {
		let got = canonical(&parse_streaming_json(&row.input));
		if got != row.expected {
			failures.push(format!(
				"  case '{}': input={:?}\n     expected: {}\n     got:      {}",
				row.name, row.input, row.expected, got
			));
		}
	}

	assert!(
		failures.is_empty(),
		"partial-json divergence ({} of {} cases):\n{}",
		failures.len(),
		rows.len(),
		failures.join("\n")
	);
}
