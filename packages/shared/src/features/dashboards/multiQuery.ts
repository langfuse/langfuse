import { z } from "zod";
import { compileMultiQueryFormula } from "./multiQueryFormula";
export { compileMultiQueryFormula } from "./multiQueryFormula";
import { singleFilterList } from "../../interfaces/filters";
import { dimension, metric, views } from "../query/types";
import { getResultUnit, getViewDeclaration } from "../query/dataModel";

const id = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
  .max(64);
const multiQuerySourceSchema = z.object({
  id,
  label: z.string().min(1).max(200),
  view: views,
  homeCategoryFallback: z.boolean().optional(),
  homeScoreAggregate: z.boolean().optional(),
  metrics: z
    .array(metric.extend({ id, label: z.string().max(200).optional() }))
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

export const multiQueryConfigVersion = 1;

function validateSources(
  queries: z.infer<typeof multiQuerySourceSchema>[],
  ctx: z.RefinementCtx,
) {
  const queryIds = new Set<string>();
  for (const query of queries) {
    if (
      query.homeScoreAggregate &&
      (query.homeCategoryFallback || query.view !== "scores-numeric")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Home score aggregates require the score data source.",
      });
    }
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
  return queryIds;
}

export const multiQueryConfigSchema = z
  .object({
    version: z.literal(multiQueryConfigVersion),
    title: z.string().min(1),
    description: z.string().max(10000),
    queries: z.array(multiQuerySourceSchema).min(1).max(5),
    display: displaySchema,
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
    const queryIds = validateSources(config.queries, ctx);
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

const tabMetricSchema = metric.extend({
  id,
  label: z.string().max(200).optional(),
  hidden: z.boolean().optional(),
});
const tabSourceSchema = multiQuerySourceSchema.extend({
  hidden: z.boolean().optional(),
  metrics: z.array(tabMetricSchema).min(1).max(10),
});
const formulaSchema = z.object({
  id,
  label: z.string().max(200),
  expression: z.string().min(1).max(1024),
  format: z.enum(["number", "percent"]),
  hidden: z.boolean().optional(),
});
export const multiQueryTabSchema = z
  .object({
    id,
    label: z.string().min(1).max(200),
    queries: z.array(tabSourceSchema).min(1).max(5),
    display: displaySchema,
    formulas: z.array(formulaSchema).max(5).optional(),
  })
  .superRefine((tab, ctx) => {
    const ids = validateSources(tab.queries, ctx);
    if (!tab.formulas?.length) return;
    const dimensions = new Map<string, string>();
    const histograms = new Set<string>();
    const sample = new Map<string, { value: number; unit?: string }>();
    for (const q of tab.queries) {
      const declaration = getViewDeclaration(q.view, "v2");
      const fields = new Set(q.dimensions.map((d) => d.field));
      for (const metric of q.metrics) {
        const implicit =
          declaration.measures[metric.measure]?.requiresDimension;
        if (implicit) fields.add(implicit);
      }
      const grain = JSON.stringify([...fields].sort());
      for (const m of q.metrics) {
        const ref = `${q.id}.${m.id}`;
        sample.set(ref, { value: 1, unit: storedMetricUnit(q, m) });
        dimensions.set(ref, grain);
        if (m.aggregation === "histogram") histograms.add(ref);
      }
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
  });
export const multiQueryConfigV2Schema = z
  .object({
    version: z.literal(2),
    title: z.string().min(1),
    description: z.string().max(10000),
    tabs: z.array(multiQueryTabSchema).min(1).max(9),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.tabs.map((t) => t.id)).size !== c.tabs.length)
      ctx.addIssue({
        code: "custom",
        path: ["tabs"],
        message: "Tab identifiers must be unique",
      });
  });
export const savedMultiQueryConfigSchema = z.discriminatedUnion("version", [
  multiQueryConfigSchema,
  multiQueryConfigV2Schema,
]);
export type MultiQueryConfigV2 = z.infer<typeof multiQueryConfigV2Schema>;
export type SavedMultiQueryConfig = z.infer<typeof savedMultiQueryConfigSchema>;
export type MultiQueryTab = z.infer<typeof multiQueryTabSchema>;
export type MultiQueryFormula = z.infer<typeof formulaSchema>;

function storedMetricUnit(
  source: MultiQueryConfig["queries"][number],
  metric: MultiQueryConfig["queries"][number]["metrics"][number],
) {
  if (metric.aggregation === "histogram") return "integer";
  return (
    getResultUnit(source.view, metric.measure, metric.aggregation, "v2") ??
    getResultUnit(source.view, metric.measure, metric.aggregation, "v1")
  );
}

/** Older plotted results occupied one panel per unit. Preserve each panel as an independently editable chart. */
function migrateUnitPanels(tab: MultiQueryTab): MultiQueryTab[] {
  if (tab.display.chartType === "PIVOT_TABLE") return [tab];
  const byUnit = new Map<string, MultiQueryTab["queries"]>();
  for (const source of tab.queries) {
    const grouped = new Map<string, typeof source.metrics>();
    for (const metric of source.metrics) {
      const unit = storedMetricUnit(source, metric) ?? "number";
      const metrics = grouped.get(unit) ?? [];
      metrics.push(metric);
      grouped.set(unit, metrics);
    }
    for (const [unit, metrics] of grouped) {
      const sources = byUnit.get(unit) ?? [];
      // Keep the original query and its ranking, including unplotted metrics used to select top groups.
      sources.push({
        ...source,
        metrics: source.metrics.map((m) =>
          metrics.includes(m) ? m : { ...m, hidden: true },
        ),
      });
      byUnit.set(unit, sources);
    }
  }
  if (byUnit.size <= 1) return [tab];
  return [...byUnit].map(([unit, queries], index) => {
    const name =
      {
        USD: "Cost",
        tokens: "Tokens",
        milliseconds: "Duration",
        integer: "Count",
        number: "Value",
      }[unit] ?? unit;
    return {
      ...tab,
      id: index === 0 ? tab.id : `${tab.id.slice(0, 55)}_unit${index + 1}`,
      label: `${tab.label} · ${name}`.slice(0, 200),
      queries,
    };
  });
}

/** Reading or exporting a stored v1 configuration preserves its original wire representation. */
export function normalizeMultiQueryConfig(
  config: SavedMultiQueryConfig,
): MultiQueryConfigV2 {
  if (config.version === 2) return config;
  const views = config.views ?? [];
  const makeTab = (
    id: string,
    label: string,
    queries: MultiQueryConfig["queries"],
  ): MultiQueryTab => ({
    id,
    label,
    queries: structuredClone(queries),
    display: { ...config.display },
  });
  let baseId = "chart";
  while (views.some((v) => v.id === baseId)) baseId += "_";
  const base = makeTab(baseId, config.title || "Chart", config.queries);
  const hasDefault = views.some((v) => v.id === config.defaultViewId);
  const repeatsLegend =
    !hasDefault &&
    views.length === config.queries.length &&
    config.queries.every((q) =>
      views.some(
        (v) =>
          v.queryIds.length === 1 &&
          v.queryIds[0] === q.id &&
          v.label === q.label,
      ),
    );
  const tabViews = repeatsLegend ? [] : views;
  const saved = tabViews.map((view) =>
    makeTab(
      view.id,
      view.label,
      config.queries.filter((q) => view.queryIds.includes(q.id)),
    ),
  );
  let tabs = [base, ...saved];
  if (hasDefault) {
    const first = saved.find((t) => t.id === config.defaultViewId)!;
    const covered = new Set(saved.flatMap((t) => t.queries.map((q) => q.id)));
    const others = config.queries.filter((q) => !covered.has(q.id));
    tabs = [first, ...saved.filter((t) => t !== first)];
    if (others.length) tabs.push(makeTab(baseId, "Other series", others));
  }
  const panels = tabs.flatMap(migrateUnitPanels);
  const ids = new Set<string>();
  if (panels.length <= 9) {
    tabs = panels.map((tab) => {
      let id = tab.id;
      let suffix = 1;
      while (ids.has(id)) id = `${tab.id.slice(0, 58)}_${++suffix}`;
      ids.add(id);
      return id === tab.id ? tab : { ...tab, id };
    });
  } else {
    // At the v1 format limit a table retains every value and its unit in the original named views.
    tabs = tabs.map((tab) =>
      migrateUnitPanels(tab).length > 1
        ? { ...tab, display: { ...tab.display, chartType: "PIVOT_TABLE" } }
        : tab,
    );
  }
  return {
    version: 2,
    title: config.title,
    description: config.description,
    tabs,
  };
}
export function multiQueryTabAsChart(
  tab: MultiQueryTab,
  title = tab.label,
  description = "",
): MultiQueryConfig {
  return {
    version: 1,
    title,
    description,
    queries: tab.queries,
    display: tab.display,
  };
}
