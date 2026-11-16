import type { ClickHouseDatabase } from "../query-ast/schema";

type EventsColumn = keyof ClickHouseDatabase["events"] & string;

/**
 * How a customer column lowers onto the logical `events` relation:
 * - `column`: one physical column;
 * - `map`: a `Map(String, …)` column, readable whole or as `col['key']`;
 * - `metadata`: the `metadata_names` / `metadata_values` pair, readable whole
 *   or as `metadata['key']`;
 * - `latency`: milliseconds between two timestamp columns.
 */
export type CustomerColumn =
  | { kind: "column"; physical: EventsColumn }
  | { kind: "map"; physical: EventsColumn }
  | { kind: "metadata" }
  | { kind: "latency"; from: EventsColumn; to: EventsColumn };

type CustomerTable = {
  columns: Record<string, CustomerColumn>;
  /** What `SELECT *` expands to: everything but the large payload columns. */
  star: readonly string[];
};

const col = (physical: EventsColumn): CustomerColumn => ({
  kind: "column",
  physical,
});

/**
 * The customer-facing `observations` table, named like the v2 observations
 * API fields in snake_case. Internal columns (`project_id`, ingestion
 * bookkeeping, experiment and evaluator columns) are not exposed.
 */
const observations: CustomerTable = {
  columns: {
    id: col("span_id"),
    trace_id: col("trace_id"),
    parent_observation_id: col("parent_span_id"),
    type: col("type"),
    name: col("name"),
    level: col("level"),
    status_message: col("status_message"),
    version: col("version"),
    release: col("release"),
    environment: col("environment"),
    start_time: col("start_time"),
    end_time: col("end_time"),
    completion_start_time: col("completion_start_time"),
    trace_name: col("trace_name"),
    user_id: col("user_id"),
    session_id: col("session_id"),
    tags: col("tags"),
    model: col("provided_model_name"),
    model_id: col("model_id"),
    model_parameters: col("model_parameters"),
    prompt_id: col("prompt_id"),
    prompt_name: col("prompt_name"),
    prompt_version: col("prompt_version"),
    input_cost: col("calculated_input_cost"),
    output_cost: col("calculated_output_cost"),
    total_cost: col("calculated_total_cost"),
    usage_details: { kind: "map", physical: "usage_details" },
    cost_details: { kind: "map", physical: "cost_details" },
    latency_ms: { kind: "latency", from: "start_time", to: "end_time" },
    time_to_first_token_ms: {
      kind: "latency",
      from: "start_time",
      to: "completion_start_time",
    },
    input: col("input"),
    output: col("output"),
    metadata: { kind: "metadata" },
  },
  star: [
    "id",
    "trace_id",
    "parent_observation_id",
    "type",
    "name",
    "level",
    "status_message",
    "environment",
    "start_time",
    "end_time",
    "completion_start_time",
    "model",
    "usage_details",
    "cost_details",
    "total_cost",
    "latency_ms",
  ],
};

export const CUSTOMER_TABLES: Record<string, CustomerTable> = { observations };
