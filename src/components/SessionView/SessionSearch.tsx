import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/index";
import { getMarksInVisualOrder } from "./search-utils";

export interface SessionSearchProps {
  sessionSearch: string;
  activeSessionSearch: string;
  setSessionSearch: Dispatch<SetStateAction<string>>;
  searchMatchIdx: number;
  setSearchMatchIdx: Dispatch<SetStateAction<number>>;
  setSearchBarOpen: Dispatch<SetStateAction<boolean>>;
  // Accessor (not a bare ref) so it reflects the live messages container even
  // when the search bar is opened before the messages div mounts (Cmd+F during
  // load). Passing the ref by value would capture `undefined` permanently.
  messagesRef: () => HTMLDivElement | undefined;
}

export function SessionSearch(props: SessionSearchProps) {
  const { t } = useI18n();

  // Single source of truth for the displayed total: the number of navigable
  // `<mark>` nodes — the SAME list navigation cycles over. Counting matching
  // entries once each (the old behavior) disagreed with Next/Prev because a
  // single entry (esp. merged tool groups) holds many marks.
  const [markCount, setMarkCount] = useState(0);

  function currentMarks(): Element[] {
    return getMarksInVisualOrder(props.messagesRef());
  }

  function recountMarks() {
    setMarkCount(currentMarks().length);
  }

  // Recompute the mark count whenever the committed query changes. Highlights
  // are inserted during the bubble re-render that the new `activeSessionSearch`
  // triggers, so we wait two animation frames (mirroring the focus-first-match
  // timing in createSessionSearch) before reading the DOM. raf handles are kept
  // in closure vars so a single onCleanup cancels whichever frame is pending.
  const pendingRafRef = useRef<number | undefined>(undefined);
  const clearPendingRaf = () => {
    if (pendingRafRef.current !== undefined)
      cancelAnimationFrame(pendingRafRef.current);
    pendingRafRef.current = undefined;
  };
  useEffect(() => clearPendingRaf, []);

  useEffect(() => {
    const active = props.activeSessionSearch.trim();
    clearPendingRaf();
    if (!active) {
      setMarkCount(0);
      return;
    }
    pendingRafRef.current = requestAnimationFrame(() => {
      pendingRafRef.current = requestAnimationFrame(() => {
        pendingRafRef.current = undefined;
        recountMarks();
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.activeSessionSearch]);

  function navigateSearchMatch(delta: number) {
    const marks = currentMarks();
    // Keep the displayed total in sync with the list we are about to cycle —
    // the same array, so counter and navigation can never disagree.
    setMarkCount(marks.length);
    if (marks.length === 0) return;
    // Remove previous active highlight
    props
      .messagesRef()
      ?.querySelector("mark.search-active")
      ?.classList.remove("search-active");
    const newIdx = (props.searchMatchIdx + delta + marks.length) % marks.length;
    props.setSearchMatchIdx(newIdx);
    const target = marks[newIdx];
    target.classList.add("search-active");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="session-search-bar">
      <input
        className="session-search-input"
        type="text"
        placeholder={t("session.searchPlaceholder")}
        value={props.sessionSearch}
        onChange={(e) => {
          props.setSessionSearch(e.currentTarget.value);
          props.setSearchMatchIdx(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (e.shiftKey) {
              navigateSearchMatch(-1);
            } else {
              navigateSearchMatch(1);
            }
          }
          if (e.key === "Escape") {
            props.setSearchBarOpen(false);
            props.setSessionSearch("");
          }
        }}
      />
      <span className="session-search-count">
        {(() => {
          const query = props.sessionSearch.trim();
          const activeQuery = props.activeSessionSearch.trim();
          if (!query) return "";
          if (query !== activeQuery) return "";
          const total = markCount;
          if (total > 0) return `${props.searchMatchIdx + 1}/${total}`;
          return t("session.searchNoMatch");
        })()}
      </span>
      <button
        className="session-search-nav"
        onClick={() => navigateSearchMatch(-1)}
        aria-label={t("common.previousMatch")}
      >
        &uarr;
      </button>
      <button
        className="session-search-nav"
        onClick={() => navigateSearchMatch(1)}
        aria-label={t("common.nextMatch")}
      >
        &darr;
      </button>
      <button
        className="session-search-nav"
        onClick={() => {
          props.setSearchBarOpen(false);
          props.setSessionSearch("");
        }}
        aria-label={t("common.closeSearch")}
      >
        &times;
      </button>
    </div>
  );
}
