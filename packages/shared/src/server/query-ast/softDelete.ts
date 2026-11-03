/**
 * Soft-delete filtering. Always-on: every compile walks this pass.
 *
 * Every FROM/JOIN relation whose table declares `softDelete` in the registry
 * ({@link SOFT_DELETE_COLUMNS}) gets `<flag> = 0`: AND-ed into the ON clause
 * for a JOIN with one, prepended to the WHERE otherwise. A RIGHT or FULL JOIN
 * in such a select fails to compile. A select that opts out with
 * `$call(includeDeleted())` is left unchanged; nested selects decide for
 * themselves. A select marked `$call(softDeleteAfterLimit())` keeps its rows
 * and is wrapped in an outer select that filters on its output instead.
 *
 * Runs before tenancy, so the tenancy pass prepends `project_id` ahead of the
 * flag: `where project_id = … and is_deleted = 0 and <caller predicates>`.
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
  SelectionNode,
  SelectQueryNode,
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
import { type ClickHouseSelectQueryNode } from "./nodes";
import { describeRelation } from "./relations";
import { SOFT_DELETE_COLUMNS } from "./schema";
import { SelectRewriteTransformer } from "./transformer";

const OUTER_PRESERVING_JOINS = new Set<JoinType>(["RightJoin", "FullJoin"]);
const AFTER_LIMIT_ALIAS = "latest";
const AFTER_LIMIT_JOINS = new Set<JoinType>(["InnerJoin", "CrossJoin"]);

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

class SoftDeleteFilterTransformer extends SelectRewriteTransformer {
  protected rewriteSelect(
    node: ClickHouseSelectQueryNode,
  ): ClickHouseSelectQueryNode {
    return filterSelect(node);
  }
}

function filterSelect(
  node: ClickHouseSelectQueryNode,
): ClickHouseSelectQueryNode {
  const froms = (node.from?.froms ?? []).map(softDeleteRelation);
  const joins = (node.joins ?? []).map((join) => ({
    join,
    relation: softDeleteRelation(join.table),
  }));

  const readsSoftDelete =
    froms.some(Boolean) || joins.some(({ relation }) => relation);
  if (node.softDeleteAfterLimit) {
    return filterAfterLimit(node, [
      ...froms,
      ...joins.map(({ relation }) => relation),
    ]);
  }
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

/**
 * `select latest.<output>, … from (<node + flag>) as latest where
 * latest.<flag> = 0`: the inner select keeps its ORDER BY / LIMIT, so a newer
 * deleted version wins the pick and the outer filter then drops it.
 */
function filterAfterLimit(
  node: ClickHouseSelectQueryNode,
  relations: ReadonlyArray<SoftDeleteRelation | undefined>,
): ClickHouseSelectQueryNode {
  const { relation, outputs } = checkAfterLimitShape(node, relations);
  return wrapAfterLimit(node, relation, outputs);
}

/**
 * Throws on shapes the wrap would change; returns the soft-delete relation and
 * the output names to wrap.
 */
