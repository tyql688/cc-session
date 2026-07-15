export const MERMAID_THEME_VARIABLES = {
  light: {
    darkMode: false,
    background: "#ffffff",
    primaryColor: "#e8f2ff",
    primaryBorderColor: "#6a9ed6",
    primaryTextColor: "#1d1d1f",
    secondaryColor: "#e8f7ef",
    secondaryBorderColor: "#67a886",
    secondaryTextColor: "#1d1d1f",
    tertiaryColor: "#f2edff",
    tertiaryBorderColor: "#9482bd",
    tertiaryTextColor: "#1d1d1f",
    lineColor: "#66717f",
    arrowheadColor: "#66717f",
    defaultLinkColor: "#66717f",
    textColor: "#1d1d1f",
    mainBkg: "#e8f2ff",
    nodeBorder: "#6a9ed6",
    nodeTextColor: "#1d1d1f",
    clusterBkg: "#f6f8fb",
    clusterBorder: "#aeb8c5",
    edgeLabelBackground: "#ffffff",
    titleColor: "#1d1d1f",
    noteBkgColor: "#fff4cf",
    noteBorderColor: "#d0a736",
    noteTextColor: "#3a300d",
    activationBkgColor: "#dcecff",
    activationBorderColor: "#6a9ed6",
    actorLineColor: "#6a9ed6",
    signalColor: "#456f9e",
    signalTextColor: "#1d1d1f",
    sequenceNumberColor: "#ffffff",
    altSectionBkgColor: "#f6f8fb",
    gridColor: "#c5cbd3",
    taskTextClickableColor: "#0969da",
    pieStrokeColor: "#ffffff",
    pieOuterStrokeColor: "#66717f",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: "15px",
    useGradient: false,
    dropShadow: "none",
  },
  dark: {
    darkMode: true,
    background: "#191b20",
    primaryColor: "#27384f",
    primaryBorderColor: "#5f91cf",
    primaryTextColor: "#f1f3f5",
    secondaryColor: "#233d35",
    secondaryBorderColor: "#5d9f82",
    secondaryTextColor: "#f1f3f5",
    tertiaryColor: "#362f4c",
    tertiaryBorderColor: "#8d78b8",
    tertiaryTextColor: "#f1f3f5",
    lineColor: "#aeb6c2",
    arrowheadColor: "#aeb6c2",
    defaultLinkColor: "#aeb6c2",
    textColor: "#f1f3f5",
    mainBkg: "#27384f",
    nodeBorder: "#5f91cf",
    nodeTextColor: "#f1f3f5",
    clusterBkg: "#22252c",
    clusterBorder: "#59616d",
    edgeLabelBackground: "#191b20",
    titleColor: "#f1f3f5",
    noteBkgColor: "#40391f",
    noteBorderColor: "#b6993e",
    noteTextColor: "#f6e8ad",
    activationBkgColor: "#27384f",
    activationBorderColor: "#5f91cf",
    actorLineColor: "#5f91cf",
    signalColor: "#8fb8e8",
    signalTextColor: "#f1f3f5",
    sequenceNumberColor: "#172033",
    altSectionBkgColor: "#22252c",
    gridColor: "#4a525e",
    taskTextClickableColor: "#7fbdff",
    pieStrokeColor: "#191b20",
    pieOuterStrokeColor: "#aeb6c2",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: "15px",
    useGradient: false,
    dropShadow: "none",
  },
} as const;

export function mountMermaidSvg(content: HTMLElement, svgMarkup: string): void {
  const parsed = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const parsedSvg = parsed.documentElement;
  if (parsedSvg.namespaceURI !== "http://www.w3.org/2000/svg" || parsedSvg.tagName.toLowerCase() !== "svg") {
    throw new Error("Mermaid did not return an SVG document");
  }
  const svg = document.importNode(parsedSvg, true);

  // WKWebView can leave a <style> inside dynamically inserted SVG unapplied,
  // which turns every shape and connector into the SVG defaults (black). Mirror
  // Mermaid's complete, id-scoped stylesheet into HTML while keeping the SVG's
  // original style so exported markup remains self-contained.
  const stylesheet = document.createElement("style");
  stylesheet.dataset.mermaidStylesheet = "";
  stylesheet.textContent = Array.from(svg.querySelectorAll("style"), (style) => style.textContent ?? "").join("\n");
  content.replaceChildren(stylesheet, svg);
}
