import { createSignal } from "solid-js";

export function SplitHandle(props: {
  onResize: (deltaX: number) => void;
  onDoubleClick: () => void;
}) {
  const [active, setActive] = createSignal(false);

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    setActive(true);
    const startX = e.clientX;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    function onPointerMove(ev: PointerEvent) {
      props.onResize(ev.clientX - startX);
    }

    function onPointerUp() {
      setActive(false);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
    }

    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
  }

  return (
    <div
      class={`split-handle${active() ? " active" : ""}`}
      onPointerDown={onPointerDown}
      onDblClick={props.onDoubleClick}
    />
  );
}
