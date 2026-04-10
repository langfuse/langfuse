import React, { useMemo, useEffect } from "react";
import { type z } from "zod";
import startCase from "lodash/startCase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Label } from "@/src/components/ui/label";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { api } from "@/src/utils/api";
import {
  type metricAggregations,
  getValidAggregationsForMeasureType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { viewDeclarations } from "@/src/features/query/dataModel";
import { type ViewVersion } from "@/src/features/query";
import { views, viewsV2 } from "@/src/features/query/types";
import { type ColumnDefinition, type FilterState } from "@langfuse/shared";
import { WidgetPropertySelectItem } from "@/src/features/widgets/components/WidgetPropertySelectItem";

export interface AdditionalQueryConfig {
  id: string;
  name: string;
  view: z.infer<typeof views>;
  measure: string;
  aggregation: z.infer<typeof metricAggregations>;
  dimension: string; // "none" means no breakdown
  filters: FilterState;
  hidden: boolean;
  expanded: boolean;
}

export function QuerySection({
  queryConfig,
  projectId,
  viewVersion,
  selectedChartType,
  supportsBreakdown,
  onChange,
}: {
  queryConfig: AdditionalQueryConfig;
  projectId: string;
  viewVersion: ViewVersion;
  selectedChartType: string;
  supportsBreakdown: boolean;
  onChange: (config: AdditionalQueryConfig) => void;
}) {
  // Fetch filter option data — same query keys as parent so React Query shares the cache
  const traceFilterOptions = api.traces.filterOptions.useQuery(
    { projectId },
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );
  const generationsFilterOptions = api.generations.filterOptions.useQuery(
    { projectId },
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );
  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      { projectId },
      {
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );

  const environmentOptions =
    environmentFilterOptions.data?.map((v) => ({
      value: v.environment,
    })) ?? [];
  const nameOptions = traceFilterOptions.data?.name ?? [];
  const tagsOptions = traceFilterOptions.data?.tags ?? [];
  const modelOptions = generationsFilterOptions.data?.model ?? [];
  const toolNamesOptions = generationsFilterOptions.data?.toolNames ?? [];
  const observationLevelOptions = [
    { value: "DEBUG" },
    { value: "DEFAULT" },
    { value: "WARNING" },
    { value: "ERROR" },
  ];

  const filterColumns: ColumnDefinition[] = [
    {
      name: "Environment",
      id: "environment",
      type: "stringOptions",
      options: environmentOptions,
      internal: "internalValue",
    },
    {
      name: "Trace Name",
      id: "traceName",
      type: "stringOptions",
      options: nameOptions,
      internal: "internalValue",
    },
    {
      name: "Observation Name",
      id: "observationName",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Score Name",
      id: "scoreName",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Tags",
      id: "tags",
      type: "arrayOptions",
      options: tagsOptions,
      internal: "internalValue",
    },
    {
      name: "Tool Names",
      id: "toolNames",
      type: "arrayOptions",
      options: toolNamesOptions,
      internal: "internalValue",
    },
    {
      name: "User",
      id: "user",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Session",
      id: "session",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Metadata",
      id: "metadata",
      type: "stringObject",
      internal: "internalValue",
    },
    {
      name: "Release",
      id: "release",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Version",
      id: "version",
      type: "string",
      internal: "internalValue",
    },
  ];
  if (queryConfig.view === "observations") {
    filterColumns.push({
      name: "Model",
      id: "providedModelName",
      type: "stringOptions",
      options: modelOptions,
      internal: "internalValue",
    });
    filterColumns.push({
      name: "Level",
      id: "level",
      type: "stringOptions",
      options: observationLevelOptions,
      internal: "internalValue",
    });
  }
  if (queryConfig.view === "scores-categorical") {
    filterColumns.push({
      name: "Score String Value",
      id: "stringValue",
      type: "string",
      internal: "internalValue",
    });
  }
  if (queryConfig.view === "scores-numeric") {
    filterColumns.push({
      name: "Score Value",
      id: "value",
      type: "number",
      internal: "internalValue",
    });
  }

  const availableViewOptions = viewVersion === "v2" ? viewsV2 : views;

  const availableMetrics = useMemo(() => {
    const viewDeclaration = viewDeclarations[viewVersion][queryConfig.view];
    return Object.entries(viewDeclaration.measures)
      .map(([key]) => ({ value: key, label: startCase(key) }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
      );
  }, [queryConfig.view, viewVersion]);

  const validAggregations = useMemo(() => {
    const measureType =
      viewDeclarations[viewVersion][queryConfig.view]?.measures?.[
        queryConfig.measure
      ]?.type;
    return getValidAggregationsForMeasureType(measureType);
  }, [viewVersion, queryConfig.view, queryConfig.measure]);

  const availableDimensions = useMemo(() => {
    const viewDeclaration = viewDeclarations[viewVersion][queryConfig.view];
    return Object.entries(viewDeclaration.dimensions)
      .filter(([, dim]) => !dim.uiHidden)
      .map(([key]) => ({ value: key, label: startCase(key) }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
      );
  }, [queryConfig.view, viewVersion]);

  // Sync aggregation to a valid value when measure or view changes
  useEffect(() => {
    if (
      queryConfig.measure === "count" &&
      queryConfig.aggregation !== "count"
    ) {
      onChange({ ...queryConfig, aggregation: "count" });
    } else if (
      queryConfig.measure !== "count" &&
      !validAggregations.includes(queryConfig.aggregation)
    ) {
      onChange({
        ...queryConfig,
        aggregation:
          validAggregations[0] ?? ("sum" as z.infer<typeof metricAggregations>),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryConfig.measure, queryConfig.view, validAggregations]);

  const handleFiltersChange: (newState: FilterState) => void = (filters) => {
    onChange({ ...queryConfig, filters });
  };

  return (
    <div className="space-y-4">
      {/* View Selection */}
      <div className="space-y-2">
        <Label>View</Label>
        <Select
          value={queryConfig.view}
          onValueChange={(value) => {
            const newView = value as z.infer<typeof views>;
            onChange({
              ...queryConfig,
              view: newView,
              measure: "count",
              aggregation: "count" as z.infer<typeof metricAggregations>,
              dimension: "none",
              filters: queryConfig.filters.filter(
                (f) => f.column !== "stringValue" && f.column !== "value",
              ),
            });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a view" />
          </SelectTrigger>
          <SelectContent>
            {availableViewOptions.options.map((view) => (
              <WidgetPropertySelectItem
                key={view}
                value={view}
                label={startCase(view)}
                description={viewDeclarations[viewVersion][view].description}
              />
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Metric + Aggregation */}
      <div className="space-y-2">
        <Label>Metric</Label>
        <div className="space-y-2">
          <Select
            value={queryConfig.measure}
            onValueChange={(value) =>
              onChange({
                ...queryConfig,
                measure: value,
                aggregation:
                  value === "count"
                    ? ("count" as z.infer<typeof metricAggregations>)
                    : (validAggregations[0] ??
                      ("sum" as z.infer<typeof metricAggregations>)),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select metric" />
            </SelectTrigger>
            <SelectContent>
              {availableMetrics.map((metric) => {
                const meta =
                  viewDeclarations[viewVersion][queryConfig.view]?.measures?.[
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
          {queryConfig.measure !== "count" && (
            <Select
              value={queryConfig.aggregation}
              onValueChange={(value) =>
                onChange({
                  ...queryConfig,
                  aggregation: value as z.infer<typeof metricAggregations>,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select aggregation" />
              </SelectTrigger>
              <SelectContent>
                {validAggregations.map((agg) => (
                  <SelectItem key={agg} value={agg}>
                    {startCase(agg)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <Label>Filters</Label>
        <InlineFilterBuilder
          columns={filterColumns}
          filterState={queryConfig.filters}
          onChange={handleFiltersChange}
          columnsWithCustomSelect={[
            "environment",
            "traceName",
            "tags",
            "providedModelName",
          ]}
        />
      </div>

      {/* Breakdown Dimension */}
      {supportsBreakdown && selectedChartType !== "PIVOT_TABLE" && (
        <div className="space-y-2">
          <Label>Breakdown Dimension (Optional)</Label>
          <Select
            value={queryConfig.dimension}
            onValueChange={(value) =>
              onChange({ ...queryConfig, dimension: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a dimension" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {availableDimensions.map((dimension) => {
                const meta =
                  viewDeclarations[viewVersion][queryConfig.view]?.dimensions?.[
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
      )}
    </div>
  );
}

/**
 * Builds the query filters for an AdditionalQueryConfig, applying the same
 * legacy-UI-table filter mapping used by the main query in WidgetForm.
 */
export function buildAdditionalQueryFilters(config: AdditionalQueryConfig) {
  return mapLegacyUiTableFilterToView(config.view, config.filters);
}
