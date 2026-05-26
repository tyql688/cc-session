//! Cursor's ACP (Agent Client Protocol) sessions.
//!
//! When an IDE or third-party editor (Zed, etc.) talks to
//! `cursor-agent acp`, the session is stored under
//! `~/.cursor/acp-sessions/<sessionId>/` instead of the per-project
//! `~/.cursor/projects/<key>/agent-transcripts/<id>/<id>.jsonl` layout
//! the standalone CLI writes. ACP sessions have:
//!
//! * `meta.json` — `{ schemaVersion, cwd, title }` (no model field;
//!   that lives in `store.db` meta like the chats/ store).
//! * `store.db` — the SAME content-addressed blob layout as
//!   `~/.cursor/chats/.../store.db`, except every chat message is
//!   reachable from the latest root protobuf blob: there is NO
//!   accompanying JSONL transcript on disk.
//!
//! So we reconstruct the transcript by recursively walking the
//! root blob's protobuf hash references and collecting any JSON
//! envelope with `role` in `{user, assistant, tool}`. The blob
//! payload shape mirrors the JSONL records the standalone CLI emits
//! but uses slightly different field names (`tool-call` vs
//! `tool_use`, `toolName`/`args` vs `name`/`input`, etc).

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde_json::Value;

use crate::models::{Message, MessageRole, Provider};
use crate::tool_metadata::{build_tool_metadata, ToolCallFacts};

use super::store_db::{decode_hex, read_meta_value};
use super::tools::{
    extract_think_content, normalise_user_text, remap_tool_args, strip_redacted, strip_think_tags,
};

/// Side-channel metadata pulled from `meta.json` next to the
/// session's `store.db`.
pub(crate) struct AcpSessionMeta {
    pub cwd: Option<String>,
    pub title: Option<String>,
}

/// Load `meta.json`. Failures degrade gracefully — the rest of the
/// session still parses, the UI just shows untitled / no-project.
pub(crate) fn load_meta_json(session_dir: &Path) -> AcpSessionMeta {
    let path = session_dir.join("meta.json");
    let mut meta = AcpSessionMeta {
        cwd: None,
        title: None,
    };
    let content = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(error) => {
            if error.kind() != std::io::ErrorKind::NotFound {
                log::warn!(
                    "failed to read Cursor ACP meta.json '{}': {error}",
                    path.display()
                );
            }
            return meta;
        }
    };
    match serde_json::from_str::<Value>(&content) {
        Ok(value) => {
            meta.cwd = value
                .get("cwd")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(str::to_string);
            meta.title = value
                .get("title")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(str::to_string);
        }
        Err(error) => {
            log::warn!(
                "failed to parse Cursor ACP meta.json '{}': {error}",
                path.display()
            );
        }
    }
    meta
}

/// Reconstruct the message list from an ACP `store.db`. Walks the
/// latest root blob's protobuf hash list recursively, collects every
/// JSON envelope with a recognised role, and translates them into the
/// canonical `Message` shape the frontend already renders for the
/// standalone CLI's transcripts.
///
/// Returns `(messages, parse_warning_count)` so callers can surface a
/// ⚠ badge if any record fails to parse.
pub(crate) fn parse_acp_transcript(store_db: &Path) -> (Vec<Message>, u32) {
    let conn = match Connection::open(store_db) {
        Ok(c) => c,
        Err(error) => {
            log::warn!(
                "failed to open Cursor ACP store.db '{}': {error}",
                store_db.display()
            );
            return (Vec::new(), 0);
        }
    };

    let Some(meta_value) = read_meta_value(&conn, store_db) else {
        return (Vec::new(), 0);
    };
    let Some(root_id) = meta_value
        .get("latestRootBlobId")
        .and_then(|v| v.as_str())
        .map(str::to_string)
    else {
        return (Vec::new(), 0);
    };

    let mut visited: HashSet<String> = HashSet::new();
    let mut envelopes: Vec<Value> = Vec::new();
    let mut warnings: u32 = 0;
    walk_blob(&conn, &root_id, &mut visited, &mut envelopes, &mut warnings);

    let mut messages = Vec::new();
    let mut call_id_to_idx: std::collections::HashMap<String, usize> = Default::default();
    for envelope in envelopes {
        translate_envelope(envelope, &mut messages, &mut call_id_to_idx);
    }
    (messages, warnings)
}

