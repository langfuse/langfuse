// Editor AST for the search-bar query language: a discriminated union
// expression tree produced by the grammar parser (langQ.ts). This is the
// *editor* representation — the table-facing contract is the flat
// `FilterState` from @langfuse/shared, derived via adapter.ts.
//
// Leaf nodes carry their source span so structured edits (chip removal)
// can rewrite the smallest relevant slice of the committed text instead of
// reserializing the whole query.

export type Span = { from: number; to: number };

// Filter operators: '=' is the per-field default (any-of / contains),
// 'exact' is the explicit `key:=v` string/number equality. The text-match ops
// are surfaced as positional `*` globs — '~' contains (`*v*`), '^' starts-with
// (`v*`), '$' ends-with (`*v`) — plus the comparisons. (The op names stay
// `~`/`^`/`$` internally; only the typed/serialized syntax is glob.)
export type CompareOp =
  | "="
  | "exact"
  | "~"
  | "^"
  | "$"
  | ">"
  | "<"
  | ">="
  | "<=";

export type AndNode = { kind: "and"; children: ASTNode[]; parenSpan?: Span };
export type OrNode = { kind: "or"; children: ASTNode[]; parenSpan?: Span };
export type NotNode = {
  kind: "not";
  child: ASTNode;
  span?: Span;
  parenSpan?: Span;
};
export type FilterNode = {
  kind: "filter";
  /** Canonical field id (registry-resolved) or `metadata.<key>`. */
  key: string;
  /** The key as the user typed it (alias/casing) — serializer prefers it. */
  rawKey?: string;
  op: CompareOp;
  /** Comma list for '='; exactly one entry for comparison ops. */
  values: string[];
  /** How grouped values combine: `key:(a OR b)` any-of (default) vs
   *  `key:(a AND b)` all-of — the arrayOptions "all of" operator. */
  valueOp?: "or" | "and";
  span?: Span;
  /** When the node was the sole content of a paren group: span incl. parens. */
  parenSpan?: Span;
};
export type TextNode = {
  kind: "text";
  value: string;
  quoted?: boolean;
  span?: Span;
  parenSpan?: Span;
};

export type ASTNode = AndNode | OrNode | NotNode | FilterNode | TextNode;

// ---- helpers ----

function spanEq(a: Span | undefined, b: Span): boolean {
  return a !== undefined && a.from === b.from && a.to === b.to;
}

/** Semantic equality — ignores spans, parens, rawKey/quoted presentation. */
export function astEquals(a: ASTNode | null, b: ASTNode | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "filter": {
      const o = b as FilterNode;
      return (
        a.key === o.key &&
        a.op === o.op &&
        (a.valueOp ?? "or") === (o.valueOp ?? "or") &&
        a.values.length === o.values.length &&
        a.values.every((v, i) => v === o.values[i])
      );
    }
    case "text":
      return a.value === (b as TextNode).value;
    case "not":
      return astEquals(a.child, (b as NotNode).child);
    case "and":
    case "or": {
      const o = b as AndNode | OrNode;
      return (
        a.children.length === o.children.length &&
        a.children.every((c, i) => astEquals(c, o.children[i]!))
      );
    }
  }
}

/**
 * AST surgery: remove the node identified by `target` (matching its span or
 * parenSpan). Collapsing rules keep the tree valid: a NOT whose child is
 * removed disappears; groups drop to their single remaining child; empty
 * groups become null. Used as the reserialize fallback when a span-splice
 * would produce invalid text.
 */
export function removeNodeBySpan(node: ASTNode, target: Span): ASTNode | null {
  const ownSpan =
    node.kind === "and" || node.kind === "or" ? undefined : node.span;
  if (spanEq(ownSpan, target) || spanEq(node.parenSpan, target)) return null;
  switch (node.kind) {
    case "filter":
    case "text":
      return node;
    case "not": {
      const child = removeNodeBySpan(node.child, target);
      if (child === null) return null;
      return child === node.child ? node : { ...node, child };
    }
    case "and":
    case "or": {
      const kept: ASTNode[] = [];
      let changed = false;
      for (const c of node.children) {
        const r = removeNodeBySpan(c, target);
        if (r === null) changed = true;
        else {
          if (r !== c) changed = true;
          kept.push(r);
        }
      }
      if (!changed) return node;
      if (kept.length === 0) return null;
      if (kept.length === 1) return kept[0]!;
      return { ...node, children: kept };
    }
  }
}
