use std::fs;
use std::path::Path;

use super::format::{aggregate_token_usage, fmt_tokens, format_epoch};
use crate::models::{Message, MessageRole, SessionDetail};

fn role_label(role: &MessageRole) -> &'static str {
    match role {
        MessageRole::User => "User",
        MessageRole::Assistant => "Assistant",
        MessageRole::Tool => "Tool",
        MessageRole::System => "System",
    }
}

fn should_render_message(msg: &Message) -> bool {
    match msg.role {
        MessageRole::Tool => {
            msg.tool_name.as_deref().is_some_and(|s| !s.is_empty())
                || msg.tool_input.as_deref().is_some_and(|s| !s.is_empty())
                || !msg.content.trim().is_empty()
        }
        _ => !msg.content.trim().is_empty(),
    }
}

pub fn render(detail: &SessionDetail) -> String {
    let mut out = String::new();

    out.push_str(&format!("# {}\n\n", detail.meta.title));
    out.push_str(&format!("- **Provider**: {}\n", detail.meta.provider));
    out.push_str(&format!("- **Project**: {}\n", detail.meta.project_name));
    if detail.meta.created_at > 0 {
        out.push_str(&format!(
            "- **Date**: {}\n",
            format_epoch(detail.meta.created_at, "")
        ));
    }
    out.push_str(&format!("- **Messages**: {}\n", detail.meta.message_count));
    out.push_str(&format!("- **Session ID**: {}\n", detail.meta.id));

    // Token usage summary
    let (total_input, total_output, total_cache_read, total_cache_write) =
        aggregate_token_usage(&detail.messages);
    if total_input > 0 || total_output > 0 {
        out.push('\n');
        out.push_str("### Token Usage\n\n");
        out.push_str("| Input | Output | Cache Read | Cache Write | Total |\n");
        out.push_str("| ---: | ---: | ---: | ---: | ---: |\n");
        let total = total_input + total_output;
        out.push_str(&format!(
            "| {} | {} | {} | {} | {} |\n",
            fmt_tokens(total_input),
            fmt_tokens(total_output),
            fmt_tokens(total_cache_read),
            fmt_tokens(total_cache_write),
            fmt_tokens(total),
        ));
    }

    out.push('\n');
    out.push_str("---\n\n");

    for msg in detail
        .messages
        .iter()
        .filter(|msg| should_render_message(msg))
    {
        let role = role_label(&msg.role);
        let ts = msg.timestamp.as_deref().unwrap_or("");
        out.push_str(&format!("### {role} {ts}\n\n"));

        // Escape content that could be mistaken for markdown structure
        let content = &msg.content;
        if content.starts_with('#') || content.starts_with("---") {
            out.push_str("> ");
            out.push_str(&content.replace('\n', "\n> "));
        } else {
            out.push_str(content);
        }
        out.push_str("\n\n---\n\n");
    }

    out
}

