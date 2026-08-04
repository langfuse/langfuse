import { getMarkdownBlockPrefixLength } from "./getMarkdownBlockPrefixLength";
import { findClosingMarkdownLinkDestination } from "./findClosingMarkdownLinkDestination";

function getMarkdownLinkAtStart(markdown: string, start: number) {
  if (markdown[start] !== "[") {
    return null;
  }

  const closeBracket = markdown.indexOf("]", start + 1);
  if (closeBracket === -1 || closeBracket === start + 1) {
    return null;
  }

  const destinationStart = closeBracket + 2;
  if (markdown[closeBracket + 1] !== "(") {
    return null;
  }

  const destinationEnd = findClosingMarkdownLinkDestination(
    markdown,
    destinationStart,
  );
  if (destinationEnd === -1) {
    return null;
  }

  return {
    labelStart: start + 1,
    labelEnd: closeBracket,
    end: destinationEnd + 1,
  };
}

export function projectMarkdownToRenderedText(markdown: string) {
  let plain = "";
  const sourceByPlainIndex: number[] = [];
  let index = 0;
  let isAtLineStart = true;
  let isInFence = false;

  const append = (character: string, sourceIndex: number) => {
    plain += character;
    sourceByPlainIndex.push(sourceIndex);
    isAtLineStart = character === "\n";
  };

  while (index < markdown.length) {
    const remaining = markdown.slice(index);

    if (isAtLineStart) {
      const fenceMatch = remaining.match(/^```[^\n]*(?:\n|$)/);
      if (fenceMatch) {
        if (
          !isInFence &&
          !hasClosingMarkdownFence(markdown, index + fenceMatch[0].length)
        ) {
          index += fenceMatch[0].length;
          isAtLineStart = true;
          continue;
        }

        isInFence = !isInFence;
        index += fenceMatch[0].length;
        continue;
      }
    }

    if (isInFence) {
      append(markdown[index] ?? "", index);
      index += 1;
      continue;
    }

    if (isAtLineStart) {
      const blockPrefixLength = getMarkdownBlockPrefixLength(remaining);
      if (blockPrefixLength > 0) {
        index += blockPrefixLength;
        isAtLineStart = false;
        continue;
      }
    }

    const link = getMarkdownLinkAtStart(markdown, index);

    if (link) {
      for (
        let labelIndex = link.labelStart;
        labelIndex < link.labelEnd;
        labelIndex++
      ) {
        append(markdown[labelIndex] ?? "", labelIndex);
      }
      index = link.end;
      isAtLineStart = false;
      continue;
    }

    const markerMatch = remaining.match(/^(?:\*\*|__|~~|`|\*|_)/);
    if (markerMatch) {
      index += markerMatch[0].length;
      isAtLineStart = false;
      continue;
    }

    append(markdown[index] ?? "", index);
    index += 1;
  }

  return { plain, sourceByPlainIndex };
}

function hasClosingMarkdownFence(markdown: string, start: number) {
  return /(?:^|\n)```[^\n]*(?:\n|$)/.test(markdown.slice(start));
}

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
