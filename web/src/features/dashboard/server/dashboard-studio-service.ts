import {
  InvalidRequestError,
  type FilterState,
  type StudioDiagnostic,
  type StudioResult,
  type StudioRow,
  type StudioSeries,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import {
  getResultUnit,
  getViewDeclaration,
  validateQuery,
  type QueryType,
  type ViewVersion,
} from "@langfuse/shared/query";
import {
  prepareExecuteQuery,
  toClickhouseQueryOpts,
} from "@langfuse/shared/query/server";
import {
  queryClickhouseWithProgress,
  isRow,
  isProgressRow,
  isException,
  logger,
} from "@langfuse/shared/src/server";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import {
  evaluateStudioFormula,
  studioFormulaReferences,
  type StudioExpressionValue,
} from "../lib/studioExpressions";

type StudioExecuteInput = {
  projectId: string;
  config: StudioWidgetConfig;
  fromTimestamp: string;
  toTimestamp: string;
  version: ViewVersion;
  granularity: NonNullable<QueryType["timeDimension"]>["granularity"];
  filters: FilterState;
};

function sourceDimensions(
  source: StudioWidgetConfig["queries"][number],
  version: ViewVersion,
) {
  const declaration = getViewDeclaration(source.view, version);
  const fields = new Set(source.dimensions.map((dimension) => dimension.field));
  for (const metric of source.metrics) {
    const required = declaration.measures[metric.measure]?.requiresDimension;
    if (required) fields.add(required);
  }
  return [...fields].map((field) => ({ field }));
}

function rawMetricUnit(
  view: StudioWidgetConfig["queries"][number]["view"],
  metric: { measure: string; aggregation: string },
  version: ViewVersion,
) {
  const declaration = getViewDeclaration(view, version);
  if (
    metric.aggregation === "histogram" ||
    (metric.aggregation === "count" && metric.measure === "count")
  )
    return declaration.measures.count?.unit ?? "count";
  if (metric.aggregation === "uniq")
    return declaration.measures[metric.measure]?.unit ?? "count";
  return getResultUnit(view, metric.measure, metric.aggregation, version);
}

const finiteValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const dimensionValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
};

