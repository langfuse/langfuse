import { type StudioWidgetConfig } from "@langfuse/shared";
import { Settings2 } from "@langfuse/icons";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { StudioChartTypePicker } from "./StudioChartTypePicker";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";

export function StudioWidgetAppearance({
  config,
  experimental = true,
  onChange,
  onChartTypeChange,
  onOpenChartType,
  onOpenSettings,
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
    <div
      className="flex min-w-0 items-center gap-1.5"
      role="group"
      aria-label="Widget appearance"
    >
      <div className="min-w-0">
        <StudioChartTypePicker
          value={config.display.chartType}
          onValueChange={onChartTypeChange}
          onOpenChartType={onOpenChartType}
        />
      </div>
      <DialogController
        renderDialog={() => (
          <Dialog title="Chart settings" closeLabel="Done" size="sm" noCapture>
            <Dialog.Body>
              <div className="flex flex-col gap-4">
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
                  {!["NUMBER", "PIVOT_TABLE"].includes(
                    config.display.chartType,
                  ) ? (
                    <label className="flex items-center justify-between gap-2 text-xs">
                      Show legend
                      <Checkbox
                        aria-label="Show legend"
                        checked={config.display.legend ?? true}
                        onCheckedChange={(checked) =>
                          onChange({
                            ...config,
                            display: {
                              ...config.display,
                              legend: checked === true,
                            },
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
                        options={[
                          { value: "none", label: "None" },
                          ...headlineMetrics,
                        ]}
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
                        {experimental ? (
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
                        ) : null}
                        <p className="text-muted-foreground text-xs">
                          Choose a histogram aggregation in the query.
                          Boundaries use the metric’s original unit.
                        </p>
                      </>
                    ) : null}
                  </div>
                </details>
              </div>
            </Dialog.Body>
          </Dialog>
        )}
      >
        {({ openDialog }) => (
          <IconButton
            label="Chart settings"
            icon={Settings2}
            variant="subtle"
            onClick={() => {
              onOpenSettings();
              openDialog();
            }}
          />
        )}
      </DialogController>
    </div>
  );
}

type StudioWidgetAppearanceProps = {
  experimental?: boolean;
  config: StudioWidgetConfig;
  onChange: (config: StudioWidgetConfig) => void;
  onChartTypeChange: (type: StudioWidgetConfig["display"]["chartType"]) => void;
  onOpenChartType?: () => void;
  onOpenSettings: () => void;
};
