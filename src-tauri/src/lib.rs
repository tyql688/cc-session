pub mod commands;
pub mod db;
pub mod error;
mod exporter;
pub mod indexer;
pub mod models;
pub mod pricing;
pub mod provider;
pub mod provider_utils;
pub mod providers;
pub mod services;
pub mod tool_metadata;

use std::sync::Arc;

/// Test helpers — exposes private functions for integration tests.
#[doc(hidden)]
pub mod exporter_test_helpers {
    pub fn render_session_markdown_pub(detail: &crate::models::SessionDetail) -> String {
        crate::exporter::markdown::render(detail)
    }
}

#[doc(hidden)]
pub mod command_test_helpers {
    use crate::commands::{get_resume_command_for_tests, load_session_detail_for_tests};
    use crate::db::Database;
    use crate::models::{ProviderSnapshot, SessionDetail};
    use crate::services::ProviderSnapshotService;

    pub fn get_session_detail(db: &Database, session_id: &str) -> anyhow::Result<SessionDetail> {
        load_session_detail_for_tests(db, session_id)
    }

    pub fn get_provider_snapshots(db: &Database) -> anyhow::Result<Vec<ProviderSnapshot>> {
        Ok(ProviderSnapshotService::new(db).list()?)
    }

    pub fn get_resume_command(db: &Database, session_id: &str) -> anyhow::Result<String> {
        get_resume_command_for_tests(db, session_id)
    }
}

use commands::AppState;
use db::Database;
use indexer::Indexer;
#[cfg(any(target_os = "windows", target_os = "linux"))]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = match dirs::data_local_dir() {
        Some(d) => d.join("sessionview"),
        None => {
            log::error!("failed to resolve local data dir");
            std::process::exit(1);
        }
    };

    if let Err(e) = std::fs::create_dir_all(&data_dir) {
        log::error!("failed to create data dir: {e}");
        std::process::exit(1);
    }

    let db = match Database::open(&data_dir) {
        Ok(db) => Arc::new(db),
        Err(e) => {
            log::error!("failed to open database: {e}");
            std::process::exit(1);
        }
    };

    let providers = provider::all_runtimes();

    let indexer = Indexer::new(Arc::clone(&db), providers, data_dir.clone());

    let state = AppState {
        db: Arc::clone(&db),
        indexer,
        maintenance_running: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        session_cache: Arc::new(crate::services::SessionCache::new(8)),
        // 16 entries / 32 MiB cap — covers a typical viewing burst without
        // blowing memory on multi-MB persisted outputs.
        persisted_output_cache: Arc::new(crate::services::PersistedOutputCache::new(
            16,
            32 * 1024 * 1024,
        )),
        load_tokens: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        promote_in_flight: Arc::new(std::sync::Mutex::new(std::collections::HashSet::new())),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::reindex,
            commands::reindex_providers,
            commands::get_tree,
            commands::get_session_detail,
            commands::get_session_meta,
            commands::get_session_open_window,
            commands::get_session_messages_window,
            commands::get_session_turn_outline,
            commands::cancel_session_load,
            commands::get_child_sessions,
            commands::get_child_session_counts,
            commands::search_sessions,
            commands::rename_session,
            commands::get_session_count,
            commands::export_session,
            commands::get_index_stats,
            commands::get_pricing_catalog_status,
            commands::start_rebuild_index,
            commands::refresh_pricing_catalog,
            commands::clear_index,
            commands::clear_usage_stats,
            commands::start_refresh_usage,
            commands::get_provider_snapshots,
            commands::get_resume_command,
            commands::detect_terminal,
            commands::resume_session,
            commands::export_sessions_batch,
            commands::toggle_favorite,
            commands::list_recent_sessions,
            commands::list_favorites,
            commands::is_favorite,
            commands::read_image_base64,
            commands::read_tool_result_text,
            commands::resolve_persisted_output,
            commands::open_in_folder,
            commands::open_external,
            commands::get_usage_stats,
            commands::get_activity_calendar,
            commands::get_project_tool_usage,
            commands::get_project_daily_usage,
            commands::get_today_cost,
            commands::get_today_tokens,
        ])
        .setup(|app| {
            #[cfg(not(any(target_os = "windows", target_os = "linux")))]
            let _ = app;

            // On Windows, hide native decorations so the custom titlebar is the only one.
            #[cfg(target_os = "windows")]
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_decorations(false);
            }

            // On Linux, the WM also draws its own title bar, which would stack on
            // top of our custom one — hide native decorations like on Windows.
            #[cfg(target_os = "linux")]
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_decorations(false);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            log::error!("failed to run tauri application: {e}");
            std::process::exit(1);
        });
}
