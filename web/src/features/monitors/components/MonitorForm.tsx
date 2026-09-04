/* eslint-disable @repo/no-style-props */
import { showSuccessToast, showErrorToast } from "@/src/features/notifications";
import React, { useMemo, useRef } from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { useRouter } from "next/router";
import { ChevronDown, type LucideIcon, Plus } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { startCase } from "lodash";

import { api } from "@/src/utils/api";
import { AIAssistedInput } from "@/src/components/ui/ai-assisted-input";
import { Button } from "@/src/components/ui/button";
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
import { useHasProjectAccess } from "@/src/features/rbac";
import { useLangfuseCloudRegion } from "@/src/features/organizations";
import { useProject } from "@/src/features/projects";
import { WidgetPropertySelectItem } from "@/src/features/widgets/components/WidgetPropertySelectItem";
import { MetricsFilterBuilder } from "@/src/features/metrics/components/MetricsFilterBuilder";
import { partitionWidgetUiTableFiltersToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { resolveMonitorNameForSave } from "@/src/features/monitors/fns/resolveMonitorNameForSave";
import { cn } from "@/src/utils/tailwind";

import {
  CreateMonitorSchema,
  type CreateMonitor,
  getValidMonitorAggregationsForMeasure,
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
import { getMonitorFilterOptionsLookbackFrom } from "../helpers/monitorTimeRanges";
import { MonitorAutomationsPanel } from "./MonitorAutomationsPanel";
import { MonitorSeverityBadge } from "./MonitorSeverityBadge";
import { Badge } from "@/src/components/ui/badge";
import {
  operatorLabels,
  operatorSymbol,
  viewLabels,
  windowLabels,
} from "../helpers/monitorLabels";
import {
  aggregationLabel,
  renderNamePlaceholder,
} from "../helpers/renderMonitorLabels";

/** createDefaults returns the form defaults for a brand-new monitor. */
const createDefaults = (
  projectId: string,
  prefill?: Partial<
    Pick<CreateMonitor, "view" | "filters" | "metric" | "window" | "tags">
  >,
  initialTriggerIds: string[] = [],
): Partial<CreateMonitor> => ({
  projectId,
  view: prefill?.view ?? "observations",
  filters: prefill?.filters ?? [],
  metric: prefill?.metric ?? { measure: "count", aggregation: "count" },
  window: prefill?.window ?? "5m",
  thresholdOperator: MonitorThresholdOperatorSchema.enum.GT,
  warningThreshold: null,
  noData: { mode: MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO },
  renotify: { mode: "OFF" },
  tags: prefill?.tags ?? [],
  triggerIds: initialTriggerIds,
  status: MonitorStatusSchema.enum.ACTIVE,
});

/** monitorToDefaults maps a persisted Monitor into the edit form's defaults. */
const monitorToDefaults = (monitor: Monitor): UpdateMonitor => ({
  id: monitor.id,
  projectId: monitor.projectId,
  view: monitor.view,
  filters: monitor.filters,
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

/** resolveViewChangePatch returns the form fields that must change when the view changes. */
const resolveViewChangePatch = (
  nextView: keyof (typeof viewDeclarations)["v2"],
  currentMeasure: string,
): Partial<Pick<CreateMonitor, "metric">> => {
  const measures = viewDeclarations.v2[nextView]?.measures ?? {};
  // Filters are never patched; MetricsFilterBuilder drops rows the view cannot render.
  return currentMeasure in measures
    ? {}
    : { metric: { measure: "count", aggregation: "count" } };
};

/** nameOrPlaceholder falls back to the placeholder when the name is blank. */
const nameOrPlaceholder = (
  name: string | undefined,
  placeholder: string,
): string => name || placeholder;

type MonitorAnalyticsSource =
  | "alerts"
  | "evaluator_score"
  | "evaluator_cost"
  | "all_evaluator_cost";

const monitorCreateAnalyticsProperties = (
  source: MonitorAnalyticsSource,
  monitor: Pick<CreateMonitor, "view" | "metric" | "window">,
) => ({
  source,
  view: monitor.view,
  measure: monitor.metric.measure,
  aggregation: monitor.metric.aggregation,
  window: monitor.window,
});

/** MonitorForm renders the create/edit form for a Monitor. */
export const MonitorForm = ({
  projectId,
  monitor,
  prefill,
  analyticsSource = "alerts",
  initialTriggerIds = [],
  onNameChange,
}: {
  projectId: string;
  monitor?: Monitor;
  prefill?: Partial<
    Pick<CreateMonitor, "view" | "filters" | "metric" | "window" | "tags">
  >;
  analyticsSource?: MonitorAnalyticsSource;
  initialTriggerIds?: string[];
  /** onNameChange fires on every form change so the host (e.g. the edit page header) can mirror the live name. */
  onNameChange?: (name: string) => void;
}) => {
  /** router is the Next router used to redirect after a successful create. */
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { organization } = useProject(projectId);
  const nameAIAssistanceAvailable =
    isLangfuseCloud && Boolean(organization?.aiFeaturesEnabled);
  /** isEdit is true when the form is bound to an existing monitor. */
  const isEdit = Boolean(monitor);
  /** hasAccess gates write controls behind the alerts:CUD RBAC scope. */
  const hasAccess = useHasProjectAccess({ projectId, scope: "alerts:CUD" });
  /** utils is the tRPC utils handle used to invalidate caches after mutations. */
  const utils = api.useUtils();

  /** schema selects the Zod schema to validate against based on isEdit. */
  const schema = isEdit ? UpdateMonitorSchema : CreateMonitorSchema;
  /** defaultValues seeds the form from the existing monitor on edit, otherwise from createDefaults. */
  const defaultValues = isEdit
    ? monitorToDefaults(monitor as Monitor)
    : createDefaults(projectId, prefill, initialTriggerIds);

  /** namePlaceholderRef holds the latest computed name placeholder for the resolver. */
  const namePlaceholderRef = useRef("");

  /** resolver wraps zodResolver, filling a blank name with the computed placeholder before validation. */
  const resolver = useMemo(() => {
    const base = zodResolver(schema as any);
    return ((values, context, options) => {
      const v = values as { name?: string };
      const mapped = {
        ...values,
        name: nameOrPlaceholder(v.name, namePlaceholderRef.current),
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

  const suggestName = api.monitors.suggestName.useMutation();
  const generateNameSuggestion = async (): Promise<string | null> => {
    if (!nameAIAssistanceAvailable) return null;
    try {
      return await suggestName.mutateAsync({
        projectId,
        description: namePlaceholderRef.current,
      });
    } catch {
      return null;
    }
  };
  const requestNameSuggestion = async () => {
    const generatedName = await generateNameSuggestion();
    if (!generatedName) {
      showErrorToast(
        "Couldn't generate an alert title",
        "Please enter a title manually.",
      );
      return;
    }
    form.setValue("name", generatedName, {
      shouldDirty: true,
      shouldValidate: true,
    });
    onNameChange?.(generatedName);
  };

  /** createMutation creates a new monitor and returns to the monitors list on success. */
  const createMutation = api.monitors.create.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.monitors.invalidate();
      capture(
        "monitors:create",
        monitorCreateAnalyticsProperties(analyticsSource, variables),
      );
      showSuccessToast({
        title: "Alert created",
        description: `"${variables.name}" is now active.`,
      });
      router.replace(`/project/${projectId}/alerts`);
    },
    onError: (e) => showErrorToast("Failed to create alert", e.message),
  });

  /** updateMutation saves edits to an existing monitor and returns to the monitors list on success. */
  const updateMutation = api.monitors.update.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.monitors.invalidate();
      showSuccessToast({
        title: "Alert saved",
        description: `Your changes to "${variables.name}" have been applied.`,
      });
      router.replace(`/project/${projectId}/alerts`);
    },
    onError: (e) => showErrorToast("Failed to save alert", e.message),
  });

  /** onSubmit strips unsupported filter rows and dispatches the create or update mutation. */
  const onSubmit = form.handleSubmit(
    async (values) => {
      const resolvedName = await resolveMonitorNameForSave({
        name: form.getValues("name"),
        fallbackName: namePlaceholderRef.current,
        aiAvailable: nameAIAssistanceAvailable,
        generateName: generateNameSuggestion,
      });
      if (!resolvedName) {
        showErrorToast(
          "Couldn't generate an alert title",
          "Please enter a title manually and try again.",
        );
        return;
      }

      const normalizedValues = {
        ...values,
        name: resolvedName,
        filters: partitionWidgetUiTableFiltersToView(
          values.view as Parameters<
            typeof partitionWidgetUiTableFiltersToView
          >[0],
          (values.filters ?? []) as FilterState,
        ).mappedFilters,
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
  const monitorWindow = (watched.window ?? "5m") as MonitorWindow;

  /** filterOptionsLookbackFrom lower-bounds discovery at max(20×window, 7d) so even a small monitor window still yields value suggestions. */
  const filterOptionsLookbackFrom = useMemo(
    () => getMonitorFilterOptionsLookbackFrom(monitorWindow, Date.now()),
    [monitorWindow],
  );

  /** monitorFilterOptions loads the project's existing monitor tags for the tag picker's available-options list. */
  const monitorFilterOptions = api.monitors.getFilterOptions.useQuery(
    { projectId },
    { staleTime: Infinity, refetchOnWindowFocus: false },
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

  /** namePlaceholder builds an auto-suggested name from the current view + metric + threshold (e.g. "Sum of Observations Latency is below 100"). */
  const namePlaceholder = useMemo(
    () =>
      renderNamePlaceholder({
        view: (watched.view ?? "observations") as MonitorView,
        metric: {
          measure: watched.metric?.measure ?? "count",
          aggregation: watched.metric?.aggregation ?? "count",
        },
        thresholdOperator: (watched.thresholdOperator ??
          MonitorThresholdOperatorSchema.enum.GT) as MonitorThresholdOperator,
        alertThreshold: watched.alertThreshold,
      }),
    [
      watched.view,
      watched.metric?.measure,
      watched.metric?.aggregation,
      watched.thresholdOperator,
      watched.alertThreshold,
    ],
  );

  namePlaceholderRef.current = namePlaceholder;

  /** previewFilters strips unsupported rows from the picked view's filters for the preview query. */
  const previewFilters = useMemo<FilterState>(
    () =>
      partitionWidgetUiTableFiltersToView(
        (watched.view ?? "observations") as Parameters<
          typeof partitionWidgetUiTableFiltersToView
        >[0],
        (watched.filters ?? []) as FilterState,
      ).mappedFilters,
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
    updateMutation.isPending ||
    suggestName.isPending;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex h-full gap-4 overflow-hidden">
        <div className="h-full min-h-0 w-full min-w-107.5 md:w-1/3">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <CardTitle>Alert Configuration</CardTitle>
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
                          const patch = resolveViewChangePatch(
                            next as keyof (typeof viewDeclarations)["v2"],
                            form.getValues("metric.measure"),
                          );
                          if (patch.metric) {
                            form.setValue("metric", patch.metric, {
                              shouldValidate: true,
                            });
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
                                {aggregationLabel(a)}
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
                        <MetricsFilterBuilder
                          version="v2"
                          view={(watched.view ?? "observations") as MonitorView}
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
                        <span className="mr-1.5 ml-1 font-mono text-xs font-bold">
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
                        <span className="mr-1.5 ml-1 font-mono text-xs font-bold">
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
                <AccordionPrimitive.Root type="single" collapsible>
                  <AccordionPrimitive.Item value="advanced">
                    <AccordionPrimitive.Header className="flex">
                      <AccordionPrimitive.Trigger className="flex flex-1 items-center justify-start gap-2 py-2 text-sm font-bold transition-all hover:underline [&>svg]:order-first [&>svg]:-rotate-90 [&[data-state=open]>svg]:rotate-0">
                        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                        Advanced Options
                      </AccordionPrimitive.Trigger>
                    </AccordionPrimitive.Header>
                    <AccordionPrimitive.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm transition-all">
                      <div className="space-y-6 px-1 pt-2 pb-4">
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
                      </div>
                    </AccordionPrimitive.Content>
                  </AccordionPrimitive.Item>
                </AccordionPrimitive.Root>
              </Section>

              <Section title="Notifications" step={3} className="pb-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <AIAssistedInput
                          id="monitor-title"
                          maxLength={200}
                          placeholder={namePlaceholder}
                          disabled={!hasAccess}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            field.onChange(e);
                            onNameChange?.(e.target.value ?? "");
                          }}
                          fieldName="title"
                          aiAssistance={
                            !nameAIAssistanceAvailable
                              ? { state: "unavailable" }
                              : suggestName.isPending
                                ? { state: "generating" }
                                : {
                                    state: "idle",
                                    onGenerate: () => {
                                      requestNameSuggestion().catch(
                                        () => undefined,
                                      );
                                    },
                                  }
                          }
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
                          itemName="alert"
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
              <div className="w-full items-center pt-4">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={!hasAccess || submitting}
                >
                  {isEdit ? "Save Alert" : "Create Alert"}
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
            window={(watched.window ?? "5m") as MonitorWindow}
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
        <span className="bg-foreground text-background flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold">
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
              className="bg-muted-foreground text-background hover:bg-muted-foreground w-20 justify-center py-1"
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
  resolveViewChangePatch,
  monitorCreateAnalyticsProperties,
};
