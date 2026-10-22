import {
  SelectQueryNode,
  type CommonTableExpressionNode,
  type KyselyPlugin,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type RootOperationNode,
  type TableNode,
} from "kysely";

import { QueryCompileError, UnscopedRelationError } from "./errors";
import { walkNodes } from "./nodes";
import { selectRelations } from "./relations";
import { REGISTRY_TABLES } from "./schema";

/**
 * Rejects every CTE name and FROM/JOIN name that could mean two relations.
 * Runs first in every compile, so the passes after it can treat a registry
 * name as its table and the compiler can type each CTE read from the one
 * body the name resolves to in scope. Rejected:
 * - a CTE named like a registry table (`with traces as (…)`), the logical
 *   `events` included;
 * - a CTE that reuses the name of a CTE in scope: a sibling's, or one an
 *   enclosing select declares. Inside its own body a CTE is not in scope,
 *   so a nested WITH there may reuse its name;
 * - a schema-qualified FROM/JOIN name (`default.traces`): the registry
 *   describes tables by name only, not per database;
 * - a FROM/JOIN name that is neither a registry table nor a CTE in scope. A
 *   CTE body's scope is where the CTE is declared, without the CTE itself
 *   and its later siblings, so recursive and cyclic CTEs are rejected, and
 *   so is a body read that ClickHouse would resolve to a CTE declared where
 *   the body is read.
 */
export class CteNamePlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    assertCteNames(args.node, new Set());
    return args.node;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

/** `inScope` holds the CTE names visible to the selects under `value`. */
function assertCteNames(value: unknown, inScope: ReadonlySet<string>): void {
  walkNodes(value, (node) => {
    if (!SelectQueryNode.is(node)) return;
    assertSelect(node, inScope);
    return false;
  });
}

function assertSelect(
  node: SelectQueryNode,
  inScope: ReadonlySet<string>,
): void {
  const visible = new Set(inScope);
  for (const cte of node.with?.expressions ?? []) {
    const name = cteName(cte);
    assertNameAllowed(name, visible);
    // The body sees the enclosing CTEs and the earlier siblings only.
    assertCteNames(cte.expression, visible);
    visible.add(name);
  }
  assertReadsResolve(node, visible);
  // Subqueries and UNION branches of this select; the bodies were walked above.
  for (const [key, child] of Object.entries(node)) {
    if (key !== "with") assertCteNames(child, visible);
  }
}

function assertNameAllowed(name: string, visible: ReadonlySet<string>): void {
  if (REGISTRY_TABLES.has(name)) {
    throw new QueryCompileError(
      `A CTE cannot be named "${name}": it is a registry table, and the compile passes read that name as the table. Rename the CTE.`,
    );
  }
  if (visible.has(name)) {
    throw new QueryCompileError(
      `CTE "${name}" is declared twice in one scope: a WITH may not reuse the name of a sibling or of an enclosing CTE. Rename one of them.`,
    );
  }
}

/** Every FROM/JOIN table of `node` is a registry table or a CTE in `visible`. */
function assertReadsResolve(
  node: SelectQueryNode,
  visible: ReadonlySet<string>,
): void {
  for (const { table } of selectRelations(node)) {
    if (table) assertReadResolves(table, visible);
  }
}

function assertReadResolves(
  table: TableNode,
  visible: ReadonlySet<string>,
): void {
  const name = table.table.identifier.name;
  if (table.table.schema) {
    throw new UnscopedRelationError(
      `"${table.table.schema.name}.${name}" is schema-qualified: the registry describes tables by name in the configured database. Read "${name}" unqualified.`,
    );
  }
  if (!REGISTRY_TABLES.has(name) && !visible.has(name)) {
    throw new UnscopedRelationError(
      `"${name}" is neither a registry table nor a CTE in scope. A CTE body reads only CTEs declared before it, so recursive and cyclic CTEs are not supported: declare the CTEs in the order they read each other. To read a physical table, add it to the registry in schema.ts.`,
    );
  }
}

export function cteName(expr: CommonTableExpressionNode): string {
  return expr.name.table.table.identifier.name;
}
