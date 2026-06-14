use std::collections::BTreeSet;

use serde_json::Value;

use super::registry;
use crate::models::{
    RawOutputPolicy, ToolDetail, ToolDiffLine, ToolDiffLineType, ToolInlineDiff, ToolLine,
    ToolMetadata, ToolPresentation,
};
use crate::provider_utils::shorten_home_path;

pub(super) fn refresh_tool_presentation(metadata: &mut ToolMetadata, input: Option<&Value>) {
    let input_detail = input
        .and_then(|value| input_detail_for(metadata, value))
        .or_else(|| {
            metadata
                .presentation
                .as_ref()
                .and_then(|presentation| presentation.input_detail.clone())
        });
    let result_detail = result_detail_for(metadata);
    let raw_output_policy = raw_output_policy(metadata.result_kind.as_deref());

    metadata.presentation = Some(ToolPresentation {
        icon: registry::icon_for(
            &metadata.canonical_name,
            &metadata.category,
            &metadata.raw_name,
        ),
        input_detail,
        result_detail,
        raw_output_policy,
    });
}

fn raw_output_policy(result_kind: Option<&str>) -> RawOutputPolicy {
    match result_kind {
        Some("terminal_output") => RawOutputPolicy::SuppressTerminal,
        Some("file_patch") => RawOutputPolicy::SuppressPatchWhenDiffPresent,
        _ => RawOutputPolicy::Keep,
    }
}

fn input_detail_for(metadata: &ToolMetadata, value: &Value) -> Option<ToolDetail> {
    let Some(obj) = value.as_object() else {
        let raw = value
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| value.to_string());
        if metadata.canonical_name == "Edit" && raw.contains("*** Begin Patch") {
            let mut lines = Vec::new();
            let files = patched_files(&raw);
            if !files.is_empty() {
                lines.push(line("files", files.join("\n")));
            }
            return Some(detail(lines).with_patch_diff(build_patch_line_diff(&raw)));
        }
        return Some(detail(vec![line("raw", value_to_display_string(value))]));
    };

    match metadata.canonical_name.as_str() {
        "Edit" => Some(edit_input_detail(obj)),
        "Write" => Some(write_input_detail(obj)),
        "Read" | "ReadMediaFile" => Some(read_input_detail(obj)),
        "Bash" => Some(detail(vec![line(
            "command",
            first_string(obj, &["command", "cmd", "CommandLine"]).unwrap_or_default(),
        )])),
        "Plan" => Some(plan_input_detail(obj)),
        "Grep" => Some(grep_input_detail(obj)),
        _ => Some(generic_detail(obj)),
    }
}

fn edit_input_detail(obj: &serde_json::Map<String, Value>) -> ToolDetail {
    if let Some(patch) = first_string(obj, &["patch"]) {
        let files = patched_files(&patch);
        let lines = if files.is_empty() {
            vec![line(
                "file",
                pick_field(obj, &["file_path", "filePath", "TargetFile"]).unwrap_or_default(),
            )]
        } else {
            vec![line("files", files.join("\n"))]
        };
        return detail(lines).with_patch_diff(build_patch_line_diff(&patch));
    }

    if let Some(chunks) = obj
        .get("ReplacementChunks")
        .and_then(|value| value.as_array())
    {
        let file = pick_field(obj, &["TargetFile", "file_path", "filePath"])
            .unwrap_or_else(|| "(unknown)".to_string());
        let patch = build_patch_from_antigravity_chunks(&file, chunks);
        return detail(vec![line("file", file)]).with_patch_diff(build_patch_line_diff(&patch));
    }

    detail(vec![line(
        "file",
        pick_field(obj, &["file_path", "filePath", "TargetFile"]).unwrap_or_default(),
    )])
    .with_diff(
        first_string(obj, &["old_string", "oldString", "TargetContent"]).unwrap_or_default(),
        first_string(obj, &["new_string", "newString", "ReplacementContent"]).unwrap_or_default(),
    )
}

fn write_input_detail(obj: &serde_json::Map<String, Value>) -> ToolDetail {
    detail(vec![
        line(
            "file",
            pick_field(obj, &["file_path", "filePath", "TargetFile"]).unwrap_or_default(),
        ),
        line(
            "content",
            first_string(obj, &["content", "CodeContent", "code_content"]).unwrap_or_default(),
        ),
    ])
}

fn read_input_detail(obj: &serde_json::Map<String, Value>) -> ToolDetail {
    let mut lines = vec![line(
        "file",
        pick_field(
            obj,
            &[
                "file_path",
                "filePath",
                "AbsolutePath",
                "path",
                "TargetFile",
            ],
        )
        .unwrap_or_default(),
    )];
    append_present_fields(
        &mut lines,
        obj,
        &[
            ("offset", &["offset"][..]),
            ("limit", &["limit"][..]),
            ("start", &["StartLine"][..]),
            ("end", &["EndLine"][..]),
        ],
    );
    detail(lines)
}

