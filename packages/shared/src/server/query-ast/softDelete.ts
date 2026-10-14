/**
 * Soft-delete filtering. Always-on: every compile walks this pass.
 *
 * Every FROM/JOIN relation whose table declares `softDelete` in the registry
 * ({@link SOFT_DELETE_COLUMNS}) gets `<flag> = 0`: AND-ed into the ON clause
 * for a JOIN with one, prepended to the WHERE otherwise. A select that opts out
 * with `$call(includeDeleted())` is left unchanged; nested selects decide for
 * themselves.
 *
 * Runs before tenancy, so the tenancy pass prepends `project_id` ahead of the
 * flag: `where project_id = … and is_deleted = … and <caller predicates>`.
 */
import {
  AliasNode,
  AndNode,
  BinaryOperationNode,
  ColumnNode,
  IdentifierNode,
  JoinNode,
  OperatorNode,
  ReferenceNode,
  TableNode,
  ValueNode,
  WhereNode,
  type CommonTableExpressionNode,
  type KyselyPlugin,
  type OperationNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryId,
  type RootOperationNode,
  type SelectQueryNode,
  type WithNode,
} from "kysely";

import { QueryCompileError } from "./errors";
import {
  FinalTableNode,
  unwrapFinalTable,
  type ClickHouseSelectQueryNode,
} from "./nodes";
import { SOFT_DELETE_COLUMNS } from "./schema";
import { ClickHouseOperationNodeTransformer } from "./transformer";

type SoftDeleteRelation = {
  tableName: string;
  alias?: string;
  flag: string;
};

export class SoftDeleteFilterPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return new SoftDeleteFilterTransformer().transformNode(
      args.node,
    ) as RootOperationNode;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

class SoftDeleteFilterTransformer extends ClickHouseOperationNodeTransformer {
  /**
   * CTE names visible to the select being transformed: one set per enclosing
   * select that declares a WITH. A relation named like a CTE in scope is that
   * CTE, not the physical table. Inside a CTE body only the CTEs declared
   * before it are visible (plus itself under WITH RECURSIVE), matching
   * ClickHouse: `WITH events_core AS (SELECT … FROM events_core)` reads the
   * table. Pushed before a select's children are transformed and popped
   * after, so it is empty between compiles.
   */
  private readonly cteScopes: Set<string>[] = [];

  protected override transformSelectQuery(
    node: SelectQueryNode,
    queryId?: QueryId,
  ): SelectQueryNode {
    const ctes = cteNames(node.with);
    if (ctes.size) this.cteScopes.push(ctes);
    try {
      const withChildren = super.transformSelectQuery(
        node,
        queryId,
      ) as ClickHouseSelectQueryNode;
      return filterSelect(withChildren, (name) =>
        this.cteScopes.some((scope) => scope.has(name)),
      );
    } finally {
      if (ctes.size) this.cteScopes.pop();
    }
  }

  protected override transformWith(
    node: WithNode,
    queryId?: QueryId,
  ): WithNode {
    // Replace this select's full scope with the names visible to each body.
    const full = this.cteScopes.pop();
    const visible = new Set<string>();
    try {
      const expressions = node.expressions.map((expr) => {
        const name = cteName(expr);
        if (node.recursive) visible.add(name);
        this.cteScopes.push(new Set(visible));
        try {
          return this.transformNode(expr, queryId);
        } finally {
          this.cteScopes.pop();
          visible.add(name);
        }
      });
      return { ...node, expressions };
    } finally {
      if (full) this.cteScopes.push(full);
    }
  }
}

function cteName(expr: CommonTableExpressionNode): string {
  return expr.name.table.table.identifier.name;
}

function cteNames(node: WithNode | undefined): Set<string> {
  return new Set((node?.expressions ?? []).map(cteName));
}

function filterSelect(
  node: ClickHouseSelectQueryNode,
  isCte: (name: string) => boolean,
): ClickHouseSelectQueryNode {
  const describe = (item: OperationNode) => {
    const relation = describeRelation(item);
    return relation && !isCte(relation.tableName) ? relation : undefined;
  };
  const froms = (node.from?.froms ?? []).map(describe);
  const joins = (node.joins ?? []).map((join) => ({
    join,
    relation: describe(join.table),
  }));

  if (node.includeDeleted) {
    if (!froms.some(Boolean) && !joins.some(({ relation }) => relation)) {
      throw new QueryCompileError(
        "includeDeleted() was applied to a select that reads no soft-delete table.",
      );
    }
    return node;
  }

  // A join without ON (CROSS JOIN) cannot take a condition; filter it in WHERE.
  const whereRelations = [
    ...froms,
    ...joins.filter(({ join }) => !join.on).map(({ relation }) => relation),
  ];
  let where = node.where;
  for (const relation of whereRelations) {
    if (!relation) continue;
    const predicate = notDeleted(relation);
    where = where
      ? WhereNode.create(AndNode.create(predicate, where.where))
      : WhereNode.create(predicate);
  }

  const filteredJoins = joins.map(({ join, relation }) =>
    relation && join.on
      ? JoinNode.cloneWithOn(join, notDeleted(relation))
      : join,
  );

  return {
    ...node,
    ...(where ? { where } : {}),
    ...(filteredJoins.length ? { joins: filteredJoins } : {}),
  };
}

function describeRelation(node: OperationNode): SoftDeleteRelation | undefined {
  if (FinalTableNode.is(node)) {
    return describeRelation(unwrapFinalTable(node));
  }
  if (AliasNode.is(node)) {
    const inner = describeRelation(node.node);
    if (!inner || !IdentifierNode.is(node.alias)) return inner;
    return { ...inner, alias: node.alias.name };
  }
  if (TableNode.is(node)) {
    const tableName = node.table.identifier.name;
    const flag = SOFT_DELETE_COLUMNS[tableName];
    return flag ? { tableName, flag } : undefined;
  }
  return undefined;
}

/**
 * Always qualified (by alias, else table name): a bare flag column would bind
 * to a same-named SELECT alias, e.g. `0 AS is_deleted`.
 */
function notDeleted(relation: SoftDeleteRelation): OperationNode {
  return BinaryOperationNode.create(
    ReferenceNode.create(
      ColumnNode.create(relation.flag),
      TableNode.create(relation.alias ?? relation.tableName),
    ),
    OperatorNode.create("="),
    ValueNode.create(0),
  );
}
