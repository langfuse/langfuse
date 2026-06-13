import { greptimeQuery } from "../../greptime/client";
import {
  DateTimeFilter as ChDateTimeFilter,
  type FilterList as ChFilterList,
} from "../../queries";
import { greptimeTsParam, notDeleted } from "./queryHelpers";
import { translateChFilterList } from "./translateChFilter";

/**
 * GreptimeDB daily-metrics reads (04-read-path.md, P4). Replaces the ClickHouse `daily-metrics`
 * (public REST `/api/public/metrics/daily`). The CH query used `groupArray(tuple(...))`,
 * `FULL OUTER JOIN`, and `mapFilter(positionCaseInsensitive(key, 'input'))` — none of which
 * GreptimeDB has — so it is rebuilt as two grouped queries plus an app-side assembly:
 *   - Q1 (observations, grouped by day + model): SQL-aggregatable scalars (counts, total_cost) plus
 *     `array_to_string(array_agg(json_to_string(usage_details)))` collecting every observation's usage
 *     map. App-side, input/output usage is summed faithfully by substring-matching the dynamic keys
 *     (replacing CH `positionCaseInsensitive`), and `total` is the exact-key sum.
 *   - Q2 (traces, grouped by day): per-day trace count.
 * The two are merged by day app-side (emulating the CH FULL OUTER JOIN), sorted by day DESC, then
 * paginated.
 *
 * Filter semantics are preserved from CH: a traces join (and trace filters) on Q1 only when there is
 * a non-timestamp trace filter (`hasNonTimestampsFilter`); a timestamp filter additionally bounds the
 * observation scan by `start_time >= timeFilter - TRACE_TO_OBSERVATIONS_INTERVAL`.
 */

// TRACE_TO_OBSERVATIONS_INTERVAL = "INTERVAL 1 HOUR" in the CH daily-metrics path.
const TRACE_TO_OBSERVATIONS_INTERVAL_MS = 60 * 60 * 1000;
// Unit separator: unlikely to occur inside the serialized usage JSON, so it is a safe array_agg join.
const USAGE_SEP = "";

type DailyMetricsResult = {
  date: string;
  countTraces: number;
  countObservations: number;
  totalCost: number;
  usage: Array<{
    model: string | null;
    inputUsage: number;
    outputUsage: number;
    totalUsage: number;
    totalCost: number;
    countObservations: number;
    countTraces: number;
  }>;
};

const findTimeFilter = (filter: ChFilterList): ChDateTimeFilter | undefined =>
  filter.find(
    (f) =>
      f instanceof ChDateTimeFilter &&
      f.clickhouseTable === "traces" &&
      f.field.includes("timestamp") &&
      (f.operator === ">=" || f.operator === ">"),
  ) as ChDateTimeFilter | undefined;

