import {
  type FilterState,
  type StudioResult,
  type StudioRow,
  type StudioSeries,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import {
  getResultUnit,
  getViewDeclaration,
  getValidAggregationsForMeasureType,
  validateQuery,
  type QueryType,
  type ViewVersion,
} from "@langfuse/shared/query";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import {
  evaluateStudioFormula,
  studioFormulaReferences,
  type StudioExpressionValue,
} from "@/src/features/dashboard/lib/studioExpressions";

type Source = StudioWidgetConfig["queries"][number];
type Metric = Source["metrics"][number];
type Context = {
  version: ViewVersion;
  fromTimestamp: string;
  toTimestamp: string;
  filters: FilterState;
};
type Request = {
  sourceId: string;
  summary: boolean;
  query: QueryType;
  metrics: Metric[];
};
export type CurrentStudioPlan = {
  config: StudioWidgetConfig;
  version: ViewVersion;
  requests: Request[];
  warnings: string[];
  units: Map<string, string | undefined>;
  dimensions: Map<string, string[]>;
};
export type CurrentStudioResponse = {
  rows?: Record<string, unknown>[];
  error?: unknown;
};

const scalar = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const text = (value: unknown): string | null => {
  if (value == null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
};
const metricUnit = (
  view: Source["view"],
  metric: Metric,
  version: ViewVersion,
) =>
  metric.aggregation === "histogram" ||
  (metric.measure === "count" && metric.aggregation === "count")
    ? getViewDeclaration(view, version).measures.count?.unit
    : getResultUnit(view, metric.measure, metric.aggregation, version);
const metricField = (
  view: Source["view"],
  metric: Metric,
  version: ViewVersion,
) =>
  `${metric.aggregation}_${getViewDeclaration(view, version).measures[metric.measure]?.alias ?? metric.measure}`;

function targetFilters(source: Source): FilterState {
  const target = source.scoreTarget;
  if (!target || target === "all") return [];
  if (!source.view.startsWith("scores-"))
    throw new Error("Score attachment scope requires a score source.");
  if (target === "trace")
    throw new Error(
      "Current queries cannot express the implicit trace-target fallback in one flat predicate. Use explicit trace/observation ID filters or the prototype.",
    );
  const nullFilter = (
    column: string,
    present: boolean,
  ): FilterState[number] => ({
    column,
    type: "null",
    operator: present ? "is not null" : "is null",
    value: "",
  });
  if (target === "observation") return [nullFilter("observationId", true)];
  const filters = [
    nullFilter("observationId", false),
    nullFilter("traceId", false),
  ];
  if (target === "session")
    return filters.concat(nullFilter("sessionId", true));
  return filters.concat(
    nullFilter("sessionId", false),
    nullFilter("datasetRunId", true),
  );
}

/** Uses the production query contract at origin/main a6f9a82068; no prototype metric parameters. */
export function createCurrentStudioPlan(
  config: StudioWidgetConfig,
  context: Context,
): CurrentStudioPlan {
  if (!config.queries.length)
    throw new Error("Choose at least one source query.");
  if (config.queries.length > 5)
    throw new Error(
      "Current mode supports at most five independent source queries.",
    );
  if (config.display.histogramEdges)
    throw new Error(
      "Custom histogram boundaries require the prototype query backend.",
    );
  const timeSeries =
    config.display.timeSeries ??
    config.display.chartType.endsWith("TIME_SERIES");
  if (timeSeries && config.display.chartType === "HISTOGRAM")
    throw new Error(
      "Histogram distributions over time need separate bucket domains. Use a single-period histogram in current mode.",
    );
  const plan: CurrentStudioPlan = {
    config,
    version: context.version,
    requests: [],
    warnings: [],
    units: new Map(),
    dimensions: new Map(),
  };
  const sourceViews = new Map<string, string>();
  const aggregations = new Map<string, string>();
  for (const source of config.queries) {
    if (!source.metrics.length)
      throw new Error("Choose at least one metric for each source query.");
    const declaration = getViewDeclaration(source.view, context.version);
    const dimensions = [
      ...new Set(
        source.dimensions
          .map((dimension) => dimension.field)
          .concat(
            source.metrics.flatMap(
              (metric) =>
                declaration.measures[metric.measure]?.requiresDimension ?? [],
            ),
          ),
      ),
    ];
    for (const field of dimensions) {
      if (field === "scoreTarget" || !declaration.dimensions[field])
        throw new Error(`Dimension ${field} is not available in current mode.`);
    }
    const validateMetric = (metric: Metric) => {
      if (metric.percentile !== undefined)
        throw new Error(
          "Custom percentile parameters require the prototype. Current queries support p50, p75, p90, p95 and p99.",
        );
      if (
        metric.measure === "activeDays" ||
        !declaration.measures[metric.measure]
      )
        throw new Error(
          `Measure ${metric.measure} is not available in current mode.`,
        );
      if (
        !getValidAggregationsForMeasureType(
          declaration.measures[metric.measure]!.type,
        ).includes(metric.aggregation)
      )
        throw new Error(
          `Aggregation ${metric.aggregation} is not supported for ${metric.measure}.`,
        );
    };
    for (const metric of source.metrics) {
      validateMetric(metric);
      if (metric.summary) validateMetric({ id: metric.id, ...metric.summary });
      if (
        (metric.aggregation === "histogram") !==
        (config.display.chartType === "HISTOGRAM")
      )
        throw new Error(
          "Histogram measures require a histogram chart; histogram charts require histogram measures.",
        );
      const ref = `${source.id}.${metric.id}`;
      plan.units.set(ref, metricUnit(source.view, metric, context.version));
      plan.dimensions.set(ref, dimensions);
      sourceViews.set(ref, source.view);
      aggregations.set(ref, metric.aggregation);
    }
    const global = mapLegacyUiTableFilterToView(source.view, context.filters);
    if (global.length !== context.filters.length)
      plan.warnings.push(
        `${source.id}: some dashboard filters do not apply to this source.`,
      );
    const localEnvironment = source.filters.some(
      (filter) => filter.column === "environment",
    );
    if (
      localEnvironment &&
      global.some((filter) => filter.column === "environment")
    )
      plan.warnings.push(
        `${source.id}: the query environment overrides the dashboard environment.`,
      );
    const filters = source.filters
      .concat(
        targetFilters(source),
        global.filter(
          (filter) => !localEnvironment || filter.column !== "environment",
        ),
      )
      .map((filter) =>
        filter.column === "metadata" &&
        filter.type === "stringObject" &&
        ["contains", "starts with", "ends with"].includes(filter.operator) &&
        filter.value === ""
          ? { ...filter, operator: "is set" as const }
          : filter,
      );
    for (const filter of filters) {
      if (filter.column === "scoreTarget")
        throw new Error(
          "The scoreTarget query field requires the prototype; use supported attachment ID predicates.",
        );
      if (filter.column === "metadata") {
        if (
          source.view !== "observations" ||
          filter.type !== "stringObject" ||
          !filter.key
        )
          throw new Error(
            "Current metadata filters require an observation source and an explicit metadata key.",
          );
      } else if (!declaration.dimensions[filter.column])
        throw new Error(
          `Filter ${filter.column} is not available on ${source.view}.`,
        );
    }
    const metrics = source.metrics.map(({ measure, aggregation }) => ({
      measure,
      aggregation,
    }));
    // WITH FILL emits aggregate defaults. Counts distinguish a measured zero from an empty mean bucket.
    if (
      !metrics.some(
        (metric) =>
          metric.measure === "count" && metric.aggregation === "count",
      )
    )
      metrics.push({ measure: "count", aggregation: "count" });
    const query: QueryType = {
      view: source.view,
      dimensions: dimensions.map((field) => ({ field })),
      metrics,
      filters,
      fromTimestamp: context.fromTimestamp,
      toTimestamp: context.toTimestamp,
      timeDimension: timeSeries ? { granularity: "auto" } : null,
      orderBy:
        source.orderBy ??
        (timeSeries || config.display.chartType === "HISTOGRAM"
          ? null
          : [
              {
                field: metricField(
                  source.view,
                  source.metrics[0]!,
                  context.version,
                ),
                direction: "desc",
              },
            ]),
      chartConfig: {
        type: config.display.chartType,
        bins: config.display.bins,
        row_limit: config.display.rowLimit ?? 100,
      },
    };
    const validation = validateQuery(query, context.version);
    if (!validation.valid) throw new Error(validation.reason);
    plan.requests.push({
      sourceId: source.id,
      summary: false,
      query,
      metrics: source.metrics,
    });
    if (
      (config.display.showHeadline || config.display.chartType === "NUMBER") &&
      (timeSeries || dimensions.length) &&
      config.display.chartType !== "HISTOGRAM"
    ) {
      const summaryMetrics = source.metrics.filter((metric) => {
        if (
          !metric.summary &&
          declaration.measures[metric.measure]?.requiresDimension
        ) {
          plan.warnings.push(
            `${source.id}.${metric.id}: a period total needs an explicit scalar summary measure.`,
          );
          return false;
        }
        if (
          metric.summary &&
          declaration.measures[metric.summary.measure]?.requiresDimension
        )
          throw new Error("A period summary must reduce to a scalar measure.");
        if (
          metric.summary &&
          metricUnit(
            source.view,
            { id: metric.id, ...metric.summary },
            context.version,
          ) !== metricUnit(source.view, metric, context.version)
        )
          throw new Error("Summary measures must use compatible units.");
        return true;
      });
      if (summaryMetrics.length) {
        const summaryQuery: QueryType = {
          ...query,
          dimensions: [],
          timeDimension: null,
          orderBy: null,
          metrics: summaryMetrics.map((metric) => ({
            measure: metric.summary?.measure ?? metric.measure,
            aggregation: metric.summary?.aggregation ?? metric.aggregation,
          })),
        };
        if (
          !summaryQuery.metrics.some(
            (metric) =>
              metric.measure === "count" && metric.aggregation === "count",
          )
        )
          summaryQuery.metrics.push({ measure: "count", aggregation: "count" });
        plan.requests.push({
          sourceId: source.id,
          summary: true,
          query: summaryQuery,
          metrics: summaryMetrics,
        });
      }
    }
  }
  const required = new Set(
    config.display.activeQueryIds?.length
      ? config.display.activeQueryIds
      : config.queries.map((source) => source.id),
  );
  for (const expression of config.expressions) {
    const refs = studioFormulaReferences(expression.formula);
    if (!refs.length || refs.some((ref) => !plan.units.has(ref)))
      throw new Error(
        "Expressions must reference a query metric or an earlier expression.",
      );
    const shapes = new Set(
      refs.map((ref) =>
        JSON.stringify([...(plan.dimensions.get(ref) ?? [])].sort()),
      ),
    );
    if (shapes.size > 1)
      throw new Error(
        "Formula inputs must have matching breakdown dimensions.",
      );
    const dimensions = plan.dimensions.get(refs[0]!)!;
    if (dimensions.length && !timeSeries)
      throw new Error(
        "Grouped formulas need a shared domain before top-N truncation. Use a time series or ungrouped inputs.",
      );
    const views = new Set(refs.map((ref) => sourceViews.get(ref)));
    if (dimensions.length && views.size > 1)
      throw new Error(
        "Grouped formula inputs must use the same entity source.",
      );
    if (refs.some((ref) => aggregations.get(ref) === "histogram"))
      throw new Error("Histogram bins cannot be scalar formula inputs.");
    const value = evaluateStudioFormula(
      expression.formula,
      new Map(
        refs.map((ref) => [ref, { value: 1, unit: plan.units.get(ref) }]),
      ),
    );
    plan.units.set(expression.id, value.unit);
    plan.dimensions.set(expression.id, dimensions);
    sourceViews.set(expression.id, [...views][0]!);
    aggregations.set(expression.id, "expression");
    for (const ref of refs)
      if (ref.includes(".")) required.add(ref.split(".")[0]!);
  }
  plan.requests = plan.requests.filter((request) =>
    required.has(request.sourceId),
  );
  return plan;
}

export function validateCurrentStudioConfig(
  config: StudioWidgetConfig,
  version: ViewVersion = "v2",
): { valid: true } | { valid: false; reason: string } {
  try {
    createCurrentStudioPlan(config, {
      version,
      fromTimestamp: "2026-01-01T00:00:00Z",
      toTimestamp: "2026-01-02T00:00:00Z",
      filters: [],
    });
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      reason:
        error instanceof Error
          ? error.message
          : "This query is not available in current mode.",
    };
  }
}

export function normalizeCurrentStudioResults(
  plan: CurrentStudioPlan,
  responses: CurrentStudioResponse[],
): StudioResult {
  const result: StudioResult = {
    status: "complete",
    rows: [],
    summaries: [],
    series: [],
    diagnostics: [],
    warnings: [...plan.warnings],
  };
  const series = new Map<string, StudioSeries>();
  const successful = new Set<string>();
  const failed = new Set<string>();
  const append = (destination: StudioRow[], row: StudioRow) => {
    if (result.rows.length + result.summaries.length >= 100_000)
      throw new Error(
        "This widget exceeds the 100,000 result-cell limit. Narrow its range or breakdown.",
      );
    destination.push(row);
  };
  for (const source of plan.config.queries) {
    const indexes = plan.requests.flatMap((request, index) =>
      request.sourceId === source.id ? [index] : [],
    );
    if (!indexes.length) continue;
    let resultRows = 0;
    for (const index of indexes) {
      const request = plan.requests[index]!;
      const response = responses[index];
      if (response?.error || !response?.rows) {
        failed.add(source.id);
        continue;
      }
      successful.add(source.id);
      const declaration = getViewDeclaration(source.view, plan.version);
      const fields = request.query.dimensions.map(
        (dimension) => dimension.field,
      );
      for (const raw of response.rows) {
        const dimensions = Object.fromEntries(
          fields.map((field) => [
            field,
            text(raw[declaration.dimensions[field]?.alias ?? field]),
          ]),
        );
        const dimension = fields.length
          ? Object.values(dimensions)
              .map((value) => value ?? "Unknown")
              .join(" · ")
          : null;
        const time = request.query.timeDimension
          ? text(raw.time_dimension)
          : null;
        for (const metric of request.metrics) {
          const effectiveMetric =
            request.summary && metric.summary
              ? { id: metric.id, ...metric.summary }
              : metric;
          const value =
            raw[metricField(source.view, effectiveMetric, plan.version)];
          const ref = `${source.id}.${metric.id}`;
          const id =
            dimension === null ? ref : `${ref}:${JSON.stringify(dimensions)}`;
          const label = dimension
            ? `${source.label} · ${dimension}`
            : source.label;
          const unit = plan.units.get(ref);
          if (!request.summary)
            series.set(id, {
              id,
              queryId: source.id,
              metricId: metric.id,
              label,
              dimensions,
              aggregation: metric.aggregation,
              unit,
              rawUnit: unit,
              ...(metric.aggregation === "histogram"
                ? {
                    bucketUnit: getResultUnit(
                      source.view,
                      metric.measure,
                      "avg",
                      plan.version,
                    ),
                  }
                : {}),
              ...(source.view.startsWith("scores-")
                ? { scoreTarget: source.scoreTarget ?? "all" }
                : {}),
            });
          if (metric.aggregation === "histogram") {
            for (const bin of Array.isArray(value) ? value : []) {
              if (!Array.isArray(bin) || bin.length < 3) continue;
              const binLabel = `${bin[0]} – ${bin[1]}`;
              append(result.rows, {
                seriesId: id,
                queryId: source.id,
                metricId: metric.id,
                label,
                dimensions: { ...dimensions, bin: binLabel },
                dimension: binLabel,
                time,
                value: scalar(bin[2]),
              });
              resultRows++;
            }
            continue;
          }
          const emptyMean =
            scalar(raw.count_count) === 0 &&
            !["count", "sum", "uniq"].includes(effectiveMetric.aggregation);
          const evaluationCount =
            (source.view === "scores-numeric" ||
              source.view === "scores-boolean") &&
            effectiveMetric.measure === "value" &&
            effectiveMetric.aggregation === "avg"
              ? scalar(raw.count_count)
              : null;
          const row: StudioRow = {
            seriesId: id,
            queryId: source.id,
            metricId: metric.id,
            label,
            dimensions,
            dimension,
            time,
            value: emptyMean ? null : scalar(value),
            ...(evaluationCount !== null ? { evaluationCount } : {}),
          };
          append(request.summary ? result.summaries : result.rows, row);
          if (!request.summary) {
            resultRows++;
            if (
              !request.query.timeDimension &&
              !fields.length &&
              (plan.config.display.showHeadline ||
                plan.config.display.chartType === "NUMBER")
            )
              append(result.summaries, { ...row });
          }
        }
      }
    }
    result.diagnostics.push({
      queryId: source.id,
      status: failed.has(source.id) ? "error" : "complete",
      durationMs: 0,
      queryCount: indexes.length,
      resultRows,
      ...(failed.has(source.id)
        ? { error: "Production query failed. Run preview to retry." }
        : {}),
    });
  }
  const compute = (destination: StudioRow[], summary: boolean) => {
    const byRef = new Map<string, StudioRow[]>();
    for (const row of destination) {
      const ref = `${row.queryId}.${row.metricId}`;
      const rows = byRef.get(ref) ?? [];
      rows.push(row);
      byRef.set(ref, rows);
    }
    for (const expression of plan.config.expressions) {
      const refs = studioFormulaReferences(expression.formula);
      const contexts = new Map<
        string,
        { row: StudioRow; values: Map<string, StudioExpressionValue> }
      >();
      for (const ref of refs)
        for (const row of byRef.get(ref) ?? []) {
          const key = JSON.stringify([
            row.time,
            Object.entries(row.dimensions).sort(([a], [b]) =>
              a.localeCompare(b),
            ),
          ]);
          const context = contexts.get(key) ?? { row, values: new Map() };
          context.values.set(ref, {
            value: row.value,
            unit: plan.units.get(ref),
          });
          contexts.set(key, context);
        }
      const output: StudioRow[] = [];
      for (const context of contexts.values()) {
        for (const ref of refs)
          if (!context.values.has(ref)) {
            const source = plan.config.queries.find((source) =>
              source.metrics.some(
                (metric) => `${source.id}.${metric.id}` === ref,
              ),
            );
            const count =
              source?.metrics.find(
                (metric) => `${source.id}.${metric.id}` === ref,
              )?.aggregation === "count";
            context.values.set(ref, {
              value:
                count && successful.has(source!.id) && !failed.has(source!.id)
                  ? 0
                  : null,
              unit: plan.units.get(ref),
            });
          }
        const value = evaluateStudioFormula(expression.formula, context.values);
        const id =
          context.row.dimension === null
            ? expression.id
            : `${expression.id}:${JSON.stringify(context.row.dimensions)}`;
        const row = {
          seriesId: id,
          queryId: expression.id,
          metricId: expression.id,
          label: expression.label,
          dimensions: context.row.dimensions,
          dimension: context.row.dimension,
          time: context.row.time,
          value: value.value,
        };
        append(destination, row);
        output.push(row);
        if (!summary)
          series.set(id, {
            id,
            queryId: expression.id,
            metricId: expression.id,
            label: expression.label,
            dimensions: row.dimensions,
            aggregation: "expression",
            unit: expression.unit ?? value.unit,
            rawUnit: value.unit,
          });
      }
      byRef.set(expression.id, output);
    }
  };
  compute(result.rows, false);
  compute(result.summaries, true);
  result.series = [...series.values()];
  if (failed.size) result.status = successful.size ? "partial" : "error";
  return result;
}
