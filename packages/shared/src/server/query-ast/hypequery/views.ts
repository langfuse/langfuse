import { ViewColumnError } from "./executionContext";
import type { NamedView, QueryPlan, ViewFilter, ViewQueryPlan } from "./plan";

/**
 * Condition 8: a named view is a black-box relation. The outer query may
 * only name columns listed in `exposed`. hypequery's `withCTE` stringifies
 * the inner builder via `toSQL()`, which bypasses `compile()` tenancy, so
 * this arm does not use it. Mechanism: wrap the compiler (not plugin /
 * transformer / fork).
 */
export function defineView<const Exposed extends readonly string[]>(
  name: string,
  source: QueryPlan,
  exposed: Exposed,
): NamedView<Exposed> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid view name "${name}"`);
  }
  if (exposed.length === 0) {
    throw new Error(`View "${name}" must expose at least one column`);
  }
  return { kind: "view", name, source, exposed };
}

class ViewQueryBuilder<Exposed extends readonly string[]> {
  private selected: Array<Exposed[number]> | null = null;
  private filters: ViewFilter[] = [];

  constructor(private readonly view: NamedView<Exposed>) {}

  select(columns: Array<Exposed[number]>): this {
    for (const column of columns) {
      this.assertExposed(String(column));
    }
    this.selected = columns;
    return this;
  }

  where(
    column: Exposed[number],
    operator: ViewFilter["operator"],
    value: unknown,
  ): this {
    this.assertExposed(String(column));
    this.filters.push({ column: String(column), operator, value });
    return this;
  }

  toPlan(): ViewQueryPlan<Exposed> {
    const select = this.selected ?? [...this.view.exposed];
    return {
      kind: "view-query",
      view: this.view,
      select,
      where: this.filters.length > 0 ? this.filters : undefined,
    };
  }

  private assertExposed(column: string): void {
    if (!(this.view.exposed as readonly string[]).includes(column)) {
      throw new ViewColumnError(
        `view "${this.view.name}" does not expose column "${column}"; outer queries may only name ${this.view.exposed.join(", ")}`,
      );
    }
  }
}

export function fromView<Exposed extends readonly string[]>(
  view: NamedView<Exposed>,
): ViewQueryBuilder<Exposed> {
  return new ViewQueryBuilder(view);
}

export type { NamedView, ViewQueryPlan };
