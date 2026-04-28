import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/src/components/ui/card";
import { api } from "@/src/utils/api";
import {
  type metricAggregations,
  getValidAggregationsForMeasureType,
  type QueryType,
  mapWidgetUiTableFilterToView,
  normalizeStoredWidgetFiltersForEditor,
  partitionWidgetUiTableFiltersToView,
} from "@/src/features/query";
import React, { useState, useMemo, useEffect, useRef } from "react";
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
import { viewDeclarations, requiresV2 } from "@/src/features/query/dataModel";
import { type z } from "zod";
import { views, viewsV2 } from "@/src/features/query/types";
import { type ViewVersion } from "@/src/features/query";
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
import { type FilterState } from "@langfuse/shared";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import {
  validateQuery,
  isV2BreakdownChart,
  buildWidgetOrderBy,
} from "@/src/features/query/validateQuery";
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
} from "lucide-react";
import {
  buildWidgetName,
  buildWidgetDescription,
  formatMetricName,
  sanitizePivotTableDefaultSort,
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

type ChartType = {
  group: "time-series" | "total-value";
  name: string;
  value: DashboardWidgetChartType;
  icon: React.ElementType;
  supportsBreakdown: boolean;
};

import { type WidgetChartConfig } from "@/src/features/widgets/utils";

type ChartConfig = WidgetChartConfig;

const chartTypes: ChartType[] = [
  {
    group: "total-value",
    name: "Big Number",
    value: "NUMBER",
    icon: Hash,
    supportsBreakdown: false,
  },
  {
    group: "time-series",
    name: "Line Chart",
    value: "LINE_TIME_SERIES",
    icon: LineChart,
    supportsBreakdown: true,
  },
  {
    group: "time-series",
    name: "Vertical Bar Chart",
    value: "BAR_TIME_SERIES",
    icon: BarChart,
    supportsBreakdown: true,
  },
  {
    group: "total-value",
    name: "Horizontal Bar Chart",
    value: "HORIZONTAL_BAR",
    icon: BarChartHorizontal,
    supportsBreakdown: true,
  },
  {
    group: "total-value",
    name: "Vertical Bar Chart",
    value: "VERTICAL_BAR",
    icon: BarChart,
    supportsBreakdown: true,
  },
  {
    group: "total-value",
    name: "Histogram",
    value: "HISTOGRAM",
    icon: BarChart3,
    supportsBreakdown: false,
  },
  {
    group: "total-value",
    name: "Pie Chart",
    value: "PIE",
    icon: PieChart,
    supportsBreakdown: true,
  },
  {
    group: "total-value",
    name: "Pivot Table",
    value: "PIVOT_TABLE",
    icon: Table,
    supportsBreakdown: true,
  },
];

/**
 * Pure function that resolves the correct aggregation and chart type given the
 * current selections and valid aggregation list. Returns null when no change is
 * needed.
 *
 * All constraints are resolved in a single pass so the output is a fixed point
 * (running the function again on its own output always returns null). This
 * prevents infinite React state-update loops when constraints conflict — e.g.
 * HISTOGRAM requires "histogram" aggregation but "count" measure forces "count".
 */
export function resolveAggregationAndChartType(params: {
  chartType: string;
  measure: string;
  currentAgg: string;
  validAggs: z.infer<typeof metricAggregations>[];
}): {
  aggregation?: z.infer<typeof metricAggregations>;
  chartType?: string;
} | null {
  const { chartType, measure, currentAgg, validAggs } = params;
  const supportsHistogram = validAggs.includes("histogram");

  let targetChart = chartType;
  let targetAgg = currentAgg as z.infer<typeof metricAggregations>;

  // HISTOGRAM chart needs a histogram-compatible measure
  if (targetChart === "HISTOGRAM") {
    if (!supportsHistogram) {
      targetChart = "NUMBER";
    } else {
      targetAgg = "histogram";
    }
  }

  // Non-HISTOGRAM chart can't keep histogram aggregation
  if (targetChart !== "HISTOGRAM" && targetAgg === "histogram") {
    targetAgg =
      measure === "count"
        ? "count"
        : ((validAggs[0] ?? "sum") as z.infer<typeof metricAggregations>);
  }

  // "count" measure only supports "count" aggregation. If this conflicts with
  // the chart type (e.g. HISTOGRAM requires "histogram"), bail the chart type
  // rather than creating an unresolvable conflict.
  if (measure === "count" && targetAgg !== "count") {
    if (targetChart === "HISTOGRAM") {
      targetChart = "NUMBER";
    }
    targetAgg = "count";
  }

  // Current aggregation not valid for the measure type
  if (!validAggs.includes(targetAgg)) {
    targetAgg = (validAggs[0] ?? "count") as z.infer<typeof metricAggregations>;
  }

  // Only return if something changed
  const result: {
    aggregation?: z.infer<typeof metricAggregations>;
    chartType?: string;
  } = {};
  if (targetChart !== chartType) result.chartType = targetChart;
  if (targetAgg !== currentAgg) result.aggregation = targetAgg;

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Interface for representing a selected metric combination
 * Combines measure and aggregation into a single selectable entity
 */
interface SelectedMetric {
  /** Unique identifier for this metric combination */
  id: string;
  /** The measure field name (e.g., "count", "latency") */
  measure: string;
  /** The aggregation method (e.g., "sum", "avg", "count") */
  aggregation: z.infer<typeof metricAggregations>;
  /** Display label for the metric */
  label: string;
}

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
    chartConfig?: ChartConfig;
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
    chartConfig: ChartConfig;
    minVersion: number;
  }) => void;
  widgetId?: string;
}) {
  const { isBetaEnabled } = useV4Beta();

  // State for form fields
  const [widgetName, setWidgetName] = useState<string>(initialValues.name);
  const [widgetDescription, setWidgetDescription] = useState<string>(
    initialValues.description,
  );

  // Determine if this is an existing widget (editing mode)
  const isExistingWidget = Boolean(widgetId);

  // Disables further auto-updates once the user edits name or description
  const [autoLocked, setAutoLocked] = useState<boolean>(isExistingWidget);

  const [selectedView, setSelectedView] = useState<z.infer<typeof views>>(
    initialValues.view,
  );

  // Form definitions follow beta toggle, or v2 if widget already requires it.
  // Traces view is excluded from beta-v2 because it has no v2-only fields.
  const initialWidgetRequiresV2 = requiresV2({
    view: initialValues.view,
    dimensions:
      initialValues.dimensions ??
      (initialValues.dimension && initialValues.dimension !== "none"
        ? [{ field: initialValues.dimension }]
        : []),
    measures: initialValues.metrics?.map((metric) => ({
      measure: metric.measure,
    })) ?? [{ measure: initialValues.measure }],
    filters: initialValues.filters ?? [],
  });
  const viewVersion: ViewVersion =
    (isBetaEnabled && selectedView !== "traces") ||
    (initialValues.minVersion ?? 1) >= 2 ||
    initialWidgetRequiresV2
      ? "v2"
      : "v1";
  const availableViewOptions = viewVersion === "v2" ? viewsV2 : views;

  // For regular charts: single metric selection
  const [selectedMeasure, setSelectedMeasure] = useState<string>(
    initialValues.measure,
  );
  const [selectedAggregation, setSelectedAggregation] = useState<
    z.infer<typeof metricAggregations>
  >(initialValues.aggregation);

  // For pivot tables: multiple metrics selection
  const [selectedMetrics, setSelectedMetrics] = useState<SelectedMetric[]>(
    initialValues.chartType === "PIVOT_TABLE" && initialValues.metrics?.length
      ? // Initialize from complete metrics data (editing mode)
        initialValues.metrics.map((metric) => ({
          id: `${metric.agg}_${metric.measure}`,
          measure: metric.measure,
          aggregation: metric.agg as z.infer<typeof metricAggregations>,
          label: `${startCase(metric.agg)} ${startCase(metric.measure)}`,
        }))
      : // Default to single metric (new widget)
        [
          {
            id: `${initialValues.aggregation}_${initialValues.measure}`,
            measure: initialValues.measure,
            aggregation: initialValues.aggregation,
            label: `${startCase(initialValues.aggregation)} ${startCase(initialValues.measure)}`,
          },
        ],
  );

  const [selectedDimension, setSelectedDimension] = useState<string>(
    initialValues.dimension,
  );

  const selectedViewRef = useRef(selectedView);
  selectedViewRef.current = selectedView;

  // Pivot table dimensions state (for PIVOT_TABLE chart type)
  const [pivotDimensions, setPivotDimensions] = useState<string[]>(
    initialValues.chartType === "PIVOT_TABLE" &&
      initialValues.dimensions?.length
      ? // Initialize from complete dimensions data (editing mode)
        initialValues.dimensions.map((dim) => dim.field)
      : // Default to empty array (new widget)
        [],
  );

  const [selectedChartType, setSelectedChartType] = useState<string>(
    initialValues.chartType,
  );
  const initialDefaultSort =
    initialValues.chartType === "PIVOT_TABLE"
      ? sanitizePivotTableDefaultSort(initialValues.chartConfig?.defaultSort, {
          dimensions: initialValues.dimensions ?? [],
          metrics:
            initialValues.metrics ??
            (initialValues.measure && initialValues.aggregation
              ? [
                  {
                    measure: initialValues.measure,
                    agg: initialValues.aggregation,
                  },
                ]
              : []),
        })
      : undefined;
  const [rowLimit, setRowLimit] = useState<number>(
    initialValues.chartConfig?.row_limit ?? 100,
  );
  const [histogramBins, setHistogramBins] = useState<number>(
    initialValues.chartConfig?.bins ?? 10,
  );

  // Default sort configuration for pivot tables
  const [defaultSortColumn, setDefaultSortColumn] = useState<string>(
    initialDefaultSort?.column ?? "none",
  );
  const [defaultSortOrder, setDefaultSortOrder] = useState<"ASC" | "DESC">(
    initialDefaultSort?.order ?? "DESC",
  );

  // Filter state
  const { timeRange, setTimeRange } = useDashboardDateRange({
    defaultRelativeAggregation: "last7Days",
  });

  // Convert timeRange to absolute date range for compatibility
  const dateRange = useMemo(() => {
    return toAbsoluteTimeRange(timeRange) ?? undefined;
  }, [timeRange]);

  // Convert timeRange to legacy format for DatePickerWithRange compatibility
  const selectedOption = useMemo(() => {
    if ("range" in timeRange) {
      return timeRange.range;
    }
    return "custom" as const;
  }, [timeRange]);

  const setDateRangeAndOption = (
    option: DashboardDateRangeOptions,
    range?: { from: Date; to: Date },
  ) => {
    if (option === "custom") {
      if (range) {
        setTimeRange({
          from: range.from,
          to: range.to,
        });
      }
    } else {
      setTimeRange({ range: option });
    }
  };
  const [userFilterState, setUserFilterState] = useState<FilterState>(
    () =>
      normalizeStoredWidgetFiltersForEditor(
        initialValues.view,
        initialValues.filters ?? [],
      ).editorFilters,
  );
  const unsupportedFilters = useMemo(
    () =>
      partitionWidgetUiTableFiltersToView(selectedView, userFilterState)
        .unsupportedFilters,
    [selectedView, userFilterState],
  );
  const unsupportedFilterColumns = useMemo(
    () =>
      Array.from(
        new Set(unsupportedFilters.map((filter) => filter.column)),
      ).join(", "),
    [unsupportedFilters],
  );
  const normalizedUserFilters = useMemo(
    () => mapWidgetUiTableFilterToView(selectedView, userFilterState),
    [selectedView, userFilterState],
  );

  // When beta is toggled on while "traces" is selected (and not editing an
  // existing widget), auto-switch to "observations" and reset dependent fields.
  // selectedView is read via ref to avoid re-triggering on view changes.
  useEffect(() => {
    if (
      isBetaEnabled &&
      selectedViewRef.current === "traces" &&
      !isExistingWidget
    ) {
      setSelectedView("observations");
      setSelectedMeasure("count");
      setSelectedAggregation("count");
      setSelectedDimension("none");
      setPivotDimensions([]);
      setSelectedMetrics([
        {
          id: "count_count",
          measure: "count",
          aggregation: "count" as z.infer<typeof metricAggregations>,
          label: "Count Count",
        },
      ]);
      setUserFilterState([]);
    }
  }, [isBetaEnabled, isExistingWidget]);

  // Static sort state for pivot table preview (non-interactive)
  const previewSortState = useMemo(
    () =>
      selectedChartType === "PIVOT_TABLE" &&
      defaultSortColumn &&
      defaultSortColumn !== "none"
        ? { column: defaultSortColumn, order: defaultSortOrder }
        : null,
    [selectedChartType, defaultSortColumn, defaultSortOrder],
  );

  useEffect(() => {
    if (selectedChartType !== "PIVOT_TABLE") return;

    // Old widgets can carry persisted default sort keys for metrics or
    // dimensions that are no longer part of the pivot query. Clear those stale
    // sort columns so preview/save do not send invalid orderBy fields.
    const sanitizedDefaultSort = sanitizePivotTableDefaultSort(
      defaultSortColumn !== "none"
        ? { column: defaultSortColumn, order: defaultSortOrder }
        : undefined,
      {
        dimensions: pivotDimensions
          .filter((field) => field && field !== "none")
          .map((field) => ({ field })),
        metrics: selectedMetrics
          .filter((metric) => metric.measure && metric.measure !== "")
          .map((metric) => ({
            measure: metric.measure,
            agg: metric.aggregation,
          })),
      },
    );

    if (defaultSortColumn !== "none" && !sanitizedDefaultSort) {
      setDefaultSortColumn("none");
      setDefaultSortOrder("DESC");
    }
  }, [
    defaultSortColumn,
    defaultSortOrder,
    pivotDimensions,
    selectedMetrics,
    selectedChartType,
    setDefaultSortColumn,
    setDefaultSortOrder,
  ]);

  // Helper function to update pivot table dimensions
  const updatePivotDimension = (index: number, value: string) => {
    const newDimensions = [...pivotDimensions];
    if (value && value !== "none") {
      // Set the dimension at the specified index
      newDimensions[index] = value;
    } else {
      // Clear this dimension and all subsequent ones
      newDimensions.splice(index);
    }
    setPivotDimensions(newDimensions);
  };

  // Helper function for updating pivot table metrics
  const updatePivotMetric = (
    index: number,
    measure: string,
    aggregation?: z.infer<typeof metricAggregations>,
  ) => {
    const newMetrics = [...selectedMetrics];

    if (measure && measure !== "none") {
      let finalAggregation: z.infer<typeof metricAggregations>;

      if (measure === "count") {
        finalAggregation = "count";
      } else {
        // Get available aggregations for this measure at this index
        const availableAggregations = getAvailableAggregations(index, measure);

        if (aggregation && availableAggregations.includes(aggregation)) {
          // Use provided aggregation if it's available
          finalAggregation = aggregation as z.infer<typeof metricAggregations>;
        } else {
          // Use the first available aggregation as default
          finalAggregation =
            availableAggregations.length > 0
              ? availableAggregations[0]
              : ("sum" as z.infer<typeof metricAggregations>);
        }
      }

      const newMetric: SelectedMetric = {
        id: `${finalAggregation}_${measure}`,
        measure: measure,
        aggregation: finalAggregation as z.infer<typeof metricAggregations>,
        label: `${startCase(finalAggregation)} ${startCase(measure)}`,
      };

      // Set the metric at the specified index
      newMetrics[index] = newMetric;
    } else {
      // Clear this metric and all subsequent ones
      newMetrics.splice(index);
    }

    setSelectedMetrics(newMetrics);
  };

  // Add a new empty metric slot
  const addNewMetricSlot = () => {
    if (selectedMetrics.length < MAX_PIVOT_TABLE_METRICS) {
      const newMetrics = [...selectedMetrics];
      newMetrics.push({
        id: `temp_${selectedMetrics.length}`,
        measure: "",
        aggregation: "sum" as z.infer<typeof metricAggregations>,
        label: "",
      });
      setSelectedMetrics(newMetrics);
    }
  };

  // Remove a metric slot and roll up subsequent ones
  const removeMetricSlot = (index: number) => {
    if (index > 0) {
      // Can't remove the first metric (it's required)
      const newMetrics = [...selectedMetrics];
      newMetrics.splice(index, 1); // Remove only the metric at this index
      setSelectedMetrics(newMetrics);
    }
  };

  const traceFilterOptions = api.traces.filterOptions.useQuery(
    {
      projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const generationsFilterOptions = api.generations.filterOptions.useQuery(
    {
      projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      {
        projectId,
        fromTimestamp: dateRange?.from,
      },
      {
        trpc: {
          context: {
            skipBatch: true,
          },
        },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );
  const environmentOptions =
    environmentFilterOptions.data?.map((value) => ({
      value: value.environment,
    })) || [];
  const nameOptions = normalizeSingleValueOptions(
    traceFilterOptions.data?.name,
  );
  const tagsOptions = traceFilterOptions.data?.tags || [];
  const modelOptions = generationsFilterOptions.data?.model || [];
  const toolNamesOptions = generationsFilterOptions.data?.toolNames || [];
  const calledToolNamesOptions =
    generationsFilterOptions.data?.calledToolNames || [];
  const observationLevelOptions = [
    { value: "DEBUG" },
    { value: "DEFAULT" },
    { value: "WARNING" },
    { value: "ERROR" },
  ];

  const filterColumns = getWidgetFilterColumns({
    selectedView,
    viewVersion,
    environmentOptions,
    nameOptions,
    tagsOptions,
    modelOptions,
    toolNamesOptions,
    calledToolNamesOptions,
    observationLevelOptions,
  });
  const columnsWithCustomSelect = getWidgetColumnsWithCustomSelect({
    selectedView,
    viewVersion,
    environmentOptions,
    nameOptions,
    tagsOptions,
    modelOptions,
    toolNamesOptions,
    calledToolNamesOptions,
    observationLevelOptions,
  });

  // When chart type does not support breakdown, wipe the breakdown dimension
  useEffect(() => {
    if (
      chartTypes.find((c) => c.value === selectedChartType)
        ?.supportsBreakdown === false &&
      selectedDimension !== "none"
    ) {
      setSelectedDimension("none");
    }
  }, [selectedChartType, selectedDimension]);

  // Reset pivot dimensions when switching away from PIVOT_TABLE
  useEffect(() => {
    if (selectedChartType !== "PIVOT_TABLE" && pivotDimensions.length > 0) {
      setPivotDimensions([]);
    }
  }, [selectedChartType, pivotDimensions.length]);

  // Reset multiple metrics when switching away from PIVOT_TABLE
  useEffect(() => {
    if (selectedChartType !== "PIVOT_TABLE" && selectedMetrics.length > 1) {
      // Keep only the first metric for non-pivot charts
      setSelectedMetrics(selectedMetrics.slice(0, 1));
    }
  }, [selectedChartType, selectedMetrics]);

  // Resolve valid aggregations for the currently selected measure
  const validAggregationsForMeasure = useMemo(() => {
    const measureType =
      viewDeclarations[viewVersion][selectedView]?.measures?.[selectedMeasure]
        ?.type;
    return getValidAggregationsForMeasureType(measureType);
  }, [viewVersion, selectedView, selectedMeasure]);

  const measureSupportsHistogram =
    validAggregationsForMeasure.includes("histogram") &&
    selectedMeasure !== "count";

  // Sync aggregation and chart type when selections change
  useEffect(() => {
    const resolved = resolveAggregationAndChartType({
      chartType: selectedChartType,
      measure: selectedMeasure,
      currentAgg: selectedAggregation,
      validAggs: validAggregationsForMeasure,
    });
    if (!resolved) return;
    if (resolved.chartType) setSelectedChartType(resolved.chartType);
    if (resolved.aggregation) {
      setSelectedAggregation(resolved.aggregation);
    }
  }, [
    selectedMeasure,
    selectedAggregation,
    selectedChartType,
    validAggregationsForMeasure,
  ]);

  // Get available metrics for the selected view
  const availableMetrics = useMemo(() => {
    const viewDeclaration = viewDeclarations[viewVersion][selectedView];

    // For pivot tables, only show measures that still have available aggregations
    if (selectedChartType === "PIVOT_TABLE") {
      return Object.entries(viewDeclaration.measures)
        .filter(([measureKey]) => {
          // For count, there's only one aggregation option
          if (measureKey === "count") {
            return !selectedMetrics.some((m) => m.measure === "count");
          }

          // For other measures, check if there are any aggregations left
          const selectedAggregationsForMeasure = selectedMetrics
            .filter((m) => m.measure === measureKey)
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
        .map(([key]) => ({
          value: key,
          label: startCase(key),
        }))
        .sort((a, b) =>
          a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
        );
    }

    // For regular charts, show all metrics
    return Object.entries(viewDeclaration.measures)
      .map(([key]) => ({
        value: key,
        label: startCase(key),
      }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
      );
  }, [selectedView, selectedChartType, selectedMetrics, viewVersion]);

  // Get available aggregations for a specific metric index in pivot tables
  const getAvailableAggregations = (
    metricIndex: number,
    measureKey: string,
  ): z.infer<typeof metricAggregations>[] => {
    const measureType =
      viewDeclarations[viewVersion][selectedView]?.measures?.[measureKey]?.type;
    const validAggs = getValidAggregationsForMeasureType(measureType);
    if (selectedChartType === "PIVOT_TABLE" && measureKey) {
      return validAggs.filter(
        (agg) =>
          !selectedMetrics.some(
            (m, idx) =>
              idx !== metricIndex &&
              m.measure === measureKey &&
              m.aggregation === agg,
          ),
      ) as z.infer<typeof metricAggregations>[];
    }
    return validAggs as z.infer<typeof metricAggregations>[];
  };

  // Get available metrics for a specific metric index in pivot tables
  const getAvailableMetrics = (metricIndex: number) => {
    if (selectedChartType === "PIVOT_TABLE") {
      const viewDeclaration = viewDeclarations[viewVersion][selectedView];
      return Object.entries(viewDeclaration.measures)
        .filter(([measureKey]) => {
          // For count, there's only one aggregation option
          if (measureKey === "count") {
            return !selectedMetrics.some(
              (m, idx) => idx !== metricIndex && m.measure === "count",
            );
          }

          // For other measures, check if there are any aggregations left
          const selectedAggregationsForMeasure = selectedMetrics
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
        .map(([key]) => ({
          value: key,
          label: startCase(key),
        }))
        .sort((a, b) =>
          a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
        );
    }
    return availableMetrics;
  };

  // Get available dimensions for the selected view
  const availableDimensions = useMemo(() => {
    const viewDeclaration = viewDeclarations[viewVersion][selectedView];
    return Object.entries(viewDeclaration.dimensions)
      .filter(([_, dim]) => !dim.uiHidden)
      .map(([key]) => ({
        value: key,
        label: startCase(key),
      }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
      );
  }, [selectedView, viewVersion]);

  // Create a dynamic query based on the selected view
  const query = useMemo<QueryType>(() => {
    // Calculate fromTimestamp and toTimestamp from dateRange
    const fromTimestamp = dateRange
      ? dateRange.from
      : new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000); // Default to last 7 days
    const toTimestamp = dateRange ? dateRange.to : new Date();

    // Determine dimensions based on chart type
    const queryDimensions =
      selectedChartType === "PIVOT_TABLE"
        ? pivotDimensions.map((field) => ({ field }))
        : selectedDimension !== "none"
          ? [{ field: selectedDimension }]
          : [];

    // Determine metrics based on chart type
    const queryMetrics =
      selectedChartType === "PIVOT_TABLE"
        ? selectedMetrics
            .filter((metric) => metric.measure && metric.measure !== "")
            .map((metric) => ({
              measure: metric.measure,
              aggregation: metric.aggregation,
            }))
        : [
            {
              measure: selectedMeasure,
              aggregation: selectedAggregation,
            },
          ];

    // For v2 non-timeseries breakdown charts, auto-sort desc by metric for top-N
    const needsTopN = isV2BreakdownChart({
      version: viewVersion,
      hasDimension: selectedDimension !== "none",
      isTimeSeries: isTimeSeriesChart(
        selectedChartType as DashboardWidgetChartType,
      ),
      chartType: selectedChartType,
    });

    const orderBy = buildWidgetOrderBy({
      chartType: selectedChartType,
      sortState: previewSortState,
      needsTopN,
      firstMetric: {
        aggregation: selectedAggregation,
        measure: selectedMeasure,
      },
    });

    // Only query-engine fields (type, bins, row_limit) — rendering fields
    // (dimensions, defaultSort) go via handleSaveWidget / Chart component
    let chartConfig: QueryType["chartConfig"];
    if (selectedChartType === "HISTOGRAM") {
      chartConfig = { type: selectedChartType, bins: histogramBins };
    } else if (selectedChartType === "PIVOT_TABLE" || needsTopN) {
      chartConfig = { type: selectedChartType, row_limit: rowLimit };
    } else {
      chartConfig = { type: selectedChartType };
    }

    return {
      view: selectedView,
      dimensions: queryDimensions,
      metrics: queryMetrics,
      filters: [...normalizedUserFilters],
      timeDimension: isTimeSeriesChart(
        selectedChartType as DashboardWidgetChartType,
      )
        ? { granularity: "auto" }
        : null,
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
      orderBy,
      chartConfig,
    };
  }, [
    selectedView,
    selectedDimension,
    selectedAggregation,
    selectedMeasure,
    selectedMetrics,
    dateRange,
    selectedChartType,
    histogramBins,
    pivotDimensions,
    rowLimit,
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
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      meta: {
        silentHttpCodes: [422],
      },
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

  // Transform the query results to a consistent format for charts
  const transformedData: DataPoint[] = useMemo(
    () =>
      queryResult.data?.map((item: any) => {
        if (selectedChartType === "PIVOT_TABLE") {
          // For pivot tables, preserve all raw data fields
          // The PivotTable component will extract the appropriate metric fields
          return {
            dimension:
              pivotDimensions.length > 0 ? pivotDimensions[0] : "dimension", // Fallback for compatibility
            metric: 0, // Placeholder - not used for pivot tables
            time_dimension: item["time_dimension"],
            // Include all original query fields for pivot table processing
            ...item,
          };
        } else {
          // Regular chart processing
          const metricField = `${selectedAggregation}_${selectedMeasure}`;
          const metric = item[metricField];
          const dimensionField = selectedDimension;
          return {
            dimension:
              item[dimensionField] !== undefined && dimensionField !== "none"
                ? (() => {
                    const val = item[dimensionField];
                    if (typeof val === "string") return val;
                    if (val === null || val === undefined || val === "")
                      return "n/a";
                    if (Array.isArray(val)) return val.join(", ");
                    return String(val);
                  })()
                : formatMetricName(metricField),
            metric: Array.isArray(metric) ? metric : Number(metric || 0),
            time_dimension: item["time_dimension"],
          };
        }
      }) ?? [],
    [
      queryResult.data,
      selectedAggregation,
      selectedDimension,
      selectedMeasure,
      selectedChartType,
      pivotDimensions,
    ],
  );

  const handleSaveWidget = () => {
    if (!queryValidation.valid) {
      showErrorToast("Invalid query", queryValidation.reason);
      return;
    }

    if (!widgetName.trim()) {
      showErrorToast("Error", "Widget name is required");
      return;
    }

    // Validate pivot table requirements
    const validMetrics = selectedMetrics.filter(
      (m) => m.measure && m.measure !== "",
    );
    if (selectedChartType === "PIVOT_TABLE" && validMetrics.length === 0) {
      showErrorToast(
        "Error",
        "At least one metric is required for pivot tables",
      );
      return;
    }

    const saveDimensions =
      selectedChartType === "PIVOT_TABLE"
        ? pivotDimensions.map((field) => ({ field }))
        : selectedDimension !== "none"
          ? [{ field: selectedDimension }]
          : [];
    const saveMetrics =
      selectedChartType === "PIVOT_TABLE"
        ? validMetrics.map((metric) => ({
            measure: metric.measure,
            agg: metric.aggregation,
          }))
        : [
            {
              measure: selectedMeasure,
              agg: selectedAggregation,
            },
          ];

    onSave({
      name: widgetName,
      description: widgetDescription,
      view: selectedView,
      dimensions: saveDimensions,
      metrics: saveMetrics,
      filters: normalizedUserFilters,
      chartType: selectedChartType as DashboardWidgetChartType,
      chartConfig: isTimeSeriesChart(
        selectedChartType as DashboardWidgetChartType,
      )
        ? { type: selectedChartType as DashboardWidgetChartType }
        : selectedChartType === "HISTOGRAM"
          ? {
              type: selectedChartType as DashboardWidgetChartType,
              bins: histogramBins,
            }
          : selectedChartType === "PIVOT_TABLE"
            ? {
                type: selectedChartType as DashboardWidgetChartType,
                row_limit: rowLimit,
                defaultSort:
                  defaultSortColumn && defaultSortColumn !== "none"
                    ? {
                        column: defaultSortColumn,
                        order: defaultSortOrder,
                      }
                    : undefined,
              }
            : {
                type: selectedChartType as DashboardWidgetChartType,
                row_limit: rowLimit,
              },
      minVersion: requiresV2({
        view: selectedView,
        dimensions: saveDimensions,
        measures: saveMetrics.map((m) => ({ measure: m.measure })),
        filters: normalizedUserFilters,
      })
        ? 2
        : 1,
    });
  };

  // Update widget name when selection changes, unless locked
  useEffect(() => {
    if (autoLocked) return;

    // For pivot tables, combine all dimensions, otherwise use regular dimension
    const dimensionForNaming =
      selectedChartType === "PIVOT_TABLE" && pivotDimensions.length > 0
        ? pivotDimensions.map(startCase).join(" and ")
        : selectedDimension;

    // For pivot tables, extract actual metric names for the new formatting
    const isPivotTable = selectedChartType === "PIVOT_TABLE";

    const validMetricsForNaming = selectedMetrics.filter(
      (m) => m.measure && m.measure !== "",
    );
    const metricNames =
      isPivotTable && validMetricsForNaming.length > 0
        ? validMetricsForNaming.map((m) => m.id) // Use the ID which is "${aggregation}_${measure}"
        : undefined;

    const suggested = buildWidgetName({
      aggregation: isPivotTable ? "count" : selectedAggregation,
      measure: isPivotTable ? "count" : selectedMeasure,
      dimension: dimensionForNaming,
      view: selectedView,
      metrics: metricNames,
      isMultiMetric: isPivotTable && validMetricsForNaming.length > 0,
    });

    setWidgetName(suggested);
  }, [
    autoLocked,
    selectedAggregation,
    selectedMeasure,
    selectedMetrics,
    selectedDimension,
    selectedView,
    selectedChartType,
    pivotDimensions,
  ]);

  // Update widget description when selection or filters change, unless locked
  useEffect(() => {
    if (autoLocked) return;

    // For pivot tables, combine all dimensions, otherwise use regular dimension
    const dimensionForDescription =
      selectedChartType === "PIVOT_TABLE" && pivotDimensions.length > 0
        ? pivotDimensions.map(startCase).join(" and ")
        : selectedDimension;

    // For pivot tables, extract actual metric names for the new formatting
    const isPivotTable = selectedChartType === "PIVOT_TABLE";
    const validMetricsForDescription = selectedMetrics.filter(
      (m) => m.measure && m.measure !== "",
    );
    const metricNames =
      isPivotTable && validMetricsForDescription.length > 0
        ? validMetricsForDescription.map((m) => m.id) // Use the ID which is "${aggregation}_${measure}"
        : undefined;

    const suggested = buildWidgetDescription({
      aggregation: isPivotTable ? "count" : selectedAggregation,
      measure: isPivotTable ? "count" : selectedMeasure,
      dimension: dimensionForDescription,
      view: selectedView,
      filters: userFilterState,
      metrics: metricNames,
      isMultiMetric: isPivotTable && validMetricsForDescription.length > 0,
    });

    setWidgetDescription(suggested);
  }, [
    autoLocked,
    selectedAggregation,
    selectedMeasure,
    selectedMetrics,
    selectedDimension,
    selectedView,
    userFilterState,
    selectedChartType,
    pivotDimensions,
  ]);

  return (
    <div className="flex h-full gap-4">
      {/* Left column - Form */}
      <div className="h-full w-1/3 min-w-[430px]">
        <Card className="flex h-full flex-col">
          <CardHeader>
            <CardTitle>Widget Configuration</CardTitle>
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
              <h3 className="text-lg font-bold">Data Selection</h3>

              {/* View Selection */}
              <div className="space-y-2">
                <Label htmlFor="view-select">View</Label>
                <Select
                  value={selectedView}
                  onValueChange={(value) => {
                    if (value !== selectedView) {
                      const newView = value as z.infer<typeof views>;
                      const newViewDeclaration =
                        viewDeclarations[viewVersion][newView];

                      // Reset regular chart fields
                      setSelectedMeasure("count");
                      setSelectedAggregation("count");
                      setSelectedDimension("none");

                      // Handle pivot table metrics - filter out invalid measures for the new view
                      if (selectedChartType === "PIVOT_TABLE") {
                        const validMetrics = selectedMetrics.filter(
                          (metric) =>
                            metric.measure in newViewDeclaration.measures,
                        );

                        // Ensure we have at least one valid metric (count is always available)
                        if (validMetrics.length === 0) {
                          validMetrics.push({
                            id: "count_count",
                            measure: "count",
                            aggregation: "count" as z.infer<
                              typeof metricAggregations
                            >,
                            label: "Count Count",
                          });
                        }

                        setSelectedMetrics(validMetrics);

                        // Handle pivot table dimensions - filter out invalid dimensions for the new view
                        const validDimensions = pivotDimensions.filter(
                          (dimension) =>
                            dimension in newViewDeclaration.dimensions,
                        );
                        setPivotDimensions(validDimensions);
                      }

                      // Remove score-only filters when switching away from
                      // scores-categorical or scores-numeric. The widget editor
                      // state stores current UI labels such as "Score Value",
                      // but older/canonical filters can still surface as ids
                      // during transitions, so we need to clean up both
                      // representations here.
                      setUserFilterState((prev) =>
                        prev.filter((filter) => {
                          if (
                            newView !== "scores-categorical" &&
                            (filter.column === "stringValue" ||
                              filter.column === "Score String Value")
                          ) {
                            return false;
                          }

                          if (
                            newView !== "scores-numeric" &&
                            (filter.column === "value" ||
                              filter.column === "Score Value")
                          ) {
                            return false;
                          }

                          return true;
                        }),
                      );
                    }
                    setSelectedView(value as z.infer<typeof views>);
                  }}
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
                        description={
                          viewDeclarations[viewVersion][view].description
                        }
                      />
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Metrics Selection */}
              <div className="space-y-2">
                <Label htmlFor="metrics-select">
                  {selectedChartType === "PIVOT_TABLE" ? "Metrics" : "Metric"}
                </Label>

                {/* For pivot tables: multiple metrics selection */}
                {selectedChartType === "PIVOT_TABLE" ? (
                  <div className="space-y-3">
                    {/* Metric selection dropdowns */}
                    {Array.from(
                      { length: Math.max(1, selectedMetrics.length) },
                      (_, index) => {
                        const isEnabled =
                          index === 0 ||
                          (selectedMetrics[index - 1] &&
                            selectedMetrics[index - 1].measure);
                        const currentMetric = selectedMetrics[index];
                        const currentMeasure = currentMetric?.measure || "";
                        const currentAggregation =
                          currentMetric?.aggregation || "sum";

                        const metricsForIndex = getAvailableMetrics(index);
                        const aggregationsForIndex = getAvailableAggregations(
                          index,
                          currentMeasure,
                        );

                        const canEdit = metricsForIndex.length > 0;

                        return (
                          <div key={index} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label htmlFor={`pivot-metric-${index}`}>
                                Metric {index + 1}{" "}
                                {index === 0 ? "(Required)" : "(Optional)"}
                              </Label>
                              {index > 0 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeMetricSlot(index)}
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
                                    updatePivotMetric(
                                      index,
                                      value,
                                      // Don't pass current aggregation when measure changes
                                      // Let the function determine the best default
                                      undefined,
                                    )
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
                                        viewDeclarations[viewVersion][
                                          selectedView
                                        ]?.measures?.[metric.value];
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
                                      updatePivotMetric(
                                        index,
                                        currentMeasure,
                                        value as z.infer<
                                          typeof metricAggregations
                                        >,
                                      )
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select aggregation" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {aggregationsForIndex.map(
                                        (aggregation) => (
                                          <SelectItem
                                            key={aggregation}
                                            value={aggregation}
                                          >
                                            {startCase(aggregation)}
                                          </SelectItem>
                                        ),
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      },
                    )}

                    {/* Add new metric button */}
                    {selectedMetrics.length < MAX_PIVOT_TABLE_METRICS &&
                      getAvailableMetrics(selectedMetrics.length).length >
                        0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addNewMetricSlot}
                          className="w-full"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add Metric {selectedMetrics.length + 1}
                        </Button>
                      )}
                  </div>
                ) : (
                  /* For regular charts: single metric selection */
                  <div className="space-y-2">
                    <Select
                      value={selectedMeasure}
                      onValueChange={(value) => setSelectedMeasure(value)}
                    >
                      <SelectTrigger id="metrics-select">
                        <SelectValue placeholder="Select metrics" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMetrics.map((metric) => {
                          const meta =
                            viewDeclarations[viewVersion][selectedView]
                              ?.measures?.[metric.value];
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
                    {selectedMeasure !== "count" && (
                      <div className="space-y-1">
                        <Select
                          value={selectedAggregation}
                          disabled={selectedChartType === "HISTOGRAM"} // Disable when histogram chart type is selected
                          onValueChange={(value) =>
                            setSelectedAggregation(
                              value as z.infer<typeof metricAggregations>,
                            )
                          }
                        >
                          <SelectTrigger id="aggregation-select">
                            <SelectValue placeholder="Select Aggregation" />
                          </SelectTrigger>
                          <SelectContent>
                            {validAggregationsForMeasure.map((aggregation) => (
                              <SelectItem key={aggregation} value={aggregation}>
                                {startCase(aggregation)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedChartType === "HISTOGRAM" && (
                          <p className="text-muted-foreground text-xs">
                            Aggregation is automatically set to
                            &quot;histogram&quot; for histogram charts
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Filters Section */}
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
                    filterState={userFilterState}
                    onChange={setUserFilterState}
                    columnsWithCustomSelect={columnsWithCustomSelect}
                  />
                </div>
              </div>

              {/* Dimension Selection - Regular charts (Breakdown) */}
              {chartTypes.find((c) => c.value === selectedChartType)
                ?.supportsBreakdown &&
                selectedChartType !== "PIVOT_TABLE" && (
                  <div className="space-y-2">
                    <Label htmlFor="dimension-select">
                      Breakdown Dimension (Optional)
                    </Label>
                    <Select
                      value={selectedDimension}
                      onValueChange={setSelectedDimension}
                    >
                      <SelectTrigger id="dimension-select">
                        <SelectValue placeholder="Select a dimension" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {availableDimensions.map((dimension) => {
                          const meta =
                            viewDeclarations[viewVersion][selectedView]
                              ?.dimensions?.[dimension.value];
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
                )}

              {/* Pivot Table Dimension Selection */}
              {selectedChartType === "PIVOT_TABLE" && (
                <div className="space-y-4">
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Row Dimensions
                    </h4>
                    <p className="text-muted-foreground mb-3 text-xs">
                      Configure up to {MAX_PIVOT_TABLE_DIMENSIONS} dimensions
                      for pivot table rows. Each dimension creates groupings
                      with subtotals.
                    </p>
                  </div>

                  {Array.from(
                    { length: MAX_PIVOT_TABLE_DIMENSIONS },
                    (_, index) => {
                      const isEnabled =
                        index === 0 || pivotDimensions[index - 1]; // Enable if first or previous is selected
                      const selectedDimensions = pivotDimensions.slice(
                        0,
                        index,
                      ); // Exclude current and later dimensions
                      const currentValue = pivotDimensions[index] || "";

                      return (
                        <div key={index} className="space-y-2">
                          <Label htmlFor={`pivot-dimension-${index}`}>
                            Dimension {index + 1} (Optional)
                          </Label>
                          <Select
                            value={currentValue}
                            onValueChange={(value) =>
                              updatePivotDimension(index, value)
                            }
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
                              {index >= 0 && (
                                <SelectItem value="none">None</SelectItem>
                              )}
                              {availableDimensions
                                .filter(
                                  (d) => !selectedDimensions.includes(d.value),
                                )
                                .map((dimension) => {
                                  const meta =
                                    viewDeclarations[viewVersion][selectedView]
                                      ?.dimensions?.[dimension.value];
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
                    },
                  )}
                </div>
              )}

              {/* Pivot Table Default Sort Configuration */}
              {selectedChartType === "PIVOT_TABLE" && (
                <div className="space-y-4">
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Default Sort Configuration
                    </h4>
                    <p className="text-muted-foreground mb-3 text-xs">
                      Configure the default sort order for the pivot table. This
                      will be applied when the widget is first loaded.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="default-sort-column">Sort Column</Label>
                      <Select
                        value={defaultSortColumn}
                        onValueChange={setDefaultSortColumn}
                      >
                        <SelectTrigger id="default-sort-column">
                          <SelectValue placeholder="Select a column to sort by" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No default sort</SelectItem>
                          {/* Show available metrics as sort options */}
                          {selectedMetrics
                            .filter(
                              (metric) =>
                                metric.measure && metric.measure !== "",
                            )
                            .map((metric) => (
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
                        value={defaultSortOrder}
                        onValueChange={(value: "ASC" | "DESC") =>
                          setDefaultSortOrder(value)
                        }
                        disabled={
                          !defaultSortColumn || defaultSortColumn === "none"
                        }
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
              )}
            </div>

            {/* Visualization Section */}
            <div className="mt-6 space-y-4">
              <h3 className="text-lg font-bold">Visualization</h3>

              {/* Widget Name */}
              <div className="space-y-2">
                <Label htmlFor="widget-name">Name</Label>
                <Input
                  id="widget-name"
                  value={widgetName}
                  onChange={(e) => {
                    if (!autoLocked) setAutoLocked(true);
                    setWidgetName(e.target.value);
                  }}
                  placeholder="Enter widget name"
                />
              </div>

              {/* Widget Description */}
              <div className="space-y-2">
                <Label htmlFor="widget-description">Description</Label>
                <Input
                  id="widget-description"
                  value={widgetDescription}
                  onChange={(e) => {
                    if (!autoLocked) setAutoLocked(true);
                    setWidgetDescription(e.target.value);
                  }}
                  placeholder="Enter widget description"
                />
              </div>

              {/* Chart Type Selection */}
              <div className="space-y-2">
                <Label htmlFor="chart-type-select">Chart Type</Label>
                <Select
                  value={selectedChartType}
                  onValueChange={setSelectedChartType}
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
                              {React.createElement(chart.icon, {
                                className: "mr-2 w-4",
                              })}
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
                              chart.value === "HISTOGRAM" &&
                              !measureSupportsHistogram
                            }
                          >
                            <div className="flex items-center">
                              {React.createElement(chart.icon, {
                                className: "mr-2 w-4",
                              })}
                              <span>{chart.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

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

              {/* Histogram Bins Selection - Only shown for HISTOGRAM chart type */}
              {selectedChartType === "HISTOGRAM" && (
                <div className="space-y-2">
                  <Label htmlFor="histogram-bins">Number of Bins (1-100)</Label>
                  <Input
                    id="histogram-bins"
                    type="number"
                    min={1}
                    max={100}
                    value={histogramBins}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      if (!isNaN(value) && value >= 1 && value <= 100) {
                        setHistogramBins(value);
                      }
                    }}
                    placeholder="Enter number of bins (1-100)"
                  />
                </div>
              )}

              {/* Row Limit Selection - Only shown for non-time series charts that support breakdown */}
              {chartTypes.find((c) => c.value === selectedChartType)
                ?.supportsBreakdown &&
                !isTimeSeriesChart(
                  selectedChartType as DashboardWidgetChartType,
                ) && (
                  <div className="space-y-2">
                    <Label htmlFor="row-limit">
                      Breakdown Row Limit (0-1000)
                    </Label>
                    <Input
                      id="row-limit"
                      type="number"
                      min={0}
                      max={1000}
                      value={rowLimit}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (!isNaN(value) && value >= 0 && value <= 1000) {
                          setRowLimit(value);
                        }
                      }}
                      placeholder="Enter breakdown row limit (0-1000)"
                    />
                  </div>
                )}
            </div>
          </CardContent>
          <CardFooter className="mt-auto">
            <Button className="w-full" size="lg" onClick={handleSaveWidget}>
              Save Widget
            </Button>
          </CardFooter>
        </Card>
      </div>
      {/* Right column - Chart */}
      <div className="w-2/3">
        <Card className="flex aspect-video flex-col">
          <CardHeader>
            <CardTitle className="truncate" title={widgetName}>
              {widgetName}
            </CardTitle>
            <CardDescription className="truncate" title={widgetDescription}>
              {widgetDescription}
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
                  chartType={selectedChartType as DashboardWidgetChartType}
                  data={transformedData}
                  rowLimit={rowLimit}
                  chartConfig={
                    selectedChartType === "PIVOT_TABLE"
                      ? {
                          type: selectedChartType as DashboardWidgetChartType,
                          dimensions: pivotDimensions,
                          row_limit: rowLimit,
                          metrics: selectedMetrics.map((metric) => metric.id), // Pass metric field names
                          defaultSort:
                            defaultSortColumn && defaultSortColumn !== "none"
                              ? {
                                  column: defaultSortColumn,
                                  order: defaultSortOrder,
                                }
                              : undefined,
                        }
                      : selectedChartType === "HISTOGRAM"
                        ? {
                            type: selectedChartType as DashboardWidgetChartType,
                            bins: histogramBins,
                          }
                        : {
                            type: selectedChartType as DashboardWidgetChartType,
                            row_limit: rowLimit,
                          }
                  }
                  sortState={
                    selectedChartType === "PIVOT_TABLE"
                      ? previewSortState
                      : undefined
                  }
                  onSortChange={undefined}
                  isLoading={queryResult.isPending}
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
