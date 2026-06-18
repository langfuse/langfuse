// Segment projection — pure mapping from draft text to renderable composer
// segments.
//
// Segments are a token-level VIEW over the draft string: spans are offsets
// into the text, `raw` is the verbatim slice, and the projection never
// rewrites text. Token boundaries come from the real lexer and classification
// from the real parser + semantic validation, so the projection cannot drift
// from grammar semantics. Serialization stays separate and conservative
// (langQ.ts, edits.ts).

import type { ScoreTypeContext } from "./adapter";
import type { ASTNode, FilterNode, Span, TextNode } from "./ast";
import { lexTokens, type Diagnostic } from "./langQ";
import { validateQuery } from "./validate";

export type FilterSegment = {
  id: string;
  kind: "filter";
  from: number;
  to: number;
  raw: string;
  /** The key as the user typed it (alias/casing) — pills display this. */
  displayField: string;
  /** Parsed values — used to color numeric values distinctly. */
  values: string[];
  negated: boolean;
  editable: true;
};

export type PlainSegment = {
  id: string;
  kind: "freeText" | "operator" | "paren";
  from: number;
  to: number;
  raw: string;
  editable: boolean;
};

export type InvalidSegment = {
  id: string;
  kind: "invalid";
  from: number;
  to: number;
  raw: string;
  message: string;
  editable: true;
};

export type ComposerSegment = FilterSegment | PlainSegment | InvalidSegment;

// IDs derive from span + raw text (never array index alone) — appending
// tokens keeps earlier IDs stable; editing a token changes its own.
function segmentId(
  kind: ComposerSegment["kind"],
  span: Span,
  raw: string,
): string {
  return `${kind}:${span.from}:${raw}`;
}

// ---- AST leaf collection ----

type Leaf =
  | { span: Span; kind: "filter"; node: FilterNode; negated: boolean }
  | { span: Span; kind: "text"; node: TextNode };

function collectLeaves(node: ASTNode, text: string, out: Leaf[]): void {
  switch (node.kind) {
    case "filter":
      if (node.span)
        out.push({ span: node.span, kind: "filter", node, negated: false });
      return;
    case "text":
      if (node.span) out.push({ span: node.span, kind: "text", node });
      return;
    case "not":
      // "-env:dev" is one lexer term (the NOT span starts at the dash) → one
      // negated filter leaf. "NOT level:DEBUG" recurses: NOT is its own
      // keyword token (an operator segment), the child pills separately.
      if (
        node.child.kind === "filter" &&
        node.span &&
        text[node.span.from] === "-"
      ) {
        out.push({
          span: node.span,
          kind: "filter",
          node: node.child,
          negated: true,
        });
        return;
      }
      collectLeaves(node.child, text, out);
      return;
    case "and":
    case "or":
      for (const c of node.children) collectLeaves(c, text, out);
      return;
  }
}

function isKeywordTerm(raw: string): boolean {
  return raw === "AND" || raw === "OR" || raw === "NOT";
}

function overlappingErrors(diagnostics: Diagnostic[], span: Span): string[] {
  const messages: string[] = [];
  for (const d of diagnostics) {
    if (d.severity !== "error") continue;
    if (d.from < span.to && d.to > span.from && !messages.includes(d.message)) {
      messages.push(d.message);
    }
  }
  return messages;
}

// ---- projection ----

// One-slot memo: the composer and its consumers all derive from the same
// draft text within a render pass. Keyed on scoreTypes too, since it changes
// which `scores.<name>` tokens classify as invalid (callers pass a stable,
// memoized scoreTypes so the cache still hits across renders).
let cacheKey: string | null = null;
let cacheScoreTypes: ScoreTypeContext | undefined;
let cacheVal: ComposerSegment[] = [];

/**
 * Project `draftText` to renderable segments. Pure and total: never throws,
 * never rewrites text; every segment's `raw` is the verbatim slice of its
 * span and segments are ordered, non-overlapping, and cover every token.
 *
 * Classification per token:
 *   1. overlapped by an error diagnostic (parse OR semantic) → invalid
 *   2. parenthesis → paren, AND/OR/NOT keyword → operator (both non-editable)
 *   3. matches a filter AST leaf (incl. `-key:value` negation) → filter
 *   4. otherwise → freeText
 */
export function deriveComposerSegments(
  draftText: string,
  scoreTypes?: ScoreTypeContext,
): ComposerSegment[] {
  if (draftText === cacheKey && scoreTypes === cacheScoreTypes) return cacheVal;

  const { ast, diagnostics } = validateQuery(draftText, scoreTypes);
  const leaves: Leaf[] = [];
  if (ast !== null) collectLeaves(ast, draftText, leaves);
  const leafByFrom = new Map<number, Leaf>();
  for (const leaf of leaves) leafByFrom.set(leaf.span.from, leaf);

  const segments: ComposerSegment[] = [];
  for (const token of lexTokens(draftText)) {
    const { span } = token;
    const raw = draftText.slice(span.from, span.to);

    const messages = overlappingErrors(diagnostics, span);
    if (messages.length > 0) {
      segments.push({
        id: segmentId("invalid", span, raw),
        kind: "invalid",
        from: span.from,
        to: span.to,
        raw,
        message: messages.join("; "),
        editable: true,
      });
      continue;
    }

    if (token.type === "lparen" || token.type === "rparen") {
      segments.push({
        id: segmentId("paren", span, raw),
        kind: "paren",
        from: span.from,
        to: span.to,
        raw,
        editable: false,
      });
      continue;
    }

    if (isKeywordTerm(token.raw)) {
      segments.push({
        id: segmentId("operator", span, raw),
        kind: "operator",
        from: span.from,
        to: span.to,
        raw,
        editable: false,
      });
      continue;
    }

    const leaf = leafByFrom.get(span.from);
    if (
      leaf !== undefined &&
      leaf.kind === "filter" &&
      leaf.span.to === span.to
    ) {
      const node = leaf.node;
      segments.push({
        id: segmentId("filter", span, raw),
        kind: "filter",
        from: span.from,
        to: span.to,
        raw,
        displayField: node.rawKey ?? node.key,
        values: node.values,
        negated: leaf.negated,
        editable: true,
      });
      continue;
    }

    // Free text (and the defensive fallback for tokens the tolerant parser
    // absorbed without a matching leaf — they still render and stay editable).
    segments.push({
      id: segmentId("freeText", span, raw),
      kind: "freeText",
      from: span.from,
      to: span.to,
      raw,
      editable: true,
    });
  }

  const coalesced = coalesceFreeText(segments, draftText);
  cacheKey = draftText;
  cacheScoreTypes = scoreTypes;
  cacheVal = coalesced;
  return coalesced;
}

// Contiguous free-text words are ONE phrase semantically: they lower to a
// single `searchQuery` and the backend matches them as a contiguous substring
// (ILIKE %phrase%), not as independent AND terms. So `abc abc abc` must read as
// one chip, not three identical blocks. Merge runs of adjacent free-text
// segments (the lexer only separates them by whitespace) into a single span
// covering the whole phrase, internal spaces included.
function coalesceFreeText(
  segments: ComposerSegment[],
  text: string,
): ComposerSegment[] {
  const out: ComposerSegment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (seg.kind === "freeText" && prev?.kind === "freeText") {
      const from = prev.from;
      const to = seg.to;
      const raw = text.slice(from, to);
      out[out.length - 1] = {
        id: segmentId("freeText", { from, to }, raw),
        kind: "freeText",
        from,
        to,
        raw,
        editable: true,
      };
      continue;
    }
    out.push(seg);
  }
  return out;
}
