import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { useLongPress } from "@/lib/useLongPress";
import { _setViewportForTest } from "@/stores/viewport";

function Probe(props: { onLongPress: (pos: { x: number; y: number }) => void; onClick: () => void }) {
  const longPress = useLongPress(props.onLongPress);
  return (
    <button
      type="button"
      data-testid="target"
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
      onClickCapture={longPress.onClickCapture}
      onClick={props.onClick}
    >
      press
    </button>
  );
}

describe("useLongPress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _setViewportForTest({ isCoarse: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    _setViewportForTest({ isCoarse: false, isCompact: false });
  });

  function setup() {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    const { getByTestId } = render(<Probe onLongPress={onLongPress} onClick={onClick} />);
    return { target: getByTestId("target"), onLongPress, onClick };
  }

  it("fires with the press position after a still touch hold", () => {
    const { target, onLongPress } = setup();
    fireEvent.pointerDown(target, { pointerType: "touch", clientX: 40, clientY: 60 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onLongPress).toHaveBeenCalledWith({ x: 40, y: 60 });
  });

  it("does not fire for mouse presses", () => {
    const { target, onLongPress } = setup();
    fireEvent.pointerDown(target, { pointerType: "mouse", clientX: 40, clientY: 60 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("cancels when the finger moves past the tolerance", () => {
    const { target, onLongPress } = setup();
    fireEvent.pointerDown(target, { pointerType: "touch", clientX: 40, clientY: 60 });
    fireEvent.pointerMove(target, { pointerType: "touch", clientX: 40, clientY: 90 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("cancels on release before the delay", () => {
    const { target, onLongPress } = setup();
    fireEvent.pointerDown(target, { pointerType: "touch", clientX: 40, clientY: 60 });
    fireEvent.pointerUp(target, { pointerType: "touch" });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("swallows the click that follows a fired long-press", () => {
    const { target, onLongPress, onClick } = setup();
    fireEvent.pointerDown(target, { pointerType: "touch", clientX: 40, clientY: 60 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onLongPress).toHaveBeenCalled();
    fireEvent.click(target);
    expect(onClick).not.toHaveBeenCalled();

    // The next tap works normally again.
    fireEvent.click(target);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
