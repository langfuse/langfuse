import {
  AndNode,
  BinaryOperationNode,
  ColumnNode,
  JoinNode,
  OperatorNode,
  OrNode,
  ParensNode,
  RawNode,
  ReferenceNode,
  SelectQueryNode,
  TableNode,
  ValueNode,
  WhereNode,
  type KyselyPlugin,
  type OperationNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type RootOperationNode,
} from "kysely";

import { QueryCompileError, UnscopedRelationError } from "./errors";
import { walkNodes, type ClickHouseSelectQueryNode } from "./nodes";
import { describeRelation } from "./relations";
import { TENANTED_TABLES } from "./schema";
import { SelectRewriteTransformer } from "./transformer";

const PROJECT_ID_COLUMN = "project_id";

/**
 * Identity-based stamp. A copied `langfuseTenancy` property on a cloned node
 * is not enough — only trees that actually went through
 * {@link TenancyInjectionPlugin} are in this set.
 */
const TENANCY_STAMPED = new WeakSet<object>();

type ScopedRelation =
  | { kind: "table"; tableName: string; alias?: string }
  | { kind: "subquery" }
  | { kind: "raw" }
  | { kind: "other" };

/**
 * Mandatory tenancy injection. Attaches `project_id = {projectId}` to every
 * tenanted physical relation that does not already have that predicate, then
 * stamps the tree so {@link ClickHouseQueryCompiler} will compile it.
 *
 * FROM/JOIN sources must be table references or subqueries; anything else,
 * such as a table function, is rejected. Any `RawNode` whose SQL fragments
 * introduce a relation (`SELECT` / `FROM` / `JOIN`) is rejected — not only
 * FROM/JOIN table sources. Kysely's own keyword fragments (`asc` / `desc`) are
 * not relations and are allowed.
 */
export class TenancyInjectionPlugin implements KyselyPlugin {
  constructor(private readonly projectId: string) {
    requireProjectId(projectId);
  }

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    const transformer = new TenancyInjectionTransformer(this.projectId);
    const injected = transformer.transformNode(args.node) as RootOperationNode;
    rejectUnscopedRawSql(injected);
    return stampTenancy(injected);
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

class TenancyInjectionTransformer extends SelectRewriteTransformer {
  constructor(private readonly projectId: string) {
    super();
  }

