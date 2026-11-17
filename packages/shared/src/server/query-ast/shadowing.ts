import {
  AliasNode,
  BinaryOperationNode,
  ColumnNode,
  IdentifierNode,
  OperatorNode,
  RawNode,
  ReferenceNode,
  SelectQueryNode,
  TupleNode,
  type KyselyPlugin,
  type OperationNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type RootOperationNode,
} from "kysely";

import { cteName } from "./ctes";
import { UnscopedRelationError } from "./errors";
import {
  ArrayJoinNode,
  FinalTableNode,
  unwrapFinalTable,
  walkNodes,
} from "./nodes";
import { selectRelations } from "./relations";
import { COLUMN_DATA_TYPES } from "./schema";

/**
 * Rejects every name that ClickHouse could resolve before a relation name,
 * so `t.project_id`, the predicate the tenancy pass injects, always reads the
 * column of relation `t`. ClickHouse looks a qualifier up as an expression
 * alias first, and as a column of the relation itself before the relation:
 *
 *     select cast(tuple('p'), 'Tuple(project_id String)') as t
 *     from traces as t where t.project_id = 'p'   -- reads the tuple, not t
 *
 * Rejected, over the whole query (subqueries, CTE bodies and UNION branches
 * included, so no scope rule decides the outcome):
 * - an expression alias (`… as t` anywhere outside FROM/JOIN), an ARRAY JOIN
 *   alias, or a lambda parameter named like a FROM/JOIN relation (its alias,
 *   else its table name) or a CTE;
 * - a FROM/JOIN alias named like a registry column.
 */
export class NameShadowingPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    assertNoShadowing(args.node);
    return args.node;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

function assertNoShadowing(root: OperationNode): void {
  const relationNames = new Set<string>();
  // FROM/JOIN alias nodes, by identity: every other alias names an expression.
  const relationAliases = new Set<OperationNode>();
  walkNodes(root, (node) => {
    if (!SelectQueryNode.is(node)) return;
    for (const cte of node.with?.expressions ?? []) {
      relationNames.add(cteName(cte));
    }
    for (const relation of selectRelations(node)) {
      const aliasNode = relationAlias(relation.node);
      if (aliasNode) relationAliases.add(aliasNode);
      const name = relation.alias ?? relation.table?.table.identifier.name;
      if (name === undefined) continue;
      if (relation.alias && relation.alias in COLUMN_DATA_TYPES) {
        throw new UnscopedRelationError(
          `FROM/JOIN alias "${relation.alias}" is also a column name: ClickHouse reads "${relation.alias}.<field>" as a subcolumn of that column. Choose another alias.`,
        );
      }
      relationNames.add(name);
    }
  });

  walkNodes(root, (node) => {
    for (const name of expressionNames(node, relationAliases)) {
      if (relationNames.has(name)) {
        throw new UnscopedRelationError(
          `"${name}" names both a relation and an expression (a select or ARRAY JOIN alias, or a lambda parameter): ClickHouse reads "${name}.<column>" from the expression, so a qualified column of the relation would read it instead. Rename one of them.`,
        );
      }
    }
  });
}

/** The alias node of a FROM/JOIN item: `as t` in `traces as t [final]`. */
function relationAlias(node: OperationNode): OperationNode | undefined {
  const withoutFinal = FinalTableNode.is(node) ? unwrapFinalTable(node) : node;
  return AliasNode.is(withoutFinal) ? withoutFinal : undefined;
}

/** The names `node` binds as an expression, if any. */
function expressionNames(
  node: OperationNode,
  relationAliases: ReadonlySet<OperationNode>,
): string[] {
  if (AliasNode.is(node)) {
    return relationAliases.has(node) ? [] : [boundName(node.alias)];
  }
  // ARRAY JOIN is an extra select field, outside Kysely's node kinds.
  const clause: { kind: string } = node;
  if (ArrayJoinNode.is(clause)) {
    return clause.items.map((item) => item.alias.name);
  }
  if (
    BinaryOperationNode.is(node) &&
    OperatorNode.is(node.operator) &&
    node.operator.operator === "->"
  ) {
    const params = TupleNode.is(node.leftOperand)
      ? node.leftOperand.values
      : [node.leftOperand];
    return params.map(boundName);
  }
  return [];
}

const PLAIN_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The name an alias or lambda parameter binds, as ClickHouse reads it: `t`
 * for `as t`, `as sql.id("t")`, ``as sql`t` `` and the lambda parameter
 * `sql.ref("t")`. Throws for any other shape, whose name the pass cannot
 * check.
 */
function boundName(node: OperationNode): string {
  // The compiler rejects an identifier that is not a plain name.
  if (IdentifierNode.is(node)) return node.name;
  const name = nameText(node);
  if (name === undefined || !PLAIN_NAME.test(name)) {
    throw new UnscopedRelationError(
      "An alias or lambda parameter must be a plain name: the shadowing check cannot tell which relation another shape would shadow.",
    );
  }
  return name;
}

/** The text of a name node; raw SQL counts when it holds only names. */
function nameText(node: OperationNode): string | undefined {
  if (IdentifierNode.is(node)) return node.name;
  if (ColumnNode.is(node)) return node.column.name;
  if (ReferenceNode.is(node) && ColumnNode.is(node.column) && !node.table) {
    return node.column.column.name;
  }
  if (!RawNode.is(node)) return undefined;
  let text = node.sqlFragments[0] ?? "";
  for (const [i, parameter] of node.parameters.entries()) {
    const part = nameText(parameter);
    if (part === undefined) return undefined;
    text += part + (node.sqlFragments[i + 1] ?? "");
  }
  return text.trim();
}
