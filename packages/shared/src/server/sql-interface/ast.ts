/** Syntax tree of the customer SQL subset, before any schema is applied. */

export type Expr =
  | { kind: "column"; qualifier?: string; name: string; pos: number }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "star" }
  | { kind: "interval"; count: number; unit: string }
  | { kind: "unary"; op: "NOT" | "-"; operand: Expr }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "isNull"; operand: Expr; negated: boolean }
  | { kind: "in"; operand: Expr; values: Expr[]; negated: boolean }
  | {
      kind: "like";
      operand: Expr;
      pattern: Expr;
      caseInsensitive: boolean;
      negated: boolean;
    }
  | { kind: "between"; operand: Expr; low: Expr; high: Expr; negated: boolean }
  | { kind: "subscript"; target: Expr; key: Expr }
  | {
      kind: "call";
      name: string;
      /** `quantile(0.95)(x)`: the first parenthesized group. */
      params?: Expr[];
      args: Expr[];
      distinct: boolean;
      pos: number;
    };

export type BinaryOp =
  | "AND"
  | "OR"
  | "="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "+"
  | "-"
  | "*"
  | "/";

export type SelectItem = { expr: Expr; alias?: string };
export type OrderItem = { expr: Expr; direction: "asc" | "desc" };

export type SelectStatement = {
  distinct: boolean;
  columns: SelectItem[];
  from: { table: string; alias?: string };
  where?: Expr;
  groupBy: Expr[];
  having?: Expr;
  orderBy: OrderItem[];
  limit?: number;
  offset?: number;
};
