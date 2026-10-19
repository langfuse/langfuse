/**
 * Single source of truth for the physical ClickHouse relations the Kysely
 * compiler targets. One table declaration drives the downstream views:
 *
 *  - `ClickHouseDatabase` — the Kysely row types (column autocomplete and typed
 *    comparisons).
 *  - `COLUMN_DATA_TYPES` — the coarse runtime type map the aggregate type-check
 *    pass consults (`typecheck.ts`).
 *  - `TABLE_BIND_TYPES` / `COLUMN_BIND_TYPES` — the ClickHouse bind types the
 *    compiler uses when a value is compared to a known column (`compiler.ts`).
 *  - `TENANTED_TABLES` — the relations the tenancy pass must scope
 *    (`tenancy.ts`).
 *  - `DEDUP_SPECS` — the per-table read idiom the lowering pass applies
 *    (`dedup.ts`). Each table names an existing production mechanism; the
 *    pass does not invent a new one.
 *  - `SOFT_DELETE_COLUMNS` — the flag column the soft-delete pass filters to
 *    `0` (`softDelete.ts`).
 *
 * Deriving every view from one declaration keeps them from drifting apart.
 *
 * Column sets cover the relations the compiler targets, not a full schema
 * dump. Partition / sort keys stay unmodeled until a pass needs them.
 */

/**
 * ClickHouse column types the registry understands. Each maps to a TS row type
 * (for Kysely) and a coarse runtime category (for the type-check pass).
 */
export type ChColumnType =
  | "String"
  | "Nullable(String)"
  | "Float64"
  | "Decimal(18,12)"
  | "DateTime64(3)"
  | "DateTime64(6)"
  | "UInt8"
  | "UInt16"
  | "UInt64"
  | "Bool"
  | "Nullable(UInt16)"
  | "Nullable(DateTime64(6))"
  | "Array(String)"
  | "Map(String, UInt64)"
  | "Map(String, Decimal(18,12))"
  | "Map(String, String)";

/**
 * Logical TS type of a column: the value a caller binds, and what a result
 * value means once parsed. Not the wire type — `JSONEachRow` returns
 * `DateTime64` as a `YYYY-MM-DD hh:mm:ss.ffffff` string, and `UInt64` as a
 * string on servers that quote 64-bit integers. Rows inferred from a builder
 * (`InferResult`) therefore do not describe raw query results; read those
 * through a read schema and converter.
 */
type TsTypeOfColumn<T extends ChColumnType> = T extends "String"
  ? string
  : T extends "Nullable(String)"
    ? string | null
    : T extends "Float64" | "Decimal(18,12)"
      ? number
      : T extends "UInt8" | "UInt16" | "UInt64"
        ? number
        : T extends "Bool"
          ? boolean
          : T extends "Nullable(UInt16)"
            ? number | null
            : T extends "DateTime64(3)" | "DateTime64(6)"
              ? Date
              : T extends "Nullable(DateTime64(6))"
                ? Date | null
                : T extends "Array(String)"
                  ? string[]
                  : T extends
                        | "Map(String, UInt64)"
                        | "Map(String, Decimal(18,12))"
                    ? Record<string, number>
                    : T extends "Map(String, String)"
                      ? Record<string, string>
                      : never;

/** Coarse runtime category the aggregate type-check pass reasons about. */
export type ColumnDataType = "string" | "number" | "date" | "array" | "map";

const RUNTIME_TYPE: Record<ChColumnType, ColumnDataType> = {
  String: "string",
  "Nullable(String)": "string",
  Float64: "number",
  "Decimal(18,12)": "number",
  UInt8: "number",
  UInt16: "number",
  UInt64: "number",
  // ClickHouse stores Bool as UInt8, so numeric aggregates accept it.
  Bool: "number",
  "Nullable(UInt16)": "number",
  "DateTime64(3)": "date",
  "DateTime64(6)": "date",
  "Nullable(DateTime64(6))": "date",
  "Array(String)": "array",
  "Map(String, UInt64)": "map",
  "Map(String, Decimal(18,12))": "map",
  "Map(String, String)": "map",
};

/**
 * Per-table read idiom. Must match a mechanism already used in production
 * SQL for that table — the pass applies the declaration, it does not invent
 * a new collapse.
 *
 *  - `none` — rows are treated as immutable at read time. No FINAL, no
 *    LIMIT BY. Used for `events_core` / `events_full`.
 *  - `limitBy` — the existing legacy idiom
 *    `ORDER BY <version> DESC LIMIT 1 BY <key>` (traces / observations /
 *    scores point and list reads).
 *  - `final` — the existing `FROM <table> FINAL` idiom. Declaring it
 *    without an emitter is a compile error (fail-closed).
 */
