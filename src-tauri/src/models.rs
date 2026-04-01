use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Claude,
    Codex,
    Gemini,
    Cursor,
    #[serde(rename = "opencode")]
    OpenCode,
    Kimi,
    #[serde(rename = "cc-mirror")]
    CcMirror,
}

impl Provider {
    pub fn label(&self) -> &'static str {
        match self {
            Provider::Claude => "Claude Code",
            Provider::Codex => "Codex",
            Provider::Gemini => "Gemini",
            Provider::Cursor => "Cursor",
            Provider::OpenCode => "OpenCode",
            Provider::Kimi => "Kimi CLI",
            Provider::CcMirror => "CC-Mirror",
        }
    }

    pub fn key(&self) -> &'static str {
        match self {
            Provider::Claude => "claude",
            Provider::Codex => "codex",
            Provider::Gemini => "gemini",
            Provider::Cursor => "cursor",
            Provider::OpenCode => "opencode",
            Provider::Kimi => "kimi",
            Provider::CcMirror => "cc-mirror",
        }
    }

    pub fn parse(s: &str) -> Option<Provider> {
        match s {
            "claude" => Some(Provider::Claude),
            "codex" => Some(Provider::Codex),
            "gemini" => Some(Provider::Gemini),
            "cursor" => Some(Provider::Cursor),
            "opencode" => Some(Provider::OpenCode),
            "kimi" => Some(Provider::Kimi),
            "cc-mirror" => Some(Provider::CcMirror),
            _ => None,
        }
    }

    /// All known providers in display order.
    pub fn all() -> &'static [Provider] {
        &[
            Provider::Claude,
            Provider::Codex,
            Provider::Gemini,
            Provider::Cursor,
            Provider::OpenCode,
            Provider::Kimi,
            Provider::CcMirror,
        ]
    }

    /// Whether source files contain multiple sessions (can't be physically moved to trash).
    pub fn is_shared_source(&self) -> bool {
        matches!(self, Provider::Gemini | Provider::OpenCode)
    }

    /// Check if a source file path belongs to this provider.
    pub fn owns_source_path(&self, source_path: &str) -> bool {
        let p = source_path.replace('\\', "/");
        match self {
            Provider::CcMirror => p.contains("/.cc-mirror/") && p.contains("/config/projects/"),
            Provider::Claude => p.contains("/.claude/projects/") && !p.contains("/.cc-mirror/"),
            Provider::Codex => p.contains("/.codex/sessions/"),
            Provider::Gemini => p.contains("/.gemini/tmp/"),
            Provider::Kimi => p.contains("/.kimi/sessions/"),
            Provider::Cursor => p.contains("/.cursor/chats/"),
            Provider::OpenCode => p.contains("/opencode/opencode.db"),
        }
    }

    /// Build the CLI resume command for a session.
    pub fn resume_command(&self, session_id: &str, variant_name: Option<&str>) -> Option<String> {
        match self {
            Provider::Claude => Some(format!("claude --resume {session_id}")),
            Provider::Codex => Some(format!("codex resume {session_id}")),
            Provider::Gemini => Some(format!("gemini --resume {session_id}")),
            Provider::Cursor => Some(format!("agent --resume={session_id}")),
            Provider::OpenCode => Some(format!("opencode -s {session_id}")),
            Provider::Kimi => Some(format!("kimi --session {session_id}")),
            Provider::CcMirror => variant_name.map(|name| format!("{name} --resume {session_id}")),
        }
    }

    /// Key used to group sessions in the tree.
    pub fn display_key(&self, variant_name: Option<&str>) -> String {
        match self {
            Provider::CcMirror => match variant_name {
                Some(vn) => format!("cc-mirror:{vn}"),
                None => "cc-mirror".to_string(),
            },
            other => other.key().to_string(),
        }
    }

    /// Sort order for provider groups in the tree.
    pub fn sort_order(&self) -> u32 {
        match self {
            Provider::Claude => 0,
            Provider::CcMirror => 1,
            Provider::Codex => 2,
            Provider::Gemini => 3,
            Provider::Cursor => 4,
            Provider::OpenCode => 5,
            Provider::Kimi => 6,
        }
    }

    /// Provider brand color (hex).
    pub fn color(&self) -> &'static str {
        match self {
            Provider::Claude => "#8b5cf6",
            Provider::Codex => "#10b981",
            Provider::Gemini => "#f59e0b",
            Provider::Cursor => "#3b82f6",
            Provider::OpenCode => "#06b6d4",
            Provider::Kimi => "#6366f1",
            Provider::CcMirror => "#f472b6",
        }
    }

    /// Identify which provider owns a source path.
    pub fn from_source_path(source_path: &str) -> Option<Provider> {
        Provider::all()
            .iter()
            .find(|p| p.owns_source_path(source_path))
            .cloned()
    }
}

impl std::fmt::Display for Provider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.label())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMeta {
    pub id: String,
    pub provider: Provider,
    pub title: String,
    pub project_path: String,
    pub project_name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub message_count: u32,
    pub file_size_bytes: u64,
    pub source_path: String,
    pub is_sidechain: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cc_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
    Tool,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_creation_input_tokens: u32,
    pub cache_read_input_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: MessageRole,
    pub content: String,
    pub timestamp: Option<String>,
    pub tool_name: Option<String>,
    pub tool_input: Option<String>,
    pub token_usage: Option<TokenUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDetail {
    pub meta: SessionMeta,
    pub messages: Vec<Message>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeNode {
    pub id: String,
    pub label: String,
    pub node_type: TreeNodeType,
    pub children: Vec<TreeNode>,
    pub count: u32,
    pub provider: Option<Provider>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<i64>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub is_sidechain: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TreeNodeType {
    Provider,
    Project,
    Session,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub session: SessionMeta,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexStats {
    pub session_count: u64,
    pub db_size_bytes: u64,
    pub last_index_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub key: String,
    pub label: String,
    pub path: String,
    pub exists: bool,
    pub session_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SearchFilters {
    pub query: String,
    pub provider: Option<String>,
    pub project: Option<String>,
    pub after: Option<i64>,
    pub before: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrashMeta {
    pub id: String,
    pub provider: String,
    pub title: String,
    pub original_path: String,
    pub trashed_at: i64,
    pub trash_file: String,
    #[serde(default)]
    pub project_name: String,
}
