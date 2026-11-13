import {
  AndNode,
  FunctionNode,
  OrNode,
  ParensNode,
  RawNode,
  SelectQueryNode,
  type IdentifierNode,
  type OperationNode,
  type ReferenceNode,
} from "kysely";

import { QueryCompileError } from "./errors";

/**
 * ClickHouse `ARRAY JOIN` / `LEFT ARRAY JOIN` / `INNER ARRAY JOIN`.
 *
 * Not a Kysely `OperationNode` kind — Kysely's `kind` union is closed, so a
 * real custom kind would collapse to `never`. These nodes live as extra
 * fields on {@link ClickHouseSelectQueryNode}. Children (`expression`,
 * `alias`) are traced Kysely nodes, not raw SQL.
 */
export type ArrayJoinVariant = "default" | "left" | "inner";

type ArrayJoinItemNode = {
  readonly expression: OperationNode;
  readonly alias: IdentifierNode;
};

export type ArrayJoinNode = {
  readonly kind: "ArrayJoinNode";
  readonly variant: ArrayJoinVariant;
  readonly items: ReadonlyArray<ArrayJoinItemNode>;
};

export const ArrayJoinNode = {
  is(node: { kind: string }): node is ArrayJoinNode {
    return node.kind === "ArrayJoinNode";
  },
  create(
    items: ReadonlyArray<ArrayJoinItemNode>,
    variant: ArrayJoinVariant = "default",
  ): ArrayJoinNode {
    return Object.freeze({
      kind: "ArrayJoinNode",
      variant,
      items: Object.freeze([...items]),
    });
  },
};

/**
 * ClickHouse `LIMIT n BY col1, col2, ...`.
 *
 * Distinct from Kysely's `LimitNode` (`LIMIT n`). ClickHouse places LIMIT BY
 * after ORDER BY and before a plain LIMIT.
 */
export type LimitByNode = {
  readonly kind: "LimitByNode";
  readonly count: OperationNode;
  readonly columns: ReadonlyArray<OperationNode>;
};

export const LimitByNode = {
  is(node: { kind: string }): node is LimitByNode {
    return node.kind === "LimitByNode";
  },
  create(
    count: OperationNode,
    columns: ReadonlyArray<OperationNode>,
  ): LimitByNode {
    return Object.freeze({
      kind: "LimitByNode",
      count,
      columns: Object.freeze([...columns]),
    });
  },
};

/**
 * ClickHouse array subscript `arr[index]`. Children are traced nodes
 * (typically a `mapFromArrays(...)` FunctionNode and a bound key), not raw SQL.
 * A {@link CustomNode}.
 */
export type ArrayIndexNode = {
  readonly kind: "ArrayIndexNode";
  readonly array: OperationNode;
  readonly index: OperationNode;
  /**
   * A value of one key over one relation's `metadata_names`/`metadata_values`
   * (`metadata[key]`, or `values[indexOf(names, key)]`), so events routing
   * can keep a short metadata predicate on `events_core`.
   */
  readonly metadataLookup?: true;
};

/** The metadata comparison an index prefilter stands in front of. */
export type MetadataPrefilterTarget = {
  readonly operator: "=" | "matches" | "contains" | "starts with" | "ends with";
  readonly value: string;
};

/**
 * A `FunctionNode` that prefilters a metadata comparison on a skip index
 * (`hasAllTokens(values, …)`, `like(arrayStringConcat(values), …)`), marked
 * with that comparison. Kysely's transformer drops the marker;
 * `ClickHouseOperationNodeTransformer` keeps it.
 */
export type MetadataPrefilterNode = FunctionNode & {
  readonly metadataPrefilter: MetadataPrefilterTarget;
};

export const MetadataPrefilterNode = {
  is(node: OperationNode): node is MetadataPrefilterNode {
    return FunctionNode.is(node) && "metadataPrefilter" in node;
  },
  create(
    node: FunctionNode,
    target: MetadataPrefilterTarget,
  ): MetadataPrefilterNode {
    return Object.freeze({ ...node, metadataPrefilter: target });
  },
};