export type DedupSpec =
  | { strategy: "none" }
  | { strategy: "limitBy"; key: readonly string[]; version: string }
  | { strategy: "final" };

function defineTable<const Cols extends Record<string, ChColumnType>>(spec: {
  columns: Cols;
  /**
   * Whether the tenancy pass must inject a `project_id` scope. Defaults to
   * `true`: every relation modeled here is project-gated, and defaulting on is
   * fail-closed — a table added without this flag is still scoped. Set `false`
   * only for a genuinely global relation.
   */
  tenant?: boolean;
  /**
   * Existing read-time collapse for this table. Omit until the family is
   * migrated; `none` is an explicit "do not collapse" (immutable rows).
   */
  dedup?: DedupSpec;
  /**
   * Column that marks a soft-deleted row. The soft-delete pass injects
   * `<column> = 0` on every read of this table unless the select opts out
   * with `includeDeleted()`, or after its LIMIT with `softDeleteAfterLimit()`.
   */
  softDelete?: keyof Cols & string;
}) {
  return {
    columns: spec.columns,
    tenant: spec.tenant ?? true,
    dedup: spec.dedup,
    softDelete: spec.softDelete,
  };
}

const EVENTS_COLUMNS = {
  environment: "String",
  project_id: "String",
  start_time: "DateTime64(6)",
  span_id: "String",
  trace_id: "String",
  event_ts: "DateTime64(6)",
  type: "String",
  total_cost: "Decimal(18,12)",
  experiment_id: "String",
  prompt_id: "String",
  prompt_name: "String",
  prompt_version: "Nullable(UInt16)",
  usage_details: "Map(String, UInt64)",
  cost_details: "Map(String, Decimal(18,12))",
  ingestion_sdk_name: "String",
  ingestion_sdk_version: "String",
  telemetry_sdk_language: "String",
  source: "String",
  is_deleted: "UInt8",
  metadata_names: "Array(String)",
  metadata_values: "Array(String)",
  user_id: "String",
  session_id: "String",
  name: "String",
  parent_span_id: "String",
  end_time: "Nullable(DateTime64(6))",
  tags: "Array(String)",
  input: "String",
  output: "String",
  tool_calls: "Array(String)",
  tool_call_names: "Array(String)",
  experiment_item_expected_output: "String",
  experiment_item_metadata_names: "Array(String)",
  experiment_item_metadata_values: "Array(String)",
  version: "String",
  release: "String",
  trace_name: "String",
  level: "String",
  status_message: "String",
  completion_start_time: "Nullable(DateTime64(6))",
  is_app_root: "Bool",
  bookmarked: "Bool",
  public: "Bool",
  model_id: "String",
  provided_model_name: "String",
  model_parameters: "String",
  provided_usage_details: "Map(String, UInt64)",
  provided_cost_details: "Map(String, Decimal(18,12))",
  calculated_input_cost: "Decimal(18,12)",
  calculated_output_cost: "Decimal(18,12)",
  calculated_total_cost: "Decimal(18,12)",
  usage_pricing_tier_id: "Nullable(String)",
  usage_pricing_tier_name: "Nullable(String)",
  tool_definitions: "Map(String, String)",
  input_length: "UInt64",
  output_length: "UInt64",
  evaluator_id: "String",
  evaluation_rule_id: "String",
  evaluator_execution_is_test: "Bool",
  experiment_name: "String",
  experiment_metadata_names: "Array(String)",
  experiment_metadata_values: "Array(String)",
  experiment_description: "String",
  experiment_dataset_id: "String",
  experiment_item_id: "String",
  experiment_item_version: "Nullable(DateTime64(6))",
  experiment_item_root_span_id: "String",
  service_name: "String",
  service_version: "String",
  scope_name: "String",
  scope_version: "String",
  telemetry_sdk_name: "String",
  telemetry_sdk_version: "String",
  blob_storage_file_path: "String",
  event_bytes: "UInt64",
  created_at: "DateTime64(6)",
  updated_at: "DateTime64(6)",
  ingestion_api_key: "String",
} as const satisfies Record<string, ChColumnType>;

