import type { QueryType } from "../../query/types";
import { sortFiltersCanonically } from "../service/helpers";
import type { Monitor } from "../types";
import type { MonitorQueueEvent } from "../scheduler/types";
import { monitorEvaluationOffsetMs, windowToMs } from "../types";

/** buildMonitorQuery converts the accepted metrics of a MonitorQueueEvent into the scalar QueryType executeQuery accepts. */
export function buildMonitorQuery(
  acceptedMetrics: QueryType["metrics"],
  event: MonitorQueueEvent,
  filters: Monitor["filters"],
): QueryType {
  const { fromTimestamp, toTimestamp } = evaluationWindow(
    event.window,
    event.runAt,
  );
  const metrics = dedupeMetrics([
    ...acceptedMetrics,
    { measure: "count", aggregation: "count" as const },
  ]);
  return {
    view: event.view,
    dimensions: [],
    metrics,
    filters,
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };
}

/** filtersFingerprint canonicalizes a monitor's filters for stable group-by keys. */
export function filtersFingerprint(filters: Monitor["filters"]): string {
  return JSON.stringify(sortFiltersCanonically(filters));
}

/** MonitorFilterGroup is one distinct filter set and the monitors that share it. */
export type MonitorFilterGroup = {
  filters: Monitor["filters"];
  monitorIds: string[];
};

/** groupMonitorsByFilters buckets claimed monitors by their stored filter set so each query uses the monitor's own filters rather than the scheduler batch aggregate. */
export function groupMonitorsByFilters(
  monitors: Monitor[],
): MonitorFilterGroup[] {
  const groups = new Map<string, MonitorFilterGroup>();
  for (const monitor of monitors) {
    const fingerprint = filtersFingerprint(monitor.filters);
    const existing = groups.get(fingerprint);
    if (existing) {
      existing.monitorIds.push(monitor.id);
      continue;
    }
    groups.set(fingerprint, {
      filters: monitor.filters,
      monitorIds: [monitor.id],
    });
  }
  return [...groups.values()];
}

/** monitorMetricsForEvent maps each claimed monitor id to the metric row it evaluates. */
export function monitorMetricsForEvent(
  event: MonitorQueueEvent,
  monitors: Monitor[],
): Map<string, Monitor["metric"]> {
  const metricByName = new Map(
    event.monitors.map((monitor) => [monitor.monitorId, monitor.metricName]),
  );
  const metricsByMonitorId = new Map<string, Monitor["metric"]>();
  for (const monitor of monitors) {
    const metricName = metricByName.get(monitor.id);
    if (!metricName) continue;
    const [aggregation, measure] = metricName.split("_", 2);
    if (!aggregation || !measure) continue;
    metricsByMonitorId.set(monitor.id, {
      aggregation: aggregation as Monitor["metric"]["aggregation"],
      measure,
    });
  }
  return metricsByMonitorId;
}

/** metricsForMonitorIds dedupes the metrics needed by the monitors in one filter group. */
export function metricsForMonitorIds(
  monitorMetrics: Map<string, Monitor["metric"]>,
  monitorIds: string[],
): QueryType["metrics"] {
  const seen = new Set<string>();
  const metrics: QueryType["metrics"] = [];
  for (const monitorId of monitorIds) {
    const metric = monitorMetrics.get(monitorId);
    if (!metric) continue;
    const key = metricKey(metric);
    if (seen.has(key)) continue;
    seen.add(key);
    metrics.push(metric);
  }
  return metrics;
}

/** dedupeMetrics drops duplicate metrics keyed by `${aggregation}_${measure}` so the appended row-count metric never collides with an existing count metric. */
function dedupeMetrics(metrics: QueryType["metrics"]): QueryType["metrics"] {
  const seen = new Set<string>();
  return metrics.filter((m) => {
    const key = metricKey(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** metricKey is the `${aggregation}_${measure}` column name a metric resolves to in the query result row. */
function metricKey(metric: { measure: string; aggregation: string }): string {
  return `${metric.aggregation}_${metric.measure}`;
}

/** evaluationWindow returns the `[runAt - window, runAt]` edges, both shifted back by monitorEvaluationOffsetMs. */
function evaluationWindow(
  window: MonitorQueueEvent["window"],
  runAt: Date,
): {
  fromTimestamp: Date;
  toTimestamp: Date;
} {
  const windowMs = Number(windowToMs(window));
  const toTimestamp = new Date(runAt.getTime() - monitorEvaluationOffsetMs);
  const fromTimestamp = new Date(toTimestamp.getTime() - windowMs);
  return { fromTimestamp, toTimestamp };
}
