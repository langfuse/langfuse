import { asCompilableSelect, type CompilableSelect } from "./walk";
import type { MetadataFilterNode, MetadataSelectNode } from "./metadata";

/**
 * Walkable query plan. SELECT arms wrap a hypequery builder (whose
 * `getQueryNode()` returns kind-tagged nodes). UNION ALL is ours: hypequery
 * stores `unionQueries` as raw SQL strings, which this arm refuses to use.
 * VIEW is ours: hypequery `withCTE` stringifies via `toSQL()` and would
 * bypass tenancy.
 */
export type SelectExtras = {
  tableAlias?: string;
  metadataSelect?: MetadataSelectNode;
  metadataWhere?: MetadataFilterNode;
  metadataHaving?: MetadataFilterNode;
};

export type SelectPlan = {
  kind: "select";
  builder: CompilableSelect;
  extras?: SelectExtras;
};

export type UnionAllPlan = {
  kind: "union-all";
  arms: SelectPlan[];
};

export type NamedView<Exposed extends readonly string[] = readonly string[]> = {
  kind: "view";
  name: string;
  source: QueryPlan;
  exposed: Exposed;
};

export type ViewFilter = {
  column: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
  value: unknown;
};

export type ViewQueryPlan<
  Exposed extends readonly string[] = readonly string[],
> = {
  kind: "view-query";
  view: NamedView<Exposed>;
  select: Array<Exposed[number]>;
  where?: ViewFilter[];
};

export type QueryPlan = SelectPlan | UnionAllPlan | ViewQueryPlan;

type AnySelectBuilder = {
  getQueryNode(): unknown;
  getTableName(): string;
  toSQL(): string;
};

export function selectPlan(
  builder: AnySelectBuilder,
  extras?: SelectExtras,
): SelectPlan {
  return { kind: "select", builder: asCompilableSelect(builder), extras };
}

export function unionAllPlan(...builders: AnySelectBuilder[]): UnionAllPlan {
  if (builders.length < 2) {
    throw new Error("unionAllPlan requires at least two SELECT arms");
  }
  return {
    kind: "union-all",
    arms: builders.map((builder) => selectPlan(builder)),
  };
}

export function isQueryPlan(value: unknown): value is QueryPlan {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value.kind === "select" ||
      value.kind === "union-all" ||
      value.kind === "view-query")
  );
}
