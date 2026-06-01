use anyhow::{anyhow, Context};
use tauri::State;

use crate::db::Database;
use crate::error::{CommandError, CommandResult};
use crate::services::load_session_meta;
use crate::terminal;

use super::AppState;

struct ResumeTarget {
    command: String,
    cwd: Option<String>,
}

#[tauri::command]
pub async fn get_resume_command(
    session_id: String,
    state: State<'_, AppState>,
) -> CommandResult<String> {
    let state = state.inner().clone();
    tokio::task::spawn_blocking(move || get_resume_command_for_db(&state.db, &session_id))
        .await
        .context("task join error")?
        .map_err(CommandError::from)
}

/// Sanitize session ID to prevent shell injection — only allow alnum, hyphens, underscores
fn sanitize_session_id(id: &str) -> anyhow::Result<String> {
    if id.is_empty() {
        return Err(anyhow!("session id is empty"));
    }

    if id
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Ok(id.to_string());
    }

    Err(anyhow!("session id contains invalid characters: '{id}'"))
}

fn resolve_resume_target(db: &Database, session_id: &str) -> anyhow::Result<ResumeTarget> {
    let safe_id = sanitize_session_id(session_id)?;
    let session = load_session_meta(db, session_id).map_err(anyhow::Error::msg)?;
    let variant_name = session
        .variant_name
        .as_deref()
        .map(sanitize_session_id)
        .transpose()?;

    let command = session
        .provider
        .descriptor()
        .resume_command(&safe_id, variant_name.as_deref())
        .ok_or_else(|| anyhow!("{} session missing variant name", session.provider.key()))?;

    let cwd = (!session.project_path.is_empty()).then_some(session.project_path);

    Ok(ResumeTarget { command, cwd })
}

pub(crate) fn get_resume_command_for_db(db: &Database, session_id: &str) -> anyhow::Result<String> {
    Ok(resolve_resume_target(db, session_id)?.command)
}

/// Resume a session: looks up cwd from DB, builds command, launches terminal
#[tauri::command]
pub async fn resume_session(
    session_id: String,
    terminal_app: String,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let state = state.inner().clone();
    tokio::task::spawn_blocking(move || -> CommandResult<()> {
        let target = resolve_resume_target(&state.db, &session_id)?;
        terminal::launch_terminal(&terminal_app, &target.command, target.cwd.as_deref())
            .map_err(CommandError::from)?;
        Ok(())
    })
    .await
    .context("task join error")?
}

#[tauri::command]
pub async fn detect_terminal() -> String {
    tokio::task::spawn_blocking(detect_terminal_sync)
        .await
        .unwrap_or_else(|_| "terminal".to_string())
}

fn detect_terminal_sync() -> String {
    // Check $TERM_PROGRAM (set by macOS terminals and some Linux terminals)
    if let Ok(term) = std::env::var("TERM_PROGRAM") {
        match term.to_lowercase().as_str() {
            "iterm.app" => return "iterm2".to_string(),
            "apple_terminal" => return "terminal".to_string(),
            "ghostty" => return "ghostty".to_string(),
            "wezterm-gui" | "wezterm" => return "wezterm".to_string(),
            "warpterm" | "warp" => return "warp".to_string(),
            "kitty" => return "kitty".to_string(),
            "alacritty" => return "alacritty".to_string(),
            _ => {}
        }
    }

    // Windows: check for Windows Terminal
    #[cfg(target_os = "windows")]
    {
        if std::env::var("WT_SESSION").is_ok() {
            return "windows-terminal".to_string();
        }
        "powershell".to_string()
    }

    // Linux: check common terminal indicators
    #[cfg(target_os = "linux")]
    {
        if std::env::var("GNOME_TERMINAL_SERVICE").is_ok()
            || std::env::var("GNOME_TERMINAL_SCREEN").is_ok()
        {
            return "gnome-terminal".to_string();
        }
        if std::env::var("KONSOLE_VERSION").is_ok() {
            return "konsole".to_string();
        }
        // Fallback: probe common terminals in order
        let candidates = [
            "gnome-terminal",
            "konsole",
            "alacritty",
            "kitty",
            "wezterm",
            "xfce4-terminal",
            "xterm",
        ];
        for term in &candidates {
            if std::process::Command::new("which")
                .arg(term)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
            {
                return term.to_string();
            }
        }
        "xterm".to_string()
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    "terminal".to_string()
}

#[cfg(test)]
mod tests {
    use super::sanitize_session_id;

    #[test]
    fn sanitize_session_id_accepts_safe_ids() {
        assert_eq!(sanitize_session_id("abc-123_DEF").unwrap(), "abc-123_DEF");
    }

    #[test]
    fn sanitize_session_id_accepts_unicode_ids() {
        assert_eq!(
            sanitize_session_id("会话-123_变体").unwrap(),
            "会话-123_变体"
        );
    }

    #[test]
    fn sanitize_session_id_rejects_invalid_ids() {
        let err = sanitize_session_id("abc;rm").unwrap_err().to_string();
        assert!(err.contains("invalid characters"));
    }
}
