use std::fs;
use std::path::Path;

use anyhow::Context;

use crate::models::SessionDetail;

pub fn export_json(detail: &SessionDetail, output_path: &Path) -> anyhow::Result<()> {
    let json = serde_json::to_string_pretty(detail).context("failed to serialize session")?;
    let json = super::redact_home_path(&json);

    fs::write(output_path, json).context("failed to write file")?;

    Ok(())
}
