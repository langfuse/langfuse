import { clickhouseClient } from "@langfuse/shared/src/server";
import {
  TABLE_COLUMN_TYPES,
  UNMODELED_COLUMNS,
} from "@langfuse/shared/src/server/query-ast/schema";

// The registry's spelling of a ClickHouse type. `LowCardinality` is a storage
// encoding the registry does not model, and ClickHouse prints
// `Decimal(18, 12)` where the registry writes `Decimal(18,12)`. Example:
// `Map(LowCardinality(String), Decimal(18, 12))` →
// `Map(String, Decimal(18,12))`.
const registrySpelling = (type: string) =>
  type
    .replace(/LowCardinality\(((?:[^()]|\([^()]*\))*)\)/g, "$1")
    .replace(/Decimal\((\d+),\s*(\d+)\)/g, "Decimal($1,$2)");

// Whitespace-insensitive comparison key; every other difference fails.
const normalizeType = (type: string) =>
  registrySpelling(type).replace(/\s+/g, "");

type PhysicalColumn = { table: string; name: string; type: string };

async function physicalColumns(): Promise<PhysicalColumn[]> {
  const result = await clickhouseClient().query({
    query: `
      SELECT table, name, type
      FROM system.columns
      WHERE database = currentDatabase() AND table IN {tables: Array(String)}
      ORDER BY table, position
    `,
    query_params: { tables: Object.keys(TABLE_COLUMN_TYPES) },
    format: "JSONEachRow",
  });
  return result.json<PhysicalColumn>();
}

const unmodeled = new Map(Object.entries(UNMODELED_COLUMNS));

describe("query-AST table registry", () => {
  it("declares every column with the type of the migrated ClickHouse schema", async () => {
    const rows = await physicalColumns();
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

  it("models or lists in UNMODELED_COLUMNS every column of a registered table", async () => {
    const rows = await physicalColumns();

    // One `<table>: <name>: "<type>",` line per column neither modeled nor
    // listed, ready to paste into that table's `defineTable` columns.
    const unlisted = rows
      .filter(
        ({ table, name }) =>
          !Object.hasOwn(TABLE_COLUMN_TYPES[table], name) &&
          !unmodeled.get(table)?.includes(name),
      )
      .map(
        ({ table, name, type }) =>
          `${table}: ${name}: "${registrySpelling(type)}",`,
      );

    expect(rows.length).toBeGreaterThan(0);
    expect(
      unlisted,
      [
        "ClickHouse has columns that schema.ts neither models nor lists in UNMODELED_COLUMNS.",
        "Paste each line (without the table prefix) into that table's defineTable columns,",
        "adding the type to ChColumnType if it is new, or add the name to UNMODELED_COLUMNS.<table>:",
        ...unlisted.map((line) => `  ${line}`),
      ].join("\n"),
    ).toEqual([]);
  });

  it("lists in UNMODELED_COLUMNS only physical columns the registry does not model", async () => {
    const rows = await physicalColumns();
    const physical = new Set(rows.map((row) => `${row.table}.${row.name}`));

    // An entry is stale once its column is modeled or dropped by a migration.
    const stale = Object.entries(UNMODELED_COLUMNS).flatMap(([table, names]) =>
      names.flatMap((name) => {
        if (Object.hasOwn(TABLE_COLUMN_TYPES[table], name))
          return [`${table}.${name}: also modeled`];
        if (!physical.has(`${table}.${name}`))
          return [`${table}.${name}: missing in ClickHouse`];
        return [];
      }),
    );

    expect(stale).toEqual([]);
  });
});