pub fn export_markdown(detail: &SessionDetail, output_path: &Path) -> Result<(), String> {
    let out = super::redact_home_path(&render(detail));
    fs::write(output_path, out).map_err(|e| format!("failed to write file: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Provider, SessionMeta, TokenUsage};

    fn synthetic_meta() -> SessionMeta {
        SessionMeta {
            id: "11111111-1111-4111-a111-111111111111".into(),
            provider: Provider::Claude,
            title: "Refactor the parser".into(),
            project_path: "/home/dev/proj".into(),
            project_name: "proj".into(),
            // 2026-01-02 03:04:05 UTC — fixed so the rendered date line is deterministic.
            created_at: 1_767_322_245,
            updated_at: 1_767_322_245,
            message_count: 3,
            file_size_bytes: 0,
            source_path: "/home/dev/proj/session.jsonl".into(),
            is_sidechain: false,
            variant_name: None,
            model: Some("claude-opus-4-6".into()),
            cc_version: None,
            git_branch: None,
            parent_id: None,
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
        }
    }

    fn assistant_with_usage(content: &str, usage: TokenUsage) -> Message {
        Message {
            timestamp: Some("2026-01-02T03:04:05Z".into()),
            token_usage: Some(usage),
            ..Message::assistant(content)
        }
    }

    fn detail(meta: SessionMeta, messages: Vec<Message>) -> SessionDetail {
        SessionDetail {
            meta,
            messages,
            parse_warning_count: 0,
        }
    }

    #[test]
    fn render_emits_title_header_and_meta_lines() {
        let detail = detail(synthetic_meta(), vec![Message::user("hello there")]);
        let out = render(&detail);
        assert!(out.starts_with("# Refactor the parser\n\n"));
        // Provider renders via its Display impl, which uses the human label
        // ("Claude Code" for Provider::Claude).
        assert!(out.contains("- **Provider**: Claude Code\n"));
        assert!(out.contains("- **Project**: proj\n"));
        assert!(out.contains("- **Messages**: 3\n"));
        assert!(out.contains("- **Session ID**: 11111111-1111-4111-a111-111111111111\n"));
        // created_at > 0 so a Date line is emitted (format_epoch produces YYYY-MM-DD HH:MM).
        assert!(out.contains("- **Date**: 2026-01-02 "));
    }

    #[test]
    fn render_includes_token_usage_table_when_usage_present() {
        let detail = detail(
            synthetic_meta(),
            vec![
                assistant_with_usage(
                    "first reply",
                    TokenUsage {
                        input_tokens: 1_200,
                        output_tokens: 800,
                        cache_read_input_tokens: 2_000_000,
                        cache_creation_input_tokens: 0,
                    },
                ),
                assistant_with_usage(
                    "second reply",
                    TokenUsage {
                        input_tokens: 300,
                        output_tokens: 200,
                        cache_read_input_tokens: 0,
                        cache_creation_input_tokens: 500,
                    },
                ),
            ],
        );
        let out = render(&detail);
        assert!(out.contains("### Token Usage\n"));
        assert!(out.contains("| Input | Output | Cache Read | Cache Write | Total |"));
        // Aggregation: input 1500 → "1.5k", output 1000 → "1.0k",
        // cache_read 2_000_000 → "2.0M", cache_write 500 → "500",
        // total = input+output = 2500 → "2.5k". fmt_tokens compacts each.
        assert!(
            out.contains("| 1.5k | 1.0k | 2.0M | 500 | 2.5k |"),
            "token row missing/incorrect in:\n{out}"
        );
    }

    #[test]
    fn render_omits_token_table_when_no_usage() {
        let detail = detail(
            synthetic_meta(),
            vec![
                Message::user("just a question"),
                Message::assistant("answer"),
            ],
        );
        let out = render(&detail);
        assert!(!out.contains("### Token Usage"));
    }

    #[test]
    fn render_labels_each_role_and_keeps_bodies() {
        let detail = detail(
            synthetic_meta(),
            vec![
                Message::user("user body"),
                Message::assistant("assistant body"),
                Message::system("system body"),
            ],
        );
        let out = render(&detail);
        assert!(out.contains("### User "));
        assert!(out.contains("user body"));
        assert!(out.contains("### Assistant "));
        assert!(out.contains("assistant body"));
        assert!(out.contains("### System "));
        assert!(out.contains("system body"));
    }

    #[test]
    fn render_includes_tool_message_with_name_even_when_content_empty() {
        let tool_msg = Message {
            tool_name: Some("Bash".into()),
            tool_input: Some(r#"{"command":"ls"}"#.into()),
            ..Message::new(MessageRole::Tool, String::new())
        };
        let detail = detail(synthetic_meta(), vec![tool_msg]);
        let out = render(&detail);
        // should_render_message keeps a Tool message when it has a tool_name,
        // even with empty content body.
        assert!(out.contains("### Tool "));
    }

    #[test]
    fn render_skips_empty_non_tool_messages() {
        let detail = detail(
            synthetic_meta(),
            vec![Message::user("   "), Message::assistant("real content")],
        );
        let out = render(&detail);
        // The whitespace-only user message is filtered; only the assistant
        // header should appear.
        assert!(!out.contains("### User"));
        assert_eq!(out.matches("### ").count(), 1);
    }

    #[test]
    fn render_blockquotes_content_starting_with_markdown_structure() {
        let detail = detail(
            synthetic_meta(),
            vec![Message::assistant("# looks like a heading\nsecond line")],
        );
        let out = render(&detail);
        // Content beginning with `#` is escaped behind a blockquote so it is
        // not mistaken for the export's own markdown headings.
        assert!(out.contains("> # looks like a heading\n> second line"));
    }

    #[test]
    fn render_omits_date_line_when_created_at_is_zero() {
        let mut meta = synthetic_meta();
        meta.created_at = 0;
        let detail = detail(meta, vec![Message::user("hi")]);
        let out = render(&detail);
        assert!(!out.contains("- **Date**:"));
    }
}
