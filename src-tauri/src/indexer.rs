use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use std::time::Instant;

use crate::db::sync::TokenStatRow;
use crate::db::Database;
use crate::models::{Provider, SessionMeta, TreeNode, TreeNodeType};
use crate::provider::{ParsedSession, SessionProvider};

#[derive(Clone)]
pub struct Indexer {
    db: Arc<Database>,
    providers: Arc<Vec<Box<dyn SessionProvider>>>,
}

impl Indexer {
    pub fn new(db: Arc<Database>, providers: Vec<Box<dyn SessionProvider>>) -> Self {
        Self {
            db,
            providers: Arc::new(providers),
        }
    }

    pub fn reindex(&self) -> Result<usize, String> {
        self.reindex_filtered(None, true)
    }

    pub fn reindex_providers(&self, filter: Option<&[Provider]>) -> Result<usize, String> {
        // Background/polling reindex uses protective sync (aggressive=false)
        // to avoid deleting sessions on transient scan failures.
        self.reindex_filtered(filter, false)
    }

    fn reindex_filtered(
        &self,
        filter: Option<&[Provider]>,
        aggressive: bool,
    ) -> Result<usize, String> {
        let start = Instant::now();
        let mut total = 0usize;

        let now_millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let excluded = crate::trash_state::shared_deleted_ids();

        for provider in self.providers.iter() {
            let provider_kind = provider.provider();

            if let Some(allowed) = filter {
                if !allowed.contains(&provider_kind) {
                    continue;
                }
            }

            let mut sessions = provider
                .scan_all()
                .map_err(|e| format!("failed to scan {} provider: {}", provider_kind.key(), e))?;

            if !excluded.is_empty() {
                sessions.retain(|s| !excluded.contains(&s.meta.id));
            }

            let count = sessions.len();
            self.db
                .sync_provider_snapshot(&provider_kind, &sessions, aggressive)
                .map_err(|e| format!("failed to sync {} provider: {}", provider_kind.key(), e))?;

            for parsed in &sessions {
                let stat_rows = compute_token_stats(parsed);
                if !stat_rows.is_empty() {
                    if let Err(e) = self.db.replace_token_stats(&parsed.meta.id, &stat_rows) {
                        log::warn!("failed to write token stats for {}: {e}", parsed.meta.id);
                    }
                }
            }

            total += count;
        }

        if filter.is_none() {
            self.db
                .set_meta("last_index_time", &now_millis.to_string())
                .map_err(|e| format!("failed to store last_index_time: {e}"))?;
        }

        let elapsed = start.elapsed();
        log::info!(
            "Reindex complete: {} sessions indexed in {:.2}s",
            total,
            elapsed.as_secs_f64(),
        );

        Ok(total)
    }