export const ArrayIndexNode = {
  is(node: { kind: string }): node is ArrayIndexNode {
    return node.kind === "ArrayIndexNode";
  },
  create(
    array: OperationNode,
    index: OperationNode,
    metadataLookup = false,
  ): ArrayIndexNode {
    return Object.freeze({
      kind: "ArrayIndexNode",
      array,
      index,
      ...(metadataLookup ? { metadataLookup: true as const } : {}),
    });
  },
};

/**
 * ClickHouse parametric aggregate `func(parameters)(args)`:
 * `quantile(0.95)(latency)`, `histogram(25)(toFloat64(latency))`. The
 * parameters are inlined constants, as ClickHouse requires. `func` is an
 * identifier, so the compiler checks it like any other name. A
 * {@link CustomNode}.
 */
export type ParametricAggregateNode = {
  readonly kind: "ParametricAggregateNode";
  readonly func: IdentifierNode;
  readonly parameters: ReadonlyArray<OperationNode>;
  readonly args: ReadonlyArray<OperationNode>;
};

export const ParametricAggregateNode = {
  is(node: { kind: string }): node is ParametricAggregateNode {
    return node.kind === "ParametricAggregateNode";
  },
  create(
    func: IdentifierNode,
    parameters: ReadonlyArray<OperationNode>,
    args: ReadonlyArray<OperationNode>,
  ): ParametricAggregateNode {
    return Object.freeze({
      kind: "ParametricAggregateNode",
      func,
      parameters: Object.freeze([...parameters]),
      args: Object.freeze([...args]),
    });
  },
};

/**
 * ClickHouse `WITH FILL FROM <from> TO <to> STEP <step>` after the last
 * ORDER BY item: rows for the missing values of that item between `from`
 * and `to`, `step` apart. An extra field of
 * {@link ClickHouseSelectQueryNode}, like LIMIT BY.
 */
export type WithFillNode = {
  readonly kind: "WithFillNode";
  readonly from: OperationNode;
  readonly to: OperationNode;
  readonly step: OperationNode;
};

export const WithFillNode = {
  create(
    from: OperationNode,
    to: OperationNode,
    step: OperationNode,
  ): WithFillNode {
    return Object.freeze({ kind: "WithFillNode", from, to, step });
  },
};

// A type name with optional arguments: identifiers, integers, nested types
// and quoted time zones (`DateTime64(3, 'UTC')`). No `{`, `}` or `:`, so the
// type cannot close its `{p:<type>}` placeholder.
const PLACEHOLDER_TYPE =
  /^[A-Za-z][A-Za-z0-9_]*(\((?:[A-Za-z0-9_(), ]|'[A-Za-z0-9_/+-]*')*\))?$/;

/** The payload of a `typedValue` bind (extensions.ts): value and placeholder type. */
export class TypedParam {
  constructor(
    readonly value: unknown,
    readonly type: string,
  ) {
    if (!PLACEHOLDER_TYPE.test(type)) {
      throw new QueryCompileError(
        `typedValue type must be a ClickHouse type name, got ${type}.`,
      );
    }
  }
}

/**
 * ClickHouse tuple subcolumn `q.col.field`: one named element of every tuple
 * in the `Array(Tuple(…))` column `q.col`, as an array.
 *
 * A {@link CustomNode}. Passes see `column` as an ordinary column reference,
 * so `q.col.field` counts as a read of `q.col`.
 */
export type TupleSubcolumnNode = {
  readonly kind: "TupleSubcolumnNode";
  readonly column: ReferenceNode;
  readonly field: IdentifierNode;
};

export const TupleSubcolumnNode = {
  is(node: { kind: string }): node is TupleSubcolumnNode {
    return node.kind === "TupleSubcolumnNode";
  },
  create(column: ReferenceNode, field: IdentifierNode): TupleSubcolumnNode {
    return Object.freeze({
      kind: "TupleSubcolumnNode",
      column,
      field,
    });
  },
};

