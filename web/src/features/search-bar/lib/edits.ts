// Span-local structured edits over query text, with an AST-surgery fallback.
//
// Primary path: rewrite the smallest relevant slice of the text, preserving
// the user's aliases and surrounding formatting. Every result is re-parsed;
// if a splice would leave invalid text (removing a token from inside a group,
// stranding empty parens, …) the edit falls back to AST surgery + canonical
// reserialize — structured edits NEVER produce an uncommittable string.

import type { ASTNode, Span } from "./ast";
import { astEquals, removeNodeBySpan } from "./ast";
import { findClosingQuote, parse, serialize } from "./langQ";

function spliceSpan(
  text: string,
  from: number,
  to: number,
  replacement: string,
): string {
  let start = from;
  let end = to;
  if (replacement === "") {
    // Swallow one adjacent separator space so we don't leave double gaps.
    if (start > 0 && text[start - 1] === " ") start--;
    else if (end < text.length && text[end] === " ") end++;
  }
  return (text.slice(0, start) + replacement + text.slice(end)).trim();
}

/**
 * Splice, then verify; fall back to AST surgery when the splice is unsafe.
 *
 * A parse check alone is not enough: a splice can stay syntactically valid yet
 * change the semantics of the *untouched* subtrees. Removing `level:ERROR`
 * from `NOT level:ERROR env:dev` splices to `NOT env:dev`, which parses — but
 * the orphaned `NOT` keyword re-binds to `env:dev` and silently flips its
 * polarity. So accept the splice only when it reparses into the same AST as
 * the surgical removal (which collapses the stranded `NOT`); otherwise
 * reserialize the surgery result.
 */
function removeWithFallback(text: string, ast: ASTNode, span: Span): string {
  const surgical = removeNodeBySpan(ast, span);
  const spliced = spliceSpan(text, span.from, span.to, "");
  const reparsed = parse(spliced);
  if (reparsed.valid && astEquals(reparsed.ast, surgical)) return spliced;
  return serialize(surgical);
}

function scanParenPairs(text: string): Array<{ open: number; close: number }> {
  const stack: number[] = [];
  const pairs: Array<{ open: number; close: number }> = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') {
      const close = findClosingQuote(text, i);
      i = close === -1 ? text.length : close + 1;
      continue;
    }
    if (c === "(") stack.push(i);
    else if (c === ")") {
      const open = stack.pop();
      if (open !== undefined) pairs.push({ open, close: i });
    }
    i++;
  }
  return pairs;
}

/** Collapse whitespace runs to single spaces — never inside quotes. */
function collapseSpacesOutsideQuotes(text: string): string {
  let out = "";
  let pendingSpace = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (/\s/.test(c)) {
      pendingSpace = true;
      i++;
      continue;
    }
    if (pendingSpace && out.length > 0) out += " ";
    pendingSpace = false;
    if (c === '"') {
      const close = findClosingQuote(text, i);
      const end = close === -1 ? text.length : close + 1;
      out += text.slice(i, end);
      i = end;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Normalize a structured-edit result: collapse whitespace and strip paren
 * pairs that are PROVABLY redundant — a pair is removed only when the text
 * still parses and the AST is structurally identical, so necessary grouping
 * can never be lost. Only structured edits normalize; typed text is
 * preserved as-is.
 */
export function tidyQueryText(text: string): string {
  let current = collapseSpacesOutsideQuotes(text).trim();
  let parsed = parse(current);
  if (!parsed.valid) return current;

  let changed = true;
  while (changed) {
    changed = false;
    for (const { open, close } of scanParenPairs(current)) {
      const candidate = collapseSpacesOutsideQuotes(
        current.slice(0, open) +
          current.slice(open + 1, close) +
          current.slice(close + 1),
      ).trim();
      const res = parse(candidate);
      if (res.valid && astEquals(res.ast, parsed.ast)) {
        current = candidate;
        parsed = res;
        changed = true;
        break; // pair indices shifted — rescan
      }
    }
  }
  return current;
}

function findParenExtent(node: ASTNode, target: Span): Span | null {
  const ownSpan =
    node.kind === "and" || node.kind === "or" ? undefined : node.span;
  if (
    ownSpan !== undefined &&
    ownSpan.from === target.from &&
    ownSpan.to === target.to
  ) {
    return node.parenSpan ?? null;
  }
  switch (node.kind) {
    case "filter":
    case "text":
      return null;
    case "not":
      return findParenExtent(node.child, target);
    case "and":
    case "or":
      for (const c of node.children) {
        const found = findParenExtent(c, target);
        if (found !== null) return found;
      }
      return null;
  }
}

/**
 * Remove the token at `span` from `text` (composer pill × / keyboard
 * removal). Span-local splice first; AST surgery + reserialize when the
 * splice would not reparse.
 */
export function removeToken(text: string, span: Span): string {
  const { ast } = parse(text);
  if (ast === null) return text;
  // Prefer the paren extent when the span identifies a parenthesized node.
  const target = findParenExtent(ast, span) ?? span;
  return tidyQueryText(removeWithFallback(text, ast, target));
}
