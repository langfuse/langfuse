import {
  type StudioResult,
  type StudioRow,
  type StudioSeries,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import { type Visualization } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import {
  type ChartProps,
  type MetricFormatterFunction,
} from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  toFullMetricString,
  parseMetricUnit,
} from "@/src/features/widgets/chart-library/utils";
import {
  seriesColor,
  seriesFillColor,
} from "@/src/features/widgets/chart-library/seriesColors";
import { readableField } from "./catalog";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { prepareStudioUnitPanels, studioUnitKey } from "./studioUnitPanels";

function histogramBinDescription(
  row: StudioRow,
  bucketUnit: string | undefined,
) {
  const label = row.dimension ?? row.label;
  const unit = bucketUnit === "milliseconds" ? "ms" : bucketUnit;
  return unit && label !== "No value" ? `${label} ${unit}` : label;
}

function histogramBinLabel(row: StudioRow, bucketUnit: string | undefined) {
  const label = row.dimension ?? row.label;
  if (label === "No value") return label;
  const unit = bucketUnit === "milliseconds" ? "ms" : bucketUnit;
  if (bucketUnit === "milliseconds" && row.dimensions.bin?.startsWith("[")) {
    try {
      const edges: unknown = JSON.parse(row.dimensions.bin);
      if (
        Array.isArray(edges) &&
        edges.length === 2 &&
        edges.every(
          (edge) =>
            edge === null ||
            (typeof edge === "number" && Number.isFinite(edge)),
        )
      ) {
        const finiteEdges = edges.filter(
          (edge): edge is number => typeof edge === "number",
        );
        if (
          finiteEdges.some((edge) => Math.abs(edge) >= 1000) &&
          finiteEdges.every((edge) => edge % 1000 === 0)
        ) {
          const [lower, upper] = edges.map((edge) =>
            edge === null ? null : edge / 1000,
          );
          if (lower === null) return `< ${upper} s`;
          if (upper === null) return `≥ ${lower} s`;
          return `[${lower}, ${upper}${label.endsWith("]") ? "]" : ")"} s`;
        }
      }
    } catch {
      // Adaptive histogram responses can carry a formatted interval instead of a tuple.
    }
  }
  return unit ? `${unit} ${label}` : label;
}

function chartDimension(
  row: StudioRow,
  config: StudioWidgetConfig,
  bucketUnit: string | undefined,
  seriesLabel: string,
) {
  if (config.display.chartType === "HISTOGRAM")
    return histogramBinLabel(row, bucketUnit);
  if (
    config.display.timeSeries ||
    config.display.chartType.endsWith("TIME_SERIES")
  )
    return row.seriesId;
  return seriesLabel;
}

export function studioMetricFormatter(
  unit: string | undefined,
  percentFractionDigits = 2,
): MetricFormatterFunction {
  if (unit === "percent" || unit === "%") {
    const percent = new Intl.NumberFormat("en", {
      maximumFractionDigits: percentFractionDigits,
    });
    return (value) => ({ main: percent.format(value * 100), suffix: "%" });
  }
  return (value, options) => {
    if (unit === "milliseconds" && Math.abs(value) >= 1000)
      return {
        main: `${value < 0 ? "-" : ""}${formatIntervalSeconds(Math.abs(value) / 1000)}`,
      };
    return formatMetric(value, { ...options, unit: parseMetricUnit(unit) });
  };
}

export function formatStudioValue(
  value: number | null,
  unit: string | undefined,
) {
  return value === null
    ? "—"
    : toFullMetricString(
        studioMetricFormatter(unit)(value, { style: "compact" }),
      );
}

type Metric = StudioWidgetConfig["queries"][number]["metrics"][number];
const metricAggregation = (metric: Metric) =>
  metric.percentile === undefined
    ? metric.aggregation
    : `p${metric.percentile}`;
function metricLabel(metric: Metric) {
  return (
    metric.label ??
    `${metricAggregation(metric)} ${readableField(metric.measure)}`
  );
}

