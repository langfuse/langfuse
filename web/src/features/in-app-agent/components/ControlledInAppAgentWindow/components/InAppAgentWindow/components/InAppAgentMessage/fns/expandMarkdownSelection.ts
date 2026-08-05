import { findClosingMarkdownLinkDestination } from "./findClosingMarkdownLinkDestination";
import { getMarkdownBlockPrefixLength } from "./getMarkdownBlockPrefixLength";

export function expandMarkdownSelection(
  markdown: string,
  initialStart: number,
  initialEnd: number,
) {
  return (
    expandLinkSelection(markdown, initialStart, initialEnd) ??
    expandBlockPrefixSelection(markdown, initialStart, initialEnd) ?? {
      start: initialStart,
      end: initialEnd,
    }
  );
}

function expandLinkSelection(markdown: string, start: number, end: number) {
  const openBracket = markdown.lastIndexOf("[", start);
  if (openBracket === -1 || openBracket + 1 !== start) {
    return null;
  }

  const closeBracket = markdown.indexOf("]", end);
  if (closeBracket !== end || markdown[closeBracket + 1] !== "(") {
    return null;
  }

  const closeParen = findClosingMarkdownLinkDestination(
    markdown,
    closeBracket + 2,
  );
  if (closeParen === -1) {
    return null;
  }

  return { start: openBracket, end: closeParen + 1 };
}

function expandBlockPrefixSelection(
  markdown: string,
  start: number,
  end: number,
) {
  const lineStart = markdown.lastIndexOf("\n", start - 1) + 1;
  const prefixLength = getMarkdownBlockPrefixLength(markdown.slice(lineStart));

  if (prefixLength === 0 || lineStart + prefixLength !== start) {
    return null;
  }

  return { start: lineStart, end };
}
