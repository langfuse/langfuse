import React, { useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { Plus, type LucideIcon } from "lucide-react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

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
import TagManager from "@/src/features/tag/components/TagManager";
import { WidgetPropertySelectItem } from "@/src/features/widgets/components/WidgetPropertySelectItem";
import {
  getWidgetColumnsWithCustomSelect,
  getWidgetFilterColumns,
} from "@/src/features/widgets/components/widgetFilterColumns";
import { normalizeSingleValueOptions } from "@/src/features/filters/lib/filter-transform";

import {
  CreateMonitorSchema,
  type CreateMonitor,
  type Monitor,
  type MonitorNoData,
  type MonitorRenotify,
  type MonitorThresholdOperator,
  type MonitorView,
  MonitorViewSchema,
  type MonitorWindow,
  MonitorWindowSchema,
  type MonitorWriteStatus,
  UpdateMonitorSchema,
  type UpdateMonitor,
} from "@langfuse/shared/monitors";
import {
  formatAggregation,
  getValidAggregationsForMeasure,
  viewDeclarations,
  type FilterState,
} from "@langfuse/shared";
import { startCase } from "lodash";

import { MonitorChartPreview } from "./MonitorChartPreview";
import { MonitorAutomationsPanel } from "./MonitorAutomationsPanel";
import { MonitorSeverityBadge } from "./MonitorSeverityBadge";

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

/** triggerOperatorOptions lists the MonitorThresholdOperators shown in the trigger-condition dropdown. */
const triggerOperatorOptions: ReadonlyArray<MonitorThresholdOperator> = [
  "GT",
  "LT",
  "GTE",
  "LTE",
  "EQ",
  "NEQ",
];

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
  metric: { measure: "count", aggregation: "count" },
  window: "5m",
  thresholdOperator: "GT",
  noData: { mode: "SILENT" },
  renotify: { mode: "OFF" },
  status: "ACTIVE",
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
  // Persisted ERROR_BAD_QUERY status is scheduler-owned and not a valid
  // write value, so coerce it back to ACTIVE for the form's default.
  status:
    monitor.status === "ERROR_BAD_QUERY"
      ? "ACTIVE"
      : (monitor.status as MonitorWriteStatus),
});

type MonitorFormProps = {
  projectId: string;
  monitor?: Monitor;
  /** onNameChange fires on every form change so the host (e.g. the edit page header) can mirror the live name. */
  onNameChange?: (name: string) => void;
};

