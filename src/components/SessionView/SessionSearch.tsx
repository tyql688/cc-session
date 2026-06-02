import type { Accessor, Setter } from "solid-js";
import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { useI18n } from "../../i18n/index";
import { getMarksInVisualOrder } from "./search-utils";

export interface SessionSearchProps {
  sessionSearch: Accessor<string>;
  activeSessionSearch: Accessor<string>;
  setSessionSearch: Setter<string>;
  searchMatchIdx: Accessor<number>;
  setSearchMatchIdx: Setter<number>;
  setSearchBarOpen: Setter<boolean>;
  // Accessor (not a bare ref) so it reflects the live messages container even
  // when the search bar is opened before the messages div mounts (Cmd+F during
  // load). Passing the ref by value would capture `undefined` permanently.
  messagesRef: Accessor<HTMLDivElement | undefined>;
}

export function SessionSearch(props: SessionSearchProps) {
  const { t } = useI18n();

  // Single source of truth for the displayed total: the number of navigable
  // `<mark>` nodes — the SAME list navigation cycles over. Counting matching
  // entries once each (the old behavior) disagreed with Next/Prev because a
  // single entry (esp. merged tool groups) holds many marks.
  const [markCount, setMarkCount] = createSignal(0);

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
  let pendingRaf: number | undefined;
  const clearPendingRaf = () => {
    if (pendingRaf !== undefined) cancelAnimationFrame(pendingRaf);
    pendingRaf = undefined;
  };
  onCleanup(clearPendingRaf);

  createEffect(
    on(
      () => props.activeSessionSearch().trim(),
      (active) => {
        clearPendingRaf();
        if (!active) {
          setMarkCount(0);
          return;
        }
        pendingRaf = requestAnimationFrame(() => {
          pendingRaf = requestAnimationFrame(() => {
            pendingRaf = undefined;
            recountMarks();
          });
        });
      },
    ),
  );

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
    const newIdx =
      (props.searchMatchIdx() + delta + marks.length) % marks.length;
    props.setSearchMatchIdx(newIdx);
    const target = marks[newIdx];
    target.classList.add("search-active");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div class="session-search-bar">
      <input
        class="session-search-input"
        type="text"
        placeholder={t("session.searchPlaceholder")}
        value={props.sessionSearch()}
        onInput={(e) => {
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
      <span class="session-search-count">
        {(() => {
          const query = props.sessionSearch().trim();
          const activeQuery = props.activeSessionSearch().trim();
          if (!query) return "";
          if (query !== activeQuery) return "";
          const total = markCount();
          if (total > 0) return `${props.searchMatchIdx() + 1}/${total}`;
          return t("session.searchNoMatch");
        })()}
      </span>
      <button
        class="session-search-nav"
        onClick={() => navigateSearchMatch(-1)}
        aria-label={t("common.previousMatch")}
      >
        &uarr;
      </button>
      <button
        class="session-search-nav"
        onClick={() => navigateSearchMatch(1)}
        aria-label={t("common.nextMatch")}
      >
        &darr;
      </button>
      <button
        class="session-search-nav"
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
