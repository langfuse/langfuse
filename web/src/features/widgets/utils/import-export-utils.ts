import { z } from "zod";
import {
  getValidAggregationsForMeasureType,
  metricAggregations,
  viewDeclarations,
  views,
  type ViewVersion,
} from "@langfuse/shared/query";
import {
  getWidgetImportFilterConfig,
  normalizeStoredWidgetFiltersForEditor,
  partitionStoredUiTableFiltersToView,
} from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import startCase from "lodash/startCase";
import {
  ChartConfigSchema,
  DashboardWidgetChartType,
  DimensionSchema,
  MetricSchema,
  singleFilter,
  type FilterState,
} from "@langfuse/shared";
import {
  MAX_PIVOT_TABLE_DIMENSIONS,
  MAX_PIVOT_TABLE_METRICS,
} from "@/src/features/widgets/utils/pivot-table-utils";

const dashboardWidgetChartTypeSchema = z.enum(DashboardWidgetChartType);
const widgetMetricSchema = MetricSchema.extend({
  agg: metricAggregations,
});

/**
 * Widget JSON file-format version. `$langfuseWidget: true` marks a JSON
 * payload (file or clipboard text) as a Langfuse widget export and `version`
 * is the version of that envelope — bump it when the export shape changes
 * incompatibly. Distinct from the widget's own `minVersion`, which is the
 * query-engine (v1/v2) version.
 */
export const WIDGET_FILE_FORMAT_VERSION = 1;

export const widgetImportBaseSchema = z
  .object({
    $langfuseWidget: z.literal(true).optional(),
    version: z.number().int().positive().optional(),
    name: z.string(),
    description: z.string(),
    view: views,
    dimensions: z.array(DimensionSchema),
    metrics: z.array(widgetMetricSchema),
    filters: z.array(singleFilter),
    chartType: dashboardWidgetChartTypeSchema,
    chartConfig: ChartConfigSchema,
    minVersion: z.number().int().optional(),
  })
  .loose();

export const widgetImportSchema = widgetImportBaseSchema.superRefine(
  (widget, ctx) => {
    if (widget.chartConfig.type !== widget.chartType) {
      ctx.addIssue({
        code: "custom",
        path: ["chartConfig", "type"],
        message: "chartConfig.type must match chartType",
      });
    }
    if (
      widget.$langfuseWidget === true &&
      (widget.version ?? 1) > WIDGET_FILE_FORMAT_VERSION
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["version"],
        message: `Unsupported widget format version ${widget.version}`,
      });
    }
  },
);

export type WidgetImport = z.infer<typeof widgetImportSchema>;

/**
 * True when a parsed JSON payload carries the Langfuse widget envelope.
 * Clipboard and drag-drop flows use this to distinguish "not a widget at all"
 * (silently ignore) from "claims to be a widget but is malformed" (surface an
 * error).
 */
export function isLangfuseWidgetPayload(parsed: unknown): boolean {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    "$langfuseWidget" in parsed &&
    (parsed as Record<string, unknown>).$langfuseWidget === true
  );
}

export type WidgetImportOptionSets = {
  environmentValues?: string[];
  traceNames?: string[];
  tags?: string[];
  toolNames?: string[];
  calledToolNames?: string[];
  modelNames?: string[];
  observationLevels: string[];
};

export type ImportedWidgetFormSnapshot = {
  widgetMinVersion: number;
  widgetName: string;
  widgetDescription: string;
  selectedView: WidgetImport["view"];
  selectedChartType: WidgetImport["chartType"];
  selectedMeasure: string;
  selectedAggregation: z.infer<typeof metricAggregations>;
  selectedMetrics: {
    id: string;
    measure: string;
    aggregation: z.infer<typeof metricAggregations>;
    label: string;
  }[];
  selectedDimension: string;
  pivotDimensions: string[];
  userFilterState: FilterState;
  rowLimit: number;
  histogramBins: number;
  defaultSortColumn: string;
  defaultSortOrder: "ASC" | "DESC";
};

export type ImportedWidgetResult = {
  snapshot: ImportedWidgetFormSnapshot;
  removedValues: boolean;
  removedFilters: boolean;
};

