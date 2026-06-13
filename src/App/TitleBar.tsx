import { Show } from "solid-js";

export interface TitleBarProps {
  showWindowControls: boolean;
  isMaximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  onStartDragging: () => void;
}

function isInteractiveTitlebarTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("input, button, .search-panel") !== null
  );
}

export function TitleBar(props: TitleBarProps) {
  return (
    <div
      class="titlebar"
      onMouseDown={(e) => {
        if (e.buttons !== 1) return;
        if (isInteractiveTitlebarTarget(e.target)) return;
        e.preventDefault();
        if (e.detail === 2) {
          props.onToggleMaximize();
        } else {
          props.onStartDragging();
        }
      }}
    >
      <div class="titlebar-center">
        <span class="app-name">
          <span class="app-name-bracket">&lt;</span>cc-session
          <span class="app-name-bracket">/&gt;</span>
        </span>
      </div>
      <div class="titlebar-right" />

      <Show when={props.showWindowControls}>
        <div class="win-controls">
          <button type="button" class="win-ctrl-btn" onClick={props.onMinimize}>
            <svg viewBox="0 0 10 10">
              <line
                x1="0"
                y1="5"
                x2="10"
                y2="5"
                stroke="currentColor"
                stroke-width="1.2"
              />
            </svg>
          </button>
          <button
            type="button"
            class="win-ctrl-btn"
            onClick={props.onToggleMaximize}
          >
            <Show
              when={props.isMaximized}
              fallback={
                <svg viewBox="0 0 10 10">
                  <rect
                    x="0.6"
                    y="0.6"
                    width="8.8"
                    height="8.8"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.2"
                  />
                </svg>
              }
            >
              <svg viewBox="0 0 10 10">
                <path
                  d="M2.6 2.6 V1.1 H8.9 V7.4 H7.4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                />
                <rect
                  x="1.1"
                  y="2.6"
                  width="6.3"
                  height="6.3"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                />
              </svg>
            </Show>
          </button>
          <button
            type="button"
            class="win-ctrl-btn close"
            onClick={props.onClose}
          >
            <svg viewBox="0 0 10 10">
              <line
                x1="0.5"
                y1="0.5"
                x2="9.5"
                y2="9.5"
                stroke="currentColor"
                stroke-width="1.2"
              />
              <line
                x1="9.5"
                y1="0.5"
                x2="0.5"
                y2="9.5"
                stroke="currentColor"
                stroke-width="1.2"
              />
            </svg>
          </button>
        </div>
      </Show>
    </div>
  );
}