/**
 * Select query extended with ClickHouse-only clauses.
 * Extra fields are ignored by Kysely's default compiler/transformer; our
 * dialect compiler and {@link ClickHouseOperationNodeTransformer} are the
 * ones that read them. Tenancy is stamped by identity (WeakSet), not a
 * copyable property on this node.
 */
export type ClickHouseSelectQueryNode = SelectQueryNode & {
  readonly arrayJoins?: ReadonlyArray<ArrayJoinNode>;
  readonly limitBy?: LimitByNode;
  /** Set by `withFill(...)`: the fill of the last ORDER BY item. */
  readonly withFill?: WithFillNode;
};

export function isClickHouseSelectQueryNode(
  node: OperationNode,
): node is ClickHouseSelectQueryNode {
  return node.kind === "SelectQueryNode";
}

/**
 * ClickHouse `FROM <table> FINAL` / `JOIN <table> AS alias FINAL`.
 *
 * Wraps a table expression (bare `TableNode` or `AliasNode`) so the compiler
 * emits `final` after that expression. A {@link CustomNode}.
 */
export type FinalTableNode = {
  readonly kind: "FinalTableNode";
  readonly table: OperationNode;
};

export const FinalTableNode = {
  is(node: { kind: string }): node is FinalTableNode {
    return node.kind === "FinalTableNode";
  },
  create(table: OperationNode): FinalTableNode {
    return Object.freeze({
      kind: "FinalTableNode",
      table,
    });
  },
};

/**
 * The ClickHouse node kinds that stand in an `OperationNode` slot (an
 * expression or a FROM/JOIN item). Kysely's `OperationNodeKind` union is
 * closed, so Kysely's transformer and compiler cannot dispatch them; both of
 * ours do, through {@link CUSTOM_NODE_OPS}. ARRAY JOIN and LIMIT BY are not
 * here: they are extra fields on {@link ClickHouseSelectQueryNode}, never in a
 * node slot.
 */
export type CustomNode =
  | ArrayIndexNode
  | FinalTableNode
  | ParametricAggregateNode
  | TupleSubcolumnNode;

type CustomNodeByKind = { [N in CustomNode as N["kind"]]: N };

type CustomNodeOps<N extends CustomNode> = {
  /** Rebuilds `node`, `child` applied to each child node. */
  transform(node: N, child: <C extends OperationNode>(node: C) => C): N;
  /** Emits `node`: `child` compiles a child node, `sql` appends text. */
  compile(
    node: N,
    child: (node: OperationNode) => void,
    sql: (text: string) => void,
  ): void;
};

/**
 * Transform and compile per custom kind. The mapped type makes a kind without
 * an entry a type error.
 */
const CUSTOM_NODE_OPS: {
  [K in keyof CustomNodeByKind]: CustomNodeOps<CustomNodeByKind[K]>;
} = {
  ArrayIndexNode: {
    transform: (node, child) =>
      ArrayIndexNode.create(
        child(node.array),
        child(node.index),
        node.metadataLookup,
      ),
    compile: (node, child, sql) => {
      child(node.array);
      sql("[");
      child(node.index);
      sql("]");
    },
  },
  FinalTableNode: {
    transform: (node, child) => FinalTableNode.create(child(node.table)),
    compile: (node, child, sql) => {
      child(node.table);
      sql(" final");
    },
  },
  ParametricAggregateNode: {
    transform: (node, child) =>
      ParametricAggregateNode.create(
        child(node.func),
        node.parameters.map(child),
        node.args.map(child),
      ),
    compile: (node, child, sql) => {
      child(node.func);
      for (const list of [node.parameters, node.args]) {
        sql("(");
        list.forEach((item, index) => {
          if (index > 0) sql(", ");
          child(item);
        });
        sql(")");
      }
    },
  },
  TupleSubcolumnNode: {
    // `column` is transformed as the reference it is, so passes see its read.
    transform: (node, child) =>
      TupleSubcolumnNode.create(child(node.column), child(node.field)),
    compile: (node, child, sql) => {
      child(node.column);
      sql(".");
      child(node.field);
    },
  },
};

