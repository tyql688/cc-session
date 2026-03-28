# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioned with [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-03-29

### Added

- Blocked folders: sidebar panel to exclude folders from session indexing
- Auto-update support with Tauri updater plugin

### Fixed

- Blocked folders now correctly filter recent sessions
- VACUUM on reindex for smaller database size
- UI polish improvements

### Changed

- Upgraded CI actions to v5 (Node.js 24 support)
- Removed Rust test modules (SQLite disk IO issues in CI runner)

## [0.1.0] - 2026-03-28

### Added

- Multi-provider support: Claude Code, Codex, Gemini CLI, Cursor, OpenCode
- Full-text search across all session content (SQLite FTS5)
- Live session watch — auto-refresh on file changes (`⌘L`)
- Message rendering: Markdown, syntax highlighting, Mermaid diagrams, KaTeX math
- Inline image preview with click-to-expand
- Structured tool call display with diff view
- Token usage display (per-message and session totals)
- Thinking/reasoning block rendering (collapsible)
- Export: JSON, Markdown, HTML (dark mode, structured tools, thinking blocks)
- Session management: rename, trash/restore, favorites, batch operations
- Resume sessions in 7 terminal apps
- Keyboard shortcuts with overlay (`?`)
- Light / Dark / System theme
- English / Chinese localization
- Window state persistence across restarts
