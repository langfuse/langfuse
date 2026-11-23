import { CustomerSqlError } from "./errors";

type TokenKind =
  | "keyword"
  | "identifier"
  | "string"
  | "number"
  | "operator"
  | "punct"
  | "eof";

export type Token = {
  kind: TokenKind;
  /** Keywords upper-cased; identifiers as written; strings unescaped. */
  value: string;
  /** Character offset into the source, for error messages. */
  pos: number;
};

const KEYWORDS = new Set([
  "SELECT",
  "DISTINCT",
  "FROM",
  "WHERE",
  "GROUP",
  "BY",
  "HAVING",
  "ORDER",
  "ASC",
  "DESC",
  "LIMIT",
  "OFFSET",
  "AS",
  "AND",
  "OR",
  "NOT",
  "IN",
  "IS",
  "NULL",
  "LIKE",
  "ILIKE",
  "BETWEEN",
  "TRUE",
  "FALSE",
  "INTERVAL",
  // Reserved so they fail with a clear message instead of parsing as names.
  "JOIN",
  "UNION",
  "WITH",
  "SETTINGS",
  "FORMAT",
  "INTO",
]);

const OPERATORS = ["<=", ">=", "<>", "!=", "=", "<", ">", "+", "-", "*", "/"];
const PUNCT = new Set(["(", ")", ",", ".", "[", "]"]);
const MAX_SQL_LENGTH = 10_000;

/**
 * Splits customer SQL into tokens. Only plain identifiers
 * (`[A-Za-z_][A-Za-z0-9_]*`, optionally in double quotes or backticks),
 * single-quoted strings (`''` escapes a quote; backslashes are rejected),
 * unsigned decimal numbers, comparison/arithmetic operators and `--` / `/* *\/`
 * comments are recognized; anything else is a syntax error.
 */
export function tokenize(sql: string): Token[] {
  if (sql.length > MAX_SQL_LENGTH) {
    throw new CustomerSqlError(
      `Query is longer than ${MAX_SQL_LENGTH} characters.`,
    );
  }
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) throw syntaxError("Unterminated comment", i);
      i = end + 2;
      continue;
    }
    if (c === ";") {
      // A single trailing semicolon is accepted; statements cannot be chained.
      if (sql.slice(i + 1).trim() !== "") {
        throw syntaxError("Only one statement is allowed", i);
      }
      break;
    }
    if (c === "'") {
      const start = i;
      let value = "";
      i++;
      for (;;) {
        if (i >= sql.length) throw syntaxError("Unterminated string", start);
        if (sql[i] === "\\") {
          throw syntaxError(
            "Backslashes are not supported in strings; write '' for a quote",
            i,
          );
        }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        value += sql[i++];
      }
      tokens.push({ kind: "string", value, pos: start });
      continue;
    }
    if (c === '"' || c === "`") {
      const end = sql.indexOf(c, i + 1);
      if (end === -1) throw syntaxError("Unterminated quoted identifier", i);
      const name = sql.slice(i + 1, end);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw syntaxError(`Invalid identifier "${name}"`, i);
      }
      tokens.push({ kind: "identifier", value: name, pos: i });
      i = end + 1;
      continue;
    }
    const number = /^(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?/.exec(sql.slice(i));
    if (number) {
      tokens.push({ kind: "number", value: number[0], pos: i });
      i += number[0].length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i));
    if (word) {
      const upper = word[0].toUpperCase();
      tokens.push(
        KEYWORDS.has(upper)
          ? { kind: "keyword", value: upper, pos: i }
          : { kind: "identifier", value: word[0], pos: i },
      );
      i += word[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => sql.startsWith(o, i));
    if (op) {
      tokens.push({ kind: "operator", value: op, pos: i });
      i += op.length;
      continue;
    }
    if (PUNCT.has(c)) {
      tokens.push({ kind: "punct", value: c, pos: i });
      i++;
      continue;
    }
    throw syntaxError(`Unexpected character "${c}"`, i);
  }
  tokens.push({ kind: "eof", value: "", pos: sql.length });
  return tokens;
}

function syntaxError(message: string, pos: number): CustomerSqlError {
  return new CustomerSqlError(`${message} at position ${pos}.`);
}