const CUSTOM_KINDS: ReadonlySet<string> = new Set(Object.keys(CUSTOM_NODE_OPS));

/** `node` as a {@link CustomNode}, or `undefined` for any other kind. */
export function asCustomNode(node: { kind: string }): CustomNode | undefined {
  return CUSTOM_KINDS.has(node.kind) ? (node as CustomNode) : undefined;
}

/**
 * `node` typed as the Kysely node slot it fills. The one cast for custom
 * kinds: theirs are outside Kysely's `OperationNodeKind` union.
 */
export function asOperationNode(node: CustomNode): OperationNode {
  return node as unknown as OperationNode;
}

export function transformCustomNode(
  node: CustomNode,
  child: <C extends OperationNode>(node: C) => C,
): CustomNode {
  return transformByKind(node.kind, node, child);
}

function transformByKind<K extends keyof CustomNodeByKind>(
  kind: K,
  node: CustomNodeByKind[K],
  child: <C extends OperationNode>(node: C) => C,
): CustomNodeByKind[K] {
  return CUSTOM_NODE_OPS[kind].transform(node, child);
}

export function compileCustomNode(
  node: CustomNode,
  child: (node: OperationNode) => void,
  sql: (text: string) => void,
): void {
  compileByKind(node.kind, node, child, sql);
}

function compileByKind<K extends keyof CustomNodeByKind>(
  kind: K,
  node: CustomNodeByKind[K],
  child: (node: OperationNode) => void,
  sql: (text: string) => void,
): void {
  CUSTOM_NODE_OPS[kind].compile(node, child, sql);
}

/** {@link FinalTableNode.create}, typed as the FROM/JOIN item it stands in for. */
export function finalTable(table: OperationNode): OperationNode {
  return asOperationNode(FinalTableNode.create(table));
}

/** Read the table expression a {@link FinalTableNode} wraps. */
export function unwrapFinalTable(node: { kind: string }): OperationNode {
  return (node as FinalTableNode).table;
}

/**
 * Calls `visit` on every node object under `value`, ClickHouse extra fields
 * included, parents before children. `visit` returns `false` to skip a
 * node's children.
 */
export function walkNodes(
  value: unknown,
  visit: (node: OperationNode) => boolean | void,
): void {
  if (!value || typeof value !== "object") return;
  if ("kind" in value && typeof value.kind === "string") {
    if (visit(value as OperationNode) === false) return;
  }
  for (const child of Object.values(value)) walkNodes(child, visit);
}

/**
 * `condition`, bracketed when AND-ing a predicate onto it would rebind it: the
 * compiler emits `and`/`or` chains without brackets, so `p and a or b` reads
 * as `(p and a) or b`. Brackets a top-level `or`, and any raw SQL, whose text
 * may hold one.
 */
export function bracketForAnd(condition: OperationNode): OperationNode {
  return needsBracketsUnderAnd(condition)
    ? ParensNode.create(condition)
    : condition;
}

/** True when `node` would rebind if compiled as an operand of `and`. */
export function needsBracketsUnderAnd(node: OperationNode): boolean {
  if (ParensNode.is(node)) return false;
  if (OrNode.is(node)) return true;
  if (AndNode.is(node)) {
    return (
      needsBracketsUnderAnd(node.left) || needsBracketsUnderAnd(node.right)
    );
  }
  let hasRaw = false;
  walkNodes(node, (child) => {
    if (RawNode.is(child)) hasRaw = true;
    // A subquery compiles inside its own brackets.
    return !hasRaw && !SelectQueryNode.is(child);
  });
  return hasRaw;
}
