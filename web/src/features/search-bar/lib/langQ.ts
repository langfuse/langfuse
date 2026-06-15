// Search-bar query language: tolerant hand-rolled lexer + recursive-descent
// parser and the canonical serializer.
//
// Grammar (no time tokens — the table's date range picker owns time):
//   expr      := orExpr
//   orExpr    := andExpr (OR andExpr)*
//   andExpr   := unary ((AND)? unary)*            -- implicit AND on adjacency
//   unary     := NOT unary | '-'term | '(' expr ')' | term
//   term      := key ':' valueExpr | freeText
//   valueExpr := ('>'|'<'|'>='|'<=') scalar | '=' scalar | globValue | '(' value (OR value)* ')'
//   globValue := value with optional leading/trailing '*' wildcards:
//                'v*' starts-with, '*v' ends-with, '*v*' contains, 'v' default
//
// The parser NEVER throws. It returns an AST (best-effort on broken input)
// plus diagnostics with source spans; severity 'error' blocks commit, the
// editor renders them as underlines. The parser accepts MORE than the flat
// Langfuse filter contract can represent (e.g. cross-field OR) — those forms
// are rejected with targeted messages in validate.ts, not here.

import type { ASTNode, CompareOp, FilterNode, Span, TextNode } from "./ast";
import { canonicalKey, operatorIssue, resolveField } from "./fields";

export type Diagnostic = {
  from: number;
  to: number;
  severity: "error" | "warning";
  message: string;
};

export type ParseResult = {
  ast: ASTNode | null;
  diagnostics: Diagnostic[];
  /** true when there are no error-severity diagnostics */
  valid: boolean;
};

// ---- lexer ----

export type LexToken =
  | { type: "lparen"; span: Span }
  | { type: "rparen"; span: Span }
  | { type: "term"; raw: string; span: Span };

type Token = LexToken;

/**
 * The raw token stream for `input` (diagnostics discarded). The composer's
 * segment projection consumes this so its token boundaries are the lexer's,
 * never a re-derivation.
 */
export function lexTokens(input: string): LexToken[] {
  const throwaway: Diagnostic[] = [];
  return lex(input, throwaway);
}

// \s covers Unicode space separators (NBSP & friends) — pastes from
// Slack/Notion routinely carry U+00A0, which must split tokens like ' '.
const WHITESPACE = /\s/;

function lex(input: string, diagnostics: Diagnostic[]): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (WHITESPACE.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen", span: { from: i, to: i + 1 } });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen", span: { from: i, to: i + 1 } });
      i++;
      continue;
    }
    // term: consume until whitespace/paren, but a double quote consumes
    // greedily through its closing quote (so key:"a b" stays one term).
    const start = i;
    while (i < input.length) {
      const c = input[i]!;
      if (WHITESPACE.test(c) || c === ")") break;
      if (c === "(") {
        if (i > start && input[i - 1] === ":") {
          const close = findClosingParen(input, i);
          if (close === -1) {
            diagnostics.push({
              from: i,
              to: input.length,
              severity: "error",
              message: 'Unclosed "("',
            });
            i = input.length;
            break;
          }
          i = close + 1;
          continue;
        }
        break;
      }
      if (c === '"') {
        const close = findClosingQuote(input, i);
        if (close === -1) {
          diagnostics.push({
            from: i,
            to: input.length,
            severity: "error",
            message: "Unclosed quote",
          });
          i = input.length;
          break;
        }
        i = close + 1;
        continue;
      }
      i++;
    }
    tokens.push({
      type: "term",
      raw: input.slice(start, i),
      span: { from: start, to: i },
    });
  }
  return tokens;
}

export function findClosingQuote(input: string, openIdx: number): number {
  for (let j = openIdx + 1; j < input.length; j++) {
    if (input[j] === "\\") {
      j++;
      continue;
    }
    if (input[j] === '"') return j;
  }
  return -1;
}