fn plan_input_detail(obj: &serde_json::Map<String, Value>) -> ToolDetail {
    let mut lines = Vec::new();
    if let Some(explanation) = first_string(obj, &["explanation"]) {
        lines.push(line("explanation", explanation));
    }
    if let Some(plan) = obj.get("plan").and_then(|value| value.as_array()) {
        let steps = plan
            .iter()
            .filter_map(|step| step.as_object())
            .map(|step| {
                let status = first_string(step, &["status"]).unwrap_or_default();
                let marker = match status.as_str() {
                    "completed" => "done",
                    "in_progress" => "active",
                    _ => "pending",
                };
                format!(
                    "{marker}: {}",
                    first_string(step, &["step"]).unwrap_or_default()
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        if !steps.is_empty() {
            lines.push(line("plan", steps));
        }
    }
    detail(lines)
}

fn grep_input_detail(obj: &serde_json::Map<String, Value>) -> ToolDetail {
    let mut lines = Vec::new();
    if let Some(pattern) = first_string(obj, &["pattern", "query", "Query", "DirectoryPath"]) {
        lines.push(line("pattern", pattern));
    }
    if let Some(path) = first_string(obj, &["path", "SearchPath"]) {
        lines.push(line("path", path));
    }
    if let Some(glob) = first_string(obj, &["glob"]) {
        lines.push(line("glob", glob));
    }
    detail(lines)
}

fn result_detail_for(metadata: &ToolMetadata) -> Option<ToolDetail> {
    let structured = metadata
        .structured
        .as_ref()
        .and_then(|value| value.as_object());
    let mut lines = Vec::new();
    if let Some(status) = metadata.status.as_deref() {
        lines.push(line("status", status));
    }
    if let Some(structured) = structured {
        append_call_metadata_lines(&mut lines, structured);
    }
    let persisted_output_path = structured.and_then(persisted_output_path);

    let mut detail = match (metadata.canonical_name.as_str(), structured) {
        ("Bash", Some(structured)) => bash_result_detail(lines, structured),
        ("Edit" | "Write", Some(structured)) => edit_result_detail(lines, structured),
        ("Agent", Some(structured)) => agent_result_detail(lines, structured),
        (
            "TaskCreate" | "TaskUpdate" | "TaskList" | "TaskOutput" | "TaskStop",
            Some(structured),
        ) => task_result_detail(lines, metadata, structured),
        ("ToolSearch", Some(structured)) => tool_search_result_detail(lines, structured),
        ("WebSearch", Some(structured)) => web_search_result_detail(lines, structured),
        ("WebFetch", Some(structured)) => web_fetch_result_detail(lines, structured),
        ("ImageGeneration", Some(structured)) => image_result_detail(lines, structured),
        ("DynamicTool", Some(structured)) => dynamic_result_detail(lines, structured),
        (
            "JavaScript" | "ComputerUse" | "StructuredOutput" | "SendMessage" | "ReadMediaFile",
            Some(structured),
        ) => output_result_detail(lines, structured),
        ("AskUserQuestion" | "RequestPermissions", Some(structured)) => {
            question_result_detail(lines, structured)
        }
        ("ScheduleWakeup" | "CronCreate" | "CronList" | "CronDelete", Some(structured)) => {
            schedule_result_detail(lines, structured)
        }
        ("Skill", Some(structured)) => skill_result_detail(lines, structured),
        ("Workflow", Some(structured)) => workflow_result_detail(lines, structured),
        ("CreateGoal" | "GetGoal" | "SetGoalBudget" | "UpdateGoal", Some(structured)) => {
            goal_result_detail(lines, structured)
        }
        (_, Some(structured)) if metadata.category == "mcp" => {
            mcp_result_detail(lines, metadata, structured)
        }
        (_, Some(structured)) => default_result_detail(lines, metadata, structured),
        (_, None) if !lines.is_empty() => detail(lines),
        (_, None) => return None,
    };

    detail.persisted_output_path = persisted_output_path.map(str::to_string);
    Some(detail)
}

fn bash_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    append_present_fields(
        &mut lines,
        structured,
        &[
            ("cwd", &["cwd"][..]),
            ("source", &["source"][..]),
            ("exit", &["exitCode", "exit_code"][..]),
            ("duration", &["durationSeconds", "duration_seconds"][..]),
            ("stdout", &["stdout", "output"][..]),
            ("stderr", &["stderr"][..]),
        ],
    );
    detail(lines)
}

fn edit_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    if let Some(file) = pick_field(structured, &["filePath", "file_path", "path"]) {
        lines.push(line("file", file));
    }
    let files = patch_files(structured);
    if !files.is_empty() {
        lines.push(line("files", files.join("\n")));
    }

    let metadata = nested_record(structured.get("metadata"));
    let file_diff = metadata.and_then(|record| nested_record(record.get("filediff")));
    let patch_text = first_string(structured, &["diff", "patch"])
        .or_else(|| metadata.and_then(|record| first_string(record, &["diff"])))
        .or_else(|| file_diff.and_then(|record| first_string(record, &["patch"])));
    if let Some(patch) = patch_text {
        return detail(lines).with_patch_diff(build_patch_line_diff(&patch));
    }

    let structured_patch = structured
        .get("structuredPatch")
        .map(build_structured_patch_line_diff)
        .unwrap_or_default();
    if !structured_patch.is_empty() {
        return detail(lines).with_patch_diff(structured_patch);
    }

    let old_text = first_string(structured, &["oldString", "old_string"]).unwrap_or_default();
    let new_text = first_string(structured, &["newString", "new_string"]).unwrap_or_default();
    if !old_text.is_empty() || !new_text.is_empty() {
        return detail(lines).with_diff(old_text, new_text);
    }

    if structured.get("type").and_then(Value::as_str) == Some("create") {
        if let Some(content) = first_string(structured, &["content"]) {
            if !content.is_empty() {
                return detail(lines).with_diff("", content);
            }
        }
    }

    detail(lines)
}

fn agent_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    append_present_fields(
        &mut lines,
        structured,
        &[
            ("agent", &["agentId"][..]),
            ("type", &["agentType"][..]),
            ("tokens", &["totalTokens"][..]),
            ("tools", &["totalToolUseCount"][..]),
            (
                "nickname",
                &["nickname", "new_agent_nickname", "receiver_agent_nickname"][..],
            ),
            ("role", &["new_agent_role", "receiver_agent_role"][..]),
            ("model", &["model"][..]),
            ("reasoning", &["reasoning_effort"][..]),
            ("sender", &["sender_thread_id"][..]),
            ("newThread", &["new_thread_id"][..]),
            ("receiver", &["receiver_thread_id"][..]),
        ],
    );
    if structured.get("timed_out").and_then(Value::as_bool) == Some(true) {
        lines.push(line("timedOut", "true"));
    }
    if let Some(status) = nested_status_text(structured.get("status"))
        .or_else(|| nested_status_text(structured.get("previous_status")))
    {
        lines.push(line("statusText", status));
    }
    if let Some(agent_statuses) = structured.get("agent_statuses").and_then(Value::as_array) {
        if !agent_statuses.is_empty() {
            lines.push(line("agentStatuses", agent_statuses.len().to_string()));
        }
    } else if let Some(statuses) = structured.get("statuses").and_then(Value::as_object) {
        lines.push(line("agentStatuses", statuses.len().to_string()));
    }
    detail(lines)
}

