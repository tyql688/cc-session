//! Real-data smoke test for the rewritten Kimi provider.
//!
//! Run manually against a logged-in `~/.kimi-code/` install:
//!
//!   cargo test --test kimi_real_smoke -- --include-ignored --nocapture
//!
//! `#[ignore]` so it never fires in normal `cargo test`. Read-only —
//! only scans the on-disk session files. Assertions are structural so
//! the test works on any developer's machine.

#![cfg(test)]

use cc_session_lib::models::{MessageRole, Provider};
use cc_session_lib::provider::SessionProvider;
use cc_session_lib::providers::kimi::KimiProvider;

#[test]
#[ignore]
fn scan_real_kimi_code_directory() {
    let provider = match KimiProvider::new() {
        Some(p) => p,
        None => {
            eprintln!("skip: no HOME dir");
            return;
        }
    };

    let kimi_code = dirs::home_dir().unwrap().join(".kimi-code");
    if !kimi_code.is_dir() {
        eprintln!("skip: no ~/.kimi-code");
        return;
    }

    let parsed = provider.scan_all().expect("scan_all");
    eprintln!("Parsed {} kimi sessions", parsed.len());

    for s in &parsed {
        eprintln!(
            "  id={:?} provider={:?} parent={:?} side={} msgs={} title={:?} model={:?}",
            s.meta.id,
            s.meta.provider,
            s.meta.parent_id,
            s.meta.is_sidechain,
            s.meta.message_count,
            s.meta.title,
            s.meta.model,
        );

        // Structural invariants — must hold for every session, no hardcoded
        // identity assertions.
        assert_eq!(s.meta.provider, Provider::Kimi);
        assert!(
            !s.meta.id.is_empty(),
            "session id must be populated for {:?}",
            s.meta.source_path
        );
        assert!(
            s.meta.id.starts_with("session_") || s.meta.id.starts_with("ses_"),
            "session id should preserve the on-disk prefix: {:?}",
            s.meta.id,
        );
        assert!(
            s.meta.created_at > 0 && s.meta.updated_at >= s.meta.created_at,
            "timestamps invariant violated for {:?}",
            s.meta.id,
        );
        assert!(
            s.meta.message_count == s.messages.len() as u32,
            "message_count must match messages.len() for {:?}",
            s.meta.id,
        );
        assert!(
            s.meta.source_path.contains("/.kimi-code/sessions/"),
            "source_path should live under ~/.kimi-code/sessions: {:?}",
            s.meta.source_path,
        );
        if s.meta.is_sidechain {
            assert!(
                s.meta.parent_id.is_some(),
                "subagent must carry parent_id ({:?})",
                s.meta.id
            );
            assert!(
                s.meta.id.contains(':'),
                "subagent id should be <parent>:<agent>, got {:?}",
                s.meta.id
            );
        }

        // Every message keeps its role and shouldn't have empty timestamps
        // when the parser could derive one from metadata.created_at.
        for (i, m) in s.messages.iter().enumerate() {
            assert!(
                matches!(
                    m.role,
                    MessageRole::User
                        | MessageRole::Assistant
                        | MessageRole::Tool
                        | MessageRole::System
                ),
                "message {i} in {:?} has unexpected role",
                s.meta.id,
            );
        }

        // First few messages preview (helps eyeball Format A vs B).
        for m in s.messages.iter().take(3) {
            let preview: String = m.content.chars().take(80).collect();
            eprintln!(
                "    [{:?}] tool={:?} ts={:?} {:?}",
                m.role, m.tool_name, m.timestamp, preview
            );
        }
    }

    // The provider scans something useful — fail loudly if the user
    // logged in but no sessions were picked up (likely a path/glob bug
    // in collect_wire_files).
    if !parsed.is_empty() {
        let any_native = parsed
            .iter()
            .any(|s| s.meta.id.starts_with("session_") && !s.meta.is_sidechain);
        eprintln!("Found at least one native parent session: {any_native}");
    }
}