function studioSeriesPresentation(config: StudioWidgetConfig) {
  const queries = new Map(config.queries.map((query) => [query.id, query]));
  const expressions = new Map(
    config.expressions.map((expression) => [expression.id, expression]),
  );
  const labelFor = (
    item: Pick<StudioRow, "queryId" | "metricId" | "dimensions" | "label">,
  ) => {
    const dimension = Object.values(item.dimensions)
      .map((value) => value ?? "Unknown")
      .join(" · ");
    const expression = expressions.get(item.queryId);
    if (expression)
      return dimension
        ? `${expression.label} · ${dimension}`
        : expression.label;
    const query = queries.get(item.queryId);
    const metric = query?.metrics.find((metric) => metric.id === item.metricId);
    if (!query || !metric) return item.label;
    let base = query.label;
    if (query.metrics.length > 1)
      base = `${query.label} · ${metricLabel(metric)}`;
    else if (metric.label)
      base =
        config.queries.length > 1
          ? `${query.label} · ${metric.label}`
          : metric.label;
    if (!dimension) return base;
    if (query.metrics.length === 1) return `${base} · ${dimension}`;
    const label =
      !metric.label &&
      query.metrics.every((item) => item.measure === metric.measure)
        ? metricAggregation(metric)
        : metricLabel(metric);
    return `${dimension} · ${label}${config.queries.length > 1 ? ` · ${query.label}` : ""}`;
  };
  const presentSeries = (series: StudioSeries) => ({
    ...series,
    label: labelFor(series),
    unit:
      expressions.get(series.queryId)?.unit || series.rawUnit || series.unit,
  });
  return { labelFor, presentSeries };
}

