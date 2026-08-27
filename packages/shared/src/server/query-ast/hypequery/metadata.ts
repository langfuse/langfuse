/**
 * Condition 7b: parallel-array metadata access as walkable nodes.
 *
 * hypequery has no array-subscript or `indexOf` node. Its `fn()` / `raw()` /
 * `selectExpr()` helpers emit SQL strings (`PredicateExpression.sql`), which
 * this arm refuses to use for the lowering. The nodes below are ours; compile()
 * prints them. Mechanism: wrap the compiler (not plugin / transformer / fork).
 */

export type ColumnRefNode = {
  kind: "column-ref";
  table?: string;
  name: string;
};

export type BoundParamNode = {
  kind: "bound-param";
  name: string;
  clickHouseType: string;
  value: unknown;
};

export type IndexOfNode = {
  kind: "index-of";
  haystack: ColumnRefNode;
  needle: BoundParamNode;
};

export type SubscriptNode = {
  kind: "subscript";
  array: ColumnRefNode;
  index: IndexOfNode;
};

export type MetadataAccessNode = {
  kind: "metadata-access";
  subscript: SubscriptNode;
};

export type MetadataCompareOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";

export type MetadataFilterNode = {
  kind: "metadata-filter";
  access: MetadataAccessNode;
  operator: MetadataCompareOp;
  value: BoundParamNode;
};

export type MetadataSelectNode = {
  kind: "metadata-select";
  access: MetadataAccessNode;
  alias: string;
};

const METADATA_NAMES = "metadata_names";
const METADATA_VALUES = "metadata_values";

export function metadataAccess(
  key: string,
  tableAlias = "e",
): MetadataAccessNode {
  const needle: BoundParamNode = {
    kind: "bound-param",
    name: "metadataKey",
    clickHouseType: "String",
    value: key,
  };
  const names: ColumnRefNode = {
    kind: "column-ref",
    table: tableAlias,
    name: METADATA_NAMES,
  };
  const values: ColumnRefNode = {
    kind: "column-ref",
    table: tableAlias,
    name: METADATA_VALUES,
  };
  return {
    kind: "metadata-access",
    subscript: {
      kind: "subscript",
      array: values,
      index: {
        kind: "index-of",
        haystack: names,
        needle,
      },
    },
  };
}

export function metadataFilter(
  key: string,
  operator: MetadataCompareOp,
  value: number,
  tableAlias = "e",
): MetadataFilterNode {
  return {
    kind: "metadata-filter",
    access: metadataAccess(key, tableAlias),
    operator,
    value: {
      kind: "bound-param",
      name: "metadataCmp",
      clickHouseType: "Int64",
      value,
    },
  };
}

export function metadataSelect(
  key: string,
  alias = "metadata_a",
  tableAlias = "e",
): MetadataSelectNode {
  return {
    kind: "metadata-select",
    access: metadataAccess(key, tableAlias),
    alias,
  };
}

export function walkMetadataAccess(node: MetadataAccessNode): Array<{
  kind: string;
  path: string;
  node: unknown;
}> {
  const sub = node.subscript;
  const idx = sub.index;
  return [
    { kind: node.kind, path: "$", node },
    { kind: sub.kind, path: "$.subscript", node: sub },
    { kind: sub.array.kind, path: "$.subscript.array", node: sub.array },
    { kind: idx.kind, path: "$.subscript.index", node: idx },
    {
      kind: idx.haystack.kind,
      path: "$.subscript.index.haystack",
      node: idx.haystack,
    },
    {
      kind: idx.needle.kind,
      path: "$.subscript.index.needle",
      node: idx.needle,
    },
  ];
}
