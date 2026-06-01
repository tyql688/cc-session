# TypeScript & Solid.js Style Guide

The canonical coding standard for the `src/` frontend (Solid.js + TypeScript).
`CLAUDE.md` links here instead of duplicating these rules — this file is the single
source of truth.

Every rule lists its **enforcing tool** so you know whether a violation fails the
build automatically or is caught only in review:

| Tag | Meaning |
|-----|---------|
| `tsc` | TypeScript compiler (`npx tsc --noEmit`) |
| `biome` | Biome formatter/linter (`npm run biome:check`) — owns formatting + general lint |
| `eslint` | ESLint, trimmed to `eslint-plugin-solid` — owns Solid reactivity rules Biome cannot replicate |
| `review` | No automated check; enforced by human/agent review |

Run `npm run check` (or let the lefthook pre-commit hook run) before every commit.

---

## 1. Type safety (non-negotiable)

- **Strict mode is on and stays on.** `tsconfig.json` has `strict: true`. — `tsc`
- **No `any`.** Model genuinely-unknown boundary data as `unknown` and narrow it. — `review` (biome `noExplicitAny` advisory)
- **No `as unknown as T`, no `@ts-ignore`, no `@ts-expect-error`** to silence the compiler. If a type is wrong, fix the type. — `tsc` / `review`
- **Boundary data is `unknown`.** `tool_metadata.structured`, `JSON.parse` output, and `CustomEvent.detail` are modeled as `unknown` and narrowed with type guards before use. — `review`

```ts
// ✅ narrow at the boundary
const detail: unknown = event.detail;
if (isOpenSubagentDetail(detail)) handleOpen(detail);

// ❌ never
const detail = event.detail as unknown as OpenSubagentDetail;
```

## 2. Error handling — no silent fallbacks

- **No empty `catch {}`.** At minimum log; then rethrow, fall back deliberately, or surface via the toast store. — `review`
- **No `?? fallback` that masks a failed read.** `?? 0` / `?? []` are fine for a genuine empty state, forbidden when they hide a broken load. Distinguish *loading* from *empty*. — `review`
- **No `console.log` in committed code.** Use the toast store for user-visible errors; `console.warn` / `console.error` only at the Tauri-IPC boundary. — `review` (biome `noConsole` allows only warn/error)
- **Surface backend failures.** When a Tauri command fails, show a toast or error state — never render stale/empty data as success. — `review`

## 3. Immutability

- **All store updates use spread copies.** `editorGroups`, `settings`, `providerSnapshots`, `search` — never mutate in place. — `review`
- Return the *previous reference* when an update is a no-op (see `syncAllTabTitles`) to avoid spurious reactivity. — `review`

```ts
// ✅
setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, activeTabId } : g)));
// ❌
group.activeTabId = id;
```

## 4. Solid.js reactivity

- **`<Index>` for tab/pane collections** you want to keep stable across reorders (`EditorArea`, `EditorGroupsContainer`). **`<For>`** only when identity tracks the item. — `eslint` (partial) / `review`
- **`<Show when={id} keyed>`** when a component must remount on identity change — e.g. `<Show when={session().id} keyed>` forces `SessionView` to drop stale local state. — `review`
- **Read accessors `()` inside JSX/effects, not at component top level** — a top-level read runs once and captures a stale value. — `eslint` (`solid/reactivity` is off due to false positives; this is review-enforced)
- **`createMemo` only when a downstream consumer runs more than once per change** — otherwise it is pure overhead. — `review`
- **Use `on()` for explicit dependency tracking** when an effect should react to a specific signal only. — `review`

## 5. Components & structure

- **Explicit `interface Props { … }`** for any component with more than one prop. No inline `{ x }: { x: string }`. — `review`
- **Many small files over few large ones.** Target 200–400 LOC, 800 hard max. Extract hooks (`createXxx`) and sub-components when a file mixes orchestration with rendering. — `review` (LOC checked by the `scripts/check-file-size` pre-push step)
- **Organize by feature/domain**, not by type. — `review`
- **No single-use helpers** — inline them. — `review`

## 6. i18n

- **All user-facing strings go through `t()`.** No literal English in JSX. — `review`
- **`en.json` and `zh.json` keys stay in parity.** Every leaf key must be referenced by at least one `t()` call (guarded by `i18n.test.ts`). — `vitest`

## 7. Formatting & Biome linting

- 2-space indent, 80-column width, double quotes, semicolons, trailing commas, LF line endings. — `biome`
- Never hand-format; run `npm run biome:format`. The pre-commit hook formats staged files automatically. — `biome`
- Biome runs its `recommended` linter alongside ESLint. A few recommended rules are
  **intentionally disabled** in `biome.json` (documented here because Biome's config
  cannot hold inline comments):
  - **`a11y` group** (`useButtonType`, `noSvgWithoutTitle`, `noStaticElementInteractions`,
    `useKeyWithClickEvents`) — full WCAG linting is out of scope for this icon-heavy
    desktop app; revisit as a dedicated initiative.
  - **`style/noNonNullAssertion`** — non-null assertions are a deliberate, widespread
    choice; type safety is enforced via `tsc` strict + review.
  - **`style/noDescendingSpecificity`** — reordering the hand-tuned cascade in the
    existing stylesheets risks visual regressions.
  - **`suspicious/noAssignInExpressions`** — the `while ((m = re.exec(s)) !== null)`
    regex-iteration idiom is correct and clearer than the alternatives.

---

### Quick checklist before commit

- [ ] `tsc` clean, `biome:check` clean, `eslint` clean
- [ ] No `any` / `as unknown as` / `@ts-ignore` / `console.log` / empty `catch`
- [ ] Stores updated immutably (spread)
- [ ] Reactivity: `Index` vs `For`, keyed `Show`, accessors read in scope
- [ ] User-facing strings via `t()`, both locales in parity
- [ ] New behavior has a `*.test.ts(x)` next to the source
