use std::collections::{HashMap, HashSet};

use crate::db::queries::{UsageProjectModelDetailRow, UsageSessionModelDetailRow};
use crate::models::{ProjectCost, ProjectModelUsage, ProjectProviderUsage, SessionCostRow};

#[derive(Default)]
struct UsageAccumulator {
    session_ids: HashSet<String>,
    turns: u64,
    tokens: u64,
    cost: f64,
}

impl UsageAccumulator {
    fn add(&mut self, session_id: String, turns: u64, tokens: u64, cost: f64) {
        self.session_ids.insert(session_id);
        self.turns += turns;
        self.tokens += tokens;
        self.cost += cost;
    }

    fn sessions(&self) -> u64 {
        self.session_ids.len() as u64
    }
}

#[derive(Default)]
struct ProjectCostAccumulator {
    project: String,
    project_path: String,
    usage: UsageAccumulator,
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cache_write_tokens: u64,
    by_provider: HashMap<String, UsageAccumulator>,
    by_model: HashMap<String, UsageAccumulator>,
}

impl ProjectCostAccumulator {
    fn add(&mut self, row: UsageProjectModelDetailRow) {
        let tokens =
            row.input_tokens + row.output_tokens + row.cache_read_tokens + row.cache_write_tokens;
        self.usage
            .add(row.session_id.clone(), row.turns, tokens, row.cost_usd);
        self.input_tokens += row.input_tokens;
        self.output_tokens += row.output_tokens;
        self.cache_read_tokens += row.cache_read_tokens;
        self.cache_write_tokens += row.cache_write_tokens;
        self.by_provider.entry(row.provider).or_default().add(
            row.session_id.clone(),
            row.turns,
            tokens,
            row.cost_usd,
        );
        self.by_model.entry(row.model).or_default().add(
            row.session_id,
            row.turns,
            tokens,
            row.cost_usd,
        );
    }

    fn into_project_cost(self) -> ProjectCost {
        let mut providers: Vec<String> = self.by_provider.keys().cloned().collect();
        providers.sort();
        let by_provider = sorted_usage_entries(self.by_provider)
            .into_iter()
            .map(|(provider, usage)| ProjectProviderUsage {
                provider,
                sessions: usage.sessions(),
                turns: usage.turns,
                tokens: usage.tokens,
                cost: usage.cost,
            })
            .collect();
        let by_model = sorted_usage_entries(self.by_model)
            .into_iter()
            .map(|(model, usage)| ProjectModelUsage {
                model,
                sessions: usage.sessions(),
                turns: usage.turns,
                tokens: usage.tokens,
                cost: usage.cost,
            })
            .collect();

        ProjectCost {
            project: self.project,
            project_path: self.project_path,
            providers,
            by_provider,
            by_model,
            sessions: self.usage.sessions(),
            turns: self.usage.turns,
            input_tokens: self.input_tokens,
            output_tokens: self.output_tokens,
            cache_read_tokens: self.cache_read_tokens,
            cache_write_tokens: self.cache_write_tokens,
            tokens: self.usage.tokens,
            cost: self.usage.cost,
        }
    }
}

fn sorted_usage_entries(
    usage_by_name: HashMap<String, UsageAccumulator>,
) -> Vec<(String, UsageAccumulator)> {
    let mut entries: Vec<_> = usage_by_name.into_iter().collect();
    entries.sort_by(|(left_name, left), (right_name, right)| {
        right
            .cost
            .total_cmp(&left.cost)
            .then_with(|| left_name.cmp(right_name))
    });
    entries
}

pub(super) fn build_project_costs(
    project_model_rows: Vec<UsageProjectModelDetailRow>,
) -> Vec<ProjectCost> {
    let mut projects: HashMap<String, ProjectCostAccumulator> = HashMap::new();
    for row in project_model_rows {
        projects
            .entry(row.project_path.clone())
            .or_insert_with(|| ProjectCostAccumulator {
                project: row.project_name.clone(),
                project_path: row.project_path.clone(),
                ..ProjectCostAccumulator::default()
            })
            .add(row);
    }

    let mut project_costs: Vec<_> = projects
        .into_values()
        .map(ProjectCostAccumulator::into_project_cost)
        .collect();
    project_costs.sort_by(|left, right| {
        right
            .cost
            .total_cmp(&left.cost)
            .then_with(|| left.project_path.cmp(&right.project_path))
    });
    project_costs
}

struct RecentSessionAccumulator {
    summary: SessionCostRow,
    dominant_tokens: u64,
    dominant_cost: f64,
}

pub(super) fn build_recent_sessions(
    session_model_rows: Vec<UsageSessionModelDetailRow>,
) -> Vec<SessionCostRow> {
    let mut session_indices: HashMap<String, usize> = HashMap::new();
    let mut sessions: Vec<RecentSessionAccumulator> = Vec::new();

    for row in session_model_rows {
        let tokens =
            row.input_tokens + row.output_tokens + row.cache_read_tokens + row.cache_write_tokens;
        let index = if let Some(index) = session_indices.get(&row.session_id) {
            *index
        } else {
            let index = sessions.len();
            session_indices.insert(row.session_id.clone(), index);
            sessions.push(RecentSessionAccumulator {
                summary: SessionCostRow {
                    id: row.session_id.clone(),
                    project: row.project_name.clone(),
                    project_path: row.project_path.clone(),
                    provider: row.provider.clone(),
                    model: row.model.clone(),
                    updated_at: row.updated_at,
                    turns: 0,
                    tokens: 0,
                    cost: 0.0,
                },
                dominant_tokens: tokens,
                dominant_cost: row.cost_usd,
            });
            index
        };

        let session = &mut sessions[index];
        session.summary.turns += row.turns;
        session.summary.tokens += tokens;
        session.summary.cost += row.cost_usd;
        if tokens > session.dominant_tokens
            || (tokens == session.dominant_tokens
                && row.cost_usd > session.dominant_cost
                && !row.model.is_empty())
        {
            session.summary.model = row.model;
            session.dominant_tokens = tokens;
            session.dominant_cost = row.cost_usd;
        }
    }

    sessions
        .into_iter()
        .map(|session| session.summary)
        .collect()
}
