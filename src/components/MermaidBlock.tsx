import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n/index";
import { normalizeMermaidCode } from "../lib/mermaidNormalize";
import { useTheme } from "../stores/theme";
import { CodeBlock } from "./CodeBlock";

let mermaidMod: typeof import("mermaid").default | null = null;
let renderCounter = 0;

function resolveIsDark(themeValue: string, systemDark: boolean): boolean {
  if (themeValue === "dark") return true;
  if (themeValue === "light") return false;
  return systemDark;
}

export function MermaidBlock({ code }: { code: string }) {
  const { t } = useI18n();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const themeValue = useTheme();

  // OS-level dark mode preference — re-renders Mermaid when the user
  // is on `theme: "system"` and toggles their OS theme.
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const systemDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = (e: MediaQueryListEvent) =>
      setSystemDark(e.matches);
    systemDarkQuery.addEventListener("change", onSystemThemeChange);
    return () =>
      systemDarkQuery.removeEventListener("change", onSystemThemeChange);
  }, []);

  const renderDiagram = useCallback(async (code: string, dark: boolean) => {
    try {
      if (!mermaidMod) {
        const mod = await import("mermaid");
        mermaidMod = mod.default;
      }
      // Mermaid is a global singleton: re-initialize every render so
      // the latest theme wins. (Multiple MermaidBlocks on the same
      // page may briefly disagree on theme during a switch — that's
      // OK because each effect run also re-renders the SVG below.)
      mermaidMod.initialize({
        startOnLoad: false,
        theme: dark ? "dark" : "default",
        securityLevel: "strict",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      });
      const id = `mermaid-render-${++renderCounter}`;
      // Normalise quirky AI-generated mermaid (e.g. bare Chinese on
      // quadrantChart's title/axis/quadrant keywords) before render —
      // see lib/mermaidNormalize.ts for the rules. No-op for already-
      // well-formed code and for diagram types other than quadrantChart.
      const normalized = normalizeMermaidCode(code);
      const { svg } = await mermaidMod.render(id, normalized);
      setHtml(svg);
      setError(false);
    } catch (e) {
      console.warn("Mermaid render failed:", e);
      setError(true);
    }
  }, []);

  // Re-render on code change OR theme change. createEffect subscribes
  // to every signal it reads on first run, so accessing props.code,
  // theme(), and systemDark() here is enough to re-fire on any of them.
  useEffect(() => {
    const dark = resolveIsDark(themeValue, systemDark);
    void renderDiagram(code, dark);
  }, [code, themeValue, systemDark, renderDiagram]);

  return !error ? (
    <div className="mermaid-block">
      <div className="mermaid-toolbar">
        <button
          className="mermaid-toggle"
          onClick={() => setShowSource((v) => !v)}
        >
          {showSource ? t("common.viewDiagram") : t("common.viewSource")}
        </button>
      </div>
      {/* Security: innerHTML is used here to render Mermaid SVG output.
          Mermaid's "strict" securityLevel sanitizes the SVG (removes scripts,
          foreign objects, and event handlers), so this is considered safe. */}
      {showSource ? (
        <CodeBlock code={code} language="mermaid" />
      ) : (
        <div
          className="mermaid-diagram"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid "strict" securityLevel sanitizes the SVG (see comment above)
          dangerouslySetInnerHTML={{ __html: html || "" }}
        />
      )}
    </div>
  ) : (
    <CodeBlock code={code} language="mermaid" />
  );
}