/// Recursively unfold the protobuf DAG: a non-JSON blob is treated as
/// a list of `0A 20 <32 bytes>` length-delimited hash references and
/// followed; a JSON blob is collected for translation. Cycles are
/// guarded by `visited`.
fn walk_blob(
    conn: &Connection,
    blob_id: &str,
    visited: &mut HashSet<String>,
    envelopes: &mut Vec<Value>,
    warnings: &mut u32,
) {
    if !visited.insert(blob_id.to_string()) {
        return;
    }
    let Some(bytes) = read_blob(conn, blob_id) else {
        return;
    };
    if bytes.first() == Some(&b'{') {
        match serde_json::from_slice::<Value>(&bytes) {
            Ok(value) => envelopes.push(value),
            Err(error) => {
                log::warn!("skipping malformed Cursor ACP blob '{blob_id}': {error}");
                *warnings = warnings.saturating_add(1);
            }
        }
        return;
    }
    // Protobuf node — scan for `0A 20 <hash>` patterns and recurse.
    let mut i = 0;
    while i + 2 + 32 <= bytes.len() {
        if bytes[i] == 0x0A && bytes[i + 1] == 0x20 {
            let hex: String = bytes[i + 2..i + 2 + 32]
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect();
            walk_blob(conn, &hex, visited, envelopes, warnings);
            i += 2 + 32;
        } else {
            i += 1;
        }
    }
}

fn read_blob(conn: &Connection, blob_id: &str) -> Option<Vec<u8>> {
    let mut stmt = conn.prepare("SELECT data FROM blobs WHERE id = ?1").ok()?;
    stmt.query_row([blob_id], |row| row.get::<_, Vec<u8>>(0))
        .ok()
}

/// Convert one ACP JSON envelope into transcript messages. Mirrors
/// parser::parse_messages but reads the ACP field shape directly:
///
/// * `role=system` / `user` content embedding `<user_info>` →
///   skipped (system framing the user never typed).
/// * `role=user` → MessageRole::User with `<user_query>` stripped and
///   `<image_files>` rewritten the same way the JSONL parser does.
/// * `role=assistant` → emit `[thinking]` (System), Assistant text,
///   then one Tool message per `tool-call` part.
/// * `role=tool` → merge `tool-result.result` into the matching tool
///   message by `toolCallId`.
fn translate_envelope(
    envelope: Value,
    messages: &mut Vec<Message>,
    call_id_to_idx: &mut std::collections::HashMap<String, usize>,
) {
    let role = envelope.get("role").and_then(|v| v.as_str()).unwrap_or("");
    match role {
        "user" => {
            let text = extract_user_text(&envelope);
            if text.is_empty() {
                return;
            }
            messages.push(Message {
                role: MessageRole::User,
                content: text,
                timestamp: None,
                tool_name: None,
                tool_input: None,
                token_usage: None,
                model: None,
                usage_hash: None,
                tool_metadata: None,
            });
        }
        "assistant" => {
            let Some(content) = envelope.get("content").and_then(|v| v.as_array()) else {
                return;
            };
            // First: collect all text parts, emit thinking + visible
            // assistant text up front (matches JSONL parser ordering).
            let mut combined_text = String::new();
            for part in content {
                if part.get("type").and_then(|v| v.as_str()) == Some("text") {
                    let raw = part.get("text").and_then(|v| v.as_str()).unwrap_or("");
                    if !raw.is_empty() {
                        if !combined_text.is_empty() {
                            combined_text.push('\n');
                        }
                        combined_text.push_str(raw);
                    }
                }
            }
            let cleaned = strip_redacted(&combined_text);
            if let Some(thinking) = extract_think_content(&cleaned) {
                messages.push(Message {
                    role: MessageRole::System,
                    content: format!("[thinking]\n{thinking}"),
                    timestamp: None,
                    tool_name: None,
                    tool_input: None,
                    token_usage: None,
                    model: None,
                    usage_hash: None,
                    tool_metadata: None,
                });
            }
            let visible = strip_think_tags(&cleaned);
            if !visible.is_empty() {
                messages.push(Message {
                    role: MessageRole::Assistant,
                    content: visible,
                    timestamp: None,
                    tool_name: None,
                    tool_input: None,
                    token_usage: None,
                    model: None,
                    usage_hash: None,
                    tool_metadata: None,
                });
            }
            // Then: one Tool message per tool-call, in order.
            for part in content {
                if part.get("type").and_then(|v| v.as_str()) != Some("tool-call") {
                    continue;
                }
                push_tool_call_acp(part, messages, call_id_to_idx);
            }
        }
        "tool" => {
            let Some(content) = envelope.get("content").and_then(|v| v.as_array()) else {
                return;
            };
            for part in content {
                if part.get("type").and_then(|v| v.as_str()) != Some("tool-result") {
                    continue;
                }
                merge_tool_result_acp(part, messages, call_id_to_idx);
            }
        }
        // role=system / unknown → drop
        _ => {}
    }
}

