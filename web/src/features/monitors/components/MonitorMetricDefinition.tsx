import { useMemo } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { startCase } from "lodash";
import { type UseFormReturn } from "react-hook-form";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/src/components/ui/select";
import {
  CompactConnectorRow,
  CompactPickerButton,
} from "@/src/features/filters";
import { ConnectedMetricsFilterBuilder } from "@/src/features/metrics";
import { WidgetPropertySelectItem } from "@/src/features/widgets";
import { viewDeclarations, type FilterState } from "@langfuse/shared";
import {
  type CreateMonitor,
  getValidMonitorAggregationsForMeasure,
  type MonitorView,
  MonitorViewSchema,
  type UpdateMonitor,
} from "@langfuse/shared/monitors";
import { viewLabels } from "../helpers/monitorLabels";
import { aggregationLabel } from "../helpers/renderMonitorLabels";

/** countMeasure is the row-count measure, shown as "*" and only offered with the count aggregation. */
const countMeasure = "count";

/** MonitorMetricDefinition picks a monitor's metric as "[aggregation]", then "[view] [measure]", then filters. */
export const MonitorMetricDefinition = ({
  form,
  view,
  aggregation,
  projectId,
  filterOptionsLookbackFrom,
  disabled,
}: {
  form: UseFormReturn<CreateMonitor | UpdateMonitor>;
  view: MonitorView;
  aggregation: MonitorAggregation;
  projectId: string;
  filterOptionsLookbackFrom: Date;
  disabled: boolean;
}) => {
  const measuresByAggregation = useMemo(
    () => getMeasuresByAggregation(view),
    [view],
  );
  const measures = viewDeclarations.v2[view]?.measures ?? {};

  /** changeAggregation snaps the measure to the first one the new aggregation supports. */
  const changeAggregation = (next: MonitorAggregation) => {
    form.setValue("metric.aggregation", next, { shouldValidate: true });
    const validMeasures = measuresByAggregation.get(next) ?? [];
    if (!validMeasures.includes(form.getValues("metric.measure"))) {
      form.setValue("metric.measure", validMeasures[0] ?? countMeasure, {
        shouldValidate: true,
      });
    }
  };

  /** changeView resets the metric to a bare count when the new view lacks the measure or pairing. */
  const changeView = (next: MonitorView) => {
    form.setValue("view", next, { shouldValidate: true });
    const { measure, aggregation: currentAggregation } =
      form.getValues("metric");
    const validMeasures =
      getMeasuresByAggregation(next).get(currentAggregation) ?? [];
    if (!validMeasures.includes(measure)) {
      form.setValue(
        "metric",
        { measure: countMeasure, aggregation: "count" },
        { shouldValidate: true },
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <Label className="mb-2">Metric</Label>
        <div className="flex items-start gap-1.5">
          <FormField
            control={form.control}
            name="metric.aggregation"
            render={({ field }) => (
              <FormItem className="min-w-0 flex-1 space-y-1">
                <Select
                  value={field.value}
                  onValueChange={(next) =>
                    changeAggregation(next as MonitorAggregation)
                  }
                  disabled={disabled}
                >
                  <FormControl>
                    <SelectPrimitive.Trigger asChild aria-label="Aggregation">
                      <CompactPickerButton>
                        <SelectValue />
                      </CompactPickerButton>
                    </SelectPrimitive.Trigger>
                  </FormControl>
                  <SelectContent>
                    {[...measuresByAggregation.keys()].map((a) => (
                      <SelectItem key={a} value={a}>
                        {aggregationLabel(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <CompactConnectorRow indent="field" align="start">
          <FormField
            control={form.control}
            name="view"
            render={({ field }) => (
              <FormItem className="min-w-0 flex-1 space-y-1">
                <Select
                  value={field.value}
                  onValueChange={(next) => changeView(next as MonitorView)}
                  disabled={disabled}
                >
                  <FormControl>
                    <SelectPrimitive.Trigger asChild aria-label="View">
                      <CompactPickerButton>
                        <SelectValue />
                      </CompactPickerButton>
                    </SelectPrimitive.Trigger>
                  </FormControl>
                  <SelectContent>
                    {MonitorViewSchema.options.map((v) => (
                      <WidgetPropertySelectItem
                        key={v}
                        value={v}
                        label={viewLabels[v]}
                        description={
                          viewDeclarations.v2[v]?.description ?? undefined
                        }
                      />
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="metric.measure"
            render={({ field }) => (
              <FormItem className="min-w-0 flex-1 space-y-1">
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <FormControl>
                    <SelectPrimitive.Trigger asChild aria-label="Measure">
                      <CompactPickerButton>
                        <SelectValue />
                      </CompactPickerButton>
                    </SelectPrimitive.Trigger>
                  </FormControl>
                  <SelectContent>
                    {(measuresByAggregation.get(aggregation) ?? []).map((m) => (
                      <WidgetPropertySelectItem
                        key={m}
                        value={m}
                        label={measureLabel(m)}
                        description={measures[m]?.description}
                        unit={measures[m]?.unit}
                        type={measures[m]?.type}
                      />
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </CompactConnectorRow>
      </div>
      <FormField
        control={form.control}
        name="filters"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Filters</FormLabel>
            <FormControl>
              <ConnectedMetricsFilterBuilder
                version="v2"
                view={view}
                projectId={projectId}
                dateRange={{ from: filterOptionsLookbackFrom }}
                filters={(field.value ?? []) as FilterState}
                onChange={(next: FilterState) => field.onChange(next)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

/** measureLabel renders a measure name, with the row count shown as "*". */
function measureLabel(measure: string): string {
  if (measure === countMeasure) return "*";
  return startCase(measure);
}

/** getMeasuresByAggregation maps each aggregation to the view's measures it is valid for, count first. */
function getMeasuresByAggregation(
  view: MonitorView,
): Map<MonitorAggregation, string[]> {
  const measures = viewDeclarations.v2[view]?.measures ?? {};
  const byAggregation = new Map<MonitorAggregation, string[]>([["count", []]]);
  for (const [name, definition] of Object.entries(measures)) {
    for (const a of aggregationsForMeasure(name, definition)) {
      byAggregation.set(a, [...(byAggregation.get(a) ?? []), name]);
    }
  }
  return byAggregation;
}

/** aggregationsForMeasure lists a measure's valid aggregations, pinning the row count to count. */
function aggregationsForMeasure(
  name: string,
  definition: Parameters<typeof getValidMonitorAggregationsForMeasure>[0],
): MonitorAggregation[] {
  if (name === countMeasure) return ["count"];
  return getValidMonitorAggregationsForMeasure(definition);
}

/** MonitorAggregation is an aggregation a monitor metric can use. */
type MonitorAggregation = CreateMonitor["metric"]["aggregation"];

/** __test exposes private helpers to co-located tests without widening the module API. */
export const __test = { getMeasuresByAggregation };