    pub fn build_tree(&self) -> Result<Vec<TreeNode>, String> {
        let mut sessions = self
            .db
            .list_sessions()
            .map_err(|e| format!("failed to list sessions: {e}"))?;
        crate::providers::cc_mirror::hydrate_variant_names(&mut sessions);

        let mut provider_map: BTreeMap<String, BTreeMap<String, Vec<SessionMeta>>> =
            BTreeMap::new();

        for session in sessions {
            let display_key = session
                .provider
                .descriptor()
                .display_key(session.variant_name.as_deref());
            let project_key = if session.project_path.is_empty() {
                String::new()
            } else {
                session.project_path.clone()
            };

            provider_map
                .entry(display_key)
                .or_default()
                .entry(project_key)
                .or_default()
                .push(session);
        }

        let mut tree = Vec::new();

        for (display_key, projects) in &provider_map {
            let (provider_enum, label) = match Provider::parse_display_key(display_key) {
                Some(pair) => pair,
                None => continue,
            };

            let mut sorted_projects: Vec<_> = projects.iter().collect();
            sorted_projects.sort_by(|a, b| {
                let max_a = a.1.iter().map(|s| s.updated_at).max().unwrap_or(0);
                let max_b = b.1.iter().map(|s| s.updated_at).max().unwrap_or(0);
                max_b.cmp(&max_a)
            });

            let mut project_nodes = Vec::new();
            let mut provider_total = 0u32;

            for (project_path, sessions) in &sorted_projects {
                let project_label = sessions
                    .first()
                    .map(|s| {
                        if s.project_name.is_empty() {
                            "(No Project)".to_string()
                        } else {
                            s.project_name.clone()
                        }
                    })
                    .unwrap_or_else(|| "(No Project)".to_string());

                let (top_sessions, subagents): (Vec<_>, Vec<_>) =
                    sessions.iter().partition(|s| s.parent_id.is_none());

                let top_ids: std::collections::HashSet<&str> =
                    top_sessions.iter().map(|s| s.id.as_str()).collect();

                let mut session_nodes: Vec<TreeNode> = top_sessions
                    .iter()
                    .map(|s| {
                        let mut children: Vec<_> = sessions
                            .iter()
                            .filter(|c| c.parent_id.as_deref() == Some(&s.id))
                            .collect();
                        children.sort_by_key(|c| c.created_at);
                        let child_nodes: Vec<TreeNode> = children
                            .iter()
                            .map(|c| TreeNode {
                                id: c.id.clone(),
                                label: c.title.clone(),
                                node_type: TreeNodeType::Session,
                                children: Vec::new(),
                                count: 0,
                                provider: Some(provider_enum.clone()),
                                updated_at: Some(c.updated_at),
                                is_sidechain: true,
                                project_path: None,
                            })
                            .collect();

                        TreeNode {
                            id: s.id.clone(),
                            label: s.title.clone(),
                            node_type: TreeNodeType::Session,
                            children: child_nodes,
                            count: 0,
                            provider: Some(provider_enum.clone()),
                            updated_at: Some(s.updated_at),
                            is_sidechain: s.is_sidechain,
                            project_path: None,
                        }
                    })
                    .collect();

                for orphan in &subagents {
                    if let Some(ref pid) = orphan.parent_id {
                        if !top_ids.contains(pid.as_str()) {
                            session_nodes.push(TreeNode {
                                id: orphan.id.clone(),
                                label: orphan.title.clone(),
                                node_type: TreeNodeType::Session,
                                children: Vec::new(),
                                count: 0,
                                provider: Some(provider_enum.clone()),
                                updated_at: Some(orphan.updated_at),
                                is_sidechain: true,
                                project_path: None,
                            });
                        }
                    }
                }

                let count = session_nodes.len() as u32;
                if count == 0 {
                    continue;
                }
                provider_total += count;

                project_nodes.push(TreeNode {
                    id: format!("{display_key}:{project_path}"),
                    label: project_label,
                    node_type: TreeNodeType::Project,
                    children: session_nodes,
                    count,
                    provider: Some(provider_enum.clone()),
                    updated_at: None,
                    is_sidechain: false,
                    project_path: Some(project_path.to_string()),
                });
            }

            tree.push(TreeNode {
                id: display_key.to_string(),
                label,
                node_type: TreeNodeType::Provider,
                children: project_nodes,
                count: provider_total,
                provider: Some(provider_enum),
                updated_at: None,
                is_sidechain: false,
                project_path: None,
            });
        }

        tree.sort_by(|a, b| {
            let order_a = a
                .provider
                .as_ref()
                .map(|p| p.descriptor().sort_order())
                .unwrap_or(99);
            let order_b = b
                .provider
                .as_ref()
                .map(|p| p.descriptor().sort_order())
                .unwrap_or(99);
            order_a.cmp(&order_b).then(a.id.cmp(&b.id))
        });

        Ok(tree)
    }
}

/// Compute per-(date, model) token usage aggregates from a parsed session's messages.
pub(crate) fn compute_token_stats(parsed: &ParsedSession) -> Vec<TokenStatRow> {
    let fallback_date = chrono::DateTime::from_timestamp(parsed.meta.created_at, 0)
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "1970-01-01".to_string());

    let mut stats_map: HashMap<(String, String), TokenStatRow> = HashMap::new();
    for msg in &parsed.messages {
        if let Some(usage) = &msg.token_usage {
            let date = msg
                .timestamp
                .as_deref()
                .and_then(|t| t.get(..10).filter(|d| d.len() == 10))
                .unwrap_or(&fallback_date)
                .to_string();
            let model = msg.model.as_deref().unwrap_or("").to_string();
            let entry = stats_map
                .entry((date.clone(), model.clone()))
                .or_insert_with(|| TokenStatRow {
                    date,
                    model,
                    turn_count: 0,
                    input_tokens: 0,
                    output_tokens: 0,
                    cache_read_tokens: 0,
                    cache_write_tokens: 0,
                });
            entry.turn_count += 1;
            entry.input_tokens += usage.input_tokens as u64;
            entry.output_tokens += usage.output_tokens as u64;
            entry.cache_read_tokens += usage.cache_read_input_tokens as u64;
            entry.cache_write_tokens += usage.cache_creation_input_tokens as u64;
        }
    }

    stats_map.into_values().collect()
}
