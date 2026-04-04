# CC Session

Desktop app for browsing AI coding sessions. Tauri 2.0 + Solid.js + Rust + SQLite FTS5.

## Commands

```bash
npm run tauri dev             # Dev with hot reload
npm run tauri build           # Production build
cd src-tauri && cargo clippy  # Rust lint
cd src-tauri && cargo test    # Rust tests
npx tsc --noEmit              # TS type check
npm run lint                  # ESLint
npm run format:check          # Prettier check
./scripts/release.sh 0.2.0   # Bump, commit, tag, push → triggers CI release
```

## Project Layout

```
src/                       # Solid.js frontend (components, stores, i18n, lib, styles)
src-tauri/src/
  providers/               # claude/, codex/, gemini/, kimi/, cursor/, opencode/, qwen/, cc_mirror.rs
  commands/                # sessions.rs, settings.rs, trash.rs, terminal.rs
  exporter/                # json.rs, markdown.rs, html.rs, templates.rs
  db/                      # mod.rs, queries.rs, sync.rs, row_mapper.rs
  indexer.rs  watcher.rs  models.rs  provider.rs  provider_utils.rs  trash_state.rs
```

## Provider Architecture

All providers implement `SessionProvider` trait (`scan_all` / `load_messages` / `watch_paths` / `deletion_plan`).
Metadata via Bridge pattern: `Provider` enum → `ProviderDescriptor` (zero-sized structs).

| Provider    | Path                                   | Format | Watch |
|-------------|----------------------------------------|--------|-------|
| Claude Code | `~/.claude/projects/**/*.jsonl`        | JSONL  | FS    |
| Codex       | `~/.codex/sessions/**/*.jsonl`         | JSONL  | FS    |
| Gemini      | `~/.gemini/tmp/*/chats/*.json`         | JSON   | FS    |
| Kimi CLI    | `~/.kimi/sessions/**/wire.jsonl`       | JSONL  | FS    |
| Cursor CLI  | `~/.cursor/projects/*/agent-transcripts/**/*.jsonl` | JSONL | FS |
| OpenCode    | `~/.local/share/opencode/opencode.db`  | SQLite | Poll  |
| Qwen Code   | `~/.qwen/projects/*/chats/*.jsonl`     | JSONL  | FS    |
| CC-Mirror   | `~/.cc-mirror/{variant}/config/projects/**/*.jsonl` | JSONL | FS |

Tool names mapped to canonical set per provider: {Bash, Edit, Read, Write, Glob, Grep, Agent, Plan}.
Resume: Claude `--resume`, Codex `resume`, Gemini `--resume`, Kimi `--session`, Cursor `--resume=`, OpenCode `-s`, Qwen `--resume`.

## Testing

- **Rust**: `cd src-tauri && cargo test` — 58 parser golden tests + provider unit tests
- **Frontend**: `npm test` (vitest)

## Key Patterns

- **Message**: `{ role, content, timestamp, tool_name, tool_input, token_usage }` — universal
- **Thinking**: `MessageRole::System` with `[thinking]\n` prefix
- **Images**: `[Image: source: ...]` in content
- **Tool merge**: `call_id` maps pair tool calls with results
- **Subagents**: `parent_id` links children; "Open" button for providers with separate files (Claude, Codex, Kimi, Cursor, CC-Mirror)
- **Trash**: `TrashMeta.parent_id` cascades restore/delete; `is_session_dir()` prevents shared dir deletion

## Pitfalls

- **OpenCode**: Must use `SQLITE_OPEN_READ_WRITE` (not READ_ONLY) for WAL. Uses XDG path, not macOS `~/Library/`.
- **Codex**: `call_id` pairing, output can be nested JSON.
- **Kimi**: MD5 project path, event stream format, float-second timestamps, truncated parallel agent args.
- **Cursor**: JSONL transcripts + store.db marker. `[REDACTED]` = redacted thinking. Full-text subagent matching.
- **CC-Mirror**: Multi-variant under `~/.cc-mirror/`, sanitized variant names.
- **Qwen**: `sanitizeCwd()` path (hyphens, not SHA256). `thought: true` boolean + `text` field. Subagents embedded in parent (no separate files). Skip `ui_telemetry`/`slash_command`/`at_command`/`chat_compression`.

## Conventions

- Rust: `cargo fmt` + `cargo clippy` before commit
- TypeScript: strict mode, no `any`, ESLint + Prettier
- Commits: conventional commits (`feat:`, `fix:`, `refactor:`)
- i18n: all user-facing strings via `t()`
- Colors: Claude `#d97757`, Codex `#10b981`, Gemini `#f59e0b`, Cursor `#3b82f6`, OpenCode `#06b6d4`, Kimi `#1783ff`, CC-Mirror `#f472b6`, Qwen `#6c3cf5`