export function prepareStudioChart(
  result: StudioResult | undefined,
  config: StudioWidgetConfig,
) {
  const presentation = studioSeriesPresentation(config);
  const metricOrder = new Map(
    [
      ...config.queries.flatMap((query) =>
        query.metrics.map((metric) => `${query.id}.${metric.id}`),
      ),
      ...config.expressions.map((expression) => expression.id),
    ].map((reference, index) => [reference, index]),
  );
  const orderOf = (series: StudioSeries) =>
    metricOrder.get(`${series.queryId}.${series.metricId}`) ??
    metricOrder.get(series.queryId) ??
    metricOrder.size;
  const allSeries = (result?.series ?? [])
    .map(presentation.presentSeries)
    .sort((a, b) => {
      const byMetric = orderOf(a) - orderOf(b);
      if (byMetric) return byMetric;
      return a.id < b.id ? -1 : Number(a.id > b.id);
    });
  const palette = new Map(
    allSeries.map((series, index) => [
      series.id,
      { color: seriesColor(index), fillColor: seriesFillColor(index) },
    ]),
  );
  const availableSeries = allSeries.filter((series) => {
    const query = config.queries.find((query) => query.id === series.queryId);
    const expression = config.expressions.find(
      (expression) =>
        expression.id === series.id || expression.id === series.queryId,
    );
    return (
      !query?.hidden &&
      !expression?.hidden &&
      (Boolean(expression) ||
        !config.display.activeQueryIds?.length ||
        config.display.activeQueryIds.includes(series.queryId))
    );
  });
  const hiddenIds = new Set(config.display.hiddenSeriesIds ?? []);
  const visibleSeries = availableSeries.filter(
    (series) => !hiddenIds.has(series.id),
  );
  const visibleIds = new Set(visibleSeries.map((series) => series.id));
  const seriesById = new Map(
    visibleSeries.map((series) => [series.id, series]),
  );
  const unitsByMetric = new Map(
    visibleSeries.map((series) => [
      `${series.queryId}.${series.metricId}`,
      series.unit,
    ]),
  );
  const selectedRows = (result?.rows ?? []).filter((row) =>
    visibleIds.has(row.seriesId),
  );
  const visibleMetricRefs = new Set(
    visibleSeries.map((series) => `${series.queryId}.${series.metricId}`),
  );
  const partiallyHiddenMetricRefs = new Set(
    availableSeries
      .filter(
        (series) =>
          hiddenIds.has(series.id) &&
          visibleMetricRefs.has(`${series.queryId}.${series.metricId}`),
      )
      .map((series) => `${series.queryId}.${series.metricId}`),
  );
  const visibilitySummaries = (result?.summaries ?? [])
    .filter((row) => visibleMetricRefs.has(`${row.queryId}.${row.metricId}`))
    .map((row) => ({ ...row, label: presentation.labelFor(row) }));
  const summaries = visibilitySummaries.filter(
    (row) => !partiallyHiddenMetricRefs.has(`${row.queryId}.${row.metricId}`),
  );
  const data: ChartProps["data"] = selectedRows.map((row) => ({
    dimension: chartDimension(
      row,
      config,
      seriesById.get(row.seriesId)?.bucketUnit,
      seriesById.get(row.seriesId)?.label ?? presentation.labelFor(row),
    ),
    time_dimension: row.time ?? undefined,
    metric: row.value,
  }));
  const histogram: Visualization | undefined = (() => {
    if (config.display.chartType !== "HISTOGRAM" || !visibleSeries.length)
      return undefined;
    const formatCount = (value: number) => formatStudioValue(value, undefined);
    const binDetails = new Map(
      selectedRows.map((row) => {
        const series = seriesById.get(row.seriesId)!;
        const label = histogramBinLabel(row, series.bucketUnit);
        const raw = histogramBinDescription(row, series.bucketUnit);
        return [label, raw];
      }),
    );
    if (visibleSeries.length === 1) {
      const series = visibleSeries[0]!;
      return {
        type: "histogram",
        data: data.map((point) => ({
          label: point.dimension ?? "No value",
          value: typeof point.metric === "number" ? point.metric : null,
        })),
        color: palette.get(series.id)!.fillColor,
        valueFormatter: formatCount,
        ariaLabel: `${series.label} histogram`,
        tooltipHeading: (bin) =>
          `${binDetails.get(bin) ?? bin} · ${series.label}`,
        tooltipValueLabel: series.unit ? `Count (${series.unit})` : "Count",
      };
    }
    const bins = new Map<string, Record<string, number | null>>();
    for (const row of selectedRows) {
      const series = seriesById.get(row.seriesId)!;
      const bin = chartDimension(row, config, series.bucketUnit, series.label);
      const values =
        bins.get(bin) ??
        Object.fromEntries(visibleSeries.map((series) => [series.id, null]));
      values[row.seriesId] = row.value;
      bins.set(bin, values);
    }
    return {
      type: "grouped-bar",
      data: [...bins].map(([key, values]) => ({ key, values })),
      series: visibleSeries.map((series) => ({
        id: series.id,
        label: series.label,
        color: palette.get(series.id)!.fillColor,
      })),
      valueFormatter: formatCount,
      tickFormatter: (bin) => bin,
      tooltipFormatter: (bin) => `Bin: ${binDetails.get(bin) ?? bin}`,
      legend:
        config.display.legend === false
          ? { visibility: "hidden" }
          : { visibility: "visible", interaction: "toggle", summary: "none" },
    };
  })();
  const mobileHistogram: Visualization | undefined =
    config.display.chartType === "HISTOGRAM"
      ? {
          type: "table",
          columns: [
            { id: "band", label: "Band" },
            { id: "count", label: "Count", align: "right" },
          ],
          rows: visibleSeries.flatMap((series) => [
            ...(visibleSeries.length > 1
              ? [
                  {
                    id: `${series.id}.population`,
                    emphasis: "subtotal" as const,
                    cells: [
                      { columnId: "band", value: series.label },
                      { columnId: "count", value: "" },
                    ],
                  },
                ]
              : []),
            ...selectedRows
              .filter((row) => row.seriesId === series.id)
              .map((row, index) => ({
                id: `${series.id}.bin.${index}`,
                cells: [
                  {
                    columnId: "band",
                    value: histogramBinLabel(row, series.bucketUnit),
                    detail: `${histogramBinDescription(row, series.bucketUnit)} · ${series.label}`,
                  },
                  {
                    columnId: "count",
                    value: row.value?.toLocaleString("en") ?? "—",
                  },
                ],
              })),
          ]),
        }
      : undefined;
  const colors = Object.fromEntries(
    visibleSeries.map((series) => [
      series.id,
      { label: series.label, ...palette.get(series.id)! },
    ]),
  );
  const units = new Set(
    visibleSeries.map((series) => studioUnitKey(series.unit)),
  );
  const hasIncompatibleUnits = units.size > 1;
  const unit = hasIncompatibleUnits
    ? undefined
    : (config.display.unit ?? visibleSeries[0]?.unit);
  let headlineCandidate: StudioRow | undefined;
  if (config.display.headlineMetricRef)
    headlineCandidate = visibilitySummaries.find(
      (row) =>
        `${row.queryId}.${row.metricId}` === config.display.headlineMetricRef,
    );
  else if (
    visibleMetricRefs.size === 1 &&
    visibilitySummaries.length === 1 &&
    !hasIncompatibleUnits
  )
    headlineCandidate = visibilitySummaries[0];
  const headline =
    headlineCandidate &&
    !partiallyHiddenMetricRefs.has(
      `${headlineCandidate.queryId}.${headlineCandidate.metricId}`,
    )
      ? headlineCandidate
      : undefined;
  const headlineSuppressed = Boolean(
    (config.display.showHeadline || config.display.chartType === "NUMBER") &&
    headlineCandidate &&
    partiallyHiddenMetricRefs.has(
      `${headlineCandidate.queryId}.${headlineCandidate.metricId}`,
    ),
  );
  const tableRows =
    config.display.chartType === "NUMBER" ? summaries : selectedRows;
  const hasMeasuredValues = tableRows.some(
    (row) => typeof row.value === "number" && Number.isFinite(row.value),
  );
  const table: Visualization = {
    type: "table",
    columns: [
      ...(tableRows.some((row) => row.time)
        ? [{ id: "time", label: "Time" }]
        : []),
      { id: "series", label: "Series" },
      ...(tableRows.some((row) => row.dimension)
        ? [{ id: "dimension", label: "Breakdown" }]
        : []),
      { id: "value", label: "Value", align: "right" },
    ],
    rows: tableRows
      .slice(0, config.display.rowLimit ?? 100)
      .map((row, index) => ({
        id: `${row.seriesId}_${index}`,
        cells: [
          {
            columnId: "time",
            value: row.time ? new Date(row.time).toLocaleString() : "",
          },
          {
            columnId: "series",
            value:
              seriesById.get(row.seriesId)?.label ?? presentation.labelFor(row),
          },
          { columnId: "dimension", value: row.dimension ?? "" },
          {
            columnId: "value",
            value: formatStudioValue(
              row.value,
              hasIncompatibleUnits
                ? unitsByMetric.get(`${row.queryId}.${row.metricId}`)
                : (config.display.unit ??
                    unitsByMetric.get(`${row.queryId}.${row.metricId}`)),
            ),
          },
        ],
      })),
  };
  const dimensionFields = [
    ...new Set(selectedRows.flatMap((row) => Object.keys(row.dimensions))),
  ];
  const metricColumns = [
    ...new Map(
      visibleSeries.map((series) => {
        const query = config.queries.find(
          (query) => query.id === series.queryId,
        );
        const metric = query?.metrics.find(
          (metric) => metric.id === series.metricId,
        );
        const metricName = metric ? metricLabel(metric) : series.label;
        const label =
          config.queries.filter((item) => !item.hidden).length > 1 && query
            ? `${query.label} · ${metricName}`
            : metricName;
        return [
          `${series.queryId}.${series.metricId}`,
          {
            id: `${series.queryId}.${series.metricId}`,
            label,
            unit:
              units.size > 1
                ? series.unit
                : (config.display.unit ?? series.unit),
          },
        ] as const;
      }),
    ).values(),
  ];
  const pivotGroups = new Map<
    string,
    {
      time: string | null;
      dimensions: StudioRow["dimensions"];
      values: Map<string, number | null>;
    }
  >();
  for (const row of selectedRows) {
    const key = JSON.stringify([
      row.time,
      dimensionFields.map((field) => row.dimensions[field] ?? null),
    ]);
    const group = pivotGroups.get(key) ?? {
      time: row.time,
      dimensions: row.dimensions,
      values: new Map<string, number | null>(),
    };
    group.values.set(`${row.queryId}.${row.metricId}`, row.value);
    pivotGroups.set(key, group);
  }
  const hasTime = selectedRows.some((row) => row.time);
  const pivotTable: Visualization = {
    type: "table",
    columns: [
      ...(hasTime ? [{ id: "time", label: "Time" }] : []),
      ...dimensionFields.map((field) => ({
        id: `dimension.${field}`,
        label: readableField(field),
      })),
      ...metricColumns.map((column) => ({
        id: column.id,
        label: column.label,
        align: "right" as const,
      })),
    ],
    rows: [...pivotGroups.entries()]
      .slice(0, config.display.rowLimit ?? 100)
      .map(([id, group]) => ({
        id,
        cells: [
          ...(hasTime
            ? [
                {
                  columnId: "time",
                  value: group.time
                    ? new Date(group.time).toLocaleString()
                    : "",
                },
              ]
            : []),
          ...dimensionFields.map((field) => ({
            columnId: `dimension.${field}`,
            value: group.dimensions[field] ?? "—",
          })),
          ...metricColumns.map((column) => ({
            columnId: column.id,
            value: formatStudioValue(
              group.values.get(column.id) ?? null,
              column.unit,
            ),
          })),
        ],
      })),
  };
  const chartRequirement:
    | Extract<Visualization, { type: "empty" }>
    | undefined = (() => {
    if (
      config.display.chartType === "NUMBER" &&
      (visibleMetricRefs.size !== 1 || summaries.length !== 1)
    )
      return {
        type: "empty",
        message: "A big number needs one full-period metric",
        description:
          "Show one metric with a full-period summary and run preview, or choose a table. All executed values remain available in Data.",
      };
    if (
      config.display.chartType === "HISTOGRAM" &&
      visibleSeries.some((series) => series.aggregation !== "histogram")
    )
      return {
        type: "empty",
        message: "A histogram needs a distribution",
        description:
          "Choose the histogram aggregation for a metric and run preview, or choose a bar or line chart for these values. All executed values remain available in Data.",
      };
    return undefined;
  })();
  return {
    data,
    chartRequirement,
    unitPanels: hasIncompatibleUnits
      ? prepareStudioUnitPanels(
          data,
          visibleSeries,
          colors,
          config,
          selectedRows,
          (unit) => studioMetricFormatter(unit, 4),
        )
      : [],
    histogram,
    mobileHistogram,
    colors,
    unit,
    table,
    pivotTable,
    summaries,
    visibleSeries,
    availableSeries,
    headline,
    headlineSuppressed,
    hasIncompatibleUnits,
    hasMeasuredValues,
  };
}

