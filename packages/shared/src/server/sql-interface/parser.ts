import type {
  BinaryOp,
  Expr,
  OrderItem,
  SelectItem,
  SelectStatement,
} from "./ast";
import { CustomerSqlError } from "./errors";
import { tokenize, type Token } from "./lexer";

const MAX_DEPTH = 64;
const UNSUPPORTED = new Set([
  "JOIN",
  "UNION",
  "WITH",
  "SETTINGS",
  "FORMAT",
  "INTO",
]);

/**
 * Parses one `SELECT` over a single table:
 *
 * ```
 * SELECT [DISTINCT] item, … FROM table [[AS] alias]
 *   [WHERE expr] [GROUP BY expr, …] [HAVING expr]
 *   [ORDER BY expr [ASC|DESC], …] [LIMIT n [OFFSET m]]
 * ```
 *
 * Joins, subqueries, set operations, CTEs and `SETTINGS` are not part of the
 * grammar. Expressions cover literals, columns, `map['key']`, arithmetic,
 * comparisons, `AND`/`OR`/`NOT`, `IS [NOT] NULL`, `[NOT] IN (…)`,
 * `[NOT] [I]LIKE`, `[NOT] BETWEEN`, `INTERVAL n unit` and function calls,
 * including parametric aggregates like `quantile(0.95)(x)`.
 */
export function parseCustomerSql(sql: string): SelectStatement {
  return new Parser(tokenize(sql)).statement();
}

class Parser {
  private i = 0;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  statement(): SelectStatement {
    this.expectKeyword("SELECT");
    const distinct = this.acceptKeyword("DISTINCT");
    const columns = this.commaList(() => this.selectItem());
    this.expectKeyword("FROM");
    if (this.peekPunct("(")) {
      throw this.error("Subqueries are not supported");
    }
    const table = this.identifier();
    let alias: string | undefined;
    if (this.acceptKeyword("AS")) alias = this.identifier();
    else if (this.peek().kind === "identifier") alias = this.identifier();
    if (this.peekPunct(",")) throw this.error("Joins are not supported");

    const where = this.acceptKeyword("WHERE") ? this.expr() : undefined;
    let groupBy: Expr[] = [];
    if (this.acceptKeyword("GROUP")) {
      this.expectKeyword("BY");
      groupBy = this.commaList(() => this.expr());
    }
    const having = this.acceptKeyword("HAVING") ? this.expr() : undefined;
    let orderBy: OrderItem[] = [];
    if (this.acceptKeyword("ORDER")) {
      this.expectKeyword("BY");
      orderBy = this.commaList(() => this.orderItem());
    }
    let limit: number | undefined;
    let offset: number | undefined;
    if (this.acceptKeyword("LIMIT")) {
      limit = this.nonNegativeInteger();
      if (this.acceptPunct(",")) {
        // MySQL/ClickHouse `LIMIT offset, count`.
        offset = limit;
        limit = this.nonNegativeInteger();
      }
    }
    if (this.acceptKeyword("OFFSET")) offset = this.nonNegativeInteger();

    const next = this.peek();
    if (next.kind !== "eof") {
      if (next.kind === "keyword" && UNSUPPORTED.has(next.value)) {
        throw this.error(`${next.value} is not supported`);
      }
      throw this.error(`Unexpected "${next.value}"`);
    }
    return {
      distinct,
      columns,
      from: { table, alias },
      where,
      groupBy,
      having,
      orderBy,
      limit,
      offset,
    };
  }

  private selectItem(): SelectItem {
    const expr = this.expr();
    if (this.acceptKeyword("AS")) return { expr, alias: this.identifier() };
    if (this.peek().kind === "identifier") {
      return { expr, alias: this.identifier() };
    }
    return { expr };
  }

  private orderItem(): OrderItem {
    const expr = this.expr();
    if (this.acceptKeyword("DESC")) return { expr, direction: "desc" };
    this.acceptKeyword("ASC");
    return { expr, direction: "asc" };
  }