fn task_result_detail(
    mut lines: Vec<ToolLine>,
    metadata: &ToolMetadata,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    let task = structured.get("task").and_then(Value::as_object);
    if metadata.canonical_name == "TaskCreate" {
        if let Some(id) = task
            .and_then(|record| first_string(record, &["id", "taskId", "task_id"]))
            .or_else(|| first_string(structured, &["id", "taskId", "task_id"]))
        {
            lines.push(line("task", id));
        }
        if let Some(subject) = task
            .and_then(|record| first_string(record, &["subject", "description"]))
            .or_else(|| first_string(structured, &["subject", "description"]))
        {
            lines.push(line("subject", subject));
        }
        return detail(lines);
    }

    if metadata.canonical_name == "TaskList" {
        if let Some(tasks) = structured.get("tasks").and_then(Value::as_array) {
            lines.push(line("tasks", tasks.len().to_string()));
            let preview = tasks
                .iter()
                .filter_map(Value::as_object)
                .filter_map(|record| {
                    first_string(record, &["subject", "description", "task_id", "id"])
                })
                .collect::<Vec<_>>()
                .join("\n");
            if !preview.is_empty() {
                lines.push(line("preview", preview));
            }
        }
        return detail(lines);
    }

    if metadata.canonical_name == "TaskOutput" {
        for (label_name, keys) in [
            ("retrieval", &["retrieval_status"][..]),
            ("task", &["task_id"][..]),
            ("status", &["status"][..]),
            ("type", &["task_type"][..]),
            ("description", &["description"][..]),
            ("output", &["output"][..]),
        ] {
            let value = task
                .and_then(|record| first_string(record, keys))
                .or_else(|| first_string(structured, keys));
            if let Some(value) = value {
                lines.push(line(label_name, value));
            }
        }
        return detail(lines);
    }

    append_present_fields(
        &mut lines,
        structured,
        &[
            ("taskId", &["taskId"][..]),
            ("task_id", &["task_id"][..]),
            ("task_type", &["task_type"][..]),
            ("status", &["status"][..]),
            ("statusChange", &["statusChange"][..]),
            ("updatedFields", &["updatedFields"][..]),
            ("command", &["command"][..]),
            ("message", &["message"][..]),
            ("success", &["success"][..]),
        ],
    );
    detail(lines)
}

