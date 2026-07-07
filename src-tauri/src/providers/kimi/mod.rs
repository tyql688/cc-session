pub mod parser;
mod tools;

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rayon::prelude::*;
use walkdir::WalkDir;

use crate::models::{Provider, SessionMeta};
use crate::provider::{
    partition_files_by_freshness, ChildPlan, DeletionPlan, FileAction, LoadedSession,
    ParsedSession, ProviderError, ScanOutcome, SessionProvider, SourceState,
};

pub use parser::session_id_for_path;
pub(crate) use parser::SessionIndex;

pub struct Descriptor;
impl crate::provider::ProviderDescriptor for Descriptor {
    fn owns_source_path(&self, source_path: &str) -> bool {
        source_path
            .replace('\\', "/")
            .contains("/.kimi-code/sessions/")
    }
    fn resume_command(&self, session_id: &str, _variant_name: Option<&str>) -> Option<String> {
        // Kimi's resume CLI requires the full directory name including the
        // `session_` or `ses_` prefix — bare UUIDs return "Session not found".
        // We store the prefixed name in meta.id for parent sessions; for
        // subagents the id is `<parent-id>:<agent-name>` and kimi has no
        // resume target for them, so strip the suffix and resume the parent.
        let id = match session_id.split_once(':') {
            Some((parent, _agent)) => parent,
            None => session_id,
        };
        Some(format!("kimi --session {id}"))
    }
    fn display_key(&self, _variant_name: Option<&str>) -> String {
        "kimi".into()
    }
    fn sort_order(&self) -> u32 {
        6
    }
    fn color(&self) -> &'static str {
        "#1783ff"
    }
    fn cli_command(&self) -> &'static str {
        "kimi"
    }
    fn avatar_svg(&self) -> &'static str {
        r##"<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19.738 5.776c.163-.209.306-.4.457-.585.07-.087.064-.153-.004-.244-.655-.861-.717-1.817-.34-2.787.283-.73.909-1.072 1.674-1.145.477-.045.945.004 1.379.236.57.305.902.77 1.01 1.412.086.512.07 1.012-.075 1.508-.257.878-.888 1.333-1.753 1.448-.718.096-1.446.108-2.17.157-.056.004-.113 0-.178 0z" fill="#027AFF"/><path d="M17.962 1.844h-4.326l-3.425 7.81H5.369V1.878H1.5V22h3.87v-8.477h6.824a3.025 3.025 0 002.743-1.75V22h3.87v-8.477a3.87 3.87 0 00-3.588-3.86v-.01h-2.125a3.94 3.94 0 002.323-2.12l2.545-5.689z" fill="currentColor"/></svg>"##
    }
}

pub struct KimiProvider {
    kimi_dir: PathBuf,
}

impl KimiProvider {
    pub fn new() -> Option<Self> {
        let home_dir = dirs::home_dir()?;
        Some(Self {
            kimi_dir: home_dir.join(".kimi-code"),
        })
    }

    /// Build a provider rooted at an arbitrary directory instead of
    /// `~/.kimi-code`. Used by integration tests to point at fixture
    /// trees; not intended for production code paths.
    pub fn with_root(kimi_dir: PathBuf) -> Self {
        Self { kimi_dir }
    }

    fn sessions_dir(&self) -> PathBuf {
        self.kimi_dir.join("sessions")
    }

    fn session_index_path(&self) -> PathBuf {
        self.kimi_dir.join("session_index.jsonl")
    }

    fn load_session_index(&self) -> SessionIndex {
        SessionIndex::load(&self.session_index_path())
    }

    /// Walk `<sessions_dir>/<wd_*>/<session_dir>/agents/<name>/wire.jsonl`.
    /// Each wire.jsonl is one ParsedSession (main agent = parent session,
    /// `agent-N` = subagent linked back via state.json.parentAgentId).
    fn collect_wire_files(&self) -> Vec<PathBuf> {
        let sessions_dir = self.sessions_dir();
        if !sessions_dir.exists() {
            return Vec::new();
        }
        let mut files = Vec::new();
        for entry in WalkDir::new(&sessions_dir)
            .max_depth(5)
            .into_iter()
            .filter_map(std::result::Result::ok)
        {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if path.file_name().is_some_and(|n| n == "wire.jsonl")
                && path
                    .parent()
                    .and_then(|p| p.parent())
                    .and_then(|p| p.file_name())
                    == Some(std::ffi::OsStr::new("agents"))
            {
                files.push(path.to_path_buf());
            }
        }
        files
    }
}

impl SessionProvider for KimiProvider {
    fn provider(&self) -> Provider {
        Provider::Kimi
    }

    fn source_roots(&self) -> Vec<PathBuf> {
        vec![self.sessions_dir()]
    }

    fn scan_all(&self) -> Result<Vec<ParsedSession>, ProviderError> {
        let files = self.collect_wire_files();
        if files.is_empty() {
            return Ok(Vec::new());
        }
        let index = self.load_session_index();
        let parsed: Vec<ParsedSession> = files
            .par_iter()
            .filter_map(|path| parser::parse_session(path, &index))
            .collect();
        Ok(parsed)
    }

