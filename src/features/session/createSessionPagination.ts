import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { flushSync } from "react-dom";
import { cancelSessionLoad, getSessionMessagesWindow, isLoadCanceledError } from "@/lib/tauri";
import type { Message, SessionMeta, TokenTotals } from "@/lib/types";
import { findFirstMatchingEntryIndex } from "@/features/session/search-utils";
import type { ProcessedEntry } from "@/features/session/hooks";

/** Backend page sizes: how many messages the initial open fetches and how
 * many each older-page fetch adds. The Virtuoso window bounds live DOM; these
 * bound a single IPC payload and how many messages sit in memory. */
export const INITIAL_TAIL = 300;
const TAIL_BATCH = 600;

export interface CreateSessionPaginationOptions {
  /** Current session id (guards stale async results). */
  sessionId: string;
  /** Role-filtered entries the timeline renders. */
  filteredEntries: ProcessedEntry[];
  /** Absolute session index of messages[0] — owned by the component because
   * `processMessages` needs it before this hook can run. */
  windowStart: number;
  setWindowStart: Dispatch<SetStateAction<number>>;
  /** Number of currently loaded messages (window end = start + count). */
  loadedCount: number;
  /** Scroll container (null until it mounts — state twin of the ref). */
  scrollElement: HTMLDivElement | null;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setMeta: Dispatch<SetStateAction<SessionMeta>>;
  /** Apply fresh token totals onto a meta object. */
  withTokenTotals: (metaData: SessionMeta, totals: TokenTotals) => SessionMeta;
  /** Scroll a row (by index in `filteredEntries`) into view — backed by the
   * Virtuoso handle in the component. */
  scrollToItem: (index: number, align: "start" | "center" | "end") => void;
  /** Scroll to the newest row. */
  scrollToBottom: () => void;
}

export interface CreateSessionPaginationResult {
  totalMessages: number;
  setTotalMessages: Dispatch<SetStateAction<number>>;
  resolveCompleteSearchMatch: (term: string) => Promise<number | null>;
  revealEntry: (entryIndex: number) => void;
  revealMessageIndex: (messageIndex: number) => Promise<boolean>;
  scrollToEnd: () => void;
  /** Page in the previous/next batch — wired to Virtuoso's start/end reached. */
  loadOlder: () => void;
  loadNewer: () => void;
}

/**
 * Owns the windowed-loading + navigation slice of SessionView.
 *
 * Rendering is content-visibility: every loaded row is real DOM in normal flow
 * and the browser skips paint/layout for off-screen rows. Message *loading*
 * stays windowed (the backend pages the parsed session over IPC), in BOTH
 * directions: older pages prepend as the viewport nears the top, newer pages
 * append as it nears the bottom. Prepends keep the viewport glued to the read
 * position through the browser's native scroll anchoring (rows stay in normal
 * flow), so no manual scrollHeight compensation here. A jump far outside the
 * window (minimap tick, reveal) re-centers the window around the target instead
 * of paging everything in between, then scrolls the target row into view via the
 * DOM. Only a committed in-session search loads the complete session (counting
 * must cover every message).
 */
