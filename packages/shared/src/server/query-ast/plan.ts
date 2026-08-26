import { asCompilableSelect, type CompilableSelect } from "./walk";

/**
 * Walkable query plan. SELECT arms wrap a hypequery builder (whose
 * `getQueryNode()` returns kind-tagged nodes). UNION ALL is ours: hypequery
 * stores `unionQueries` as raw SQL strings, which this arm refuses to use.
 */
export type SelectPlan = {
  kind: "select";
  builder: CompilableSelect;
};

export type UnionAllPlan = {
  kind: "union-all";
  arms: SelectPlan[];
};

export type QueryPlan = SelectPlan | UnionAllPlan;

type AnySelectBuilder = {
  getQueryNode(): unknown;
  getTableName(): string;
  toSQL(): string;
};

export function selectPlan(builder: AnySelectBuilder): SelectPlan {
  return { kind: "select", builder: asCompilableSelect(builder) };
}

export function unionAllPlan(...builders: AnySelectBuilder[]): UnionAllPlan {
  if (builders.length < 2) {
    throw new Error("unionAllPlan requires at least two SELECT arms");
  }
  return {
    kind: "union-all",
    arms: builders.map(selectPlan),
  };
}

export function isQueryPlan(value: unknown): value is QueryPlan {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value.kind === "select" || value.kind === "union-all")
  );
}