/** Independent requests preserve each query's own row population and aggregation grain. */
export async function executeStudioWidget(
  input: StudioExecuteInput,
  signal?: AbortSignal,
): Promise<StudioResult> {
  const deadline = AbortSignal.timeout(60_000);
  const executionSignal = signal
    ? AbortSignal.any([signal, deadline])
    : deadline;
  const result: StudioResult = {
    status: "complete",
    series: [],
    rows: [],
    summaries: [],
    diagnostics: [],
    warnings: [],
  };
  const complete = new Set<string>();
  const units = new Map<string, string | undefined>();
  const shapes = new Map<string, string>();
  const sourceViewsByRef = new Map<string, Set<string>>();
  const aggregations = new Map<string, string>();
  let resultCellCount = 0;
  const allSeries = new Map<string, StudioSeries>();
  const queryErrors = new Map<string, string>();
  const timeSeries =
    input.config.display.timeSeries ??
    input.config.display.chartType.endsWith("TIME_SERIES");
  const queryResults = new Map<
    string,
    { rows: StudioRow[]; summaries: StudioRow[]; diagnostics: StudioDiagnostic }
  >();

  const preparedSources = new Map<
    string,
    {
      query: QueryType;
      summaryQuery: QueryType | undefined;
      requiresExplicitSummary: boolean;
    }
  >();
  const compiledQueries = new Map<
    QueryType,
    Awaited<ReturnType<typeof prepareExecuteQuery>>
  >();
  for (const source of input.config.queries) {
    for (const metric of source.metrics) {
      const ref = `${source.id}.${metric.id}`;
      const unit = rawMetricUnit(source.view, metric, input.version);
      units.set(ref, unit);
      sourceViewsByRef.set(ref, new Set([source.view]));
      aggregations.set(ref, metric.aggregation);
      shapes.set(
        ref,
        JSON.stringify(
          sourceDimensions(source, input.version)
            .map((dimension) => dimension.field)
            .sort(),
        ),
      );
    }
    const declaration = getViewDeclaration(source.view, input.version);
    const queryDimensions = sourceDimensions(source, input.version);
    for (const metric of source.metrics) {
      if (!metric.summary) continue;
      if (declaration.measures[metric.summary.measure]?.requiresDimension)
        throw new InvalidRequestError(
          "A summary metric must reduce to a scalar without expanded dimensions",
        );
      if (
        rawMetricUnit(source.view, metric.summary, input.version) !==
        units.get(`${source.id}.${metric.id}`)
      )
        throw new InvalidRequestError(
          "Summary metrics must have compatible raw units",
        );
    }
    const mappedGlobal = mapLegacyUiTableFilterToView(
      source.view,
      input.filters,
    );
    if (mappedGlobal.length !== input.filters.length)
      result.warnings.push(
        `${source.id}: some dashboard filters are not applicable to this source`,
      );
    // Studio query filters are already canonical, unlike the dashboard's
    // legacy UI filter names. Never discard a local predicate during mapping.
    const hasLocalEnvironment = source.filters.some(
      (filter) => filter.column === "environment",
    );
    if (
      hasLocalEnvironment &&
      mappedGlobal.some((filter) => filter.column === "environment")
    )
      result.warnings.push(
        `${source.id}: the widget environment filter overrides the dashboard environment filter for this query`,
      );
    const targetFilters: FilterState =
      source.scoreTarget && source.scoreTarget !== "all"
        ? [
            {
              column: "scoreTarget",
              type: "string",
              operator: "=",
              value: source.scoreTarget,
            },
          ]
        : [];
    const filters = [
      ...source.filters,
      ...targetFilters,
      ...mappedGlobal.filter(
        (filter) => !hasLocalEnvironment || filter.column !== "environment",
      ),
    ];
    const metrics = source.metrics.map((metric) => ({
      measure: metric.measure,
      aggregation: metric.aggregation,
      ...(metric.percentile !== undefined
        ? { percentile: metric.percentile }
        : {}),
    }));
    const query: QueryType = {
      view: source.view,
      dimensions: queryDimensions,
      metrics,
      filters,
      timeDimension: timeSeries ? { granularity: input.granularity } : null,
      fromTimestamp: input.fromTimestamp,
      toTimestamp: input.toTimestamp,
      orderBy:
        source.orderBy ??
        (timeSeries ||
        metrics.some((metric) => metric.aggregation === "histogram")
          ? null
          : [
              {
                field: `${metrics[0].aggregation}_${metrics[0].measure}`,
                direction: "desc",
              },
            ]),
      chartConfig: {
        type: input.config.display.chartType,
        bins: input.config.display.bins ?? 10,
        histogramEdges: input.config.display.histogramEdges,
        ...(!timeSeries
          ? { row_limit: input.config.display.rowLimit ?? 20 }
          : {}),
      },
    };
    const validation = validateQuery(query, input.version);
    if (!validation.valid) throw new InvalidRequestError(validation.reason);
    const requiresExplicitSummary = source.metrics.some(
      (metric) =>
        declaration.measures[metric.measure]?.requiresDimension &&
        !metric.summary,
    );
    let summaryQuery: QueryType | undefined;
    if (
      input.config.display.showHeadline &&
      !requiresExplicitSummary &&
      !source.metrics.some((metric) => metric.aggregation === "histogram") &&
      (queryDimensions.length > 0 ||
        timeSeries ||
        source.metrics.some((metric) => metric.summary))
    ) {
      summaryQuery = {
        ...query,
        metrics: source.metrics.map(
          (metric, index) => metric.summary ?? metrics[index],
        ),
        dimensions: [],
        timeDimension: null,
        orderBy: null,
        chartConfig: { type: "NUMBER" },
      };
      const validation = validateQuery(summaryQuery, input.version);
      if (!validation.valid) throw new InvalidRequestError(validation.reason);
    }
    preparedSources.set(source.id, {
      query,
      summaryQuery,
      requiresExplicitSummary,
    });
  }

  const runSource = async (source: StudioWidgetConfig["queries"][number]) => {
    const started = performance.now();
    const diagnostic: StudioDiagnostic = {
      queryId: source.id,
      status: "complete",
      durationMs: 0,
      queryCount: 0,
      resultRows: 0,
    };
    const run = async (query: QueryType) => {
      executionSignal.throwIfAborted();
      const prepared = compiledQueries.get(query)!;
      if (!diagnostic.compiledSql)
        diagnostic.compiledSql = prepared.compiledQuery;
      diagnostic.queryCount++;
      const options = toClickhouseQueryOpts(prepared);
      const rows: Record<string, unknown>[] = [];
      let readRows = 0;
      let readBytes = 0;
      let elapsedNs = 0;
      for await (const event of queryClickhouseWithProgress<
        Record<string, unknown>
      >({
        ...options,
        abortSignal: executionSignal,
        clickhouseSettings: {
          ...options.clickhouseSettings,
          max_execution_time: 60,
          cancel_http_readonly_queries_on_client_close: 1,
        },
      })) {
        if (isRow<Record<string, unknown>>(event)) rows.push(event.row);
        else if (isProgressRow(event)) {
          readRows = Number(event.progress.read_rows);
          readBytes = Number(event.progress.read_bytes);
          elapsedNs = Number(event.progress.elapsed_ns);
        } else if (isException(event)) throw new Error(event.exception);
      }
      diagnostic.rowsRead = (diagnostic.rowsRead ?? 0) + readRows;
      diagnostic.bytesRead = (diagnostic.bytesRead ?? 0) + readBytes;
      diagnostic.serverElapsedMs =
        (diagnostic.serverElapsedMs ?? 0) + elapsedNs / 1e6;
      return rows;
    };
    try {
      const { query, summaryQuery, requiresExplicitSummary } =
        preparedSources.get(source.id)!;
      const queryDimensions = query.dimensions;
      const metrics = query.metrics;
      const raw = await run(query);
      const convert = (
        rows: Record<string, unknown>[],
        summary = false,
        outputMetrics: QueryType["metrics"] = metrics,
      ): StudioRow[] =>
        rows.flatMap((row) =>
          source.metrics.flatMap((metric, metricIndex) => {
            const dimensions = summary
              ? {}
              : Object.fromEntries(
                  queryDimensions.map(({ field }) => [
                    field,
                    dimensionValue(row[field]),
                  ]),
                );
            const dimension =
              Object.values(dimensions)
                .map((value) => value ?? "Unknown")
                .join(" · ") || null;
            const ref = `${source.id}.${metric.id}`;
            const id =
              dimension === null ? ref : `${ref}:${JSON.stringify(dimensions)}`;
            const baseLabel =
              source.metrics.length > 1
                ? `${source.label} · ${metric.label ?? `${metric.aggregation} ${metric.measure}`}`
                : source.label;
            let label = baseLabel;
            if (dimension) {
              label = `${baseLabel} · ${dimension}`;
              if (source.metrics.length > 1) {
                let metricLabel = metric.label;
                if (!metricLabel) {
                  if (
                    source.metrics.every(
                      (item) => item.measure === metric.measure,
                    )
                  )
                    metricLabel =
                      metric.percentile === undefined
                        ? metric.aggregation
                        : `p${metric.percentile}`;
                  else metricLabel = `${metric.aggregation} ${metric.measure}`;
                }
                label = `${dimension} · ${metricLabel}${input.config.queries.length > 1 ? ` · ${source.label}` : ""}`;
              }
            }
            if (!summary)
              allSeries.set(id, {
                id,
                label,
                unit: units.get(ref),
                bucketUnit:
                  metric.aggregation === "histogram"
                    ? getResultUnit(
                        source.view,
                        metric.measure,
                        metric.aggregation,
                        input.version,
                      )
                    : undefined,
                queryId: source.id,
                metricId: metric.id,
                dimensions,
                aggregation:
                  metric.percentile === undefined
                    ? metric.aggregation
                    : `p${metric.percentile}`,
                scoreTarget: source.view.startsWith("scores-")
                  ? (source.scoreTarget ?? "all")
                  : undefined,
              });
            const base = {
              seriesId: id,
              label,
              queryId: source.id,
              metricId: metric.id,
              time:
                !summary && typeof row.time_dimension === "string"
                  ? row.time_dimension
                  : null,
              dimensions,
              dimension,
            };
            const output = outputMetrics[metricIndex];
            const value = row[`${output.aggregation}_${output.measure}`];
            if (metric.aggregation === "histogram" && Array.isArray(value)) {
              return value.map((bin: unknown) => {
                const [lower, upper, count] = bin as [
                  number | null,
                  number | null,
                  number,
                ];
                let label = `[${lower}, ${upper})`;
                if (lower === null && upper === null) label = "No value";
                else if (lower === null) label = `< ${upper}`;
                else if (upper === null) label = `≥ ${lower}`;
                return {
                  ...base,
                  dimension: label,
                  dimensions: { bin: JSON.stringify([lower, upper]) },
                  value: finiteValue(count),
                };
              });
            }
            return [{ ...base, value: finiteValue(value) }];
          }),
        );
      const rows = convert(raw);
      if (rows.length + resultCellCount > 100_000)
        throw new InvalidRequestError(
          "This widget exceeds the 100,000 result-cell limit. Narrow its time range or breakdown.",
        );
      resultCellCount += rows.length;
      complete.add(source.id);
      queryResults.set(source.id, {
        rows,
        summaries: [],
        diagnostics: diagnostic,
      });
      let summaries: StudioRow[] = [];
      if (input.config.display.showHeadline && requiresExplicitSummary)
        result.warnings.push(
          `${source.id}: expanded measures need an explicit scalar summary binding; no headline was inferred from map entries`,
        );
      if (
        input.config.display.showHeadline &&
        !requiresExplicitSummary &&
        !source.metrics.some((metric) => metric.aggregation === "histogram")
      ) {
        summaries = summaryQuery
          ? convert(await run(summaryQuery), true, summaryQuery.metrics)
          : convert(raw, true);
      }
      if (summaries.length + resultCellCount > 100_000)
        throw new InvalidRequestError(
          "This widget exceeds the 100,000 result-cell limit. Narrow its time range or breakdown.",
        );
      resultCellCount += summaries.length;
      diagnostic.resultRows = raw.length;
      queryResults.set(source.id, { rows, summaries, diagnostics: diagnostic });
    } catch (error) {
      diagnostic.status = "error";
      diagnostic.error =
        error instanceof InvalidRequestError
          ? error.message
          : "Query failed. Please try again.";
      if (!(error instanceof InvalidRequestError))
        logger.error("Dashboard studio query execution failed", error, {
          projectId: input.projectId,
          queryId: source.id,
        });
      queryErrors.set(source.id, diagnostic.error);
      const previous = queryResults.get(source.id);
      queryResults.set(source.id, {
        rows: previous?.rows ?? [],
        summaries: [],
        diagnostics: diagnostic,
      });
    } finally {
      diagnostic.durationMs = Math.round(performance.now() - started);
    }
  };

  // The endpoint's work is bounded even when many independent sources are configured.
  const expressionQueryIds = input.config.expressions.flatMap((expression) =>
    studioFormulaReferences(expression.formula).map((ref) => ref.split(".")[0]),
  );
  const neededIds = input.config.display.activeQueryIds
    ? new Set([...input.config.display.activeQueryIds, ...expressionQueryIds])
    : null;
  const pending = input.config.queries.filter(
    (source) => !neededIds || neededIds.has(source.id),
  );
  const expressionRows = (summary: boolean) => {
    const rows = [...queryResults.values()].flatMap((value) =>
      summary ? value.summaries : value.rows,
    );
    const rowsByRef = new Map<string, StudioRow[]>();
    for (const row of rows) {
      const ref = `${row.queryId}.${row.metricId}`;
      const group = rowsByRef.get(ref) ?? [];
      group.push(row);
      rowsByRef.set(ref, group);
    }
    const computed: StudioRow[] = [];
    for (const expression of input.config.expressions) {
      const refs = studioFormulaReferences(expression.formula);
      if (refs.length === 0)
        throw new InvalidRequestError(
          "Expressions must reference a query measure or an earlier expression",
        );
      const shapeSet = new Set(refs.map((ref) => shapes.get(ref)));
      if (refs.some((ref) => !units.has(ref)))
        throw new InvalidRequestError(
          `Unknown reference in expression ${expression.id}`,
        );
      if (shapeSet.size > 1)
        throw new InvalidRequestError(
          `Expression ${expression.id} requires matching breakdown dimensions`,
        );
      if (refs.some((ref) => aggregations.get(ref) === "histogram"))
        throw new InvalidRequestError(
          `Expression ${expression.id} cannot use histogram bins as scalar inputs`,
        );
      const hasBreakdown = [...shapeSet].some((shape) => shape !== "[]");
      if (hasBreakdown && !timeSeries)
        throw new InvalidRequestError(
          `Expression ${expression.id} needs a shared breakdown domain before top-N truncation. Use a time series or ungrouped inputs.`,
        );
      const sourceViews = new Set(
        refs.flatMap((ref) => [...(sourceViewsByRef.get(ref) ?? [])]),
      );
      if (hasBreakdown && sourceViews.size > 1)
        throw new InvalidRequestError(
          `Expression ${expression.id} cannot align breakdowns across different entity sources`,
        );
      const validationCells = new Map(
        refs.map((ref) => [ref, { value: 1, unit: units.get(ref) }]),
      );
      const validation = evaluateStudioFormula(
        expression.formula,
        validationCells,
      );
      units.set(expression.id, validation.unit);
      shapes.set(expression.id, [...shapeSet][0] ?? "[]");
      sourceViewsByRef.set(expression.id, sourceViews);
      const contexts = new Map<
        string,
        { row: StudioRow; values: Map<string, StudioExpressionValue> }
      >();
      for (const ref of refs) {
        for (const row of rowsByRef.get(ref) ?? []) {
          const key = JSON.stringify([
            row.time,
            Object.entries(row.dimensions).sort(([a], [b]) =>
              a.localeCompare(b),
            ),
          ]);
          const context = contexts.get(key) ?? { row, values: new Map() };
          context.values.set(ref, { value: row.value, unit: units.get(ref) });
          contexts.set(key, context);
        }
      }
      const expressionOutput: StudioRow[] = [];
      for (const context of contexts.values()) {
        for (const ref of refs) {
          if (context.values.has(ref)) continue;
          const sourceId = ref.split(".")[0];
          const zero =
            complete.has(sourceId) && aggregations.get(ref) === "count";
          context.values.set(ref, {
            value: zero ? 0 : null,
            unit: units.get(ref),
          });
        }
        const value = evaluateStudioFormula(expression.formula, context.values);
        context.values.set(expression.id, value);
        const dimensions = context.row.dimensions;
        const dimension = context.row.dimension;
        const id =
          dimension === null
            ? expression.id
            : `${expression.id}:${JSON.stringify(dimensions)}`;
        const label = dimension
          ? `${expression.label} · ${dimension}`
          : expression.label;
        if (!summary)
          allSeries.set(id, {
            id,
            label,
            unit: expression.unit ?? value.unit,
            rawUnit: value.unit,
            queryId: expression.id,
            metricId: expression.id,
            dimensions,
            aggregation: "expression",
          });
        if (computed.length + resultCellCount >= 100_000)
          throw new InvalidRequestError(
            "This widget exceeds the 100,000 result-cell limit. Narrow its time range or breakdown.",
          );
        const output = {
          ...context.row,
          seriesId: id,
          label,
          queryId: expression.id,
          metricId: expression.id,
          value: value.value,
        };
        expressionOutput.push(output);
        computed.push(output);
      }
      rowsByRef.set(expression.id, expressionOutput);
    }
    return computed;
  };
  // Validate formulas and compile every configured query before issuing any scans.
  expressionRows(false);
  for (const { query, summaryQuery } of preparedSources.values()) {
    for (const candidate of [query, summaryQuery]) {
      if (!candidate) continue;
      compiledQueries.set(
        candidate,
        await prepareExecuteQuery({
          projectId: input.projectId,
          query: candidate,
          version: input.version,
          enableSingleLevelOptimization: input.version === "v2",
        }),
      );
    }
  }
  for (const source of pending) await runSource(source);

  try {
    const computedRows = expressionRows(false);
    result.rows = result.rows.concat(computedRows);
    resultCellCount += computedRows.length;
    const computedSummaries = expressionRows(true);
    result.summaries = result.summaries.concat(computedSummaries);
    resultCellCount += computedSummaries.length;
  } catch (error) {
    const message =
      error instanceof InvalidRequestError
        ? error.message
        : "Expression evaluation failed. Please try again.";
    if (!(error instanceof InvalidRequestError))
      logger.error("Dashboard studio expression evaluation failed", error, {
        projectId: input.projectId,
      });
    result.warnings.push(message);
    result.diagnostics.push({
      queryId: "expressions",
      status: "error",
      durationMs: 0,
      queryCount: 0,
      resultRows: 0,
      error: message,
    });
    queryErrors.set("expressions", "Invalid expression");
  }
  for (const source of input.config.queries) {
    const data = queryResults.get(source.id);
    if (!data) continue;
    result.diagnostics.push(data.diagnostics);
    // Hidden series remain available for auditing; visibility is a client presentation choice.
    result.rows = result.rows.concat(data.rows);
    result.summaries = result.summaries.concat(data.summaries);
  }
  const visible = new Set(result.rows.map((row) => row.seriesId));
  result.series = [...allSeries.values()].filter((series) =>
    visible.has(series.id),
  );
  if (queryErrors.size === 0) result.status = "complete";
  else result.status = complete.size > 0 ? "partial" : "error";
  return result;
}
