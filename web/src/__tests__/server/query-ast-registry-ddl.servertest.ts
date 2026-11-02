import { clickhouseClient } from "@langfuse/shared/src/server";
import { TABLE_COLUMN_TYPES } from "@langfuse/shared/src/server/query-ast/schema";

// `LowCardinality` is a storage encoding the registry does not model, and
// ClickHouse prints `Decimal(18, 12)` where the registry writes
// `Decimal(18,12)`. Both are normalized away; every other difference fails.
// Example: `Map(LowCardinality(String), Decimal(18, 12))` →
// `Map(String,Decimal(18,12))`.
const normalizeType = (type: string) =>
  type
    .replace(/\s+/g, "")
    .replace(/LowCardinality\(((?:[^()]|\([^()]*\))*)\)/g, "$1");

describe("query-AST table registry", () => {
  it("declares every column with the type of the migrated ClickHouse schema", async () => {
    const result = await clickhouseClient().query({
      query: `
        SELECT table, name, type
        FROM system.columns
        WHERE database = currentDatabase() AND table IN {tables: Array(String)}
      `,
      query_params: { tables: Object.keys(TABLE_COLUMN_TYPES) },
      format: "JSONEachRow",
    });
    const rows = await result.json<{
      table: string;
      name: string;
      type: string;
    }>();
    const physical = new Map(
      rows.map((row) => [`${row.table}.${row.name}`, row.type]),
    );

    const declared = Object.entries(TABLE_COLUMN_TYPES).flatMap(
      ([table, columns]) =>
        Object.entries(columns).map(([name, type]) => ({
          column: `${table}.${name}`,
          type,
        })),
    );
    const mismatches = declared
      .map(({ column, type }) => ({
        column,
        registry: type,
        clickhouse: physical.get(column) ?? "missing",
      }))
      .filter(
        ({ registry, clickhouse }) =>
          normalizeType(registry) !== normalizeType(clickhouse),
      );

    expect(declared.length).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });
});
