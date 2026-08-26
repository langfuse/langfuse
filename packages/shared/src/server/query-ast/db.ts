import {
  createQueryBuilder,
  type DatabaseAdapter,
} from "@hypequery/clickhouse";

import type { LangfuseClickHouseSchema } from "./schema";

/**
 * Compile-only adapter. Execution goes through `queryClickhouse` after
 * `compile()`; calling `.execute()` on a builder is a mistake for this arm
 * and must fail loudly.
 */
const compileOnlyAdapter: DatabaseAdapter = {
  name: "langfuse-compile-only",
  async query(): Promise<never[]> {
    throw new Error(
      "hypequery builders in this arm are compile-only; call compile() and queryClickhouse()",
    );
  },
};

const db = createQueryBuilder<LangfuseClickHouseSchema>({
  adapter: compileOnlyAdapter,
});

export type LangfuseSelectBuilder = ReturnType<typeof db.table>;

export function table<K extends keyof LangfuseClickHouseSchema>(name: K) {
  return db.table(name);
}

/**
 * hypequery infers `DateTime64(n)` as `string`, so `.where(..., Date)` does
 * not type-check. The node still stores the Date; compile() binds it as
 * `{name:DateTime64(3)}` to match existing ClickHouse params.
 */
export function dateParam(value: Date): string {
  return value as unknown as string;
}

export { db };