fn tool_search_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    append_present_fields(
        &mut lines,
        structured,
        &[
            ("query", &["query"][..]),
            ("matches", &["total_deferred_tools"][..]),
        ],
    );
    if let Some(matches) = structured.get("matches").and_then(Value::as_array) {
        lines.push(line("matches", matches.len().to_string()));
    }
    detail(lines)
}

fn web_search_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    append_present_fields(
        &mut lines,
        structured,
        &[
            ("query", &["query"][..]),
            ("searches", &["searchCount"][..]),
            ("duration", &["durationSeconds"][..]),
        ],
    );
    if let Some(results) = structured.get("results").and_then(Value::as_array) {
        lines.push(line("results", results.len().to_string()));
    }
    detail(lines)
}

fn web_fetch_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    append_present_fields(
        &mut lines,
        structured,
        &[
            ("url", &["url"][..]),
            ("code", &["code"][..]),
            ("codeText", &["codeText"][..]),
            ("bytes", &["bytes"][..]),
            ("durationMs", &["durationMs"][..]),
            ("result", &["result"][..]),
        ],
    );
    detail(lines)
}

fn image_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    append_present_fields(
        &mut lines,
        structured,
        &[
            ("savedPath", &["savedPath", "saved_path"][..]),
            ("revisedPrompt", &["revisedPrompt", "revised_prompt"][..]),
        ],
    );
    detail(lines)
}

fn dynamic_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    append_present_fields(
        &mut lines,
        structured,
        &[
            ("tool", &["tool", "name"][..]),
            ("success", &["success"][..]),
            ("duration", &["duration"][..]),
            ("result", &["content"][..]),
            ("error", &["error"][..]),
        ],
    );
    detail(lines)
}

fn output_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    append_present_fields(
        &mut lines,
        structured,
        &[
            ("output", &["output"][..]),
            ("content", &["content"][..]),
            ("result", &["result"][..]),
            ("stdout", &["stdout"][..]),
            ("stderr", &["stderr"][..]),
            ("error", &["error"][..]),
            ("success", &["success"][..]),
            ("duration", &["durationSeconds", "duration_seconds"][..]),
        ],
    );
    detail(lines)
}

fn question_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    if let Some(questions) = structured.get("questions").and_then(Value::as_array) {
        lines.push(line("questions", questions.len().to_string()));
    }
    append_present_fields(&mut lines, structured, &[("answers", &["answers"][..])]);
    detail(lines)
}

fn schedule_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    append_present_fields(
        &mut lines,
        structured,
        &[
            ("scheduledFor", &["scheduledFor"][..]),
            ("clampedDelaySeconds", &["clampedDelaySeconds"][..]),
            ("wasClamped", &["wasClamped"][..]),
        ],
    );
    detail(lines)
}

fn skill_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    append_present_fields(
        &mut lines,
        structured,
        &[
            ("command", &["commandName", "skill"][..]),
            ("success", &["success"][..]),
        ],
    );
    detail(lines)
}

fn workflow_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    append_present_fields(
        &mut lines,
        structured,
        &[
            ("workflowName", &["workflowName"][..]),
            ("status", &["status"][..]),
            ("summary", &["summary"][..]),
            ("runId", &["runId"][..]),
            ("taskId", &["taskId"][..]),
            ("taskType", &["taskType"][..]),
            ("scriptPath", &["scriptPath"][..]),
            ("transcriptDir", &["transcriptDir"][..]),
        ],
    );
    detail(lines)
}

fn goal_result_detail(
    mut lines: Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    append_present_fields(
        &mut lines,
        structured,
        &[
            ("status", &["status"][..]),
            ("objective", &["objective"][..]),
            ("remainingTokens", &["remainingTokens"][..]),
            ("token_budget", &["token_budget"][..]),
            ("completionBudgetReport", &["completionBudgetReport"][..]),
        ],
    );
    detail(lines)
}

fn mcp_result_detail(
    mut lines: Vec<ToolLine>,
    metadata: &ToolMetadata,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    if let Some(mcp) = &metadata.mcp {
        lines.push(line("server", &mcp.server));
        lines.push(line("tool", &mcp.tool));
    }
    if let Some(output) = mcp_result_summary(structured) {
        lines.push(line("output", output));
    }
    append_generic_lines(&mut lines, structured);
    detail(lines)
}

fn default_result_detail(
    mut lines: Vec<ToolLine>,
    metadata: &ToolMetadata,
    structured: &serde_json::Map<String, Value>,
) -> ToolDetail {
    if metadata.category == "task" {
        if let Some(task) = structured.get("task").and_then(Value::as_object) {
            append_present_fields(
                &mut lines,
                task,
                &[
                    ("id", &["id"][..]),
                    ("subject", &["subject"][..]),
                    ("task_id", &["task_id"][..]),
                    ("status", &["status"][..]),
                    ("task_type", &["task_type"][..]),
                    ("output", &["output"][..]),
                ],
            );
        }
        if let Some(tasks) = structured.get("tasks").and_then(Value::as_array) {
            lines.push(line("tasks", tasks.len().to_string()));
        }
    }
    append_generic_lines(&mut lines, structured);
    detail(lines)
}

