/**
 * Structural node shapes we walk. hypequery does not export `SelectQueryNode`
 * from the package root, so we describe the fields this arm inspects.
 */
export type HypeTableSource = {
  kind: "table";
  name: string;
  final?: boolean;
};

export type HypeSelectionNode = {
  kind: "selection";
  selection: string;
  isAggregate?: boolean;
};

export type HypeArrayJoinNode = {
  kind: "array-join";
  type: "ARRAY" | "LEFT ARRAY";
  expression: string;
};

export type HypeLimitByNode = {
  kind: "limit-by";
  limit: number;
  by: string[];
};

export type HypeGroupByNode = {
  kind: "group-by-item";
  expression: string;
};

export type HypeJoinNode = {
  kind: "join";
  type: string;
  table: string;
  leftColumn: string;
  rightColumn: string;
  alias?: string;
};

export type HypeValueNode = { kind: "value"; value: unknown };

/**
 * Structural subset of hypequery's `ExprNode`. `ConditionValueNode` includes
 * nested arrays (`inTuple`) that we do not compile; keep the value side wide
 * so a real `QueryBuilder.getQueryNode()` is assignable.
 */
export type HypeExprNode =
  | {
      kind: "condition";
      column: string;
      operator: string;
      value: unknown;
    }
  | {
      kind: "raw";
      expression: string;
      parameters: HypeValueNode[];
    }
  | {
      kind: "logical";
      operator: "AND" | "OR";
      conditions: HypeExprNode[];
    }
  | {
      kind: "sequence";
      items: Array<{
        conjunction?: "AND" | "OR";
        expression: HypeExprNode;
      }>;
    }
  | {
      kind: "group";
      expression?: HypeExprNode;
    };

export type HypeSelectNode = {
  kind?: string;
  from?: HypeTableSource;
  select?: HypeSelectionNode[];
  arrayJoins?: HypeArrayJoinNode[];
  prewhere?: HypeExprNode;
  where?: HypeExprNode;
  groupBy?: HypeGroupByNode[];
  withTotals?: boolean;
  limitBy?: HypeLimitByNode;
  limit?: number;
  offset?: number;
  distinct?: boolean;
  orderBy?: Array<{ kind: string; column: string; direction: string }>;
  joins?: HypeJoinNode[];
  having?: Array<{ kind: string; expression: string }>;
};

/**
 * Minimal builder surface this arm compiles. The methods are the contract;
 * the builder's own generics are erased so `select()`-narrowed QueryBuilder
 * instances stay assignable (hypequery does not export `SelectQueryNode`).
 */
export type CompilableSelect = {
  getQueryNode(): HypeSelectNode;
  getTableName(): string;
  toSQL(): string;
};

export function asCompilableSelect(builder: {
  getQueryNode(): unknown;
  getTableName(): string;
  toSQL(): string;
}): CompilableSelect {
  return builder as CompilableSelect;
}

export type WalkedNode = {
  kind: string;
  path: string;
  node: unknown;
};

/**
 * Depth-first walk of a hypequery select node. Used to prove ARRAY JOIN and
 * LIMIT BY are real, kind-tagged nodes rather than raw SQL fragments.
 */
export function walkSelectNode(
  node: HypeSelectNode | { kind?: string },
  path = "$",
): WalkedNode[] {
  return walkKnownSelect(node as HypeSelectNode, path);
}

function walkKnownSelect(node: HypeSelectNode, path: string): WalkedNode[] {
  const out: WalkedNode[] = [{ kind: node.kind ?? "select-query", path, node }];

  if (node.from) {
    out.push({
      kind: node.from.kind,
      path: `${path}.from`,
      node: node.from,
    });
  }

  for (const [i, selection] of (node.select ?? []).entries()) {
    out.push({
      kind: selection.kind,
      path: `${path}.select[${i}]`,
      node: selection,
    });
  }

  for (const [i, arrayJoin] of (node.arrayJoins ?? []).entries()) {
    out.push({
      kind: arrayJoin.kind,
      path: `${path}.arrayJoins[${i}]`,
      node: arrayJoin,
    });
  }

  if (node.limitBy) {
    out.push({
      kind: node.limitBy.kind,
      path: `${path}.limitBy`,
      node: node.limitBy,
    });
  }

  if (node.prewhere) {
    out.push(...walkExpr(node.prewhere, `${path}.prewhere`));
  }
  if (node.where) {
    out.push(...walkExpr(node.where, `${path}.where`));
  }

  for (const [i, group] of (node.groupBy ?? []).entries()) {
    out.push({
      kind: group.kind,
      path: `${path}.groupBy[${i}]`,
      node: group,
    });
  }

  for (const [i, join] of (node.joins ?? []).entries()) {
    out.push({
      kind: join.kind,
      path: `${path}.joins[${i}]`,
      node: join,
    });
  }

  return out;
}

function walkExpr(expr: HypeExprNode, path: string): WalkedNode[] {
  const out: WalkedNode[] = [{ kind: expr.kind, path, node: expr }];
  if (expr.kind === "logical") {
    for (const [i, child] of expr.conditions.entries()) {
      out.push(...walkExpr(child, `${path}.conditions[${i}]`));
    }
  }
  if (expr.kind === "sequence") {
    for (const [i, item] of expr.items.entries()) {
      out.push(...walkExpr(item.expression, `${path}.items[${i}].expression`));
    }
  }
  if (expr.kind === "group" && expr.expression) {
    out.push(...walkExpr(expr.expression, `${path}.expression`));
  }
  return out;
}

export function findNodesByKind(
  node: HypeSelectNode | { kind?: string },
  kind: string,
): WalkedNode[] {
  return walkSelectNode(node as HypeSelectNode).filter(
    (entry) => entry.kind === kind,
  );
}
