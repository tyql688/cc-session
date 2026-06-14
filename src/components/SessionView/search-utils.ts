import type { ProcessedEntry } from "./hooks";

export const SESSION_SEARCH_DEBOUNCE_MS = 180;

export function normalizeSessionSearch(term: string): string {
  return term.trim().toLocaleLowerCase();
}

export function entryMatchesSearch(
  entry: ProcessedEntry,
  normalizedTerm: string,
): boolean {
  if (!normalizedTerm) return false;
  // `searchHaystack` is the lowercased text pre-computed in `processMessages`;
  // using it directly skips a `toLocaleLowerCase()` per entry per keystroke,
  // which dominates the in-session search cost on 4k-message sessions.
  return entry.searchHaystack.includes(normalizedTerm);
}

export function findNewestMatchingEntryIndex(
  entries: ProcessedEntry[],
  term: string,
): number {
  const normalizedTerm = normalizeSessionSearch(term);
  if (!normalizedTerm) return -1;

  for (let i = entries.length - 1; i >= 0; i--) {
    if (entryMatchesSearch(entries[i], normalizedTerm)) {
      return i;
    }
  }

  return -1;
}

/** CSS selector for a rendered in-session search highlight. */
export const SEARCH_HIGHLIGHT_SELECTOR = "mark.search-highlight";

/**
 * Marks in visual order (top->bottom). Sorting by bounding-box position is
 * required because the messages container uses `column-reverse`, which flips
 * message order in the DOM but not the text order within each message.
 *
 * This is the single source of truth for both the displayed match total and
 * Next/Prev navigation, so the counter can never disagree with how many times
 * Next advances before looping.
 */
export function getMarksInVisualOrder(
  container: HTMLElement | undefined,
): Element[] {
  if (!container) return [];
  const marks = Array.from(
    container.querySelectorAll(SEARCH_HIGHLIGHT_SELECTOR),
  );
  marks.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();

    return ra.top - rb.top || ra.left - rb.left;
  });

  return marks;
}