fn generic_detail(obj: &serde_json::Map<String, Value>) -> ToolDetail {
    let mut lines = Vec::new();
    append_generic_lines(&mut lines, obj);
    detail(lines)
}

fn append_generic_lines(lines: &mut Vec<ToolLine>, obj: &serde_json::Map<String, Value>) {
    for (key, value) in obj {
        if matches!(
            key.as_str(),
            "callDescription" | "callDisplay" | "persistedOutputPath" | "structuredPatch"
        ) {
            continue;
        }
        let value = value_to_display_string(value);
        if !value.is_empty() {
            lines.push(line(key, value));
        }
    }
}

fn append_call_metadata_lines(
    lines: &mut Vec<ToolLine>,
    structured: &serde_json::Map<String, Value>,
) {
    if let Some(description) = first_string(structured, &["callDescription"]) {
        lines.push(line("description", description));
    }
    let Some(display) = structured.get("callDisplay").and_then(Value::as_object) else {
        return;
    };
    append_present_fields(
        lines,
        display,
        &[
            ("kind", &["kind"][..]),
            ("operation", &["operation"][..]),
            ("path", &["path"][..]),
            ("cwd", &["cwd"][..]),
            ("language", &["language"][..]),
            ("command", &["command"][..]),
            ("agent_name", &["agent_name"][..]),
        ],
    );
}

fn append_present_fields(
    lines: &mut Vec<ToolLine>,
    obj: &serde_json::Map<String, Value>,
    fields: &[(&str, &[&str])],
) {
    for (label, keys) in fields {
        if let Some(value) = pick_value(obj, keys) {
            let display = value_to_display_string(value);
            if !display.is_empty() {
                lines.push(line(*label, display));
            }
        }
    }
}

fn pick_value<'a>(obj: &'a serde_json::Map<String, Value>, keys: &[&str]) -> Option<&'a Value> {
    keys.iter()
        .find_map(|key| obj.get(*key).filter(|value| !value.is_null()))
}

fn first_string(obj: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| obj.get(*key))
        .find_map(|value| {
            value
                .as_str()
                .filter(|text| !text.is_empty())
                .map(str::to_string)
        })
}

fn pick_field(obj: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| obj.get(*key))
        .filter(|value| !value.is_null())
        .map(value_to_display_string)
}

fn nested_record(value: Option<&Value>) -> Option<&serde_json::Map<String, Value>> {
    value.and_then(Value::as_object)
}

fn persisted_output_path(structured: &serde_json::Map<String, Value>) -> Option<&str> {
    structured
        .get("persistedOutputPath")
        .and_then(Value::as_str)
        .or_else(|| structured.get("outputPath").and_then(Value::as_str))
        .or_else(|| {
            structured
                .get("metadata")
                .and_then(Value::as_object)
                .and_then(|metadata| metadata.get("outputPath"))
                .and_then(Value::as_str)
        })
}

fn nested_status_text(value: Option<&Value>) -> Option<String> {
    let record = value.and_then(Value::as_object)?;
    for key in ["completed", "failed", "running", "pending", "interrupted"] {
        if let Some(text) = first_string(record, &[key]) {
            return Some(text);
        }
    }
    None
}

