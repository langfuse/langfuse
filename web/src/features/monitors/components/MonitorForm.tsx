import React, { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import { type LucideIcon, Plus } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { startCase } from "lodash";

import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import {
  mapWidgetUiTableFilterToView,
  normalizeStoredWidgetFiltersForEditor,
} from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { WidgetPropertySelectItem } from "@/src/features/widgets/components/WidgetPropertySelectItem";
import {
  getWidgetColumnsWithCustomSelect,
  getWidgetFilterColumns,
} from "@/src/features/widgets/components/widgetFilterColumns";
import { normalizeSingleValueOptions } from "@/src/features/filters/lib/filter-transform";
import { cn } from "@/src/utils/tailwind";

import {
  CreateMonitorSchema,
  type CreateMonitor,
  getValidMonitorAggregationsForMeasure,
  getValidMonitorFilterColumns,
  type Monitor,
  type MonitorNoData,
  MonitorNoDataModeSchema,
  type MonitorRenotify,
  MonitorSeveritySchema,
  MonitorStatusSchema,
  type MonitorThresholdOperator,
  MonitorThresholdOperatorSchema,
  type MonitorView,
  MonitorViewSchema,
  type MonitorWindow,
  MonitorWindowSchema,
  UpdateMonitorSchema,
  type UpdateMonitor,
} from "@langfuse/shared/monitors";
import { viewDeclarations, type FilterState } from "@langfuse/shared";

import TagManager from "@/src/features/tag/components/TagManager";

import { MonitorChartPreview } from "./MonitorChartPreview";
import { MonitorAutomationsPanel } from "./MonitorAutomationsPanel";
import { MonitorSeverityBadge } from "./MonitorSeverityBadge";
import { Badge } from "@/src/components/ui/badge";

/** windowLabels maps each MonitorWindow enum value to a human label. */
const windowLabels: Record<MonitorWindow, string> = {
  "5m": "5 minutes",
  "10m": "10 minutes",
  "15m": "15 minutes",
  "30m": "30 minutes",
  "1h": "1 hour",
  "2h": "2 hours",
  "4h": "4 hours",
  "1d": "1 day",
  "2d": "2 days",
  "1w": "1 week",
};

/** operatorLabels maps each MonitorThresholdOperator to a natural-language label. */
const operatorLabels: Record<MonitorThresholdOperator, string> = {
  GT: "above",
  GTE: "above or equal to",
  LT: "below",
  LTE: "below or equal to",
  EQ: "equal to",
  NEQ: "not equal to",
};

/** operatorSymbol maps each MonitorThresholdOperator to a single math glyph. */
const operatorSymbol: Record<MonitorThresholdOperator, string> = {
  GT: ">",
  GTE: "≥",
  LT: "<",
  LTE: "≤",
  EQ: "=",
  NEQ: "≠",
};

/** viewLabels maps each MonitorView to a human label. */
const viewLabels: Record<MonitorView, string> = {
  observations: "Observations",
  "scores-numeric": "Scores (numeric)",
  "scores-categorical": "Scores (categorical)",
};

/** createDefaults returns the form defaults for a brand-new monitor. */
const createDefaults = (projectId: string): Partial<CreateMonitor> => ({
  projectId,
  view: "observations",
  filters: [],
  metric: { measure: "count", aggregation: "count" },
  window: "5m",
  thresholdOperator: MonitorThresholdOperatorSchema.enum.GT,
  warningThreshold: null,
  noData: { mode: MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO },
  renotify: { mode: "OFF" },
  tags: [],
  triggerIds: [],
  status: MonitorStatusSchema.enum.ACTIVE,
});

/** monitorToDefaults maps a persisted Monitor into the edit form's defaults. */
const monitorToDefaults = (monitor: Monitor): UpdateMonitor => ({
  id: monitor.id,
  projectId: monitor.projectId,
  view: monitor.view,
  // Stored filters use the view's dimension names (e.g. "environment"); the
  // InlineFilterBuilder works in UI-table column space (e.g. "Environment").
  // Translate on load so the builder shows the right rows.
  filters: normalizeStoredWidgetFiltersForEditor(monitor.view, monitor.filters)
    .editorFilters,
  metric: monitor.metric,
  window: monitor.window,
  thresholdOperator: monitor.thresholdOperator,
  alertThreshold: monitor.alertThreshold,
  warningThreshold: monitor.warningThreshold,
  noData: monitor.noData,
  renotify: monitor.renotify,
  name: monitor.name,
  tags: monitor.tags,
  triggerIds: monitor.triggerIds,
  // status omitted: the pause/resume toolbar owns it.
});

/** nameOrPlaceholder falls back to the placeholder when the name is blank. */
const nameOrPlaceholder = (
  name: string | undefined,
  placeholder: string,
): string => name || placeholder;

/** MonitorForm renders the create/edit form for a Monitor. */
export const MonitorForm = ({
  projectId,
  monitor,
  onNameChange,
}: {
  projectId: string;
  monitor?: Monitor;
  /** onNameChange fires on every form change so the host (e.g. the edit page header) can mirror the live name. */
  onNameChange?: (name: string) => void;
}) => {
  /** router is the Next router used to redirect after a successful create. */
  const router = useRouter();
  /** isEdit is true when the form is bound to an existing monitor. */
  const isEdit = Boolean(monitor);
  /** hasAccess gates write controls behind the monitors:CUD RBAC scope. */
  const hasAccess = useHasProjectAccess({ projectId, scope: "monitors:CUD" });
  /** utils is the tRPC utils handle used to invalidate caches after mutations. */
  const utils = api.useUtils();

  /** schema selects the Zod schema to validate against based on isEdit. */
  const schema = isEdit ? UpdateMonitorSchema : CreateMonitorSchema;
  /** defaultValues seeds the form from the existing monitor on edit, otherwise from createDefaults. */
  const defaultValues = isEdit
    ? monitorToDefaults(monitor as Monitor)
    : createDefaults(projectId);

  /** namePlaceholderRef holds the latest computed name placeholder for the resolver. */
  const namePlaceholderRef = useRef("");

  /** resolver wraps zodResolver, mapping filter columns into view-space and filling a blank name with the computed placeholder before validation. */
  const resolver = useMemo(() => {
    const base = zodResolver(schema as any);
    return ((values, context, options) => {
      const v = values as {
        view: MonitorView;
        filters?: FilterState;
        name?: string;
      };
      const mapped = {
        ...values,
        name: nameOrPlaceholder(v.name, namePlaceholderRef.current),
        filters: mapWidgetUiTableFilterToView(v.view, v.filters ?? []),
      };
      return base(mapped as any, context, options);
    }) as typeof base;
  }, [schema]);

  /** form is the react-hook-form instance bound to schema and defaultValues. */
  const form = useForm<CreateMonitor | UpdateMonitor>({
    resolver,
    defaultValues: defaultValues as CreateMonitor,
    mode: "onChange",
  });

  /** createMutation creates a new monitor and returns to the monitors list on success. */
  const createMutation = api.monitors.create.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.monitors.invalidate();
      showSuccessToast({
        title: "Monitor created",
        description: `"${variables.name}" is now active.`,
      });
      router.replace(`/project/${projectId}/monitors`);
    },
    onError: (e) => showErrorToast("Failed to create monitor", e.message),
  });

  /** updateMutation saves edits to an existing monitor and returns to the monitors list on success. */
  const updateMutation = api.monitors.update.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.monitors.invalidate();
      showSuccessToast({
        title: "Monitor saved",
        description: `Your changes to "${variables.name}" have been applied.`,
      });
      router.replace(`/project/${projectId}/monitors`);
    },
    onError: (e) => showErrorToast("Failed to save monitor", e.message),
  });

  /** onSubmit normalizes filter columns into view-space and dispatches the create or update mutation. */
  const onSubmit = form.handleSubmit(
    /** onValid normalize filter values before updating or saving the monitor  */
    (values) => {
      const normalizedValues = {
        ...values,
        filters: mapWidgetUiTableFilterToView(
          values.view as Parameters<typeof mapWidgetUiTableFilterToView>[0],
          (values.filters ?? []) as FilterState,
        ),
      } as typeof values;

      if (isEdit && monitor) {
        // status omitted: the pause/resume toolbar owns it.
        updateMutation.mutate({
          ...(normalizedValues as UpdateMonitor),
          id: monitor.id,
        });
      } else {
        createMutation.mutate(normalizedValues as CreateMonitor);
      }
    },
    /** onInvalid scroll to the first error message */
    () => {
      requestAnimationFrame(() => {
        document
          .querySelector('[id$="-form-item-message"]')
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },
  );

  /** watched is the live snapshot of form values used to derive preview state, dropdown contents, and placeholders. */
  const watched = useWatch({ control: form.control });

  // Push the live name up to the host (e.g. the edit page header) so the page
  // title can mirror it as the user types instead of waiting for save.
  useEffect(() => {
    onNameChange?.(watched.name ?? "");
  }, [watched.name, onNameChange]);

  /** eventsFilterOptions loads the events v2 filter dictionary (environments, tags, models, …) for the picked view. */
  const eventsFilterOptions = api.events.filterOptions.useQuery(
    { projectId },
    {
      trpc: { context: { skipBatch: true } },
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  /** datasets loads dataset metadata for the project; used to label experiment-dataset filter options. */
  const datasets = api.datasets.allDatasetMeta.useQuery({ projectId });

  /** monitorFilterOptions loads the project's existing monitor tags for the tag picker's available-options list. */
  const monitorFilterOptions = api.monitors.getFilterOptions.useQuery(
    { projectId },
    { staleTime: Infinity, refetchOnWindowFocus: false },
  );

  /** filterColumnsParams collects the filter-column descriptor for InlineFilterBuilder, derived from the picked view and live option dictionaries. */
  const filterColumnsParams = useMemo(() => {
    const data = eventsFilterOptions.data;
    return {
      selectedView: (watched.view ?? "observations") as
        | "traces"
        | "observations"
        | "scores-numeric"
        | "scores-categorical",
      viewVersion: "v2" as const,
      environmentOptions: data?.environment ?? [],
      nameOptions: normalizeSingleValueOptions(data?.traceName),
      tagsOptions: data?.traceTags ?? [],
      modelOptions: data?.providedModelName ?? [],
      toolNamesOptions: data?.toolNames ?? [],
      calledToolNamesOptions: data?.calledToolNames ?? [],
      observationLevelOptions: [],
      experimentNameOptions: data?.experimentName ?? [],
      experimentDatasetOptions: (() => {
        const ids = new Set(
          (data?.experimentDatasetId ?? []).map((e) => e.value),
        );
        return (
          datasets.data
            ?.filter((d: { id: string }) => ids.has(d.id))
            .map((d: { id: string; name: string }) => ({
              value: d.id,
              displayValue: d.name,
            })) ?? []
        );
      })(),
      observationTypeOptions: [],
    };
  }, [eventsFilterOptions.data, datasets.data, watched.view]);

  /** filterColumns is the InlineFilterBuilder column schema for the picked view. */
  const filterColumns = useMemo(
    () =>
      getValidMonitorFilterColumns(getWidgetFilterColumns(filterColumnsParams)),
    [filterColumnsParams],
  );

  /** customSelectColumnIds is the set of filter columns that render a custom select control. */
  const customSelectColumnIds = useMemo(
    () => getWidgetColumnsWithCustomSelect(filterColumnsParams),
    [filterColumnsParams],
  );

  /** measureOptions is the list of measure names available on the currently picked view. */
  const measureOptions = useMemo(() => {
    const view = (watched.view ??
      "observations") as keyof (typeof viewDeclarations)["v2"];
    const measures = viewDeclarations.v2[view]?.measures ?? {};
    return Object.keys(measures);
  }, [watched.view]);

  /** aggregationOptions is the set of valid aggregations for the picked (view, measure) pair. */
  const aggregationOptions = useMemo(() => {
    const view = (watched.view ??
      "observations") as keyof (typeof viewDeclarations)["v2"];
    const measureName = watched.metric?.measure ?? "count";
    const measureDef = viewDeclarations.v2[view]?.measures[measureName];
    return getValidMonitorAggregationsForMeasure(measureDef);
  }, [watched.view, watched.metric?.measure]);

  /** namePlaceholder builds an auto-suggested name from the current view + metric + threshold (e.g. "Count of Observations > 0"). */
  const namePlaceholder = useMemo(() => {
    const view = (watched.view ?? "observations") as MonitorView;
    const measure = watched.metric?.measure ?? "count";
    const aggregation = watched.metric?.aggregation ?? "count";
    const op = (watched.thresholdOperator ??
      MonitorThresholdOperatorSchema.enum.GT) as MonitorThresholdOperator;
    const threshold = watched.alertThreshold;
    const aggLabel = startCase(aggregation);
    const viewLabel = viewLabels[view];
    const base =
      measure === "count"
        ? `${aggLabel} of ${viewLabel}`
        : `${aggLabel} of ${viewLabel} ${startCase(measure)}`;
    const value =
      threshold != null && Number.isFinite(threshold) ? threshold : 0;
    return `${base} ${operatorSymbol[op]} ${value}`;
  }, [
    watched.view,
    watched.metric?.measure,
    watched.metric?.aggregation,
    watched.thresholdOperator,
    watched.alertThreshold,
  ]);

  namePlaceholderRef.current = namePlaceholder;

  /** previewFilters translates the UI-table column filters into the view's dimension space for the preview query. */
  const previewFilters = useMemo<FilterState>(
    () =>
      mapWidgetUiTableFilterToView(
        (watched.view ?? "observations") as Parameters<
          typeof mapWidgetUiTableFilterToView
        >[0],
        (watched.filters ?? []) as FilterState,
      ),
    [watched.view, watched.filters],
  );

  /** formError is a typed view onto react-hook-form's flat error map. */
  const formError = form.formState.errors as Record<
    string,
    { message?: string } | undefined
  >;
  /** submitting is true while the form is submitting or either mutation is pending. */
  const submitting =
    form.formState.isSubmitting ||
    createMutation.isPending ||
    updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex h-full gap-4 overflow-hidden">
        <div className="h-full min-h-0 w-full min-w-107.5 md:w-1/3">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <CardTitle>Monitor Configuration</CardTitle>
              <CardDescription>
                Receive notifications when a metric crosses a threshold. (eg.
                &ldquo;sudden cost increase&rdquo;, &ldquo;accuracy has
                dropped&rdquo;)
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-0">
              <Section title="Metric Definition" step={1}>
                <FormField
                  control={form.control}
                  name="view"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>View</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(next) => {
                          field.onChange(next);
                          // Reset the metric whenever the view changes: the
                          // selected measure may not exist on the new view,
                          // which would leave the form in an unsubmittable
                          // state until the user manually picks one. "count"
                          // is always present and is the safe default.
                          const view =
                            next as keyof (typeof viewDeclarations)["v2"];
                          const measures =
                            viewDeclarations.v2[view]?.measures ?? {};
                          const currentMeasure =
                            form.getValues("metric.measure");
                          if (!(currentMeasure in measures)) {
                            form.setValue(
                              "metric",
                              { measure: "count", aggregation: "count" },
                              { shouldValidate: true },
                            );
                          }
                          // Clear filters too — UI-cased column ids only resolve
                          // against the view that's currently selected.
                          form.setValue("filters", [], {
                            shouldValidate: true,
                          });
                        }}
                        disabled={!hasAccess}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
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
                  render={({ field }) => {
                    const view = (watched.view ??
                      "observations") as keyof (typeof viewDeclarations)["v2"];
                    const measures = viewDeclarations.v2[view]?.measures ?? {};
                    return (
                      <FormItem>
                        <FormLabel>Measure</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(next) => {
                            field.onChange(next);
                            // The aggregation dropdown filters by the new
                            // measure, but the stored value can stay stale
                            // (e.g. "sum" against a string measure, or "p95"
                            // against `count`). Snap it to the first valid
                            // option whenever the current one isn't supported.
                            const validAggs =
                              getValidMonitorAggregationsForMeasure(
                                measures[next],
                              );
                            const currentAgg =
                              form.getValues("metric.aggregation");
                            if (!validAggs.includes(currentAgg)) {
                              form.setValue(
                                "metric.aggregation",
                                validAggs[0] ?? "count",
                                { shouldValidate: true },
                              );
                            }
                          }}
                          disabled={!hasAccess}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {measureOptions.map((m) => {
                              const meta = measures[m];
                              return (
                                <WidgetPropertySelectItem
                                  key={m}
                                  value={m}
                                  label={startCase(m)}
                                  description={meta?.description}
                                  unit={meta?.unit}
                                  type={meta?.type}
                                />
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                {watched.metric?.measure !== "count" && (
                  <FormField
                    control={form.control}
                    name="metric.aggregation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Aggregation</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={!hasAccess}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {aggregationOptions.map((a) => (
                              <SelectItem key={a} value={a}>
                                {startCase(a)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="filters"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Filters</FormLabel>
                      <FormControl>
                        <InlineFilterBuilder
                          columns={filterColumns}
                          filterState={(field.value ?? []) as FilterState}
                          onChange={(next: FilterState) => field.onChange(next)}
                          columnsWithCustomSelect={customSelectColumnIds}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {formError.query && (
                  <p className="text-destructive text-xs">
                    {formError.query.message}
                  </p>
                )}
              </Section>

              <Section title="Alert Conditions" step={2}>
                <FormField
                  control={form.control}
                  name="thresholdOperator"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                      <span className="text-muted-foreground text-sm whitespace-nowrap">
                        Trigger when the value is
                      </span>
                      <Select
                        value={field.value}
                        onValueChange={(next) => {
                          field.onChange(next);
                          // A warning band before a "not equal" alert has no
                          // meaningful ordering, so drop any stale value.
                          if (
                            next === MonitorThresholdOperatorSchema.enum.NEQ
                          ) {
                            form.setValue("warningThreshold", null, {
                              shouldValidate: true,
                            });
                          }
                        }}
                        disabled={!hasAccess}
                      >
                        <FormControl>
                          <SelectTrigger className="w-auto">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MonitorThresholdOperatorSchema.options.map((op) => (
                            <SelectItem key={op} value={op}>
                              {operatorLabels[op]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="alertThreshold"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <MonitorSeverityBadge
                          severity={MonitorSeveritySchema.enum.ALERT}
                        />
                        <span className="text-sm whitespace-nowrap">
                          Threshold
                        </span>
                        <span className="mr-1.5 ml-1 font-mono text-xs font-semibold">
                          {
                            operatorSymbol[
                              (watched.thresholdOperator ??
                                MonitorThresholdOperatorSchema.enum
                                  .GT) as keyof typeof operatorSymbol
                            ]
                          }
                        </span>
                        <FormControl>
                          <Input
                            type="number"
                            className="flex-1"
                            placeholder="0"
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              field.onChange(
                                raw === "" ? undefined : Number(raw),
                              );
                            }}
                            disabled={!hasAccess}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="warningThreshold"
                  render={({ field }) => (
                    <FormItem
                      hidden={
                        watched.thresholdOperator ===
                        MonitorThresholdOperatorSchema.enum.NEQ
                      }
                    >
                      <div className="flex items-center gap-2">
                        <MonitorSeverityBadge
                          severity={MonitorSeveritySchema.enum.WARNING}
                        />
                        <span className="text-sm whitespace-nowrap">
                          Threshold
                        </span>
                        <span className="mr-1.5 ml-1 font-mono text-xs font-semibold">
                          {
                            operatorSymbol[
                              (watched.thresholdOperator ??
                                MonitorThresholdOperatorSchema.enum
                                  .GT) as keyof typeof operatorSymbol
                            ]
                          }
                        </span>
                        <FormControl>
                          <Input
                            type="number"
                            className="flex-1"
                            placeholder="optional"
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              field.onChange(raw === "" ? null : Number(raw));
                            }}
                            disabled={!hasAccess}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {formError.threshold && (
                  <p className="text-destructive text-xs">
                    {formError.threshold.message}
                  </p>
                )}
                <FormField
                  control={form.control}
                  name="window"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                      <span className="text-muted-foreground text-sm whitespace-nowrap">
                        Over the past
                      </span>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!hasAccess}
                      >
                        <FormControl>
                          <SelectTrigger className="w-auto">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MonitorWindowSchema.options.map((w) => (
                            <SelectItem key={w} value={w}>
                              {windowLabels[w]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <Accordion type="single" collapsible>
                  <AccordionItem value="advanced" className="border-b-0">
                    <AccordionTrigger className="justify-start gap-2 py-2 text-sm font-medium [&>svg]:order-first [&>svg]:-rotate-90 [&[data-state=open]>svg]:rotate-0">
                      Advanced Options
                    </AccordionTrigger>
                    <AccordionContent className="space-y-6 px-1 pt-2">
                      <FormField
                        control={form.control}
                        name="noData"
                        render={({ field }) => (
                          <FormItem>
                            <NoDataField
                              value={field.value as MonitorNoData}
                              onChange={field.onChange}
                              disabled={!hasAccess}
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="renotify"
                        render={({ field }) => (
                          <FormItem>
                            <RenotifyField
                              value={field.value as MonitorRenotify}
                              onChange={field.onChange}
                              disabled={!hasAccess}
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </Section>

              <Section title="Notifications" step={3} className="pb-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          maxLength={200}
                          placeholder={namePlaceholder}
                          disabled={!hasAccess}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <TagManager
                          itemName="monitor"
                          tags={(field.value ?? []) as string[]}
                          allTags={
                            monitorFilterOptions.data?.tags.map(
                              (t) => t.value,
                            ) ?? []
                          }
                          hasAccess={hasAccess}
                          isLoading={monitorFilterOptions.isPending}
                          mutateTags={field.onChange}
                          triggerButton={
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              className="gap-1"
                            >
                              <Plus className="h-3 w-3" />
                              Add tag
                            </Button>
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="triggerIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Automations</FormLabel>
                      <FormMessage />
                      <FormDescription>
                        Send Alerts to Slack, Webhooks, and GitHub Actions.
                      </FormDescription>
                      <FormControl>
                        <MonitorAutomationsPanel
                          projectId={projectId}
                          hasAccess={hasAccess}
                          triggerIds={(field.value ?? []) as string[]}
                          onTriggerIdsChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </Section>
            </CardContent>
            <CardFooter className="mt-auto">
              <div className="flex-inherit w-full items-center pt-4">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={!hasAccess || submitting}
                >
                  {isEdit ? "Save Monitor" : "Create Monitor"}
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>

        <div className="hidden h-full w-2/3 min-w-107.5 flex-col gap-6 overflow-y-auto overscroll-contain md:flex">
          <MonitorChartPreview
            projectId={projectId}
            view={(watched.view ?? "observations") as MonitorView}
            filters={previewFilters}
            measure={watched.metric?.measure ?? "count"}
            aggregation={
              (watched.metric?.aggregation ??
                "count") as CreateMonitor["metric"]["aggregation"]
            }
            thresholdOperator={
              watched.thresholdOperator ??
              MonitorThresholdOperatorSchema.enum.GT
            }
            alertThreshold={watched.alertThreshold}
            warningThreshold={watched.warningThreshold ?? null}
          />
        </div>
      </form>
    </Form>
  );
};

/** Header pins a section title to the top of the scrolling CardContent. */
const Header = ({
  title,
  step,
  icon: Icon,
}: {
  title: string;
  step?: number;
  icon?: LucideIcon;
}) => (
  <div className="bg-card sticky top-0 z-10">
    <h3 className="flex items-center gap-2 py-2 text-lg font-bold">
      {step != null ? (
        <span className="bg-foreground text-background flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold">
          {step}
        </span>
      ) : null}
      {Icon ? <Icon className="h-5 w-5" aria-hidden="true" /> : null}
      {title}
    </h3>
  </div>
);

/** Section wraps a Header and its body in the layout used by every MonitorForm section. */
const Section = ({
  title,
  step,
  icon,
  children,
  className,
}: {
  title: string;
  step?: number;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) => (
  <div>
    <Header title={title} step={step} icon={icon} />
    <div className={cn("space-y-4 px-2 pb-4", className)}>{children}</div>
  </div>
);

/** NoDataField renders the no-data mode picker plus its dependent fields. */
const NoDataField = ({
  value,
  onChange,
  disabled,
}: {
  value: MonitorNoData;
  onChange: (next: MonitorNoData) => void;
  disabled?: boolean;
}) => (
  <div className="space-y-2">
    <Label>When there is no data</Label>
    <Select
      value={value.mode}
      onValueChange={(mode) =>
        onChange(
          mode === MonitorNoDataModeSchema.enum.NOTIFY_NO_DATA
            ? {
                mode: MonitorNoDataModeSchema.enum.NOTIFY_NO_DATA,
                intervalMinutes: 60,
              }
            : {
                mode: mode as Exclude<MonitorNoData["mode"], "NOTIFY_NO_DATA">,
              },
        )
      }
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO}>
          <span className="inline-flex items-center gap-1.5">
            Treat missing data as
            <code className="bg-secondary rounded border px-0.5">0</code>
          </span>
        </SelectItem>
        <SelectItem value={MonitorNoDataModeSchema.enum.LAST_SEVERITY}>
          <span className="inline-flex items-center gap-1.5">
            Keep the previous
            <Badge
              variant="secondary"
              className="w-20 justify-center bg-slate-500 py-1 text-slate-50 hover:bg-slate-500"
            >
              SEVERITY
            </Badge>
          </span>
        </SelectItem>
        <SelectItem value={MonitorNoDataModeSchema.enum.SHOW_NO_DATA}>
          <span className="inline-flex items-center gap-1.5">
            Show severity
            <MonitorSeverityBadge
              severity={MonitorSeveritySchema.enum.NO_DATA}
            />
          </span>
        </SelectItem>
        <SelectItem value={MonitorNoDataModeSchema.enum.NOTIFY_NO_DATA}>
          <span className="inline-flex items-center gap-1.5">
            Notify after sustained
            <MonitorSeverityBadge
              severity={MonitorSeveritySchema.enum.NO_DATA}
            />
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
    {value.mode === MonitorNoDataModeSchema.enum.NOTIFY_NO_DATA && (
      <div className="flex items-center gap-2">
        <Label className="text-muted-foreground text-xs">Notify after</Label>
        <Input
          type="number"
          min={1}
          max={60 * 24}
          value={value.intervalMinutes}
          onChange={(e) =>
            onChange({
              mode: MonitorNoDataModeSchema.enum.NOTIFY_NO_DATA,
              intervalMinutes: Math.max(1, Number(e.target.value) || 1),
            })
          }
          disabled={disabled}
          className="w-24"
        />
        <Label className="text-muted-foreground text-xs">minutes</Label>
      </div>
    )}
  </div>
);

/** RenotifyField renders the renotify mode picker plus its interval input. */
const RenotifyField = ({
  value,
  onChange,
  disabled,
}: {
  value: MonitorRenotify;
  onChange: (next: MonitorRenotify) => void;
  disabled?: boolean;
}) => (
  <div className="space-y-2">
    <Label>Renotify</Label>
    <Select
      value={value.mode}
      onValueChange={(mode) =>
        onChange(
          mode === "EVERY"
            ? { mode: "EVERY", intervalMinutes: 60 }
            : { mode: "OFF" },
        )
      }
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="OFF">Off (alert only on transitions)</SelectItem>
        <SelectItem value="EVERY">Re-alert at a regular interval</SelectItem>
      </SelectContent>
    </Select>
    {value.mode === "EVERY" && (
      <div className="flex items-center gap-2">
        <Label className="text-muted-foreground text-xs">
          Re-alert every (minutes)
        </Label>
        <Input
          type="number"
          min={1}
          max={60 * 24 * 7}
          value={value.intervalMinutes}
          onChange={(e) =>
            onChange({
              mode: "EVERY",
              intervalMinutes: Math.max(1, Number(e.target.value) || 1),
            })
          }
          disabled={disabled}
          className="w-32"
        />
      </div>
    )}
  </div>
);

/** __test exposes private helpers to co-located tests without widening the module API. */
export const __test = {
  createDefaults,
  monitorToDefaults,
  nameOrPlaceholder,
};