const TABLE_REGISTRY = {
  traces: defineTable({
    columns: {
      environment: "String",
      project_id: "String",
      timestamp: "DateTime64(3)",
      id: "String",
    },
  }),
  observations: defineTable({
    columns: {
      environment: "String",
      project_id: "String",
      start_time: "DateTime64(3)",
      trace_id: "String",
      cost_details: "Map(String, Decimal(18,12))",
      usage_details: "Map(String, UInt64)",
    },
  }),
  events_core: defineTable({
    columns: EVENTS_COLUMNS,
    // Immutable at read time. Do not inject LIMIT BY or FINAL.
    dedup: { strategy: "none" },
    softDelete: "is_deleted",
  }),
  // Same projection as events_core with full I/O. Tenanted and immutable
  // for the same reasons; selected when a point-read needs untruncated
  // input/output or metadata.
  events_full: defineTable({
    columns: EVENTS_COLUMNS,
    dedup: { strategy: "none" },
    softDelete: "is_deleted",
  }),
  scores: defineTable({
    columns: {
      id: "String",
      environment: "String",
      project_id: "String",
      timestamp: "DateTime64(3)",
      event_ts: "DateTime64(3)",
      created_at: "DateTime64(3)",
      updated_at: "DateTime64(3)",
      data_type: "String",
      trace_id: "Nullable(String)",
      session_id: "Nullable(String)",
      observation_id: "Nullable(String)",
      dataset_run_id: "Nullable(String)",
      name: "String",
      value: "Float64",
      source: "String",
      comment: "Nullable(String)",
      author_user_id: "Nullable(String)",
      config_id: "Nullable(String)",
      string_value: "Nullable(String)",
      queue_id: "Nullable(String)",
      execution_trace_id: "Nullable(String)",
      is_deleted: "UInt8",
      metadata: "Map(String, String)",
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
 * Declared ClickHouse type per column, per registry table. A servertest checks
 * it against `system.columns` of the migrated database.
 */
export const TABLE_COLUMN_TYPES: Record<
  string,
  Record<string, ChColumnType>
> = Object.fromEntries(
  Object.entries(TABLE_REGISTRY).map(([table, spec]) => [table, spec.columns]),
);

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

/** Derived per-table read idioms, keyed by table name. */
export const DEDUP_SPECS: Record<string, DedupSpec> = Object.fromEntries(
  Object.entries(TABLE_REGISTRY).flatMap(([name, spec]) =>
    spec.dedup ? [[name, spec.dedup]] : [],
  ),
);

/** Derived soft-delete flag column, keyed by table name. */
export const SOFT_DELETE_COLUMNS: Record<string, string> = Object.fromEntries(
  Object.entries(TABLE_REGISTRY).flatMap(([name, spec]) =>
    spec.softDelete ? [[name, spec.softDelete]] : [],
  ),
);

/**
 * ClickHouse bind type for a JS value compared against this column. Wider than
 * the coarse {@link COLUMN_DATA_TYPES} category, so an integer literal compared
 * to `value` still becomes `{p:Float64}`.
 */
const BIND_TYPE: Record<ChColumnType, string> = {
  String: "String",
  Float64: "Float64",
  "Decimal(18,12)": "Decimal(18, 12)",
  UInt8: "UInt8",
  UInt16: "UInt16",
  UInt64: "UInt64",
  Bool: "Bool",
  // A bound value is never NULL; NULL checks compile to `IS NULL`.
  "Nullable(String)": "String",
  "Nullable(UInt16)": "UInt16",
  "DateTime64(3)": "DateTime64(3)",
  "DateTime64(6)": "DateTime64(6)",
  "Nullable(DateTime64(6))": "DateTime64(6)",
  "Array(String)": "Array(String)",
  "Map(String, UInt64)": "Map(String, UInt64)",
  "Map(String, Decimal(18,12))": "Map(String, Decimal(18, 12))",
  "Map(String, String)": "Map(String, String)",
};

/** Bind type per column, per registry table. */
export const TABLE_BIND_TYPES: Record<
  string,
  Record<string, string>
> = Object.fromEntries(
  Object.entries(TABLE_REGISTRY).map(([table, spec]) => [
    table,
    Object.fromEntries(
      Object.entries(spec.columns).map(([name, chType]) => [
        name,
        BIND_TYPE[chType],
      ]),
    ),
  ]),
);

/**
 * Bind type by bare column name, for operands whose relation is opaque to the
 * compiler (e.g. a qualifier no relation in scope declares). Only names with the same bind type in
 * every table are kept, since `start_time` is `DateTime64(6)` on events but
 * `DateTime64(3)` on observations.
 */
export const COLUMN_BIND_TYPES: Record<string, string> = (() => {
  const byName = new Map<string, Set<string>>();
  for (const columns of Object.values(TABLE_BIND_TYPES)) {
    for (const [name, bindType] of Object.entries(columns)) {
      byName.set(name, (byName.get(name) ?? new Set()).add(bindType));
    }
  }
  return Object.fromEntries(
    [...byName]
      .filter(([, types]) => types.size === 1)
      .map(([name, types]) => [name, [...types][0]]),
  );
})();
