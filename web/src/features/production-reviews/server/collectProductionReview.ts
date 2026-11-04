import { type FilterState } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { type QueryType } from "@langfuse/shared/query";
import { executeQuery } from "@langfuse/shared/query/server";

import {
  buildProductionReviewMarkdown,
  type LatencyMeasurement,
  type NamedCount,
  type ProductionReviewMeasurements,
  type ScoreMeasurement,
} from "@/src/features/production-reviews/buildProductionReviewMarkdown";
import { listPublicTopics } from "@/src/features/topics/server/publicApi";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_ROWS = 8;
const TOPICS_UNAVAILABLE = "Topics is not available for this project.";

const ROOTS: FilterState = [
  {
    column: "isRootObservation",
    operator: "=",
    value: true,
    type: "boolean",
  },
];

const GENERATIONS: FilterState = [
  {
    column: "type",
    operator: "=",
    value: "GENERATION",
    type: "string",
  },
];

const ERRORS: FilterState = [
  {
    column: "level",
    operator: "=",
    value: "ERROR",
    type: "string",
  },
];

type Window = {
  from: Date;
  to: Date;
};

function numberFrom(
  row: Record<string, unknown> | undefined,
  key: string,
): number {
  if (!row) return 0;
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function nameFrom(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : "(unnamed)";
}

function buildQuery(input: {
  window: Window;
  view: "observations" | "scores-numeric";
  filters: FilterState;
  dimensions: { field: string }[];
  metrics: QueryType["metrics"];
  orderField: string | null;
  rowLimit?: number;
}): QueryType {
  return {
    view: input.view,
    dimensions: input.dimensions,
    metrics: input.metrics,
    filters: input.filters,
    timeDimension: null,
    fromTimestamp: input.window.from.toISOString(),
    toTimestamp: input.window.to.toISOString(),
    orderBy: input.orderField
      ? [{ field: input.orderField, direction: "desc" }]
      : null,
    chartConfig: input.rowLimit
      ? { type: "TABLE", row_limit: input.rowLimit }
      : undefined,
  };
}

async function rows(
  projectId: string,
  query: QueryType,
): Promise<Record<string, unknown>[]> {
  return executeQuery(projectId, query, "v2", true);
}

async function load<T>(
  section: string,
  run: () => Promise<T>,
): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    logger.warn("Production review measurement failed", {
      section,
      error: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

async function countRoots(projectId: string, window: Window): Promise<number> {
  const result = await rows(
    projectId,
    buildQuery({
      window,
      view: "observations",
      filters: ROOTS,
      dimensions: [],
      metrics: [{ measure: "count", aggregation: "count" }],
      orderField: null,
    }),
  );
  return numberFrom(result[0], "count_count");
}

async function topTraces(
  projectId: string,
  window: Window,
): Promise<NamedCount[]> {
  const result = await rows(
    projectId,
    buildQuery({
      window,
      view: "observations",
      filters: ROOTS,
      dimensions: [{ field: "traceName" }],
      metrics: [{ measure: "count", aggregation: "count" }],
      orderField: "count_count",
      rowLimit: TOP_ROWS,
    }),
  );
  return result.map((row) => ({
    name: nameFrom(row, "traceName"),
    value: numberFrom(row, "count_count"),
  }));
}

async function slowestGenerations(
  projectId: string,
  window: Window,
): Promise<LatencyMeasurement[]> {
  const result = await rows(
    projectId,
    buildQuery({
      window,
      view: "observations",
      filters: GENERATIONS,
      dimensions: [{ field: "traceName" }],
      metrics: [{ measure: "latency", aggregation: "p95" }],
      orderField: "p95_latency",
      rowLimit: TOP_ROWS,
    }),
  );
  return result.map((row) => ({
    name: nameFrom(row, "traceName"),
    p95Ms: numberFrom(row, "p95_latency"),
  }));
}

async function errorCounts(
  projectId: string,
  window: Window,
): Promise<NamedCount[]> {
  const result = await rows(
    projectId,
    buildQuery({
      window,
      view: "observations",
      filters: ERRORS,
      dimensions: [{ field: "name" }],
      metrics: [{ measure: "count", aggregation: "count" }],
      orderField: "count_count",
      rowLimit: TOP_ROWS,
    }),
  );
  return result.map((row) => ({
    name: nameFrom(row, "name"),
    value: numberFrom(row, "count_count"),
  }));
}

async function totalCost(projectId: string, window: Window): Promise<number> {
  const result = await rows(
    projectId,
    buildQuery({
      window,
      view: "observations",
      filters: [],
      dimensions: [],
      metrics: [{ measure: "totalCost", aggregation: "sum" }],
      orderField: null,
    }),
  );
  return numberFrom(result[0], "sum_totalCost");
}

async function scoreRows(
  projectId: string,
  window: Window,
): Promise<ScoreMeasurement[]> {
  const result = await rows(
    projectId,
    buildQuery({
      window,
      view: "scores-numeric",
      filters: [],
      dimensions: [{ field: "name" }],
      metrics: [
        { measure: "value", aggregation: "avg" },
        { measure: "count", aggregation: "count" },
      ],
      orderField: "count_count",
      rowLimit: 12,
    }),
  );
  return result.map((row) => ({
    name: nameFrom(row, "name"),
    average: numberFrom(row, "avg_value"),
    count: numberFrom(row, "count_count"),
  }));
}

async function topicCounts(
  projectId: string,
  window: Window,
): Promise<{ topics: NamedCount[] | null; topicsUnavailable: boolean }> {
  try {
    const listed = await listPublicTopics({
      projectId,
      fromTimestamp: window.from,
      toTimestamp: window.to,
      orderBy: "traceCount.desc",
      page: 1,
      limit: 20,
    });
    const totals = new Map<string, number>();
    for (const topic of listed.data) {
      totals.set(topic.name, (totals.get(topic.name) ?? 0) + topic.traceCount);
    }
    return {
      topicsUnavailable: false,
      topics: [...totals.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, TOP_ROWS)
        .map(([name, value]) => ({ name, value })),
    };
  } catch (error) {
    if (error instanceof Error && error.message === TOPICS_UNAVAILABLE) {
      return { topics: null, topicsUnavailable: true };
    }
    logger.warn("Production review measurement failed", {
      section: "topics",
      error: error instanceof Error ? error.name : "unknown",
    });
    return { topics: null, topicsUnavailable: false };
  }
}

export async function collectProductionReview(
  projectId: string,
  now = new Date(),
): Promise<{
  markdown: string;
  windowStart: Date;
  windowEnd: Date;
}> {
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - DAY_MS);
  const current: Window = { from: windowStart, to: windowEnd };
  const previous: Window = {
    from: new Date(now.getTime() - 2 * DAY_MS),
    to: windowStart,
  };

  const [
    volume,
    previousVolume,
    traces,
    previousTraces,
    slowest,
    errors,
    previousErrors,
    costUsd,
    previousCostUsd,
    scores,
    previousScores,
    topics,
  ] = await Promise.all([
    load("volume", () => countRoots(projectId, current)),
    load("volume", () => countRoots(projectId, previous)),
    load("trace names", () => topTraces(projectId, current)),
    load("trace names", () => topTraces(projectId, previous)),
    load("latency", () => slowestGenerations(projectId, current)),
    load("errors", () => errorCounts(projectId, current)),
    load("errors", () => errorCounts(projectId, previous)),
    load("cost", () => totalCost(projectId, current)),
    load("cost", () => totalCost(projectId, previous)),
    load("scores", () => scoreRows(projectId, current)),
    load("scores", () => scoreRows(projectId, previous)),
    topicCounts(projectId, current),
  ]);

  const measurements: ProductionReviewMeasurements = {
    windowStart,
    windowEnd,
    volume,
    previousVolume,
    topTraces: traces,
    previousTopTraces: previousTraces,
    slowest,
    errors,
    previousErrors,
    costUsd,
    previousCostUsd,
    scores,
    previousScores,
    topics: topics.topics,
    topicsUnavailable: topics.topicsUnavailable,
  };

  return {
    windowStart,
    windowEnd,
    markdown: buildProductionReviewMarkdown(measurements),
  };
}
