import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/src/components/ui/card";
import { api } from "@/src/utils/api";
import { importWidgetFile } from "@/src/features/widgets/utils/import-export-utils";
import {
  buildWidgetOrderBy,
  getResultUnit,
  getValidAggregationsForMeasureType,
  isV2BreakdownChart,
  validateQuery,
  viewDeclarations,
  views,
  viewsV2,
  type QueryType,
  type ViewVersion,
  type metricAggregations,
} from "@langfuse/shared/query";
import {
  mapWidgetUiTableFilterToView,
  partitionWidgetUiTableFiltersToView,
} from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import React, { useMemo, useRef } from "react";
import {
  useController,
  useForm,
  useWatch,
  type Control,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { WidgetPropertySelectItem } from "@/src/features/widgets/components/WidgetPropertySelectItem";
import { Label } from "@/src/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";

import { type z } from "zod";

import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { Input } from "@/src/components/ui/input";
import startCase from "lodash/startCase";
import { DatePickerWithRange } from "@/src/components/date-picker";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import {
  toAbsoluteTimeRange,
  type DashboardDateRangeOptions,
} from "@/src/utils/date-range-utils";
import { normalizeSingleValueOptions } from "@/src/features/filters/lib/filter-transform";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { Button } from "@/src/components/ui/button";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import {
  type FilterState,
  type TimeFilter,
  ObservationLevelDomain,
  ObservationTypeDomain,
} from "@langfuse/shared";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import {
  BarChart,
  PieChart,
  LineChart,
  BarChartHorizontal,
  Hash,
  BarChart3,
  Table,
  Plus,
  X,
  AlertCircle,
  Upload,
  Sparkles,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverClose,
} from "@/src/components/ui/popover";
import {
  formatMetricName,
  getWidgetMetricPresentation,
  getWidgetMissingBucketValue,
} from "@/src/features/widgets/utils";
import {
  MAX_PIVOT_TABLE_DIMENSIONS,
  MAX_PIVOT_TABLE_METRICS,
} from "@/src/features/widgets/utils/pivot-table-utils";
import { ChartLoadingState } from "@/src/features/widgets/chart-library/ChartLoadingState";
import {
  getChartLoadingProgress,
  getChartLoadingStateProps,
} from "@/src/features/widgets/chart-library/chartLoadingStateUtils";
import {
  getWidgetColumnsWithCustomSelect,
  getWidgetFilterColumns,
} from "./widgetFilterColumns";
import { WIDGET_FILTER_PRESETS } from "@/src/features/widgets/constants/widgetFilterPresets";
import {
  applyChartTypeChange,
  deriveEffectiveSort,
  deriveWidgetBaseMinVersion,
  deriveWidgetSuggestions,
  effectiveWidgetName,
  makeWidgetFormSchema,
  normalizeWidgetFormValues,
  resolveWidgetViewVersion,
  toDefaultValues,
  toSavePayload,
  widgetChartTypeSupportsBreakdown,
  type SortField,
  type WidgetFormValues,
  type WidgetInitialValues,
} from "./widgetFormSchema";

// Re-exported from the schema module so co-located tests keep importing it from
// this file; it now backs the shared normalizeWidgetFormValues healing.
export { resolveAggregationAndChartType } from "./widgetFormSchema";

type ChartType = {
  group: "time-series" | "total-value";
  name: string;
  value: DashboardWidgetChartType;
  icon: React.ElementType;
};

const getDateRangeFilter = (
  column: "timestamp" | "startTime",
  dateRange?: { from: Date; to: Date },
): TimeFilter[] | undefined =>
  dateRange
    ? [
        { column, type: "datetime", operator: ">=", value: dateRange.from },
        { column, type: "datetime", operator: "<=", value: dateRange.to },
      ]
    : undefined;

// chartTypes drives the chart-type SelectGroup rendering (group/name/value/
// icon). Whether a type supports a breakdown dimension is derived on demand via
// widgetChartTypeSupportsBreakdown(chartType) at each gate, not stored here.
const chartTypes: ChartType[] = [
  {
    group: "total-value",
    name: "Big Number",
    value: "NUMBER",
    icon: Hash,
  },
  {
    group: "time-series",
    name: "Line Chart",
    value: "LINE_TIME_SERIES",
    icon: LineChart,
  },
  {
    group: "time-series",
    name: "Vertical Bar Chart",
    value: "BAR_TIME_SERIES",
    icon: BarChart,
  },
  {
    group: "total-value",
    name: "Horizontal Bar Chart",
    value: "HORIZONTAL_BAR",
    icon: BarChartHorizontal,
  },
  {
    group: "total-value",
    name: "Vertical Bar Chart",
    value: "VERTICAL_BAR",
    icon: BarChart,
  },
  {
    group: "total-value",
    name: "Histogram",
    value: "HISTOGRAM",
    icon: BarChart3,
  },
  {
    group: "total-value",
    name: "Pie Chart",
    value: "PIE",
    icon: PieChart,
  },
  {
    group: "total-value",
    name: "Pivot Table",
    value: "PIVOT_TABLE",
    icon: Table,
  },
];

const observationLevelOptions = ObservationLevelDomain.options.map((value) => ({
  value,
}));
const observationTypeOptions = ObservationTypeDomain.options.map((value) => ({
  value,
}));

/**
 * A small read-only context passed DOWN to field subcomponents. It lets a field
 * render meta (descriptions/units) and gate options without any child ever
 * calling `watch` — the controller owns the single `useWatch`.
 */
type WidgetFieldContext = {
  view: z.infer<typeof views>;
  viewVersion: ViewVersion;
  chartType: DashboardWidgetChartType;
  measureSupportsHistogram: boolean;
};

export function WidgetForm({
  initialValues,
  projectId,
  onSave,
  widgetId,
}: {
  initialValues: {
    name: string;
    description: string;
    view: z.infer<typeof views>;
    measure: string;
    aggregation: z.infer<typeof metricAggregations>;
    dimension: string;
    filters?: FilterState;
    chartType: DashboardWidgetChartType;
    chartConfig?: WidgetInitialValues["chartConfig"];
    // Support for complete widget data (editing mode)
    metrics?: { measure: string; agg: string }[];
    dimensions?: { field: string }[];
    minVersion?: number;
  };
  projectId: string;
  onSave: (widgetData: {
    name: string;
    description: string;
    view: string;
    dimensions: { field: string }[];
    metrics: { measure: string; agg: string }[];
    filters: any[];
    chartType: DashboardWidgetChartType;
    chartConfig: NonNullable<WidgetInitialValues["chartConfig"]>;
    minVersion: number;
  }) => void;
  widgetId?: string;
}) {
  const { isBetaEnabled } = useV4Beta();
  const importInputRef = useRef<HTMLInputElement>(null);

  // The widget's frozen, view-shape-derived base minVersion. Beta-toggle
  // (create page) and widget change (edit page) remount the form via `key`, so
  // this stays a mount constant — minVersion/viewVersion are DERIVED, not
  // stored (no widgetMinVersion state, no sync effect).
  const baseMinVersion = deriveWidgetBaseMinVersion(initialValues);

  // Refs read lazily by the stable resolver so the resolver closure need not be
  // rebuilt when the view version or the auto-suggestions change.
  const viewVersionRef = useRef<ViewVersion>("v1");
  const suggestionsRef = useRef<{ name: string; description: string }>({
    name: "",
    description: "",
  });

  // Precompute both version schemas/resolvers once; pick by ref at validation
  // time. A blank name/description is filled with the live suggestion and the
  // filters are mapped into view space before zod (mirrors MonitorForm).
  const resolversByVersion = useMemo(
    () => ({
      v1: zodResolver(makeWidgetFormSchema("v1") as any),
      v2: zodResolver(makeWidgetFormSchema("v2") as any),
    }),
    [],
  );
  const resolver = useMemo<Resolver<WidgetFormValues>>(() => {
    return (values, context, options) => {
      const v = values as WidgetFormValues;
      const suggestions = suggestionsRef.current;
      const mapped = {
        ...v,
        name: effectiveWidgetName(v.name, suggestions.name),
        description: effectiveWidgetName(
          v.description,
          suggestions.description,
        ),
        filters: mapWidgetUiTableFilterToView(v.view, v.filters ?? []),
      };
      return resolversByVersion[viewVersionRef.current](
        mapped as any,
        context,
        options,
      );
    };
  }, [resolversByVersion]);

  // The initial view version, derived from initialValues alone (view is known
  // before the form mounts) so the seed can normalize against the right view
  // declaration.
  const initialViewVersion = resolveWidgetViewVersion({
    view: initialValues.view,
    baseMinVersion,
    isBetaEnabled,
  });

  const form = useForm<WidgetFormValues>({
    resolver,
    defaultValues: toDefaultValues(initialValues, initialViewVersion),
    mode: "onChange",
  });

  // THE single useWatch. Everything below is derived from `values` once.
  const values = useWatch({ control: form.control }) as WidgetFormValues;

  const selectedView = values.view;
  const chartType = values.chart.type;
  const viewVersion = resolveWidgetViewVersion({
    view: selectedView,
    baseMinVersion,
    isBetaEnabled,
  });
  const suggestions = deriveWidgetSuggestions(values);
  const effectiveSort = deriveEffectiveSort(values);

  viewVersionRef.current = viewVersion;
  suggestionsRef.current = suggestions;

  const availableViewOptions = viewVersion === "v2" ? viewsV2 : views;

  // Valid aggregations for a given measure on the current (view, version).
  const getValidAggregationsForMeasure = (
    measure: string,
  ): z.infer<typeof metricAggregations>[] => {
    const measureType =
      viewDeclarations[viewVersion][selectedView]?.measures?.[measure]?.type;
    return getValidAggregationsForMeasureType(measureType);
  };
  const validAggregationsForMeasure = getValidAggregationsForMeasure(
    values.metrics[0]?.measure ?? "count",
  );
  const measureSupportsHistogram =
    validAggregationsForMeasure.includes("histogram") &&
    (values.metrics[0]?.measure ?? "count") !== "count";

  const ctx: WidgetFieldContext = {
    view: selectedView,
    viewVersion,
    chartType,
    measureSupportsHistogram,
  };

  // superRefine messages, surfaced inline under the relevant control and next
  // to the disabled Save button (replaces the legacy save-time error toasts).
  const formErrors = form.formState.errors as Record<string, any>;
  const chartTypeError: string | undefined = formErrors.chart?.type?.message;
  const metricsError: string | undefined =
    formErrors.metrics?.message ??
    formErrors.metrics?.[0]?.measure?.message ??
    formErrors.metrics?.[0]?.aggregation?.message;
  const dimensionsError: string | undefined = formErrors.dimensions?.message;

  // Preview time range. The picker here is a transient PREVIEW control — the
  // widget does not own a time range, so it must not write the user's shared
  // cross-view default. Kept as LOCAL state (not RHF).
  const { timeRange, setTimeRange } = useDashboardDateRange({
    defaultRelativeAggregation: "last7Days",
    persistAsDefault: false,
  });
  const dateRange = useMemo(
    () => toAbsoluteTimeRange(timeRange) ?? undefined,
    [timeRange],
  );
  const selectedOption = useMemo(() => {
    if ("range" in timeRange) return timeRange.range;
    return "custom" as const;
  }, [timeRange]);
  const setDateRangeAndOption = (
    option: DashboardDateRangeOptions,
    range?: { from: Date; to: Date },
  ) => {
    if (option === "custom") {
      if (range) setTimeRange({ from: range.from, to: range.to });
    } else {
      setTimeRange({ range: option });
    }
  };

  const unsupportedFilters = useMemo(
    () =>
      partitionWidgetUiTableFiltersToView(selectedView, values.filters)
        .unsupportedFilters,
    [selectedView, values.filters],
  );
  const unsupportedFilterColumns = useMemo(
    () =>
      Array.from(
        new Set(unsupportedFilters.map((filter) => filter.column)),
      ).join(", "),
    [unsupportedFilters],
  );
  const normalizedUserFilters = useMemo(
    () => mapWidgetUiTableFilterToView(selectedView, values.filters),
    [selectedView, values.filters],
  );

  // v1: traces/generations filter options (old normalized tables)
  const traceFilterOptions = api.traces.filterOptions.useQuery(
    {
      projectId,
      timestampFilter: getDateRangeFilter("timestamp", dateRange),
    },
    {
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
      enabled: viewVersion === "v1",
    },
  );
  const generationsFilterOptions = api.generations.filterOptions.useQuery(
    {
      projectId,
      startTimeFilter: getDateRangeFilter("startTime", dateRange),
      observationType: "ALL",
    },
    {
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
      enabled: viewVersion === "v1",
    },
  );
  const eventsFilterOptions = api.events.filterOptions.useQuery(
    {
      projectId,
      startTimeFilter: getDateRangeFilter("startTime", dateRange),
    },
    {
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
      enabled: viewVersion === "v2",
    },
  );
  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      {
        projectId,
        fromTimestamp: dateRange?.from,
      },
      {
        trpc: { context: { skipBatch: true } },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
        enabled: viewVersion === "v1",
      },
    );
  const datasets = api.datasets.allDatasetMeta.useQuery(
    { projectId },
    { enabled: viewVersion === "v2" },
  );

  // Resolve filter options based on viewVersion
  const environmentOptions =
    viewVersion === "v2"
      ? eventsFilterOptions.data?.environment || []
      : environmentFilterOptions.data?.map((value) => ({
          value: value.environment,
        })) || [];
  const nameOptions =
    viewVersion === "v2"
      ? normalizeSingleValueOptions(eventsFilterOptions.data?.traceName)
      : normalizeSingleValueOptions(traceFilterOptions.data?.name);
  const observationNameOptions =
    viewVersion === "v2"
      ? normalizeSingleValueOptions(eventsFilterOptions.data?.name)
      : normalizeSingleValueOptions(generationsFilterOptions.data?.name);
  const tagsOptions =
    viewVersion === "v2"
      ? eventsFilterOptions.data?.traceTags || []
      : traceFilterOptions.data?.tags || [];
  const modelOptions =
    viewVersion === "v2"
      ? eventsFilterOptions.data?.providedModelName || []
      : generationsFilterOptions.data?.model || [];
  const toolNamesOptions =
    viewVersion === "v2"
      ? eventsFilterOptions.data?.toolNames || []
      : generationsFilterOptions.data?.toolNames || [];
  const calledToolNamesOptions =
    viewVersion === "v2"
      ? eventsFilterOptions.data?.calledToolNames || []
      : generationsFilterOptions.data?.calledToolNames || [];
  const experimentNameOptions =
    viewVersion === "v2" ? eventsFilterOptions.data?.experimentName || [] : [];
  const experimentDatasetIdSet = new Set(
    eventsFilterOptions.data?.experimentDatasetId?.map((e) => e.value),
  );
  const experimentDatasetIdOptions =
    datasets.data
      ?.filter((d) => experimentDatasetIdSet.has(d.id))
      .map((d) => ({ value: d.id, displayValue: d.name })) ?? [];

  const filterColumnsParams = {
    selectedView,
    viewVersion,
    environmentOptions,
    nameOptions,
    observationNameOptions,
    tagsOptions,
    modelOptions,
    toolNamesOptions,
    calledToolNamesOptions,
    observationLevelOptions,
    experimentNameOptions,
    experimentDatasetOptions: experimentDatasetIdOptions,
    observationTypeOptions,
  };
  const filterColumns = getWidgetFilterColumns(filterColumnsParams);
  const columnsWithCustomSelect =
    getWidgetColumnsWithCustomSelect(filterColumnsParams);

  const getValidFilterColumnIds = (
    view: z.infer<typeof views>,
    version: ViewVersion,
  ): Set<string> => {
    const columns = getWidgetFilterColumns({
      ...filterColumnsParams,
      selectedView: view,
      viewVersion: version,
    });
    return new Set(columns.flatMap((col) => [col.id, col.name]));
  };

  // Available measures for the single (non-pivot) metric picker.
  const singleChartMetrics = useMemo(() => {
    const measures = viewDeclarations[viewVersion][selectedView].measures;
    return Object.entries(measures)
      .map(([key]) => ({ value: key, label: startCase(key) }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
      );
  }, [selectedView, viewVersion]);

  // Available aggregations for a specific pivot metric index (excludes the
  // aggregation/measure pairs already used by other pivot metrics).
  const getAvailablePivotAggregations = (
    metricIndex: number,
    measureKey: string,
  ): z.infer<typeof metricAggregations>[] => {
    const measureType =
      viewDeclarations[viewVersion][selectedView]?.measures?.[measureKey]?.type;
    // Pivot metrics never use the histogram aggregation (superRefine invariant
    // 2 rejects it outside a histogram chart), so keep it out of the options.
    const validAggs = getValidAggregationsForMeasureType(measureType).filter(
      (agg) => agg !== "histogram",
    );
    if (measureKey) {
      return validAggs.filter(
        (agg) =>
          !values.metrics.some(
            (m, idx) =>
              idx !== metricIndex &&
              m.measure === measureKey &&
              m.aggregation === agg,
          ),
      );
    }
    return validAggs;
  };

  // Available measures for a specific pivot metric index.
  const getAvailablePivotMetrics = (metricIndex: number) => {
    const viewDeclaration = viewDeclarations[viewVersion][selectedView];
    return Object.entries(viewDeclaration.measures)
      .filter(([measureKey]) => {
        if (measureKey === "count") {
          return !values.metrics.some(
            (m, idx) => idx !== metricIndex && m.measure === "count",
          );
        }
        const selectedAggregationsForMeasure = values.metrics
          .filter((m, idx) => idx !== metricIndex && m.measure === measureKey)
          .map((m) => m.aggregation);
        const measureType = viewDeclaration.measures[measureKey]?.type;
        const validAggs = getValidAggregationsForMeasureType(measureType);
        const availableAggregationsForMeasure = validAggs.filter(
          (agg) =>
            agg !== "histogram" &&
            !selectedAggregationsForMeasure.includes(agg),
        );
        return availableAggregationsForMeasure.length > 0;
      })
      .map(([key]) => ({ value: key, label: startCase(key) }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
      );
  };

  const availableDimensions = useMemo(() => {
    const viewDeclaration = viewDeclarations[viewVersion][selectedView];
    return Object.entries(viewDeclaration.dimensions)
      .filter(([_, dim]) => !dim.uiHidden)
      .map(([key]) => ({ value: key, label: startCase(key) }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
      );
  }, [selectedView, viewVersion]);

  const previewSortState = effectiveSort ?? null;
  const pivotDimensionFields = values.dimensions.map((d) => d.field);

  // Preview query. Depends ONLY on the fields that affect it — not
  // name/description.
  const query = useMemo<QueryType>(() => {
    const fromTimestamp = dateRange
      ? dateRange.from
      : new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
    const toTimestamp = dateRange ? dateRange.to : new Date();

    const queryDimensions =
      chartType === "PIVOT_TABLE"
        ? values.dimensions.map((d) => ({ field: d.field }))
        : values.dimensions.length > 0
          ? [{ field: values.dimensions[0].field }]
          : [];

    const queryMetrics =
      chartType === "PIVOT_TABLE"
        ? values.metrics
            .filter((metric) => metric.measure && metric.measure !== "")
            .map((metric) => ({
              measure: metric.measure,
              aggregation: metric.aggregation,
            }))
        : [
            {
              measure: values.metrics[0]?.measure ?? "count",
              aggregation: values.metrics[0]?.aggregation ?? "count",
            },
          ];

    const needsTopN = isV2BreakdownChart({
      version: viewVersion,
      hasDimension: queryDimensions.length > 0,
      isTimeSeries: isTimeSeriesChart(chartType),
      chartType,
    });

    const orderBy = buildWidgetOrderBy({
      chartType,
      sortState: previewSortState,
      needsTopN,
      firstMetric: {
        aggregation: values.metrics[0]?.aggregation ?? "count",
        measure: values.metrics[0]?.measure ?? "count",
      },
    });

    let chartConfig: QueryType["chartConfig"];
    if (chartType === "HISTOGRAM") {
      chartConfig = { type: chartType, bins: values.chart.bins };
    } else if (chartType === "PIVOT_TABLE" || needsTopN) {
      chartConfig = { type: chartType, row_limit: values.chart.rowLimit };
    } else {
      chartConfig = { type: chartType };
    }

    return {
      view: selectedView,
      dimensions: queryDimensions,
      metrics: queryMetrics,
      filters: [...normalizedUserFilters],
      timeDimension: isTimeSeriesChart(chartType)
        ? { granularity: "auto" }
        : null,
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
      orderBy,
      chartConfig,
    };
  }, [
    selectedView,
    values.metrics,
    values.dimensions,
    chartType,
    values.chart.bins,
    values.chart.rowLimit,
    dateRange,
    previewSortState,
    viewVersion,
    normalizedUserFilters,
  ]);

  const queryValidation = useMemo(() => {
    if (unsupportedFilters.length > 0) {
      return {
        valid: false as const,
        reason:
          `Unsupported legacy filter column(s): ${unsupportedFilterColumns}. ` +
          "Remove them or switch to a compatible view before saving this widget.",
      };
    }
    return validateQuery(query, viewVersion);
  }, [query, unsupportedFilterColumns, unsupportedFilters.length, viewVersion]);

  const queryResult = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query,
      version: viewVersion,
    },
    {
      trpc: { context: { skipBatch: true } },
      meta: { silentHttpCodes: [422] },
      enabled: queryValidation.valid,
    },
  );

  const chartLoadingState = getChartLoadingStateProps({
    isPending: queryResult.isPending,
    isError: queryResult.isError,
  });
  const loadingProgress = getChartLoadingProgress({
    isPending: queryResult.isPending,
    progress: null,
    useBackendProgress: false,
  });

  const selectedMeasure = values.metrics[0]?.measure ?? "count";
  const selectedAggregation = values.metrics[0]?.aggregation ?? "count";
  const selectedDimension = values.dimensions[0]?.field ?? "none";

  const transformedData: DataPoint[] = useMemo(
    () =>
      queryResult.data?.map((item: any) => {
        if (chartType === "PIVOT_TABLE") {
          return {
            dimension:
              values.dimensions.length > 0
                ? values.dimensions[0].field
                : "dimension",
            metric: 0,
            time_dimension: item["time_dimension"],
            ...item,
          };
        }
        const metricField = `${selectedAggregation}_${selectedMeasure}`;
        const metric = item[metricField];
        const dimensionField = selectedDimension;
        const dimensionValue = item[dimensionField];
        const isTimeSeries = isTimeSeriesChart(chartType);

        const isFillerMetricValue =
          metric == null ||
          (getWidgetMissingBucketValue(selectedAggregation) === "zero" &&
            Number(metric) === 0);
        if (
          isTimeSeries &&
          dimensionField !== "none" &&
          (dimensionValue === null || dimensionValue === "") &&
          isFillerMetricValue
        ) {
          return {
            dimension: undefined,
            metric: null,
            time_dimension: item["time_dimension"],
          };
        }

        return {
          dimension:
            dimensionValue !== undefined && dimensionField !== "none"
              ? (() => {
                  const val = dimensionValue;
                  if (val === null || val === undefined || val === "")
                    return "n/a";
                  if (typeof val === "string") return val;
                  if (Array.isArray(val)) return val.join(", ");
                  return String(val);
                })()
              : formatMetricName(metricField),
          metric: Array.isArray(metric)
            ? metric
            : isTimeSeries && metric == null
              ? null
              : Number(metric || 0),
          time_dimension: item["time_dimension"],
        };
      }) ?? [],
    [
      queryResult.data,
      selectedAggregation,
      selectedDimension,
      selectedMeasure,
      chartType,
      values.dimensions,
    ],
  );

  const chartPresentation = useMemo(() => {
    if (chartType === "PIVOT_TABLE") return undefined;
    return getWidgetMetricPresentation({
      metric: { measure: selectedMeasure, agg: selectedAggregation },
      view: selectedView,
      version: viewVersion,
    });
  }, [
    selectedAggregation,
    chartType,
    selectedMeasure,
    selectedView,
    viewVersion,
  ]);

  // ---------------------------------------------------------------------------
  // Cross-slice cascades — the ONLY writers of sibling fields. Each builds the
  // candidate next state, HEALS it through the shared normalizeWidgetFormValues
  // (resolve aggregation/chart type + drop unsupported dimensions), and commits
  // the changed slices. This is the same healing the legacy resolve/breakdown
  // effects did, run in the initiating event handler — so no view change,
  // chart-type change, or measure change can leave the form invalid, and there
  // is no effect.
  // ---------------------------------------------------------------------------

  // Applies a healed candidate to the changed slices; the final write validates.
  const commitHealed = (
    candidate: WidgetFormValues,
    opts: { view?: boolean; filters?: boolean } = {},
  ) => {
    form.setValue("metrics", candidate.metrics);
    form.setValue("dimensions", candidate.dimensions);
    if (opts.filters) form.setValue("filters", candidate.filters);
    if (opts.view) form.setValue("view", candidate.view);
    form.setValue("chart.type", candidate.chart.type, { shouldValidate: true });
  };

  // View change (ports resetChartFieldsForView + setSelectedView + the mount
  // resolve/breakdown-wipe healing so the post-view-change state is valid).
  const onViewChange = (newView: z.infer<typeof views>) => {
    if (newView === selectedView) return;
    const newViewVersion = resolveWidgetViewVersion({
      view: newView,
      baseMinVersion,
      isBetaEnabled,
    });
    const newViewDeclaration = viewDeclarations[newViewVersion][newView];

    let metrics: WidgetFormValues["metrics"];
    let dimensions: WidgetFormValues["dimensions"];
    if (chartType === "PIVOT_TABLE") {
      const validMetrics = values.metrics.filter(
        (metric) => metric.measure in newViewDeclaration.measures,
      );
      metrics =
        validMetrics.length > 0
          ? validMetrics
          : [{ measure: "count", aggregation: "count" }];
      dimensions = values.dimensions.filter(
        (dimension) => dimension.field in newViewDeclaration.dimensions,
      );
    } else {
      metrics = [{ measure: "count", aggregation: "count" }];
      dimensions = [];
    }

    const validColumns = getValidFilterColumnIds(newView, newViewVersion);
    const filters = values.filters.filter((filter) =>
      validColumns.has(filter.column),
    );

    const candidate = normalizeWidgetFormValues(
      { ...values, view: newView, metrics, dimensions, filters },
      newViewVersion,
    );
    commitHealed(candidate, { view: true, filters: true });
  };

  // Chart-type change (ports breakdown-wipe / pivot-dims-reset / trim-metrics
  // PLUS the histogram resolution — the histogram silent-revert fix). Crossing
  // the pivot boundary resets dimensions so a breakdown dim and pivot row dims
  // never cross-contaminate (see applyChartTypeChange).
  const onChartTypeChange = (newType: DashboardWidgetChartType) => {
    commitHealed(applyChartTypeChange(values, newType, viewVersion));
  };

  // Single (non-pivot) measure change — heals the aggregation + chart type in
  // the same action (the histogram fix, in the initiating event handler).
  const onMeasureChange = (newMeasure: string) => {
    const nextMetrics = values.metrics.map((m, i) =>
      i === 0 ? { ...m, measure: newMeasure } : m,
    );
    const candidate = normalizeWidgetFormValues(
      { ...values, metrics: nextMetrics },
      viewVersion,
    );
    commitHealed(candidate);
  };

  const applyPreset = (
    preset: (typeof WIDGET_FILTER_PRESETS)[keyof typeof WIDGET_FILTER_PRESETS],
  ) => {
    if (preset.view !== selectedView) {
      onViewChange(preset.view);
    }
    form.setValue("filters", [...preset.filters], { shouldValidate: true });
  };

  const handleImportWidget = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const showMalformedImportToast = () =>
      showErrorToast(
        "Malformed input",
        "This operation can't be done due to the malformed input",
        "WARNING",
      );

    try {
      const result = await importWidgetFile({
        file,
        optionSets: {
          environmentValues: environmentFilterOptions.data?.map(
            (option) => option.environment,
          ),
          traceNames: traceFilterOptions.data
            ? normalizeSingleValueOptions(traceFilterOptions.data.name).map(
                (option) => option.value,
              )
            : undefined,
          tags: traceFilterOptions.data
            ? traceFilterOptions.data.tags.map((option) => option.value)
            : undefined,
          toolNames: generationsFilterOptions.data
            ? generationsFilterOptions.data.toolNames.map(
                (option) => option.value,
              )
            : undefined,
          calledToolNames: generationsFilterOptions.data
            ? generationsFilterOptions.data.calledToolNames.map(
                (option) => option.value,
              )
            : undefined,
          modelNames: generationsFilterOptions.data
            ? generationsFilterOptions.data.model.map((option) => option.value)
            : undefined,
          observationLevels: observationLevelOptions.map(
            (option) => option.value,
          ),
        },
        isBetaEnabled,
      });

      const snapshot = result.snapshot;
      const importIsPivot = snapshot.selectedChartType === "PIVOT_TABLE";
      // The preview version for the imported widget, re-derived from the
      // snapshot's own minVersion (not the mount's) so a v2-requiring import
      // normalizes against the right view declaration.
      const importViewVersion = resolveWidgetViewVersion({
        view: snapshot.selectedView,
        baseMinVersion: snapshot.widgetMinVersion,
        isBetaEnabled,
      });
      // Explicit user-event reset (allowed — not an effect). The imported name
      // is a non-empty override, so it sticks and does not auto-update. The
      // snapshot's filters are already in editor space, so they are seeded
      // directly (no re-normalization); the chart/aggregation/dimension shape
      // is healed via normalizeWidgetFormValues so a malformed import mounts
      // valid — the same healing the legacy import path's mount effects did.
      form.reset(
        normalizeWidgetFormValues(
          {
            name: snapshot.widgetName || null,
            description: snapshot.widgetDescription || null,
            view: snapshot.selectedView,
            filters: snapshot.userFilterState,
            metrics: importIsPivot
              ? snapshot.selectedMetrics.map((m) => ({
                  measure: m.measure,
                  aggregation: m.aggregation,
                }))
              : [
                  {
                    measure: snapshot.selectedMeasure,
                    aggregation: snapshot.selectedAggregation,
                  },
                ],
            dimensions: importIsPivot
              ? snapshot.pivotDimensions.map((field) => ({ field }))
              : snapshot.selectedDimension !== "none"
                ? [{ field: snapshot.selectedDimension }]
                : [],
            chart: {
              type: snapshot.selectedChartType,
              bins: snapshot.histogramBins,
              rowLimit: snapshot.rowLimit,
              sort:
                snapshot.defaultSortColumn !== "none"
                  ? {
                      column: snapshot.defaultSortColumn,
                      order: snapshot.defaultSortOrder,
                    }
                  : null,
            },
          },
          importViewVersion,
        ),
      );

      showSuccessToast({
        title: "Widget uploaded successfully",
        description: "Widget configuration has been loaded.",
      });

      if (result.removedValues || result.removedFilters) {
        showErrorToast(
          "Widget filters were adjusted",
          "Some imported filters or filter values were removed because they are not available in this project.",
          "WARNING",
        );
      }
    } catch {
      showMalformedImportToast();
    }
  };

  const onSubmit = form.handleSubmit((submitted) => {
    if (!queryValidation.valid) {
      showErrorToast("Invalid query", queryValidation.reason);
      return;
    }
    const s = deriveWidgetSuggestions(submitted);
    onSave(
      toSavePayload(submitted, {
        suggestedName: s.name,
        suggestedDescription: s.description,
        effectiveSort: deriveEffectiveSort(submitted),
      }) as Parameters<typeof onSave>[0],
    );
  });

  const displayName = effectiveWidgetName(values.name, suggestions.name);
  const displayDescription = effectiveWidgetName(
    values.description,
    suggestions.description,
  );

  const metricsForSort = values.metrics
    .filter((metric) => metric.measure && metric.measure !== "")
    .map((metric) => ({ id: `${metric.aggregation}_${metric.measure}` }));

  // Save is gated on schema validity + query validity; surface WHY it is
  // disabled instead of a silent greyed-out button (replaces the legacy toasts).
  const saveDisabled = !form.formState.isValid || !queryValidation.valid;
  const saveDisabledReason = !queryValidation.valid
    ? queryValidation.reason
    : (metricsError ?? dimensionsError ?? chartTypeError);

  return (
    <div className="flex h-full gap-4">
      {/* Left column - Form */}
      <div className="h-full w-1/3 min-w-[430px]">
        <Card className="flex h-full flex-col">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle>Widget Configuration</CardTitle>
              {!widgetId && isBetaEnabled && (
                <>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={handleImportWidget}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => importInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Import
                  </Button>
                </>
              )}
            </div>
            <CardDescription>
              Configure your widget by selecting data and visualization options
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 overflow-y-auto">
            {isBetaEnabled && selectedView === "traces" && (
              <Alert
                variant="default"
                className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20"
              >
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                <AlertTitle className="text-yellow-800 dark:text-yellow-400">
                  Traces view is not available in v4
                </AlertTitle>
                <AlertDescription className="text-yellow-700 dark:text-yellow-500">
                  This widget uses the traces view which is not supported in v4.
                  It will continue to use v3 definitions. To use v4, change the
                  view to observations or scores.
                </AlertDescription>
              </Alert>
            )}
            {/* Data Selection Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Data Selection</h3>
                {viewVersion === "v2" && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Sparkles className="mr-2 h-4 w-4" />
                        Presets
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-1" align="end">
                      {Object.entries(WIDGET_FILTER_PRESETS).map(
                        ([key, preset]) => (
                          <PopoverClose key={key} asChild>
                            <Button
                              className="w-full justify-start"
                              variant="ghost"
                              onClick={() => applyPreset(preset)}
                            >
                              <preset.icon className="mr-2 h-4 w-4" />
                              {preset.label}
                            </Button>
                          </PopoverClose>
                        ),
                      )}
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <ViewSelect
                control={form.control}
                ctx={ctx}
                availableViewOptions={availableViewOptions}
                onViewChange={onViewChange}
              />

              {/* Metrics Selection */}
              <div className="space-y-2">
                <Label htmlFor="metrics-select">
                  {chartType === "PIVOT_TABLE" ? "Metrics" : "Metric"}
                </Label>
                {chartType === "PIVOT_TABLE" ? (
                  <PivotMetricsField
                    control={form.control}
                    ctx={ctx}
                    error={metricsError}
                    getAvailablePivotMetrics={getAvailablePivotMetrics}
                    getAvailablePivotAggregations={
                      getAvailablePivotAggregations
                    }
                  />
                ) : (
                  <SingleMetricField
                    control={form.control}
                    ctx={ctx}
                    error={metricsError}
                    measure={selectedMeasure}
                    onMeasureChange={onMeasureChange}
                    availableMetrics={singleChartMetrics}
                    validAggregationsForMeasure={validAggregationsForMeasure}
                  />
                )}
              </div>

              <FiltersField
                control={form.control}
                filterColumns={filterColumns}
                columnsWithCustomSelect={columnsWithCustomSelect}
                unsupportedFilters={unsupportedFilters}
                unsupportedFilterColumns={unsupportedFilterColumns}
                selectedView={selectedView}
              />

              {/* Dimension Selection - Regular charts (Breakdown) */}
              {widgetChartTypeSupportsBreakdown(chartType) &&
                chartType !== "PIVOT_TABLE" && (
                  <BreakdownSelect
                    control={form.control}
                    ctx={ctx}
                    error={dimensionsError}
                    availableDimensions={availableDimensions}
                  />
                )}

              {/* Pivot Table Dimension Selection */}
              {chartType === "PIVOT_TABLE" && (
                <PivotDimensionsField
                  control={form.control}
                  ctx={ctx}
                  error={dimensionsError}
                  availableDimensions={availableDimensions}
                />
              )}

              {/* Pivot Table Default Sort Configuration */}
              {chartType === "PIVOT_TABLE" && (
                <PivotSortField
                  control={form.control}
                  effectiveSort={effectiveSort}
                  metricsForSort={metricsForSort}
                />
              )}
            </div>

            {/* Visualization Section */}
            <div className="mt-6 space-y-4">
              <h3 className="text-lg font-bold">Visualization</h3>

              <NameField control={form.control} suggestion={suggestions.name} />
              <DescriptionField
                control={form.control}
                suggestion={suggestions.description}
              />

              <ChartTypeSelect
                value={chartType}
                onChartTypeChange={onChartTypeChange}
                measureSupportsHistogram={measureSupportsHistogram}
                error={chartTypeError}
              />

              <div className="space-y-2">
                <Label htmlFor="date-select">Date Range</Label>
                <DatePickerWithRange
                  dateRange={dateRange}
                  setDateRangeAndOption={(option, range) => {
                    if (option === "custom") {
                      setDateRangeAndOption("custom", range);
                    } else {
                      setDateRangeAndOption(option, range);
                    }
                  }}
                  selectedOption={
                    (selectedOption ?? "custom") as DashboardDateRangeOptions
                  }
                  className="w-full"
                />
              </div>

              {chartType === "HISTOGRAM" && (
                <HistogramBinsField control={form.control} />
              )}

              {widgetChartTypeSupportsBreakdown(chartType) &&
                !isTimeSeriesChart(chartType) && (
                  <RowLimitField control={form.control} />
                )}
            </div>
          </CardContent>
          <CardFooter className="mt-auto flex-col items-stretch gap-2">
            {saveDisabled && saveDisabledReason && (
              <p className="text-destructive text-xs">{saveDisabledReason}</p>
            )}
            <Button
              className="w-full"
              size="lg"
              onClick={onSubmit}
              disabled={saveDisabled}
            >
              Save Widget
            </Button>
          </CardFooter>
        </Card>
      </div>
      {/* Right column - Chart */}
      <div className="w-2/3">
        <Card className="flex aspect-video flex-col">
          <CardHeader>
            <CardTitle className="truncate" title={displayName}>
              {displayName}
            </CardTitle>
            <CardDescription className="truncate" title={displayDescription}>
              {displayDescription}
            </CardDescription>
          </CardHeader>
          {!queryValidation.valid ? (
            <CardContent>
              <div className="flex h-[300px] items-center justify-center">
                <Alert variant="destructive" className="max-w-sm">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Invalid query</AlertTitle>
                  <AlertDescription>{queryValidation.reason}</AlertDescription>
                </Alert>
              </div>
            </CardContent>
          ) : queryResult.data || chartLoadingState.isLoading ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1">
                <Chart
                  chartType={chartType}
                  data={transformedData}
                  config={
                    chartPresentation
                      ? { metric: { label: chartPresentation.label } }
                      : undefined
                  }
                  rowLimit={values.chart.rowLimit}
                  chartConfig={
                    chartType === "PIVOT_TABLE"
                      ? {
                          type: chartType,
                          dimensions: pivotDimensionFields,
                          row_limit: values.chart.rowLimit,
                          metrics: values.metrics.map(
                            (metric) =>
                              `${metric.aggregation}_${metric.measure}`,
                          ),
                          units: values.metrics.map((metric) =>
                            getResultUnit(
                              selectedView,
                              metric.measure,
                              metric.aggregation,
                              viewVersion,
                            ),
                          ),
                          defaultSort: effectiveSort ?? undefined,
                        }
                      : chartType === "HISTOGRAM"
                        ? {
                            type: chartType,
                            bins: values.chart.bins,
                            unit: getResultUnit(
                              selectedView,
                              selectedMeasure,
                              selectedAggregation,
                              viewVersion,
                            ),
                          }
                        : {
                            type: chartType,
                            row_limit: values.chart.rowLimit,
                            unit: getResultUnit(
                              selectedView,
                              selectedMeasure,
                              selectedAggregation,
                              viewVersion,
                            ),
                          }
                  }
                  sortState={
                    chartType === "PIVOT_TABLE" ? previewSortState : undefined
                  }
                  onSortChange={undefined}
                  isLoading={queryResult.isPending}
                  metricFormatter={chartPresentation?.metricFormatter}
                  missingValue={getWidgetMissingBucketValue(
                    selectedAggregation,
                  )}
                />
                <ChartLoadingState
                  isLoading={chartLoadingState.isLoading}
                  showSpinner={chartLoadingState.showSpinner}
                  showHintImmediately={chartLoadingState.showHintImmediately}
                  hintText={chartLoadingState.hintText}
                  progress={loadingProgress}
                  className="bg-background/80 absolute inset-0 z-20 backdrop-blur-xs"
                />
              </div>
            </div>
          ) : (
            <CardContent>
              <div className="flex h-[300px] items-center justify-center">
                {chartLoadingState.isLoading ? (
                  <ChartLoadingState
                    isLoading={chartLoadingState.isLoading}
                    showSpinner={chartLoadingState.showSpinner}
                    showHintImmediately={chartLoadingState.showHintImmediately}
                    hintText={chartLoadingState.hintText}
                    progress={loadingProgress}
                  />
                ) : (
                  <p className="text-muted-foreground">
                    Waiting for Input / Loading...
                  </p>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Field subcomponents. Each binds exactly ONE nested field via a single
// useController and receives the read-only ctx as props. Cross-slice cascades
// are invoked through the parent-owned handlers (onViewChange, onChartTypeChange,
// onMeasureChange); no child pokes a sibling field or calls `watch`.
// -----------------------------------------------------------------------------

function ViewSelect({
  control,
  ctx,
  availableViewOptions,
  onViewChange,
}: {
  control: Control<WidgetFormValues>;
  ctx: WidgetFieldContext;
  availableViewOptions: typeof views | typeof viewsV2;
  onViewChange: (view: z.infer<typeof views>) => void;
}) {
  const { field } = useController({ control, name: "view" });
  return (
    <div className="space-y-2">
      <Label htmlFor="view-select">View</Label>
      <Select
        value={field.value}
        onValueChange={(value) => onViewChange(value as z.infer<typeof views>)}
      >
        <SelectTrigger id="view-select">
          <SelectValue placeholder="Select a view" />
        </SelectTrigger>
        <SelectContent>
          {availableViewOptions.options.map((view) => (
            <WidgetPropertySelectItem
              key={view}
              value={view}
              label={startCase(view)}
              description={viewDeclarations[ctx.viewVersion][view].description}
            />
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SingleMetricField({
  control,
  ctx,
  error,
  measure,
  onMeasureChange,
  availableMetrics,
  validAggregationsForMeasure,
}: {
  control: Control<WidgetFormValues>;
  ctx: WidgetFieldContext;
  error?: string;
  measure: string;
  onMeasureChange: (measure: string) => void;
  availableMetrics: { value: string; label: string }[];
  validAggregationsForMeasure: z.infer<typeof metricAggregations>[];
}) {
  // Owns metrics.0.aggregation; the measure is a cross-slice trigger handled by
  // the parent (onMeasureChange also resolves the chart type).
  const { field: aggField } = useController({
    control,
    name: "metrics.0.aggregation",
  });

  // THE HISTOGRAM FIX (a): the histogram aggregation is offered only on the
  // histogram chart (where it is forced and this Select is disabled). It is
  // never manually selectable on a non-histogram chart, so no silent revert.
  const aggregationOptions = validAggregationsForMeasure.filter(
    (agg) => agg !== "histogram" || ctx.chartType === "HISTOGRAM",
  );

  return (
    <div className="space-y-2">
      <Select value={measure} onValueChange={(value) => onMeasureChange(value)}>
        <SelectTrigger id="metrics-select">
          <SelectValue placeholder="Select metrics" />
        </SelectTrigger>
        <SelectContent>
          {availableMetrics.map((metric) => {
            const meta =
              viewDeclarations[ctx.viewVersion][ctx.view]?.measures?.[
                metric.value
              ];
            return (
              <WidgetPropertySelectItem
                key={metric.value}
                value={metric.value}
                label={metric.label}
                description={meta?.description}
                unit={meta?.unit}
                type={meta?.type}
              />
            );
          })}
        </SelectContent>
      </Select>
      {measure !== "count" && (
        <div className="space-y-1">
          <Select
            value={aggField.value}
            disabled={ctx.chartType === "HISTOGRAM"}
            onValueChange={(value) =>
              aggField.onChange(value as z.infer<typeof metricAggregations>)
            }
          >
            <SelectTrigger id="aggregation-select">
              <SelectValue placeholder="Select Aggregation" />
            </SelectTrigger>
            <SelectContent>
              {aggregationOptions.map((aggregation) => (
                <SelectItem key={aggregation} value={aggregation}>
                  {startCase(aggregation)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {ctx.chartType === "HISTOGRAM" && (
            <p className="text-muted-foreground text-xs">
              Aggregation is automatically set to &quot;histogram&quot; for
              histogram charts
            </p>
          )}
        </div>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function PivotMetricsField({
  control,
  ctx,
  error,
  getAvailablePivotMetrics,
  getAvailablePivotAggregations,
}: {
  control: Control<WidgetFormValues>;
  ctx: WidgetFieldContext;
  error?: string;
  getAvailablePivotMetrics: (
    index: number,
  ) => { value: string; label: string }[];
  getAvailablePivotAggregations: (
    index: number,
    measure: string,
  ) => z.infer<typeof metricAggregations>[];
}) {
  // Owns the entire `metrics` slice — one value in (field.value), one onChange
  // out (field.onChange with a fresh array).
  const { field } = useController({ control, name: "metrics" });
  const metrics = field.value;

  const updateMetric = (
    index: number,
    measure: string,
    aggregation?: z.infer<typeof metricAggregations>,
  ) => {
    const next = [...metrics];
    if (measure && measure !== "none") {
      let finalAggregation: z.infer<typeof metricAggregations>;
      if (measure === "count") {
        finalAggregation = "count";
      } else {
        const available = getAvailablePivotAggregations(index, measure);
        finalAggregation =
          aggregation && available.includes(aggregation)
            ? aggregation
            : (available[0] ?? "sum");
      }
      next[index] = { measure, aggregation: finalAggregation };
    } else {
      next.splice(index);
    }
    field.onChange(next);
  };

  const addSlot = () => {
    if (metrics.length < MAX_PIVOT_TABLE_METRICS) {
      field.onChange([...metrics, { measure: "", aggregation: "sum" }]);
    }
  };

  const removeSlot = (index: number) => {
    if (index > 0) {
      const next = [...metrics];
      next.splice(index, 1);
      field.onChange(next);
    }
  };

  return (
    <div className="space-y-3">
      {Array.from({ length: Math.max(1, metrics.length) }, (_, index) => {
        const isEnabled =
          index === 0 ||
          Boolean(metrics[index - 1] && metrics[index - 1].measure);
        const currentMetric = metrics[index];
        const currentMeasure = currentMetric?.measure || "";
        const currentAggregation = currentMetric?.aggregation || "sum";
        const metricsForIndex = getAvailablePivotMetrics(index);
        const aggregationsForIndex = getAvailablePivotAggregations(
          index,
          currentMeasure,
        );
        const canEdit = metricsForIndex.length > 0;

        return (
          <div key={index} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`pivot-metric-${index}`}>
                Metric {index + 1} {index === 0 ? "(Required)" : "(Optional)"}
              </Label>
              {index > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSlot(index)}
                  className="text-muted-foreground hover:text-destructive h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  value={currentMeasure}
                  onValueChange={(value) =>
                    updateMetric(index, value, undefined)
                  }
                  disabled={!isEnabled || !canEdit}
                >
                  <SelectTrigger id={`pivot-metric-${index}`}>
                    <SelectValue
                      placeholder={
                        !isEnabled
                          ? "Select previous metric first"
                          : !canEdit
                            ? "No more measures available"
                            : "Select measure"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {metricsForIndex.map((metric) => {
                      const meta =
                        viewDeclarations[ctx.viewVersion][ctx.view]?.measures?.[
                          metric.value
                        ];
                      return (
                        <WidgetPropertySelectItem
                          key={metric.value}
                          value={metric.value}
                          label={metric.label}
                          description={meta?.description}
                          unit={meta?.unit}
                          type={meta?.type}
                        />
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {currentMeasure && currentMeasure !== "count" && (
                <div className="flex-1">
                  <Select
                    value={currentAggregation}
                    onValueChange={(value) =>
                      updateMetric(
                        index,
                        currentMeasure,
                        value as z.infer<typeof metricAggregations>,
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select aggregation" />
                    </SelectTrigger>
                    <SelectContent>
                      {aggregationsForIndex.map((aggregation) => (
                        <SelectItem key={aggregation} value={aggregation}>
                          {startCase(aggregation)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {metrics.length < MAX_PIVOT_TABLE_METRICS &&
        getAvailablePivotMetrics(metrics.length).length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSlot}
            className="w-full"
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Metric {metrics.length + 1}
          </Button>
        )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function FiltersField({
  control,
  filterColumns,
  columnsWithCustomSelect,
  unsupportedFilters,
  unsupportedFilterColumns,
  selectedView,
}: {
  control: Control<WidgetFormValues>;
  filterColumns: ReturnType<typeof getWidgetFilterColumns>;
  columnsWithCustomSelect: ReturnType<typeof getWidgetColumnsWithCustomSelect>;
  unsupportedFilters: FilterState;
  unsupportedFilterColumns: string;
  selectedView: z.infer<typeof views>;
}) {
  const { field } = useController({ control, name: "filters" });
  return (
    <div className="space-y-2">
      <Label>Filters</Label>
      <div className="space-y-2">
        {unsupportedFilters.length > 0 && (
          <Alert
            variant="default"
            className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20"
          >
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
            <AlertTitle className="text-yellow-800 dark:text-yellow-400">
              Unsupported legacy filters
            </AlertTitle>
            <AlertDescription className="text-yellow-700 dark:text-yellow-500">
              {`This widget still contains filter columns that are not supported for ${startCase(selectedView)}: ${unsupportedFilterColumns}. Remove them or switch to a compatible view before saving.`}
            </AlertDescription>
          </Alert>
        )}
        <InlineFilterBuilder
          columns={filterColumns}
          filterState={field.value}
          onChange={(next: FilterState) => field.onChange(next)}
          columnsWithCustomSelect={columnsWithCustomSelect}
        />
      </div>
    </div>
  );
}

function BreakdownSelect({
  control,
  ctx,
  error,
  availableDimensions,
}: {
  control: Control<WidgetFormValues>;
  ctx: WidgetFieldContext;
  error?: string;
  availableDimensions: { value: string; label: string }[];
}) {
  // Owns the entire `dimensions` slice; a non-pivot chart carries at most one.
  const { field } = useController({ control, name: "dimensions" });
  const value = field.value[0]?.field ?? "none";
  return (
    <div className="space-y-2">
      <Label htmlFor="dimension-select">Breakdown Dimension (Optional)</Label>
      <Select
        value={value}
        onValueChange={(next) =>
          field.onChange(next === "none" ? [] : [{ field: next }])
        }
      >
        <SelectTrigger id="dimension-select">
          <SelectValue placeholder="Select a dimension" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {availableDimensions.map((dimension) => {
            const meta =
              viewDeclarations[ctx.viewVersion][ctx.view]?.dimensions?.[
                dimension.value
              ];
            return (
              <WidgetPropertySelectItem
                key={dimension.value}
                value={dimension.value}
                label={dimension.label}
                description={meta?.description}
                unit={meta?.unit}
                type={meta?.type}
              />
            );
          })}
        </SelectContent>
      </Select>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function PivotDimensionsField({
  control,
  ctx,
  error,
  availableDimensions,
}: {
  control: Control<WidgetFormValues>;
  ctx: WidgetFieldContext;
  error?: string;
  availableDimensions: { value: string; label: string }[];
}) {
  const { field } = useController({ control, name: "dimensions" });
  const pivotDimensions = field.value.map((d) => d.field);

  const updateDimension = (index: number, value: string) => {
    const next = [...pivotDimensions];
    if (value && value !== "none") {
      next[index] = value;
    } else {
      next.splice(index);
    }
    field.onChange(next.map((f) => ({ field: f })));
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-2 text-sm font-bold">Row Dimensions</h4>
        <p className="text-muted-foreground mb-3 text-xs">
          Configure up to {MAX_PIVOT_TABLE_DIMENSIONS} dimensions for pivot
          table rows. Each dimension creates groupings with subtotals.
        </p>
      </div>

      {Array.from({ length: MAX_PIVOT_TABLE_DIMENSIONS }, (_, index) => {
        const isEnabled = index === 0 || Boolean(pivotDimensions[index - 1]);
        const selectedDimensions = pivotDimensions.slice(0, index);
        const currentValue = pivotDimensions[index] || "";

        return (
          <div key={index} className="space-y-2">
            <Label htmlFor={`pivot-dimension-${index}`}>
              Dimension {index + 1} (Optional)
            </Label>
            <Select
              value={currentValue}
              onValueChange={(value) => updateDimension(index, value)}
              disabled={!isEnabled}
            >
              <SelectTrigger id={`pivot-dimension-${index}`}>
                <SelectValue
                  placeholder={
                    isEnabled
                      ? "Select a dimension"
                      : "Select previous dimension first"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {availableDimensions
                  .filter((d) => !selectedDimensions.includes(d.value))
                  .map((dimension) => {
                    const meta =
                      viewDeclarations[ctx.viewVersion][ctx.view]?.dimensions?.[
                        dimension.value
                      ];
                    return (
                      <WidgetPropertySelectItem
                        key={dimension.value}
                        value={dimension.value}
                        label={dimension.label}
                        description={meta?.description}
                        unit={meta?.unit}
                        type={meta?.type}
                      />
                    );
                  })}
              </SelectContent>
            </Select>
          </div>
        );
      })}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function PivotSortField({
  control,
  effectiveSort,
  metricsForSort,
}: {
  control: Control<WidgetFormValues>;
  effectiveSort: SortField | undefined;
  metricsForSort: { id: string }[];
}) {
  // Owns chart.sort; the DISPLAY value is always the sanitized effectiveSort so
  // a stale sort column shows as "no default sort" without any write-back.
  const { field } = useController({ control, name: "chart.sort" });
  const column = effectiveSort?.column ?? "none";
  const order = effectiveSort?.order ?? "DESC";

  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-2 text-sm font-bold">Default Sort Configuration</h4>
        <p className="text-muted-foreground mb-3 text-xs">
          Configure the default sort order for the pivot table. This will be
          applied when the widget is first loaded.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="default-sort-column">Sort Column</Label>
          <Select
            value={column}
            onValueChange={(next) =>
              field.onChange(next === "none" ? null : { column: next, order })
            }
          >
            <SelectTrigger id="default-sort-column">
              <SelectValue placeholder="Select a column to sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No default sort</SelectItem>
              {metricsForSort.map((metric) => (
                <SelectItem key={metric.id} value={metric.id}>
                  {formatMetricName(metric.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="default-sort-order">Sort Order</Label>
          <Select
            value={order}
            onValueChange={(value: "ASC" | "DESC") =>
              field.onChange({ column, order: value })
            }
            disabled={column === "none"}
          >
            <SelectTrigger id="default-sort-order">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ASC">Ascending (A-Z)</SelectItem>
              <SelectItem value="DESC">Descending (Z-A)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

/**
 * NameField / DescriptionField isolate the "override vs. live suggestion"
 * presentation. The field value is the user's override; a blank (null) override
 * shows the live-derived suggestion as the input's value (today's behaviour —
 * pre-filled, live-updating until the user edits, then it sticks). The whole
 * placeholder decision lives here, so switching to a grey-placeholder variant
 * later is a one-component change.
 */
function NameField({
  control,
  suggestion,
}: {
  control: Control<WidgetFormValues>;
  suggestion: string;
}) {
  const { field } = useController({ control, name: "name" });
  return (
    <div className="space-y-2">
      <Label htmlFor="widget-name">Name</Label>
      <Input
        id="widget-name"
        // blank override (null OR "") shows the live suggestion; typing sticks,
        // clearing reverts to tracking + saving the live suggestion.
        value={field.value || suggestion}
        onChange={(e) => field.onChange(e.target.value)}
        placeholder="Enter widget name"
      />
    </div>
  );
}

function DescriptionField({
  control,
  suggestion,
}: {
  control: Control<WidgetFormValues>;
  suggestion: string;
}) {
  const { field } = useController({ control, name: "description" });
  return (
    <div className="space-y-2">
      <Label htmlFor="widget-description">Description</Label>
      <Input
        id="widget-description"
        value={field.value || suggestion}
        onChange={(e) => field.onChange(e.target.value)}
        placeholder="Enter widget description"
      />
    </div>
  );
}

function ChartTypeSelect({
  value,
  onChartTypeChange,
  measureSupportsHistogram,
  error,
}: {
  value: DashboardWidgetChartType;
  onChartTypeChange: (type: DashboardWidgetChartType) => void;
  measureSupportsHistogram: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="chart-type-select">Chart Type</Label>
      <Select
        value={value}
        onValueChange={(next) =>
          onChartTypeChange(next as DashboardWidgetChartType)
        }
      >
        <SelectTrigger id="chart-type-select">
          <SelectValue placeholder="Select a chart type" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Time Series</SelectLabel>
            {chartTypes
              .filter((item) => item.group === "time-series")
              .map((chart) => (
                <SelectItem key={chart.value} value={chart.value}>
                  <div className="flex items-center">
                    {React.createElement(chart.icon, { className: "mr-2 w-4" })}
                    <span>{chart.name}</span>
                  </div>
                </SelectItem>
              ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Total Value</SelectLabel>
            {chartTypes
              .filter((item) => item.group === "total-value")
              .map((chart) => (
                <SelectItem
                  key={chart.value}
                  value={chart.value}
                  disabled={
                    chart.value === "HISTOGRAM" && !measureSupportsHistogram
                  }
                >
                  <div className="flex items-center">
                    {React.createElement(chart.icon, { className: "mr-2 w-4" })}
                    <span>{chart.name}</span>
                  </div>
                </SelectItem>
              ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function HistogramBinsField({
  control,
}: {
  control: Control<WidgetFormValues>;
}) {
  const { field } = useController({ control, name: "chart.bins" });
  return (
    <div className="space-y-2">
      <Label htmlFor="histogram-bins">Number of Bins (1-100)</Label>
      <Input
        id="histogram-bins"
        type="number"
        min={1}
        max={100}
        value={field.value}
        onChange={(e) => {
          const value = parseInt(e.target.value);
          if (!isNaN(value) && value >= 1 && value <= 100) {
            field.onChange(value);
          }
        }}
        placeholder="Enter number of bins (1-100)"
      />
    </div>
  );
}

function RowLimitField({ control }: { control: Control<WidgetFormValues> }) {
  const { field } = useController({ control, name: "chart.rowLimit" });
  return (
    <div className="space-y-2">
      <Label htmlFor="row-limit">Breakdown Row Limit (0-1000)</Label>
      <Input
        id="row-limit"
        type="number"
        min={0}
        max={1000}
        value={field.value}
        onChange={(e) => {
          const value = parseInt(e.target.value);
          if (!isNaN(value) && value >= 0 && value <= 1000) {
            field.onChange(value);
          }
        }}
        placeholder="Enter breakdown row limit (0-1000)"
      />
    </div>
  );
}
