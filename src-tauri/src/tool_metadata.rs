use std::collections::BTreeMap;

use serde_json::{json, Map, Value};

use crate::models::{McpToolMetadata, Provider, ToolMetadata};

pub struct ToolCallFacts<'a> {
    pub provider: Provider,
    pub raw_name: &'a str,
    pub input: Option<&'a Value>,
    pub call_id: Option<&'a str>,
    pub assistant_id: Option<&'a str>,
}

#[derive(Clone, Copy)]
pub struct ToolResultFacts<'a> {
    pub raw_result: Option<&'a Value>,
    pub is_error: Option<bool>,
    pub status: Option<&'a str>,
    pub artifact_path: Option<&'a str>,
}

pub fn parse_mcp_tool_name(name: &str) -> Option<McpToolMetadata> {
    let rest = name.strip_prefix("mcp__")?;
    let (server, tool) = rest.split_once("__")?;
    Some(McpToolMetadata {
        server: server.to_string(),
        tool: tool.to_string(),
        display: tool.replace('_', " "),
    })
}

pub fn canonical_tool_name(_provider: Provider, name: &str) -> String {
    match name {
        "Shell" | "exec_command" | "run_in_terminal" => "Bash",
        "ReadFile" | "read_file" | "view" => "Read",
        "WriteFile" | "write_file" => "Write",
        "ApplyPatch" | "Apply_patch" | "MultiEdit" | "str_replace_editor" => "Edit",
        "Search" | "SemanticSearch" | "grep_search" => "Grep",
        "file_search" => "Glob",
        "Task" | "Subagent" => "Agent",
        other => other,
    }
    .to_string()
}

fn tool_category(canonical_name: &str, raw_name: &str) -> String {
    if raw_name.starts_with("mcp__") {
        return "mcp".to_string();
    }

    match canonical_name {
        "Bash" => "shell",
        "Read" | "Write" | "Edit" => "file",
        "Grep" | "Glob" | "ToolSearch" | "ListMcpResourcesTool" => "search",
        "Agent" | "SendMessage" => "agent",
        "TaskCreate" | "TaskUpdate" | "TaskList" | "TaskStop" => "task",
        "WebSearch" | "WebFetch" => "web",
        "Skill" => "skill",
        "CronCreate" | "CronDelete" => "cron",
        "EnterPlanMode" | "ExitPlanMode" | "Plan" => "plan",
        "AskUserQuestion" => "interaction",
        _ => "unknown",
    }
    .to_string()
}

fn display_tool_name(raw_name: &str, canonical_name: &str) -> String {
    parse_mcp_tool_name(raw_name)
        .map(|mcp| mcp.display)
        .unwrap_or_else(|| canonical_name.to_string())
}

fn compact_string(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        return value.to_string();
    }
    let end = value.floor_char_boundary(limit);
    format!("{}…", &value[..end])
}

fn short_path(value: &str) -> String {
    value
        .rsplit('/')
        .take(2)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("/")
}

fn string_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(|v| v.as_str()))
}

