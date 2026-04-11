use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};

use crate::provider::SessionProvider;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Emitter;

pub fn start_watcher(
    app: AppHandle,
    providers: &[Box<dyn SessionProvider>],
) -> Result<RecommendedWatcher, String> {
    let watch_paths: Vec<PathBuf> = providers
        .iter()
        .flat_map(|p| p.watch_paths())
        .filter(|p| p.exists())
        .collect();

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let changed_paths: Vec<String> = event
                    .paths
                    .iter()
                    .filter(|p| {
                        p.extension()
                            .is_some_and(|ext| ext == "jsonl" || ext == "json")
                    })
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();

                if !changed_paths.is_empty() {
                    let _ = app.emit("sessions-changed", changed_paths);
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("failed to create file watcher: {e}"))?;

    let mut watched_count = 0usize;
    for path in &watch_paths {
        match watcher.watch(path, RecursiveMode::Recursive) {
            Ok(()) => watched_count += 1,
            Err(e) => {
                log::warn!("failed to watch {}: {}", path.display(), e);
            }
        }
    }

    if !watch_paths.is_empty() && watched_count == 0 {
        return Err("failed to watch any provider directory".to_string());
    }

    log::info!(
        "Watching {}/{} directories for changes",
        watched_count,
        watch_paths.len()
    );
    Ok(watcher)
}
