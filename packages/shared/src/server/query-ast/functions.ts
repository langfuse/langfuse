import {
  AggregateFunctionNode,
  BinaryOperationNode,
  FunctionNode,
  OperatorNode,
  ParensNode,
  PrimitiveValueListNode,
  RawNode,
  SelectQueryNode,
  TupleNode,
  ValueListNode,
  ValueNode,
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
  "map",
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

export function isAllowedFunction(name: string): boolean {
  return ALLOWED_FUNCTIONS.has(name);
}

/** `in`, `not in`, `global in`, `global not in`, any case. */
const IN_OPERATOR = /(^|\s)in$/i;

/**
 * Rejects every function outside {@link ALLOWED_FUNCTIONS}, and anything but
 * values or a subquery on the right of `in`: ClickHouse reads a name there as
 * a table, so `t.id in scores` reads all of `scores`, unscoped.
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
    if (name !== undefined && !isAllowedFunction(name)) {
      throw new QueryCompileError(
        `Function "${name}" is not on the allowlist in functions.ts: a ClickHouse function can read a table or server state the tenancy pass cannot scope. Use a helper from extensions.ts, or add the name there once you checked it reads no relation.`,
      );
    }
    if (
      BinaryOperationNode.is(node) &&
      IN_OPERATOR.test(operatorText(node.operator).trim()) &&
      !isInOperand(node.rightOperand)
    ) {
      throw new UnscopedRelationError(
        "Only values or a subquery may sit on the right of IN: ClickHouse reads a name there as a table, unscoped. Compare against a value list, a parameter, or a subquery.",
      );
    }
  });
}

/** `in` for `OperatorNode("in")` and for raw sql`in` alike. */
function operatorText(node: OperationNode): string {
  if (OperatorNode.is(node)) return node.operator;
  if (RawNode.is(node) && node.parameters.length === 0) {
    return node.sqlFragments.join("");
  }
  return "";
}

/**
 * Values, a subquery, or lists and brackets of those: `[1, 2]`,
 * `(${typedValue(...)})`, `tuple(...)` values, `selectFrom(...)`.
 */
function isInOperand(node: OperationNode): boolean {
  if (
    ValueNode.is(node) ||
    PrimitiveValueListNode.is(node) ||
    SelectQueryNode.is(node)
  ) {
    return true;
  }
  if (ParensNode.is(node)) return isInOperand(node.node);
  if (ValueListNode.is(node) || TupleNode.is(node)) {
    return node.values.every(isInOperand);
  }
  return false;
}

function functionName(node: OperationNode): string | undefined {
  if (FunctionNode.is(node) || AggregateFunctionNode.is(node)) {
    return node.func;
  }
  const custom: { kind: string } = node;
  if (ParametricAggregateNode.is(custom)) return custom.func.name;
  return undefined;
}