  protected rewriteSelect(
    node: ClickHouseSelectQueryNode,
  ): ClickHouseSelectQueryNode {
    return injectSelect(node, this.projectId);
  }
}

function injectSelect(
  node: ClickHouseSelectQueryNode,
  projectId: string,
): ClickHouseSelectQueryNode {
  const fromRelations = (node.from?.froms ?? []).map(classifyRelation);
  const joinRelations = (node.joins ?? []).map((join) => ({
    join,
    relation: classifyRelation(join.table),
  }));

  for (const relation of fromRelations) {
    assertRelationAllowed(relation);
  }
  for (const { relation } of joinRelations) {
    assertRelationAllowed(relation);
  }

  const isTenantedTable = (
    r: ScopedRelation,
  ): r is Extract<ScopedRelation, { kind: "table" }> =>
    r.kind === "table" && TENANTED_TABLES.has(r.tableName);

  const tenantedFrom = fromRelations.filter(isTenantedTable);
  const tenantedJoinCount = joinRelations.filter(({ relation }) =>
    isTenantedTable(relation),
  ).length;

  // When more than one tenanted relation is in scope, an unqualified
  // `project_id = …` predicate is ambiguous — it cannot be proven to scope a
  // *specific* relation — so a table-qualified reference is required before a
  // relation counts as already covered. With a single tenanted relation an
  // unqualified reference is unambiguous and accepted.
  const requireQualified = tenantedFrom.length + tenantedJoinCount > 1;

  let where = node.where;
  for (const table of tenantedFrom) {
    if (!predicateCovers(where?.where, table, projectId, requireQualified)) {
      const predicate = projectIdPredicate(table, projectId);
      // Prepend: the tenancy scope is the leading WHERE predicate, so its bound
      // value keeps a stable (first) parameter position regardless of the other
      // predicates a caller wrote.
      where = where
        ? WhereNode.create(AndNode.create(predicate, where.where))
        : WhereNode.create(predicate);
    }
  }

  const joins = joinRelations.map(({ join, relation }) => {
    if (!isTenantedTable(relation)) {
      return join;
    }
    const onExpr = join.on?.on;
    if (
      predicateCovers(onExpr, relation, projectId, requireQualified) ||
      predicateCovers(where?.where, relation, projectId, requireQualified)
    ) {
      return join;
    }
    const predicate = projectIdPredicate(relation, projectId);
    if (!join.on) {
      return JoinNode.createWithOn(join.joinType, join.table, predicate);
    }
    return JoinNode.cloneWithOn(join, predicate);
  });

  return {
    ...node,
    ...(where ? { where } : {}),
    ...(joins.length ? { joins } : {}),
  };
}

function assertRelationAllowed(relation: ScopedRelation): void {
  if (relation.kind === "raw") {
    throw new UnscopedRelationError(
      "Raw SQL table sources are rejected: they can introduce an unscoped relation that the tenancy pass cannot prove. Use a traced table reference instead.",
    );
  }
  if (relation.kind === "other") {
    throw new UnscopedRelationError(
      "Only table references and subqueries are accepted as FROM/JOIN sources: a table function such as remote() or merge() reads a relation the tenancy pass cannot scope.",
    );
  }
}

function classifyRelation(node: OperationNode): ScopedRelation {
  const { source, table, alias } = describeRelation(node);
  if (table) {
    return { kind: "table", tableName: tableNameOf(table), alias };
  }
  if (RawNode.is(source)) return { kind: "raw" };
  if (SelectQueryNode.is(source)) return { kind: "subquery" };
  return { kind: "other" };
}

function tableNameOf(node: TableNode): string {
  return node.table.identifier.name;
}

function projectIdColumn(
  table: Extract<ScopedRelation, { kind: "table" }>,
): OperationNode {
  const column = ColumnNode.create(PROJECT_ID_COLUMN);
  return table.alias
    ? ReferenceNode.create(column, TableNode.create(table.alias))
    : column;
}

function projectIdPredicate(
  table: Extract<ScopedRelation, { kind: "table" }>,
  projectId: string,
): OperationNode {
  return BinaryOperationNode.create(
    projectIdColumn(table),
    OperatorNode.create("="),
    ValueNode.create(projectId),
  );
}

/**
 * True only when `expr` provably constrains `table` to `projectId`. Both halves
 * matter: the left operand must be `table`'s `project_id` column (qualified when
 * {@link requireQualified}, see {@link injectSelect}) *and* the right operand
 * must be the literal `projectId` the query is compiled for. A predicate
 * such as `project_id = <someOtherProject>` or `o.project_id = t.project_id`
 * does not scope the relation to the request's project, so it is not covered and
 * the pass injects the correct predicate.
 */
function predicateCovers(
  expr: OperationNode | undefined,
  table: Extract<ScopedRelation, { kind: "table" }>,
  projectId: string,
  requireQualified: boolean,
): boolean {
  if (!expr) return false;
  if (AndNode.is(expr)) {
    return (
      predicateCovers(expr.left, table, projectId, requireQualified) ||
      predicateCovers(expr.right, table, projectId, requireQualified)
    );
  }
  if (OrNode.is(expr)) {
    return (
      predicateCovers(expr.left, table, projectId, requireQualified) &&
      predicateCovers(expr.right, table, projectId, requireQualified)
    );
  }
  if (ParensNode.is(expr)) {
    return predicateCovers(expr.node, table, projectId, requireQualified);
  }
  if (!BinaryOperationNode.is(expr) || !OperatorNode.is(expr.operator)) {
    return false;
  }
  if (!isProjectIdColumn(expr.leftOperand, table, requireQualified)) {
    return false;
  }
  return (
    expr.operator.operator === "=" &&
    isProjectIdValue(expr.rightOperand, projectId)
  );
}

function isProjectIdColumn(
  node: OperationNode,
  table: Extract<ScopedRelation, { kind: "table" }>,
  requireQualified: boolean,
): boolean {
  if (ColumnNode.is(node)) {
    // Bare column with no table qualifier: accept only when unambiguous.
    return !requireQualified && node.column.name === PROJECT_ID_COLUMN;
  }
  if (ReferenceNode.is(node) && ColumnNode.is(node.column)) {
    if (node.column.column.name !== PROJECT_ID_COLUMN) return false;
    if (!node.table) return !requireQualified;
    const referenced = tableNameOf(node.table);
    // Once a relation is aliased, its physical table name is no longer a valid
    // SQL qualifier for it — only the alias is. Accepting the physical name
    // here would let one relation's predicate "cover" a *different* relation
    // whose physical name collides with this alias (e.g. `scores AS traces`
    // joined to `traces AS t`), leaving the second relation unscoped. Mirror
    // projectIdPredicate: alias when present, else the table name.
    return table.alias
      ? referenced === table.alias
      : referenced === table.tableName;
  }
  return false;
}

function isProjectIdValue(node: OperationNode, projectId: string): boolean {
  return ValueNode.is(node) && node.value === projectId;
}

export function requireProjectId(projectId: string | undefined): string {
  if (typeof projectId !== "string" || !projectId) {
    throw new QueryCompileError(
      "projectId is required: a query with no tenancy scope cannot compile.",
    );
  }
  return projectId;
}

function stampTenancy<T extends object>(node: T): T {
  TENANCY_STAMPED.add(node);
  return node;
}

/**
 * Re-stamp a tree after a later rewrite pass. Identity-based: a copied
 * property is not a valid stamp. Dedup lowering (and any future rewrite)
 * must call this on the node it returns, because a new root object is not
 * the object the tenancy pass stamped.
 */
export function stampCompiledTree<T extends object>(node: T): T {
  return stampTenancy(node);
}

export function assertTenancyStamped(node: RootOperationNode): void {
  if (!TENANCY_STAMPED.has(node)) {
    throw new QueryCompileError(
      "Refusing to compile: the tenancy injection pass was not applied. Compile through compileClickhouseQuery() with a projectId.",
    );
  }
}

const RAW_RELATION_SQL = /\b(?:from|join|select)\b/i;

function rejectUnscopedRawSql(root: unknown): void {
  walkNodes(root, (node) => {
    if (!RawNode.is(node)) return;
    if (node.sqlFragments.some((fragment) => RAW_RELATION_SQL.test(fragment))) {
      throw new UnscopedRelationError(
        "Raw SQL fragments that introduce a relation (SELECT/FROM/JOIN) are rejected in any position: they can bypass tenancy injection. Use traced table and column references instead.",
      );
    }
    // `x IN ${sql.table("traces")}` reads a table with no FROM to scope.
    if (node.parameters.some((parameter) => TableNode.is(parameter))) {
      throw new UnscopedRelationError(
        "A table reference inside raw SQL (sql.table) is rejected in any position: it reads a relation the tenancy pass cannot scope. Read the table through selectFrom/innerJoin or a subquery instead.",
      );
    }
  });
}

/**
 * Rejects a standalone expression that reads a relation: a subquery, or a raw
 * fragment that introduces one. Outside a query there is no tenancy scope to
 * inject into it.
 */
export function assertRelationFree(node: OperationNode): void {
  rejectUnscopedRawSql(node);
  rejectSubqueries(node);
}

function rejectSubqueries(root: unknown): void {
  walkNodes(root, (node) => {
    if (SelectQueryNode.is(node)) {
      throw new UnscopedRelationError(
        "A standalone expression cannot contain a subquery: it has no tenancy scope. Compile the query through compileClickhouseQuery() instead.",
      );
    }
  });
}
