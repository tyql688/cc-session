import { useCallback, useLayoutEffect, useRef } from "react";
import { overscrolledBottom, overscrolledTop } from "@/features/session/timelineGeometry";

/**
 * Keep a clicked toggle visually stationary across an expand/collapse state
 * change, so details always open downward from the header.
 *
 * The column-reverse scroller anchors content to the newest message: when a
 * row in the viewport grows, its bottom edge stays put and the header jumps
 * upward instead (no engine scroll anchoring — WKWebView has none and the
 * scroller sets `overflow-anchor: none` so every browser behaves the same).
 * Wrapping the state update records the clicked element's viewport position
 * and restores it with a scrollTop correction in the same frame React
 * commits the new height, before paint.
 *
 * Scoped to explicit clicks on purpose: a blanket ResizeObserver rule would
 * also re-anchor streaming rows and fight the pinned-to-newest behavior.
 */
export function useAnchoredExpand(): (el: HTMLElement, update: () => void) => void {
  const pendingRef = useRef<{ el: HTMLElement; top: number } | null>(null);

  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    const scroller = pending.el.closest<HTMLElement>(".session-messages");
    // Never fight a rubber-band bounce: scrollTop writes lose against the
    // WKWebView elastic animation and land somewhere arbitrary.
    if (!scroller || overscrolledTop(scroller) || overscrolledBottom(scroller)) return;
    const delta = pending.el.getBoundingClientRect().top - pending.top;
    if (delta !== 0) scroller.scrollTop += delta;
  });

  return useCallback((el: HTMLElement, update: () => void) => {
    pendingRef.current = { el, top: el.getBoundingClientRect().top };
    update();
  }, []);
}
