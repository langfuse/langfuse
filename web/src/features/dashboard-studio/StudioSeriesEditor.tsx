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
import { InlineEditText } from "@/src/components/design-system/InlineEditText/InlineEditText";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { PopoverController } from "@/src/components/ui/popover";
import { getStudioSource, readableField, studioSourceOptions } from "./catalog";
import { StudioFilterEditor } from "./StudioFilterEditor";
import { StudioScoreDefinitionPicker } from "./StudioScoreDefinitionPicker";
import { StudioScoreFilters } from "./StudioScoreFilters";
import { studioMetricCaption as metricCaption } from "./studioFormulaAuthoring";

function MetricDetails({
  queryId,
  metric,
  source,
  onChange,
  experimental = true,
}: {
  queryId: string;
  metric: StudioMetric;
  source: ReturnType<typeof getStudioSource>;
  onChange: (metric: StudioMetric) => void;
  experimental?: boolean;
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
            options={Object.entries(source.measures)
              .filter(([key]) => experimental || key !== "activeDays")
              .map(([value, definition]) => ({
                value,
                label: readableField(value),
                description: definition.description,
              }))}
            onValueChange={(value) => {
              const next = source.measures[value];
              onChange({
                ...metric,
                label: metric.label,
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
                  label: metric.label,
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
        </div>
      </details>
      <label className="flex min-w-0 flex-col gap-1 text-xs">
        Metric name
        <Input
          aria-label="Metric label"
          placeholder={metricCaption(metric)}
          value={metric.label ?? ""}
          onChange={(event) =>
            onChange({ ...metric, label: event.target.value })
          }
        />
      </label>
      {experimental && metric.aggregation.startsWith("p") ? (
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
              {props.metric.label &&
              props.metric.label !== metricCaption(props.metric) ? (
                <span
                  className="text-muted-foreground max-w-32 truncate"
                  title={metricCaption(props.metric)}
                >
                  {metricCaption(props.metric)}
                </span>
              ) : null}
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
  executionMode = "prototype",
  letter,
  expanded,
  onExpandedChange,
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
  executionMode?: "current" | "prototype";
  letter?: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [locallyCollapsed, setLocallyCollapsed] = useState(false);
  const collapsed = expanded === undefined ? locallyCollapsed : !expanded;
  const toggleExpanded = () =>
    onExpandedChange
      ? onExpandedChange(collapsed)
      : setLocallyCollapsed(!collapsed);
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
    ([field, definition]) =>
      !definition.uiHidden &&
      (executionMode !== "current" ||
        (field !== "scoreTarget" &&
          (!query.view.startsWith("scores-") ||
            [
              "name",
              "source",
              "dataType",
              "stringValue",
              "configId",
              "timestampDay",
              "timestampMonth",
            ].includes(field)))),
  );
  return (
    <section
      data-query-id={query.id}
      className={`ph-no-capture group/series min-w-0 rounded-md ${collapsed ? "hover:bg-muted/50" : "bg-muted/40"}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1 px-1.5 pt-2 pb-1">
        <IconButton
          label={`${collapsed ? "Expand" : "Collapse"} query ${query.id}`}
          icon={collapsed ? ChevronRight : ChevronDown}
          size="sm"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={toggleExpanded}
        />
        <span
          className="bg-foreground/7 text-foreground-secondary flex size-6 shrink-0 items-center justify-center rounded font-mono text-xs font-bold"
          title={`Series ${letter ?? query.id.toUpperCase()}`}
        >
          {letter ?? query.id.toUpperCase()}
        </span>
        {!filtersValid ? (
          <span className="text-destructive text-xs" role="status">
            Incomplete filter
          </span>
        ) : null}
        <div className="min-w-20 flex-1 text-sm font-medium">
          <InlineEditText
            aria-label={`Query ${query.id} name`}
            value={query.label}
            onSave={(label) => onChange({ ...query, label })}
            placeholder="Series name"
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
        <div className="flex gap-1 pointer-fine:opacity-0 pointer-fine:group-focus-within/series:opacity-100 pointer-fine:group-hover/series:opacity-100">
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
      </div>
      {collapsed ? (
        <p className="text-muted-foreground pr-2 pb-2 pl-10 text-xs leading-relaxed break-words">
          {
            studioSourceOptions.find((option) => option.value === query.view)
              ?.label
          }{" "}
          ·{" "}
          {query.metrics
            .map((metric) => metric.label || metricCaption(metric))
            .join(", ")}
          {query.dimensions.length
            ? ` · By ${query.dimensions.map((dimension) => readableField(dimension.field)).join(", ")}`
            : ""}
          {query.filters.length
            ? ` · ${query.filters.length} ${query.filters.length === 1 ? "filter" : "filters"}`
            : ""}
          {query.hidden ? " · Hidden in chart" : ""}
        </p>
      ) : null}
      <div
        id={bodyId}
        className={`${collapsed ? "hidden" : "flex"} min-w-0 flex-col gap-3 px-3.5 pt-2 pb-4`}
      >
        <label className="flex min-w-0 flex-col gap-1 text-xs">
          Data source
          <div className="w-full min-w-0">
            <SelectInput
              aria-label={`Query ${query.id} source`}
              placeholder="Choose data"
              value={query.view}
              options={[...studioSourceOptions]}
              onValueChange={(view) => {
                onFilterValidityChange?.(true);
                const defaults: Record<
                  string,
                  { type: string; label: string }
                > = {
                  "scores-numeric": { type: "NUMERIC", label: "Average score" },
                  "scores-boolean": {
                    type: "BOOLEAN",
                    label: "Pass rate (0–1)",
                  },
                  "scores-categorical": {
                    type: "CATEGORICAL",
                    label: "Score records",
                  },
                };
                const scoreDefaults = defaults[view];
                let metrics: StudioMetric[] = [
                  { id: "count", measure: "count", aggregation: "count" },
                ];
                const filters: StudioQuery["filters"] = [];
                if (scoreDefaults) {
                  metrics = [
                    {
                      id: "score",
                      measure:
                        view === "scores-categorical" ? "count" : "value",
                      aggregation:
                        view === "scores-categorical" ? "count" : "avg",
                      label: scoreDefaults.label,
                    },
                  ];
                  filters.push({
                    type: "string",
                    column: "dataType",
                    operator: "=",
                    value: scoreDefaults.type,
                  });
                }
                onChange({
                  ...query,
                  view,
                  scoreTarget: scoreDefaults
                    ? (query.scoreTarget ?? "all")
                    : undefined,
                  dimensions: [],
                  metrics,
                  filters,
                  orderBy: undefined,
                });
              }}
            />
          </div>
        </label>
        {query.view.startsWith("scores-") ? (
          <StudioScoreDefinitionPicker
            query={query}
            projectId={projectId}
            onChange={onChange}
          />
        ) : null}
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
                experimental={executionMode !== "current"}
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
                  const measures = [
                    "latency",
                    "totalCost",
                    "totalTokens",
                    "count",
                    ...Object.keys(source.measures),
                  ];
                  const nextMeasure = measures.find((field) => {
                    const measure = source.measures[field];
                    if (
                      !measure ||
                      (executionMode === "current" && field === "activeDays")
                    )
                      return false;
                    const aggregation =
                      measure.defaultAggregation ??
                      (field === "count" ? "count" : "sum");
                    return !query.metrics.some(
                      (metric) =>
                        metric.measure === field &&
                        metric.aggregation === aggregation,
                    );
                  });
                  if (!nextMeasure) return;
                  onChange({
                    ...query,
                    metrics: [
                      ...query.metrics,
                      {
                        id: `metric_${index}`,
                        measure: nextMeasure,
                        aggregation:
                          source.measures[nextMeasure]?.defaultAggregation ??
                          (nextMeasure === "count" ? "count" : "sum"),
                      },
                    ],
                  });
                }}
              />
            ) : null}
          </div>
          <span className="text-muted-foreground w-full text-xs">Group by</span>
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
            <details>
              <summary className="text-muted-foreground cursor-pointer text-xs">
                Score attachment (optional)
              </summary>
              <div className="w-48 pt-2">
                <SelectInput
                  aria-label={`Query ${query.id} score target`}
                  value={query.scoreTarget ?? "all"}
                  placeholder="All score targets"
                  options={[
                    { value: "all", label: "All score targets" },
                    executionMode === "current"
                      ? {
                          value: "trace",
                          label: "Trace scores",
                          disabled: true,
                          disabledReason:
                            "Exact implicit trace scope needs a richer predicate.",
                        }
                      : { value: "trace", label: "Trace scores" },
                    { value: "observation", label: "Observation scores" },
                    { value: "session", label: "Session scores" },
                    { value: "experiment", label: "Experiment scores" },
                  ]}
                  onValueChange={(scoreTarget) =>
                    onChange({ ...query, scoreTarget })
                  }
                />
              </div>
            </details>
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
        {query.view.startsWith("scores-") && executionMode === "current" ? (
          <StudioScoreFilters
            query={query}
            projectId={projectId}
            isV4={isV4}
            dateRange={dateRange}
            onValidityChange={onFilterValidityChange}
            onChange={(filters) => onChange({ ...query, filters })}
          />
        ) : (
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
        )}
      </div>
    </section>
  );
}
