//! Incremental conformance: the STATEFUL AnthropicStreamDecoder, fed the SAME golden chunks under
//! three feeding schedules, must reproduce the SAME canonical transcript as the one-shot oracle
//! (`anthropic.golden.json`). This proves incremental == one-shot == oracle, and — via the `byte`
//! schedule (every byte its own push) — that decoder state survives ARBITRARY chunk boundaries
//! (incomplete-multibyte carry, mid-line/mid-event/mid-json-fragment line buffering, terminal
//! deferral), which the one-shot gate (and even re-feeding the recorded chunks, which `parse_sse`
//! already loops over) does NOT exercise.

use ai_streaming_core::{canonical, js_obj, AnthropicStreamDecoder, JsVal};
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Deserialize)]
struct Row {
	name: String,
	api: String,
	provider: String,
	model: String,
	chunks: Vec<Vec<u8>>,
	expected: String,
}

/// `oneshot` = all bytes in one push; `recorded` = the recorded network chunks; `byte` = every
/// single byte its own push (maximal fragmentation — the genuinely new coverage).
fn schedule_seq(name: &str, chunks: &[Vec<u8>]) -> Vec<Vec<u8>> {
	match name {
		"oneshot" => vec![chunks.concat()],
		"recorded" => chunks.to_vec(),
		"byte" => chunks.concat().into_iter().map(|b| vec![b]).collect(),
		_ => unreachable!(),
	}
}

fn drive(seq: &[Vec<u8>], api: &str, provider: &str, model: &str) -> String {
	let mut d = AnthropicStreamDecoder::new(api, provider, model);
	let mut events = d.take_start();
	for c in seq {
		events.extend(d.push(c));
	}
	events.extend(d.finish());
	canonical(&js_obj(vec![("events", JsVal::Arr(events)), ("final", d.final_message())]))
}

#[test]
fn anthropic_incremental_decoder_parity() {
	let path =
		PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../test/gate/fixtures/anthropic.golden.json");
	let data = fs::read_to_string(&path).unwrap_or_else(|e| panic!("read golden {}: {e}", path.display()));
	let rows: Vec<Row> = serde_json::from_str(&data).expect("parse golden json");

	let schedules = ["oneshot", "recorded", "byte"];
	let mut failures = Vec::new();
	for row in &rows {
		for sched in schedules {
			let seq = schedule_seq(sched, &row.chunks);
			let got = drive(&seq, &row.api, &row.provider, &row.model);
			if got != row.expected {
				failures.push(format!(
					"  '{}' [{}]:\n     expected: {}\n     got:      {}",
					row.name, sched, row.expected, got
				));
			}
		}
	}

	assert!(
		failures.is_empty(),
		"incremental decoder divergence ({} of {} row×schedule):\n{}",
		failures.len(),
		rows.len() * schedules.len(),
		failures.join("\n\n")
	);
}
