import { createEffect, createSignal, on } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import {
  pendingSessionSearch,
  setPendingSessionSearch,
} from "../../stores/search";
import type { ProcessedEntry } from "./hooks";
import {
  SESSION_SEARCH_DEBOUNCE_MS,
  getMarksInVisualOrder,
} from "./search-utils";

export interface CreateSessionSearchOptions {
  /** Role-filtered entries the search runs against. */
  filteredEntries: Accessor<ProcessedEntry[]>;
  /** Lazy ref getter — the messages container may not exist yet. */
  getMessagesRef: () => HTMLDivElement | undefined;
  /** Whether the session is still loading (gates the pending-search effect). */
  loading: Accessor<boolean>;
  /** The current session id (matched against a pending global search). */
  sessionId: Accessor<string>;
  /** Load the complete searchable window and return the first matching entry. */
  resolveCompleteSearchMatch: (term: string) => Promise<number | null>;
  /** Expand the normal render window until the matched entry is present. */
  revealEntry: (entryIndex: number) => void;
  /** Register the debounce timer for cleanup by the owning component. */
  registerDebounce: (clear: () => void) => void;
}

export interface CreateSessionSearchResult {
  sessionSearch: Accessor<string>;
  setSessionSearch: Setter<string>;
  activeSessionSearch: Accessor<string>;
  searchBarOpen: Accessor<boolean>;
  setSearchBarOpen: Setter<boolean>;
  searchMatchIdx: Accessor<number>;
  setSearchMatchIdx: Setter<number>;
}

/**
 * Owns the in-session search slice of SessionView: the search query signals,
 * the active/focus state, the match count memo, and the two effects that
 * (1) consume a pending global search and (2) debounce typed queries. Bodies
 * are moved verbatim from the inline component so dependency tracking, the
 * debounce timing, and the `suppressNextSearchEffect` guard are unchanged.
 *
 * The debounce timer is owned here but its cleanup is registered back with the
 * component via `registerDebounce` so onCleanup stays in one place.
 */
export function createSessionSearch(
  opts: CreateSessionSearchOptions,
): CreateSessionSearchResult {
  const [sessionSearch, setSessionSearch] = createSignal("");
  const [activeSessionSearch, setActiveSessionSearch] = createSignal("");
  const [searchBarOpen, setSearchBarOpen] = createSignal(false);
  const [searchMatchIdx, setSearchMatchIdx] = createSignal(0);

  let sessionSearchDebounce: ReturnType<typeof setTimeout> | undefined;
  let suppressNextSearchEffect = false;
  let searchRequestId = 0;
  opts.registerDebounce(() => clearTimeout(sessionSearchDebounce));

  function focusRenderedSearchMatch(entryKey: string | undefined) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const messagesRef = opts.getMessagesRef();
        if (!messagesRef) return;
        const marks = getMarksInVisualOrder(messagesRef);
        const targetEntry = entryKey
          ? Array.from(
              messagesRef.querySelectorAll<HTMLElement>(".session-entry"),
            ).find((entry) => entry.dataset.entryKey === entryKey)
          : undefined;
        const target =
          (targetEntry && getMarksInVisualOrder(targetEntry)[0]) ?? marks[0];
        if (!target) return;

        messagesRef
          .querySelector("mark.search-active")
          ?.classList.remove("search-active");
        target.classList.add("search-active");
        const targetIndex = marks.indexOf(target);
        setSearchMatchIdx(targetIndex >= 0 ? targetIndex : 0);
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  async function commitSessionSearch(raw: string) {
    const requestId = ++searchRequestId;
    const term = raw.trim();
    setSearchMatchIdx(0);
    if (!term) {
      setActiveSessionSearch("");
      return;
    }

    const matchIdx = (await opts.resolveCompleteSearchMatch(term)) ?? -1;
    if (requestId !== searchRequestId || term !== sessionSearch().trim()) {
      return;
    }
    const targetEntry = matchIdx >= 0 ? opts.filteredEntries()[matchIdx] : null;
    if (targetEntry) {
      opts.revealEntry(matchIdx);
    }
    setActiveSessionSearch(term);
    focusRenderedSearchMatch(targetEntry?.key);
  }

  // Consume a pending session search set by the global SearchOverlay.
  // Runs after the session finishes loading; applies the query, opens the
  // in-session search bar, and scrolls to the first match.
  createEffect(() => {
    const pending = pendingSessionSearch();
    if (!pending || opts.loading()) return;
    if (pending.sessionId !== opts.sessionId()) return;
    setPendingSessionSearch(null);

    suppressNextSearchEffect = true;
    setSessionSearch(pending.query);
    setSearchBarOpen(true);
    void commitSessionSearch(pending.query);
  });

  createEffect(
    on(sessionSearch, (raw) => {
      clearTimeout(sessionSearchDebounce);
      if (suppressNextSearchEffect) {
        suppressNextSearchEffect = false;
        return;
      }
      if (!raw.trim()) {
        void commitSessionSearch("");
        return;
      }
      sessionSearchDebounce = setTimeout(
        () => void commitSessionSearch(raw),
        SESSION_SEARCH_DEBOUNCE_MS,
      );
    }),
  );

  return {
    sessionSearch,
    setSessionSearch,
    activeSessionSearch,
    searchBarOpen,
    setSearchBarOpen,
    searchMatchIdx,
    setSearchMatchIdx,
  };
}
