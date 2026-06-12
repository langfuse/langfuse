import { type FilterState } from "../../../types";
import { greptimeQuery } from "../../greptime/client";
import { createGreptimeFilterFromFilterState } from "../../greptime/sql/factory";
import {
  FilterList,
  type DateTimeFilter,
} from "../../greptime/sql/greptime-filter";
import { type GreptimeColumnMappings } from "../../greptime/sql/columnMappings";
import { greptimeString } from "../../greptime/sql/rowContract";
import { greptimeTsParam, notDeleted } from "./queryHelpers";

// OBSERVATIONS_TO_TRACE_INTERVAL = "INTERVAL 2 DAY"; SCORE_TO_TRACE_OBSERVATIONS_INTERVAL = "INTERVAL 1 HOUR".
const OBSERVATIONS_TO_TRACE_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;
const SCORE_TO_TRACE_OBSERVATIONS_INTERVAL_MS = 60 * 60 * 1000;

/**
 * GreptimeDB dashboard rollup reads (04-read-path.md, P2). Replaces the ClickHouse dashboard repo:
 *   - getScoreAggregate: scores FINAL [JOIN traces FINAL] -> plain GROUP BY on the merged projection.
 *   - getObservation{Cost,Usage}ByTypeByTime: the CH `ARRAY JOIN mapKeys/mapValues(... _details)` per
 *     time bucket cannot be done on GreptimeDB (no dynamic JSON-key enumeration in SQL), so the
 *     by-type breakdown is NARROWED to a known-key allowlist (input/output/total) summed via
 *     `json_get_float`; `toStartOfInterval ... WITH FILL` becomes `date_bin` + app-side gap fill.
 *
 * Documented narrowing: custom/dynamic usage or cost keys are not broken out on the by-type
 * dashboards. The standard input/output/total series are exact.
 */

const KNOWN_DETAIL_KEYS = ["input", "output", "total"] as const;