/** Keep result identity and palette slots when chart adapters compact visible series. */
export function applyStudioSeriesPresentation(
  visualization: Visualization,
  prepared: Pick<
    ReturnType<typeof prepareStudioChart>,
    "colors" | "visibleSeries" | "histogram" | "mobileHistogram"
  >,
  onLegendInteraction?: ChartProps["onLegendInteraction"],
  isMobile = false,
): Visualization {
  if (isMobile && prepared.mobileHistogram) return prepared.mobileHistogram;
  if (prepared.histogram) {
    const histogram = prepared.histogram;
    if (
      histogram.type === "grouped-bar" &&
      histogram.legend?.visibility !== "hidden"
    )
      return {
        ...histogram,
        legend: {
          ...histogram.legend,
          visibility: "visible",
          interaction: "toggle",
          summary: "none",
          onInteraction: onLegendInteraction,
        },
      };
    return histogram;
  }
  if (
    visualization.type !== "line" &&
    visualization.type !== "area" &&
    visualization.type !== "stacked-bar" &&
    visualization.type !== "grouped-bar"
  )
    return visualization;
  const order = new Map(
    prepared.visibleSeries.map((series, index) => [series.id, index]),
  );
  return {
    ...visualization,
    series: [...visualization.series]
      .sort(
        (a, b) =>
          (order.get(a.id) ?? order.size) - (order.get(b.id) ?? order.size),
      )
      .map((series) => {
        const palette = prepared.colors[series.id];
        if (!palette) return series;
        if (visualization.type === "area")
          return {
            ...series,
            color: palette.color,
            fillColor: palette.fillColor,
          };
        return {
          ...series,
          color:
            visualization.type === "line" ? palette.color : palette.fillColor,
        };
      }),
  };
}

