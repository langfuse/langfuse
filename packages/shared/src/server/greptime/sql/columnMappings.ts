import { type UiColumnMatchable } from "../../../tableDefinitions/types";
import { type ScoreGrain } from "./greptime-filter";

/**
 * GreptimeDB column mapping (04-read-path.md, P1). The dialect-agnostic match keys
 * (`uiTableId`/`uiTableName`/`aliases`) are shared with the ClickHouse `UiColumnMapping` so the UI
 * filter-state contract is unchanged, but the SQL-bearing fields are GreptimeDB-specific:
 *
 *   - `greptimeSelect` is a GreptimeDB column reference (a bare projection column, paired with
 *     `queryPrefix`) — NOT ClickHouse's `clickhouseSelect`, which carries CH functions / old table
 *     names and would leak CH SQL into GreptimeDB (the documented reason `orderby.ts` must not be
 *     fed the CH `tableMappings`).
 *   - `greptimeTableName` is the physical projection table (`traces`/`observations`/`scores`); the
 *     EAV-backed filter classes derive `<table>_metadata` / `<table>_tags` from it.
 *
 * Scope is the P1 read surface: plain projection columns, EAV-routed metadata/tags, and the
 * trace-joined plain columns the scores/observations UI tables reference. Rollup columns
 * (cost/usage/latency/scores_avg, `tool_*` unnest) are intentionally absent — the filter factory's
 * "column not found" throw is the desired loud failure until their P2 consumer (and the trace-rollup
 * CTE) lands.
 */
export type GreptimeColumnMapping = UiColumnMatchable &
  Readonly<{
    greptimeTableName: string;
    greptimeSelect: string;
    greptimeTypeOverwrite?: string;
    queryPrefix?: string;
    emptyEqualsNull?: boolean;
    /**
     * Present on rollup score columns (`scores_avg` / `score_categories`): routes
     * `categoryOptions` / `numberObject` filters to a correlated score-grain EXISTS (the merged
     * projection has no per-row score array to filter). `greptimeSelect` is unused for these.
     */
    scoreGrain?: ScoreGrain;
  }>;

export type GreptimeColumnMappings = readonly GreptimeColumnMapping[];