/** MonitorForm renders the create/edit form for a Monitor. */
export const MonitorForm = ({
  projectId,
  monitor,
  onNameChange,
}: MonitorFormProps) => {
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

  /** form is the react-hook-form instance bound to schema and defaultValues. */
  const form = useForm<CreateMonitor | UpdateMonitor>({
    resolver: zodResolver(schema as any),
    defaultValues: defaultValues as CreateMonitor,
    mode: "onChange",
  });

  /** createMutation creates a new monitor and redirects to its edit page on success. */
  const createMutation = api.monitors.create.useMutation({
    onSuccess: async ({ id }) => {
      await utils.monitors.invalidate();
      showSuccessToast({
        title: "Monitor created",
        description: "Your monitor is now active.",
      });
      void router.replace(`/project/${projectId}/monitors/${id}/edit`);
    },
    onError: (e) => showErrorToast("Failed to create monitor", e.message),
  });

  /** updateMutation saves edits to an existing monitor. */
  const updateMutation = api.monitors.update.useMutation({
    onSuccess: async () => {
      await utils.monitors.invalidate();
      showSuccessToast({
        title: "Monitor saved",
        description: "Your changes have been applied.",
      });
    },
    onError: (e) => showErrorToast("Failed to save monitor", e.message),
  });

  /** onSubmit normalizes filter columns into view-space and dispatches the create or update mutation. */
  const onSubmit = form.handleSubmit((values) => {
    const normalizedValues = {
      ...values,
      filters: mapWidgetUiTableFilterToView(
        values.view as Parameters<typeof mapWidgetUiTableFilterToView>[0],
        (values.filters ?? []) as FilterState,
      ),
    } as typeof values;

    if (isEdit && monitor) {
      updateMutation.mutate({
        ...(normalizedValues as UpdateMonitor),
        id: monitor.id,
      });
    } else {
      createMutation.mutate(normalizedValues as CreateMonitor);
    }
  });

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

  /** monitorFilterOptions loads existing monitor tags; reused for TagManager autocomplete and deduped via the list page's cache. */
  const monitorFilterOptions = api.monitors.getFilterOptions.useQuery(
    { projectId },
    {
      trpc: { context: { skipBatch: true } },
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  /** availableTags is the flat list of tag values pulled from monitorFilterOptions for TagManager. */
  const availableTags = useMemo(
    () => monitorFilterOptions.data?.tags.map((t) => t.value) ?? [],
    [monitorFilterOptions.data],
  );

  /** datasets loads dataset metadata for the project; used to label experiment-dataset filter options. */
  const datasets = api.datasets.allDatasetMeta.useQuery({ projectId });

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
    () => getWidgetFilterColumns(filterColumnsParams),
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
    return getValidAggregationsForMeasure(measureDef);
  }, [watched.view, watched.metric?.measure]);

  /** namePlaceholder builds an auto-suggested name from the current view + metric + threshold (e.g. "Count of Observations > 0"). */
  const namePlaceholder = useMemo(() => {
    const view = (watched.view ?? "observations") as MonitorView;
    const measure = watched.metric?.measure ?? "count";
    const aggregation = watched.metric?.aggregation ?? "count";
    const op = (watched.thresholdOperator ?? "GT") as MonitorThresholdOperator;
    const threshold = watched.alertThreshold;
    const aggLabel = formatAggregation(aggregation);
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
    <form onSubmit={onSubmit} className="flex h-full gap-4 overflow-hidden">
      <div className="h-full min-h-0 w-full min-w-107.5 md:w-1/3">
        <Card className="flex h-full flex-col">
          <CardHeader>
            <CardTitle>Monitor Configuration</CardTitle>
            <CardDescription>
              Get notified when observation metrics and scores cross a
              threshold. (eg. &ldquo;sudden cost increase&rdquo;,
              &ldquo;accuracy has dropped&rdquo;)
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <Section title="1. Metric Definition">
              <div className="space-y-2">
                <Label htmlFor="monitor-view">View</Label>
                <Controller
                  control={form.control}
                  name="view"
                  render={({ field }) => (
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
                        const currentMeasure = form.getValues("metric.measure");
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
                      <SelectTrigger id="monitor-view">
                        <SelectValue />
                      </SelectTrigger>
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
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monitor-measure">Measure</Label>
                <Controller
                  control={form.control}
                  name="metric.measure"
                  render={({ field }) => {
                    const view = (watched.view ??
                      "observations") as keyof (typeof viewDeclarations)["v2"];
                    const measures = viewDeclarations.v2[view]?.measures ?? {};
                    return (
                      <Select
                        value={field.value}
                        onValueChange={(next) => {
                          field.onChange(next);
                          // The aggregation dropdown filters by the new
                          // measure, but the stored value can stay stale
                          // (e.g. "sum" against a string measure, or "p95"
                          // against `count`). Snap it to the first valid
                          // option whenever the current one isn't supported.
                          const validAggs = getValidAggregationsForMeasure(
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
                        <SelectTrigger id="monitor-measure">
                          <SelectValue />
                        </SelectTrigger>
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
                    );
                  }}
                />
              </div>
              {watched.metric?.measure !== "count" && (
                <div className="space-y-2">
                  <Label htmlFor="monitor-aggregation">Aggregation</Label>
                  <Controller
                    control={form.control}
                    name="metric.aggregation"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!hasAccess}
                      >
                        <SelectTrigger id="monitor-aggregation">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {aggregationOptions.map((a) => (
                            <SelectItem key={a} value={a}>
                              {formatAggregation(a)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Filters</Label>
                <Controller
                  control={form.control}
                  name="filters"
                  render={({ field }) => (
                    <InlineFilterBuilder
                      columns={filterColumns}
                      filterState={(field.value ?? []) as FilterState}
                      onChange={(next: FilterState) => field.onChange(next)}
                      columnsWithCustomSelect={customSelectColumnIds}
                    />
                  )}
                />
              </div>
              {formError.query && (
                <p className="text-destructive text-xs">
                  {formError.query.message}
                </p>
              )}
            </Section>

            <Section title="2. Alert Conditions">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm whitespace-nowrap">
                  Trigger when the value is
                </span>
                <Controller
                  control={form.control}
                  name="thresholdOperator"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(next) => {
                        field.onChange(next);
                        // A warning band before a "not equal" alert has no
                        // meaningful ordering, so drop any stale value.
                        if (next === "NEQ") {
                          form.setValue("warningThreshold", null, {
                            shouldValidate: true,
                          });
                        }
                      }}
                      disabled={!hasAccess}
                    >
                      <SelectTrigger className="w-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {triggerOperatorOptions.map((op) => (
                          <SelectItem key={op} value={op}>
                            {operatorLabels[op]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex items-center gap-2">
                <MonitorSeverityBadge severity="ALERT" />
                <span className="text-sm whitespace-nowrap">Threshold</span>
                <span className="mr-1.5 ml-1 font-mono text-xs font-semibold">
                  {
                    operatorSymbol[
                      (watched.thresholdOperator ??
                        "GT") as keyof typeof operatorSymbol
                    ]
                  }
                </span>
                <Controller
                  control={form.control}
                  name="alertThreshold"
                  render={({ field }) => (
                    <Input
                      type="number"
                      className="flex-1"
                      placeholder="0"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        field.onChange(raw === "" ? undefined : Number(raw));
                      }}
                      disabled={!hasAccess}
                    />
                  )}
                />
              </div>
              <div
                className="flex items-center gap-2"
                hidden={watched.thresholdOperator === "NEQ"}
              >
                <MonitorSeverityBadge severity="WARNING" />
                <span className="text-sm whitespace-nowrap">Threshold</span>
                <span className="mr-1.5 ml-1 font-mono text-xs font-semibold">
                  {
                    operatorSymbol[
                      (watched.thresholdOperator ??
                        "GT") as keyof typeof operatorSymbol
                    ]
                  }
                </span>
                <Controller
                  control={form.control}
                  name="warningThreshold"
                  render={({ field }) => (
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
                  )}
                />
              </div>
              {formError.threshold && (
                <p className="text-destructive text-xs">
                  {formError.threshold.message}
                </p>
              )}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm whitespace-nowrap">
                  Over the past
                </span>
                <Controller
                  control={form.control}
                  name="window"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!hasAccess}
                    >
                      <SelectTrigger id="monitor-window" className="w-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MonitorWindowSchema.options.map((w) => (
                          <SelectItem key={w} value={w}>
                            {windowLabels[w]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <Accordion type="single" collapsible>
                <AccordionItem value="advanced" className="border-b-0">
                  <AccordionTrigger className="justify-start gap-2 py-2 text-sm font-medium [&>svg]:order-first [&>svg]:-rotate-90 [&[data-state=open]>svg]:rotate-0">
                    Advanced Options
                  </AccordionTrigger>
                  <AccordionContent className="space-y-6 pt-2">
                    <NoDataField
                      value={form.watch("noData") as MonitorNoData}
                      onChange={(v) =>
                        form.setValue("noData", v, { shouldValidate: true })
                      }
                      disabled={!hasAccess}
                    />
                    <RenotifyField
                      value={form.watch("renotify") as MonitorRenotify}
                      onChange={(v) =>
                        form.setValue("renotify", v, { shouldValidate: true })
                      }
                      disabled={!hasAccess}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </Section>

            <Section title="3. Notifications">
              <div className="space-y-2">
                <Label htmlFor="monitor-name">Name</Label>
                <Input
                  id="monitor-name"
                  maxLength={200}
                  placeholder={namePlaceholder}
                  disabled={!hasAccess}
                  {...form.register("name")}
                />
                {form.formState.errors.name && (
                  <p className="text-destructive text-xs">
                    {form.formState.errors.name.message as string}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Controller
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <TagManager
                      itemName="monitor"
                      tags={(field.value ?? []) as string[]}
                      allTags={availableTags}
                      hasAccess={hasAccess}
                      isLoading={false}
                      mutateTags={(next) => field.onChange(next)}
                      liveUpdate
                      popoverAlign="start"
                      triggerButton={
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="mr-2 ml-0.5 gap-1"
                        >
                          <Plus className="h-3 w-3" />
                          Add Tags
                        </Button>
                      }
                    />
                  )}
                />
                {form.formState.errors.tags && (
                  <p className="text-destructive text-xs">
                    {
                      (form.formState.errors.tags as { message?: string })
                        .message
                    }
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Channels</Label>
                <MonitorAutomationsPanel
                  projectId={projectId}
                  monitorId={monitor?.id}
                  name={watched.name ?? ""}
                  tags={(watched.tags ?? []) as string[]}
                  warningThreshold={watched.warningThreshold ?? null}
                  noDataMode={watched.noData?.mode ?? "SILENT"}
                />
              </div>
            </Section>
          </CardContent>
          <CardFooter className="mt-auto">
            <div className="flex-inherit w-full items-center border-t pt-4">
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
            (watched.thresholdOperator ?? "GT") as MonitorThresholdOperator
          }
          alertThreshold={watched.alertThreshold}
          warningThreshold={watched.warningThreshold ?? null}
        />
      </div>
    </form>
  );
};

/** Header pins a section title to the top of the scrolling CardContent. */
const Header = ({
  title,
  icon: Icon,
}: {
  title: string;
  icon?: LucideIcon;
}) => (
  <div className="bg-card sticky top-0 z-10">
    <h3 className="flex items-center gap-2 py-2 text-lg font-bold">
      {Icon ? <Icon className="h-5 w-5" aria-hidden="true" /> : null}
      {title}
    </h3>
  </div>
);

/** Section wraps a Header and its body in the layout used by every MonitorForm section. */
const Section = ({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) => (
  <div>
    <Header title={title} icon={icon} />
    <div className="space-y-4 pb-4">{children}</div>
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
    <Label>On no data</Label>
    <Select
      value={value.mode}
      onValueChange={(mode) =>
        onChange(
          mode === "NOTIFY"
            ? { mode: "NOTIFY", intervalMinutes: 60 }
            : { mode: "SILENT" },
        )
      }
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="SILENT">Silent (alert only on recovery)</SelectItem>
        <SelectItem value="NOTIFY">Notify after sustained no-data</SelectItem>
      </SelectContent>
    </Select>
    {value.mode === "NOTIFY" && (
      <div className="flex items-center gap-2">
        <Label className="text-muted-foreground text-xs">
          Notify every (minutes)
        </Label>
        <Input
          type="number"
          min={1}
          max={60 * 24}
          value={value.intervalMinutes}
          onChange={(e) =>
            onChange({
              mode: "NOTIFY",
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
