import {
  AndNode,
  BinaryOperationNode,
  ColumnNode,
  JoinNode,
  OnNode,
  OperatorNode,
  OrNode,
  ParensNode,
  RawNode,
  ReferenceNode,
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

import { QueryCompileError, UnscopedRelationError } from "./errors";
import {
  bracketForAnd,
  needsBracketsUnderAnd,
  walkNodes,
  type ClickHouseSelectQueryNode,
} from "./nodes";
import { describeRelation } from "./relations";
import { TENANTED_TABLES } from "./schema";
import { SelectRewriteTransformer } from "./transformer";

const PROJECT_ID_COLUMN = "project_id";

/**
 * The join types the pass accepts. Every other type throws: a cross join has
 * no ON clause to scope (ClickHouse has no `CROSS JOIN … ON`), and lateral,
 * apply and USING joins are not ClickHouse SQL.
 */
const ALLOWED_JOINS: ReadonlySet<JoinType> = new Set([
  "InnerJoin",
  "LeftJoin",
  "RightJoin",
  "FullJoin",
]);

/**
 * Join types whose ON clause drops the joined table's non-matching rows, so a
 * project condition there scopes the table.
 */
const ON_SCOPABLE_JOINS: ReadonlySet<JoinType> = new Set([
  "InnerJoin",
  "LeftJoin",
]);

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

/**
 * Visits every select in the tree, subqueries and CTE bodies included, and
 * scopes that select's own FROM and JOIN relations.
 */
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

/**
 * Scopes each tenanted FROM table in WHERE, and each tenanted join table in
 * WHERE or, for an inner or left join, in ON. Throws for more than one FROM
 * item, for a join type or relation source the pass does not accept, and for a
 * right or full join on a tenanted table that WHERE does not scope.
 *
 * Kysely keeps the FROM relations in `node.from.froms` and each join in
 * `node.joins`: a `JoinNode` holds the join type, the joined relation (`table`)
 * and its `on` condition. Below, `join` is that `JoinNode` and `relation` its
 * joined relation, classified.
 */
function injectSelect(
  node: ClickHouseSelectQueryNode,
  projectId: string,
): ClickHouseSelectQueryNode {
  const fromRelations = (node.from?.froms ?? []).map(classifyRelation);
  const joinRelations = (node.joins ?? []).map((join) => ({
    join,
    relation: classifyRelation(join.table),
  }));

  assertSingleFrom(fromRelations);
  for (const relation of fromRelations) {
    assertRelationAllowed(relation);
  }
  for (const { join, relation } of joinRelations) {
    assertJoinTypeAllowed(join);
    assertRelationAllowed(relation);
  }

  const where = scopeFromInWhere(
    node.where,
    fromRelations.filter(isTenantedTable),
    projectId,
  );
  const joins = joinRelations.map(({ join, relation }) =>
    scopeJoin(join, relation, where, projectId),
  );

  return {
    ...node,
    ...(where ? { where } : {}),
    ...(joins.length ? { joins } : {}),
  };
}

function isTenantedTable(
  r: ScopedRelation,
): r is Extract<ScopedRelation, { kind: "table" }> {
  return r.kind === "table" && TENANTED_TABLES.has(r.tableName);
}

/**
 * Prepends `<alias>.project_id = {projectId}` to WHERE for each tenanted FROM
 * table WHERE does not scope yet.
 */
function scopeFromInWhere(
  where: WhereNode | undefined,
  tenantedFrom: Extract<ScopedRelation, { kind: "table" }>[],
  projectId: string,
): WhereNode | undefined {
  let scoped = where;
  for (const table of tenantedFrom) {
    if (!predicateCovers(scoped?.where, table, projectId)) {
      const predicate = projectIdPredicate(table, projectId);
      // Prepend: the tenancy scope is the leading WHERE predicate, so its bound
      // value keeps a stable (first) parameter position regardless of the other
      // predicates a caller wrote.
      scoped = scoped
        ? WhereNode.create(
            AndNode.create(predicate, bracketForAnd(scoped.where)),
          )
        : WhereNode.create(predicate);
    }
  }
  return scoped;
}

/**
 * Returns the join unchanged when its relation is not a tenanted table, or
 * when WHERE or its own ON already scopes it; else ANDs
 * `<alias>.project_id = {projectId}` into its ON. Throws when the table needs
 * an ON scope its join type cannot give.
 */
function scopeJoin(
  join: JoinNode,
  relation: ScopedRelation,
  where: WhereNode | undefined,
  projectId: string,
): JoinNode {
  if (!isTenantedTable(relation)) return join;
  if (predicateCovers(where?.where, relation, projectId)) return join;
  assertScopableInOn(join, relation);
  if (predicateCovers(join.on?.on, relation, projectId)) return join;
  // `on <caller on> and <alias>.project_id = {projectId}`
  const predicate = projectIdPredicate(relation, projectId);
  if (!join.on) {
    return JoinNode.createWithOn(join.joinType, join.table, predicate);
  }
  return {
    ...join,
    on: OnNode.create(AndNode.create(bracketForAnd(join.on.on), predicate)),
  };
}

/**
 * Throws for every join type outside {@link ON_SCOPABLE_JOINS}: a right or
 * full join keeps the joined table's unmatched rows, so a project condition in
 * its ON clause scopes nothing. It does not read WHERE; {@link scopeJoin} calls
 * it only for a table WHERE does not scope.
 */
function assertScopableInOn(
  join: JoinNode,
  relation: Extract<ScopedRelation, { kind: "table" }>,
): void {
  if (!ON_SCOPABLE_JOINS.has(join.joinType)) {
    throw new UnscopedRelationError(
      `${join.joinType} on tenanted table "${relation.alias ?? relation.tableName}" cannot be scoped in its ON clause: it keeps rows of other projects. Scope the table in a subquery, or filter its project_id in WHERE.`,
    );
  }
}

/** Throws for every join type outside {@link ALLOWED_JOINS}. */
function assertJoinTypeAllowed(join: JoinNode): void {
  if (!ALLOWED_JOINS.has(join.joinType)) {
    throw new UnscopedRelationError(
      `${join.joinType} is rejected: only inner, left, right and full joins are accepted. A cross join has no ON clause the tenancy pass can scope, and lateral, apply and USING joins are not ClickHouse SQL. Use an inner join with an explicit ON condition instead.`,
    );
  }
}

/** Throws for a comma FROM list, which ClickHouse reads as a cross join. */
function assertSingleFrom(fromRelations: ScopedRelation[]): void {
  if (fromRelations.length > 1) {
    throw new UnscopedRelationError(
      `A select with ${fromRelations.length} FROM items is rejected: ClickHouse reads \`from a, b\` as a cross join. Use an inner join with an explicit ON condition instead.`,
    );
  }
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

/**
 * `<alias>.project_id`, or `<table>.project_id` for an unaliased table. Never
 * bare: a bare column can bind to another relation in scope.
 */
function projectIdColumn(
  table: Extract<ScopedRelation, { kind: "table" }>,
): OperationNode {
  return ReferenceNode.create(
    ColumnNode.create(PROJECT_ID_COLUMN),
    TableNode.create(table.alias ?? table.tableName),
  );
}

/** `<alias>.project_id = {projectId}`, the id bound. */
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
 * matter: the left operand must be `table`'s qualified `project_id` column *and*
 * the right operand must be the literal `projectId` the query is compiled for.
 * A predicate such as `project_id = <someOtherProject>` or
 * `o.project_id = t.project_id` does not scope the relation to the request's
 * project, so it is not covered and the pass injects the correct predicate.
 */
function predicateCovers(
  expr: OperationNode | undefined,
  table: Extract<ScopedRelation, { kind: "table" }>,
  projectId: string,
): boolean {
  if (!expr) return false;
  if (AndNode.is(expr)) {
    // `pid and a or b` compiles flat and reads `(pid and a) or b`: a conjunct
    // only covers when every sibling binds under the AND.
    if (needsBracketsUnderAnd(expr)) return false;
    return (
      predicateCovers(expr.left, table, projectId) ||
      predicateCovers(expr.right, table, projectId)
    );
  }
  if (OrNode.is(expr)) {
    return (
      predicateCovers(expr.left, table, projectId) &&
      predicateCovers(expr.right, table, projectId)
    );
  }
  if (ParensNode.is(expr)) {
    return predicateCovers(expr.node, table, projectId);
  }
  if (!BinaryOperationNode.is(expr) || !OperatorNode.is(expr.operator)) {
    return false;
  }
  if (!isProjectIdColumn(expr.leftOperand, table)) {
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
): boolean {
  // A bare `project_id` never counts: ClickHouse may bind it to a SELECT or
  // ARRAY JOIN alias, or to another relation in scope, instead of `table`.
  if (ReferenceNode.is(node) && ColumnNode.is(node.column) && node.table) {
    if (node.column.column.name !== PROJECT_ID_COLUMN) return false;
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