function checkAfterLimitShape(
  node: ClickHouseSelectQueryNode,
  relations: ReadonlyArray<SoftDeleteRelation | undefined>,
): { relation: SoftDeleteRelation; outputs: string[] } {
  if (node.includeDeleted) {
    throw new QueryCompileError(
      "includeDeleted() and softDeleteAfterLimit() cannot mark the same select.",
    );
  }
  // The soft-delete tables this select reads directly (FROM and JOINs).
  const read = relations.filter((relation) => relation !== undefined);
  if (read.length !== 1) {
    throw new QueryCompileError(
      `softDeleteAfterLimit() needs a select that reads exactly one soft-delete table; it reads ${read.length}.`,
    );
  }
  const relation = read[0];
  if (!node.limit && !node.limitBy) {
    throw new QueryCompileError(
      "softDeleteAfterLimit() needs a LIMIT or LIMIT BY to filter after.",
    );
  }
  if (node.groupBy || node.setOperations) {
    throw new QueryCompileError(
      "softDeleteAfterLimit() cannot wrap a GROUP BY or set operation: the added flag would not match its shape.",
    );
  }
  // The added flag would join the DISTINCT key and change which rows survive.
  const distinct =
    node.distinctOn ||
    node.frontModifiers?.some(({ modifier }) => modifier === "Distinct");
  if (distinct) {
    throw new QueryCompileError(
      "softDeleteAfterLimit() cannot wrap a DISTINCT: the added flag would change its key.",
    );
  }
  // The outer filter would drop rows an outer join preserves; an ON filter keeps them.
  const outerJoin = node.joins?.find(
    ({ joinType }) => !AFTER_LIMIT_JOINS.has(joinType),
  );
  if (outerJoin) {
    throw new QueryCompileError(
      `softDeleteAfterLimit() cannot wrap a ${outerJoin.joinType}: the outer filter would drop its preserved rows.`,
    );
  }
  // Names of the outputs the outer select lists again; `*` is rejected below.
  const outputs = (node.selections ?? []).map((selection) => {
    const name = outputName(selection.selection);
    if (name === undefined) {
      throw new QueryCompileError(
        "softDeleteAfterLimit() needs every output named: select columns or alias expressions, not `*`.",
      );
    }
    return name;
  });
  if (outputs.length === 0) {
    throw new QueryCompileError(
      "softDeleteAfterLimit() was applied to a select without outputs.",
    );
  }
  if (outputs.includes(relation.flag)) {
    throw new QueryCompileError(
      `softDeleteAfterLimit() adds \`${relation.flag}\` itself; do not select it.`,
    );
  }
  return { relation, outputs };
}

function wrapAfterLimit(
  node: ClickHouseSelectQueryNode,
  relation: SoftDeleteRelation,
  outputs: ReadonlyArray<string>,
): ClickHouseSelectQueryNode {
  // Adds `<alias>.<flag> AS <flag>` as an output for the outer filter.
  const inner = SelectQueryNode.cloneWithSelections(node, [
    SelectionNode.create(
      AliasNode.create(
        qualifiedFlag(relation),
        IdentifierNode.create(relation.flag),
      ),
    ),
  ]);
  // `select latest.<output>, … from (<inner>) as latest`, without the flag.
  const outer = SelectQueryNode.cloneWithSelections(
    SelectQueryNode.createFrom([
      AliasNode.create(inner, IdentifierNode.create(AFTER_LIMIT_ALIAS)),
    ]),
    outputs.map((name) =>
      SelectionNode.create(
        ReferenceNode.create(
          ColumnNode.create(name),
          TableNode.create(AFTER_LIMIT_ALIAS),
        ),
      ),
    ),
  );
  // `where latest.<flag> = 0` drops the pick if it is a deleted version.
  return {
    ...outer,
    where: WhereNode.create(
      notDeleted({
        tableName: AFTER_LIMIT_ALIAS,
        alias: AFTER_LIMIT_ALIAS,
        flag: relation.flag,
      }),
    ),
  };
}

/** Name ClickHouse gives a select output: `e.span_id` → `span_id`, `x as y` → `y`. */
function outputName(node: OperationNode): string | undefined {
  if (AliasNode.is(node)) {
    return IdentifierNode.is(node.alias) ? node.alias.name : undefined;
  }
  if (ReferenceNode.is(node)) return outputName(node.column);
  if (ColumnNode.is(node)) return node.column.name;
  return undefined;
}

/** The soft-delete table `item` reads. */
function softDeleteRelation(
  item: OperationNode,
): SoftDeleteRelation | undefined {
  const { table, alias } = describeRelation(item);
  if (!table) return undefined;
  const tableName = table.table.identifier.name;
  const flag = SOFT_DELETE_COLUMNS[tableName];
  return flag ? { tableName, alias, flag } : undefined;
}

/**
 * Always qualified (by alias, else table name): a bare flag column would bind
 * to a same-named SELECT alias, e.g. `0 AS is_deleted`.
 */
function notDeleted(relation: SoftDeleteRelation): OperationNode {
  return BinaryOperationNode.create(
    qualifiedFlag(relation),
    OperatorNode.create("="),
    ValueNode.createImmediate(0),
  );
}

function qualifiedFlag(relation: SoftDeleteRelation): ReferenceNode {
  return ReferenceNode.create(
    ColumnNode.create(relation.flag),
    TableNode.create(relation.alias ?? relation.tableName),
  );
}

type SoftDeleteRelation = {
  tableName: string;
  alias?: string;
  flag: string;
};
