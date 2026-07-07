use anyhow::Context;
use tauri::State;

use crate::error::CommandResult;
use crate::models::{SearchFilters, SearchResult, TrendSeries};

use super::AppState;

#[tauri::command]
pub async fn search_sessions(
    filters: SearchFilters,
    state: State<'_, AppState>,
) -> CommandResult<Vec<SearchResult>> {
    let state = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        state
            .db
            .search_filtered(&filters)
            .context("failed to search")
    })
    .await
    .context("task join error")?
    .map_err(crate::error::CommandError::from)
}

#[tauri::command]
pub async fn search_trends(
    keywords: Vec<String>,
    days: u32,
    state: State<'_, AppState>,
) -> CommandResult<Vec<TrendSeries>> {
    let state = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        state
            .db
            .keyword_trends(&keywords, days.clamp(7, 366))
            .context("failed to compute keyword trends")
    })
    .await
    .context("task join error")?
    .map_err(crate::error::CommandError::from)
}
