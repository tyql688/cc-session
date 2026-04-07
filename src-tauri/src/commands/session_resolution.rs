use crate::db::Database;
use crate::models::SessionMeta;

pub(crate) fn load_session_meta(db: &Database, session_id: &str) -> Result<SessionMeta, String> {
    db.get_session(session_id)
        .map_err(|e| format!("failed to load session {session_id}: {e}"))?
        .ok_or_else(|| format!("session not found: {session_id}"))
}

pub(crate) fn load_session_for_mutation(
    db: &Database,
    session_id: &str,
) -> Result<(SessionMeta, Vec<SessionMeta>), String> {
    let meta = load_session_meta(db, session_id)?;
    let children = db
        .get_child_sessions(session_id)
        .map_err(|e| format!("failed to load child sessions for {session_id}: {e}"))?;
    Ok((meta, children))
}
