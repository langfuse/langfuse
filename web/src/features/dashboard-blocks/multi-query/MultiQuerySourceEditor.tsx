import { useState } from "react";
import {
  CopyPlusIcon,
  EyeIcon,
  EyeOff,
  PlusIcon,
  TrashIcon,
  ChevronDown,
  ChevronRight,
} from "@langfuse/icons";
import {
  getViewDeclaration,
  getValidAggregationsForMeasureType,
  isSuggestedWidgetView,
  resolveWidgetEditorVersion,
  views,
} from "@langfuse/shared/query";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { MultiSelectTagInput } from "@/src/components/design-system/MultiSelectTagInput/MultiSelectTagInput";
import { ConnectedMetricsFilterBuilder } from "@/src/features/metrics/components/ConnectedMetricsFilterBuilder";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { type MultiQueryWidgetContext } from "./useMultiQueryWidget";
import {
  readableMultiQueryField,
  multiQueryMetricLabel,
} from "./multiQueryModel";

import { type MultiQueryTab } from "@langfuse/shared/dashboards";

type MultiQuerySource = MultiQueryTab["queries"][number];

export function MultiQuerySourceEditor({
  source,
  index,
  context,
  expanded,
  onExpandedChange,
  onChange,
  onDuplicate,
  onRemove,
  hasInvalidFilters,
  onHasInvalidFiltersChange,
}: {
  source: MultiQuerySource;
  index: number;
  context: MultiQueryWidgetContext;
  expanded: boolean;
  onExpandedChange: () => void;
  onChange: (source: MultiQuerySource) => void;
  onDuplicate: (() => void) | undefined;
  onRemove: (() => void) | undefined;
  hasInvalidFilters: boolean;
  onHasInvalidFiltersChange: (hasInvalidFilters: boolean) => void;
}) {
  const [hasOpened, setHasOpened] = useState(expanded);
  const version = resolveWidgetEditorVersion({
    baseMinVersion: 1,
    activeVersion: context.readPath === "v4" ? "v2" : "v1",
    shape: {
      view: source.view,
      dimensions: source.dimensions,
      measures: source.metrics,
      filters: source.filters,
    },
  });
  const declaration = getViewDeclaration(source.view, version);
  const capture = usePostHogClientCapture();
  const track = (action: string, count?: number) =>
    capture("dashboard:block_interaction", {
      blockKind: "multiQuery",
      action,
      count,
      isV4: version === "v2",
    });
  const updateMetrics = (metrics: MultiQuerySource["metrics"]) => {
    const fields = new Set([
      ...metrics.map(
        (metric) =>
          `${metric.aggregation}_${declaration.measures[metric.measure]?.alias ?? metric.measure}`,
      ),
      ...source.dimensions.map((dimension) => dimension.field),
    ]);
    const orderBy = source.orderBy?.filter((order) => fields.has(order.field));
    onChange({
      ...source,
      metrics,
      orderBy: orderBy && orderBy.length > 0 ? orderBy : undefined,
    });
    track("multi_query_metric_changed", metrics.length);
  };
  return (
    <section className="ph-no-capture bg-background rounded-md">
      <div className="flex min-w-0 items-center gap-1 p-2">
        <IconButton
          label={`${expanded ? "Collapse" : "Expand"} series ${String.fromCharCode(65 + index)}`}
          icon={expanded ? ChevronDown : ChevronRight}
          size="sm"
          onClick={() => {
            setHasOpened(true);
            onExpandedChange();
          }}
          aria-expanded={expanded}
        />
        <span className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-xs font-bold">
          {String.fromCharCode(65 + index)}
        </span>
        <div className="min-w-0 flex-1">
          <Input
            aria-label={`Series ${String.fromCharCode(65 + index)} name`}
            value={source.label}
            placeholder="Series name"
            onChange={(event) =>
              onChange({ ...source, label: event.target.value })
            }
          />
        </div>
        {hasInvalidFilters ? (
          <span className="text-xs text-amber-600" role="status">
            Incomplete filter
          </span>
        ) : null}
        <IconButton
          label={
            source.hidden ? "Show series on chart" : "Hide series from chart"
          }
          icon={source.hidden ? EyeOff : EyeIcon}
          aria-pressed={!source.hidden}
          size="sm"
          onClick={() => {
            onChange({ ...source, hidden: !source.hidden || undefined });
            track("multi_query_series_visibility_changed");
          }}
        />
        {onDuplicate ? (
          <IconButton
            label="Duplicate series"
            icon={CopyPlusIcon}
            onClick={onDuplicate}
            size="sm"
          />
        ) : null}
        {onRemove ? (
          <IconButton
            label="Remove series"
            icon={TrashIcon}
            onClick={onRemove}
            size="sm"
          />
        ) : null}
      </div>
      {!expanded ? (
        <p className="text-muted-foreground px-3 pb-2 text-xs break-words">
          {source.metrics.map(multiQueryMetricLabel).join(", ")}
          {source.dimensions.length
            ? ` · By ${source.dimensions.map((dimension) => readableMultiQueryField(dimension.field)).join(", ")}`
            : ""}
          {source.filters.length > 0
            ? ` · ${source.filters.length} filter${source.filters.length === 1 ? "" : "s"}`
            : ""}
        </p>
      ) : null}
      {hasOpened || expanded ? (
        <div
          className={`${expanded ? "flex" : "hidden"} min-w-0 flex-col gap-3 border-t p-3`}
        >
          <label className="flex min-w-0 flex-col gap-1 text-xs">
            Data source
            <SelectInput
              aria-label="Data source"
              placeholder="Choose data"
              value={source.view}
              options={views.options
                .filter(
                  (view) =>
                    isSuggestedWidgetView(view, version) ||
                    view === source.view,
                )
                .map((view) => ({
                  value: view,
                  label: readableMultiQueryField(view.replaceAll("-", " ")),
                }))}
              onValueChange={(view) => {
                const score =
                  view === "scores-numeric" || view === "scores-boolean";
                onChange({
                  ...source,
                  view,
                  metrics: [
                    {
                      id: "value",
                      measure: score ? "value" : "count",
                      aggregation: score ? "avg" : "count",
                    },
                  ],
                  dimensions: [],
                  orderBy: undefined,
                });
                track("multi_query_source_changed");
              }}
            />
          </label>
          {source.view.startsWith("scores-") ? (
            <p className="text-muted-foreground text-xs">
              Individual score records · score timestamp · all attachment types
              unless filtered.
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium">Metrics</span>
            {source.metrics.map((metric) => (
              <div
                key={metric.id}
                className="flex flex-col gap-1.5 rounded border p-2"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <SelectInput
                      noCapture
                      aria-label="Metric"
                      placeholder="Choose metric"
                      value={metric.measure}
                      options={Object.keys(declaration.measures).map(
                        (measure) => ({
                          value: measure,
                          label: readableMultiQueryField(measure),
                        }),
                      )}
                      onValueChange={(measure) =>
                        updateMetrics(
                          source.metrics.map((item) =>
                            item.id === metric.id
                              ? {
                                  ...item,
                                  measure,
                                  aggregation:
                                    declaration.measures[measure]
                                      ?.defaultAggregation ??
                                    (measure === "count" ? "count" : "sum"),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  {source.metrics.length > 1 && (
                    <IconButton
                      label={
                        metric.hidden
                          ? "Show metric on chart"
                          : "Hide metric from chart"
                      }
                      icon={metric.hidden ? EyeOff : EyeIcon}
                      aria-pressed={!metric.hidden}
                      size="sm"
                      onClick={() => {
                        updateMetrics(
                          source.metrics.map((item) =>
                            item.id === metric.id
                              ? { ...item, hidden: !metric.hidden || undefined }
                              : item,
                          ),
                        );
                        track("multi_query_metric_visibility_changed");
                      }}
                    />
                  )}
                  {source.metrics.length > 1 ? (
                    <IconButton
                      label="Remove metric"
                      icon={TrashIcon}
                      size="sm"
                      onClick={() =>
                        updateMetrics(
                          source.metrics.filter(
                            (item) => item.id !== metric.id,
                          ),
                        )
                      }
                    />
                  ) : null}
                </div>
                <SelectInput
                  aria-label="Aggregation"
                  placeholder="Choose aggregation"
                  value={metric.aggregation}
                  options={(metric.measure === "count"
                    ? ["count" as const]
                    : getValidAggregationsForMeasureType(
                        declaration.measures[metric.measure]?.type,
                      )
                  ).map((aggregation) => ({
                    value: aggregation,
                    label: aggregation.startsWith("p")
                      ? `${aggregation.slice(1)}th percentile`
                      : readableMultiQueryField(aggregation),
                  }))}
                  onValueChange={(aggregation) =>
                    updateMetrics(
                      source.metrics.map((item) =>
                        item.id === metric.id ? { ...item, aggregation } : item,
                      ),
                    )
                  }
                />
                <details className="text-xs">
                  <summary className="text-muted-foreground cursor-pointer">
                    Metric name
                  </summary>
                  <div className="pt-2">
                    <Input
                      aria-label="Metric name"
                      value={metric.label ?? ""}
                      placeholder={multiQueryMetricLabel({
                        ...metric,
                        label: undefined,
                      })}
                      onChange={(event) =>
                        onChange({
                          ...source,
                          metrics: source.metrics.map((item) =>
                            item.id === metric.id
                              ? {
                                  ...item,
                                  label: event.target.value || undefined,
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </div>
                </details>
              </div>
            ))}
            {source.metrics.length < 5 ? (
              <Button
                text="Add metric"
                icon={PlusIcon}
                variant="ghost"
                size="sm"
                onClick={() => {
                  const measure = Object.keys(declaration.measures).find(
                    (measure) =>
                      !source.metrics.some(
                        (metric) =>
                          metric.measure === measure &&
                          metric.aggregation ===
                            (declaration.measures[measure]
                              ?.defaultAggregation ??
                              (measure === "count" ? "count" : "sum")),
                      ),
                  );
                  if (!measure) return;
                  let index = 1;
                  while (
                    source.metrics.some(
                      (metric) => metric.id === `metric_${index}`,
                    )
                  )
                    index++;
                  updateMetrics([
                    ...source.metrics,
                    {
                      id: `metric_${index}`,
                      measure,
                      aggregation:
                        declaration.measures[measure]?.defaultAggregation ??
                        (measure === "count" ? "count" : "sum"),
                    },
                  ]);
                }}
              />
            ) : null}
          </div>
          <label className="flex min-w-0 flex-col gap-1 text-xs">
            Group by
            <MultiSelectTagInput
              aria-label="Group by"
              value={source.dimensions.map((dimension) => dimension.field)}
              options={Object.entries(declaration.dimensions)
                .filter(([, definition]) => !definition.uiHidden)
                .map(([field]) => ({
                  value: field,
                  label: readableMultiQueryField(field),
                }))}
              placeholder="Everything"
              searchPlaceholder="Find a field"
              emptyMessage="No grouping fields"
              onValueChange={(fields) => {
                const dimensions = fields
                  .slice(0, 3)
                  .map((field) => ({ field }));
                const orderBy = source.orderBy?.filter(
                  (order) =>
                    source.metrics.some(
                      (metric) =>
                        order.field ===
                        `${metric.aggregation}_${metric.measure}`,
                    ) || fields.includes(order.field),
                );
                onChange({
                  ...source,
                  dimensions,
                  orderBy: orderBy && orderBy.length > 0 ? orderBy : undefined,
                });
                track("multi_query_grouping_changed", dimensions.length);
              }}
            />
          </label>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium">Series filters</span>
            <ConnectedMetricsFilterBuilder
              onHasInvalidFiltersChange={onHasInvalidFiltersChange}
              version={version}
              view={source.view}
              projectId={context.projectId}
              dateRange={context.dateRange}
              filters={source.filters}
              onChange={(filters) => {
                onChange({ ...source, filters });
                track("multi_query_filter_changed", filters.length);
              }}
            />
          </div>
          <details className="text-xs">
            <summary className="text-muted-foreground cursor-pointer">
              Sort results
            </summary>
            <div className="flex flex-col gap-2 pt-2">
              <SelectInput
                noCapture
                aria-label="Sort by"
                placeholder="Automatic"
                value={source.orderBy?.[0]?.field ?? "automatic"}
                options={[
                  { value: "automatic", label: "Automatic" },
                  ...source.metrics
                    .filter((metric) => metric.aggregation !== "histogram")
                    .map((metric) => ({
                      value: `${metric.aggregation}_${metric.measure}`,
                      label: multiQueryMetricLabel(metric),
                    })),
                  ...source.dimensions.map((dimension) => ({
                    value: dimension.field,
                    label: readableMultiQueryField(dimension.field),
                  })),
                ]}
                onValueChange={(field) => {
                  onChange({
                    ...source,
                    orderBy:
                      field === "automatic"
                        ? undefined
                        : [
                            {
                              field,
                              direction:
                                source.orderBy?.[0]?.direction ?? "desc",
                            },
                          ],
                  });
                  track("multi_query_sort_changed");
                }}
              />
              <SelectInput
                aria-label="Sort direction"
                placeholder="Largest first"
                value={source.orderBy?.[0]?.direction ?? "desc"}
                disabled={(source.orderBy?.length ?? 0) === 0}
                options={[
                  { value: "desc", label: "Largest first" },
                  { value: "asc", label: "Smallest first" },
                ]}
                onValueChange={(direction) => {
                  const field = source.orderBy?.[0]?.field;
                  if (field) {
                    onChange({ ...source, orderBy: [{ field, direction }] });
                    track("multi_query_sort_changed");
                  }
                }}
              />
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