/// Pull the user-visible text out of a user-role envelope: prefer
/// the `content[].text` parts, fall back to a bare string content,
/// and run it through `normalise_user_text` so `<user_query>` /
/// `<image_files>` get unwrapped the same way the JSONL parser does.
fn extract_user_text(envelope: &Value) -> String {
    let content = envelope.get("content");
    let raw = match content {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|part| {
                if part.get("type").and_then(|v| v.as_str()) != Some("text") {
                    return None;
                }
                part.get("text")
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    };
    normalise_user_text(&raw)
}

fn push_tool_call_acp(
    part: &Value,
    messages: &mut Vec<Message>,
    call_id_to_idx: &mut std::collections::HashMap<String, usize>,
) {
    let raw_name = part
        .get("toolName")
        .and_then(|v| v.as_str())
        .unwrap_or("tool");
    let args = part.get("args");
    let call_id = part.get("toolCallId").and_then(|v| v.as_str());
    let metadata = build_tool_metadata(ToolCallFacts {
        provider: Provider::Cursor,
        raw_name,
        input: args,
        call_id,
        assistant_id: None,
    });
    let display_name = metadata.canonical_name.clone();
    let tool_input = args.and_then(|a| remap_tool_args(&display_name, a));
    let idx = messages.len();
    if let Some(cid) = call_id {
        call_id_to_idx.insert(cid.to_string(), idx);
    }
    messages.push(Message {
        role: MessageRole::Tool,
        content: String::new(),
        timestamp: None,
        tool_name: Some(display_name),
        tool_input,
        token_usage: None,
        model: None,
        usage_hash: None,
        tool_metadata: Some(metadata),
    });
}

fn merge_tool_result_acp(
    part: &Value,
    messages: &mut Vec<Message>,
    call_id_to_idx: &std::collections::HashMap<String, usize>,
) {
    let call_id = part.get("toolCallId").and_then(|v| v.as_str());
    let result_text = part
        .get("result")
        .and_then(|v| v.as_str())
        .or_else(|| {
            // Some tools store structured `experimental_content`.
            part.get("experimental_content")
                .and_then(|v| v.as_array())
                .and_then(|arr| {
                    arr.iter().find_map(|item| {
                        if item.get("type").and_then(|v| v.as_str()) == Some("text") {
                            item.get("text").and_then(|v| v.as_str())
                        } else {
                            None
                        }
                    })
                })
        })
        .unwrap_or("")
        .to_string();
    if let Some(idx) = call_id.and_then(|cid| call_id_to_idx.get(cid)).copied() {
        if let Some(msg) = messages.get_mut(idx) {
            msg.content = result_text;
            return;
        }
    }
    // Standalone tool message — no matching call seen yet.
    messages.push(Message {
        role: MessageRole::Tool,
        content: result_text,
        timestamp: None,
        tool_name: None,
        tool_input: None,
        token_usage: None,
        model: None,
        usage_hash: None,
        tool_metadata: None,
    });
}

/// Walk an ACP `~/.cursor/acp-sessions/` root and return the
/// per-session paths the provider treats as source files. Each entry
/// is `<session_dir>/store.db`.
pub(crate) fn collect_acp_sessions(home_dir: &Path) -> Vec<PathBuf> {
    let acp_root = home_dir.join(".cursor").join("acp-sessions");
    let Ok(entries) = std::fs::read_dir(&acp_root) else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_dir() {
                return None;
            }
            let store = path.join("store.db");
            if store.is_file() {
                Some(store)
            } else {
                None
            }
        })
        .collect()
}

