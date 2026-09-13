/**
 * Single source of truth for the physical ClickHouse relations the Kysely
 * compiler targets. One table declaration drives all three downstream views:
 *
 *  - `ClickHouseDatabase` — the Kysely row types (column autocomplete and typed
 *    comparisons).
 *  - `COLUMN_DATA_TYPES` — the coarse runtime type map the aggregate type-check
 *    pass consults (`typecheck.ts`).
 *  - `TENANTED_TABLES` — the relations the tenancy pass must scope
 *    (`tenancy.ts`).
 *
 * Deriving all three from one declaration keeps them from drifting apart.
 *
 * Column sets cover the relations the compiler targets, not a full schema
 * dump. Physical tuning metadata (partition / sort / dedup keys) is not
 * modeled here; dedup lowering will extend this same declaration.
 */

/**
 * ClickHouse column types the registry understands. Each maps to a TS row type
 * (for Kysely) and a coarse runtime category (for the type-check pass).
 */
export type ChColumnType =
  | "String"
  | "Float"
  | "DateTime"
  | "Array(String)"
  | "Map(String, Float)";

type TsTypeOfColumn<T extends ChColumnType> = T extends "String"
  ? string
  : T extends "Float"
    ? number
    : T extends "DateTime"
      ? Date
      : T extends "Array(String)"
        ? string[]
        : T extends "Map(String, Float)"
          ? Record<string, number>
          : never;

/** Coarse runtime category the aggregate type-check pass reasons about. */
export type ColumnDataType = "string" | "number" | "date" | "array" | "map";

const RUNTIME_TYPE: Record<ChColumnType, ColumnDataType> = {
  String: "string",
  Float: "number",
  DateTime: "date",
  "Array(String)": "array",
  "Map(String, Float)": "map",
};

function defineTable<const Cols extends Record<string, ChColumnType>>(spec: {
  columns: Cols;
  /**
   * Whether the tenancy pass must inject a `project_id` scope. Defaults to
   * `true`: every relation modeled here is project-gated, and defaulting on is
   * fail-closed — a table added without this flag is still scoped. Set `false`
   * only for a genuinely global relation.
   */
  tenant?: boolean;
}) {
  return { columns: spec.columns, tenant: spec.tenant ?? true };
}

const TABLE_REGISTRY = {
  traces: defineTable({
    columns: {
      environment: "String",
      project_id: "String",
      timestamp: "DateTime",
      id: "String",
    },
  }),
  observations: defineTable({
    columns: {
      environment: "String",
      project_id: "String",
      start_time: "DateTime",
      trace_id: "String",
      cost_details: "Map(String, Float)",
      usage_details: "Map(String, Float)",
    },
  }),
  events_core: defineTable({
    columns: {
      environment: "String",
      project_id: "String",
      start_time: "DateTime",
      span_id: "String",
      trace_id: "String",
      event_ts: "DateTime",
      type: "String",
      total_cost: "Float",
      metadata_names: "Array(String)",
      metadata_values: "Array(String)",
    },
  }),
  scores: defineTable({
    columns: {
      environment: "String",
      project_id: "String",
      timestamp: "DateTime",
      data_type: "String",
    },
  }),
} as const;

type RowOf<Cols extends Record<string, ChColumnType>> = {
  [C in keyof Cols]: TsTypeOfColumn<Cols[C]>;
};

/** Derived Kysely row types. */
export type ClickHouseDatabase = {
  [T in keyof typeof TABLE_REGISTRY]: RowOf<
    (typeof TABLE_REGISTRY)[T]["columns"]
  >;
};

/**
 * Derived coarse runtime column-type map (column name -> category), consumed by
 * the aggregate type-check pass. Column names are consistent across tables in
 * this schema, so a flat map is unambiguous.
 */
export const COLUMN_DATA_TYPES: Record<string, ColumnDataType> =
  Object.fromEntries(
    Object.values(TABLE_REGISTRY).flatMap((table) =>
      Object.entries(table.columns).map(([name, chType]) => [
        name,
        RUNTIME_TYPE[chType],
      ]),
    ),
  );

/** Derived set of relations the tenancy pass must scope. */
export const TENANTED_TABLES = new Set<string>(
  Object.entries(TABLE_REGISTRY)
    .filter(([, spec]) => spec.tenant)
    .map(([name]) => name),
);