export function buildWidgetImportAllowedValues(
  options: WidgetImportOptionSets,
  parsedJson: unknown,
): Map<string, Set<string>> {
  const allowedValuesByColumn = new Map<string, Set<string>>();

  if (options.environmentValues) {
    allowedValuesByColumn.set(
      "environment",
      new Set(options.environmentValues),
    );
  }

  if (options.traceNames) {
    const traceNameValues = new Set(options.traceNames);
    allowedValuesByColumn.set("traceName", traceNameValues);
    allowedValuesByColumn.set("name", traceNameValues);
  }

  if (options.tags) {
    allowedValuesByColumn.set("tags", new Set(options.tags));
  }

  if (options.toolNames) {
    allowedValuesByColumn.set("toolNames", new Set(options.toolNames));
  }

  if (
    typeof parsedJson === "object" &&
    parsedJson !== null &&
    "view" in parsedJson &&
    parsedJson.view === "observations"
  ) {
    if (options.calledToolNames) {
      allowedValuesByColumn.set(
        "calledToolNames",
        new Set(options.calledToolNames),
      );
    }

    if (options.modelNames) {
      allowedValuesByColumn.set(
        "providedModelName",
        new Set(options.modelNames),
      );
    }

    allowedValuesByColumn.set("level", new Set(options.observationLevels));
  }

  return allowedValuesByColumn;
}

export type WidgetExportSource = Pick<
  WidgetImport,
  | "name"
  | "description"
  | "view"
  | "dimensions"
  | "metrics"
  | "filters"
  | "chartType"
  | "chartConfig"
  | "minVersion"
>;

/**
 * The canonical widget export shape: the widget's portable configuration
 * wrapped in the Langfuse widget envelope. Downloaded files and
 * copied-to-clipboard widgets both serialize exactly this object.
 */
export function buildWidgetExport(widget: WidgetExportSource) {
  return {
    $langfuseWidget: true as const,
    version: WIDGET_FILE_FORMAT_VERSION,
    name: widget.name,
    description: widget.description,
    view: widget.view,
    dimensions: widget.dimensions,
    metrics: widget.metrics,
    filters: widget.filters,
    chartType: widget.chartType,
    chartConfig: widget.chartConfig,
    minVersion: widget.minVersion,
  };
}