    fn scan_incremental(
        &self,
        known: &HashMap<String, SourceState>,
    ) -> Result<ScanOutcome, ProviderError> {
        let files = self.collect_wire_files();
        let (to_parse, unchanged_source_paths) = partition_files_by_freshness(files, known);
        let index = self.load_session_index();
        let parsed: Vec<ParsedSession> = to_parse
            .par_iter()
            .filter_map(|path| parser::parse_session(path, &index))
            .collect();
        Ok(ScanOutcome {
            parsed,
            unchanged_source_paths,
        })
    }

    fn scan_source(&self, source_path: &str) -> Result<Vec<ParsedSession>, ProviderError> {
        let path = PathBuf::from(source_path);
        let index = self.load_session_index();
        Ok(parser::parse_session(&path, &index).into_iter().collect())
    }

    fn deletion_plan(&self, meta: &SessionMeta, children: &[SessionMeta]) -> DeletionPlan {
        // Subagent: remove only its own agents/<name>/ directory.
        if meta.parent_id.is_some() {
            let agent_dir = Path::new(&meta.source_path).parent().map(Path::to_path_buf);
            let cleanup_dirs = agent_dir
                .filter(|p| p.is_dir())
                .into_iter()
                .collect::<Vec<_>>();
            return DeletionPlan {
                file_action: FileAction::Remove,
                child_plans: Vec::new(),
                cleanup_dirs,
            };
        }

        // Parent: trash main/wire.jsonl AND each child wire.jsonl
        // individually so each gets its own restorable trash entry
        // (mirrors the Claude/Codex subagent pattern).
        //
        // For cleanup we only nuke the whole session_dir when we can
        // prove the `agents/` directory contains nothing beyond `main`
        // plus the children we're about to trash — otherwise an un-
        // indexed agent (race window, parse failure, or kimi-code
        // adding state we haven't caught up to) would be destroyed
        // silently. When in doubt, only remove the individual agent
        // dirs we control and let the session_dir + state.json leak as
        // a small orphan; source-sync handles the DB side.
        //
        // source_path is `<session_dir>/agents/main/wire.jsonl`.
        let main_agent_dir = Path::new(&meta.source_path).parent().map(Path::to_path_buf);
        let session_dir = main_agent_dir
            .as_deref()
            .and_then(Path::parent)
            .and_then(Path::parent)
            .map(Path::to_path_buf);

        let child_plans: Vec<ChildPlan> = children
            .iter()
            .map(|c| ChildPlan {
                id: c.id.clone(),
                source_path: c.source_path.clone(),
                title: c.title.clone(),
                file_action: FileAction::Remove,
            })
            .collect();

        // Build the set of agent names we're going to clear from disk.
        let mut planned_agent_names: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        planned_agent_names.insert("main".to_string());
        for c in children {
            if let Some(name) = Path::new(&c.source_path)
                .parent()
                .and_then(Path::file_name)
                .map(|n| n.to_string_lossy().to_string())
            {
                planned_agent_names.insert(name);
            }
        }

        // Inspect what's actually on disk under `agents/`. If every
        // entry is in our plan, we're safe to take down the whole
        // session_dir. Any unexpected entry blocks the full sweep.
        let safe_to_remove_session_dir = session_dir.as_deref().is_some_and(|sdir| {
            let agents_dir = sdir.join("agents");
            match std::fs::read_dir(&agents_dir) {
                Ok(entries) => entries.filter_map(Result::ok).all(|e| {
                    e.file_name()
                        .to_str()
                        .is_some_and(|n| planned_agent_names.contains(n))
                }),
                // Can't enumerate — fall back to per-agent cleanup
                // rather than risk an unintended remove_dir_all.
                Err(_) => false,
            }
        });

        let mut cleanup_dirs: Vec<PathBuf> = Vec::new();
        if safe_to_remove_session_dir {
            if let Some(dir) = session_dir.filter(|p| p.is_dir()) {
                cleanup_dirs.push(dir);
            }
        } else {
            if let Some(dir) = main_agent_dir.filter(|p| p.is_dir()) {
                cleanup_dirs.push(dir);
            }
            for c in children {
                if let Some(dir) = Path::new(&c.source_path).parent() {
                    if dir.is_dir() {
                        cleanup_dirs.push(dir.to_path_buf());
                    }
                }
            }
        }

        DeletionPlan {
            file_action: FileAction::Remove,
            child_plans,
            cleanup_dirs,
        }
    }

    fn restore_action(&self, entry: &crate::models::TrashMeta) -> crate::provider::RestoreAction {
        if entry.trash_file.is_empty() {
            // Embedded / no file moved — nothing to restore individually.
            crate::provider::RestoreAction::Noop
        } else {
            crate::provider::RestoreAction::MoveBack
        }
    }

    fn load_messages(
        &self,
        session_id: &str,
        source_path: &str,
    ) -> Result<LoadedSession, ProviderError> {
        let path = PathBuf::from(source_path);
        let index = self.load_session_index();
        let parsed = parser::parse_session(&path, &index).ok_or_else(|| {
            ProviderError::Parse(format!("session {session_id} not found in {source_path}"))
        })?;
        Ok(LoadedSession::from_parsed(parsed))
    }
}
