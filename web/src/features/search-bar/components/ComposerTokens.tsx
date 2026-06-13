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
export const composerTokenVariants = cva("max-w-full", {
  variants: {
    kind: {
      filter:
        "mr-0.5 inline rounded border px-1 py-0.5 border-border bg-secondary text-secondary-foreground shadow-sm transition-colors hover:border-ring hover:bg-accent",
      freeText:
        "mr-0.5 inline rounded border px-1 py-0.5 border-transparent bg-muted/70 text-foreground/90 transition-colors hover:border-border hover:bg-accent",
      operator: "font-semibold uppercase text-muted-foreground",
      paren: "text-muted-foreground",
      invalid:
        "mr-0.5 inline rounded border border-dashed px-1 py-0.5 border-destructive/70 bg-destructive/10 text-destructive transition-colors hover:border-destructive",
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
  return (
    <>
      {dash && <span className="text-muted-foreground">-</span>}
      <span data-part="field" className="text-accent-dark-blue">
        {segment.displayField}
      </span>
      <span data-part="operator" className="text-muted-foreground">
        :
      </span>
      <span data-part="value" className="text-foreground">
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
}: {
  draft: string;
  showDiagnostics: boolean;
}): React.ReactNode {
  const segments = deriveComposerSegments(draft);
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
    out.push(
      <span
        key={segment.id}
        data-testid="search-bar-token"
        data-kind={visibleKind}
        data-segment-id={segment.id}
        title={
          segment.kind === "invalid" && showDiagnostics
            ? segment.message
            : segment.raw
        }
        className={composerTokenVariants({ kind: visibleKind })}
      >
        {segment.kind === "filter" ? (
          <FilterTokenBody segment={segment} />
        ) : (
          segment.raw
        )}
      </span>,
    );
    out.push(
      <React.Fragment key={`wj:${segment.id}`}>{WORD_JOINER}</React.Fragment>,
    );
    cursor = segment.to;
  }
  if (cursor < draft.length) {
    out.push(...renderPlainText(draft.slice(cursor), `tail:${cursor}`));
  }
  return <>{out}</>;
}
