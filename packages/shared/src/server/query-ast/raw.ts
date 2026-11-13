import {
  ColumnNode,
  IdentifierNode,
  RawNode,
  ReferenceNode,
  SelectQueryNode,
  TableNode,
  type OperationNode,
} from "kysely";

import { UnscopedRelationError } from "./errors";
import { isAllowedFunction } from "./functions";
import { walkNodes } from "./nodes";

/**
 * Raw SQL (`sql\`…\``) stays allowed for what the builder cannot express, but
 * only as a self-contained expression. Rejected, in any position:
 * - `modifyFront` / `modifyEnd`: text before or after the whole select, where
 *   `or 1 = 1` or a `settings` clause rewrites what tenancy scoped;
 * - a table reference parameter (`sql.table`);
 * - raw text that escapes its slot or reads a relation. The text is checked
 *   with nested raw SQL and `sql.id` / `sql.ref` names spliced in, as
 *   ClickHouse reads it: a comment (`--`, `#`, `/*`), `;`, unbalanced
 *   brackets or quotes, a relation keyword (`select`, `from`, `join`,
 *   `union`, `intersect`, `except`, `settings`, `into`), a name after `in`
 *   (`id in scores` reads the table), or a call of a function outside the
 *   allowlist in `functions.ts`.
 */
export function assertRawSqlSafe(root: unknown): void {
  walkNodes(root, (node) => {
    if (SelectQueryNode.is(node)) assertNoModifiers(node);
    if (!RawNode.is(node)) return;
    if (node.parameters.some((parameter) => TableNode.is(parameter))) {
      throw new UnscopedRelationError(
        "A table reference inside raw SQL (sql.table) is rejected in any position: it reads a relation the tenancy pass cannot scope. Read the table through selectFrom/innerJoin or a subquery instead.",
      );
    }
    assertRawText(rawText(node));
  });
}

function assertNoModifiers(node: SelectQueryNode): void {
  const modifiers = [
    ...(node.frontModifiers ?? []),
    ...(node.endModifiers ?? []),
  ];
  // `distinct()` is a keyword modifier; `modifyFront/modifyEnd` carry raw SQL.
  if (modifiers.some((modifier) => modifier.rawModifier !== undefined)) {
    throw new UnscopedRelationError(
      "modifyFront/modifyEnd are rejected: raw text before or after a select can rewrite what the tenancy pass scoped. Express the clause with the builder or an extensions.ts helper.",
    );
  }
}

/** Placeholder for a parameter whose SQL is not text: a value, a subquery. */
const OPAQUE = "?";

/** A name the compiler writes as is: `x`, `t.x`, `t.1`. */
const PLAIN_NAME = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)?$/;

/** `node` as ClickHouse reads its text: names and nested raw SQL spliced in. */
function rawText(node: RawNode): string {
  return node.sqlFragments
    .map((fragment, i) => {
      const parameter = node.parameters[i];
      return parameter === undefined
        ? fragment
        : `${fragment}${parameterText(parameter)}`;
    })
    .join("");
}

function parameterText(node: OperationNode): string {
  if (RawNode.is(node)) return rawText(node);
  const name = nameText(node);
  // Spliced as written, so `fr${sql.id("om")}` reads `from`. Any other name
  // is no plain identifier, which the compiler rejects.
  return name !== undefined && PLAIN_NAME.test(name) ? name : ` ${OPAQUE} `;
}

/** `sql.id("x")` → `x`, `sql.ref("t.x")` → `t.x`. */
function nameText(node: OperationNode): string | undefined {
  if (IdentifierNode.is(node)) return node.name;
  if (ColumnNode.is(node)) return node.column.name;
  if (ReferenceNode.is(node) && ColumnNode.is(node.column)) {
    const table = node.table ? `${node.table.table.identifier.name}.` : "";
    return `${table}${node.column.column.name}`;
  }
  return undefined;
}

const RELATION_KEYWORDS = new Set([
  "select",
  "from",
  "join",
  "union",
  "intersect",
  "except",
  "settings",
  "into",
]);

/** Words before `(` that are SQL syntax, not a function call. */
const NON_FUNCTION_WORDS = new Set(["and", "or", "not", "in", "as", "is"]);

function reject(reason: string): never {
  throw new UnscopedRelationError(
    `Raw SQL is rejected: ${reason}. Raw SQL must be a self-contained expression that reads no relation; prefer the builder or an extensions.ts helper.`,
  );
}

/**
 * Lexes `text` outside string literals and quoted names, and throws on the
 * shapes {@link assertRawSqlSafe} lists.
 */
function assertRawText(text: string): void {
  // The text outside quotes; each quoted run becomes one token.
  let code = "";
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      // A string literal reads as a value, a quoted name as a name.
      code += char === "'" ? ` ${OPAQUE} ` : " quoted_name ";
      continue;
    }
    const pair = text.slice(i, i + 2);
    if (pair === "--" || pair === "/*" || char === "#") {
      reject("it holds a comment, which can swallow the injected scope");
    }
    if (char === ";") reject("it holds a statement separator");
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth--;
    if (depth < 0) reject("it closes a bracket it did not open");
    code += char;
  }
  if (quote) reject("it leaves a quote open");
  if (depth !== 0) reject("it leaves a bracket open");

  const words = code.toLowerCase();
  for (const match of words.matchAll(/[a-z_][a-z0-9_]*/g)) {
    if (RELATION_KEYWORDS.has(match[0])) {
      reject(`"${match[0]}" introduces a relation`);
    }
  }
  if (/(^|[^a-z0-9_.])in\s+[a-z_]/.test(words)) {
    reject("a name after IN is read as a table");
  }
  for (const match of code.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const name = match[1];
    if (NON_FUNCTION_WORDS.has(name.toLowerCase())) continue;
    if (!isAllowedFunction(name)) {
      reject(`function "${name}" is not on the allowlist in functions.ts`);
    }
  }
}
