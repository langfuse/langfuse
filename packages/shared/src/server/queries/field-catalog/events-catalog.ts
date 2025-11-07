import type { FieldCatalog } from "./types";

export const EVENTS_FIELD_CATALOG: FieldCatalog = {
  // ========== EVENTS TABLE FIELDS ==========

  id: {
    kind: "field",
    source: { table: "events", sql: "e.span_id" },
    alias: "id",
    type: "string",
    groupable: false,
  },

  traceId: {
    kind: "field",
    source: { table: "events", sql: "e.trace_id" },
    alias: "trace_id",
    type: "string",
    groupable: true,
  },

  name: {
    kind: "field",
    source: { table: "events", sql: "e.name" },
    alias: "name",
    type: "string",
    groupable: true,
  },

  type: {
    kind: "field",
    source: { table: "events", sql: "e.type" },
    alias: "type",
    type: "string",
    groupable: true,
  },

  startTime: {
    kind: "field",
    source: { table: "events", sql: "e.start_time" },
    alias: "start_time",
    type: "datetime",
    groupable: false,
  },

  endTime: {
    kind: "field",
    source: { table: "events", sql: "e.end_time" },
    alias: "end_time",
    type: "datetime",
    groupable: false,
  },

  input: {
    kind: "field",
    source: { table: "events", sql: "e.input" },
    alias: "input",
    type: "json",
    groupable: false,
  },

  output: {
    kind: "field",
    source: { table: "events", sql: "e.output" },
    alias: "output",
    type: "json",
    groupable: false,
  },

  metadata: {
    kind: "field",
    source: { table: "events", sql: "e.metadata" },
    alias: "metadata",
    type: "json",
    groupable: false,
  },

  environment: {
    kind: "field",
    source: { table: "events", sql: "e.environment" },
    alias: "environment",
    type: "string",
    groupable: true,
  },

  version: {
    kind: "field",
    source: { table: "events", sql: "e.version" },
    alias: "version",
    type: "string",
    groupable: true,
  },

  level: {
    kind: "field",
    source: { table: "events", sql: "e.level" },
    alias: "level",
    type: "string",
    groupable: true,
  },

  promptId: {
    kind: "field",
    source: { table: "events", sql: "e.prompt_id" },
    alias: "prompt_id",
    type: "string",
    groupable: true,
  },

  providedModelName: {
    kind: "field",
    source: { table: "events", sql: "e.provided_model_name" },
    alias: "provided_model_name",
    type: "string",
    groupable: true,
  },

  // ========== CROSS-TABLE FIELDS (FROM TRACES VIA eventsTracesAggregation) ==========

  tags: {
    kind: "field",
    source: {
      table: "traces",
      sql: "groupArray(e.tags)",
      via: "trace_id",
    },
    alias: "tags",
    type: "array",
    groupable: false,
  },

  traceName: {
    kind: "field",
    source: {
      table: "traces",
      sql: "argMaxIf(e.name, e.event_ts, e.parent_span_id = '')",
      via: "trace_id",
    },
    alias: "name", // eventsTracesAggregation returns this as 'name'
    type: "string",
    groupable: true,
  },

  // ========== MEASURES ==========

  count: {
    kind: "measure",
    source: { table: "events", sql: "*" },
    alias: "count",
    type: "integer",
    allowedAggregations: ["count"],
    supportedGroupings: ["*"],
    description: "Count of observations",
    unit: "observations",
  },

  totalCost: {
    kind: "measure",
    source: { table: "events", sql: "e.total_cost" },
    alias: "total_cost",
    type: "decimal",
    allowedAggregations: ["sum", "avg", "min", "max", "p50", "p95", "p99"],
    supportedGroupings: ["*"],
    unit: "USD",
  },

  latency: {
    kind: "measure",
    source: {
      table: "events",
      sql: "date_diff('millisecond', min(e.start_time), max(e.end_time))",
    },
    alias: "latency",
    type: "integer",
    allowedAggregations: [
      "avg",
      "min",
      "max",
      "p50",
      "p75",
      "p90",
      "p95",
      "p99",
    ],
    supportedGroupings: ["*"],
    unit: "milliseconds",
  },

  totalTokens: {
    kind: "measure",
    source: { table: "events", sql: "e.usage_details['total']" },
    alias: "total_tokens",
    type: "integer",
    allowedAggregations: ["sum", "avg", "max"],
    supportedGroupings: ["*"],
    unit: "tokens",
  },

  // Example: Trace-level measure (constrained grouping)
  traceCost: {
    kind: "measure",
    source: { table: "events", sql: "e.total_cost" },
    alias: "trace_total_cost",
    type: "decimal",
    allowedAggregations: ["sum"],
    supportedGroupings: ["traceId"], // MUST be grouped by trace
    description: "Total cost aggregated at trace level",
    unit: "USD",
  },
};
