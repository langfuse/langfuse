import {
  AliasNode,
  AndNode,
  BinaryOperationNode,
  ColumnNode,
  IdentifierNode,
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
  type QueryId,
  type RootOperationNode,
} from "kysely";

import type { ExecutionContext } from "../executionContext";
import { QueryCompileError, UnscopedRelationError } from "./errors";
import { type ClickHouseSelectQueryNode } from "./nodes";
import { TENANTED_TABLES } from "./schema";
import { ClickHouseOperationNodeTransformer } from "./transformer";

const PROJECT_ID_COLUMN = "project_id";

/**
 * Identity-based stamp. A copied `langfuseTenancy` property on a cloned node
 * is not enough — only trees that actually went through
 * {@link TenancyInjectionPlugin} are in this set.
 */
const TENANCY_STAMPED = new WeakSet<object>();

type Relation =
  | { kind: "table"; tableName: string; alias?: string }
  | { kind: "subquery"; node: SelectQueryNode }
  | { kind: "raw" }
  | { kind: "other" };

/**
 * Mandatory tenancy injection. Attaches `project_id = {projectId}` to every
 * tenanted physical relation that does not already have that predicate, then
 * stamps the tree so {@link ClickHouseQueryCompiler} will compile it.
 *
 * Any `RawNode` whose SQL fragments introduce a relation (`SELECT` / `FROM` /
 * `JOIN`) is rejected — not only FROM/JOIN table sources. Kysely's own
 * keyword fragments (`asc` / `desc`) are not relations and are allowed.
 */
export class TenancyInjectionPlugin implements KyselyPlugin {
  constructor(private readonly ctx: ExecutionContext) {
    if (!ctx?.projectId) {
      throw new QueryCompileError(
        "ExecutionContext.projectId is required for tenancy injection",
      );
    }
  }

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    const transformer = new TenancyInjectionTransformer(this.ctx);
    const injected = transformer.transformNode(args.node) as RootOperationNode;
    rejectUnscopedRawSql(injected);
    return stampTenancy(injected);
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

class TenancyInjectionTransformer extends ClickHouseOperationNodeTransformer {
  constructor(private readonly ctx: ExecutionContext) {
    super();
  }

