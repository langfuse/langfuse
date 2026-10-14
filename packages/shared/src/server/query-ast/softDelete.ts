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
  type KyselyPlugin,
  type OperationNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryId,
  type RootOperationNode,
  type SelectQueryNode,
} from "kysely";

import { QueryCompileError } from "./errors";
import { type ClickHouseSelectQueryNode } from "./nodes";
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
   * CTE, not the physical table. Pushed before a select's children are
   * transformed and popped after, so it is empty between compiles.
   */
  private readonly cteScopes: Set<string>[] = [];

  protected override transformSelectQuery(
    node: SelectQueryNode,
    queryId?: QueryId,
  ): SelectQueryNode {
    const ctes = cteNames(node);
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
}

function cteNames(node: SelectQueryNode): Set<string> {
  return new Set(
    (node.with?.expressions ?? []).map(
      (expr) => expr.name.table.table.identifier.name,
    ),
  );
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

  // An unaliased flag column is ambiguous once a second relation is in scope.
  const qualifyBare = froms.length + joins.length > 1;

  // A join without ON (CROSS JOIN) cannot take a condition; filter it in WHERE.
  const whereRelations = [
    ...froms,
    ...joins.filter(({ join }) => !join.on).map(({ relation }) => relation),
  ];
  let where = node.where;
  for (const relation of whereRelations) {
    if (!relation) continue;
    const predicate = notDeleted(relation, qualifyBare);
    where = where
      ? WhereNode.create(AndNode.create(predicate, where.where))
      : WhereNode.create(predicate);
  }

  const filteredJoins = joins.map(({ join, relation }) =>
    relation && join.on
      ? JoinNode.cloneWithOn(join, notDeleted(relation, qualifyBare))
      : join,
  );

  return {
    ...node,
    ...(where ? { where } : {}),
    ...(filteredJoins.length ? { joins: filteredJoins } : {}),
  };
}

function describeRelation(node: OperationNode): SoftDeleteRelation | undefined {
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

function notDeleted(
  relation: SoftDeleteRelation,
  qualifyBare: boolean,
): OperationNode {
  const column = ColumnNode.create(relation.flag);
  const qualifier = relation.alias ?? (qualifyBare ? relation.tableName : "");
  return BinaryOperationNode.create(
    qualifier
      ? ReferenceNode.create(column, TableNode.create(qualifier))
      : column,
    OperatorNode.create("="),
    ValueNode.create(0),
  );
}
