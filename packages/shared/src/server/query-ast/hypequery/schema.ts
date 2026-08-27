/**
 * Physical ClickHouse tables this arm is allowed to name. Column types are
 * the ClickHouse type strings hypequery uses for filter validation and
 * ARRAY JOIN typing (`Array(...)` is required for `.arrayJoin()`).
 */
export const langfuseClickHouseSchema = {
  traces: {
    environment: "String",
    project_id: "String",
    timestamp: "DateTime64(3)",
    tags: "Array(String)",
  },
  observations: {
    environment: "String",
    project_id: "String",
    start_time: "DateTime64(3)",
  },
  events_core: {
    environment: "String",
    project_id: "String",
    start_time: "DateTime64(3)",
    tags: "Array(String)",
    span_id: "String",
    trace_id: "String",
    is_deleted: "UInt8",
    metadata_names: "Array(String)",
    metadata_values: "Array(String)",
  },
  events_full: {
    environment: "String",
    project_id: "String",
    start_time: "DateTime64(3)",
    tags: "Array(String)",
    span_id: "String",
    trace_id: "String",
    is_deleted: "UInt8",
    metadata_names: "Array(String)",
    metadata_values: "Array(String)",
  },
  scores: {
    environment: "String",
    project_id: "String",
    timestamp: "DateTime64(3)",
    data_type: "String",
  },
} as const;

export type LangfuseClickHouseSchema = typeof langfuseClickHouseSchema;

export const TENANT_TABLES = new Set<string>(
  Object.keys(langfuseClickHouseSchema),
);

export const PROJECT_ID_COLUMN = "project_id";
