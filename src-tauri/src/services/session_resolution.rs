use crate::db::Database;
use crate::models::SessionMeta;
use crate::services::error::{ServiceError, ServiceResult};

pub(crate) fn load_session_meta(db: &Database, session_id: &str) -> ServiceResult<SessionMeta> {
    let mut meta = db
        .get_session(session_id)
        .map_err(|e| ServiceError::LoadSession(session_id.to_string(), e.to_string()))?
        .ok_or_else(|| ServiceError::SessionNotFound(session_id.to_string()))?;
    crate::providers::cc_mirror::populate_variant_name(&mut meta);
    Ok(meta)
}
