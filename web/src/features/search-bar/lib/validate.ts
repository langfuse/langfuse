// Semantic validation — the single "is this committable" gate.
//
// The tolerant parser accepts structurally-fine input that the flat Langfuse
// filter contract cannot represent (cross-field OR, junk values for typed
// fields, negations with no counterpart…). Commit must gate on BOTH, with
// span-carrying diagnostics so the editor can underline the offending token.
//
// Parity with the adapter is by construction: each top-level node is lowered
// through the real adapter and its errors become diagnostics at that node's
// span. `valid === true` therefore guarantees astToFilterState() lowers the
// whole query without errors.

import type { ASTNode, Span } from "./ast";
import { astToFilterState, type ScoreTypeContext } from "./adapter";
import { nullableFields, resolveField } from "./fields";
import { parse, type Diagnostic, type ParseResult } from "./langQ";

export const MAX_QUERY_LENGTH = 2048;

function nodeSpan(node: ASTNode, textLength: number): Span {
  if (node.kind === "and" || node.kind === "or") {
    if (node.parenSpan) return node.parenSpan;
    const first = node.children[0];
    const last = node.children[node.children.length - 1];
    if (first && last) {
      return {
        from: nodeSpan(first, textLength).from,
        to: nodeSpan(last, textLength).to,
      };
    }
    return { from: 0, to: textLength };
  }
  return node.parenSpan ?? node.span ?? { from: 0, to: textLength };
}

const NULLABLE_FIELD_IDS = new Set(nullableFields().map((f) => f.id));

/**
 * `has:` on a column that always has a value matches everything — and its
 * negation (`-has:` / `NOT has:`) lowers to `IS NULL`, which is vacuously
 * false on a non-nullable column, so it matches nothing. `negated` tracks
 * polarity through `NOT` so the warning states the right side.
 */
function hasFilterWarnings(
  node: ASTNode,
  textLength: number,
  out: Diagnostic[],
  negated = false,
): void {
  switch (node.kind) {
    case "filter": {
      const ref = resolveField(node.key);
      if (ref === null || ref.type !== "pseudo" || ref.id !== "has") return;
      for (const v of node.values) {
        const target = resolveField(v);
        if (
          target !== null &&
          target.type === "field" &&
          !NULLABLE_FIELD_IDS.has(target.field.id)
        ) {
          const span = nodeSpan(node, textLength);
          out.push({
            from: span.from,
            to: span.to,
            severity: "warning",
            message: negated
              ? `"${target.field.id}" always has a value — this filter matches nothing`
              : `"${target.field.id}" always has a value — this filter matches everything`,
          });
        }
      }
      return;
    }
    case "text":
      return;
    case "not":
      hasFilterWarnings(node.child, textLength, out, !negated);
      return;
    case "and":
    case "or":
      for (const c of node.children)
        hasFilterWarnings(c, textLength, out, negated);
      return;
  }
}

export function semanticDiagnostics(
  ast: ASTNode | null,
  textLength: number,
  scoreTypes?: ScoreTypeContext,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (ast === null) return out;

  // Lower each top-level node independently so error spans point at the
  // offending node instead of the whole query. The lowering must see the same
  // scoreTypes the commit-time lowering does, or the two disagree on score
  // routing and a clean validation hides an error the commit then drops.
  const topLevel: ASTNode[] = ast.kind === "and" ? ast.children : [ast];
  for (const node of topLevel) {
    const { errors } = astToFilterState(node, scoreTypes);
    const span = nodeSpan(node, textLength);
    for (const message of errors) {
      out.push({ from: span.from, to: span.to, severity: "error", message });
    }
    hasFilterWarnings(node, textLength, out);
  }

  return out;
}

/**
 * The parser and the adapter both run the same operator-/field-validity checks
 * (operatorIssue, ref resolution), so a single filter typo surfaces twice once
 * the two lists are merged — and the composer joins all messages into the
 * global tooltip + aria-live region, announcing it twice. parse() already
 * dedupes its own list by exact span+message, but the parser anchors the
 * unknown-field diagnostic at the key span (`xyz`) while the adapter wraps at
 * the full term span (`xyz:1`), so an exact key misses that pair. Drop a later
 * diagnostic whose severity+message duplicates an earlier kept one AND whose
 * span overlaps it — two distinct tokens never overlap, so per-token underlines
 * are preserved.
 */
function dedupeMergedDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const kept: Diagnostic[] = [];
  for (const d of diagnostics) {
    const dup = kept.some(
      (k) =>
        k.severity === d.severity &&
        k.message === d.message &&
        k.from < d.to &&
        d.from < k.to,
    );
    if (!dup) kept.push(d);
  }
  return kept;
}

/**
 * parse() + semantic checks + length cap, merged. `valid === true` guarantees
 * the adapter can lower the query — the one commit gate. `scoreTypes` must
 * match what the commit-time lowering uses so the two stay in parity.
 */
export function validateQuery(
  text: string,
  scoreTypes?: ScoreTypeContext,
): ParseResult {
  const res = parse(text);
  const diagnostics = dedupeMergedDiagnostics([
    ...res.diagnostics,
    ...semanticDiagnostics(res.ast, text.length, scoreTypes),
  ]);
  if (text.length > MAX_QUERY_LENGTH) {
    diagnostics.push({
      from: 0,
      to: text.length,
      severity: "error",
      message: `Query is too long (${text.length} chars, max ${MAX_QUERY_LENGTH})`,
    });
  }
  return {
    ast: res.ast,
    diagnostics,
    valid: !diagnostics.some((d) => d.severity === "error"),
  };
}
