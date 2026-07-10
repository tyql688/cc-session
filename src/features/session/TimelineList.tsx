import { memo, useMemo } from "react";
import type { Provider } from "@/lib/types";
import { MessageBubble } from "@/features/session/MessageBubble";
import { MergedToolRow } from "@/features/session/MergedToolRow";
import {
  entryFirstMessageIndex,
  estimateEntryHeight,
  isSearchableRole,
  type ProcessedEntry,
} from "@/features/session/hooks";

/**
 * The timeline rows, isolated from SessionView re-renders and split into
 * memoized BLOCKS so a pagination chunk re-reconciles one block instead of
 * every loaded row. React reconciliation of a flat 10k-child list costs tens
 * of milliseconds per update — with the loaded window growing as you scroll,
 * every prepended chunk paid O(all rows) and the timeline stuttered for the
 * whole landing (measured: chunk cost was flat ~60-80ms regardless of chunk
 * size). Blocks are keyed by absolute message index, so prepending older
 * messages only creates/extends the leading blocks; the rest compare equal.
 *
 * Block wrappers use `display: contents` — rows stay in the scroller's normal
 * flow, so scroll geometry, content-visibility, and scroll anchoring see the
 * exact same layout as a flat list. Anything that walks rows must use the
 * `.session-entry` class, never `scroller.children`.
 */

/** Messages per block, by absolute session index. */
const BLOCK_SPAN = 100;

/** Rows register themselves here on mount/unmount (React 19 ref cleanup), so
 * the owner's observers (paint-ahead IntersectionObserver, anchoring
 * ResizeObserver) track rows incrementally instead of re-observing the whole
 * list on every change. */
export type RowRegistrar = (el: HTMLDivElement | null) => (() => void) | undefined;

interface Block {
  id: number;
  entries: ProcessedEntry[];
}

function groupIntoBlocks(entries: ProcessedEntry[]): Block[] {
  const blocks: Block[] = [];
  for (const entry of entries) {
    const anchor = entryFirstMessageIndex(entry);
    const id = anchor === null ? null : Math.floor(anchor / BLOCK_SPAN);
    const last = blocks[blocks.length - 1];
    // Time separators (no own index) stay with the preceding block so block
    // membership never depends on anything but absolute message indices.
    if (last !== undefined && (id === null || id === last.id)) {
      last.entries.push(entry);
      continue;
    }
    blocks.push({ id: id ?? 0, entries: [entry] });
  }
  return blocks;
}

interface BlockProps {
  entries: ProcessedEntry[];
  provider: Provider;
  parentSessionId: string;
  registerRow: RowRegistrar;
}

/** A block's entries derive deterministically from its absolute message range
 * plus the role filter, and filtering can only REMOVE entries — any interior
 * change moves the length or an end key, so (length, end keys) identify the
 * slice without a full array comparison. */
function sameBlock(prev: BlockProps, next: BlockProps): boolean {
  return (
    prev.provider === next.provider &&
    prev.parentSessionId === next.parentSessionId &&
    prev.registerRow === next.registerRow &&
    prev.entries.length === next.entries.length &&
    prev.entries[0]?.key === next.entries[0]?.key &&
    prev.entries[prev.entries.length - 1]?.key === next.entries[next.entries.length - 1]?.key
  );
}

/** Entries arrive oldest-first; the scroller is `column-reverse`, so blocks
 * and rows are emitted newest-first to keep the visual order unchanged. */
const TimelineBlock = memo(function TimelineBlock(props: BlockProps) {
  return (
    <div style={{ display: "contents" }}>
      {props.entries.toReversed().map((entry) => (
        <div
          key={entry.key}
          ref={props.registerRow}
          className="session-entry"
          data-entry-key={entry.key}
          data-searchable={entry.type === "message" && isSearchableRole(entry.msg.role) ? "" : undefined}
          // Per-row reserved height so revealing off-screen rows doesn't shift scroll.
          style={{ containIntrinsicSize: `auto ${estimateEntryHeight(entry)}px` }}
        >
          {entry.type === "time-sep" ? (
            <div className="msg-time-separator">{entry.time}</div>
          ) : entry.type === "merged-tools" ? (
            <MergedToolRow
              tools={entry.tools}
              messages={entry.messages}
              provider={props.provider}
              parentSessionId={props.parentSessionId}
            />
          ) : (
            <MessageBubble message={entry.msg} provider={props.provider} parentSessionId={props.parentSessionId} />
          )}
        </div>
      ))}
    </div>
  );
}, sameBlock);

export const TimelineList = memo(function TimelineList(props: {
  entries: ProcessedEntry[];
  provider: Provider;
  parentSessionId: string;
  registerRow: RowRegistrar;
  scrollerRef: (el: HTMLDivElement | null) => void;
  onScroll: () => void;
}) {
  const blocks = useMemo(() => groupIntoBlocks(props.entries).reverse(), [props.entries]);
  return (
    <div className="session-messages" ref={props.scrollerRef} onScroll={props.onScroll} tabIndex={-1}>
      {blocks.map((block) => (
        <TimelineBlock
          key={block.id}
          entries={block.entries}
          provider={props.provider}
          parentSessionId={props.parentSessionId}
          registerRow={props.registerRow}
        />
      ))}
    </div>
  );
});
