//! Small string-cleaning helpers for Claude system/local-command lines:
//! ANSI stripping, tag extraction, and command input/output extraction.

use crate::models::MessageKind;

pub(super) struct LocalCommandText {
    pub(super) kind: MessageKind,
    pub(super) content: String,
}

pub(super) fn format_local_command_text(raw: &str) -> Option<LocalCommandText> {
    let trimmed = raw.trim_start();
    if !trimmed.starts_with("<command-name>")
        && !trimmed.starts_with("<command-message>")
        && !trimmed.starts_with("<local-command-stdout>")
        && !trimmed.starts_with("<local-command-stderr>")
    {
        return None;
    }

    if let Some(command) = extract_tag_text(raw, "command-name").filter(|s| !s.is_empty()) {
        let args = extract_tag_text(raw, "command-args").unwrap_or_default();
        let detail = [command, args]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        return Some(LocalCommandText {
            kind: MessageKind::CommandInput,
            content: detail,
        });
    }

    if let Some(command) = extract_tag_text(raw, "command-message").filter(|s| !s.is_empty()) {
        return Some(LocalCommandText {
            kind: MessageKind::CommandInput,
            content: command,
        });
    }

    let stdout = extract_tag_text(raw, "local-command-stdout")
        .or_else(|| extract_tag_text(raw, "local-command-stderr"))
        .map(|value| clean_system_text(&value))
        .filter(|s| !s.is_empty())?;
    Some(LocalCommandText {
        kind: MessageKind::CommandOutput,
        content: stdout,
    })
}

fn extract_tag_text(raw: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = raw.find(&open)? + open.len();
    let end = raw[start..].find(&close)? + start;
    Some(clean_system_text(&raw[start..end]))
}

pub(super) fn clean_system_text(raw: &str) -> String {
    strip_ansi_codes(raw)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn strip_ansi_codes(raw: &str) -> String {
    let mut cleaned = String::new();
    let mut chars = raw.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' && chars.peek() == Some(&'[') {
            chars.next();
            for code in chars.by_ref() {
                if ('@'..='~').contains(&code) {
                    break;
                }
            }
            continue;
        }
        cleaned.push(ch);
    }

    cleaned
}