export function useSessionPagination(opts: CreateSessionPaginationOptions): CreateSessionPaginationResult {
  const [totalMessages, setTotalMessages] = useState(0);
  const { windowStart, setWindowStart } = opts;

  // Latest-value refs so async callbacks read current values across awaits
  // instead of the values captured when the closure was created.
  const filteredEntriesRef = useRef(opts.filteredEntries);
  filteredEntriesRef.current = opts.filteredEntries;
  const sessionIdRef = useRef(opts.sessionId);
  sessionIdRef.current = opts.sessionId;
  const windowStartRef = useRef(windowStart);
  windowStartRef.current = windowStart;
  const totalMessagesRef = useRef(totalMessages);
  totalMessagesRef.current = totalMessages;
  const loadedCountRef = useRef(opts.loadedCount);
  loadedCountRef.current = opts.loadedCount;
  const scrollElementRef = useRef(opts.scrollElement);
  scrollElementRef.current = opts.scrollElement;

  const windowFetchInFlightRef = useRef(false);
  const windowRequestSeqRef = useRef(0);
  const activeWindowRequestRef = useRef<{
    sessionId: string;
    requestId: string;
  } | null>(null);
  // Edge prefetch is armed only after the view has been positioned (scroll-to-
  // end on open, or a reveal jump). Before that the scroller sits at offset 0
  // and the "near the top" check would fire a spurious older-page fetch.
  const positionedRef = useRef(false);
  useEffect(() => {
    positionedRef.current = false;
  }, [opts.sessionId]);

  useEffect(() => {
    return () => {
      const request = activeWindowRequestRef.current;
      if (request) {
        void cancelSessionLoad(request.sessionId, request.requestId).catch((error) => {
          console.warn("cancelSessionLoad failed:", error);
        });
      }
    };
  }, [opts.sessionId]);

  function beginWindowRequest(kind: string): {
    sessionId: string;
    requestId: string;
  } {
    const sessionId = sessionIdRef.current;
    const requestId = `${sessionId}:window:${kind}:${++windowRequestSeqRef.current}`;
    activeWindowRequestRef.current = { sessionId, requestId };
    return { sessionId, requestId };
  }

  function finishWindowRequest(requestId: string) {
    if (activeWindowRequestRef.current?.requestId === requestId) {
      activeWindowRequestRef.current = null;
    }
  }

  /** Prepend an older page and keep the read position fixed. Browser scroll
   * anchoring handles small per-row height corrections but NOT a bulk insert of
   * a whole page far above the viewport, so compensate explicitly: measure the
   * scrollHeight growth across the synchronous DOM update and add it to
   * scrollTop, so the previously-visible rows stay exactly where they were. */
  function prependMessages(older: { messages: Message[]; start: number; total: number; token_totals: TokenTotals }) {
    const el = scrollElementRef.current;
    const beforeHeight = el?.scrollHeight ?? 0;
    const beforeTop = el?.scrollTop ?? 0;
    flushSync(() => {
      opts.setMeta((prev) => opts.withTokenTotals(prev, older.token_totals));
      opts.setMessages((prev) => [...older.messages, ...prev]);
      setWindowStart(older.start);
      setTotalMessages(older.total);
    });
    if (el) {
      const grew = el.scrollHeight - beforeHeight;
      if (grew !== 0) el.scrollTop = beforeTop + grew;
    }
  }

  async function loadOlderTail(): Promise<boolean> {
    if (windowFetchInFlightRef.current || windowStartRef.current <= 0) {
      return false;
    }
    const request = beginWindowRequest("older");
    windowFetchInFlightRef.current = true;
    const newStart = Math.max(0, windowStartRef.current - TAIL_BATCH);
    const span = windowStartRef.current - newStart;
    try {
      const older = await getSessionMessagesWindow(request.sessionId, newStart, span, request.requestId);
      if (request.sessionId !== sessionIdRef.current) return false;
      prependMessages(older);
      return older.messages.length > 0;
    } catch (e) {
      if (isLoadCanceledError(e)) return false;
      console.warn("load older messages failed:", e);
      return false;
    } finally {
      finishWindowRequest(request.requestId);
      windowFetchInFlightRef.current = false;
    }
  }

  async function loadNewerTail(): Promise<boolean> {
    const end = windowStartRef.current + loadedCountRef.current;
    if (windowFetchInFlightRef.current || end >= totalMessagesRef.current) {
      return false;
    }
    const request = beginWindowRequest("newer");
    windowFetchInFlightRef.current = true;
    try {
      const newer = await getSessionMessagesWindow(request.sessionId, end, TAIL_BATCH, request.requestId);
      if (request.sessionId !== sessionIdRef.current) return false;
      // Appending below the viewport never moves visible content in a top-down
      // layout — no flushSync, no scroll compensation needed.
      opts.setMeta((prev) => opts.withTokenTotals(prev, newer.token_totals));
      opts.setMessages((prev) => [...prev, ...newer.messages]);
      setTotalMessages(newer.total);
      return newer.messages.length > 0;
    } catch (e) {
      if (isLoadCanceledError(e)) return false;
      console.warn("load newer messages failed:", e);
      return false;
    } finally {
      finishWindowRequest(request.requestId);
      windowFetchInFlightRef.current = false;
    }
  }

  // Edge prefetch is driven by Virtuoso's start/end-reached callbacks (it knows
  // the rendered range with overscan runway). Only fire once the view has been
  // positioned, so the open scroll-to-bottom doesn't trigger a spurious fetch.
  function loadOlder() {
    if (!positionedRef.current) return;
    void loadOlderTail();
  }
  function loadNewer() {
    if (!positionedRef.current) return;
    void loadNewerTail();
  }

  function revealEntry(entryIndex: number) {
    const total = filteredEntriesRef.current.length;
    if (entryIndex < 0 || entryIndex >= total) return;
    positionedRef.current = true;
    opts.scrollToItem(entryIndex, "center");
  }

  /** Re-center the loaded window around a target message, REPLACING the current
   * window. A far jump (minimap tick near the top of a 13k-message session)
   * must not page in everything in between — re-centering costs the same IPC as
   * opening the session, and discarded rows reload on demand if scrolled back. */
  async function recenterWindowAround(messageIndex: number): Promise<boolean> {
    if (windowFetchInFlightRef.current) return false;
    const request = beginWindowRequest("recenter");
    windowFetchInFlightRef.current = true;
    try {
      const start = Math.max(0, messageIndex - Math.floor(INITIAL_TAIL / 2));
      const window = await getSessionMessagesWindow(request.sessionId, start, INITIAL_TAIL, request.requestId);
      if (request.sessionId !== sessionIdRef.current) return false;
      // flushSync so the entry lookup below sees the new window.
      flushSync(() => {
        opts.setMeta((prev) => opts.withTokenTotals(prev, window.token_totals));
        opts.setMessages(window.messages);
        setWindowStart(window.start);
        setTotalMessages(window.total);
      });
      return true;
    } catch (e) {
      if (isLoadCanceledError(e)) return false;
      console.warn("recenter window failed:", e);
      return false;
    } finally {
      finishWindowRequest(request.requestId);
      windowFetchInFlightRef.current = false;
    }
  }

  async function revealMessageIndex(messageIndex: number): Promise<boolean> {
    if (messageIndex < 0 || messageIndex >= totalMessagesRef.current) {
      return false;
    }
    positionedRef.current = true;

    const start = windowStartRef.current;
    const end = start + loadedCountRef.current;
    if (messageIndex < start || messageIndex >= end) {
      const recentered = await recenterWindowAround(messageIndex);
      if (!recentered) return false;
    }

    const entries = filteredEntriesRef.current;
    let entryIndex = entries.findIndex((entry) => entry.type === "message" && entry.messageIndex === messageIndex);
    if (entryIndex < 0) {
      // The exact message may be folded into a merged-tool row or filtered out;
      // land on the first entry at or after it instead of failing.
      entryIndex = entries.findIndex((entry) => {
        if (entry.type === "message") return entry.messageIndex >= messageIndex;
        if (entry.type === "merged-tools") {
          return entry.messageIndices.some((index) => index >= messageIndex);
        }
        return false;
      });
    }
    if (entryIndex < 0) return false;
    opts.scrollToItem(entryIndex, "start");
    return true;
  }

  /** Load whatever the window is missing so search covers every message. The
   * common shape (window is the newest tail) prepends the older part, preserving
   * the viewport; a re-centered window missing BOTH sides is replaced with the
   * full session, compensating the scroll offset by where the previously-first
   * row lands in the new list. */
  async function ensureCompleteWindowForSearch(): Promise<boolean> {
    if (windowFetchInFlightRef.current) return false;
    const start = windowStartRef.current;
    const end = start + loadedCountRef.current;
    const total = totalMessagesRef.current;
    if (start <= 0 && end >= total) return true;

    const request = beginWindowRequest("search");
    windowFetchInFlightRef.current = true;
    try {
      if (end >= total) {
        const older = await getSessionMessagesWindow(request.sessionId, 0, start, request.requestId);
        if (request.sessionId !== sessionIdRef.current) return false;
        prependMessages(older);
        return older.start === 0;
      }

      const complete = await getSessionMessagesWindow(request.sessionId, 0, total, request.requestId);
      if (request.sessionId !== sessionIdRef.current) return false;
      // Scroll anchoring keeps the read position stable across the prepended
      // part; the caller (search) then scrolls to the match anyway.
      flushSync(() => {
        opts.setMeta((prev) => opts.withTokenTotals(prev, complete.token_totals));
        opts.setMessages(complete.messages);
        setWindowStart(complete.start);
        setTotalMessages(complete.total);
      });
      return complete.start === 0;
    } catch (e) {
      if (isLoadCanceledError(e)) return false;
      console.warn("load complete session for search failed:", e);
      return false;
    } finally {
      finishWindowRequest(request.requestId);
      windowFetchInFlightRef.current = false;
    }
  }

  async function resolveCompleteSearchMatch(term: string): Promise<number | null> {
    if (windowStartRef.current > 0 || windowStartRef.current + loadedCountRef.current < totalMessagesRef.current) {
      const loadedCompleteWindow = await ensureCompleteWindowForSearch();
      if (!loadedCompleteWindow) return null;
    }

    const matchIndex = findFirstMatchingEntryIndex(filteredEntriesRef.current, term);
    return matchIndex >= 0 ? matchIndex : null;
  }

  function scrollToEnd() {
    positionedRef.current = true;
    opts.scrollToBottom();
  }

  return {
    totalMessages,
    setTotalMessages,
    resolveCompleteSearchMatch,
    revealEntry,
    revealMessageIndex,
    scrollToEnd,
    loadOlder,
    loadNewer,
  };
}
