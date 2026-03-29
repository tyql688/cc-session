# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioned with [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-03-29

### Added

- **Kimi CLI provider** — full support for `~/.kimi/sessions/**/*.jsonl` with tool calls, thinking blocks, token usage, and image handling
- Official brand SVG icons from lobe-icons for all providers (Claude, Codex, Gemini, Cursor CLI, OpenCode, Kimi CLI)
- ESLint + Prettier configuration with `npm run lint` and `npm run format` scripts
- MIT License
- Tauri v2 capabilities for minimal permissions
- CI checks: `cargo fmt --check`, `cargo clippy`, `tsc`, `eslint`
- Rust release profile optimization (LTO, strip, codegen-units=1)

### Fixed

- **P0 Bug**: `findSessionInTree` now recursively searches tree, fixing session operations when time grouping is enabled
- **P0 Bug**: CSS `var(--tab-hover)` → `var(--bg-tab-hover)` (4 occurrences)
- **Security**: Mermaid `securityLevel` changed from `"loose"` to `"strict"`
- **Security**: Markdown link scheme whitelist (only http/https/mailto allowed)
- **Security**: Terminal command validation with allowed prefix whitelist
- **Data safety**: `sync_provider_snapshot` skips destructive delete when scan returns <50% of indexed sessions
- Recent sessions list now refreshes on tree change (cold start, manual refresh, SQLite providers)
- Time grouping week starts Monday (ISO standard) instead of Sunday
- `strip_think_tags` O(n) single-pass instead of O(n^2)
- `str_to_provider` logs warning on unknown provider instead of silent default

### Changed

- **Module restructure (Rust)**: All providers split into sub-directories (claude/, codex/, gemini/, cursor/, opencode/, kimi/); db.rs → db/ module; exporter templates separated
- **Module restructure (Frontend)**: MessageBubble, SessionView, Explorer, App split into sub-directories; shared utilities extracted to lib/ (formatters, icons, platform, tree-utils, tree-builders)
- `row_to_session_meta()` helper eliminates 4 duplicated row mappings in db
- `FTS_CONTENT_LIMIT` constant replaces 6 magic number occurrences
- VACUUM removed from reindex hot path (only after clear)
- Cold start loads cached tree immediately, reindexes in background
- Cursor parallel scan with rayon `par_iter()`
- Avatar backgrounds removed — provider brand colors shown directly on icons
- Removed unused `lru` dependency

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
