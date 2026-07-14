//! Typed error for the service / indexer plumbing.
//!
//! Replaces the bare `Result<_, String>` returns that used to bubble
//! `format!("failed to X: {e}")` strings straight to the Tauri command
//! boundary. Each variant reproduces the original flat message verbatim
//! (the inner cause is captured as a `String`, NOT `#[source]`, so the
//! serialized `{:#}` text the frontend toast sees is byte-identical to
//! the previous flat-string behaviour — see `tests` at the bottom of this file
//! and `crate::error::CommandError`).
//!
//! `Anyhow(anyhow::Error)` is the transparent passthrough used for errors
//! propagated from `anyhow`-typed helpers (`Provider::require_runtime` /
//! `parse_strict`). Rendering uses the full
//! context chain (`{:#}`), which matches the flat `format!("...: {e}")`
//! strings those helpers used to produce. `Message(String)` remains for
//! already-formatted strings.

use thiserror::Error;

/// Typed error returned by the session-lifecycle / source-sync /
/// resolution / snapshot services and the indexer. Converts into
/// `CommandError` with an identical `{:#}` rendering to the old flat
/// `String` errors.
#[derive(Debug, Error)]
pub enum ServiceError {
    /// Passthrough for already-formatted messages. Carries the source
    /// string verbatim so no text is altered.
    #[error("{0}")]
    Message(String),

    /// Passthrough for errors propagated from `anyhow`-typed helpers
    /// (`Provider::require_runtime` / `parse_strict`). The `{:#}` rendering
    /// preserves the full context
    /// chain, byte-identical to the old flat `format!("...: {e}")` text.
    #[error("{0:#}")]
    Anyhow(#[from] anyhow::Error),

    // --- session_resolution ---
    #[error("failed to load session {0}: {1}")]
    LoadSession(String, String),
    #[error("session not found: {0}")]
    SessionNotFound(String),
    // --- provider_snapshots ---
    #[error("failed to load provider session counts: {0}")]
    LoadProviderSessionCounts(String),

    // --- indexer ---
    #[error("failed to store usage_last_refreshed_at: {0}")]
    StoreUsageLastRefreshed(String),
    #[error("failed to load {0} source snapshot: {1}")]
    LoadProviderSourceSnapshot(String, String),
    #[error("failed to scan {0} provider: {1}")]
    ScanProvider(String, String),
    #[error("failed to sync {0} provider: {1}")]
    SyncProvider(String, String),
    #[error("failed to store last_index_time: {0}")]
    StoreLastIndexTime(String),
    #[error("failed to list sessions: {0}")]
    ListSessions(String),
}

impl From<String> for ServiceError {
    fn from(s: String) -> Self {
        ServiceError::Message(s)
    }
}

impl From<ServiceError> for crate::error::CommandError {
    fn from(err: ServiceError) -> Self {
        // Capture the full `Display` text as the anyhow message so the
        // command boundary serializes (`format!("{:#}", _)`) to exactly
        // the same string the old flat `String` errors produced.
        crate::error::CommandError(anyhow::Error::msg(err.to_string()))
    }
}

/// Result alias for service plumbing.
pub type ServiceResult<T> = std::result::Result<T, ServiceError>;

#[cfg(test)]
mod tests {
    use super::ServiceError;
    use crate::error::CommandError;

    /// Render a `ServiceError` exactly as the frontend toast sees it:
    /// converted to `CommandError`, then serialized via `{:#}` (the
    /// `CommandError::serialize` path uses the same `format!("{:#}", _)`).
    fn rendered(err: ServiceError) -> String {
        let command: CommandError = err.into();
        format!("{:#}", command.0)
    }

    #[test]
    fn anyhow_passthrough_preserves_context_chain() {
        let err: ServiceError = anyhow::anyhow!("boom")
            .context("failed to open provider data")
            .into();
        assert_eq!(rendered(err), "failed to open provider data: boom");
    }

    #[test]
    fn message_passthrough_preserves_text_verbatim() {
        // An already-formatted string surfaced via `From<String>`.
        let err: ServiceError = "failed to open provider data: boom".to_string().into();
        assert_eq!(rendered(err), "failed to open provider data: boom");
    }

    #[test]
    fn load_session_matches_old_flat_string() {
        let err = ServiceError::LoadSession("sess-1".into(), "db locked".into());
        assert_eq!(rendered(err), "failed to load session sess-1: db locked");
    }

    #[test]
    fn session_not_found_matches_old_flat_string() {
        let err = ServiceError::SessionNotFound("sess-1".into());
        assert_eq!(rendered(err), "session not found: sess-1");
    }

    #[test]
    fn load_provider_session_counts_matches_old_flat_string() {
        let err = ServiceError::LoadProviderSessionCounts("db locked".into());
        assert_eq!(
            rendered(err),
            "failed to load provider session counts: db locked"
        );
    }

    #[test]
    fn store_usage_last_refreshed_matches_old_flat_string() {
        let err = ServiceError::StoreUsageLastRefreshed("db locked".into());
        assert_eq!(
            rendered(err),
            "failed to store usage_last_refreshed_at: db locked"
        );
    }

    #[test]
    fn load_provider_source_snapshot_matches_old_flat_string() {
        let err = ServiceError::LoadProviderSourceSnapshot("claude".into(), "db locked".into());
        assert_eq!(
            rendered(err),
            "failed to load claude source snapshot: db locked"
        );
    }

    #[test]
    fn scan_provider_matches_old_flat_string() {
        let err = ServiceError::ScanProvider("codex".into(), "io error".into());
        assert_eq!(rendered(err), "failed to scan codex provider: io error");
    }

    #[test]
    fn sync_provider_matches_old_flat_string() {
        let err = ServiceError::SyncProvider("claude".into(), "db locked".into());
        assert_eq!(rendered(err), "failed to sync claude provider: db locked");
    }

    #[test]
    fn store_last_index_time_matches_old_flat_string() {
        let err = ServiceError::StoreLastIndexTime("db locked".into());
        assert_eq!(rendered(err), "failed to store last_index_time: db locked");
    }

    #[test]
    fn list_sessions_matches_old_flat_string() {
        let err = ServiceError::ListSessions("db locked".into());
        assert_eq!(rendered(err), "failed to list sessions: db locked");
    }

    /// The cancel sentinel travels as a `Message` passthrough (the
    /// command layer constructs it directly today, but if it ever flows
    /// through `ServiceError` the substring must survive untouched).
    #[test]
    fn cancel_sentinel_substring_survives_passthrough() {
        let err: ServiceError = "__sessionview_load_canceled__".to_string().into();
        assert!(rendered(err).contains("__sessionview_load_canceled__"));
    }
}
