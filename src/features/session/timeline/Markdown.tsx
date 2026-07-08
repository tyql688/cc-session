import { Check, Copy, ExternalLink } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import {
  createJavaScriptRegexEngine,
  getSingletonHighlighter,
  type BundledLanguage,
  type BundledTheme,
  type Highlighter,
} from "shiki";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { COPY_FEEDBACK_MS } from "@/features/session/MessageBubble/TokenUsage";
import { useI18n } from "@/i18n/index";
import { openExternalUrl } from "@/lib/external-links";
import { LruCache } from "@/lib/markdown/lru";
import { markdownToHtml } from "@/lib/markdown";
import { useResolvedTheme } from "@/stores/theme";
import { toastError } from "@/stores/toast";

const MAX_HIGHLIGHT_CHARS = 50_000;
const MAX_HIGHLIGHT_LINES = 800;
const SHIKI_CACHE_CAPACITY = 1200;
const SHIKI_THEMES = {
  light: "github-light",
  dark: "github-dark",
} satisfies Record<"light" | "dark", BundledTheme>;

const COPY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const CHECK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"></path></svg>`;
const MAXIMIZE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>`;
const MINIMIZE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path></svg>`;
const ZOOM_IN_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="8"></circle><path d="M21 21l-4.3-4.3"></path><path d="M11 8v6"></path><path d="M8 11h6"></path></svg>`;
const ZOOM_OUT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="8"></circle><path d="M21 21l-4.3-4.3"></path><path d="M8 11h6"></path></svg>`;
const RESET_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path></svg>`;
const MERMAID_MIN_SCALE = 0.35;
const MERMAID_MAX_SCALE = 4;
const MERMAID_ZOOM_STEP = 1.2;

type MermaidAction = "fullscreen" | "zoomIn" | "zoomOut" | "reset";

interface Props {
  text: string;
}

interface CopyLabels {
  copied: string;
  copyCode: string;
}

interface MermaidLabels {
  exitFullscreen: string;
  resetZoom: string;
  viewFullscreen: string;
  zoomIn: string;
  zoomOut: string;
}

interface ExternalLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
}

interface MermaidTransform {
  scale: number;
  x: number;
  y: number;
}

interface MermaidDragState {
  block: HTMLElement;
  canvas: HTMLElement;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
}

const shikiHtmlCache = new LruCache<string, string>(SHIKI_CACHE_CAPACITY);
const copyResetTimers = new WeakMap<HTMLButtonElement, number>();
let highlighterPromise: Promise<Highlighter> | null = null;
let mermaidId = 0;

// Mermaid is ~2.8MB and its `initialize` is not free. Load it on demand (only
// when a diagram is actually present) and initialize once per theme — never
// per message mount, which would tax every row scrolled into view.
type MermaidApi = typeof import("mermaid")["default"];
let mermaidPromise: Promise<MermaidApi> | null = null;
let mermaidInitializedTheme: "light" | "dark" | null = null;

async function ensureMermaid(theme: "light" | "dark"): Promise<MermaidApi> {
  if (mermaidPromise === null) {
    mermaidPromise = import("mermaid").then((module) => module.default);
  }
  const mermaid = await mermaidPromise;
  if (mermaidInitializedTheme !== theme) {
    const natural = { useMaxWidth: false };
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === "dark" ? "dark" : "default",
      flowchart: natural,
      sequence: natural,
      gantt: natural,
      er: natural,
      journey: natural,
      state: natural,
      class: natural,
      pie: natural,
    });
    mermaidInitializedTheme = theme;
  }
  return mermaid;
}

function getHighlighter(): Promise<Highlighter> {
  if (highlighterPromise !== null) return highlighterPromise;
  highlighterPromise = getSingletonHighlighter({
    engine: createJavaScriptRegexEngine(),
    langs: [],
    themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
  });
  return highlighterPromise;
}

function codeLanguage(code: Element): string {
  for (const className of code.classList) {
    if (className.startsWith("language-")) {
      return className.slice("language-".length).toLowerCase();
    }
  }
  return "";
}

function shouldHighlight(code: string): boolean {
  if (code.length > MAX_HIGHLIGHT_CHARS) return false;
  return code.split("\n").length <= MAX_HIGHLIGHT_LINES;
}

async function highlightedCodeHtml(code: string, language: string): Promise<string | null> {
  if (!shouldHighlight(code)) return null;

  const requestedLanguage = language.length > 0 ? language : "text";
  const cacheKey = `${requestedLanguage}\u0000${code}`;
  const cached = shikiHtmlCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const highlighter = await getHighlighter();
    let shikiLanguage = requestedLanguage;
    if (requestedLanguage !== "text" && requestedLanguage !== "plain") {
      try {
        await highlighter.loadLanguage(requestedLanguage as BundledLanguage);
      } catch {
        shikiLanguage = "text";
      }
    }

    const html = highlighter.codeToHtml(code, {
      lang: shikiLanguage as BundledLanguage,
      themes: SHIKI_THEMES,
    });
    shikiHtmlCache.set(cacheKey, html);
    return html;
  } catch {
    return null;
  }
}

function createCopyButton(labels: CopyLabels): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "markdown-code-copy";
  button.dataset.markdownCopy = "code";
  button.title = labels.copyCode;
  button.setAttribute("aria-label", labels.copyCode);
  button.innerHTML = COPY_ICON;
  return button;
}

function setCopyButtonCopied(button: HTMLButtonElement, labels: CopyLabels): void {
  const previousTimer = copyResetTimers.get(button);
  if (previousTimer !== undefined) window.clearTimeout(previousTimer);

  button.title = labels.copied;
  button.setAttribute("aria-label", labels.copied);
  button.innerHTML = CHECK_ICON;

  const timer = window.setTimeout(() => {
    button.title = labels.copyCode;
    button.setAttribute("aria-label", labels.copyCode);
    button.innerHTML = COPY_ICON;
    copyResetTimers.delete(button);
  }, COPY_FEEDBACK_MS);
  copyResetTimers.set(button, timer);
}

function normalizeShikiInlineStyles(pre: HTMLPreElement): void {
  const styledElements = [pre, ...Array.from(pre.querySelectorAll<HTMLElement>("[style]"))];
  for (const element of styledElements) {
    const lightColor = element.style.color;
    const darkColor = element.style.getPropertyValue("--shiki-dark");
    if (lightColor.length > 0 || darkColor.length > 0) {
      if (lightColor.length > 0) element.style.setProperty("--shiki-light", lightColor);
      element.style.removeProperty("color");
      element.style.setProperty("color", "var(--shiki-token-color)");
    }
    element.style.removeProperty("background-color");
    element.style.removeProperty("--shiki-dark-bg");
  }
}

// The `.markdown-code-block` wrapper + header already exist in the sanitized
// HTML (see markdownToHtml's fence rule), so a row's height is settled at mount.
// This only does height-neutral work: drop the copy button into the min-height
// header, and swap the raw <pre> for a shiki-highlighted one that shares
// `.markdown-code-block-body` (identical padding/line-height → same height).
function enhanceCodeBlocks(root: HTMLElement, labels: CopyLabels): void {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(".markdown-code-block"));
  for (const block of blocks) {
    const header = block.querySelector<HTMLElement>(".markdown-code-block-header");
    const pre = block.querySelector<HTMLPreElement>("pre.markdown-code-block-body");
    const codeElement = pre?.querySelector("code");
    if (header === null || pre === null || codeElement === null || codeElement === undefined) continue;

    if (header.querySelector("[data-markdown-copy]") === null) {
      header.append(createCopyButton(labels));
    }

    if (pre.dataset.highlighted === "true") continue;
    pre.dataset.highlighted = "true";

    const code = codeElement.textContent;
    if (code === null) continue;
    const language = codeLanguage(codeElement);

    void highlightedCodeHtml(code, language).then((highlightedHtml) => {
      if (highlightedHtml === null || !pre.isConnected) return;
      const template = document.createElement("template");
      template.innerHTML = highlightedHtml;
      const highlightedPre = template.content.firstElementChild;
      if (!(highlightedPre instanceof HTMLPreElement)) return;
      normalizeShikiInlineStyles(highlightedPre);
      highlightedPre.classList.add("markdown-code-block-body");
      highlightedPre.dataset.highlighted = "true";
      pre.replaceWith(highlightedPre);
    });
  }
}

function createMermaidButton(action: MermaidAction, label: string, icon: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "markdown-mermaid-action";
  button.dataset.markdownMermaidAction = action;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon;
  return button;
}

function createMermaidToolbar(labels: MermaidLabels): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "markdown-mermaid-toolbar";
  toolbar.append(
    createMermaidButton("zoomOut", labels.zoomOut, ZOOM_OUT_ICON),
    createMermaidButton("zoomIn", labels.zoomIn, ZOOM_IN_ICON),
    createMermaidButton("reset", labels.resetZoom, RESET_ICON),
    createMermaidButton("fullscreen", labels.viewFullscreen, MAXIMIZE_ICON),
  );
  return toolbar;
}

function syncMermaidToolbar(block: HTMLElement, labels: MermaidLabels): void {
  const fullscreenButton = block.querySelector<HTMLButtonElement>('button[data-markdown-mermaid-action="fullscreen"]');
  if (fullscreenButton !== null) {
    const isFullscreen = block.classList.contains("markdown-mermaid-fullscreen");
    fullscreenButton.title = isFullscreen ? labels.exitFullscreen : labels.viewFullscreen;
    fullscreenButton.setAttribute("aria-label", fullscreenButton.title);
    fullscreenButton.innerHTML = isFullscreen ? MINIMIZE_ICON : MAXIMIZE_ICON;
  }

  const zoomInButton = block.querySelector<HTMLButtonElement>('button[data-markdown-mermaid-action="zoomIn"]');
  if (zoomInButton !== null) {
    zoomInButton.title = labels.zoomIn;
    zoomInButton.setAttribute("aria-label", labels.zoomIn);
  }

  const zoomOutButton = block.querySelector<HTMLButtonElement>('button[data-markdown-mermaid-action="zoomOut"]');
  if (zoomOutButton !== null) {
    zoomOutButton.title = labels.zoomOut;
    zoomOutButton.setAttribute("aria-label", labels.zoomOut);
  }

  const resetButton = block.querySelector<HTMLButtonElement>('button[data-markdown-mermaid-action="reset"]');
  if (resetButton !== null) {
    resetButton.title = labels.resetZoom;
    resetButton.setAttribute("aria-label", labels.resetZoom);
  }
}

function readMermaidTransform(block: HTMLElement): MermaidTransform {
  const scale = Number(block.dataset.mermaidScale);
  const x = Number(block.dataset.mermaidX);
  const y = Number(block.dataset.mermaidY);
  return {
    scale: Number.isFinite(scale) ? scale : 1,
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

function applyMermaidTransform(block: HTMLElement): void {
  const content = block.querySelector<HTMLElement>(".markdown-mermaid-content");
  if (content === null) return;

  const { scale, x, y } = readMermaidTransform(block);
  content.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

function setMermaidTransform(block: HTMLElement, transform: MermaidTransform): void {
  const scale = Math.min(MERMAID_MAX_SCALE, Math.max(MERMAID_MIN_SCALE, transform.scale));
  block.dataset.mermaidScale = String(scale);
  block.dataset.mermaidX = String(transform.x);
  block.dataset.mermaidY = String(transform.y);
  applyMermaidTransform(block);
}

function resetMermaidTransform(block: HTMLElement): void {
  setMermaidTransform(block, { scale: 1, x: 0, y: 0 });
}

function zoomMermaidBlock(block: HTMLElement, factor: number): void {
  const transform = readMermaidTransform(block);
  setMermaidTransform(block, {
    ...transform,
    scale: transform.scale * factor,
  });
}

function setMermaidFullscreen(block: HTMLElement, enabled: boolean, labels: MermaidLabels): void {
  block.classList.toggle("markdown-mermaid-fullscreen", enabled);
  syncMermaidToolbar(block, labels);
  if (enabled) {
    block.querySelector<HTMLElement>(".markdown-mermaid-canvas")?.focus();
  }
}

function wrapMermaidBlocks(root: HTMLElement, labels: MermaidLabels): HTMLElement[] {
  const blocks: HTMLElement[] = [];
  const mermaidCodeBlocks = Array.from(root.querySelectorAll("code.language-mermaid"));

  for (const codeElement of mermaidCodeBlocks) {
    if (codeElement.closest(".markdown-mermaid-block")) {
      continue;
    }

    const source = codeElement.textContent;
    if (source === null) continue;
    const replaceTarget = codeElement.parentElement instanceof HTMLPreElement ? codeElement.parentElement : codeElement;

    const wrapper = document.createElement("div");
    wrapper.className = "markdown-mermaid-block";
    wrapper.dataset.mermaidSource = source;
    resetMermaidTransform(wrapper);

    const canvas = document.createElement("div");
    canvas.className = "markdown-mermaid-canvas";
    canvas.tabIndex = 0;

    const surface = document.createElement("div");
    surface.className = "markdown-mermaid-surface";

    const content = document.createElement("div");
    content.className = "markdown-mermaid-content";
    content.textContent = source;
    surface.append(content);
    canvas.append(surface);

    replaceTarget.replaceWith(wrapper);
    wrapper.append(createMermaidToolbar(labels), canvas);
    blocks.push(wrapper);
  }

  blocks.push(...Array.from(root.querySelectorAll<HTMLElement>(".markdown-mermaid-block[data-mermaid-source]")));
  for (const block of blocks) {
    syncMermaidToolbar(block, labels);
    applyMermaidTransform(block);
  }
  return blocks;
}

async function renderMermaidBlocks(
  root: HTMLElement,
  theme: "light" | "dark",
  labels: MermaidLabels,
  isCancelled: () => boolean,
): Promise<void> {
  // Skip entirely — no dynamic import, no `initialize` — when the message has
  // no diagram. This is the common case for every row scrolled into view.
  if (root.querySelector("code.language-mermaid, .markdown-mermaid-block[data-mermaid-source]") === null) {
    return;
  }
  const mermaid = await ensureMermaid(theme);
  if (isCancelled()) return;
  const blocks = wrapMermaidBlocks(root, labels);

  for (const block of blocks) {
    const source = block.dataset.mermaidSource;
    const content = block.querySelector<HTMLElement>(".markdown-mermaid-content");
    if (source === undefined || content === null) continue;
    if (block.dataset.mermaidTheme === theme && block.dataset.mermaidRendered === "true") continue;

    block.dataset.mermaidTheme = theme;
    block.dataset.mermaidRendered = "false";

    try {
      const id = `timeline-mermaid-${++mermaidId}`;
      const { svg, bindFunctions } = await mermaid.render(id, source);
      if (isCancelled() || !block.isConnected) return;
      content.classList.remove("markdown-mermaid-error");
      content.innerHTML = svg;
      applyMermaidTransform(block);
      bindFunctions?.(content);
      block.dataset.mermaidRendered = "true";
    } catch {
      if (isCancelled() || !block.isConnected) return;
      block.dataset.mermaidError = "true";
      content.textContent = source;
      content.classList.add("markdown-mermaid-error");
    }
  }
}

function ExternalLinkModal({ isOpen, onClose, url }: ExternalLinkModalProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toastError(t("toast.copyFailed"));
    }
  };

  const openLink = () => {
    openExternalUrl(url).catch((error: unknown) => {
      toastError(String(error));
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-sm gap-3" showCloseButton={false}>
        <DialogTitle>{t("markdown.openExternalLink")}</DialogTitle>
        <DialogDescription className="-mt-1">{t("markdown.externalLinkWarning")}</DialogDescription>
        <div className="max-h-24 overflow-auto rounded-md border border-border-subtle bg-surface-code px-2.5 py-2 font-mono text-xs break-all text-text-secondary">
          {url}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => void copyLink()}>
            {copied ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
            {copied ? t("markdown.copied") : t("markdown.copyLink")}
          </Button>
          <DialogClose render={<Button type="button" size="sm" />} onClick={openLink}>
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {t("markdown.openLink")}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const Markdown = memo(function Markdown({ text }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mermaidDragRef = useRef<MermaidDragState | null>(null);
  const { t } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const html = useMemo(() => markdownToHtml(text), [text]);
  const copyLabels = useMemo(
    () => ({
      copied: t("markdown.copied"),
      copyCode: t("markdown.copyCode"),
    }),
    [t],
  );
  const mermaidLabels = useMemo(
    () => ({
      exitFullscreen: t("markdown.exitFullscreen"),
      resetZoom: t("markdown.resetZoom"),
      viewFullscreen: t("markdown.viewFullscreen"),
      zoomIn: t("markdown.zoomIn"),
      zoomOut: t("markdown.zoomOut"),
    }),
    [t],
  );

  // Post-processing runs AFTER paint (useEffect, not useLayoutEffect): a row
  // paints its sanitized HTML immediately, and code-block enhancement / mermaid
  // rendering follow without blocking the frame — critical when the virtualizer
  // mounts a fresh row on nearly every scroll frame.
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;

    let cancelled = false;
    enhanceCodeBlocks(root, copyLabels);
    void renderMermaidBlocks(root, resolvedTheme, mermaidLabels, () => cancelled);

    return () => {
      cancelled = true;
    };
  }, [copyLabels, html, mermaidLabels, resolvedTheme]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const root = rootRef.current;
      const fullscreenBlock = root?.querySelector<HTMLElement>(".markdown-mermaid-fullscreen");
      if (fullscreenBlock === undefined || fullscreenBlock === null) return;
      event.preventDefault();
      setMermaidFullscreen(fullscreenBlock, false, mermaidLabels);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mermaidLabels]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const copyButton = target.closest<HTMLButtonElement>("button[data-markdown-copy]");
      if (copyButton !== null && event.currentTarget.contains(copyButton)) {
        event.preventDefault();
        const block = copyButton.closest(".markdown-code-block");
        const codeElement = block?.querySelector("code");
        const code = codeElement?.textContent;
        if (code === undefined || code === null) {
          toastError(t("toast.copyFailed"));
          return;
        }

        navigator.clipboard
          .writeText(code)
          .then(() => setCopyButtonCopied(copyButton, copyLabels))
          .catch(() => {
            toastError(t("toast.copyFailed"));
          });
        return;
      }

      const mermaidButton = target.closest<HTMLButtonElement>("button[data-markdown-mermaid-action]");
      if (mermaidButton !== null && event.currentTarget.contains(mermaidButton)) {
        event.preventDefault();
        const block = mermaidButton.closest<HTMLElement>(".markdown-mermaid-block");
        if (block === null) return;

        const action = mermaidButton.dataset.markdownMermaidAction;
        if (action === "fullscreen") {
          setMermaidFullscreen(block, !block.classList.contains("markdown-mermaid-fullscreen"), mermaidLabels);
        } else if (action === "zoomIn") {
          zoomMermaidBlock(block, MERMAID_ZOOM_STEP);
        } else if (action === "zoomOut") {
          zoomMermaidBlock(block, 1 / MERMAID_ZOOM_STEP);
        } else if (action === "reset") {
          resetMermaidTransform(block);
        }
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (anchor === null || !event.currentTarget.contains(anchor)) return;
      event.preventDefault();
      setExternalUrl(anchor.getAttribute("href"));
    },
    [copyLabels, mermaidLabels, t],
  );

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const canvas = target.closest<HTMLElement>(".markdown-mermaid-canvas");
    if (canvas === null || !event.currentTarget.contains(canvas)) return;

    const block = canvas.closest<HTMLElement>(".markdown-mermaid-block");
    if (block === null) return;

    const isFullscreen = block.classList.contains("markdown-mermaid-fullscreen");
    if (!isFullscreen && !event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    zoomMermaidBlock(block, event.deltaY < 0 ? MERMAID_ZOOM_STEP : 1 / MERMAID_ZOOM_STEP);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("button")) return;

    const canvas = target.closest<HTMLElement>(".markdown-mermaid-canvas");
    if (canvas === null || !event.currentTarget.contains(canvas)) return;

    const block = canvas.closest<HTMLElement>(".markdown-mermaid-block");
    if (block === null) return;

    const transform = readMermaidTransform(block);
    mermaidDragRef.current = {
      block,
      canvas,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: transform.x,
      startY: transform.y,
    };
    canvas.classList.add("markdown-mermaid-canvas-dragging");
    canvas.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = mermaidDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setMermaidTransform(drag.block, {
      ...readMermaidTransform(drag.block),
      x: drag.startX + event.clientX - drag.startClientX,
      y: drag.startY + event.clientY - drag.startClientY,
    });
  }, []);

  const finishMermaidDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = mermaidDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    drag.canvas.classList.remove("markdown-mermaid-canvas-dragging");
    if (drag.canvas.hasPointerCapture(event.pointerId)) {
      drag.canvas.releasePointerCapture(event.pointerId);
    }
    mermaidDragRef.current = null;
  }, []);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      finishMermaidDrag(event);
    },
    [finishMermaidDrag],
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      finishMermaidDrag(event);
    },
    [finishMermaidDrag],
  );

  return (
    <div
      className="timeline-markdown min-w-0 text-base leading-relaxed text-text-primary"
      onClick={handleClick}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      ref={rootRef}
    >
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: markdownToHtml returns DOMPurify-sanitized HTML. */}
      <div className="timeline-markdown-inner" dangerouslySetInnerHTML={{ __html: html }} />
      <ExternalLinkModal isOpen={externalUrl !== null} onClose={() => setExternalUrl(null)} url={externalUrl ?? ""} />
    </div>
  );
});
