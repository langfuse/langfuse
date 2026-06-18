// Presentational rendering of a query draft as styled inline tokens.
//
// Pure and context-free: given the draft text, it projects it to segments
// (deriveComposerSegments — a pure parser pass) and renders the same DOM the
// contenteditable composer needs (token spans + word-joiner caret boundaries +
// verbatim whitespace). Splitting it out separates the VISUAL layer from the
// stateful contenteditable controller in SearchComposer, and makes the token
// styling a Storybook-able, prop-driven unit. Token styling lives in a `cva`
// variant; the composer passes the visible kind (invalid tokens render as
// free text until diagnostics are revealed).

import * as React from "react";
import { cva } from "class-variance-authority";

import type { ScoreTypeContext } from "@/src/features/search-bar/lib/adapter";
import {
  deriveComposerSegments,
  type FilterSegment,
} from "@/src/features/search-bar/lib/composer-segments";

// Word joiner around pills: gives the DOM caret boundaries between tokens
// without changing the query text. Stripped before the text reaches the model
// or clipboard. Shared with SearchComposer's selection math.
export const WORD_JOINER = "⁠";

// Token spans must stay NON-positioned: `position: relative` would promote the
// span's background above the editable root's in-flow paint phase (where
// Chromium draws the text caret), hiding the caret inside the token.
//
// Keep the vertical padding small (py-0.5, not py-1): WebKit/Safari sizes the
// text caret to the inline box of the pill it sits in/next to, so taller pills
// produce a caret that towers over the text. py-0.5 keeps the chip readable
// while holding the Safari caret close to the text height.
export const composerTokenVariants = cva("max-w-full", {
  variants: {
    kind: {
      filter:
        "mr-1 inline rounded border px-1.5 py-0.5 border-border bg-secondary text-secondary-foreground shadow-sm transition-colors hover:border-ring hover:bg-accent",
      freeText:
        "mr-1 inline rounded border px-1.5 py-0.5 border-transparent bg-muted/70 text-foreground/90 transition-colors hover:border-border hover:bg-accent",
      operator: "font-semibold uppercase text-qlang-keyword",
      paren: "text-muted-foreground",
      invalid:
        "mr-1 inline rounded border border-dashed px-1.5 py-0.5 border-destructive/70 bg-destructive/10 text-destructive transition-colors hover:border-destructive",
    },
  },
  defaultVariants: { kind: "freeText" },
});

type TokenKind = "filter" | "freeText" | "operator" | "paren" | "invalid";

function renderPlainText(text: string, keyPrefix: string): React.ReactNode[] {
  return text
    .split(/(\s+)/)
    .map((part, index) => (
      <React.Fragment key={`${keyPrefix}:${index}`}>{part}</React.Fragment>
    ));
}

function FilterTokenBody({ segment }: { segment: FilterSegment }) {
  const raw = segment.raw;
  const dash = segment.negated ? "-" : "";
  const body = segment.negated ? raw.slice(1) : raw;
  const colon = body.indexOf(":");
  const value = colon === -1 ? "" : body.slice(colon + 1);
  // Numeric values (latency:>2, totalTokens:100, totalCost:0.5) read as number
  // literals, not strings — color them distinctly. Grouped/text/boolean values
  // stay green.
  const numeric =
    segment.values.length > 0 &&
    segment.values.every((v) => /^-?\d+(\.\d+)?$/.test(v.trim()));
  return (
    <>
      {/* Keep the negation dash + field + colon on one line — the `-` is a
          hyphen, so a line wrap would otherwise break it away from its field.
          The value stays outside so long grouped values can still wrap. */}
      <span className="whitespace-nowrap">
        {dash && <span className="text-muted-foreground">-</span>}
        <span data-part="field" className="text-qlang-field">
          {segment.displayField}
        </span>
        <span data-part="operator" className="text-muted-foreground">
          :
        </span>
      </span>
      <span
        data-part="value"
        className={numeric ? "text-qlang-number" : "text-qlang-value"}
      >
        {value}
      </span>
    </>
  );
}

/**
 * Render `draft` as styled tokens. `showDiagnostics` controls whether invalid
 * tokens render in the error style or fall back to plain free-text styling
 * (the composer hides token errors until a commit is attempted).
 */
export function ComposerTokens({
  draft,
  showDiagnostics,
  scoreTypes,
}: {
  draft: string;
  showDiagnostics: boolean;
  scoreTypes?: ScoreTypeContext;
}): React.ReactNode {
  const segments = deriveComposerSegments(draft, scoreTypes);
  const out: React.ReactNode[] = [];
  let cursor = 0;
  for (const segment of segments) {
    if (segment.from > cursor) {
      out.push(
        ...renderPlainText(draft.slice(cursor, segment.from), `ws:${cursor}`),
      );
    }
    const visibleKind: TokenKind =
      segment.kind === "invalid" && !showDiagnostics
        ? "freeText"
        : segment.kind;
    // Invalid tokens get the styled per-token error tooltip (a positioned
    // overlay in SearchComposer), not the native browser title. Free text is a
    // full-text search — say so on hover so a standalone text chip explains
    // itself instead of looking like a stray block.
    const title =
      segment.kind === "invalid"
        ? undefined
        : segment.kind === "freeText"
          ? `Full-text search — matches results containing "${segment.raw}". Searches ids, names, input and output by default; use input: or output: to search one payload, or name:/id: to narrow.`
          : segment.raw;
    out.push(
      <span
        key={segment.id}
        data-testid="search-bar-token"
        data-kind={visibleKind}
        data-segment-id={segment.id}
        title={title}
        className={composerTokenVariants({ kind: visibleKind })}
      >
        {segment.kind === "filter" ? (
          <FilterTokenBody segment={segment} />
        ) : (
          segment.raw
        )}
        {/* Word-joiner INSIDE the pill. The caret at the token's trailing edge
            lands on this joiner, which sits BEFORE the pill's right padding — so
            WebKit/Safari paints the caret inside the pill at the glyph instead
            of past the chrome. A sibling joiner (outside the span) made Safari
            paint the caret past the padding + margin (the "caret renders outside
            the block" bug). */}
        {WORD_JOINER}
      </span>,
    );
    cursor = segment.to;
  }
  if (cursor < draft.length) {
    out.push(...renderPlainText(draft.slice(cursor), `tail:${cursor}`));
  }
  return <>{out}</>;
}
