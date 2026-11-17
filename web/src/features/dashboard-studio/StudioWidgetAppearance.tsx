import { type StudioWidgetConfig } from "@langfuse/shared";
import {
  ChartColumnIcon,
  ChartLineIcon,
  ChartAreaIcon,
  ChartBarIcon,
  ChartPieIcon,
  ChartColumnIncreasingIcon,
  HashIcon,
  TableIcon,
  type IconComponent,
} from "@langfuse/icons";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { MultiSelectTagInput } from "@/src/components/design-system/MultiSelectTagInput/MultiSelectTagInput";
import { studioChartOptions } from "./catalog";

const chartIcons: Record<
  StudioWidgetConfig["display"]["chartType"],
  IconComponent
> = {
  VERTICAL_BAR: ChartColumnIcon,
  LINE_TIME_SERIES: ChartLineIcon,
  AREA_TIME_SERIES: ChartAreaIcon,
  BAR_TIME_SERIES: ChartColumnIcon,
  HORIZONTAL_BAR: ChartBarIcon,
  NUMBER: HashIcon,
  PIVOT_TABLE: TableIcon,
  HISTOGRAM: ChartColumnIncreasingIcon,
  PIE: ChartPieIcon,
};

export function StudioWidgetAppearance({
  config,
  series,
  onChange,
  onChartTypeChange,
  onHiddenSeriesChange,
}: StudioWidgetAppearanceProps) {
  const headlineMetrics = config.queries
    .filter(
      (query) =>
        !query.hidden &&
        (!config.display.activeQueryIds?.length ||
          config.display.activeQueryIds.includes(query.id)),
    )
    .flatMap((query) =>
      query.metrics.map((metric) => ({
        value: `${query.id}.${metric.id}`,
        label: `${query.label} · ${metric.label || `${metric.aggregation} ${metric.measure}`}`,
      })),
    );
  const selectedHeadline = (() => {
    if (!config.display.showHeadline) return "none";
    if (config.display.headlineMetricRef) {
      if (
        headlineMetrics.some(
          (metric) => metric.value === config.display.headlineMetricRef,
        )
      )
        return config.display.headlineMetricRef;
    } else if (headlineMetrics.length === 1) return headlineMetrics[0]!.value;
    return "none";
  })();
  return (
    <aside
      aria-label="Widget appearance"
      className="ph-no-capture bg-background flex h-full min-h-0 min-w-0 flex-col"
    >
      <div className="flex h-11 shrink-0 items-center border-b px-4">
        <h2 className="text-sm font-bold">Appearance</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-bold">
            Title
            <Input
              aria-label="Widget title"
              value={config.title}
              maxLength={200}
              onChange={(event) =>
                onChange({ ...config, title: event.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs">
            Description
            <Input
              aria-label="Widget description"
              value={config.description}
              maxLength={10000}
              placeholder="Optional"
              onChange={(event) =>
                onChange({ ...config, description: event.target.value })
              }
            />
          </label>
        </div>
        <fieldset className="min-w-0">
          <legend className="mb-2 text-xs font-bold">Visualization</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {studioChartOptions.map((option) => {
              const Icon = chartIcons[option.value];
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={config.display.chartType === option.value}
                  onClick={() => onChartTypeChange(option.value)}
                  className="hover:bg-accent focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:text-primary flex min-h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-md border px-1 py-2 text-center text-[11px] leading-tight focus-visible:ring-2 focus-visible:outline-hidden"
                >
                  <Icon color="inherit" aria-hidden />
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-col gap-3 border-t pt-4">
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
                onChange({
                  ...config,
                  display: {
                    ...config.display,
                    unit: unit === "auto" ? undefined : unit,
                  },
                })
              }
            />
          </label>
          {!["NUMBER", "PIVOT_TABLE"].includes(config.display.chartType) ? (
            <label className="flex items-center justify-between gap-2 text-xs">
              Show legend
              <Checkbox
                aria-label="Show legend"
                checked={config.display.legend ?? true}
                onCheckedChange={(checked) =>
                  onChange({
                    ...config,
                    display: { ...config.display, legend: checked === true },
                  })
                }
              />
            </label>
          ) : null}
          {config.display.chartType !== "NUMBER" ? (
            <label className="flex flex-col gap-1.5 text-xs">
              Headline
              <SelectInput
                noCapture
                aria-label="Headline"
                placeholder="None"
                value={selectedHeadline}
                options={[{ value: "none", label: "None" }, ...headlineMetrics]}
                onValueChange={(headlineMetricRef) =>
                  onChange({
                    ...config,
                    display: {
                      ...config.display,
                      showHeadline: headlineMetricRef !== "none",
                      headlineMetricRef:
                        headlineMetricRef === "none"
                          ? undefined
                          : headlineMetricRef,
                    },
                  })
                }
              />
              <span className="text-muted-foreground">
                Summary across the full time range.
              </span>
            </label>
          ) : null}
        </div>
        {series.length ? (
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-xs font-bold">
              Displayed series ·{" "}
              {
                series.filter(
                  (item) => !config.display.hiddenSeriesIds?.includes(item.id),
                ).length
              }{" "}
              of {series.length}
            </summary>
            <div className="flex flex-col gap-2 pt-3">
              <MultiSelectTagInput
                noCapture
                aria-label="Displayed series"
                placeholder="No series displayed"
                searchPlaceholder="Search series"
                emptyMessage="No matching series"
                selectAllLabel="Select all"
                options={series.map((item) => ({
                  value: item.id,
                  label: item.label,
                }))}
                value={series
                  .filter(
                    (item) =>
                      !config.display.hiddenSeriesIds?.includes(item.id),
                  )
                  .map((item) => item.id)}
                onValueChange={(ids) =>
                  onHiddenSeriesChange(
                    series
                      .filter((item) => !ids.includes(item.id))
                      .map((item) => item.id),
                  )
                }
              />
              <p className="text-muted-foreground text-xs">
                Saved with this widget. Legend clicks are temporary.
              </p>
            </div>
          </details>
        ) : null}
        <details className="border-t pt-3">
          <summary className="cursor-pointer text-xs font-bold">
            Advanced
          </summary>
          <div className="flex flex-col gap-3 pt-3">
            <label className="flex flex-col gap-1.5 text-xs">
              Maximum rows
              <Input
                aria-label="Maximum rows"
                type="number"
                min={1}
                max={1000}
                value={config.display.rowLimit ?? 100}
                onChange={(event) =>
                  onChange({
                    ...config,
                    display: {
                      ...config.display,
                      rowLimit: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
            {config.display.chartType === "HISTOGRAM" ? (
              <>
                <label className="flex flex-col gap-1.5 text-xs">
                  Number of bins
                  <Input
                    aria-label="Histogram bins"
                    type="number"
                    min={1}
                    max={100}
                    value={config.display.bins ?? 10}
                    onChange={(event) =>
                      onChange({
                        ...config,
                        display: {
                          ...config.display,
                          bins: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs">
                  Custom boundaries
                  <Input
                    aria-label="Histogram boundaries"
                    placeholder="0, 1, 2, 5, 10"
                    defaultValue={
                      config.display.histogramEdges?.join(", ") ?? ""
                    }
                    onBlur={(event) => {
                      const raw = event.target.value.trim();
                      onChange({
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
                  Choose a histogram aggregation in the query. Boundaries use
                  the metric’s original unit.
                </p>
              </>
            ) : null}
          </div>
        </details>
      </div>
    </aside>
  );
}

type StudioWidgetAppearanceProps = {
  config: StudioWidgetConfig;
  series: { id: string; label: string }[];
  onChange: (config: StudioWidgetConfig) => void;
  onChartTypeChange: (type: StudioWidgetConfig["display"]["chartType"]) => void;
  onHiddenSeriesChange: (ids: string[]) => void;
};
