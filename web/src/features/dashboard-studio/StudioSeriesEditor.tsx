import {
  type StudioQuery,
  type StudioMetric,
  getValidAggregationsForMeasureType,
} from "@langfuse/shared";
import { useId, useState } from "react";
import {
  PlusIcon,
  TrashIcon,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  CopyPlusIcon,
  SlidersHorizontal,
} from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { PopoverController } from "@/src/components/ui/popover";
import { getStudioSource, readableField, studioSourceOptions } from "./catalog";
import { StudioFilterEditor } from "./StudioFilterEditor";

function MetricDetails({
  queryId,
  metric,
  source,
  onChange,
}: {
  queryId: string;
  metric: StudioMetric;
  source: ReturnType<typeof getStudioSource>;
  onChange: (metric: StudioMetric) => void;
}) {
  const measure = source.measures[metric.measure];
  const aggregations = getValidAggregationsForMeasureType(measure?.type);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-muted-foreground text-xs">Metric</span>
          <SelectInput
            aria-label="Measure"
            placeholder="Measure"
            value={metric.measure}
            options={Object.entries(source.measures).map(
              ([value, definition]) => ({
                value,
                label: readableField(value),
                description: definition.description,
              }),
            )}
            onValueChange={(value) => {
              const next = source.measures[value];
              onChange({
                ...metric,
                measure: value,
                summary: undefined,
                percentile: undefined,
                aggregation:
                  next?.defaultAggregation ??
                  (value === "count" ? "count" : "sum"),
              });
            }}
          />
        </div>
      </div>
      <details className="text-xs">
        <summary className="text-muted-foreground cursor-pointer">
          Metric options
        </summary>
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground text-xs">Aggregation</span>
            <SelectInput
              aria-label="Aggregation"
              placeholder="Aggregation"
              value={metric.aggregation}
              options={aggregations.map((value) => ({
                value,
                label: value.startsWith("p")
                  ? `${value.slice(1)}th percentile`
                  : readableField(value),
              }))}
              onValueChange={(aggregation) =>
                onChange({
                  ...metric,
                  aggregation,
                  percentile: undefined,
                  summary: undefined,
                })
              }
            />
          </div>

          <p className="text-muted-foreground text-xs">
            Formula reference:{" "}
            <code>
              {queryId}.{metric.id}
            </code>
          </p>
          <Input
            aria-label="Metric label"
            placeholder="Optional metric label"
            value={metric.label ?? ""}
            onChange={(event) =>
              onChange({ ...metric, label: event.target.value })
            }
          />
        </div>
      </details>
      {metric.aggregation.startsWith("p") ? (
        <label className="flex items-center gap-2 text-xs">
          Custom percentile
          <div className="w-24 shrink-0">
            <Input
              aria-label="Custom percentile"
              type="number"
              min={0.01}
              max={99.99}
              value={metric.percentile ?? Number(metric.aggregation.slice(1))}
              onChange={(event) =>
                onChange({
                  ...metric,
                  percentile: Number(event.target.value),
                  summary: undefined,
                })
              }
            />
          </div>
        </label>
      ) : null}
      {measure?.requiresDimension || metric.summary ? (
        <details className="rounded border p-2">
          <summary className="cursor-pointer text-xs font-bold">
            Full-period headline
          </summary>
          <div className="flex flex-col gap-2 pt-2">
            <p className="text-muted-foreground text-xs">
              Choose the total to show above this grouped metric. It includes
              values outside the visible breakdown.
            </p>
            <SelectInput
              aria-label="Headline measure"
              placeholder="Choose a total"
              value={metric.summary?.measure ?? "automatic"}
              options={[
                { value: "automatic", label: "No separate total" },
                ...Object.entries(source.measures)
                  .filter(
                    ([, candidate]) =>
                      !candidate.requiresDimension &&
                      (!measure?.unit || candidate.unit === measure.unit),
                  )
                  .map(([value]) => ({ value, label: readableField(value) })),
              ]}
              onValueChange={(value) =>
                onChange({
                  ...metric,
                  summary:
                    value === "automatic"
                      ? undefined
                      : {
                          measure: value,
                          aggregation:
                            source.measures[value]?.defaultAggregation ??
                            metric.aggregation,
                        },
                })
              }
            />
            {metric.summary ? (
              <SelectInput
                aria-label="Headline aggregation"
                placeholder="Aggregation"
                value={metric.summary.aggregation}
                options={getValidAggregationsForMeasureType(
                  source.measures[metric.summary.measure]?.type,
                )
                  .filter((value) => value !== "histogram")
                  .map((value) => ({ value, label: readableField(value) }))}
                onValueChange={(aggregation) => {
                  if (metric.summary)
                    onChange({
                      ...metric,
                      summary: { ...metric.summary, aggregation },
                    });
                }}
              />
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function metricCaption(metric: StudioMetric): string {
  const field = readableField(metric.measure).toLowerCase();
  if (
    metric.measure === "count" &&
    (metric.aggregation === "count" || metric.aggregation === "sum")
  )
    return "Count";
  if (metric.aggregation.startsWith("p"))
    return `p${metric.percentile ?? metric.aggregation.slice(1)} ${field}`;
  if (metric.aggregation === "sum")
    return field.startsWith("total ")
      ? readableField(metric.measure)
      : `Total ${field}`;
  const prefix: Record<string, string> = {
    avg: "Average",
    min: "Minimum",
    max: "Maximum",
    uniq: "Distinct",
    histogram: "Distribution of",
    count: "Count",
  };
  return `${prefix[metric.aggregation] ?? readableField(metric.aggregation)} ${field}`;
}

function MetricEditor(
  props: Parameters<typeof MetricDetails>[0] & {
    onRemove: (() => void) | undefined;
  },
) {
  const { onRemove, ...detailsProps } = props;
  const caption = props.metric.label || metricCaption(props.metric);
  return (
    <div className="flex min-w-0 items-center gap-1">
      <PopoverController
        align="start"
        disabled={false}
        modal={false}
        ariaLabel={`Metric ${props.queryId}.${props.metric.id}`}
        contentClassName="ph-no-capture w-96 max-w-[calc(100vw-2rem)]"
        renderContent={({ closePopover }) => (
          <div className="flex flex-col gap-3">
            <MetricDetails {...detailsProps} />
            <div className="flex justify-end">
              <Button
                text="Done"
                variant="secondary"
                size="sm"
                onClick={closePopover}
              />
            </div>
          </div>
        )}
      >
        {({ Trigger }) => (
          <Trigger asChild>
            <button
              type="button"
              aria-label={`Edit metric ${props.queryId}.${props.metric.id}: ${caption}`}
              className="border-border-contrast hover:bg-accent flex h-8 min-w-0 items-center gap-2 rounded-md border px-2 text-xs font-medium"
            >
              <span className="truncate" title={caption}>
                {caption}
              </span>
              <ChevronDown size="sm" color="tertiary" />
            </button>
          </Trigger>
        )}
      </PopoverController>
      {onRemove ? (
        <IconButton
          icon={TrashIcon}
          label="Remove metric"
          size="sm"
          onClick={onRemove}
        />
      ) : null}
    </div>
  );
}

export function StudioSeriesEditor({
  query,
  isV4,
  timeSeries,
  projectId,
  dateRange,
  onChange: onQueryChange,
  onRemove,
  onDuplicate,
  filtersValid = true,
  onFilterValidityChange,
}: {
  query: StudioQuery;
  isV4: boolean;
  timeSeries: boolean;
  projectId: string;
  dateRange: { from: Date; to: Date };
  onChange: (query: StudioQuery) => void;
  onRemove: (() => void) | undefined;
  onDuplicate?: () => void;
  filtersValid?: boolean;
  onFilterValidityChange?: (valid: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const bodyId = useId();
  const source = getStudioSource(query.view, isV4);
  const onChange = (next: StudioQuery) => {
    const fields = new Set([
      ...next.metrics
        .filter((metric) => metric.aggregation !== "histogram")
        .map((metric) => `${metric.aggregation}_${metric.measure}`),
      ...next.dimensions.map((dimension) => dimension.field),
      ...next.metrics.flatMap(
        (metric) => source.measures[metric.measure]?.requiresDimension ?? [],
      ),
      ...(timeSeries ? ["time_dimension"] : []),
    ]);
    const orderBy = next.orderBy?.filter((order) => fields.has(order.field));
    onQueryChange({ ...next, orderBy: orderBy?.length ? orderBy : undefined });
  };
  const dimensions = Object.entries(source.dimensions).filter(
    ([, definition]) => !definition.uiHidden,
  );
  return (
    <section
      data-query-id={query.id}
      className="ph-no-capture bg-background min-w-0 rounded-lg border"
    >
      <div className="bg-muted/20 flex min-w-0 flex-wrap items-center gap-2 rounded-t-lg px-2 py-1">
        <IconButton
          label={`${collapsed ? "Expand" : "Collapse"} query ${query.id}`}
          icon={collapsed ? ChevronRight : ChevronDown}
          size="sm"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={() => setCollapsed(!collapsed)}
        />
        <span
          className="text-muted-foreground max-w-24 shrink-0 truncate font-mono text-xs font-medium"
          title={query.id}
        >
          {query.id.toUpperCase()}
        </span>
        {!filtersValid ? (
          <span className="text-destructive text-xs" role="status">
            Incomplete filter
          </span>
        ) : null}
        <div className="min-w-24 flex-1">
          <Input
            aria-label={`Query ${query.id} name`}
            value={query.label}
            onChange={(event) =>
              onChange({ ...query, label: event.target.value })
            }
            placeholder="Query name"
          />
        </div>
        <div className="order-1 w-full min-w-0 sm:order-none sm:w-44 sm:shrink-0">
          <SelectInput
            aria-label={`Query ${query.id} source`}
            placeholder="Choose data"
            value={query.view}
            options={[...studioSourceOptions]}
            onValueChange={(view) => {
              onFilterValidityChange?.(true);
              onChange({
                ...query,
                view,
                scoreTarget: view.startsWith("scores-")
                  ? (query.scoreTarget ?? "all")
                  : undefined,
                dimensions: [],
                metrics: [
                  { id: "count", measure: "count", aggregation: "count" },
                ],
                filters: [],
                orderBy: undefined,
              });
            }}
          />
        </div>
        <IconButton
          label={
            query.hidden
              ? `Show query ${query.id} in chart`
              : `Hide query ${query.id} from chart`
          }
          icon={query.hidden ? EyeOff : Eye}
          size="sm"
          aria-pressed={query.hidden ?? false}
          onClick={() => onChange({ ...query, hidden: !query.hidden })}
        />
        {onDuplicate ? (
          <IconButton
            label="Duplicate query"
            icon={CopyPlusIcon}
            size="sm"
            onClick={onDuplicate}
          />
        ) : null}
        {onRemove ? (
          <IconButton
            label="Remove query"
            icon={TrashIcon}
            size="sm"
            onClick={onRemove}
          />
        ) : null}
      </div>
      <div
        id={bodyId}
        className={`${collapsed ? "hidden" : "flex"} min-w-0 flex-col gap-2 border-t px-3 py-1.5`}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-muted-foreground w-16 shrink-0 text-xs">
            Summarize
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {query.metrics.map((metric, index) => (
              <MetricEditor
                key={metric.id}
                queryId={query.id}
                metric={metric}
                source={source}
                onChange={(next) =>
                  onChange({
                    ...query,
                    metrics: query.metrics.map((item) =>
                      item.id === metric.id ? next : item,
                    ),
                  })
                }
                onRemove={
                  query.metrics.length > 1
                    ? () =>
                        onChange({
                          ...query,
                          metrics: query.metrics.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        })
                    : undefined
                }
              />
            ))}
            {query.metrics.length < 10 ? (
              <IconButton
                label="Add metric"
                icon={PlusIcon}
                size="sm"
                onClick={() => {
                  let index = 1;
                  while (
                    query.metrics.some(
                      (metric) => metric.id === `metric_${index}`,
                    )
                  )
                    index++;
                  onChange({
                    ...query,
                    metrics: [
                      ...query.metrics,
                      {
                        id: `metric_${index}`,
                        measure: "count",
                        aggregation: "count",
                      },
                    ],
                  });
                }}
              />
            ) : null}
          </div>
          <span className="text-muted-foreground text-xs">by</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {query.dimensions.map((dimension, index) => (
              <div className="flex w-44 min-w-0 items-center gap-1" key={index}>
                <div className="min-w-0 flex-1">
                  <SelectInput
                    aria-label="Breakdown field"
                    placeholder="Field"
                    value={dimension.field}
                    options={dimensions.map(([value]) => ({
                      value,
                      label: readableField(value),
                    }))}
                    onValueChange={(field) =>
                      onChange({
                        ...query,
                        dimensions: query.dimensions.map((item, itemIndex) =>
                          itemIndex === index ? { field } : item,
                        ),
                      })
                    }
                  />
                </div>
                <IconButton
                  icon={TrashIcon}
                  label="Remove breakdown"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...query,
                      dimensions: query.dimensions.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    })
                  }
                />
              </div>
            ))}
            {query.dimensions.length < 3 ? (
              <div className="w-40 min-w-0">
                <SelectInput
                  noCapture
                  aria-label="Add breakdown"
                  placeholder={
                    query.dimensions.length ? "Add grouping" : "Everything"
                  }
                  value=""
                  options={[
                    ...dimensions
                      .filter(
                        ([field]) =>
                          !query.dimensions.some(
                            (dimension) => dimension.field === field,
                          ),
                      )
                      .map(([value]) => ({
                        value,
                        label: readableField(value),
                      })),
                    ...((query.view === "observations" ||
                      query.view === "traces") &&
                    !source.dimensions.metadata
                      ? [
                          {
                            value: "__metadata",
                            label: "Metadata key",
                            disabled: true as const,
                            disabledReason:
                              "Grouping by a metadata key is not available yet. Use query filters to compare keys.",
                          },
                        ]
                      : []),
                  ]}
                  onValueChange={(field) =>
                    onChange({
                      ...query,
                      dimensions: [...query.dimensions, { field }],
                    })
                  }
                />
              </div>
            ) : null}
          </div>
          {query.view.startsWith("scores-") ? (
            <div className="w-40">
              <SelectInput
                aria-label={`Query ${query.id} score target`}
                value={query.scoreTarget ?? "all"}
                placeholder="All score targets"
                options={[
                  { value: "all", label: "All score targets" },
                  { value: "trace", label: "Trace scores" },
                  { value: "observation", label: "Observation scores" },
                  { value: "session", label: "Session scores" },
                  { value: "experiment", label: "Experiment scores" },
                ]}
                onValueChange={(scoreTarget) =>
                  onChange({ ...query, scoreTarget })
                }
              />
            </div>
          ) : null}
          <PopoverController
            align="end"
            disabled={false}
            modal={false}
            contentClassName="ph-no-capture w-80"
            ariaLabel={`Query ${query.id} options`}
            renderContent={({ closePopover }) => (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-medium">Sort results</p>
                <SelectInput
                  noCapture
                  aria-label="Sort by"
                  value={query.orderBy?.[0]?.field ?? "automatic"}
                  placeholder="Automatic"
                  options={[
                    { value: "automatic", label: "Automatic" },
                    ...query.metrics
                      .filter((metric) => metric.aggregation !== "histogram")
                      .map((metric) => ({
                        value: `${metric.aggregation}_${metric.measure}`,
                        label: metric.label || metricCaption(metric),
                      })),
                    ...[
                      ...new Set([
                        ...query.dimensions.map((dimension) => dimension.field),
                        ...query.metrics.flatMap(
                          (metric) =>
                            source.measures[metric.measure]
                              ?.requiresDimension ?? [],
                        ),
                      ]),
                    ].map((field) => ({
                      value: field,
                      label: readableField(field),
                    })),
                    ...(timeSeries
                      ? [{ value: "time_dimension", label: "Time" }]
                      : []),
                  ]}
                  onValueChange={(field) =>
                    onChange({
                      ...query,
                      orderBy:
                        field === "automatic"
                          ? undefined
                          : [
                              {
                                field,
                                direction:
                                  query.orderBy?.[0]?.direction ?? "desc",
                              },
                            ],
                    })
                  }
                />
                <SelectInput
                  aria-label="Sort direction"
                  value={query.orderBy?.[0]?.direction ?? "desc"}
                  placeholder="Direction"
                  disabled={!query.orderBy?.length}
                  options={[
                    { value: "desc", label: "Largest first" },
                    { value: "asc", label: "Smallest first" },
                  ]}
                  onValueChange={(direction) => {
                    const field = query.orderBy?.[0]?.field;
                    if (field)
                      onChange({ ...query, orderBy: [{ field, direction }] });
                  }}
                />
                <p className="text-muted-foreground text-xs">
                  Time series follow time order.
                </p>
                <div className="flex justify-end">
                  <Button
                    text="Done"
                    variant="secondary"
                    size="sm"
                    onClick={closePopover}
                  />
                </div>
              </div>
            )}
          >
            {({ Trigger }) => (
              <Trigger asChild>
                <IconButton
                  label="Query options"
                  icon={SlidersHorizontal}
                  size="sm"
                />
              </Trigger>
            )}
          </PopoverController>
        </div>
        <StudioFilterEditor
          key={query.view}
          projectId={projectId}
          view={query.view}
          isV4={isV4}
          dateRange={dateRange}
          onValidityChange={onFilterValidityChange}
          filters={query.filters}
          onChange={(filters) => onChange({ ...query, filters })}
        />
      </div>
    </section>
  );
}
