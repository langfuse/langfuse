import {
  type StudioQuery,
  type StudioMetric,
  getValidAggregationsForMeasureType,
} from "@langfuse/shared";
import { PlusIcon, TrashIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { getStudioSource, readableField, studioSourceOptions } from "./catalog";
import { StudioFilterEditor } from "./StudioFilterEditor";

function MetricEditor({
  metric,
  source,
  onChange,
  onRemove,
}: {
  metric: StudioMetric;
  source: ReturnType<typeof getStudioSource>;
  onChange: (metric: StudioMetric) => void;
  onRemove: (() => void) | undefined;
}) {
  const measure = source.measures[metric.measure];
  const aggregations = getValidAggregationsForMeasureType(measure?.type);
  return (
    <div className="bg-muted/40 flex flex-col gap-2 rounded-md p-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground min-w-12 font-mono text-xs">
          {metric.id}
        </span>
        <div className="min-w-0 flex-1">
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
        {onRemove ? (
          <IconButton
            icon={TrashIcon}
            label="Remove metric"
            size="sm"
            onClick={onRemove}
          />
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
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
        <Input
          aria-label="Metric label"
          placeholder="Optional metric label"
          value={metric.label ?? ""}
          onChange={(event) =>
            onChange({ ...metric, label: event.target.value })
          }
        />
      </div>
      {metric.aggregation.startsWith("p") ? (
        <label className="flex items-center gap-2 text-xs">
          Custom percentile
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

export function StudioSeriesEditor({
  query,
  isV4,
  timeSeries,
  projectId,
  dateRange,
  onChange: onQueryChange,
  onRemove,
}: {
  query: StudioQuery;
  isV4: boolean;
  timeSeries: boolean;
  projectId: string;
  dateRange: { from: Date; to: Date };
  onChange: (query: StudioQuery) => void;
  onRemove: (() => void) | undefined;
}) {
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
  return (
    <section className="bg-background flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="bg-primary/10 text-primary rounded px-2 py-1 font-mono text-xs font-bold">
          {query.id.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <Input
            aria-label={`Series ${query.id} name`}
            value={query.label}
            onChange={(event) =>
              onChange({ ...query, label: event.target.value })
            }
            placeholder="Series name"
          />
        </div>
        {onRemove ? (
          <IconButton
            label="Remove series"
            icon={TrashIcon}
            size="sm"
            onClick={onRemove}
          />
        ) : null}
      </div>
      <SelectInput
        aria-label={`Series ${query.id} source`}
        placeholder="Choose data"
        value={query.view}
        options={[...studioSourceOptions]}
        onValueChange={(view) =>
          onChange({
            ...query,
            view,
            scoreTarget: view.startsWith("scores-")
              ? (query.scoreTarget ?? "all")
              : undefined,
            dimensions: [],
            metrics: [{ id: "count", measure: "count", aggregation: "count" }],
            filters: [],
            orderBy: undefined,
          })
        }
      />
      {query.view.startsWith("scores-") ? (
        <label className="flex flex-col gap-1.5 text-xs font-bold">
          Score target
          <SelectInput
            aria-label={`Series ${query.id} score target`}
            value={query.scoreTarget ?? "all"}
            placeholder="All score targets"
            options={[
              { value: "all", label: "All score targets" },
              { value: "trace", label: "Trace scores" },
              { value: "observation", label: "Observation scores" },
              { value: "session", label: "Session scores" },
              { value: "experiment", label: "Experiment scores" },
            ]}
            onValueChange={(scoreTarget) => onChange({ ...query, scoreTarget })}
          />
        </label>
      ) : null}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold">Measure</p>
        {query.metrics.map((metric, index) => (
          <MetricEditor
            key={metric.id}
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
          <Button
            text="Add metric"
            icon={PlusIcon}
            size="sm"
            variant="ghost"
            onClick={() => {
              const id = `metric_${Date.now()}`;
              onChange({
                ...query,
                metrics: [
                  ...query.metrics,
                  { id, measure: "count", aggregation: "count" },
                ],
              });
            }}
          />
        ) : null}
      </div>
      <StudioFilterEditor
        projectId={projectId}
        view={query.view}
        isV4={isV4}
        dateRange={dateRange}
        filters={query.filters}
        onChange={(filters) => onChange({ ...query, filters })}
      />
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold">Break down by</p>
        {query.dimensions.map((dimension, index) => (
          <div className="flex items-center gap-2" key={index}>
            <div className="min-w-0 flex-1">
              <SelectInput
                aria-label="Breakdown field"
                placeholder="Field"
                value={dimension.field}
                options={Object.entries(source.dimensions)
                  .filter(([, definition]) => !definition.uiHidden)
                  .map(([value]) => ({ value, label: readableField(value) }))}
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
          <Button
            text="Add breakdown"
            icon={PlusIcon}
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({
                ...query,
                dimensions: [
                  ...query.dimensions,
                  {
                    field:
                      Object.keys(source.dimensions).find(
                        (field) =>
                          !source.dimensions[field]?.uiHidden &&
                          !query.dimensions.some(
                            (item) => item.field === field,
                          ),
                      ) ?? "name",
                  },
                ],
              })
            }
          />
        ) : null}
      </div>
      <details className="rounded-md border p-2">
        <summary className="cursor-pointer text-xs font-bold">
          Sort results
        </summary>
        <div className="flex flex-col gap-2 pt-2">
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
                  label:
                    metric.label ||
                    `${metric.percentile ? `p${metric.percentile}` : metric.aggregation} ${readableField(metric.measure)}`,
                })),
              ...[
                ...new Set([
                  ...query.dimensions.map((dimension) => dimension.field),
                  ...query.metrics.flatMap(
                    (metric) =>
                      source.measures[metric.measure]?.requiresDimension ?? [],
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
                          direction: query.orderBy?.[0]?.direction ?? "desc",
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
            For category charts and tables. Time series follow time order.
          </p>
        </div>
      </details>
      <label className="text-muted-foreground flex items-center gap-2 text-xs">
        <Checkbox
          checked={query.hidden ?? false}
          onCheckedChange={(hidden) =>
            onChange({ ...query, hidden: hidden === true })
          }
        />
        Use only in formulas
      </label>
    </section>
  );
}