/** Pages exact executed aggregates without changing query selection or chart formatting. */
export function prepareStudioData(
  result: StudioResult | undefined,
  config: StudioWidgetConfig,
  page: {
    scope: "rows" | "summaries";
    reference: string;
    pageIndex: number;
    pageSize: number;
    compact?: boolean;
  },
) {
  const presentation = studioSeriesPresentation(config);
  const expressions = new Set(
    config.expressions.map((expression) => expression.id),
  );
  const referenceOf = (row: Pick<StudioRow, "queryId" | "metricId">) =>
    expressions.has(row.queryId)
      ? row.queryId
      : `${row.queryId}.${row.metricId}`;
  const seriesByReference = new Map(
    (result?.series ?? []).map((series) => [referenceOf(series), series]),
  );
  const descriptorById = new Map(
    (result?.series ?? []).map((series) => [series.id, series]),
  );
  const rows = result?.[page.scope] ?? [];
  const labels = new Map([
    ...config.queries.flatMap((query) =>
      query.metrics.map(
        (metric) =>
          [
            `${query.id}.${metric.id}`,
            `${query.label} · ${metricLabel(metric)}`,
          ] as const,
      ),
    ),
    ...config.expressions.map(
      (expression) => [expression.id, expression.label] as const,
    ),
  ]);
  const present = new Map<string, number>();
  for (const row of rows) {
    const ref = referenceOf(row);
    present.set(ref, (present.get(ref) ?? 0) + 1);
  }
  const referenceOptions = [
    { value: "all", label: "All executed values" },
    ...[...labels.keys()]
      .filter((value) => present.has(value))
      .map((value) => ({
        value,
        label: `${labels.get(value) ?? value} (${value})`,
      })),
  ];
  const reference = present.has(page.reference) ? page.reference : "all";
  const rowCount =
    reference === "all" ? rows.length : (present.get(reference) ?? 0);
  const pageIndex = Math.min(
    Math.max(0, page.pageIndex),
    Math.max(0, Math.ceil(rowCount / page.pageSize) - 1),
  );
  const pageRows: StudioRow[] = [];
  let matchingIndex = 0;
  for (const row of rows) {
    if (reference !== "all" && referenceOf(row) !== reference) continue;
    if (matchingIndex++ < pageIndex * page.pageSize) continue;
    pageRows.push(row);
    if (pageRows.length === page.pageSize) break;
  }
  const table: Extract<Visualization, { type: "table" }> = {
    type: "table",
    columns: [
      ...(!page.compact ? [{ id: "reference", label: "Metric" }] : []),
      { id: "series", label: "Series" },
      ...(page.compact
        ? [{ id: "displayValue", label: "Value", align: "right" as const }]
        : []),
      { id: "time", label: page.scope === "summaries" ? "Period" : "Time" },
      { id: "dimension", label: "Breakdown" },
      { id: "value", label: "Raw value", align: "right" },
      ...(rows.some((row) => row.evaluationCount !== undefined)
        ? [{ id: "evaluations", label: "Evaluations", align: "right" as const }]
        : []),
      { id: "unit", label: "Unit" },
      ...(page.compact ? [{ id: "reference", label: "Metric" }] : []),
    ],
    rows: pageRows.map((row, index) => {
      const reference = referenceOf(row);
      const descriptor = seriesByReference.get(reference);
      return {
        id: `${row.seriesId}_${index}`,
        cells: [
          ...(page.compact
            ? [
                {
                  columnId: "displayValue",
                  value: formatStudioValue(row.value, descriptor?.unit),
                },
              ]
            : []),
          {
            columnId: "reference",
            value: labels.get(reference) ?? reference,
            detail: `Formula reference: ${reference}`,
          },
          {
            columnId: "series",
            value: presentation.labelFor(
              descriptorById.get(row.seriesId) ?? row,
            ),
          },
          { columnId: "time", value: row.time ?? "Full time range" },
          {
            columnId: "dimension",
            value: Object.keys(row.dimensions).length
              ? JSON.stringify(row.dimensions)
              : "—",
            detail: descriptor?.bucketUnit
              ? `Bin boundaries use ${descriptor.bucketUnit}`
              : undefined,
          },
          { columnId: "value", value: row.value ?? "null" },
          ...(row.evaluationCount === undefined
            ? []
            : [{ columnId: "evaluations", value: row.evaluationCount }]),
          {
            columnId: "unit",
            value: descriptor?.rawUnit ?? descriptor?.unit ?? "—",
          },
        ],
      };
    }),
  };
  return {
    table,
    referenceOptions,
    reference,
    rowCount,
    pageIndex,
    pageSize: page.pageSize,
  };
}
