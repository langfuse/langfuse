import { type ComponentProps, useMemo } from "react";
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
import { SelectDropdown } from "@/src/components/design-system/SelectDropdown/SelectDropdown";
import {
  CompactConnectorRow,
  CompactPickerButton,
} from "@/src/features/filters";
import { ConnectedMetricsFilterBuilder } from "@/src/features/metrics";
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

/** countMeasure is the row-count measure, shown as "All" and only offered with the count aggregation. */
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
              <FormItem className="min-w-0 flex-1 space-y-0">
                <FormControl>
                  <SelectDropdown
                    value={field.value}
                    onValueChange={changeAggregation}
                    options={[...measuresByAggregation.keys()].map((a) => ({
                      value: a,
                      label: aggregationLabel(a),
                    }))}
                    aria-label="Aggregation"
                    disabled={disabled}
                  >
                    {({ getTriggerProps, selectedLabel }) => (
                      <CompactPickerButton {...getTriggerProps()}>
                        {selectedLabel}
                      </CompactPickerButton>
                    )}
                  </SelectDropdown>
                </FormControl>
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
              <FormItem className="min-w-0 flex-1 space-y-0">
                <FormControl>
                  <SelectDropdown
                    value={field.value as MonitorView}
                    onValueChange={changeView}
                    options={MonitorViewSchema.options.map(viewOption)}
                    aria-label="View"
                    disabled={disabled}
                  >
                    {({ getTriggerProps, selectedLabel }) => (
                      <CompactPickerButton {...getTriggerProps()}>
                        {selectedLabel}
                      </CompactPickerButton>
                    )}
                  </SelectDropdown>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="metric.measure"
            render={({ field }) => (
              <FormItem className="min-w-0 flex-1 space-y-0">
                <FormControl>
                  <SelectDropdown
                    value={field.value}
                    onValueChange={field.onChange}
                    options={measureOptions(
                      measuresByAggregation.get(aggregation) ?? [],
                      view,
                    )}
                    aria-label="Measure"
                    disabled={disabled}
                  >
                    {({ getTriggerProps, selectedLabel }) => (
                      <CompactPickerButton {...getTriggerProps()}>
                        <MeasureValue
                          measure={field.value}
                          label={selectedLabel}
                        />
                      </CompactPickerButton>
                    )}
                  </SelectDropdown>
                </FormControl>
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

/** MeasureValue shows the picked measure, with the row count as a muted "All". */
function MeasureValue({
  measure,
  label,
}: {
  measure: string;
  label: string | undefined;
}) {
  if (measure !== countMeasure) return label;
  return <span className="text-muted-foreground">All</span>;
}

/** viewOption is a view's dropdown option, explained by its description. */
function viewOption(view: MonitorView): SelectDropdownOption<MonitorView> {
  return {
    value: view,
    label: viewLabels[view],
    explanation: {
      title: viewLabels[view],
      description: viewDeclarations.v2[view]?.description ?? undefined,
    },
  };
}

/** measureOptions lists the measures as dropdown options, with the row count ahead of the field measures. */
function measureOptions(
  measureNames: string[],
  view: MonitorView,
): SelectDropdownNode<string>[] {
  const options = measureNames.map((name) => measureOption(name, view));
  const [first, ...rest] = options;
  if (measureNames[0] !== countMeasure || rest.length === 0) return options;
  return [
    first,
    { type: "group", id: "fields", label: "Fields", options: rest },
  ];
}

/** measureOption is a measure's dropdown option, explained by its description, unit and type. */
function measureOption(
  name: string,
  view: MonitorView,
): SelectDropdownOption<string> {
  const definition = viewDeclarations.v2[view]?.measures[name];
  const label = measureLabel(name, view);
  return {
    value: name,
    label,
    explanation: {
      title: label,
      description: definition?.description,
      badges: measureBadges(definition),
    },
  };
}

/** measureLabel renders a measure name, with the row count as "All <view>", e.g. "All observations". */
function measureLabel(measure: string, view: MonitorView): string {
  if (measure === countMeasure) return `All ${viewLabels[view].toLowerCase()}`;
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

/** measureBadges lists a measure's unit and type for its explanation. */
function measureBadges(
  definition: { unit?: string; type?: string } | undefined,
): { label: string; value: string }[] {
  const badges: { label: string; value: string }[] = [];
  if (definition?.unit) badges.push({ label: "Unit", value: definition.unit });
  if (definition?.type) badges.push({ label: "Type", value: definition.type });
  return badges;
}

/** SelectDropdownNode is an option or option group of a SelectDropdown. */
type SelectDropdownNode<V extends string> = ComponentProps<
  typeof SelectDropdown<V>
>["options"][number];

/** SelectDropdownOption is a single, ungrouped SelectDropdown option. */
type SelectDropdownOption<V extends string> = Exclude<
  SelectDropdownNode<V>,
  { type: "group" }
>;

/** MonitorAggregation is an aggregation a monitor metric can use. */
type MonitorAggregation = CreateMonitor["metric"]["aggregation"];

/** __test exposes private helpers to co-located tests without widening the module API. */
export const __test = { getMeasuresByAggregation };
