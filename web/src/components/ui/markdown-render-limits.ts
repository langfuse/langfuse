// Safety limits for rendering user/model content as GFM markdown.
//
// react-markdown parses content to an mdast tree and then walks it recursively
// (mdast -> hast conversion and remark plugins such as remark-gfm's
// autolink-literal, via unist-util-visit). That walk recurses once per level of
// *nesting depth*. Deeply nested markdown — e.g. long blockquote chains
// (`> > > …`), nested lists, or long emphasis runs (`***…`) — therefore recurses
// as deep as the tree and can overflow the JS call stack. Firefox's stack is much
// smaller than Chrome's, so the same payload throws `InternalError: too much
// recursion` in Firefox while rendering fine in Chrome.
//
// Byte size alone does not predict this: a flat multi-hundred-KB payload never
// overflows, while a few KB of deeply nested markdown does. Even parsing such
// input to *measure* its depth is unsafe — micromark's parser recurses too and
// overflows on the same pathological input. So the depth check below is a single
// pass, non-recursive scan that can never itself overflow.

// Cheap preempt: individual strings larger than this are rendered as plain text
// instead of markdown. Mirrors MARKDOWN_RENDER_CHARACTER_LIMIT (the caller-side
// input+output+messages gate) as a per-string backstop for surfaces that do not
// apply that gate (e.g. comments), and avoids scanning/rendering huge blobs.
export const MARKDOWN_MAX_RENDER_BYTES = 150_000;

// Content whose estimated markdown nesting depth exceeds this is rendered as
// plain text. Legitimate markdown nests <20-30 levels deep; a stack-overflowing
// payload needs hundreds+, so this threshold sits in a wide safe band.
export const MARKDOWN_MAX_NESTING_DEPTH = 100;

const isListBullet = (char: string): boolean =>
  char === "-" || char === "+" || char === "*";

const isEmphasisDelimiter = (char: string): boolean =>
  char === "*" || char === "_" || char === "~";

const isSpace = (char: string): boolean => char === " " || char === "\t";

/**
 * Returns a cheap, non-recursive over-estimate of the maximum markdown nesting
 * depth in `content`. It is a safe upper bound for the byte-cheap vectors that
 * can overflow a small stack without being large (blockquotes and emphasis
 * runs); byte-expensive vectors (deep multi-line lists) are additionally bounded
 * by the size preempt. Over-estimating is safe (worst case: content falls back
 * to plain text); the scan never under-counts a pure blockquote chain.
 */
export function estimateMarkdownNestingDepth(content: string): number {
  let maxDepth = 0;
  let atLineStart = true;

  // Leading container markers per line: each `>`, list bullet, or ordered-list
  // marker opens a nesting level, plus a term for indentation-based list nesting.
  let lineDepth = 0;
  let leadingWhitespace = 0;
  let inLeadingMarkers = false;

  // Longest run of the same emphasis/strikethrough delimiter, an upper bound on
  // inline emphasis nesting depth.
  let runChar = "";
  let runLength = 0;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === "\n") {
      atLineStart = true;
      lineDepth = 0;
      leadingWhitespace = 0;
      runChar = "";
      runLength = 0;
      continue;
    }

    if (atLineStart) {
      if (isSpace(char)) {
        leadingWhitespace++;
        inLeadingMarkers = true;
        continue;
      }
      if (char === ">") {
        lineDepth++;
        const depth = lineDepth + Math.floor(leadingWhitespace / 2);
        if (depth > maxDepth) maxDepth = depth;
        inLeadingMarkers = true;
        continue;
      }
      // A list bullet or ordered marker only opens a level when followed by
      // whitespace (or end of content); otherwise it is emphasis / plain text.
      const next = content[i + 1];
      const followedByWs = next === undefined || isSpace(next) || next === "\n";
      if (isListBullet(char) && followedByWs) {
        lineDepth++;
        const depth = lineDepth + Math.floor(leadingWhitespace / 2);
        if (depth > maxDepth) maxDepth = depth;
        inLeadingMarkers = true;
        continue;
      }
      // Leading markers ended for this line; account for indentation depth once
      // more (covers indented content with no explicit bullet) then fall through
      // to inline scanning of the rest of the line.
      if (inLeadingMarkers) {
        const depth = lineDepth + Math.floor(leadingWhitespace / 2);
        if (depth > maxDepth) maxDepth = depth;
      }
      atLineStart = false;
      inLeadingMarkers = false;
    }

    // Inline emphasis / strikethrough delimiter runs.
    if (isEmphasisDelimiter(char)) {
      if (char === runChar) {
        runLength++;
      } else {
        runChar = char;
        runLength = 1;
      }
      if (runLength > maxDepth) maxDepth = runLength;
    } else {
      runChar = "";
      runLength = 0;
    }
  }

  return maxDepth;
}

/**
 * Whether `content` should be rendered as plain text rather than parsed as GFM
 * markdown, to avoid stack-overflow crashes on pathologically large or deeply
 * nested payloads. See the module header for the mechanism.
 */
export function exceedsMarkdownRenderLimits(content: string): boolean {
  if (content.length > MARKDOWN_MAX_RENDER_BYTES) return true;
  return estimateMarkdownNestingDepth(content) > MARKDOWN_MAX_NESTING_DEPTH;
}
