import { z } from "zod";
import { singleFilterList } from "../../interfaces/filters";
import { dimension, metric, views } from "../query/types";

const id = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
  .max(64);
const multiQuerySourceSchema = z.object({
  id,
  label: z.string().min(1).max(200),
  view: views,
  metrics: z
    .array(metric.extend({ id, label: z.string().max(200).optional() }))
    .min(1)
    .max(5),
  dimensions: z.array(dimension).max(3),
  filters: singleFilterList,
  orderBy: z
    .array(
      z.object({
        field: z.string().min(1).max(200),
        direction: z.enum(["asc", "desc"]),
      }),
    )
    .max(4)
    .nullable()
    .optional(),
});

export const multiQueryConfigVersion = 1;

export const multiQueryConfigSchema = z
  .object({
    version: z.literal(multiQueryConfigVersion),
    title: z.string().min(1).max(200),
    description: z.string().max(10000),
    queries: z.array(multiQuerySourceSchema).min(1).max(5),
    display: z.object({
      chartType: z.enum([
        "LINE_TIME_SERIES",
        "AREA_TIME_SERIES",
        "BAR_TIME_SERIES",
        "VERTICAL_BAR",
        "HORIZONTAL_BAR",
        "PIE",
        "NUMBER",
        "HISTOGRAM",
        "PIVOT_TABLE",
      ]),
      rowLimit: z.number().int().min(1).max(1000).optional(),
      bins: z.number().int().min(1).max(100).optional(),
      legend: z.boolean().optional(),
    }),
    views: z
      .array(
        z.object({
          id,
          label: z.string().min(1).max(100),
          queryIds: z.array(id).min(1).max(5),
        }),
      )
      .max(8)
      .optional(),
    defaultViewId: id.optional(),
  })
  .superRefine((config, ctx) => {
    const queryIds = new Set<string>();
    for (const query of config.queries) {
      if (queryIds.has(query.id))
        ctx.addIssue({
          code: "custom",
          message: "Series identifiers must be unique",
        });
      queryIds.add(query.id);
      if (
        new Set(query.metrics.map((metric) => metric.id)).size !==
        query.metrics.length
      )
        ctx.addIssue({
          code: "custom",
          message: "Metric identifiers must be unique within a series",
        });
      if (
        new Set(
          query.metrics.map(
            (metric) => `${metric.aggregation}_${metric.measure}`,
          ),
        ).size !== query.metrics.length
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Choose distinct metric and aggregation pairs within each series",
        });
    }
    const viewIds = new Set<string>();
    for (const view of config.views ?? []) {
      if (viewIds.has(view.id))
        ctx.addIssue({
          code: "custom",
          message: "View identifiers must be unique",
        });
      viewIds.add(view.id);
      if (
        new Set(view.queryIds).size !== view.queryIds.length ||
        view.queryIds.some((id) => !queryIds.has(id))
      )
        ctx.addIssue({
          code: "custom",
          message: "A view must reference distinct existing series",
        });
    }
    if (config.defaultViewId && !viewIds.has(config.defaultViewId))
      ctx.addIssue({ code: "custom", message: "The default view must exist" });
  });

export type MultiQueryConfig = z.infer<typeof multiQueryConfigSchema>;
