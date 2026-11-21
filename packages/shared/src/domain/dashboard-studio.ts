import { z } from "zod";
import { DashboardWidgetChartType } from "@prisma/client";
import { singleFilterList } from "../interfaces/filters";
import { metricAggregations, views, query } from "../features/query/types";

const identifier = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
  .max(64);

const summaryMetric = z
  .object({
    measure: z.string().min(1).max(100),
    aggregation: metricAggregations,
    percentile: z.number().positive().lt(100).optional(),
  })
  .refine(
    (metric) =>
      metric.percentile === undefined || /^p\d+$/.test(metric.aggregation),
    { message: "A custom percentile requires a percentile aggregation" },
  );

const scoreTarget = z.enum([
  "all",
  "trace",
  "observation",
  "session",
  "experiment",
]);

export const StudioMetricSchema = z
  .object({
    id: identifier,
    label: z.string().max(200).optional(),
    measure: z.string().min(1).max(100),
    aggregation: metricAggregations,
    percentile: z.number().positive().lt(100).optional(),
    summary: summaryMetric.optional(),
  })
  .refine(
    (metric) =>
      metric.percentile === undefined || /^p\d+$/.test(metric.aggregation),
    { message: "A custom percentile requires a percentile aggregation" },
  );

export const StudioQuerySchema = z.object({
  id: identifier,
  label: z.string().max(200),
  view: views,
  metrics: z.array(StudioMetricSchema).min(1).max(10),
  dimensions: z.array(z.object({ field: z.string().min(1).max(100) })).max(3),
  filters: singleFilterList,
  scoreTarget: scoreTarget.optional(),
  orderBy: query.shape.orderBy.unwrap().max(4).nullish(),
  hidden: z.boolean().optional(),
});

export const StudioWidgetConfigSchema = z
  .object({
    version: z.literal(1),
    executionMode: z.enum(["current", "prototype"]).optional(),
    title: z.string().min(1).max(200),
    description: z.string().max(10000),
    queries: z.array(StudioQuerySchema).min(1).max(8),
    expressions: z
      .array(
        z.object({
          id: identifier,
          label: z.string().max(200),
          formula: z.string().min(1).max(500),
          unit: z.string().max(40).optional(),
          hidden: z.boolean().optional(),
        }),
      )
      .max(8),
    display: z.object({
      chartType: z.enum(DashboardWidgetChartType),
      unit: z.string().max(40).optional(),
      showHeadline: z.boolean().optional(),
      headlineMetricRef: z.string().max(129).optional(),
      timeSeries: z.boolean().optional(),
      rowLimit: z.number().int().min(1).max(1000).optional(),
      bins: z.number().int().min(1).max(100).optional(),
      histogramEdges: z.array(z.number()).min(2).max(51).optional(),
      activeQueryIds: z.array(identifier).max(8).optional(),
      hiddenSeriesIds: z.array(z.string().max(4096)).max(1000).optional(),
      legend: z.boolean().optional(),
    }),
  })
  .superRefine((config, ctx) => {
    const ids = new Set<string>();
    for (const query of config.queries) {
      if (
        query.scoreTarget &&
        query.scoreTarget !== "all" &&
        !query.view.startsWith("scores-")
      )
        ctx.addIssue({
          code: "custom",
          message: "Score attachment scope is only available for score sources",
        });
      if (ids.has(query.id))
        ctx.addIssue({
          code: "custom",
          message: `Duplicate query id: ${query.id}`,
        });
      ids.add(query.id);
      const metrics = new Set<string>();
      for (const metric of query.metrics) {
        if (metrics.has(metric.id))
          ctx.addIssue({
            code: "custom",
            message: `Duplicate metric id: ${query.id}.${metric.id}`,
          });
        metrics.add(metric.id);
      }
      const outputs = query.metrics.map(
        (metric) => `${metric.aggregation}_${metric.measure}`,
      );
      if (new Set(outputs).size !== outputs.length)
        ctx.addIssue({
          code: "custom",
          message:
            "Put repeated measure/aggregation pairs in independent queries so their output aliases remain distinct",
        });
    }
    if (
      config.display.headlineMetricRef &&
      !config.queries.some((query) =>
        query.metrics.some(
          (metric) =>
            `${query.id}.${metric.id}` === config.display.headlineMetricRef,
        ),
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["display", "headlineMetricRef"],
        message: "Choose an existing metric for the headline",
      });
    for (const expression of config.expressions) {
      if (ids.has(expression.id))
        ctx.addIssue({
          code: "custom",
          message: `Duplicate expression id: ${expression.id}`,
        });
      ids.add(expression.id);
    }
    for (const id of config.display.activeQueryIds ?? []) {
      if (!config.queries.some((query) => query.id === id))
        ctx.addIssue({
          code: "custom",
          message: `Unknown active query: ${id}`,
        });
    }
    const edges = config.display.histogramEdges;
    if (edges?.some((edge, index) => index > 0 && edge <= edges[index - 1])) {
      ctx.addIssue({
        code: "custom",
        message: "Histogram edges must be strictly increasing",
      });
    }
  });

export type StudioMetric = z.infer<typeof StudioMetricSchema>;
export type StudioQuery = z.infer<typeof StudioQuerySchema>;
export type StudioWidgetConfig = z.infer<typeof StudioWidgetConfigSchema>;

export type StudioRow = {
  seriesId: string;
  label: string;
  queryId: string;
  metricId: string;
  time: string | null;
  dimensions: Record<string, string | null>;
  dimension: string | null;
  value: number | null;
  /** Score records contributing to an untransformed numeric or boolean mean. */
  evaluationCount?: number;
};

export type StudioSeries = {
  id: string;
  label: string;
  unit?: string;
  rawUnit?: string;
  bucketUnit?: string;
  queryId: string;
  metricId: string;
  dimensions: Record<string, string | null>;
  aggregation: string;
  scoreTarget?: z.infer<typeof scoreTarget>;
};

export type StudioDiagnostic = {
  queryId: string;
  status: "complete" | "error";
  durationMs: number;
  queryCount: number;
  resultRows: number;
  error?: string;
  compiledSql?: string;
  rowsRead?: number;
  bytesRead?: number;
  serverElapsedMs?: number;
};

export type StudioResult = {
  status: "complete" | "partial" | "error";
  series: StudioSeries[];
  rows: StudioRow[];
  summaries: StudioRow[];
  diagnostics: StudioDiagnostic[];
  warnings: string[];
};