function findClosingParen(input: string, openIdx: number): number {
  let depth = 0;
  for (let j = openIdx; j < input.length; j++) {
    const c = input[j]!;
    if (c === '"') {
      const close = findClosingQuote(input, j);
      j = close === -1 ? input.length : close;
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/** Split outside double quotes; returns segments with offsets into `s`. */
export function splitOutsideQuotes(
  s: string,
  sep: string,
): Array<{ text: string; offset: number }> {
  const out: Array<{ text: string; offset: number }> = [];
  let segStart = 0;
  let j = 0;
  while (j < s.length) {
    const c = s[j]!;
    if (c === '"') {
      const close = findClosingQuote(s, j);
      j = close === -1 ? s.length : close + 1;
      continue;
    }
    if (c === sep) {
      out.push({ text: s.slice(segStart, j), offset: segStart });
      segStart = j + 1;
    }
    j++;
  }
  out.push({ text: s.slice(segStart), offset: segStart });
  return out;
}

export function indexOfOutsideQuotes(s: string, ch: string): number {
  let j = 0;
  while (j < s.length) {
    const c = s[j]!;
    if (c === '"') {
      const close = findClosingQuote(s, j);
      j = close === -1 ? s.length : close + 1;
      continue;
    }
    if (c === ch) return j;
    j++;
  }
  return -1;
}

function unquote(s: string): { value: string; quoted: boolean } {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    // Inverse of serializeValue: \" and \\ are escapes, everything else literal.
    return { value: t.slice(1, -1).replace(/\\(["\\])/g, "$1"), quoted: true };
  }
  return { value: t, quoted: false };
}

// ---- term classification ----

function isKeyword(raw: string): "and" | "or" | "not" | null {
  if (raw === "AND") return "and";
  if (raw === "OR") return "or";
  if (raw === "NOT") return "not";
  return null;
}

// Operator prefixes between ':' and the value. Longest first so '>=' wins
// over '>'. Text-match ops (~/^/$) are NOT prefixes — they are positional `*`
// globs handled by parseGlob below. The grouped/list default is separate.
const OPERATOR_PREFIXES: Array<{ prefix: string; op: CompareOp }> = [
  { prefix: ">=", op: ">=" },
  { prefix: "<=", op: "<=" },
  { prefix: ">", op: ">" },
  { prefix: "<", op: "<" },
  { prefix: "=", op: "exact" },
];

// Positional `*` glob on a single (un-grouped) value → a text-match op.
// `v*` starts-with, `*v` ends-with, `*v*` contains. The `*`s are recognized
// only as the first/last char of the raw segment (a quoted value's edges are
// `"`, and stars inside quotes are literal), so `"a*b"` and `a*b` stay literal.
// Returns null when there is no anchoring star or no value survives stripping.
function parseGlob(rawSegment: string): { op: CompareOp; core: string } | null {
  const leading = rawSegment.startsWith("*");
  const trailing = rawSegment.endsWith("*") && rawSegment.length > 1;
  if (!leading && !trailing) return null;
  let core = rawSegment;
  if (leading) core = core.slice(1);
  if (trailing) core = core.slice(0, -1);
  if (core.length === 0) return null; // lone `*` / `**` → treat as literal
  const op: CompareOp = leading && trailing ? "~" : trailing ? "^" : "$";
  return { op, core };
}

// Operator-looking tokens we don't support yet. Rather than silently treat
// them as free text (lowercase `not`/`or`/`and`) or as a cryptic "unknown
// field" (`!foo:bar`), surface an explicit "not supported yet" error. Quoting
// (`"or"`) escapes the word back into free text.
function reservedTokenIssue(raw: string): string | null {
  if (raw.startsWith("!")) {
    return '"!" is not supported yet — use -field:value to exclude (e.g. -env:dev)';
  }
  const lower = raw.toLowerCase();
  if (lower === "not") {
    return '"not" is not supported yet — use -field:value to exclude (e.g. -env:dev)';
  }
  if (lower === "or" || lower === "and") {
    return `"${raw}" between filters is not supported yet — combine one field's values with field:(A OR B), or quote "${raw}" to search text`;
  }
  return null;
}

function parseTermNode(
  raw: string,
  span: Span,
  diagnostics: Diagnostic[],
): FilterNode | TextNode {
  const reserved = reservedTokenIssue(raw);
  if (reserved !== null) {
    diagnostics.push({
      from: span.from,
      to: span.to,
      severity: "error",
      message: reserved,
    });
    const { value, quoted } = unquote(raw);
    return { kind: "text", value, quoted, span };
  }

  const colon = indexOfOutsideQuotes(raw, ":");
  if (colon === -1) {
    const { value, quoted } = unquote(raw);
    return { kind: "text", value, quoted, span };
  }

  const keyRaw = raw.slice(0, colon);
  const valueRaw = raw.slice(colon + 1);
  const ref = keyRaw.length === 0 ? null : resolveField(keyRaw);

  if (ref === null) {
    diagnostics.push({
      from: span.from,
      to: span.from + Math.max(colon, 1),
      severity: "error",
      message: `Unknown field "${keyRaw}"`,
    });
  }

  const key = ref === null ? keyRaw : canonicalKey(ref);

  // Op×field validity comes from the shared table so parser, validator, and
  // adapter agree (fields.operatorIssue).
  const pushOpIssue = (op: CompareOp, valueOp: "or" | "and" = "or") => {
    if (ref === null) return;
    const issue = operatorIssue(ref, op, valueOp);
    if (issue !== null) {
      diagnostics.push({
        from: span.from,
        to: span.to,
        severity: "error",
        message: issue,
      });
    }
  };

  if (valueRaw.length === 0) {
    diagnostics.push({
      from: span.from,
      to: span.to,
      severity: "error",
      message: `Missing value after "${keyRaw}:"`,
    });
    return { kind: "filter", key, rawKey: keyRaw, op: "=", values: [], span };
  }

  if (valueRaw.startsWith("(")) {
    const group = parseGroupedValues(
      valueRaw,
      span.from + colon + 1,
      diagnostics,
    );
    if (!valueRaw.endsWith(")")) {
      diagnostics.push({
        from: span.from + colon + 1,
        to: span.to,
        severity: "error",
        message: 'Unclosed "("',
      });
    }
    if (group.values.length === 0) {
      diagnostics.push({
        from: span.from,
        to: span.to,
        severity: "error",
        message: `Missing grouped value after "${keyRaw}:("`,
      });
    }
    pushOpIssue("=", group.valueOp);
    return {
      kind: "filter",
      key,
      rawKey: keyRaw,
      op: "=",
      values: group.values,
      valueOp: group.valueOp,
      span,
    };
  }

  for (const { prefix, op } of OPERATOR_PREFIXES) {
    if (valueRaw.startsWith(prefix)) {
      const scalarRaw = valueRaw.slice(prefix.length);
      const { value } = unquote(scalarRaw);
      if (value.length === 0) {
        diagnostics.push({
          from: span.from,
          to: span.to,
          severity: "error",
          message: `Missing value after "${keyRaw}:${prefix}"`,
        });
      }
      pushOpIssue(op);
      return {
        kind: "filter",
        key,
        rawKey: keyRaw,
        op,
        values: value.length > 0 ? [value] : [],
        span,
      };
    }
  }

  const segments = splitOutsideQuotes(valueRaw, ",");

  // A single un-grouped value can carry positional `*` glob wildcards.
  if (segments.length === 1) {
    const glob = parseGlob(segments[0]!.text);
    if (glob !== null) {
      const { value } = unquote(glob.core);
      if (value.length === 0) {
        diagnostics.push({
          from: span.from,
          to: span.to,
          severity: "error",
          message: `Missing value in "${keyRaw}:${segments[0]!.text}"`,
        });
      }
      pushOpIssue(glob.op);
      return {
        kind: "filter",
        key,
        rawKey: keyRaw,
        op: glob.op,
        values: value.length > 0 ? [value] : [],
        span,
      };
    }
  }

  const values: string[] = [];
  for (const seg of segments) {
    const { value, quoted } = unquote(seg.text);
    // A quoted empty string ("") is an intentional empty value (e.g. a filter
    // for an empty trace name); only a bare empty segment is an error.
    if (value.length === 0 && !quoted) {
      diagnostics.push({
        from: span.from,
        to: span.to,
        severity: "error",
        message: "Empty value in comma list",
      });
      continue;
    }
    values.push(value);
  }
  pushOpIssue("=");
  return { kind: "filter", key, rawKey: keyRaw, op: "=", values, span };
}

function parseGroupedValues(
  raw: string,
  offset: number,
  diagnostics: Diagnostic[],
): { values: string[]; valueOp: "or" | "and" } {
  const innerEnd = raw.endsWith(")") ? raw.length - 1 : raw.length;
  const inner = raw.slice(1, innerEnd);
  const localDiagnostics: Diagnostic[] = [];
  const tokens = lex(inner, localDiagnostics);
  for (const d of localDiagnostics) {
    diagnostics.push({
      ...d,
      from: d.from + offset + 1,
      to: d.to + offset + 1,
    });
  }

  const values: string[] = [];
  let valueOp: "or" | "and" = "or";
  let sawSeparator: "or" | "and" | null = null;
  let expectValue = true;
  let lastSeparator: { span: Span; raw: string } | null = null;

  for (const token of tokens) {
    const span = {
      from: token.span.from + offset + 1,
      to: token.span.to + offset + 1,
    };
    if (token.type !== "term") {
      diagnostics.push({
        from: span.from,
        to: span.to,
        severity: "error",
        message: "Nested groups are not supported inside grouped values",
      });
      continue;
    }

    if (token.raw === "OR" || token.raw === "AND") {
      const sep = token.raw === "OR" ? "or" : "and";
      if (expectValue) {
        diagnostics.push({
          from: span.from,
          to: span.to,
          severity: "error",
          message: `${token.raw} is missing a left-hand value`,
        });
      }
      if (sawSeparator !== null && sawSeparator !== sep) {
        diagnostics.push({
          from: span.from,
          to: span.to,
          severity: "error",
          message: "Cannot mix AND and OR inside one value group",
        });
      }
      sawSeparator = sep;
      valueOp = sep;
      expectValue = true;
      lastSeparator = { span, raw: token.raw };
      continue;
    }

    if (!expectValue) {
      diagnostics.push({
        from: span.from,
        to: span.to,
        severity: "error",
        message:
          "Expected uppercase OR (any of) or AND (all of) between grouped values",
      });
    }

    const { value, quoted } = unquote(token.raw);
    // A quoted empty string ("") is an intentional empty value; only a bare
    // empty token is an error.
    if (value.length === 0 && !quoted) {
      diagnostics.push({
        from: span.from,
        to: span.to,
        severity: "error",
        message: "Empty grouped value",
      });
    } else {
      // A bare comma inside a group (`tags:(a,b)`) lexes as one token, so it
      // would otherwise become the literal value "a,b" with no diagnostic.
      // Grouped values separate with uppercase OR/AND — flag it, but still push
      // the value so parseTermNode doesn't stack a misleading "missing grouped
      // value" on top of the comma error.
      if (indexOfOutsideQuotes(token.raw, ",") !== -1) {
        diagnostics.push({
          from: span.from,
          to: span.to,
          severity: "error",
          message:
            "Separate grouped values with uppercase OR or AND, not commas",
        });
      }
      values.push(value);
    }
    expectValue = false;
    lastSeparator = null;
  }

  if (lastSeparator !== null) {
    diagnostics.push({
      from: lastSeparator.span.from,
      to: lastSeparator.span.to,
      severity: "error",
      message: `Dangling ${lastSeparator.raw} — expected a grouped value after it`,
    });
  }

  return { values, valueOp };
}

// ---- parser ----

export function parse(input: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const tokens = lex(input, diagnostics);
  let pos = 0;

  const peek = (): Token | null => tokens[pos] ?? null;
  const next = (): Token | null => tokens[pos++] ?? null;

  function parseOr(): ASTNode | null {
    let left = parseAnd();
    while (true) {
      const t = peek();
      if (t?.type === "term" && isKeyword(t.raw) === "or") {
        next();
        const right = parseAnd();
        if (right === null) {
          diagnostics.push({
            from: t.span.from,
            to: t.span.to,
            severity: "error",
            message: "Dangling OR — expected an expression after it",
          });
          return left;
        }
        if (left === null) {
          diagnostics.push({
            from: t.span.from,
            to: t.span.to,
            severity: "error",
            message: "OR is missing a left-hand expression",
          });
          left = right;
          continue;
        }
        if (left.kind === "or") {
          left.children.push(right);
        } else {
          left = { kind: "or", children: [left, right] };
        }
        continue;
      }
      return left;
    }
  }

  function parseAnd(): ASTNode | null {
    const children: ASTNode[] = [];
    while (true) {
      const t = peek();
      if (t === null || t.type === "rparen") break;
      if (t.type === "term") {
        const kw = isKeyword(t.raw);
        if (kw === "or") break;
        if (kw === "and") {
          next();
          const upcoming = peek();
          const ends =
            upcoming === null ||
            upcoming.type === "rparen" ||
            (upcoming.type === "term" && isKeyword(upcoming.raw) === "or");
          if (ends) {
            diagnostics.push({
              from: t.span.from,
              to: t.span.to,
              severity: "error",
              message: "Dangling AND — expected an expression after it",
            });
          }
          continue;
        }
      }
      const node = parseUnary();
      if (node !== null) children.push(node);
    }
    if (children.length === 0) return null;
    if (children.length === 1) return children[0]!;
    return { kind: "and", children };
  }

  function parseUnary(): ASTNode | null {
    const t = peek();
    if (t === null) return null;

    if (t.type === "rparen") {
      next();
      diagnostics.push({
        from: t.span.from,
        to: t.span.to,
        severity: "error",
        message: 'Unmatched ")"',
      });
      return null;
    }

    if (t.type === "lparen") {
      next();
      const inner = parseOr();
      const close = peek();
      let closedTo: number | null = null;
      if (close?.type === "rparen") {
        next();
        closedTo = close.span.to;
      } else {
        diagnostics.push({
          from: t.span.from,
          to: t.span.to,
          severity: "error",
          message: 'Unclosed "("',
        });
      }
      if (inner === null) {
        diagnostics.push({
          from: t.span.from,
          to: t.span.to,
          severity: "error",
          message: 'Empty group "()"',
        });
      }
      // Remember the paren extent so structured edits can remove the wrapping
      // parens together with their sole content ("(env:dev)" → "" not "()").
      if (inner !== null && closedTo !== null) {
        inner.parenSpan = { from: t.span.from, to: closedTo };
      }
      return inner;
    }

    // term
    const kw = isKeyword(t.raw);
    if (kw === "not") {
      next();
      const child = parseUnary();
      if (child === null) {
        diagnostics.push({
          from: t.span.from,
          to: t.span.to,
          severity: "error",
          message: "Dangling NOT — expected an expression after it",
        });
        return null;
      }
      return {
        kind: "not",
        child,
        span: { from: t.span.from, to: nodeEnd(child) ?? t.span.to },
      };
    }

    next();
    if (t.raw === "-") {
      // A bare "-" is not a negation operator — the dash form must be glued to
      // its filter ("-env:dev"). Standalone (e.g. "-(env:dev)" or the typo
      // "- env:dev") it would otherwise lower to a meaningless free-text term
      // while the following group/filter stays positive, silently inverting
      // the user's intent. Reject it with the same message as "-freetext".
      diagnostics.push({
        from: t.span.from,
        to: t.span.to,
        severity: "error",
        message: "Negation (-) only applies to field filters, e.g. -env:dev",
      });
      return parseTermNode(t.raw, t.span, diagnostics);
    }
    if (t.raw.startsWith("-") && t.raw.length > 1) {
      const inner = parseTermNode(
        t.raw.slice(1),
        { from: t.span.from + 1, to: t.span.to },
        diagnostics,
      );
      if (inner.kind === "text") {
        // "-foo" as free text would be a negated search term; not supported.
        diagnostics.push({
          from: t.span.from,
          to: t.span.to,
          severity: "error",
          message: "Negation (-) only applies to field filters, e.g. -env:dev",
        });
        return inner;
      }
      return { kind: "not", child: inner, span: t.span };
    }
    return parseTermNode(t.raw, t.span, diagnostics);
  }

  let ast = parseOr();
  // Top-level recovery: unmatched ")" (parseAnd stops at rparen). Report it,
  // skip it, and AND-merge whatever parses after.
  let leftover: Token | null;
  while ((leftover = peek()) !== null) {
    next();
    diagnostics.push({
      from: leftover.span.from,
      to: leftover.span.to,
      severity: "error",
      message:
        leftover.type === "rparen" ? 'Unmatched ")"' : "Unexpected input",
    });
    const more = parseOr();
    if (more !== null) {
      if (ast === null) ast = more;
      else if (ast.kind === "and") ast.children.push(more);
      else ast = { kind: "and", children: [ast, more] };
    }
  }

  // Tolerant recovery can flag the same span from more than one path (e.g. an
  // unclosed "(" caught by both the lexer and parseTermNode). Drop exact
  // duplicates so the composer doesn't render the same message twice.
  const deduped = dedupeDiagnostics(diagnostics);
  return {
    ast,
    diagnostics: deduped,
    valid: !deduped.some((d) => d.severity === "error"),
  };
}

function dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((d) => {
    const key = `${d.from}:${d.to}:${d.severity}:${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function nodeEnd(node: ASTNode): number | null {
  if (node.kind === "filter" || node.kind === "text" || node.kind === "not") {
    return node.span?.to ?? null;
  }
  const last = node.children[node.children.length - 1];
  return last ? nodeEnd(last) : null;
}

/**
 * The whitespace/paren-delimited term containing `pos` (quote-aware: quoted
 * spans with spaces stay one term). Null when the position sits in whitespace
 * or on a paren. Used by the editor's completion source so token boundaries
 * agree with the lexer instead of re-deriving them quote-blind.
 */
export function termAt(
  input: string,
  pos: number,
): { raw: string; from: number; to: number } | null {
  const throwaway: Diagnostic[] = [];
  for (const token of lex(input, throwaway)) {
    if (token.type !== "term") continue;
    if (pos >= token.span.from && pos <= token.span.to) {
      return { raw: token.raw, from: token.span.from, to: token.span.to };
    }
  }
  return null;
}

// ---- serializer ----

export const NEEDS_QUOTES = /[\s:,()"\\]/;
// A value/term that STARTS with an operator prefix would otherwise be reparsed
// as that operator (`name:>5` → comparison, `name:=x` → exact), and a leading
// `-` would be read as negation when the term is free text (`-foo`). Only the
// leading position matters — mid-value `-`/`>` (e.g. "gpt-4-turbo") is fine and
// must NOT force quoting. ( `-` is placed first in the class so it is a
// literal, not a range.)
const LEADING_OPERATOR = /^[-=><]/;
// A literal value whose first OR last char is `*` would otherwise be read as a
// glob anchor (`*v`/`v*`), so it must be quoted to stay literal.
const STAR_ANCHOR = /^\*|\*$/;

// Tokens reservedTokenIssue rejects as bare free text — they must round-trip
// quoted or the bar lands invalid on the next derive. Mirror that set exactly:
// AND/OR/NOT in any case lex as boolean operators, and a leading "!" is
// reserved for future negation (and not covered by LEADING_OPERATOR).
const RESERVED_BARE_TOKEN = /^(?:and|or|not)$/i;

export function serializeValue(value: string): string {
  if (
    value.length === 0 ||
    NEEDS_QUOTES.test(value) ||
    LEADING_OPERATOR.test(value) ||
    STAR_ANCHOR.test(value) ||
    value.startsWith("!") ||
    RESERVED_BARE_TOKEN.test(value)
  ) {
    // Escape \ before " — must be the exact inverse of unquote.
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

// Inverse of OPERATOR_PREFIXES: prefix-style AST op -> typed prefix. The glob
// ops (~/^/$) are NOT prefixes — they wrap the value (see serializeFilter).
const OP_SYMBOL: Partial<Record<CompareOp, string>> = {
  "=": "",
  exact: "=",
  ">": ">",
  "<": "<",
  ">=": ">=",
  "<=": "<=",
};

export function serializeFilter(node: FilterNode): string {
  // Prefer the user's typed key (alias/casing) — surgery fallbacks shouldn't
  // canonicalize untouched filters.
  const key = node.rawKey ?? node.key;
  if (node.op === "=" && node.values.length > 1) {
    const joiner = node.valueOp === "and" ? " AND " : " OR ";
    return `${key}:(${node.values.map(serializeValue).join(joiner)})`;
  }
  // Text-match ops render as positional `*` globs around the value.
  if (node.op === "~" || node.op === "^" || node.op === "$") {
    const v = serializeValue(node.values[0] ?? "");
    const wrapped =
      node.op === "~" ? `*${v}*` : node.op === "^" ? `${v}*` : `*${v}`;
    return `${key}:${wrapped}`;
  }
  return `${key}:${OP_SYMBOL[node.op] ?? ""}${node.values.map(serializeValue).join(",")}`;
}

function sameFieldOrGroup(node: ASTNode): FilterNode[] | null {
  if (node.kind !== "or") return null;
  const filters = node.children.filter(
    (c): c is FilterNode => c.kind === "filter",
  );
  if (filters.length !== node.children.length || filters.length < 2)
    return null;
  const first = filters[0]!;
  if (first.op !== "=" || first.values.length !== 1) return null;
  for (const f of filters) {
    if (f.key !== first.key || f.op !== "=" || f.values.length !== 1)
      return null;
  }
  return filters;
}

function serializeSameFieldOr(filters: FilterNode[], negated = false): string {
  const first = filters[0]!;
  const key = first.rawKey ?? first.key;
  const values = filters.flatMap((f) => f.values);
  return `${negated ? "-" : ""}${key}:(${values.map(serializeValue).join(" OR ")})`;
}

/**
 * Canonical text for an AST. Precedence-aware: AND children join with a space
 * (implicit AND), OR joins with " OR ", OR children inside AND get parens,
 * NOT serializes as "-" before a filter and "NOT (...)" before a group.
 */
export function serialize(ast: ASTNode | null): string {
  if (ast === null) return "";
  switch (ast.kind) {
    case "filter":
      return serializeFilter(ast);
    case "text":
      // Always route through serializeValue so bare keywords (AND/OR/NOT) and
      // leading-operator/hyphen free text get quoted and reparse as text.
      return serializeValue(ast.value);
    case "not": {
      const child = ast.child;
      if (child.kind === "filter") return `-${serializeFilter(child)}`;
      const sameField = sameFieldOrGroup(child);
      if (sameField !== null) return serializeSameFieldOr(sameField, true);
      if (child.kind === "not") return `NOT (${serialize(child)})`;
      if (child.kind === "text") return `NOT ${serialize(child)}`;
      return `NOT (${serialize(child)})`;
    }
    case "and":
      // Nested groups keep their parens: OR for precedence, AND so the
      // canonical text reparses to the same structure (a bare "a b AND c"
      // would flatten).
      return ast.children
        .map((c) => {
          if (c.kind === "or") {
            return sameFieldOrGroup(c) !== null
              ? serialize(c)
              : `(${serialize(c)})`;
          }
          return c.kind === "and" ? `(${serialize(c)})` : serialize(c);
        })
        .join(" ");
    case "or": {
      const sameField = sameFieldOrGroup(ast);
      if (sameField !== null) return serializeSameFieldOr(sameField);
      // A nested OR group (e.g. "a OR (b OR c)") must keep its parens or the
      // chain flattens on reparse; AND children reparse correctly bare
      // (implicit AND binds tighter than OR).
      return ast.children
        .map((c) => (c.kind === "or" ? `(${serialize(c)})` : serialize(c)))
        .join(" OR ");
    }
  }
}
