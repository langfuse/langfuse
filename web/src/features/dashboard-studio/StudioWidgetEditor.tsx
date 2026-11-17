import { useState } from "react";
import {
  StudioWidgetConfigSchema,
  type StudioWidgetConfig,
  type FilterState,
} from "@langfuse/shared";
import { PlayIcon, PlusIcon, TrashIcon, XIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { StudioQueryWidget } from "./StudioQueryWidget";
import { StudioSeriesEditor } from "./StudioSeriesEditor";
import { createStudioQuery, studioChartOptions } from "./catalog";
import { useDashboardStudioCapture } from "./analytics";

export function StudioWidgetEditor({
  initialValue,
  projectId,
  readPath,
  dateRange,
  filterState,
  onApply,
  onCancel,
}: {
  initialValue: StudioWidgetConfig;
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
  const track = useDashboardStudioCapture(readPath === "v4");
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
    <aside className="ph-no-capture bg-muted/20 order-first flex min-w-0 flex-col border-l xl:order-last">
      <div className="bg-background flex items-center justify-between gap-2 border-b p-4">
        <div>
          <h2 className="font-bold">Build your widget</h2>
          <p className="text-muted-foreground text-xs">
            Ask a question. Compare populations. See the result.
          </p>
        </div>
        <IconButton label="Close editor" icon={XIcon} onClick={onCancel} />
      </div>
      <div className="flex flex-col gap-5 p-4">
        <div className="h-72">
          <StudioQueryWidget
            projectId={projectId}
            config={preview}
            readPath={readPath}
            dateRange={dateRange}
            filterState={filterState}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            Changes run when you update the preview.
          </span>
          <Button
            text="Run preview"
            icon={PlayIcon}
            variant="outline"
            size="sm"
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
        </div>
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
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-bold">Compare series</h3>
            <p className="text-muted-foreground text-xs">
              Each series has its own source and conditions.
            </p>
          </div>
          {config.queries.map((query) => (
            <StudioSeriesEditor
              key={query.id}
              query={query}
              isV4={readPath === "v4"}
              timeSeries={
                config.display.timeSeries ??
                config.display.chartType.endsWith("TIME_SERIES")
              }
              projectId={projectId}
              dateRange={dateRange}
              onChange={(next) => {
                setConfig({
                  ...config,
                  queries: config.queries.map((item) =>
                    item.id === query.id ? next : item,
                  ),
                });
                if (next.scoreTarget !== query.scoreTarget)
                  track("configuration_changed", {
                    ...metadata,
                    scoreTarget: next.scoreTarget ?? "all",
                    scope: "widget",
                  });
                if (
                  JSON.stringify(next.filters) !== JSON.stringify(query.filters)
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
                      setConfig({
                        ...config,
                        queries: config.queries.filter(
                          (item) => item.id !== query.id,
                        ),
                      });
                      track("series_removed", metadata);
                    }
                  : undefined
              }
            />
          ))}
          {config.queries.length < 8 ? (
            <Button
              text="Add another series"
              icon={PlusIcon}
              variant="outline"
              onClick={() => {
                const id = `q${Date.now()}`;
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
        <div className="flex flex-col gap-3 border-t pt-4">
          <h3 className="text-sm font-bold">Make it yours</h3>
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
                  display: { ...config.display, legend: checked === true },
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
                  defaultValue={config.display.histogramEdges?.join(", ") ?? ""}
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
                Choose a histogram aggregation in the metric above. Boundaries
                use the metric’s original unit.
              </p>
            </div>
          ) : null}
        </div>
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-bold">
            Calculated metrics
          </summary>
          <div className="flex flex-col gap-3 pt-3">
            <p className="text-muted-foreground text-xs">
              Use stable references such as a.count / b.count. Formulas apply to
              aligned aggregate results.
            </p>
            {config.expressions.map((expression) => (
              <div
                className="flex flex-col gap-2 rounded border p-2"
                key={expression.id}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{expression.id}</span>
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
                        id: `formula_${Date.now()}`,
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
        {error ? (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        ) : null}
        <div className="bg-background flex items-center justify-between gap-2 rounded-lg border p-3">
          <Button text="Cancel" variant="ghost" onClick={onCancel} />
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
    </aside>
  );
}