  protected override transformSelectQuery(
    node: SelectQueryNode,
    queryId?: QueryId,
  ): SelectQueryNode {
    const withChildren = super.transformSelectQuery(
      node,
      queryId,
    ) as ClickHouseSelectQueryNode;
    return injectSelect(withChildren, this.ctx, collectCteNames(withChildren));
  }
}

function collectCteNames(node: SelectQueryNode): Set<string> {
  const names = new Set<string>();
  for (const expr of node.with?.expressions ?? []) {
    names.add(tableNameOf(expr.name.table));
  }
  return names;
}

function injectSelect(
  node: ClickHouseSelectQueryNode,
  ctx: ExecutionContext,
  cteNames: Set<string>,
): ClickHouseSelectQueryNode {
  let next: ClickHouseSelectQueryNode = { ...node };

  const fromRelations = (next.from?.froms ?? []).map(describeRelation);
  const joinRelations = (next.joins ?? []).map((join) => ({
    join,
    relation: describeRelation(join.table),
  }));

  for (const relation of fromRelations) {
    assertRelationAllowed(relation, cteNames);
  }
  for (const { relation } of joinRelations) {
    assertRelationAllowed(relation, cteNames);
  }

  const tenantedFrom = fromRelations.filter(
    (r): r is Extract<Relation, { kind: "table" }> =>
      r.kind === "table" &&
      TENANTED_TABLES.has(r.tableName) &&
      !cteNames.has(r.tableName),
  );

  let where = next.where;
  for (const table of tenantedFrom) {
    if (!predicateCovers(where?.where, table)) {
      const predicate = projectIdPredicate(table, ctx.projectId);
      where = where
        ? WhereNode.cloneWithOperation(where, "And", predicate)
        : WhereNode.create(predicate);
    }
  }

  const joins = (next.joins ?? []).map((join, i) => {
    const { relation } = joinRelations[i];
    if (
      relation.kind !== "table" ||
      !TENANTED_TABLES.has(relation.tableName) ||
      cteNames.has(relation.tableName)
    ) {
      return join;
    }
    const onExpr = join.on?.on;
    if (
      predicateCovers(onExpr, relation) ||
      predicateCovers(where?.where, relation)
    ) {
      return join;
    }
    const predicate = projectIdPredicate(relation, ctx.projectId);
    if (!join.on) {
      return JoinNode.createWithOn(join.joinType, join.table, predicate);
    }
    return JoinNode.cloneWithOn(join, predicate);
  });

  next = {
    ...next,
    ...(where ? { where } : {}),
    ...(joins.length ? { joins } : {}),
  };

  return next;
}

function assertRelationAllowed(
  relation: Relation,
  cteNames: Set<string>,
): void {
  if (relation.kind === "raw") {
    throw new UnscopedRelationError(
      "Raw SQL table sources are rejected: they can introduce an unscoped relation that the tenancy pass cannot prove. Use a traced table reference instead.",
    );
  }
  if (
    relation.kind === "table" &&
    TENANTED_TABLES.has(relation.tableName) &&
    !cteNames.has(relation.tableName)
  ) {
    return;
  }
}

function describeRelation(node: OperationNode): Relation {
  if (RawNode.is(node)) {
    return { kind: "raw" };
  }
  if (AliasNode.is(node)) {
    const inner = describeRelation(node.node);
    if (inner.kind === "table") {
      const alias = identifierName(node.alias);
      return { kind: "table", tableName: inner.tableName, alias };
    }
    if (inner.kind === "raw") {
      return { kind: "raw" };
    }
    return inner;
  }
  if (TableNode.is(node)) {
    return { kind: "table", tableName: tableNameOf(node) };
  }
  if (SelectQueryNode.is(node)) {
    return { kind: "subquery", node };
  }
  return { kind: "other" };
}

function tableNameOf(node: TableNode): string {
  return node.table.identifier.name;
}

function identifierName(node: OperationNode): string | undefined {
  if (IdentifierNode.is(node)) return node.name;
  return undefined;
}

function projectIdPredicate(
  table: Extract<Relation, { kind: "table" }>,
  projectId: string,
): OperationNode {
  const column = ColumnNode.create(PROJECT_ID_COLUMN);
  const left = table.alias
    ? ReferenceNode.create(column, TableNode.create(table.alias))
    : column;
  return BinaryOperationNode.create(
    left,
    OperatorNode.create("="),
    ValueNode.create(projectId),
  );
}

function predicateCovers(
  expr: OperationNode | undefined,
  table: Extract<Relation, { kind: "table" }>,
): boolean {
  if (!expr) return false;
  if (AndNode.is(expr)) {
    return (
      predicateCovers(expr.left, table) || predicateCovers(expr.right, table)
    );
  }
  if (OrNode.is(expr)) {
    return (
      predicateCovers(expr.left, table) && predicateCovers(expr.right, table)
    );
  }
  if (ParensNode.is(expr)) {
    return predicateCovers(expr.node, table);
  }
  if (!BinaryOperationNode.is(expr)) return false;
  if (!OperatorNode.is(expr.operator) || expr.operator.operator !== "=") {
    return false;
  }
  return isProjectIdColumn(expr.leftOperand, table);
}

function isProjectIdColumn(
  node: OperationNode,
  table: Extract<Relation, { kind: "table" }>,
): boolean {
  if (ColumnNode.is(node)) {
    return node.column.name === PROJECT_ID_COLUMN;
  }
  if (ReferenceNode.is(node) && ColumnNode.is(node.column)) {
    if (node.column.column.name !== PROJECT_ID_COLUMN) return false;
    if (!node.table) return true;
    const referenced = tableNameOf(node.table);
    return referenced === table.tableName || referenced === table.alias;
  }
  return false;
}

export function requireExecutionContext(
  ctx: ExecutionContext | undefined,
): ExecutionContext {
  if (!ctx?.projectId) {
    throw new QueryCompileError(
      "ExecutionContext is required: a query with no tenancy scope cannot compile.",
    );
  }
  return ctx;
}

export function stampTenancy<T extends object>(node: T): T {
  TENANCY_STAMPED.add(node);
  return node;
}

export function isTenancyStamped(node: object): boolean {
  return TENANCY_STAMPED.has(node);
}

export function assertTenancyStamped(node: RootOperationNode): void {
  if (!isTenancyStamped(node)) {
    throw new QueryCompileError(
      "Refusing to compile: the tenancy injection pass was not applied. Compile through compileClickhouseQuery() with an ExecutionContext.",
    );
  }
}

const RAW_RELATION_SQL = /\b(?:from|join|select)\b/i;

function rejectUnscopedRawSql(node: unknown): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) rejectUnscopedRawSql(item);
    return;
  }
  if (RawNode.is(node as OperationNode)) {
    const fragments = (node as RawNode).sqlFragments;
    if (fragments.some((fragment) => RAW_RELATION_SQL.test(fragment))) {
      throw new UnscopedRelationError(
        "Raw SQL fragments that introduce a relation (SELECT/FROM/JOIN) are rejected in any position: they can bypass tenancy injection. Use traced table and column references instead.",
      );
    }
  }
  for (const value of Object.values(node)) {
    rejectUnscopedRawSql(value);
  }
}
