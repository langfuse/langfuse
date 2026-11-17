import { useState } from "react";
import {
  StudioWidgetConfigSchema,
  type StudioWidgetConfig,
  type FilterState,
} from "@langfuse/shared";
import { PlayIcon, PlusIcon, TrashIcon, ArrowLeftIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { StudioQueryWidget } from "./StudioQueryWidget";
import { StudioSeriesEditor } from "./StudioSeriesEditor";
import { createStudioQuery, studioChartOptions } from "./catalog";
import { useDashboardStudioCapture } from "./analytics";
import { resolveStudioQueryVersion, withStudioQueries } from "./studioConfig";

function nextStudioId(config: StudioWidgetConfig, kind: "query" | "formula") {
  const used = new Set(
    [...config.queries, ...config.expressions].map((item) => item.id),
  );
  if (kind === "query") {
    const letter = [..."abcdefghijklmnopqrstuvwxyz"].find(
      (id) => !used.has(id),
    );
    if (letter) return letter;
  }
  const prefix = kind === "query" ? "q" : "formula_";
  let index = 1;
  while (used.has(`${prefix}${index}`)) index++;
  return `${prefix}${index}`;
}

export function StudioWidgetEditor({
  initialValue,
  isNew,
  projectId,
  readPath,
  dateRange,
  filterState,
  onApply,
  onCancel,
}: {
  initialValue: StudioWidgetConfig;
  isNew: boolean;
  projectId: string;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date };
  filterState: FilterState;
  onApply: (config: StudioWidgetConfig) => void;
  onCancel: () => void;
}) {
  const [config, setConfig] = useState(initialValue);
  const [preview, setPreview] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const queryVersion = resolveStudioQueryVersion(
    config,
    readPath === "v4" ? "v2" : "v1",
    filterState,
  );
  const track = useDashboardStudioCapture(queryVersion === "v2");
  const metadata = {
    widgetKind: "query" as const,
    chartType: config.display.chartType,
    queryCount: config.queries.length,
    expressionCount: config.expressions.length,
    seriesCount: config.queries.reduce(
      (sum, query) => sum + query.metrics.length,
      0,
    ),
  };
  const validate = () => {
    const parsed = StudioWidgetConfigSchema.safeParse(config);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(". "));
      return null;
    }
    setError(null);
    return parsed.data;
  };
  return (
    <section
      aria-label="Widget editor"
      className="ph-no-capture bg-background flex h-full min-h-0 min-w-0 flex-col"
    >
      <div className="bg-background flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            text="Back"
            icon={ArrowLeftIcon}
            variant="ghost"
            onClick={onCancel}
          />
          <h1 className="text-base font-bold">
            {isNew ? "New chart" : "Edit widget"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            text="Run preview"
            icon={PlayIcon}
            variant="outline"
            onClick={() => {
              const next = validate();
              if (next) {
                setPreview(next);
                track("configuration_changed", {
                  ...metadata,
                  scope: "widget",
                });
              }
            }}
          />
          <Button
            text="Apply widget"
            onClick={() => {
              const next = validate();
              if (next) {
                onApply(next);
                track("widget_saved", metadata);
              }
            }}
          />
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          className="bg-destructive/5 text-destructive shrink-0 border-b px-4 py-3 text-sm lg:px-6"
        >
          {error}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="bg-muted/20 flex flex-col gap-2 border-b px-4 py-3 lg:px-6">
          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-1 text-xs">
            <span className="font-bold">Preview</span>
            <span>
              {dateRange.from.toLocaleDateString()} –{" "}
              {dateRange.to.toLocaleDateString()}
              {filterState.length
                ? ` · ${filterState.length} dashboard filters`
                : ""}
            </span>
          </div>
          <div className="h-64 min-w-0 md:h-80">
            <StudioQueryWidget
              projectId={projectId}
              config={preview}
              readPath={readPath}
              dateRange={dateRange}
              filterState={filterState}
            />
          </div>
        </div>
        <Tabs
          defaultValue="data"
          onValueChange={(value) =>
            track("view_changed", {
              ...metadata,
              scope: "widget",
              target: (
                {
                  data: "configuration_data",
                  visualization: "configuration_visualization",
                  details: "configuration_details",
                } as const
              )[value as "data" | "visualization" | "details"],
            })
          }
        >
          <Tabs.List variant="underline" aria-label="Widget configuration">
            <Tabs.Trigger value="data" label="Queries" />
            <Tabs.Trigger value="visualization" label="Visualization" />
            <Tabs.Trigger value="details" label="Details" />
          </Tabs.List>
          <Tabs.Content value="data">
            <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
              <div className="flex flex-col gap-3">
                {config.queries.map((query) => (
                  <StudioSeriesEditor
                    key={query.id}
                    query={query}
                    isV4={queryVersion === "v2"}
                    timeSeries={
                      config.display.timeSeries ??
                      config.display.chartType.endsWith("TIME_SERIES")
                    }
                    projectId={projectId}
                    dateRange={dateRange}
                    onChange={(next) => {
                      setConfig(
                        withStudioQueries(
                          config,
                          config.queries.map((item) =>
                            item.id === query.id ? next : item,
                          ),
                        ),
                      );
                      if (next.scoreTarget !== query.scoreTarget)
                        track("configuration_changed", {
                          ...metadata,
                          scoreTarget: next.scoreTarget ?? "all",
                          scope: "widget",
                        });
                      if (
                        JSON.stringify(next.filters) !==
                        JSON.stringify(query.filters)
                      )
                        track("filter_applied", {
                          ...metadata,
                          filterCount: next.filters.length,
                          scope: "widget",
                        });
                    }}
                    onRemove={
                      config.queries.length > 1
                        ? () => {
                            setConfig(
                              withStudioQueries(
                                config,
                                config.queries.filter(
                                  (item) => item.id !== query.id,
                                ),
                              ),
                            );
                            track("series_removed", metadata);
                          }
                        : undefined
                    }
                  />
                ))}
                {config.queries.length < 8 ? (
                  <Button
                    text="Add query"
                    icon={PlusIcon}
                    variant="outline"
                    onClick={() => {
                      const id = nextStudioId(config, "query");
                      setConfig({
                        ...config,
                        queries: [...config.queries, createStudioQuery(id)],
                      });
                      track("series_added", {
                        ...metadata,
                        queryCount: config.queries.length + 1,
                      });
                    }}
                  />
                ) : null}
              </div>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-bold">
                  Calculated metrics
                </summary>
                <div className="flex flex-col gap-3 pt-3">
                  <p className="text-muted-foreground text-xs">
                    Use stable references such as a.count / b.count. Formulas
                    apply to aligned aggregate results.
                  </p>
                  {config.expressions.map((expression) => (
                    <div
                      className="flex flex-col gap-2 rounded border p-2"
                      key={expression.id}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">
                          {expression.id}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Input
                            aria-label="Formula name"
                            value={expression.label}
                            onChange={(event) =>
                              setConfig({
                                ...config,
                                expressions: config.expressions.map((item) =>
                                  item.id === expression.id
                                    ? { ...item, label: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        </div>
                        <IconButton
                          label="Remove formula"
                          icon={TrashIcon}
                          size="sm"
                          onClick={() =>
                            setConfig({
                              ...config,
                              expressions: config.expressions.filter(
                                (item) => item.id !== expression.id,
                              ),
                            })
                          }
                        />
                      </div>
                      <Input
                        aria-label="Formula"
                        value={expression.formula}
                        placeholder="a.count / b.count"
                        onChange={(event) =>
                          setConfig({
                            ...config,
                            expressions: config.expressions.map((item) =>
                              item.id === expression.id
                                ? { ...item, formula: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                      <SelectInput
                        aria-label="Formula format"
                        placeholder="Number"
                        value={expression.unit ?? "number"}
                        options={[
                          { value: "number", label: "Number" },
                          { value: "percent", label: "Percent (0–1)" },
                          { value: "USD", label: "US dollars" },
                        ]}
                        onValueChange={(unit) =>
                          setConfig({
                            ...config,
                            expressions: config.expressions.map((item) =>
                              item.id === expression.id
                                ? {
                                    ...item,
                                    unit: unit === "number" ? undefined : unit,
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                  {config.expressions.length < 8 ? (
                    <Button
                      text="Add formula"
                      icon={PlusIcon}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setConfig({
                          ...config,
                          expressions: [
                            ...config.expressions,
                            {
                              id: nextStudioId(config, "formula"),
                              label: "Calculated metric",
                              formula: `${config.queries[0]?.id}.${config.queries[0]?.metrics[0]?.id}`,
                            },
                          ],
                        })
                      }
                    />
                  ) : null}
                </div>
              </details>
            </div>
          </Tabs.Content>
          <Tabs.Content value="visualization">
            <div className="px-4 py-4 lg:px-6">
              <div className="mx-auto flex max-w-4xl flex-col gap-4">
                <h3 className="text-sm font-bold">Chart settings</h3>
                <SelectInput
                  aria-label="Visualization"
                  placeholder="Choose a chart"
                  value={config.display.chartType}
                  options={[...studioChartOptions]}
                  onValueChange={(chartType) => {
                    const timeSeries = chartType.endsWith("TIME_SERIES");
                    setConfig({
                      ...config,
                      display: { ...config.display, chartType, timeSeries },
                      queries: timeSeries
                        ? config.queries
                        : config.queries.map((query) => {
                            const orderBy = query.orderBy?.filter(
                              (order) => order.field !== "time_dimension",
                            );
                            return {
                              ...query,
                              orderBy: orderBy?.length ? orderBy : undefined,
                            };
                          }),
                    });
                    track("configuration_changed", {
                      ...metadata,
                      chartType,
                      scope: "display",
                    });
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1.5 text-xs">
                    Value format
                    <SelectInput
                      aria-label="Value format"
                      placeholder="Automatic"
                      value={config.display.unit ?? "auto"}
                      options={[
                        { value: "auto", label: "Automatic" },
                        { value: "percent", label: "Percent (0–1)" },
                        { value: "USD", label: "US dollars" },
                        { value: "milliseconds", label: "Milliseconds" },
                        { value: "tokens", label: "Tokens" },
                      ]}
                      onValueChange={(unit) =>
                        setConfig({
                          ...config,
                          display: {
                            ...config.display,
                            unit: unit === "auto" ? undefined : unit,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs">
                    Maximum rows
                    <Input
                      aria-label="Maximum rows"
                      type="number"
                      min={1}
                      max={1000}
                      value={config.display.rowLimit ?? 100}
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          display: {
                            ...config.display,
                            rowLimit: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={config.display.showHeadline ?? false}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        display: {
                          ...config.display,
                          showHeadline: checked === true,
                        },
                      })
                    }
                  />
                  Show full-period headline
                </label>
                {config.display.showHeadline ? (
                  <SelectInput
                    noCapture
                    aria-label="Headline metric"
                    placeholder="Choose a headline metric"
                    value={config.display.headlineMetricRef ?? "automatic"}
                    options={[
                      { value: "automatic", label: "Automatic (one metric)" },
                      ...config.queries
                        .filter((query) => !query.hidden)
                        .flatMap((query) =>
                          query.metrics.map((metric) => ({
                            value: `${query.id}.${metric.id}`,
                            label: `${query.label} · ${metric.label || `${metric.aggregation} ${metric.measure}`}`,
                          })),
                        ),
                    ]}
                    onValueChange={(headlineMetricRef) =>
                      setConfig({
                        ...config,
                        display: {
                          ...config.display,
                          headlineMetricRef:
                            headlineMetricRef === "automatic"
                              ? undefined
                              : headlineMetricRef,
                        },
                      })
                    }
                  />
                ) : null}
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={config.display.legend ?? true}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        display: {
                          ...config.display,
                          legend: checked === true,
                        },
                      })
                    }
                  />
                  Show legend
                </label>
                {config.display.chartType === "HISTOGRAM" ? (
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1 text-xs">
                      Number of bins
                      <Input
                        aria-label="Histogram bins"
                        type="number"
                        min={1}
                        max={100}
                        value={config.display.bins ?? 10}
                        onChange={(event) =>
                          setConfig({
                            ...config,
                            display: {
                              ...config.display,
                              bins: Number(event.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      Custom boundaries
                      <Input
                        aria-label="Histogram boundaries"
                        placeholder="0, 1, 2, 5, 10"
                        defaultValue={
                          config.display.histogramEdges?.join(", ") ?? ""
                        }
                        onBlur={(event) => {
                          const raw = event.target.value.trim();
                          setConfig({
                            ...config,
                            display: {
                              ...config.display,
                              histogramEdges: raw
                                ? raw.split(",").map(Number)
                                : undefined,
                            },
                          });
                        }}
                      />
                    </label>
                    <p className="text-muted-foreground text-xs">
                      Choose a histogram aggregation in the metric above.
                      Boundaries use the metric’s original unit.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </Tabs.Content>
          <Tabs.Content value="details">
            <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-4 lg:px-6">
              <label className="flex flex-col gap-1.5 text-xs font-bold">
                Title
                <Input
                  aria-label="Widget title"
                  value={config.title}
                  onChange={(event) =>
                    setConfig({ ...config, title: event.target.value })
                  }
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-bold">
                Description
                <Input
                  aria-label="Widget description"
                  value={config.description}
                  onChange={(event) =>
                    setConfig({ ...config, description: event.target.value })
                  }
                  placeholder="What should someone take away?"
                />
              </label>
            </div>
          </Tabs.Content>
        </Tabs>
      </div>
    </section>
  );
}
