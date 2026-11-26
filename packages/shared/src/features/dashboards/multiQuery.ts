import { z } from "zod";
import { singleFilterList } from "../../interfaces/filters";
import {
  dimension,
  getValidAggregationsForMeasureType,
  metric,
  views,
} from "../query/types";
import { getResultUnit, getViewDeclaration } from "../query/dataModel";
import { compileMultiQueryFormula } from "./multiQueryFormula";

export const widgetQueryViewSchema = z.enum([...views.options, "scores"]);
type WidgetQueryView = z.infer<typeof widgetQueryViewSchema>;

/** Score summaries use the numeric score declaration for shared field metadata. */
export function getWidgetQueryView(view: WidgetQueryView) {
  return view === "scores" ? "scores-numeric" : view;
}

const id = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
  .max(64);
const tabSourceSchema = z.object({
  id,
  label: z.string().max(200),
  view: widgetQueryViewSchema,
  hidden: z.boolean().optional(),
  metrics: z
    .array(
      metric.extend({
        id,
        label: z.string().max(200).optional(),
        hidden: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(10),
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

const displaySchema = z.object({
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
  defaultSort: z
    .object({ column: z.string(), order: z.enum(["ASC", "DESC"]) })
    .optional(),
  showValueLabels: z.boolean().optional(),
  rowLimit: z.number().int().min(1).max(1000).optional(),
  bins: z.number().int().min(1).max(100).optional(),
  legend: z.boolean().optional(),
  subtotalMetric: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*$/)
    .max(129)
    .optional(),
  hideUnattributedRows: z.boolean().optional(),
  timeBuckets: z.enum(["auto", "dashboard"]).optional(),
});

const formulaSchema = z.object({
  id,
  label: z.string().max(200),
  expression: z.string().max(1024),
  format: z.enum(["number", "percent"]),
  hidden: z.boolean().optional(),
});
export const multiQueryTabSchema = z.object({
  id,
  label: z.string().max(200),
  queries: z.array(tabSourceSchema).min(1).max(5),
  display: displaySchema,
  formulas: z.array(formulaSchema).max(5).optional(),
});

export const multiQueryConfigSchema = z.object({
  title: z.string(),
  description: z.string(),
  tabs: z.array(multiQueryTabSchema).min(1).max(9),
});
export type MultiQueryConfig = z.infer<typeof multiQueryConfigSchema>;
export type MultiQueryTab = z.infer<typeof multiQueryTabSchema>;
export type MultiQueryFormula = z.infer<typeof formulaSchema>;

function validateTab(tab: MultiQueryTab, ctx: z.RefinementCtx) {
  const ids = new Set<string>();
  const dimensions = new Map<string, string>();
  const histograms = new Set<string>();
  const sample = new Map<string, { value: number; unit?: string }>();
  if (!tab.label.length)
    ctx.addIssue({
      code: "custom",
      path: ["label"],
      message: "Enter a tab name",
    });
  for (const [queryIndex, q] of tab.queries.entries()) {
    const queryPath = ["queries", queryIndex];
    if (ids.has(q.id))
      ctx.addIssue({
        code: "custom",
        path: [...queryPath, "id"],
        message: "Series identifiers must be unique",
      });
    ids.add(q.id);
    if (!q.label.length)
      ctx.addIssue({
        code: "custom",
        path: [...queryPath, "label"],
        message: "Enter a series name",
      });

    const view = getWidgetQueryView(q.view);
    const current = getViewDeclaration(view, "v2");
    const legacy = getViewDeclaration(view, "v1");
    const fields = new Set(q.dimensions.map((d) => d.field));
    for (const [index, { field }] of q.dimensions.entries()) {
      if (
        !Object.hasOwn(current.dimensions, field) &&
        !Object.hasOwn(legacy.dimensions, field)
      ) {
        ctx.addIssue({
          code: "custom",
          path: [...queryPath, "dimensions", index, "field"],
          message: `Unknown breakdown field: ${field}`,
        });
      }
    }

    const metricIds = new Set<string>();
    const metricPairs = new Set<string>();
    for (const [index, m] of q.metrics.entries()) {
      const path = [...queryPath, "metrics", index];
      if (metricIds.has(m.id))
        ctx.addIssue({
          code: "custom",
          path: [...path, "id"],
          message: "Metric identifiers must be unique within a series",
        });
      metricIds.add(m.id);
      const pair = `${m.aggregation}_${m.measure}`;
      if (metricPairs.has(pair))
        ctx.addIssue({
          code: "custom",
          path,
          message:
            "Choose distinct metric and aggregation pairs within each series",
        });
      metricPairs.add(pair);
      const declarations = [current, legacy].flatMap((v) =>
        Object.hasOwn(v.measures, m.measure) ? [v.measures[m.measure]!] : [],
      );
      if (!declarations.length)
        ctx.addIssue({
          code: "custom",
          path: [...path, "measure"],
          message: `Unknown measure: ${m.measure}`,
        });
      else if (
        !declarations.some((d) =>
          getValidAggregationsForMeasureType(
            d.aggregationOverrides?.[m.aggregation]?.type ?? d.type,
          ).includes(m.aggregation),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "aggregation"],
          message: `Aggregation ${m.aggregation} is unavailable for ${m.measure}`,
        });
      }
      const implicit = declarations[0]?.requiresDimension;
      if (implicit) fields.add(implicit);
      const ref = `${q.id}.${m.id}`;
      const unit =
        m.aggregation === "histogram"
          ? "integer"
          : (getResultUnit(view, m.measure, m.aggregation, "v2") ??
            getResultUnit(view, m.measure, m.aggregation, "v1"));
      sample.set(ref, { value: 1, unit });
      if (m.aggregation === "histogram") histograms.add(ref);
    }
    if (
      q.view === "scores" &&
      (tab.display.chartType.endsWith("_TIME_SERIES") ||
        [...fields].some(
          (field) => !["name", "source", "dataType"].includes(field),
        ) ||
        [...metricPairs].some(
          (m) => !["count_count", "sum_count", "avg_value"].includes(m),
        ))
    ) {
      ctx.addIssue({
        code: "custom",
        path: queryPath,
        message:
          "Score summary supports counts and numeric means, grouped by name, source or data type over the full time range.",
      });
    }
    const grain = JSON.stringify([...fields].sort());
    for (const m of q.metrics) dimensions.set(`${q.id}.${m.id}`, grain);
  }
  for (const [index, formula] of (tab.formulas ?? []).entries()) {
    const path = ["formulas", index];
    if (ids.has(formula.id))
      ctx.addIssue({
        code: "custom",
        path,
        message: "Series and formula identifiers must be unique in a tab",
      });
    ids.add(formula.id);
    try {
      const { references, evaluate } = compileMultiQueryFormula(
        formula.expression,
      );
      const grains = new Set<string>();
      for (const ref of references) {
        const grain = dimensions.get(ref);
        if (grain === undefined)
          throw new Error(`Unknown metric in this tab: ${ref}`);
        if (histograms.has(ref))
          throw new Error("Use a scalar metric in a formula");
        grains.add(grain);
      }
      const unit = evaluate(sample).unit;
      if (formula.format === "percent" && unit)
        throw new Error(
          "A percentage needs a dimensionless ratio, such as errors divided by total observations",
        );
      if (grains.size > 1)
        throw new Error("Formula inputs must use the same breakdown fields");
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "expression"],
        message: error instanceof Error ? error.message : "Invalid formula",
      });
    }
  }
}

export const multiQueryTabSaveSchema =
  multiQueryTabSchema.superRefine(validateTab);

export const multiQueryConfigSaveSchema = multiQueryConfigSchema
  .extend({
    title: z.string().min(1),
    description: z.string().max(10_000),
    tabs: z.array(multiQueryTabSaveSchema).min(1).max(9),
  })
  .superRefine((config, ctx) => {
    if (new Set(config.tabs.map((tab) => tab.id)).size !== config.tabs.length)
      ctx.addIssue({
        code: "custom",
        path: ["tabs"],
        message: "Tab identifiers must be unique",
      });
  });
