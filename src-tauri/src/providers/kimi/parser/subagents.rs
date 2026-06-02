//! Subagent title resolution.
//!
//! kimi-code spawns subagents via an `Agent` tool call in the parent's
//! wire.jsonl whose `args.description` is the short, intentional label
//! the parent (LLM) chose for the subtask — e.g. "Find .toml files".
//! The subagent's *own* first user message is a much larger blob —
//! `<git-context>…</git-context><environment>…</environment>` plus the
//! prompt — so using it as a tree title clutters the UI.
//!
//! At parse time we don't know which Agent tool.call produced a given
//! `agent-N` directory until we see its tool.result, which carries
//! `agent_id: agent-N` in the rendered text. We scan the parent's wire
//! once per session dir and build an `agent-N → description` map.

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use serde_json::Value;

/// Scan a parent `wire.jsonl` and build the `agent-N → description`
/// map produced by Agent tool calls. Returns an empty map if the file
/// is missing or contains no Agent invocations.
pub(super) fn collect_subagent_descriptions(parent_wire: &Path) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let file = match File::open(parent_wire) {
        Ok(f) => f,
        Err(_) => return map,
    };
    // toolCallId → description from the spawning Agent tool.call,
    // resolved to its agent_id once we see the matching tool.result.
    let mut pending: HashMap<String, String> = HashMap::new();
    for line in BufReader::new(file).lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                log::warn!(
                    "kimi: failed to read line from {}: {e}",
                    parent_wire.display()
                );
                continue;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        let entry: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                log::warn!(
                    "kimi: skipping malformed JSON in {}: {e}",
                    parent_wire.display()
                );
                continue;
            }
        };
        if entry.get("type").and_then(|v| v.as_str()) != Some("context.append_loop_event") {
            continue;
        }
        let Some(ev) = entry.get("event") else {
            continue;
        };
        let ev_type = ev.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match ev_type {
            "tool.call" if ev.get("name").and_then(|v| v.as_str()) == Some("Agent") => {
                let Some(call_id) = ev.get("toolCallId").and_then(|v| v.as_str()) else {
                    continue;
                };
                let args = ev.get("args");
                let description = args
                    .and_then(|a| a.get("description"))
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .map(str::to_string);
                if let Some(desc) = description {
                    pending.insert(call_id.to_string(), desc);
                }
            }
            "tool.result" => {
                let Some(call_id) = ev.get("toolCallId").and_then(|v| v.as_str()) else {
                    continue;
                };
                let Some(desc) = pending.remove(call_id) else {
                    continue;
                };
                // The result output text starts with `agent_id: <name>`
                // when the spawned agent is local (subagent). A single
                // Agent tool.call can dispatch to multiple targets and
                // the result lists each agent_id on its own line:
                //   agent_id: agent-0
                //   …
                //   agent_id: agent-1
                //   …
                // Map all matched ids to the same description so each
                // subagent gets a meaningful title.
                let output = ev
                    .get("result")
                    .and_then(|r| r.get("output"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                for raw_line in output.lines() {
                    if let Some(rest) = raw_line.strip_prefix("agent_id:") {
                        let agent_id = rest.trim();
                        if !agent_id.is_empty() {
                            map.insert(agent_id.to_string(), desc.clone());
                        }
                    }
                }
            }
            _ => {}
        }
    }
    map
}
