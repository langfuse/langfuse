/* eslint-disable no-nested-ternary */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/src/components/ui/card";
import { WidgetImporter } from "@/src/features/widgets/components/WidgetImporter";
import { type ImportedWidgetFormSnapshot } from "@/src/features/widgets/utils/import-export-utils";
import {
  buildWidgetOrderBy,
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
} from "@/src/features/dashboard";
import React, { useMemo, useRef } from "react";
import {
  useController,
  useForm,
  useWatch,
  type Control,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Label } from "@/src/components/ui/label";
import { Alert } from "@/src/components/design-system/Alert/Alert";

import { type z } from "zod";

import { useReadPath } from "@/src/features/events";
import { Input } from "@/src/components/design-system/Input/Input";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import startCase from "lodash/startCase";
import { DateRangeInput } from "@/src/components/design-system/DateRangeInput/DateRangeInput";
import { useEntitlementLimit } from "@/src/features/entitlements";
import { addMinutes } from "date-fns";
import { MetricsFilterBuilder } from "@/src/features/metrics/components/MetricsFilterBuilder";
import { type useMetricsFilterBuilderData } from "@/src/features/metrics/components/ConnectedMetricsFilterBuilder";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import {
  DASHBOARD_AGGREGATION_OPTIONS,
  dashboardDateRangeAggregationSettings,
  getTimeRangeLabel,
  isDashboardDateRangeOptionAvailable,
  toAbsoluteTimeRange,
  type DashboardDateRangeOptions,
} from "@/src/utils/date-range-utils";
import { Button } from "@/src/components/ui/button";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { showErrorToast } from "@/src/features/notifications";
import { type FilterState } from "@langfuse/shared";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import { Plus, X, AlertCircle, Sparkles } from "lucide-react";
import { dashboardWidgetChartTypeIcons } from "@/src/features/widgets/chart-library/chartTypeIcons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverClose,
} from "@/src/components/ui/popover";
import { formatMetricName } from "@/src/features/widgets/utils";
import {
  MAX_PIVOT_TABLE_DIMENSIONS,
  MAX_PIVOT_TABLE_METRICS,
} from "@/src/features/widgets/utils/pivot-table-utils";
import { WIDGET_FILTER_PRESETS } from "@/src/features/widgets/constants/widgetFilterPresets";
import { useCaptureWidgetHighCardinalityError } from "@/src/features/widgets/hooks/useWidgetQueryErrorCapture";
import {
  applyChartTypeChange,
  deriveEffectiveSort,
  deriveSaveReason,
  deriveWidgetBaseMinVersion,
  deriveWidgetSuggestions,
  effectiveWidgetName,
  makeWidgetFormSchema,
  normalizeWidgetFormValues,
  resolveMeasureChangeAggregation,
  resolveWidgetFormVersion,
  toDefaultValues,
  toSavePayload,
  widgetChartTypeSupportsBreakdown,
  type SortField,
  type WidgetFormValues,
  type WidgetInitialValues,
  type WidgetSavePayload,
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

// chartTypes drives the chart-type SelectGroup rendering (group/name/value/
// icon). Whether a type supports a breakdown dimension is derived on demand via
// widgetChartTypeSupportsBreakdown(chartType) at each gate, not stored here.
const chartTypes: ChartType[] = [
  {
    group: "total-value",
    name: "Big Number",
    value: "NUMBER",
    icon: dashboardWidgetChartTypeIcons.NUMBER,
  },
  {
    group: "time-series",
    name: "Line Chart",
    value: "LINE_TIME_SERIES",
    icon: dashboardWidgetChartTypeIcons.LINE_TIME_SERIES,
  },
  {
    group: "time-series",
    name: "Vertical Bar Chart",
    value: "BAR_TIME_SERIES",
    icon: dashboardWidgetChartTypeIcons.BAR_TIME_SERIES,
  },
  {
    group: "total-value",
    name: "Horizontal Bar Chart",
    value: "HORIZONTAL_BAR",
    icon: dashboardWidgetChartTypeIcons.HORIZONTAL_BAR,
  },
  {
    group: "total-value",
    name: "Vertical Bar Chart",
    value: "VERTICAL_BAR",
    icon: dashboardWidgetChartTypeIcons.VERTICAL_BAR,
  },
  {
    group: "total-value",
    name: "Histogram",
    value: "HISTOGRAM",
    icon: dashboardWidgetChartTypeIcons.HISTOGRAM,
  },
  {
    group: "total-value",
    name: "Pie Chart",
    value: "PIE",
    icon: dashboardWidgetChartTypeIcons.PIE,
  },
  {
    group: "total-value",
    name: "Pivot Table",
    value: "PIVOT_TABLE",
    icon: dashboardWidgetChartTypeIcons.PIVOT_TABLE,
  },
];

/**
 * A small read-only context passed DOWN to field subcomponents. It lets a field
 * render meta (descriptions/units) and gate options without any child ever
 * calling `watch` — the controller owns the single `useWatch`.
 */
type WidgetFieldContext = {
  view: z.infer<typeof views>;
  viewVersion: ViewVersion;
  chartType: DashboardWidgetChartType;
};

export function useWidgetFormState({
  initialValues,
  projectId,
  onSave,
  widgetId,
}: {
  initialValues: WidgetInitialValues;
  projectId: string;
  onSave: (widgetData: WidgetSavePayload) => void;
  widgetId?: string;
}) {
  const { isV4 } = useReadPath();

  // The initial widget's persisted version is a local hint frozen at mount.
  // The resolver and live viewVersion additionally derive v2 from the current
  // form shape; the server derives the value that gets persisted.
  const baseMinVersion = deriveWidgetBaseMinVersion(initialValues);
  const activeVersion: ViewVersion = isV4 ? "v2" : "v1";

  // The auto-suggestions change on every keystroke; a ref keeps the resolver
  // closure from being rebuilt on each one (the filled name/description do not
  // affect validity — name/description are nullable with no min).
  const suggestionsRef = useRef<{ name: string; description: string }>({
    name: "",
    description: "",
  });

  // Precompute both version schemas/resolvers once. A blank name/description is
  // filled with the live suggestion and the filters are mapped into view space
  // before zod (mirrors MonitorForm).
  const resolversByVersion = useMemo(
    () => ({
      v1: zodResolver(makeWidgetFormSchema("v1") as any),
      v2: zodResolver(makeWidgetFormSchema("v2") as any),
    }),
    [],
  );
  // The schema version is derived INSIDE the resolver from the (mapped) view
  // being validated — not from a render-written ref — so it is never render
  // stale after a version-flipping view or import. baseMinVersion and
  // activeVersion are in the dep list so either promotion rebuilds the closure
  // (react-hook-form re-reads control._options each render).
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
        // mapWidgetUiTableFilterToView MUST stay idempotent: the form holds
        // editor-space filters, and both this validation path and toSavePayload
        // map them to view space independently.
        filters: mapWidgetUiTableFilterToView(v.view, v.filters ?? []),
      };
      const version = resolveWidgetFormVersion({
        view: mapped.view,
        baseMinVersion,
        activeVersion,
        shape: mapped,
      });
      return resolversByVersion[version](mapped as any, context, options);
    };
  }, [resolversByVersion, baseMinVersion, activeVersion]);

  // The initial view version, derived from initialValues alone (view is known
  // before the form mounts) so the seed can normalize against the right view
  // declaration.
  const initialViewVersion = resolveWidgetFormVersion({
    view: initialValues.view,
    baseMinVersion,
    activeVersion,
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
  const viewVersion = resolveWidgetFormVersion({
    view: selectedView,
    baseMinVersion,
    activeVersion,
    shape: values,
  });
  const suggestions = deriveWidgetSuggestions(values);
  const effectiveSort = deriveEffectiveSort(values);

  suggestionsRef.current = suggestions;

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

  useCaptureWidgetHighCardinalityError({
    validation: queryValidation,
    surface: widgetId ? "edit_editor" : "create_editor",
    chartType,
    isV4: viewVersion === "v2",
  });

  const selectedMeasure = values.metrics[0]?.measure ?? "count";
  const selectedAggregation = values.metrics[0]?.aggregation ?? "count";
  const selectedDimension = values.dimensions[0]?.field ?? "none";

  const displayName = effectiveWidgetName(values.name, suggestions.name);
  const displayDescription = effectiveWidgetName(
    values.description,
    suggestions.description,
  );

  return {
    form,
    onSave,
    baseMinVersion,
    activeVersion,
    projectId,
    query,
    selectedDimension,
    widgetId,
    isV4,
    viewVersion,
    dateRange,
    selectedView,
    chartType,
    selectedMeasure,
    effectiveSort,
    suggestions,
    setDateRangeAndOption,
    selectedOption,
    displayName,
    displayDescription,
    queryValidation,
    values,
    pivotDimensionFields,
    selectedAggregation,
    previewSortState,
  };
}

export type WidgetFormState = ReturnType<typeof useWidgetFormState>;

export function WidgetForm({
  filterData,
  form,
  values,
  queryValidation,
  onSave,
  baseMinVersion,
  activeVersion,
  projectId,
  widgetId,
  isV4,
  viewVersion,
  dateRange,
  suggestions,
  setDateRangeAndOption,
  selectedOption,
}: Pick<
  WidgetFormState,
  | "form"
  | "values"
  | "queryValidation"
  | "onSave"
  | "baseMinVersion"
  | "activeVersion"
  | "projectId"
  | "widgetId"
  | "isV4"
  | "viewVersion"
  | "dateRange"
  | "suggestions"
  | "setDateRangeAndOption"
  | "selectedOption"
> & {
  filterData: ReturnType<typeof useMetricsFilterBuilderData>;
}) {
  const selectedView = values.view;
  const chartType = values.chart.type;
  const selectedMeasure = values.metrics[0]?.measure ?? "count";
  const effectiveSort = deriveEffectiveSort(values);

  // `viewsV2` is the public/new-widget v2 allowlist and intentionally excludes
  // `traces`. Existing legacy trace widgets are a compatibility exception:
  // their v2 query uses the internal events-backed declaration, so the current
  // `traces` value must remain selectable while editing. Once the user leaves
  // traces, return to the public allowlist so traces stays unavailable for
  // new V4 widget definitions.
  const availableViewOptions =
    viewVersion === "v2" && selectedView !== "traces" ? viewsV2 : views;

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
  };

  // superRefine messages, surfaced inline under the relevant control and next
  // to the disabled Save button (replaces the legacy save-time error toasts).
  const formErrors = form.formState.errors;
  const chartTypeError: string | undefined = formErrors.chart?.type?.message;
  const metricsError: string | undefined =
    formErrors.metrics?.message ??
    formErrors.metrics?.root?.message ??
    formErrors.metrics?.[0]?.measure?.message ??
    formErrors.metrics?.[0]?.aggregation?.message;
  const dimensionsError: string | undefined = formErrors.dimensions?.message;

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
    const newViewVersion = resolveWidgetFormVersion({
      view: newView,
      baseMinVersion,
      activeVersion,
      shape: values,
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

    // Filters are kept across view changes; MetricsFilterBuilder surfaces any
    // now-invalid rows in its banner rather than silently dropping them.
    const candidate = normalizeWidgetFormValues(
      { ...values, view: newView, metrics, dimensions },
      newViewVersion,
    );
    commitHealed(candidate, { view: true });
  };

  // Chart-type change (ports breakdown-wipe / pivot-dims-reset / trim-metrics
  // PLUS the histogram resolution — the histogram silent-revert fix). Crossing
  // the pivot boundary resets dimensions so a breakdown dim and pivot row dims
  // never cross-contaminate (see applyChartTypeChange).
  const onChartTypeChange = (newType: DashboardWidgetChartType) => {
    commitHealed(applyChartTypeChange(values, newType, viewVersion));
  };

  // Single (non-pivot) measure change — heals the aggregation + chart type in
  // the same action (the histogram fix, in the initiating event handler). A
  // carried-over "count" aggregation jumps to the new measure's natural
  // default (e.g. sum for toolCalls) instead of counting observations.
  const onMeasureChange = (newMeasure: string) => {
    const nextMetrics = values.metrics.map((m, i) =>
      i === 0
        ? {
            ...m,
            measure: newMeasure,
            aggregation: resolveMeasureChangeAggregation({
              currentAggregation: m.aggregation,
              newMeasure,
              view: selectedView,
              viewVersion,
            }),
          }
        : m,
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

  const handleImportedWidget = (snapshot: ImportedWidgetFormSnapshot) => {
    const importIsPivot = snapshot.selectedChartType === "PIVOT_TABLE";
    // The preview version for the imported widget is re-derived from the
    // snapshot's own version hint (not the mount's).
    const importViewVersion = resolveWidgetFormVersion({
      view: snapshot.selectedView,
      baseMinVersion: snapshot.widgetMinVersion,
      activeVersion,
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

  const metricsForSort = values.metrics
    .filter((metric) => metric.measure && metric.measure !== "")
    .map((metric) => ({ id: `${metric.aggregation}_${metric.measure}` }));

  // Save is gated on schema validity + query validity; surface WHY it is
  // disabled instead of a silent greyed-out button (replaces the legacy toasts).
  // deriveSaveReason falls back to the FIRST message anywhere in the error tree
  // so even a path without an inline marker still explains the disabled button.
  const saveDisabled = !form.formState.isValid || !queryValidation.valid;
  const saveDisabledReason = !queryValidation.valid
    ? queryValidation.reason
    : deriveSaveReason(formErrors);

  return (
    <div className="h-full w-full">
      <Card className="flex h-full flex-col">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle>Widget Configuration</CardTitle>
            {!widgetId && isV4 && (
              <WidgetImporter
                projectId={projectId}
                viewVersion={viewVersion}
                dateRange={dateRange}
                isV4={isV4}
                onImport={handleImportedWidget}
              />
            )}
          </div>
          <CardDescription>
            Configure your widget by selecting data and visualization options
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 overflow-y-auto">
          {isV4 && selectedView === "traces" && (
            <Alert variant="warning" icon={AlertCircle}>
              <Alert.Title>Traces view is not available in v4</Alert.Title>
              <Alert.Description>
                This widget uses the traces view which is not supported in v4.
                It will continue to use v3 definitions. To use v4, change the
                view to observations or scores.
              </Alert.Description>
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
                  getAvailablePivotAggregations={getAvailablePivotAggregations}
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
              filterData={filterData}
              control={form.control}
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
              control={form.control}
              value={chartType}
              onChartTypeChange={onChartTypeChange}
              measureSupportsHistogram={measureSupportsHistogram}
              error={chartTypeError}
            />

            <FormField label="Date Range">
              {(field) => (
                <WidgetDateRangeInput
                  id={field.id}
                  aria-describedby={field.inputDescribedById}
                  dateRange={dateRange}
                  setDateRangeAndOption={setDateRangeAndOption}
                  selectedOption={
                    (selectedOption ?? "custom") as DashboardDateRangeOptions
                  }
                />
              )}
            </FormField>

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
            <p role="alert" className="text-destructive text-xs">
              {saveDisabledReason}
            </p>
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
  );
}

// -----------------------------------------------------------------------------
// Field subcomponents. Each binds exactly ONE nested field via a single
// useController and receives the read-only ctx as props. Cross-slice cascades
// are invoked through the parent-owned handlers (onViewChange, onChartTypeChange,
// onMeasureChange); no child pokes a sibling field or calls `watch`.
// -----------------------------------------------------------------------------

function WidgetDateRangeInput({
  id,
  "aria-describedby": ariaDescribedBy,
  dateRange,
  selectedOption,
  setDateRangeAndOption,
}: {
  id: string;
  "aria-describedby"?: string;
  dateRange?: { from: Date; to: Date };
  selectedOption: DashboardDateRangeOptions;
  setDateRangeAndOption: (
    option: DashboardDateRangeOptions,
    date?: { from: Date; to: Date },
  ) => void;
}) {
  const lookbackLimit = useEntitlementLimit("data-access-days");

  return (
    <DateRangeInput
      id={id}
      aria-describedby={ariaDescribedBy}
      earliestDate={
        lookbackLimit === false
          ? undefined
          : addMinutes(new Date(), -lookbackLimit * 24 * 60)
      }
      value={selectedOption}
      customValue="custom"
      range={dateRange}
      presets={DASHBOARD_AGGREGATION_OPTIONS.map((option) => ({
        value: option,
        label: getTimeRangeLabel(option),
        disabled: !isDashboardDateRangeOptionAvailable({
          option,
          limitDays: lookbackLimit,
        }),
      }))}
      onPresetChange={(option) => {
        if (option === "custom") return;
        const now = new Date();
        const minutes = dashboardDateRangeAggregationSettings[option].minutes;
        if (minutes === null) return;
        setDateRangeAndOption(option, {
          from: addMinutes(now, -minutes),
          to: now,
        });
      }}
      onCustomChange={(range) => setDateRangeAndOption("custom", range)}
    />
  );
}

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
  return (
    <FormField control={control} name="view" label="View">
      {(field) => (
        <SelectInput
          value={field.value}
          onValueChange={(value) =>
            onViewChange(value as z.infer<typeof views>)
          }
          id={field.id}
          placeholder="Select a view"
          error={Boolean(field.error)}
          aria-invalid={Boolean(field.error)}
          aria-describedby={field.inputDescribedById}
          options={availableViewOptions.options.map((view) => ({
            value: view,
            label: startCase(view),
            explanation: {
              title: startCase(view),
              description: viewDeclarations[ctx.viewVersion][view].description,
            },
          }))}
        />
      )}
    </FormField>
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
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SelectInput
            value={measure}
            onValueChange={(value) => onMeasureChange(value)}
            id="metrics-select"
            placeholder="Select metrics"
            error={Boolean(error)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "single-metric-error" : undefined}
            options={availableMetrics.map((metric) => {
              const meta =
                viewDeclarations[ctx.viewVersion][ctx.view]?.measures?.[
                  metric.value
                ];
              return {
                ...metric,
                explanation: {
                  title: metric.label,
                  description: meta?.description,
                  badges: [
                    ...(meta?.unit
                      ? [{ label: "Unit", value: meta.unit }]
                      : []),
                    ...(meta?.type
                      ? [{ label: "Type", value: meta.type }]
                      : []),
                  ],
                },
              };
            })}
          />
        </div>
        {measure !== "count" && (
          <div className="flex-1">
            <SelectInput
              value={aggField.value}
              disabled={ctx.chartType === "HISTOGRAM"}
              onValueChange={(value) =>
                aggField.onChange(value as z.infer<typeof metricAggregations>)
              }
              id="aggregation-select"
              placeholder="Select Aggregation"
              options={aggregationOptions.map((aggregation) => ({
                value: aggregation,
                label: startCase(aggregation),
              }))}
            />
          </div>
        )}
      </div>
      {measure !== "count" && ctx.chartType === "HISTOGRAM" && (
        <p className="text-muted-foreground text-xs">
          Aggregation is automatically set to &quot;histogram&quot; for
          histogram charts
        </p>
      )}
      {error && (
        <p id="single-metric-error" className="text-destructive text-xs">
          {error}
        </p>
      )}
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
        const defaultAggregation =
          viewDeclarations[ctx.viewVersion][ctx.view]?.measures?.[measure]
            ?.defaultAggregation;
        finalAggregation =
          aggregation && available.includes(aggregation)
            ? aggregation
            : defaultAggregation && available.includes(defaultAggregation)
              ? defaultAggregation
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
                <SelectInput
                  value={currentMeasure}
                  onValueChange={(value) =>
                    updateMetric(index, value, undefined)
                  }
                  disabled={!isEnabled || !canEdit}
                  id={`pivot-metric-${index}`}
                  error={Boolean(error && index === 0)}
                  aria-invalid={error && index === 0 ? true : undefined}
                  aria-describedby={
                    error && index === 0 ? "pivot-metrics-error" : undefined
                  }
                  placeholder={
                    !isEnabled
                      ? "Select previous metric first"
                      : !canEdit
                        ? "No more measures available"
                        : "Select measure"
                  }
                  options={metricsForIndex.map((metric) => {
                    const meta =
                      viewDeclarations[ctx.viewVersion][ctx.view]?.measures?.[
                        metric.value
                      ];
                    return {
                      ...metric,
                      explanation: {
                        title: metric.label,
                        description: meta?.description,
                        badges: [
                          ...(meta?.unit
                            ? [{ label: "Unit", value: meta.unit }]
                            : []),
                          ...(meta?.type
                            ? [{ label: "Type", value: meta.type }]
                            : []),
                        ],
                      },
                    };
                  })}
                />
              </div>

              {currentMeasure && currentMeasure !== "count" && (
                <div className="flex-1">
                  <SelectInput
                    value={currentAggregation}
                    onValueChange={(value) =>
                      updateMetric(
                        index,
                        currentMeasure,
                        value as z.infer<typeof metricAggregations>,
                      )
                    }
                    placeholder="Select aggregation"
                    options={aggregationsForIndex.map((aggregation) => ({
                      value: aggregation,
                      label: startCase(aggregation),
                    }))}
                  />
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
      {error && (
        <p id="pivot-metrics-error" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

function FiltersField({
  filterData,
  control,
  selectedView,
}: {
  filterData: ReturnType<typeof useMetricsFilterBuilderData>;
  control: Control<WidgetFormValues>;
  selectedView: z.infer<typeof views>;
}) {
  const { field } = useController({ control, name: "filters" });
  return (
    <div className="space-y-2">
      <Label>Filters</Label>
      <MetricsFilterBuilder
        {...filterData}
        view={selectedView}
        filters={field.value}
        onChange={(next: FilterState) => field.onChange(next)}
      />
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
  return (
    <FormField
      control={control}
      name="dimensions"
      label="Breakdown Dimension (Optional)"
    >
      {(field) => (
        <SelectInput
          value={field.value[0]?.field ?? "none"}
          onValueChange={(next) =>
            field.onChange(next === "none" ? [] : [{ field: next }])
          }
          id={field.id}
          placeholder="Select a dimension"
          error={Boolean(error || field.error)}
          aria-invalid={Boolean(error || field.error)}
          aria-describedby={field.inputDescribedById}
          options={[
            { value: "none", label: "None" },
            ...availableDimensions.map((dimension) => {
              const meta =
                viewDeclarations[ctx.viewVersion][ctx.view]?.dimensions?.[
                  dimension.value
                ];
              return {
                ...dimension,
                explanation: {
                  title: dimension.label,
                  description: meta?.description,
                  badges: [
                    ...(meta?.unit
                      ? [{ label: "Unit", value: meta.unit }]
                      : []),
                    ...(meta?.type
                      ? [{ label: "Type", value: meta.type }]
                      : []),
                  ],
                },
              };
            }),
          ]}
        />
      )}
    </FormField>
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
            <SelectInput
              value={currentValue}
              onValueChange={(value) => updateDimension(index, value)}
              disabled={!isEnabled}
              id={`pivot-dimension-${index}`}
              error={Boolean(error && index === 0)}
              aria-invalid={error && index === 0 ? true : undefined}
              aria-describedby={
                error && index === 0 ? "pivot-dimensions-error" : undefined
              }
              placeholder={
                isEnabled
                  ? "Select a dimension"
                  : "Select previous dimension first"
              }
              options={[
                { value: "none", label: "None" },
                ...availableDimensions
                  .filter((d) => !selectedDimensions.includes(d.value))
                  .map((dimension) => {
                    const meta =
                      viewDeclarations[ctx.viewVersion][ctx.view]?.dimensions?.[
                        dimension.value
                      ];
                    return {
                      ...dimension,
                      explanation: {
                        title: dimension.label,
                        description: meta?.description,
                        badges: [
                          ...(meta?.unit
                            ? [{ label: "Unit", value: meta.unit }]
                            : []),
                          ...(meta?.type
                            ? [{ label: "Type", value: meta.type }]
                            : []),
                        ],
                      },
                    };
                  }),
              ]}
            />
          </div>
        );
      })}
      {error && (
        <p id="pivot-dimensions-error" className="text-destructive text-xs">
          {error}
        </p>
      )}
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
        <FormField control={control} name="chart.sort" label="Sort Column">
          {(field) => (
            <SelectInput
              value={column}
              onValueChange={(next) =>
                field.onChange(next === "none" ? null : { column: next, order })
              }
              id={field.id}
              placeholder="Select a column to sort by"
              error={Boolean(field.error)}
              aria-invalid={Boolean(field.error)}
              aria-describedby={field.inputDescribedById}
              options={[
                { value: "none", label: "No default sort" },
                ...metricsForSort.map((metric) => ({
                  value: metric.id,
                  label: formatMetricName(metric.id),
                })),
              ]}
            />
          )}
        </FormField>

        <FormField control={control} name="chart.sort" label="Sort Order">
          {(field) => (
            <SelectInput
              value={order}
              onValueChange={(value: "ASC" | "DESC") =>
                field.onChange({ column, order: value })
              }
              disabled={column === "none"}
              id={field.id}
              placeholder="Select sort order"
              options={[
                { value: "ASC", label: "Ascending (A-Z)" },
                { value: "DESC", label: "Descending (Z-A)" },
              ]}
            />
          )}
        </FormField>
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
  return (
    <FormField control={control} name="name" label="Name">
      {(field) => (
        <Input
          id={field.id}
          aria-invalid={Boolean(field.error)}
          aria-describedby={field.inputDescribedById}
          error={Boolean(field.error)}
          // A blank/whitespace-only override shows the live suggestion; typing
          // real content sticks; clearing reverts to tracking + saving the
          // suggestion. Uses the same trim-aware effective logic as the preview
          // title and toSavePayload, so input, preview, and saved value agree.
          value={effectiveWidgetName(field.value, suggestion)}
          onChange={(e) => field.onChange(e.target.value)}
          placeholder="Enter widget name"
        />
      )}
    </FormField>
  );
}

function DescriptionField({
  control,
  suggestion,
}: {
  control: Control<WidgetFormValues>;
  suggestion: string;
}) {
  return (
    <FormField control={control} name="description" label="Description">
      {(field) => (
        <Input
          id={field.id}
          aria-invalid={Boolean(field.error)}
          aria-describedby={field.inputDescribedById}
          error={Boolean(field.error)}
          value={effectiveWidgetName(field.value, suggestion)}
          onChange={(e) => field.onChange(e.target.value)}
          placeholder="Enter widget description"
        />
      )}
    </FormField>
  );
}

function ChartTypeSelect({
  control,
  value,
  onChartTypeChange,
  measureSupportsHistogram,
  error,
}: {
  control: Control<WidgetFormValues>;
  value: DashboardWidgetChartType;
  onChartTypeChange: (type: DashboardWidgetChartType) => void;
  measureSupportsHistogram: boolean;
  error?: string;
}) {
  return (
    <FormField control={control} name="chart.type" label="Chart Type">
      {(field) => (
        <SelectInput
          value={value}
          onValueChange={(next) =>
            onChartTypeChange(next as DashboardWidgetChartType)
          }
          id={field.id}
          placeholder="Select a chart type"
          error={Boolean(error || field.error)}
          aria-invalid={Boolean(error || field.error)}
          aria-describedby={field.inputDescribedById}
          options={[
            {
              type: "group",
              id: "time-series",
              label: "Time Series",
              options: chartTypes
                .filter((chart) => chart.group === "time-series")
                .map((chart) => ({
                  value: chart.value,
                  label: chart.name,
                  icon: chart.icon,
                })),
            },
            {
              type: "group",
              id: "total-value",
              label: "Total Value",
              options: chartTypes
                .filter((chart) => chart.group === "total-value")
                .map((chart) =>
                  chart.value === "HISTOGRAM" && !measureSupportsHistogram
                    ? {
                        value: chart.value,
                        label: chart.name,
                        icon: chart.icon,
                        disabled: true as const,
                        disabledReason:
                          "Histogram is not supported for this metric",
                      }
                    : {
                        value: chart.value,
                        label: chart.name,
                        icon: chart.icon,
                      },
                ),
            },
          ]}
        />
      )}
    </FormField>
  );
}

function HistogramBinsField({
  control,
}: {
  control: Control<WidgetFormValues>;
}) {
  return (
    <FormField
      control={control}
      name="chart.bins"
      label="Number of Bins (1-100)"
    >
      {(field) => (
        <Input
          id={field.id}
          type="number"
          min={1}
          max={100}
          aria-invalid={Boolean(field.error)}
          aria-describedby={field.inputDescribedById}
          error={Boolean(field.error)}
          value={field.value}
          onChange={(e) => {
            const value = parseInt(e.target.value);
            if (!isNaN(value) && value >= 1 && value <= 100) {
              field.onChange(value);
            }
          }}
          placeholder="Enter number of bins (1-100)"
        />
      )}
    </FormField>
  );
}

function RowLimitField({ control }: { control: Control<WidgetFormValues> }) {
  return (
    <FormField
      control={control}
      name="chart.rowLimit"
      label="Breakdown Row Limit (0-1000)"
    >
      {(field) => (
        <Input
          id={field.id}
          type="number"
          min={0}
          max={1000}
          aria-invalid={Boolean(field.error)}
          aria-describedby={field.inputDescribedById}
          error={Boolean(field.error)}
          value={field.value}
          onChange={(e) => {
            const value = parseInt(e.target.value);
            if (!isNaN(value) && value >= 0 && value <= 1000) {
              field.onChange(value);
            }
          }}
          placeholder="Enter breakdown row limit (0-1000)"
        />
      )}
    </FormField>
  );
}
