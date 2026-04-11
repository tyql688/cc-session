use std::fs;
use std::path::Path;

use crate::models::{Message, MessageRole, SessionDetail};

fn role_label(role: &MessageRole) -> &'static str {
    match role {
        MessageRole::User => "User",
        MessageRole::Assistant => "Assistant",
        MessageRole::Tool => "Tool",
        MessageRole::System => "System",
    }
}

fn format_date(epoch: i64) -> String {
    chrono::DateTime::from_timestamp(epoch, 0)
        .map(|d| {
            d.with_timezone(&chrono::Local)
                .format("%Y-%m-%d %H:%M")
                .to_string()
        })
        .unwrap_or_default()
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
            format_date(detail.meta.created_at)
        ));
    }
    out.push_str(&format!("- **Messages**: {}\n", detail.meta.message_count));
    out.push_str(&format!("- **Session ID**: {}\n\n", detail.meta.id));
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