// Greptime dashboard filter mapping (mirrors `tableDefinitions/mapDashboards.ts`). Each column carries
// the conventional alias of its table in the dashboard queries (traces=t, observations=o, scores=s).
// `toolNames` / `calledToolNames` are intentionally absent (JSON-key membership is not expressible);
// filtering by them throws loudly rather than mis-filtering.
const dashboardGreptimeColumnDefinitions: GreptimeColumnMappings = [
  { uiTableName: "Trace Name", uiTableId: "traceName", greptimeTableName: "traces", greptimeSelect: "name", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Tags", uiTableId: "traceTags", greptimeTableName: "traces", greptimeSelect: "tags", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Timestamp", uiTableId: "timestamp", greptimeTableName: "traces", greptimeSelect: "timestamp", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Score Name", uiTableId: "scoreName", greptimeTableName: "scores", greptimeSelect: "name", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Score Timestamp", uiTableId: "scoreTimestamp", greptimeTableName: "scores", greptimeSelect: "timestamp", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Score Source", uiTableId: "scoreSource", greptimeTableName: "scores", greptimeSelect: "source", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Scores Data Type", uiTableId: "scoreDataType", greptimeTableName: "scores", greptimeSelect: "data_type", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "value", uiTableId: "value", greptimeTableName: "scores", greptimeSelect: "value", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Start Time", uiTableId: "startTime", greptimeTableName: "observations", greptimeSelect: "start_time", queryPrefix: "o" }, // prettier-ignore
  { uiTableName: "End Time", uiTableId: "endTime", greptimeTableName: "observations", greptimeSelect: "end_time", queryPrefix: "o" }, // prettier-ignore
  { uiTableName: "Type", uiTableId: "type", greptimeTableName: "observations", greptimeSelect: "type", queryPrefix: "o" }, // prettier-ignore
  { uiTableName: "Level", uiTableId: "level", greptimeTableName: "observations", greptimeSelect: "level", queryPrefix: "o" }, // prettier-ignore
  { uiTableName: "User", uiTableId: "userId", greptimeTableName: "traces", greptimeSelect: "user_id", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Release", uiTableId: "release", greptimeTableName: "traces", greptimeSelect: "release", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Version", uiTableId: "version", greptimeTableName: "traces", greptimeSelect: "version", queryPrefix: "t" }, // prettier-ignore
  { uiTableName: "Model", uiTableId: "model", greptimeTableName: "observations", greptimeSelect: "provided_model_name", queryPrefix: "o" }, // prettier-ignore
  { uiTableName: "Environment", uiTableId: "environment", greptimeTableName: "traces", greptimeSelect: "environment", queryPrefix: "t" }, // prettier-ignore
];

const splitEnvFilter = (
  filter: FilterState,
): { envFilter: FilterState; rest: FilterState } => ({
  envFilter: filter.filter((f) => f.column === "environment"),
  rest: filter.filter((f) => f.column !== "environment"),
});

// Environment exists on every projection; bind it to the primary table's alias of each query.
const envFilterList = (envFilter: FilterState, prefix: string): FilterList =>
  new FilterList(
    createGreptimeFilterFromFilterState(envFilter, [
      {
        uiTableName: "Environment",
        uiTableId: "environment",
        greptimeTableName: "traces",
        greptimeSelect: "environment",
        queryPrefix: prefix,
      },
    ]),
  );

// ---------------------------------------------------------------------------
// getScoreAggregate
// ---------------------------------------------------------------------------

export const getScoreAggregateGreptime = async (
  projectId: string,
  filter: FilterState,
): Promise<
  Array<{
    name: string;
    count: string;
    avg_value: string;
    source: string;
    data_type: string;
  }>
> => {
  const { envFilter, rest } = splitEnvFilter(filter);
  const env = envFilterList(envFilter, "s").apply();
  const restList = new FilterList(
    createGreptimeFilterFromFilterState(
      rest,
      dashboardGreptimeColumnDefinitions,
    ),
  );
  const restRes = restList.apply();

  const hasTraceFilter = restList.some((f) => f.table === "traces");
  const timeFilter = restList.find(
    (f) =>
      f.field === "timestamp" && (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const useLookback = Boolean(timeFilter && hasTraceFilter);
  const params: Record<string, unknown> = {
    projectId,
    ...restRes.params,
    ...env.params,
  };
  if (useLookback && timeFilter) {
    params.tracesTimestamp = greptimeTsParam(
      new Date(
        timeFilter.value.getTime() - SCORE_TO_TRACE_OBSERVATIONS_INTERVAL_MS,
      ),
    );
  }

  const rows = await greptimeQuery<{
    name: string;
    count: string | number;
    avg_value: string | number | null;
    source: string;
    data_type: string;
  }>({
    query: `
      SELECT s.name AS name, count(*) AS count, avg(s.value) AS avg_value,
        s.source AS source, s.data_type AS data_type
      FROM scores s
      ${hasTraceFilter ? "JOIN traces t ON t.id = s.trace_id AND t.project_id = s.project_id AND " + notDeleted("t") : ""}
      WHERE s.project_id = :projectId AND ${notDeleted("s")}
        ${restRes.query ? `AND ${restRes.query}` : ""}
        ${env.query ? `AND ${env.query}` : ""}
        ${useLookback ? "AND t.timestamp >= :tracesTimestamp" : ""}
      GROUP BY s.name, s.source, s.data_type
      ORDER BY count(*) DESC`,
    params,
    readOnly: true,
  });

  return rows.map((r) => ({
    name: greptimeString(r.name) ?? "",
    count: String(r.count ?? 0),
    avg_value: String(r.avg_value ?? 0),
    source: greptimeString(r.source) ?? "",
    data_type: greptimeString(r.data_type) ?? "",
  }));
};

// ---------------------------------------------------------------------------
// cost / usage by type by time (known-key allowlist + app-side gap fill)
// ---------------------------------------------------------------------------

type TypeByTimeRow = { intervalStart: Date; key: string; sum: number };

const getObservationDetailByTypeByTime = async (opts: {
  projectId: string;
  filter: FilterState;
  jsonColumn: "cost_details" | "usage_details";
  fromTime: number;
  toTime: number;
  bucketSizeSeconds: number;
}): Promise<TypeByTimeRow[]> => {
  const { projectId, filter, jsonColumn, fromTime, toTime, bucketSizeSeconds } =
    opts;
  const { envFilter, rest } = splitEnvFilter(filter);
  const env = envFilterList(envFilter, "o").apply();
  const restList = new FilterList(
    createGreptimeFilterFromFilterState(
      rest,
      dashboardGreptimeColumnDefinitions,
    ),
  );
  const restRes = restList.apply();

  const hasTraceFilter = restList.some((f) => f.table === "traces");
  // CH derived the trace lookback from an observation start_time lower bound, only when a trace
  // filter forced the join.
  const obsStartLowerBound = restList.find(
    (f) =>
      f.table === "observations" &&
      f.field.includes("start_time") &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;
  const useLookback = Boolean(hasTraceFilter && obsStartLowerBound);

  const params: Record<string, unknown> = {
    projectId,
    ...restRes.params,
    ...env.params,
  };
  if (useLookback && obsStartLowerBound) {
    params.traceTimestamp = greptimeTsParam(
      new Date(
        obsStartLowerBound.value.getTime() - OBSERVATIONS_TO_TRACE_INTERVAL_MS,
      ),
    );
  }

  const keySums = KNOWN_DETAIL_KEYS.map(
    (k) =>
      `sum(json_get_float(o.${jsonColumn}, '${k}')) AS ${jsonColumn === "cost_details" ? "cost" : "usage"}_${k}`,
  ).join(",\n        ");
  const alias = jsonColumn === "cost_details" ? "cost" : "usage";

  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      SELECT date_bin(INTERVAL '${bucketSizeSeconds}' second, o.start_time) AS bucket,
        ${keySums}
      FROM observations o
      ${hasTraceFilter ? "LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id" : ""}
      WHERE o.project_id = :projectId AND ${notDeleted("o")}
        ${restRes.query ? `AND ${restRes.query}` : ""}
        ${env.query ? `AND ${env.query}` : ""}
        ${useLookback ? "AND t.timestamp >= :traceTimestamp" : ""}
      GROUP BY bucket
      ORDER BY bucket ASC`,
    params,
    readOnly: true,
  });

  // Index bucket -> per-key sum, then gap-fill across the full [from, to] bucket grid.
  const byBucket = new Map<number, Record<string, number>>();
  for (const row of rows) {
    const bucket =
      row.bucket instanceof Date ? row.bucket : new Date(String(row.bucket));
    const perKey: Record<string, number> = {};
    for (const k of KNOWN_DETAIL_KEYS) {
      perKey[k] = Number(row[`${alias}_${k}`] ?? 0);
    }
    byBucket.set(bucket.getTime(), perKey);
  }

  // Keep only keys that carry a nonzero sum somewhere (mirror CH's "types present in data").
  const keptKeys = KNOWN_DETAIL_KEYS.filter((k) =>
    Array.from(byBucket.values()).some((m) => (m[k] ?? 0) !== 0),
  );

  const bucketMs = bucketSizeSeconds * 1000;
  const alignedFrom = Math.floor(fromTime / bucketMs) * bucketMs;
  const alignedTo = Math.floor(toTime / bucketMs) * bucketMs;

  const result: TypeByTimeRow[] = [];
  for (let b = alignedFrom; b <= alignedTo; b += bucketMs) {
    const perKey = byBucket.get(b);
    for (const key of keptKeys) {
      result.push({
        intervalStart: new Date(b),
        key,
        sum: perKey?.[key] ?? 0,
      });
    }
  }
  return result;
};

export const getObservationCostByTypeByTimeGreptime = (opts: {
  projectId: string;
  filter: FilterState;
  fromTime: number;
  toTime: number;
  bucketSizeSeconds: number;
}): Promise<TypeByTimeRow[]> =>
  getObservationDetailByTypeByTime({ ...opts, jsonColumn: "cost_details" });

export const getObservationUsageByTypeByTimeGreptime = (opts: {
  projectId: string;
  filter: FilterState;
  fromTime: number;
  toTime: number;
  bucketSizeSeconds: number;
}): Promise<TypeByTimeRow[]> =>
  getObservationDetailByTypeByTime({ ...opts, jsonColumn: "usage_details" });