  // Precedence, loosest first: OR, AND, NOT, predicates, + -, * /, unary -,
  // subscript, primary.
  private expr(): Expr {
    if (++this.depth > MAX_DEPTH) throw this.error("Expression nests too deep");
    try {
      return this.or();
    } finally {
      this.depth--;
    }
  }

  private or(): Expr {
    let left = this.and();
    while (this.acceptKeyword("OR")) {
      left = { kind: "binary", op: "OR", left, right: this.and() };
    }
    return left;
  }

  private and(): Expr {
    let left = this.not();
    while (this.acceptKeyword("AND")) {
      left = { kind: "binary", op: "AND", left, right: this.not() };
    }
    return left;
  }

  private not(): Expr {
    if (this.acceptKeyword("NOT")) {
      return { kind: "unary", op: "NOT", operand: this.not() };
    }
    return this.predicate();
  }

  private predicate(): Expr {
    const left = this.additive();
    const tok = this.peek();
    if (tok.kind === "operator" && isComparison(tok.value)) {
      this.i++;
      const op: BinaryOp = tok.value === "<>" ? "!=" : (tok.value as BinaryOp);
      return { kind: "binary", op, left, right: this.additive() };
    }
    if (this.acceptKeyword("IS")) {
      const negated = this.acceptKeyword("NOT");
      this.expectKeyword("NULL");
      return { kind: "isNull", operand: left, negated };
    }
    const negated = this.acceptKeyword("NOT");
    if (this.acceptKeyword("IN")) {
      this.expectPunct("(");
      if (this.peek().kind === "keyword" && this.peek().value === "SELECT") {
        throw this.error("Subqueries are not supported");
      }
      const values = this.commaList(() => this.additive());
      this.expectPunct(")");
      return { kind: "in", operand: left, values, negated };
    }
    if (this.peekKeyword("LIKE") || this.peekKeyword("ILIKE")) {
      const caseInsensitive = this.next().value === "ILIKE";
      return {
        kind: "like",
        operand: left,
        pattern: this.additive(),
        caseInsensitive,
        negated,
      };
    }
    if (this.acceptKeyword("BETWEEN")) {
      const low = this.additive();
      this.expectKeyword("AND");
      const high = this.additive();
      return { kind: "between", operand: left, low, high, negated };
    }
    if (negated)
      throw this.error("Expected IN, LIKE, ILIKE or BETWEEN after NOT");
    return left;
  }

  private additive(): Expr {
    let left = this.multiplicative();
    for (;;) {
      const tok = this.peek();
      if (tok.kind !== "operator" || (tok.value !== "+" && tok.value !== "-")) {
        return left;
      }
      this.i++;
      left = {
        kind: "binary",
        op: tok.value,
        left,
        right: this.multiplicative(),
      };
    }
  }

  private multiplicative(): Expr {
    let left = this.unary();
    for (;;) {
      const tok = this.peek();
      if (tok.kind !== "operator" || (tok.value !== "*" && tok.value !== "/")) {
        return left;
      }
      this.i++;
      left = { kind: "binary", op: tok.value, left, right: this.unary() };
    }
  }

  private unary(): Expr {
    const tok = this.peek();
    if (tok.kind === "operator" && tok.value === "-") {
      this.i++;
      const operand = this.unary();
      if (operand.kind === "number")
        return { kind: "number", value: -operand.value };
      return { kind: "unary", op: "-", operand };
    }
    return this.postfix();
  }

  private postfix(): Expr {
    let target = this.primary();
    while (this.acceptPunct("[")) {
      const key = this.expr();
      this.expectPunct("]");
      target = { kind: "subscript", target, key };
    }
    return target;
  }