// ---------------------------------------------------------------------------
// traces — plain `traces` projection columns only (rollup columns are P2)
// ---------------------------------------------------------------------------
export const tracesTableGreptimeColumnDefinitions: GreptimeColumnMappings = [
  { uiTableName: "ID", uiTableId: "id", greptimeTableName: "traces", greptimeSelect: "id", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Trace ID", uiTableId: "traceId", greptimeTableName: "traces", greptimeSelect: "id", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Name", uiTableId: "name", greptimeTableName: "traces", greptimeSelect: "name", queryPrefix: "t" }, // prettier-ignore
  // Alias so a `traceName` filter (evals / v4 beta) resolves on the traces table too.
  { uiTableName: "Trace Name", uiTableId: "traceName", greptimeTableName: "traces", greptimeSelect: "name", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Timestamp", uiTableId: "timestamp", greptimeTableName: "traces", greptimeSelect: "timestamp", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Created At", uiTableId: "createdAt", greptimeTableName: "traces", greptimeSelect: "timestamp", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "User ID", uiTableId: "userId", greptimeTableName: "traces", greptimeSelect: "user_id", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Session ID", uiTableId: "sessionId", greptimeTableName: "traces", greptimeSelect: "session_id", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Metadata", uiTableId: "metadata", greptimeTableName: "traces", greptimeSelect: "metadata", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Version", uiTableId: "version", greptimeTableName: "traces", greptimeSelect: "version", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Release", uiTableId: "release", greptimeTableName: "traces", greptimeSelect: "release", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Environment", uiTableId: "environment", greptimeTableName: "traces", greptimeSelect: "environment", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Tags", uiTableId: "tags", greptimeTableName: "traces", greptimeSelect: "tags", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Trace Tags", uiTableId: "traceTags", greptimeTableName: "traces", greptimeSelect: "tags", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "⭐️", uiTableId: "bookmarked", greptimeTableName: "traces", greptimeSelect: "bookmarked", queryPrefix: "t" }, // prettier-ignore
  // Rollup columns (P2): reference the `observations_stats` CTE aliases (prefix `o`, baked into the
  // expression — the filter/orderby emitters pass these through verbatim). Only reachable when the
  // CTE is joined (metrics select, or a filter/orderby targets one of these → requiresObservationsJoin).
  { uiTableName: "Level", uiTableId: "level", greptimeTableName: "observations", greptimeSelect: "o.aggregated_level" }, // prettier-ignore
  { uiTableName: "Error Level Count", uiTableId: "errorCount", greptimeTableName: "observations", greptimeSelect: "o.error_count" }, // prettier-ignore
  { uiTableName: "Warning Level Count", uiTableId: "warningCount", greptimeTableName: "observations", greptimeSelect: "o.warning_count" }, // prettier-ignore
  { uiTableName: "Default Level Count", uiTableId: "defaultCount", greptimeTableName: "observations", greptimeSelect: "o.default_count" }, // prettier-ignore
  { uiTableName: "Debug Level Count", uiTableId: "debugCount", greptimeTableName: "observations", greptimeSelect: "o.debug_count" }, // prettier-ignore
  { uiTableName: "Input Tokens", uiTableId: "inputTokens", greptimeTableName: "observations", greptimeSelect: "o.usage_input" }, // prettier-ignore
  { uiTableName: "Output Tokens", uiTableId: "outputTokens", greptimeTableName: "observations", greptimeSelect: "o.usage_output" }, // prettier-ignore
  { uiTableName: "Total Tokens", uiTableId: "totalTokens", greptimeTableName: "observations", greptimeSelect: "o.usage_total" }, // prettier-ignore
  { uiTableName: "Tokens", uiTableId: "tokens", greptimeTableName: "observations", greptimeSelect: "o.usage_total" }, // prettier-ignore
  { uiTableName: "Latency (s)", uiTableId: "latency", greptimeTableName: "observations", greptimeSelect: "o.latency_milliseconds / 1000" }, // prettier-ignore
  { uiTableName: "Input Cost ($)", uiTableId: "inputCost", greptimeTableName: "observations", greptimeSelect: "o.cost_input" }, // prettier-ignore
  { uiTableName: "Output Cost ($)", uiTableId: "outputCost", greptimeTableName: "observations", greptimeSelect: "o.cost_output" }, // prettier-ignore
  { uiTableName: "Total Cost ($)", uiTableId: "totalCost", greptimeTableName: "observations", greptimeSelect: "o.cost_total" }, // prettier-ignore
  // Score-grain rollup columns (P2): filters route to a correlated EXISTS over `scores` by trace_id.
  { uiTableName: "Scores (numeric)", uiTableId: "scores_avg", greptimeTableName: "scores", greptimeSelect: "trace_id", scoreGrain: { scoresColumn: "trace_id", outerPrefix: "t", outerColumn: "id" } }, // prettier-ignore
  { uiTableName: "Scores (categorical)", uiTableId: "score_categories", greptimeTableName: "scores", greptimeSelect: "trace_id", scoreGrain: { scoresColumn: "trace_id", outerPrefix: "t", outerColumn: "id" } }, // prettier-ignore
];

// ---------------------------------------------------------------------------
// observations — plain `observations` columns (prefix o) + trace-joined columns (prefix t)
// ---------------------------------------------------------------------------
const observationsTraceJoinedColumns: GreptimeColumnMappings = [
  { uiTableName: "Trace Tags", uiTableId: "traceTags", greptimeTableName: "traces", greptimeSelect: "tags", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "User ID", uiTableId: "userId", greptimeTableName: "traces", greptimeSelect: "user_id", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Session ID", uiTableId: "sessionId", greptimeTableName: "traces", greptimeSelect: "session_id", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Trace Name", uiTableId: "traceName", greptimeTableName: "traces", greptimeSelect: "name", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Trace Environment", uiTableId: "traceEnvironment", greptimeTableName: "traces", greptimeSelect: "environment", queryPrefix: "t" }, // prettier-ignore
];

export const observationsTableGreptimeColumnDefinitions: GreptimeColumnMappings =
  [
    ...observationsTraceJoinedColumns,
    { uiTableName: "Environment", uiTableId: "environment", greptimeTableName: "observations", greptimeSelect: "environment", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "Type", uiTableId: "type", greptimeTableName: "observations", greptimeSelect: "type", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "ID", uiTableId: "id", greptimeTableName: "observations", greptimeSelect: "id", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "Name", uiTableId: "name", greptimeTableName: "observations", greptimeSelect: "name", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "Trace ID", uiTableId: "traceId", greptimeTableName: "observations", greptimeSelect: "trace_id", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "Parent Observation ID", uiTableId: "parentObservationId", greptimeTableName: "observations", greptimeSelect: "parent_observation_id", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "Start Time", uiTableId: "startTime", greptimeTableName: "observations", greptimeSelect: "start_time", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "End Time", uiTableId: "endTime", greptimeTableName: "observations", greptimeSelect: "end_time", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "Level", uiTableId: "level", greptimeTableName: "observations", greptimeSelect: "level", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "Status Message", uiTableId: "statusMessage", greptimeTableName: "observations", greptimeSelect: "status_message", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "Model", uiTableId: "model", greptimeTableName: "observations", greptimeSelect: "provided_model_name", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "Model ID", uiTableId: "modelId", greptimeTableName: "observations", greptimeSelect: "internal_model_id", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "Metadata", uiTableId: "metadata", greptimeTableName: "observations", greptimeSelect: "metadata", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "Version", uiTableId: "version", greptimeTableName: "observations", greptimeSelect: "version", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "Prompt Name", uiTableId: "promptName", greptimeTableName: "observations", greptimeSelect: "prompt_name", queryPrefix: "o" }, // prettier-ignore
    { uiTableName: "Prompt Version", uiTableId: "promptVersion", greptimeTableName: "observations", greptimeSelect: "prompt_version", queryPrefix: "o" }, // prettier-ignore
  ];

// ---------------------------------------------------------------------------
// scores — plain `scores` columns (prefix s) + trace-joined columns (prefix t, for the UI table)
// ---------------------------------------------------------------------------
export const scoresTableGreptimeColumnDefinitions: GreptimeColumnMappings = [
  { uiTableName: "ID", uiTableId: "id", greptimeTableName: "scores", greptimeSelect: "id", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Timestamp", uiTableId: "timestamp", greptimeTableName: "scores", greptimeSelect: "timestamp", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Environment", uiTableId: "environment", greptimeTableName: "scores", greptimeSelect: "environment", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Trace ID", uiTableId: "traceId", greptimeTableName: "scores", greptimeSelect: "trace_id", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Observation ID", uiTableId: "observationId", greptimeTableName: "scores", greptimeSelect: "observation_id", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Session ID", uiTableId: "sessionId", greptimeTableName: "scores", greptimeSelect: "session_id", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Name", uiTableId: "name", greptimeTableName: "scores", greptimeSelect: "name", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Value", uiTableId: "value", greptimeTableName: "scores", greptimeSelect: "value", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Source", uiTableId: "source", greptimeTableName: "scores", greptimeSelect: "source", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Comment", uiTableId: "comment", greptimeTableName: "scores", greptimeSelect: "comment", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Author User ID", uiTableId: "authorUserId", greptimeTableName: "scores", greptimeSelect: "author_user_id", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Data Type", uiTableId: "dataType", greptimeTableName: "scores", greptimeSelect: "data_type", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "String Value", uiTableId: "stringValue", greptimeTableName: "scores", greptimeSelect: "string_value", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Metadata", uiTableId: "metadata", greptimeTableName: "scores", greptimeSelect: "metadata", queryPrefix: "s" }, // prettier-ignore
  // Trace-joined columns (scores UI table joins `traces t`).
  { uiTableName: "Trace Name", uiTableId: "traceName", greptimeTableName: "traces", greptimeSelect: "name", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "User ID", uiTableId: "userId", greptimeTableName: "traces", greptimeSelect: "user_id", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Trace Tags", uiTableId: "trace_tags", greptimeTableName: "traces", greptimeSelect: "tags", queryPrefix: "t" }, // prettier-ignore
];
