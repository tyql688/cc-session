//! Small string-cleaning helpers for Claude system/local-command lines:
//! ANSI stripping, tag extraction, and the `[local_command]` formatter.

pub(super) fn format_local_command_text(raw: &str) -> Option<String> {
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
        return Some(format!("[local_command] {detail}"));
    }

    let stdout = extract_tag_text(raw, "local-command-stdout")
        .or_else(|| extract_tag_text(raw, "local-command-stderr"))
        .map(|value| clean_system_text(&value))
        .filter(|s| !s.is_empty())?;
    Some(format!("[local_command] {stdout}"))
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
