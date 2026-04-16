import { For, JSX } from "solid-js";

export function wrapHighlight(text: string, term?: string): JSX.Element {
  if (!term) return <>{text}</>;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  const lowerTerm = term.toLowerCase();

  return (
    <>
      <For each={parts}>
        {(part) =>
          part.toLowerCase() === lowerTerm ? (
            <mark class="search-highlight">{part}</mark>
          ) : (
            <>{part}</>
          )
        }
      </For>
    </>
  );
}

export function isSafeUrl(url: string): boolean {
  if (url.startsWith("/")) return true;
  try {
    const parsed = new URL(url, "https://placeholder");
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch (error) {
    console.warn("Failed to parse markdown URL:", error);
    return false;
  }
}