fn input_summary(canonical_name: &str, raw_name: &str, input: Option<&Value>) -> Option<String> {
    let input = input?;
    let summary = match canonical_name {
        "Read" | "Write" | "Edit" => string_field(input, &["file_path", "filePath", "path"])
            .map(short_path)
            .unwrap_or_default(),
        "Bash" => string_field(input, &["description", "command", "cmd"])
            .map(|s| compact_string(s, 80))
            .unwrap_or_default(),
        "Grep" => string_field(input, &["pattern", "query"])
            .map(|pattern| {
                let mut value = format!("/{}/", compact_string(pattern, 60));
                if let Some(path) = string_field(input, &["path"]) {
                    value.push(' ');
                    value.push_str(&short_path(path));
                }
                value
            })
            .unwrap_or_default(),
        "Glob" => string_field(input, &["pattern"])
            .unwrap_or_default()
            .to_string(),
        "Agent" => string_field(input, &["description", "prompt"])
            .map(|s| compact_string(s, 80))
            .unwrap_or_default(),
        "TaskCreate" => string_field(input, &["subject", "description"])
            .map(|s| compact_string(s, 80))
            .unwrap_or_default(),
        "TaskUpdate" => {
            let id = string_field(input, &["taskId", "task_id"]).unwrap_or_default();
            let status = string_field(input, &["status"]).unwrap_or_default();
            [id, status]
                .into_iter()
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join(" → ")
        }
        "TaskStop" => string_field(input, &["task_id", "taskId"])
            .unwrap_or_default()
            .to_string(),
        "Skill" => string_field(input, &["skill"])
            .unwrap_or_default()
            .to_string(),
        "ToolSearch" => string_field(input, &["query"])
            .unwrap_or_default()
            .to_string(),
        "WebSearch" => string_field(input, &["query"])
            .unwrap_or_default()
            .to_string(),
        "WebFetch" => string_field(input, &["url"])
            .unwrap_or_default()
            .to_string(),
        _ if raw_name.starts_with("mcp__") => {
            string_field(input, &["element", "url", "filter", "level"])
                .map(|s| compact_string(s, 80))
                .unwrap_or_default()
        }
        _ => input
            .as_object()
            .and_then(|obj| {
                obj.values()
                    .find_map(|v| v.as_str().filter(|s| !s.is_empty()))
            })
            .map(|s| compact_string(s, 80))
            .unwrap_or_default(),
    };

    if summary.is_empty() {
        None
    } else {
        Some(summary)
    }
}

fn compact_json_value(value: &Value, depth: usize) -> Value {
    if depth > 3 {
        return json!("<nested>");
    }
    match value {
        Value::String(s) => Value::String(compact_string(s, 4_000)),
        Value::Array(arr) => Value::Array(
            arr.iter()
                .take(25)
                .map(|item| compact_json_value(item, depth + 1))
                .collect(),
        ),
        Value::Object(obj) => {
            let mut next = Map::new();
            for (key, value) in obj {
                if key == "originalFile" {
                    next.insert(key.clone(), json!("<omitted>"));
                    continue;
                }
                next.insert(key.clone(), compact_json_value(value, depth + 1));
            }
            Value::Object(next)
        }
        _ => value.clone(),
    }
}

fn result_kind_for_tool(raw_name: &str, result: Option<&Value>) -> Option<String> {
    if raw_name.starts_with("mcp__") {
        return Some("mcp".to_string());
    }
    let result = result?;
    if result.get("persistedOutputPath").is_some() {
        return Some("persisted_output".to_string());
    }
    if result.get("stdout").is_some() || result.get("stderr").is_some() {
        return Some("terminal_output".to_string());
    }
    if result.get("structuredPatch").is_some()
        || (result.get("oldString").is_some() && result.get("newString").is_some())
    {
        return Some("file_patch".to_string());
    }
    if result.get("agentId").is_some() {
        return Some("agent_summary".to_string());
    }
    if result.get("task").is_some() || result.get("taskId").is_some() {
        return Some("task_status".to_string());
    }
    None
}

fn normalized_status(result: ToolResultFacts<'_>) -> Option<String> {
    if result.is_error.unwrap_or(false) {
        return Some("error".to_string());
    }
    if let Some(status) = result.status {
        return Some(status.to_string());
    }
    if let Some(result) = result.raw_result {
        if let Some(status) = result.get("status").and_then(|v| v.as_str()) {
            return Some(status.to_string());
        }
        if result
            .get("interrupted")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            return Some("interrupted".to_string());
        }
        if let Some(success) = result.get("success").and_then(|v| v.as_bool()) {
            return Some(if success { "success" } else { "error" }.to_string());
        }
    }
    Some("success".to_string())
}