  private primary(): Expr {
    const tok = this.next();
    switch (tok.kind) {
      case "string":
        return { kind: "string", value: tok.value };
      case "number":
        return { kind: "number", value: Number(tok.value) };
      case "operator":
        if (tok.value === "*") return { kind: "star" };
        break;
      case "punct":
        if (tok.value === "(") {
          if (this.peekKeyword("SELECT")) {
            throw this.error("Subqueries are not supported");
          }
          const inner = this.expr();
          this.expectPunct(")");
          return inner;
        }
        break;
      case "keyword":
        if (tok.value === "NULL") return { kind: "null" };
        if (tok.value === "TRUE") return { kind: "boolean", value: true };
        if (tok.value === "FALSE") return { kind: "boolean", value: false };
        if (tok.value === "INTERVAL") {
          const count = this.nonNegativeInteger();
          const unit = this.identifier().toLowerCase();
          return { kind: "interval", count, unit };
        }
        break;
      case "identifier": {
        if (this.peekPunct("(")) return this.call(tok);
        if (this.acceptPunct(".")) {
          const name = this.identifier();
          return { kind: "column", qualifier: tok.value, name, pos: tok.pos };
        }
        return { kind: "column", name: tok.value, pos: tok.pos };
      }
      default:
        break;
    }
    this.i--;
    throw this.error(
      tok.kind === "eof"
        ? "Unexpected end of query"
        : `Unexpected "${tok.value}"`,
    );
  }

  private call(nameToken: Token): Expr {
    const first = this.callArgs();
    if (this.peekPunct("(")) {
      const second = this.callArgs();
      if (second.distinct) throw this.error("DISTINCT in parametric aggregate");
      return {
        kind: "call",
        name: nameToken.value,
        params: first.args,
        args: second.args,
        distinct: false,
        pos: nameToken.pos,
      };
    }
    return {
      kind: "call",
      name: nameToken.value,
      args: first.args,
      distinct: first.distinct,
      pos: nameToken.pos,
    };
  }

  private callArgs(): { args: Expr[]; distinct: boolean } {
    this.expectPunct("(");
    if (this.acceptPunct(")")) return { args: [], distinct: false };
    const distinct = this.acceptKeyword("DISTINCT");
    const args = this.commaList(() => this.expr());
    this.expectPunct(")");
    return { args, distinct };
  }

  private commaList<T>(item: () => T): T[] {
    const items = [item()];
    while (this.acceptPunct(",")) items.push(item());
    return items;
  }

  private identifier(): string {
    const tok = this.peek();
    if (tok.kind !== "identifier") {
      throw this.error(
        tok.kind === "keyword"
          ? `"${tok.value}" is a reserved word; quote it to use it as a name`
          : "Expected a name",
      );
    }
    this.i++;
    return tok.value;
  }

  private nonNegativeInteger(): number {
    const tok = this.peek();
    if (tok.kind !== "number" || !/^\d+$/.test(tok.value)) {
      throw this.error("Expected a non-negative integer");
    }
    this.i++;
    const n = Number(tok.value);
    if (!Number.isSafeInteger(n)) throw this.error("Integer is too large");
    return n;
  }

  private peek(): Token {
    return this.tokens[this.i];
  }

  private next(): Token {
    return this.tokens[this.i++];
  }

  private peekKeyword(value: string): boolean {
    const tok = this.peek();
    return tok.kind === "keyword" && tok.value === value;
  }

  private acceptKeyword(value: string): boolean {
    if (!this.peekKeyword(value)) return false;
    this.i++;
    return true;
  }

  private expectKeyword(value: string): void {
    if (!this.acceptKeyword(value)) throw this.error(`Expected ${value}`);
  }

  private peekPunct(value: string): boolean {
    const tok = this.peek();
    return tok.kind === "punct" && tok.value === value;
  }

  private acceptPunct(value: string): boolean {
    if (!this.peekPunct(value)) return false;
    this.i++;
    return true;
  }

  private expectPunct(value: string): void {
    if (!this.acceptPunct(value)) throw this.error(`Expected "${value}"`);
  }

  private error(message: string): CustomerSqlError {
    return new CustomerSqlError(`${message} at position ${this.peek().pos}.`);
  }
}

function isComparison(op: string): boolean {
  return ["=", "!=", "<>", "<", "<=", ">", ">="].includes(op);
}
