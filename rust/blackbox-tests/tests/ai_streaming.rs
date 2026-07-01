use std::path::{Path, PathBuf};
use std::process::{Command, Output};

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .expect("blackbox crate is rust/blackbox-tests")
        .to_path_buf()
}

fn assert_success(output: Output, command: &str) {
    if output.status.success() {
        return;
    }

    panic!(
        "command failed: {command}\nstatus: {}\nstdout:\n{}\nstderr:\n{}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn ai_anthropic_streaming_uses_rust_by_default_and_keeps_ts_parity() {
    let root = repo_root();
    let ai_dir = root.join("packages/ai");
    let vitest = ai_dir.join("node_modules/vitest/dist/cli.js");
    let command = format!(
        "cd {} && node {} --run test/anthropic-rust-equivalence.test.ts",
        ai_dir.display(),
        vitest.display()
    );

    let output = Command::new("node")
        .current_dir(&ai_dir)
        .arg(&vitest)
        .arg("--run")
        .arg("test/anthropic-rust-equivalence.test.ts")
        .env_remove("ANTHROPIC_API_KEY")
        .env_remove("ANTHROPIC_OAUTH_TOKEN")
        .env_remove("OPENAI_API_KEY")
        .env_remove("GEMINI_API_KEY")
        .env_remove("GOOGLE_APPLICATION_CREDENTIALS")
        .output()
        .expect("run vitest subprocess");

    assert_success(output, &command);
}