// store_db.rs's `decode_hex` and `read_meta_value` are imported above —
// they need a tiny pub(super) visibility tweak in that module.
#[allow(dead_code)]
fn _force_decoder_import() {
    let _ = decode_hex;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn write_user_envelope(text: &str) -> Value {
        json!({
            "role": "user",
            "content": [{"type": "text", "text": text}],
        })
    }

    fn write_assistant_envelope(text: &str, tool_call: Option<Value>) -> Value {
        let mut content = vec![
            json!({"type": "redacted-reasoning", "data": "x", "providerOptions": {}}),
            json!({"type": "text", "text": text}),
        ];
        if let Some(tc) = tool_call {
            content.push(tc);
        }
        json!({"role": "assistant", "content": content})
    }

    #[test]
    fn translate_user_strips_user_query_wrapper() {
        let mut messages = Vec::new();
        let mut map = std::collections::HashMap::new();
        let env = write_user_envelope("<user_query>\nhi there\n</user_query>");
        translate_envelope(env, &mut messages, &mut map);
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].role, MessageRole::User);
        assert_eq!(messages[0].content, "hi there");
    }

    #[test]
    fn translate_assistant_skips_redacted_reasoning_and_emits_text_plus_tool_call() {
        let mut messages = Vec::new();
        let mut map = std::collections::HashMap::new();
        let tc = json!({
            "type": "tool-call",
            "toolCallId": "tool_1",
            "toolName": "Glob",
            "args": {"glob_pattern": "**/*.rs", "target_directory": "/src"}
        });
        let env = write_assistant_envelope("looking...", Some(tc));
        translate_envelope(env, &mut messages, &mut map);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, MessageRole::Assistant);
        assert_eq!(messages[0].content, "looking...");
        assert_eq!(messages[1].role, MessageRole::Tool);
        assert_eq!(messages[1].tool_name.as_deref(), Some("Glob"));
        let input: Value = serde_json::from_str(messages[1].tool_input.as_ref().unwrap()).unwrap();
        // Glob remap canonicalises `glob_pattern` → `pattern`.
        assert_eq!(input["pattern"], "**/*.rs");
        assert_eq!(input["path"], "/src");
    }

    #[test]
    fn tool_result_merges_into_call_by_id() {
        let mut messages = Vec::new();
        let mut map = std::collections::HashMap::new();
        let tc = json!({
            "type": "tool-call",
            "toolCallId": "tool_2",
            "toolName": "Read",
            "args": {"path": "/tmp/a"}
        });
        let assistant = write_assistant_envelope("reading", Some(tc));
        translate_envelope(assistant, &mut messages, &mut map);
        let tool_env = json!({
            "role": "tool",
            "content": [{
                "type": "tool-result",
                "toolCallId": "tool_2",
                "toolName": "Read",
                "result": "file contents here"
            }]
        });
        translate_envelope(tool_env, &mut messages, &mut map);
        // Tool message merged in place — no new push.
        let tool = messages
            .iter()
            .find(|m| m.role == MessageRole::Tool)
            .expect("tool message");
        assert_eq!(tool.content, "file contents here");
    }
}