pub fn build_tool_metadata(call: ToolCallFacts<'_>) -> ToolMetadata {
    let canonical_name = canonical_tool_name(call.provider, call.raw_name);
    let display_name = display_tool_name(call.raw_name, &canonical_name);
    let mut ids = BTreeMap::new();
    if let Some(id) = call.call_id {
        ids.insert("tool_use_id".to_string(), id.to_string());
    }
    if let Some(id) = call.assistant_id {
        ids.insert("assistant_id".to_string(), id.to_string());
    }

    ToolMetadata {
        raw_name: call.raw_name.to_string(),
        canonical_name: canonical_name.clone(),
        display_name,
        category: tool_category(&canonical_name, call.raw_name),
        summary: input_summary(&canonical_name, call.raw_name, call.input),
        status: None,
        ids,
        mcp: parse_mcp_tool_name(call.raw_name),
        result_kind: None,
        structured: None,
    }
}

pub fn enrich_tool_metadata(metadata: &mut ToolMetadata, result: ToolResultFacts<'_>) {
    metadata.status = normalized_status(ToolResultFacts { ..result });
    metadata.result_kind = result_kind_for_tool(&metadata.raw_name, result.raw_result)
        .or_else(|| metadata.result_kind.clone());
    metadata.structured = result
        .raw_result
        .map(|value| compact_json_value(value, 0))
        .or_else(|| metadata.structured.clone());
    if let Some(path) = result.artifact_path {
        let mut structured = metadata
            .structured
            .take()
            .unwrap_or_else(|| Value::Object(Map::new()));
        if !structured.is_object() {
            structured = Value::Object(Map::new());
        }
        if let Value::Object(obj) = &mut structured {
            obj.insert(
                "persistedOutputPath".to_string(),
                Value::String(path.to_string()),
            );
        }
        metadata.structured = Some(structured);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_tool_metadata, enrich_tool_metadata, parse_mcp_tool_name, ToolCallFacts,
        ToolResultFacts,
    };
    use crate::models::Provider;
    use serde_json::json;

    #[test]
    fn maps_common_tool_aliases_to_canonical_names() {
        for (raw, canonical) in [
            ("Shell", "Bash"),
            ("exec_command", "Bash"),
            ("ReadFile", "Read"),
            ("ApplyPatch", "Edit"),
            ("SemanticSearch", "Grep"),
            ("Subagent", "Agent"),
        ] {
            let metadata = build_tool_metadata(ToolCallFacts {
                provider: Provider::Claude,
                raw_name: raw,
                input: None,
                call_id: None,
                assistant_id: None,
            });
            assert_eq!(metadata.canonical_name, canonical);
        }
    }

    #[test]
    fn parses_mcp_tool_names() {
        let mcp = parse_mcp_tool_name("mcp__plugin_playwright__browser_snapshot").unwrap();
        assert_eq!(mcp.server, "plugin_playwright");
        assert_eq!(mcp.tool, "browser_snapshot");
        assert_eq!(mcp.display, "browser snapshot");
    }

    #[test]
    fn compacts_large_structured_results() {
        let mut metadata = build_tool_metadata(ToolCallFacts {
            provider: Provider::Claude,
            raw_name: "Edit",
            input: None,
            call_id: Some("toolu_1"),
            assistant_id: Some("assistant-1"),
        });
        enrich_tool_metadata(
            &mut metadata,
            ToolResultFacts {
                raw_result: Some(&json!({
                    "filePath": "/repo/src/main.rs",
                    "originalFile": "very large",
                    "oldString": "old",
                    "newString": "new"
                })),
                is_error: Some(false),
                status: None,
                artifact_path: None,
            },
        );

        assert_eq!(metadata.category, "file");
        assert_eq!(metadata.result_kind.as_deref(), Some("file_patch"));
        assert_eq!(
            metadata.ids.get("tool_use_id").map(String::as_str),
            Some("toolu_1")
        );
        assert_eq!(
            metadata
                .structured
                .as_ref()
                .and_then(|value| value.get("originalFile"))
                .and_then(|value| value.as_str()),
            Some("<omitted>")
        );
    }
}