export function downloadWidgetJson(widget: WidgetExportSource) {
  const blob = new Blob([JSON.stringify(buildWidgetExport(widget), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildWidgetJsonFileName(widget.name);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
export function buildWidgetJsonFileName(widgetName: string) {
  const fileSafeName = widgetName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${fileSafeName || "widget"}.json`;
}

export function normalizeImportedFilters(params: {
  filters: FilterState;
  view: z.infer<typeof views>;
  allowedValuesByColumn: Map<string, Set<string>>;
}): { filters: FilterState; removedValues: boolean; removedFilters: boolean } {
  let removedValues = false;
  let removedFilters = false;

  const { mappedFilters: normalizedLegacyFilters, unsupportedFilters } =
    partitionStoredUiTableFiltersToView(params.view, params.filters);

  if (unsupportedFilters.length > 0) {
    removedFilters = true;
  }

  const { allowedColumns, columnAliases } = getWidgetImportFilterConfig(
    params.view,
  );

  const filters: FilterState = normalizedLegacyFilters.flatMap<
    FilterState[number]
  >((filter) => {
    const normalizedColumn = columnAliases[filter.column] ?? filter.column;
    if (!allowedColumns.has(normalizedColumn)) {
      removedFilters = true;
      return [];
    }

    const normalizedFilter = { ...filter, column: normalizedColumn };

    if (
      normalizedFilter.type !== "stringOptions" &&
      normalizedFilter.type !== "arrayOptions" &&
      normalizedFilter.type !== "categoryOptions"
    ) {
      return [normalizedFilter];
    }

    const allowedValues = params.allowedValuesByColumn.get(
      normalizedFilter.column,
    );
    if (!allowedValues) {
      return [normalizedFilter];
    }

    const nextValues = normalizedFilter.value.filter((value) =>
      allowedValues.has(value),
    );
    if (nextValues.length === normalizedFilter.value.length) {
      return [normalizedFilter];
    }

    removedValues = true;

    if (nextValues.length === 0) {
      return [];
    }

    return [{ ...normalizedFilter, value: nextValues }];
  });

  return { filters, removedValues, removedFilters };
}

export function normalizeImportedWidget(params: {
  widget: WidgetImport;
  allowedValuesByColumn: Map<string, Set<string>>;
}): {
  widget: WidgetImport;
  removedValues: boolean;
  removedFilters: boolean;
} {
  const sanitizedFilters = normalizeImportedFilters({
    view: params.widget.view,
    filters: params.widget.filters,
    allowedValuesByColumn: params.allowedValuesByColumn,
  });

  return {
    widget: {
      ...params.widget,
      filters: sanitizedFilters.filters,
    },
    removedValues: sanitizedFilters.removedValues,
    removedFilters: sanitizedFilters.removedFilters,
  };
}

export function parseAndNormalizeImportedWidget(params: {
  parsedJson: unknown;
  allowedValuesByColumn: Map<string, Set<string>>;
}): {
  widget: WidgetImport;
  removedValues: boolean;
  removedFilters: boolean;
} {
  const parsed = widgetImportSchema.parse(params.parsedJson);
  const normalized = normalizeImportedWidget({
    widget: parsed,
    allowedValuesByColumn: params.allowedValuesByColumn,
  });

  return normalized;
}

export function validateImportedWidget(params: {
  widget: WidgetImport;
  importedViewVersion: ViewVersion;
}): void {
  const viewDeclaration =
    viewDeclarations[params.importedViewVersion][params.widget.view];

  const dimensionsAreValid = params.widget.dimensions.every(
    (dimension) =>
      Boolean(viewDeclaration.dimensions[dimension.field]) &&
      !viewDeclaration.dimensions[dimension.field]?.uiHidden,
  );

  const metricsAreValid = params.widget.metrics.every((metric) => {
    const measureDefinition = viewDeclaration.measures[metric.measure];
    if (!measureDefinition) {
      return false;
    }

    return getValidAggregationsForMeasureType(measureDefinition.type).some(
      (aggregation) => aggregation === metric.agg,
    );
  });

  const dimensionsFitChartType =
    params.widget.chartType === "PIVOT_TABLE"
      ? true
      : params.widget.dimensions.length <= 1;
  const pivotTableShapeIsValid =
    params.widget.chartType !== "PIVOT_TABLE" ||
    (params.widget.dimensions.length <= MAX_PIVOT_TABLE_DIMENSIONS &&
      params.widget.metrics.length <= MAX_PIVOT_TABLE_METRICS);

  if (
    !dimensionsAreValid ||
    !metricsAreValid ||
    !dimensionsFitChartType ||
    !pivotTableShapeIsValid
  ) {
    throw new Error("malformed");
  }
}

export function toImportedWidgetFormSnapshot(
  widget: WidgetImport,
): ImportedWidgetFormSnapshot {
  const importedMetrics =
    widget.metrics.length > 0
      ? widget.metrics
      : [{ measure: "count", agg: "count" as const }];
  const importedDimensions =
    widget.chartType === "PIVOT_TABLE"
      ? widget.dimensions
      : widget.dimensions.slice(0, 1);
  const importedChartConfig = widget.chartConfig;

  return {
    widgetMinVersion: widget.minVersion ?? 1,
    widgetName: widget.name,
    widgetDescription: widget.description,
    selectedView: widget.view,
    selectedChartType: widget.chartType,
    selectedMeasure: importedMetrics[0]?.measure ?? "count",
    selectedAggregation: importedMetrics[0]?.agg ?? "count",
    selectedMetrics: importedMetrics.map((metric) => ({
      id: `${metric.agg}_${metric.measure}`,
      measure: metric.measure,
      aggregation: metric.agg,
      label: `${startCase(metric.agg)} ${startCase(metric.measure)}`,
    })),
    selectedDimension: importedDimensions[0]?.field ?? "none",
    pivotDimensions: importedDimensions.map((dimension) => dimension.field),
    userFilterState: normalizeStoredWidgetFiltersForEditor(
      widget.view,
      widget.filters,
    ).editorFilters,
    rowLimit:
      "row_limit" in importedChartConfig
        ? (importedChartConfig.row_limit ?? 100)
        : 100,
    histogramBins:
      importedChartConfig.type === "HISTOGRAM"
        ? (importedChartConfig.bins ?? 10)
        : 10,
    defaultSortColumn:
      importedChartConfig.type === "PIVOT_TABLE"
        ? (importedChartConfig.defaultSort?.column ?? "none")
        : "none",
    defaultSortOrder:
      importedChartConfig.type === "PIVOT_TABLE"
        ? (importedChartConfig.defaultSort?.order ?? "DESC")
        : "DESC",
  };
}

function normalizeImportedWidgetVersion(widget: WidgetImport): WidgetImport {
  if (widget.view !== "traces") {
    return widget;
  }

  return {
    ...widget,
    minVersion: 1,
  };
}

/**
 * Full import pipeline for one parsed widget JSON payload: schema parse,
 * filter normalization (value-level pruning only when option sets are
 * provided — clipboard/drop flows skip the option queries and pass none),
 * traces-view version normalization, and view-declaration validation.
 * Throws on any payload that cannot become a valid widget.
 */
export function parseImportedWidgetJson(params: {
  parsedJson: unknown;
  optionSets?: WidgetImportOptionSets;
  isBetaEnabled: boolean;
}): { widget: WidgetImport; removedValues: boolean; removedFilters: boolean } {
  const allowedValuesByColumn = params.optionSets
    ? buildWidgetImportAllowedValues(params.optionSets, params.parsedJson)
    : new Map<string, Set<string>>();

  const {
    widget: importedWidget,
    removedValues,
    removedFilters,
  } = parseAndNormalizeImportedWidget({
    parsedJson: params.parsedJson,
    allowedValuesByColumn,
  });

  const normalizedWidget = normalizeImportedWidgetVersion(importedWidget);
  const importedMinVersion = normalizedWidget.minVersion ?? 1;
  const importedViewVersion: ViewVersion =
    (params.isBetaEnabled && normalizedWidget.view !== "traces") ||
    importedMinVersion >= 2
      ? "v2"
      : "v1";

  validateImportedWidget({
    widget: normalizedWidget,
    importedViewVersion,
  });

  return { widget: normalizedWidget, removedValues, removedFilters };
}

export async function importWidgetFile(params: {
  file: File;
  optionSets: WidgetImportOptionSets;
  isBetaEnabled: boolean;
}): Promise<ImportedWidgetResult> {
  const rawContent = await params.file.text();
  const parsedJson: unknown = JSON.parse(rawContent);

  const { widget, removedValues, removedFilters } = parseImportedWidgetJson({
    parsedJson,
    optionSets: params.optionSets,
    isBetaEnabled: params.isBetaEnabled,
  });

  return {
    snapshot: toImportedWidgetFormSnapshot(widget),
    removedValues,
    removedFilters,
  };
}

export type PastedWidgetParseResult =
  | { status: "not-widget" }
  | { status: "invalid"; reason: string }
  | { status: "widget"; widget: WidgetImport; removedFilters: boolean };

/**
 * Parses clipboard or dropped text into a widget. Anything that does not
 * carry the Langfuse widget envelope is "not-widget" (callers ignore it
 * silently); an enveloped payload that fails validation is "invalid" with a
 * user-facing reason.
 */
export function parsePastedWidget(
  text: string,
  params: { isBetaEnabled: boolean },
): PastedWidgetParseResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    return { status: "not-widget" };
  }

  if (!isLangfuseWidgetPayload(parsedJson)) {
    return { status: "not-widget" };
  }

  const declaredVersion = (parsedJson as Record<string, unknown>).version;
  if (
    typeof declaredVersion === "number" &&
    declaredVersion > WIDGET_FILE_FORMAT_VERSION
  ) {
    return {
      status: "invalid",
      reason: `This widget uses format version ${declaredVersion}; this Langfuse version supports up to ${WIDGET_FILE_FORMAT_VERSION}.`,
    };
  }

  try {
    const { widget, removedFilters } = parseImportedWidgetJson({
      parsedJson,
      isBetaEnabled: params.isBetaEnabled,
    });
    return { status: "widget", widget, removedFilters };
  } catch {
    return {
      status: "invalid",
      reason: "The widget configuration is malformed or not supported.",
    };
  }
}

/**
 * Portable widget fields in the shape of the `dashboardWidgets.create`
 * mutation input (minus projectId) — used to recreate a pasted, dropped, or
 * duplicated widget as a new project-owned widget.
 */
export function toWidgetCreateFields(widget: WidgetExportSource) {
  return {
    name: widget.name,
    description: widget.description,
    view: widget.view,
    dimensions: widget.dimensions,
    metrics: widget.metrics,
    filters: widget.filters,
    chartType: widget.chartType,
    chartConfig: widget.chartConfig,
    minVersion: widget.minVersion,
  };
}
