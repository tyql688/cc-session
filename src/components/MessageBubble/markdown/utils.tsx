import { Fragment, type JSX } from "react";
import { isExternalUrl } from "../../../lib/external-links";

export function wrapHighlight(text: string, term?: string): JSX.Element {
  if (!term) return <>{text}</>;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  const lowerTerm = term.toLowerCase();

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === lowerTerm ? (
          <mark key={index} className="search-highlight">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function isSafeUrl(url: string): boolean {
  return isExternalUrl(url);
}
