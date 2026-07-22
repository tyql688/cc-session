import { useEffect, useRef } from "react";
import type React from "react";
import { isCoarsePointer } from "@/stores/viewport";

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/**
 * Touch stand-in for right-click: fires `onLongPress` with the press
 * coordinates after 500ms of a still touch. Only arms for `pointerType ===
 * "touch"` on coarse-pointer devices, so mouse and pen flows are untouched.
 * The click that follows a fired long-press is swallowed so the row's tap
 * action doesn't also run.
 */
export function useLongPress(onLongPress: (position: { x: number; y: number }) => void) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  function clear() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }

  // A press must not outlive its element (e.g. the tab is closed elsewhere
  // mid-hold) — the armed timer would fire against unmounted state.
  useEffect(() => clear, []);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch" || !isCoarsePointer()) return;
      firedRef.current = false;
      const position = { x: e.clientX, y: e.clientY };
      startRef.current = position;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        onLongPress(position);
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start || timerRef.current === null) return;
      if (Math.abs(e.clientX - start.x) > MOVE_TOLERANCE_PX || Math.abs(e.clientY - start.y) > MOVE_TOLERANCE_PX) {
        clear();
      }
    },
    onPointerUp: () => clear(),
    onPointerCancel: () => clear(),
    onClickCapture: (e: React.MouseEvent) => {
      if (firedRef.current) {
        firedRef.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}
