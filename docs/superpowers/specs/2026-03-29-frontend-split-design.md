# Frontend Module Split Design

> Date: 2026-03-29
> Scope: src/ — SolidJS/TypeScript frontend only
> Strategy: File splitting + shared utility extraction (Plan B equivalent)

## Goal

Split oversized SolidJS components into focused sub-modules and extract duplicated code into shared utilities. No functional changes, no interface changes, no behavior changes. Pure structural refactoring.

## Constraints

- **Zero functional change** — `npm run build` + `npx tsc --noEmit` pass, UI behavior identical
- **Zero external import path change** — each sub-directory exports via `index.tsx`, so `import { X } from './MessageBubble'` paths unchanged
- **Untouched files** — all components under 400 lines, all stores/, all styles/, lib/tauri.ts, lib/types.ts, lib/providers.ts
- **No store changes** — state management layer untouched
- **No CSS changes** — style files untouched

## Part 1: Shared Utility Extraction

### src/lib/platform.ts

Replace 5 inline `navigator.platform?.includes('Mac')` checks.

```typescript
export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
```

Used in: SearchPanel, TabBar, SettingsPanel, StatusBar, KeyboardOverlay.

### src/lib/formatters.ts

Consolidate duplicated formatting functions:

```typescript
export function formatFileSize(bytes: number): string
export function fmtK(n: number): string
export function formatTimestamp(epoch: number): string    // relative time
export function formatTimeOnly(ms: number): string
export function parseTimestamp(ts: string | number): number
```

Currently duplicated across: SessionView (formatFileSize, fmtK, formatTimestamp, formatTimeOnly, parseTimestamp), SettingsPanel (formatBytes — same logic), TrashView (formatTrashDate).

### src/lib/icons.tsx

Unify provider icon SVGs duplicated in MessageBubble and TreeNode:

```typescript
export function ProviderIcon(props: { provider: string; size?: number }): JSX.Element
export function ProviderDot(props: { provider: string }): JSX.Element
export function UserIcon(): JSX.Element
```

MessageBubble and TreeNode import from here instead of defining their own.

### src/lib/tree-utils.ts

Consolidate tree traversal functions duplicated across TreeNode, Explorer, TrashView:

```typescript
export function collectLeafIds(node: TreeNode, type?: string): string[]
export function collectLeafNodes(node: TreeNode, type?: string): TreeNode[]
export function findInTree(nodes: TreeNode[], predicate: (n: TreeNode) => boolean): TreeNode | undefined
export function walkTree(node: TreeNode, callback: (n: TreeNode) => void): void
```

### src/lib/tree-builders.ts

Generalize the near-identical buildFavoritesTree (FavoritesView:10) and buildTrashTree (TrashView:17):

```typescript
export function buildGroupedTree<T>(
  items: T[],
  getProvider: (item: T) => string,
  getProject: (item: T) => string,
  toNode: (item: T) => TreeNode,
): TreeNode[]
```

## Part 2: Component Splits

### MessageBubble/ (823 lines -> 6 files)

| File | Content | ~Lines |
|------|---------|--------|
| index.tsx | MessageBubble main — role dispatch, compose sub-components, export default | 150 |
| MarkdownRenderer.tsx | renderMarkdownText + renderInlineMarkdown + parseContent + renderKatex + wrapHighlight | 250 |
| ToolMessage.tsx | ToolMessage component + formatToolInput + toolSummary + toolDisplayName + toolIcon + parseMcpToolName + formatMcpLabel + shortPath | 220 |
| ThinkingBlock.tsx | ThinkingBlock collapsible component | 30 |
| ImagePreview.tsx | ImagePreview modal + LocalImage + isLocalPath | 80 |
| TokenUsage.tsx | TokenUsageDisplay + CopyMessageButton | 60 |

ProviderIcon and UserIcon replaced with imports from lib/icons.tsx.

### SessionView/ (711 lines -> 4 files)

| File | Content | ~Lines |
|------|---------|--------|
| index.tsx | Main component — message list, pagination, role filtering, core logic | 350 |
| SessionToolbar.tsx | Top breadcrumb, provider icon, project path, action buttons (favorite/export/delete/resume/watch/copy) | 150 |
| SessionSearch.tsx | In-session search bar, prev/next navigation, getMarksInVisualOrder, navigateSearchMatch | 100 |
| hooks.ts | useWatchSession (live watch/polling createEffect), processMessages (grouping + merging) | 100 |

Formatting functions replaced with imports from lib/formatters.ts.

### Explorer/ (594 lines -> 3 files)

| File | Content | ~Lines |
|------|---------|--------|
| index.tsx | Main component — tree rendering, filtering, time grouping, expand/collapse, multi-select | 300 |
| ContextMenus.tsx | sessionMenuItems, selectionMenuItems, nodeMenuItems builders + menu rendering JSX | 200 |
| hooks.ts | useTreeExpansion (expand/collapse state), buildSessionMeta (TreeNode -> SessionMeta) | 80 |

Tree traversal replaced with imports from lib/tree-utils.ts.

### App/ (421 lines -> 3 files)

| File | Content | ~Lines |
|------|---------|--------|
| index.tsx | Main component — layout, view switching, tab management, Tauri event listeners | 200 |
| KeyboardShortcuts.ts | handleGlobalKeyDown function (~200 lines of keyboard shortcut logic) | 200 |
| SyncManager.ts | syncFromDisk + debounce logic + syncInFlight/pendingFullSync/pendingChangedPaths state | 50 |

Note: KeyboardShortcuts.ts and SyncManager.ts are pure logic modules (.ts not .tsx), exporting functions for index.tsx to call.

## Execution Order

| Step | Module | Rationale |
|------|--------|-----------|
| 1 | Shared utilities (lib/) | Foundation — components will import from these |
| 2 | MessageBubble/ | Largest component |
| 3 | SessionView/ | Second largest, uses lib/formatters |
| 4 | Explorer/ | Uses lib/tree-utils |
| 5 | App/ | Top-level entry, split last |

## Verification Per Step

```bash
npx tsc --noEmit    # type check passes
npm run build       # production build succeeds
```

## Git Strategy

One commit per module:

```
refactor: extract shared utilities to lib/
refactor: split MessageBubble into sub-modules
refactor: split SessionView into sub-modules
refactor: split Explorer into sub-modules
refactor: split App into sub-modules
```

Each commit independently revertible.

## What This Does NOT Do

- No state management changes (stores untouched)
- No CSS refactoring
- No new abstractions (typed event bus, action store)
- No component API changes
- No small component splits (under 400 lines)
- No test additions (separate effort)