export const generateDailyMetrics = async ({
  projectId,
  filter,
  pagination,
}: {
  projectId: string;
  filter: ChFilterList;
  pagination?: { limit: number; page: number };
}): Promise<DailyMetricsResult[]> => {
  const tracesFilter = filter.filter((f) => f.clickhouseTable === "traces");
  const hasTracesFilter = tracesFilter.length() > 0;
  const timeFilter = findTimeFilter(filter);
  const hasNonTimestampsFilter =
    (Boolean(timeFilter) && filter.length() > 1) ||
    (!timeFilter && filter.length() > 0);

  const appliedAll = translateChFilterList(filter).apply();
  const appliedTraces = translateChFilterList(tracesFilter).apply();
  const obsLowerBound = timeFilter
    ? greptimeTsParam(
        new Date(
          timeFilter.value.getTime() - TRACE_TO_OBSERVATIONS_INTERVAL_MS,
        ),
      )
    : undefined;

  // Q1: per-day, per-model observation aggregates + collected usage JSON.
  const obsRows = await greptimeQuery<{
    date: string;
    model: string | null;
    countObservations: string | number;
    countTraces: string | number;
    totalCost: string | number | null;
    usage_blob: string | null;
  }>({
    query: `
      SELECT
        date_format(o.start_time, '%Y-%m-%d') AS date,
        o.provided_model_name AS model,
        count(o.id) AS \`countObservations\`,
        count(distinct o.trace_id) AS \`countTraces\`,
        sum(coalesce(o.total_cost, 0)) AS \`totalCost\`,
        array_to_string(array_agg(json_to_string(o.usage_details)), :usageSep) AS usage_blob
      FROM observations o
      ${hasNonTimestampsFilter ? "LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id AND " + notDeleted("t") : ""}
      WHERE o.project_id = :projectId AND ${notDeleted("o")}
        ${hasNonTimestampsFilter ? `AND t.project_id = :projectId AND ${appliedAll.query}` : ""}
        ${obsLowerBound ? "AND o.start_time >= :obsLowerBound" : ""}
      GROUP BY date, model`,
    params: {
      projectId,
      usageSep: USAGE_SEP,
      ...(hasNonTimestampsFilter ? appliedAll.params : {}),
      ...(obsLowerBound ? { obsLowerBound } : {}),
    },
    readOnly: true,
  });

  // Q2: per-day trace count.
  const traceRows = await greptimeQuery<{
    date: string;
    countTraces: string | number;
  }>({
    query: `
      SELECT date_format(t.timestamp, '%Y-%m-%d') AS date, count(t.id) AS \`countTraces\`
      FROM traces t
      WHERE t.project_id = :projectId AND ${notDeleted("t")}
        ${hasTracesFilter && appliedTraces.query ? `AND ${appliedTraces.query}` : ""}
      GROUP BY date`,
    params: { projectId, ...(hasTracesFilter ? appliedTraces.params : {}) },
    readOnly: true,
  });

  // Merge by day (emulating CH FULL OUTER JOIN over dates).
  const byDate = new Map<string, DailyMetricsResult>();
  const dayOf = (date: string): DailyMetricsResult => {
    let day = byDate.get(date);
    if (!day) {
      day = {
        date,
        countTraces: 0,
        countObservations: 0,
        totalCost: 0,
        usage: [],
      };
      byDate.set(date, day);
    }
    return day;
  };

  for (const row of obsRows) {
    const day = dayOf(row.date);
    const { inputUsage, outputUsage, totalUsage } = sumUsageBlob(
      row.usage_blob,
    );
    const modelCost = Number(row.totalCost ?? 0);
    const modelObs = Number(row.countObservations ?? 0);
    day.countObservations += modelObs;
    day.totalCost += modelCost;
    day.usage.push({
      model: row.model,
      inputUsage,
      outputUsage,
      totalUsage,
      totalCost: modelCost,
      countObservations: modelObs,
      countTraces: Number(row.countTraces ?? 0),
    });
  }
  for (const row of traceRows) {
    dayOf(row.date).countTraces = Number(row.countTraces ?? 0);
  }

  const sorted = Array.from(byDate.values()).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  if (pagination) {
    const start = (pagination.page - 1) * pagination.limit;
    return sorted.slice(start, start + pagination.limit);
  }
  return sorted;
};

/**
 * Sum a (day, model)'s collected usage maps. inputUsage/outputUsage faithfully replicate CH's
 * `positionCaseInsensitive(key, 'input'/'output')` substring match over EVERY dynamic key; totalUsage
 * is the exact `total` key (CH `sumMap(...)['total']`).
 */
const sumUsageBlob = (
  blob: string | null,
): { inputUsage: number; outputUsage: number; totalUsage: number } => {
  let inputUsage = 0;
  let outputUsage = 0;
  let totalUsage = 0;
  if (!blob) return { inputUsage, outputUsage, totalUsage };
  for (const part of blob.split(USAGE_SEP)) {
    if (!part) continue;
    let map: Record<string, unknown>;
    try {
      map = JSON.parse(part) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!map || typeof map !== "object") continue;
    for (const [key, raw] of Object.entries(map)) {
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      const lower = key.toLowerCase();
      if (lower.includes("input")) inputUsage += n;
      if (lower.includes("output")) outputUsage += n;
      if (key === "total") totalUsage += n;
    }
  }
  return { inputUsage, outputUsage, totalUsage };
};

export const getDailyMetricsCount = async ({
  projectId,
  filter,
}: {
  projectId: string;
  filter: ChFilterList;
}): Promise<number | undefined> => {
  const tracesFilter = filter.filter((f) => f.clickhouseTable === "traces");
  const applied = translateChFilterList(tracesFilter).apply();

  const rows = await greptimeQuery<{ count: string | number }>({
    query: `
      SELECT count(distinct date_format(t.timestamp, '%Y-%m-%d')) AS count
      FROM traces t
      WHERE t.project_id = :projectId AND ${notDeleted("t")}
        ${applied.query ? `AND ${applied.query}` : ""}`,
    params: { projectId, ...applied.params },
    readOnly: true,
  });
  return rows.length > 0 ? Number(rows[0].count) : undefined;
};