fn mcp_result_summary(structured: &serde_json::Map<String, Value>) -> Option<String> {
    let result = structured.get("result").and_then(Value::as_object)?;
    if let Some(err) = result.get("Err").and_then(Value::as_str) {
        if !err.is_empty() {
            return Some(err.to_string());
        }
    }

    let ok = result
        .get("Ok")
        .and_then(Value::as_object)
        .and_then(|value| value.get("content"))
        .and_then(Value::as_array)?;
    let text = ok
        .iter()
        .filter_map(Value::as_object)
        .filter_map(|part| first_string(part, &["text"]))
        .collect::<Vec<_>>()
        .join("\n");
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn patch_files(structured: &serde_json::Map<String, Value>) -> Vec<String> {
    let mut files = BTreeSet::new();
    if let Some(patch) = structured.get("patch").and_then(Value::as_object) {
        push_file_array(&mut files, patch.get("files"));
    }
    if let Some(patches) = structured.get("patches").and_then(Value::as_array) {
        for patch in patches.iter().filter_map(Value::as_object) {
            push_file_array(&mut files, patch.get("files"));
        }
    }
    files.into_iter().collect()
}

fn push_file_array(files: &mut BTreeSet<String>, value: Option<&Value>) {
    let Some(values) = value.and_then(Value::as_array) else {
        return;
    };
    for file in values.iter().filter_map(Value::as_str) {
        if !file.is_empty() {
            files.insert(shorten_home_path(file));
        }
    }
}

fn patched_files(patch_text: &str) -> Vec<String> {
    let files = patch_text
        .lines()
        .filter_map(|line| {
            line.strip_prefix("*** Update File: ")
                .or_else(|| line.strip_prefix("*** Add File: "))
                .or_else(|| line.strip_prefix("*** Delete File: "))
                .or_else(|| line.strip_prefix("*** Move to: "))
                .map(str::trim)
        })
        .filter(|file| !file.is_empty())
        .map(shorten_home_path)
        .collect::<BTreeSet<_>>();
    files.into_iter().collect()
}

fn build_patch_from_antigravity_chunks(file: &str, chunks: &[Value]) -> String {
    let mut patch = format!("*** Begin Patch\n*** Update File: {file}\n");
    for chunk in chunks.iter().filter_map(Value::as_object) {
        let old_text = first_string(chunk, &["TargetContent"]).unwrap_or_default();
        let new_text = first_string(chunk, &["ReplacementContent"]).unwrap_or_default();
        let old_lines = split_patch_payload_lines(&old_text);
        let new_lines = split_patch_payload_lines(&new_text);
        let start_line = chunk
            .get("StartLine")
            .and_then(Value::as_u64)
            .unwrap_or(1)
            .max(1);
        let old_count = old_lines.len().max(1);
        let new_count = new_lines.len().max(1);
        patch.push_str(&format!(
            "@@ -{start_line},{old_count} +{start_line},{new_count} @@\n"
        ));
        for line in old_lines {
            patch.push('-');
            patch.push_str(line);
            patch.push('\n');
        }
        for line in new_lines {
            patch.push('+');
            patch.push_str(line);
            patch.push('\n');
        }
    }
    patch.push_str("*** End Patch\n");
    patch
}

fn split_patch_payload_lines(text: &str) -> Vec<&str> {
    if text.is_empty() {
        Vec::new()
    } else {
        text.split('\n').collect()
    }
}

fn build_patch_line_diff(patch_text: &str) -> Vec<ToolDiffLine> {
    let mut lines = Vec::new();
    for raw_line in patch_text.lines() {
        if raw_line == "*** Begin Patch" || raw_line == "*** End Patch" || raw_line.is_empty() {
            continue;
        }

        if raw_line.starts_with("*** ") || raw_line.starts_with("@@") {
            push_diff_line(
                &mut lines,
                ToolDiffLineType::Skip,
                &shorten_home_path(raw_line),
                None,
                None,
            );
        } else if let Some(rest) = raw_line.strip_prefix('+') {
            push_diff_line(&mut lines, ToolDiffLineType::Add, rest, None, None);
        } else if let Some(rest) = raw_line.strip_prefix('-') {
            push_diff_line(&mut lines, ToolDiffLineType::Remove, rest, None, None);
        } else if let Some(rest) = raw_line.strip_prefix(' ') {
            push_diff_line(&mut lines, ToolDiffLineType::Context, rest, None, None);
        } else {
            push_diff_line(&mut lines, ToolDiffLineType::Skip, raw_line, None, None);
        }
    }
    lines
}

fn build_structured_patch_line_diff(structured_patch: &Value) -> Vec<ToolDiffLine> {
    let Some(hunks) = structured_patch.as_array() else {
        return Vec::new();
    };
    let mut lines = Vec::new();

    for hunk in hunks.iter().filter_map(Value::as_object) {
        let Some(raw_lines) = hunk.get("lines").and_then(Value::as_array) else {
            continue;
        };
        let old_start = u32_field(hunk, "oldStart");
        let old_lines = u32_field(hunk, "oldLines").unwrap_or(0);
        let new_start = u32_field(hunk, "newStart");
        let new_lines = u32_field(hunk, "newLines").unwrap_or(0);

        let header = match (old_start, new_start) {
            (Some(old_start), Some(new_start)) => {
                format!("@@ -{old_start},{old_lines} +{new_start},{new_lines} @@")
            }
            _ => "@@".to_string(),
        };
        push_diff_line(&mut lines, ToolDiffLineType::Skip, &header, None, None);

        let mut old_line = old_start;
        let mut new_line = new_start;
        for raw in raw_lines.iter().filter_map(Value::as_str) {
            if let Some(rest) = raw.strip_prefix('+') {
                push_diff_line(&mut lines, ToolDiffLineType::Add, rest, None, new_line);
                increment_line(&mut new_line);
            } else if let Some(rest) = raw.strip_prefix('-') {
                push_diff_line(&mut lines, ToolDiffLineType::Remove, rest, old_line, None);
                increment_line(&mut old_line);
            } else if let Some(rest) = raw.strip_prefix(' ') {
                push_diff_line(
                    &mut lines,
                    ToolDiffLineType::Context,
                    rest,
                    old_line,
                    new_line,
                );
                increment_line(&mut old_line);
                increment_line(&mut new_line);
            } else {
                push_diff_line(&mut lines, ToolDiffLineType::Skip, raw, None, None);
            }
        }
    }

    lines
}

fn u32_field(obj: &serde_json::Map<String, Value>, key: &str) -> Option<u32> {
    obj.get(key)
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
}

fn increment_line(line: &mut Option<u32>) {
    if let Some(value) = line {
        *value += 1;
    }
}

fn push_diff_line(
    lines: &mut Vec<ToolDiffLine>,
    kind: ToolDiffLineType,
    text: &str,
    old_line: Option<u32>,
    new_line: Option<u32>,
) {
    lines.push(ToolDiffLine {
        kind,
        old_line,
        new_line,
        text: text.trim_end_matches('\n').to_string(),
    });
}

fn line(label: impl Into<String>, value: impl Into<String>) -> ToolLine {
    let label = label.into();
    let value = value.into();
    ToolLine {
        value: if is_path_label(&label) {
            shorten_home_path(&value)
        } else {
            value
        },
        label,
    }
}

fn is_path_label(label: &str) -> bool {
    let normalized = label.to_ascii_lowercase();
    normalized == "file" || normalized == "path" || normalized.ends_with("path")
}

fn detail(lines: Vec<ToolLine>) -> ToolDetail {
    ToolDetail {
        lines,
        diff: None,
        patch_diff: None,
        persisted_output_path: None,
    }
}

trait ToolDetailExt {
    fn with_diff(self, old: impl Into<String>, new: impl Into<String>) -> ToolDetail;
    fn with_patch_diff(self, patch_diff: Vec<ToolDiffLine>) -> ToolDetail;
}

impl ToolDetailExt for ToolDetail {
    fn with_diff(mut self, old: impl Into<String>, new: impl Into<String>) -> ToolDetail {
        self.diff = Some(ToolInlineDiff {
            old: old.into(),
            new: new.into(),
        });
        self
    }

    fn with_patch_diff(mut self, patch_diff: Vec<ToolDiffLine>) -> ToolDetail {
        self.patch_diff = Some(patch_diff);
        self
    }
}

fn value_to_display_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Number(number) => number.to_string(),
        Value::Bool(value) => value.to_string(),
        Value::Array(values) => values
            .iter()
            .map(value_to_display_string)
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(", "),
        Value::Object(obj) => {
            if let (Some(from), Some(to)) = (obj.get("from"), obj.get("to")) {
                return format!(
                    "{} → {}",
                    value_to_display_string(from),
                    value_to_display_string(to)
                );
            }
            obj.iter()
                .map(|(key, value)| format!("{key}: {}", value_to_display_string(value)))
                .collect::<Vec<_>>()
                .join(", ")
        }
        Value::Null => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::models::{Provider, RawOutputPolicy};
    use crate::tool_metadata::{
        build_tool_metadata, enrich_tool_metadata, ToolCallFacts, ToolResultFacts,
    };

    #[test]
    fn builds_input_and_result_presentation_for_bash() {
        let mut metadata = build_tool_metadata(ToolCallFacts {
            provider: Provider::Codex,
            raw_name: "exec_command",
            input: Some(&json!({ "cmd": "cargo test" })),
            call_id: None,
            assistant_id: None,
        });
        enrich_tool_metadata(
            &mut metadata,
            ToolResultFacts {
                raw_result: Some(&json!({ "stdout": "ok", "exitCode": 0 })),
                is_error: Some(false),
                status: None,
                artifact_path: None,
            },
        );

        let presentation = metadata.presentation.unwrap();
        assert_eq!(presentation.icon, "💻");
        assert_eq!(
            presentation.raw_output_policy,
            RawOutputPolicy::SuppressTerminal
        );
        assert_eq!(
            presentation
                .input_detail
                .as_ref()
                .unwrap()
                .lines
                .first()
                .unwrap()
                .value,
            "cargo test"
        );
        assert!(presentation
            .result_detail
            .as_ref()
            .unwrap()
            .lines
            .iter()
            .any(|line| line.label == "stdout" && line.value == "ok"));
    }

    #[test]
    fn keeps_full_structured_output_and_patch_lines() {
        let large = "x".repeat(8_000);
        let patch_lines = (0..400)
            .map(|index| format!("+line {index}"))
            .collect::<Vec<_>>();
        let mut metadata = build_tool_metadata(ToolCallFacts {
            provider: Provider::Claude,
            raw_name: "Edit",
            input: None,
            call_id: None,
            assistant_id: None,
        });
        enrich_tool_metadata(
            &mut metadata,
            ToolResultFacts {
                raw_result: Some(&json!({
                    "filePath": "/tmp/a.rs",
                    "originalFile": large,
                    "structuredPatch": [{
                        "oldStart": 1,
                        "oldLines": 0,
                        "newStart": 1,
                        "newLines": 400,
                        "lines": patch_lines
                    }]
                })),
                is_error: Some(false),
                status: None,
                artifact_path: None,
            },
        );

        assert_eq!(
            metadata
                .structured
                .as_ref()
                .and_then(|value| value.get("originalFile"))
                .and_then(Value::as_str)
                .map(str::len),
            Some(8_000)
        );
        let patch_diff = metadata
            .presentation
            .as_ref()
            .and_then(|presentation| presentation.result_detail.as_ref())
            .and_then(|detail| detail.patch_diff.as_ref())
            .unwrap();
        assert_eq!(patch_diff.len(), 401);
    }

    #[test]
    fn wraps_scalar_results_as_output_detail() {
        let mut metadata = build_tool_metadata(ToolCallFacts {
            provider: Provider::Claude,
            raw_name: "SendMessage",
            input: Some(&json!({ "message": "notify" })),
            call_id: None,
            assistant_id: None,
        });
        enrich_tool_metadata(
            &mut metadata,
            ToolResultFacts {
                raw_result: Some(&json!("sent")),
                is_error: Some(false),
                status: None,
                artifact_path: None,
            },
        );

        assert!(metadata
            .presentation
            .as_ref()
            .and_then(|presentation| presentation.result_detail.as_ref())
            .unwrap()
            .lines
            .iter()
            .any(|line| line.label == "output" && line.value == "sent"));
    }

    #[test]
    fn unknown_results_still_render_generic_lines() {
        let mut metadata = build_tool_metadata(ToolCallFacts {
            provider: Provider::Claude,
            raw_name: "Frobnicate",
            input: Some(&json!({ "target": "thing" })),
            call_id: None,
            assistant_id: None,
        });
        enrich_tool_metadata(
            &mut metadata,
            ToolResultFacts {
                raw_result: Some(&json!({ "message": "done", "count": 3 })),
                is_error: Some(false),
                status: None,
                artifact_path: None,
            },
        );

        let detail = metadata
            .presentation
            .as_ref()
            .and_then(|presentation| presentation.result_detail.as_ref())
            .unwrap();
        assert!(detail
            .lines
            .iter()
            .any(|line| line.label == "message" && line.value == "done"));
        assert!(detail
            .lines
            .iter()
            .any(|line| line.label == "count" && line.value == "3"));
    }

    #[test]
    fn builds_presentation_for_recent_tool_families() {
        fn detail_lines(raw_name: &str, result: Value) -> Vec<ToolLine> {
            let mut metadata = build_tool_metadata(ToolCallFacts {
                provider: Provider::Claude,
                raw_name,
                input: Some(&json!({})),
                call_id: None,
                assistant_id: None,
            });
            enrich_tool_metadata(
                &mut metadata,
                ToolResultFacts {
                    raw_result: Some(&result),
                    is_error: Some(false),
                    status: None,
                    artifact_path: None,
                },
            );
            metadata
                .presentation
                .as_ref()
                .and_then(|presentation| presentation.result_detail.as_ref())
                .map(|detail| detail.lines.clone())
                .unwrap()
        }

        let agent = detail_lines(
            "spawn_agent",
            json!({ "agentId": "agent-1", "nickname": "worker" }),
        );
        assert!(agent
            .iter()
            .any(|line| line.label == "agent" && line.value == "agent-1"));

        let task = detail_lines(
            "TaskOutput",
            json!({ "task": { "task_id": "task-1", "output": "done" } }),
        );
        assert!(task
            .iter()
            .any(|line| line.label == "output" && line.value == "done"));

        let web_search = detail_lines(
            "WebSearch",
            json!({ "query": "tools", "searchCount": 1, "results": [{ "title": "hit" }] }),
        );
        assert!(web_search
            .iter()
            .any(|line| line.label == "results" && line.value == "1"));

        let web_fetch = detail_lines(
            "WebFetch",
            json!({ "url": "https://example.com", "code": 200 }),
        );
        assert!(web_fetch
            .iter()
            .any(|line| line.label == "code" && line.value == "200"));

        let question = detail_lines(
            "AskUserQuestion",
            json!({ "questions": [{ "question": "Ship?" }], "answers": { "ship": "yes" } }),
        );
        assert!(question
            .iter()
            .any(|line| line.label == "answers" && line.value == "ship: yes"));

        let schedule = detail_lines(
            "ScheduleWakeup",
            json!({ "scheduledFor": "2026-06-14T12:00:00Z" }),
        );
        assert!(schedule.iter().any(|line| line.label == "scheduledFor"));

        let skill = detail_lines(
            "Skill",
            json!({ "commandName": "imagegen", "success": true }),
        );
        assert!(skill
            .iter()
            .any(|line| line.label == "command" && line.value == "imagegen"));

        let workflow = detail_lines(
            "Workflow",
            json!({ "workflowName": "audit", "summary": "ok" }),
        );
        assert!(workflow
            .iter()
            .any(|line| line.label == "summary" && line.value == "ok"));

        let mcp = detail_lines(
            "mcp__server__do_thing",
            json!({ "result": { "Ok": { "content": [{ "text": "mcp ok" }] } } }),
        );
        assert!(mcp
            .iter()
            .any(|line| line.label == "server" && line.value == "server"));
        assert!(mcp
            .iter()
            .any(|line| line.label == "output" && line.value == "mcp ok"));
    }
}
