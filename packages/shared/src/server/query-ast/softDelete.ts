/**
 * Soft-delete filtering. Always-on: every compile walks this pass.
 *
 * Every FROM/JOIN relation whose table declares `softDelete` in the registry
 * ({@link SOFT_DELETE_COLUMNS}) gets `<flag> = 0`: AND-ed into the ON clause
 * for a JOIN with one, prepended to the WHERE otherwise. A RIGHT or FULL JOIN
 * in such a select fails to compile. A select that opts out with
 * `$call(includeDeleted())` is left unchanged; nested selects decide for
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
  type JoinType,
  type KyselyPlugin,
  type OperationNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type RootOperationNode,
} from "kysely";

import { QueryCompileError } from "./errors";
import {
  FinalTableNode,
  unwrapFinalTable,
  type ClickHouseSelectQueryNode,
} from "./nodes";
import { SOFT_DELETE_COLUMNS } from "./schema";
import { CteScopedTransformer } from "./transformer";

const OUTER_PRESERVING_JOINS = new Set<JoinType>(["RightJoin", "FullJoin"]);

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

class SoftDeleteFilterTransformer extends CteScopedTransformer {
  protected rewriteSelect(
    node: ClickHouseSelectQueryNode,
  ): ClickHouseSelectQueryNode {
    return filterSelect(node, (table) => this.isCte(table));
  }
}

function filterSelect(
  node: ClickHouseSelectQueryNode,
  isCte: (table: TableNode) => boolean,
): ClickHouseSelectQueryNode {
  const describe = (item: OperationNode) => {
    const relation = describeRelation(item);
    return relation && !isCte(relation.node) ? relation : undefined;
  };
  const froms = (node.from?.froms ?? []).map(describe);
  const joins = (node.joins ?? []).map((join) => ({
    join,
    relation: describe(join.table),
  }));

  const readsSoftDelete =
    froms.some(Boolean) || joins.some(({ relation }) => relation);
  if (node.includeDeleted) {
    if (!readsSoftDelete) {
      throw new QueryCompileError(
        "includeDeleted() was applied to a select that reads no soft-delete table.",
      );
    }
    return node;
  }

  // An ON filter cannot drop a RIGHT/FULL JOIN's preserved rows, and a WHERE
  // filter on the other side would drop preserved rows that matched only
  // deleted rows.
  const outerJoin = joins.find(({ join }) =>
    OUTER_PRESERVING_JOINS.has(join.joinType),
  );
  if (readsSoftDelete && outerJoin) {
    throw new QueryCompileError(
      `${outerJoin.join.joinType} is not supported on a select that reads a soft-delete table. Filter the table in a subquery, or opt out with includeDeleted().`,
    );
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
    ...(filteredJoins.length > 0 ? { joins: filteredJoins } : {}),
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
    return flag ? { tableName, flag, node } : undefined;
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

type SoftDeleteRelation = {
  tableName: string;
  alias?: string;
  flag: string;
  node: TableNode;
};
