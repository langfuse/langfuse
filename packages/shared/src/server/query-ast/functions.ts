import {
  AggregateFunctionNode,
  BinaryOperationNode,
  ColumnNode,
  FunctionNode,
  IdentifierNode,
  OperatorNode,
  ParensNode,
  RawNode,
  ReferenceNode,
  type KyselyPlugin,
  type OperationNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type RootOperationNode,
} from "kysely";

import { QueryCompileError, UnscopedRelationError } from "./errors";
import { ParametricAggregateNode, walkNodes } from "./nodes";

/**
 * Every function a query may call, case as ClickHouse is called. Anything
 * else is rejected: ClickHouse functions can read tables (`joinGet`,
 * `dictGet`, `file`, `url`), stall the server (`sleep`) or leak server state
 * (`currentUser`, `getSetting`). The helpers in `extensions.ts` and Kysely's
 * `eb.fn.*` aggregates call only these; add a name here when a helper needs
 * a new one, after checking it reads no relation.
 */
const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  // Scalar functions.
  "CAST",
  "arrayConcat",
  "arrayDistinct",
  "arrayExists",
  "arrayJoin",
  "arrayMap",
  "arrayReverse",
  "arraySlice",
  "arraySort",
  "arrayStringConcat",
  "arraySum",
  "arrayZip",
  "coalesce",
  "concat",
  "countEqual",
  "dateDiff",
  "empty",
  "endsWith",
  "formatDateTime",
  "greatest",
  "has",
  "hasAll",
  "hasAllTokens",
  "hasAny",
  "if",
  "ifNull",
  "indexOf",
  "isNull",
  "leftUTF8",
  "length",
  "lengthUTF8",
  "like",
  "lower",
  "mapExists",
  "mapFilter",
  "mapFromArrays",
  "mapKeys",
  "mapValues",
  "multiIf",
  "notEmpty",
  "nullIf",
  "position",
  "positionCaseInsensitive",
  "startsWith",
  "substring",
  "toBool",
  "toDate",
  "toFloat64",
  "toFloat64OrNull",
  "toIntervalDay",
  "toIntervalHour",
  "toIntervalMinute",
  "toIntervalMonth",
  "toIntervalWeek",
  "toJSONString",
  "toMonday",
  "toNullable",
  "toStartOfDay",
  "toStartOfHour",
  "toStartOfInterval",
  "toStartOfMinute",
  "toStartOfMonth",
  "toString",
  "tokens",
  "tuple",
  "tupleElement",
  "xxHash32",
  // Aggregates.
  "any",
  "anyIf",
  "anyLast",
  "argMax",
  "argMaxIf",
  "avg",
  "avgIf",
  "count",
  "countIf",
  "groupArray",
  "groupUniqArray",
  "groupUniqArrayArray",
  "groupUniqArrayArrayIf",
  "groupUniqArrayIf",
  "histogram",
  "max",
  "medianExact",
  "min",
  "quantile",
  "rank",
  "sum",
  "sumMap",
  "uniq",
  "uniqIf",
]);

/** `in`, `not in`, `global in`, `global not in`, any case. */
const IN_OPERATOR = /(^|\s)in$/i;

/**
 * Rejects every function outside {@link ALLOWED_FUNCTIONS}, and a column
 * reference on the right of `in`, which ClickHouse reads as a table:
 * `t.id in scores` reads all of `scores`, unscoped.
 */
export class FunctionAllowlistPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    assertAllowedCalls(args.node);
    return args.node;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

/** The check of {@link FunctionAllowlistPlugin}, for a standalone expression. */
export function assertAllowedCalls(root: OperationNode): void {
  walkNodes(root, (node) => {
    const name = functionName(node);
    if (name !== undefined && !ALLOWED_FUNCTIONS.has(name)) {
      throw new QueryCompileError(
        `Function "${name}" is not on the allowlist in functions.ts: a ClickHouse function can read a table or server state the tenancy pass cannot scope. Use a helper from extensions.ts, or add the name there once you checked it reads no relation.`,
      );
    }
    if (
      BinaryOperationNode.is(node) &&
      IN_OPERATOR.test(nameText(node.operator)?.trim() ?? "") &&
      nameText(node.rightOperand) !== undefined
    ) {
      throw new UnscopedRelationError(
        "A column reference on the right of IN is rejected: ClickHouse reads a bare name there as a table, unscoped. Compare against a value list, a parameter, or a subquery.",
      );
    }
  });
}

/**
 * The text of a node that holds only names, as ClickHouse reads it: `scores`
 * for `scores`, `sql.ref("scores")`, `sql.id("scores")`, `sql.raw("scores")`
 * or `(scores)`, and `in` for an operator. Undefined once anything else, such
 * as a value or a subquery, is part of it.
 */
function nameText(node: OperationNode): string | undefined {
  if (OperatorNode.is(node)) return node.operator;
  if (IdentifierNode.is(node)) return node.name;
  if (ColumnNode.is(node)) return node.column.name;
  if (ReferenceNode.is(node)) {
    const column = ColumnNode.is(node.column) ? node.column.column.name : "*";
    return node.table
      ? `${node.table.table.identifier.name}.${column}`
      : column;
  }
  if (ParensNode.is(node)) {
    const inner = nameText(node.node);
    return inner === undefined ? undefined : `(${inner})`;
  }
  if (!RawNode.is(node)) return undefined;
  let text = node.sqlFragments[0] ?? "";
  for (const [i, parameter] of node.parameters.entries()) {
    const part = nameText(parameter);
    if (part === undefined) return undefined;
    text += part + (node.sqlFragments[i + 1] ?? "");
  }
  // Raw text of brackets and spaces around one name still reads that name.
  return /^[\s(]*[A-Za-z_][A-Za-z0-9_.]*[\s)]*$/.test(text) ||
    IN_OPERATOR.test(text.trim())
    ? text
    : undefined;
}

function functionName(node: OperationNode): string | undefined {
  if (FunctionNode.is(node) || AggregateFunctionNode.is(node)) {
    return node.func;
  }
  const custom: { kind: string } = node;
  if (ParametricAggregateNode.is(custom)) return custom.func.name;
  return undefined;
}
