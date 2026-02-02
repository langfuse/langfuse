import { type UseFormReturn, useFieldArray, useForm } from "react-hook-form";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import {
  tracesTableColsWithOptions,
  evalTraceTableCols,
  evalDatasetFormFilterCols,
  singleFilter,
  availableTraceEvalVariables,
  datasetFormFilterColsWithOptions,
  type availableDatasetEvalVariables,
  observationEvalVariableColumns,
  observationEvalFilterColumns,
  type ObservationType,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared";
import { z } from "zod/v4";
import { useEffect, useMemo, useState, memo } from "react";
import { api } from "@/src/utils/api";
import {
  InlineFilterBuilder,
  type ColumnDefinitionWithAlert,
} from "@/src/features/filters/components/filter-builder";
import { type EvalTemplate, wipVariableMapping } from "@langfuse/shared";
import { useRouter } from "next/router";
import { Slider } from "@/src/components/ui/slider";
import { Card } from "@/src/components/ui/card";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import DocPopup from "@/src/components/layouts/doc-popup";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  evalConfigFormSchema,
  type EvalFormType,
  isTraceOrDatasetObject,
  isTraceTarget,
  type LangfuseObject,
  type VariableMapping,
} from "@/src/features/evals/utils/evaluator-form-utils";
import { validateAndTransformVariableMapping } from "@/src/features/evals/utils/variable-mapping-validation";
import { EvalTargetObject } from "@langfuse/shared";
import { ExecutionCountTooltip } from "@/src/features/evals/components/execution-count-tooltip";
import { VariableMappingDescription } from "@/src/features/evals/components/eval-form-descriptions";
import { Suspense, lazy } from "react";
import {
  getDateFromOption,
  type TableDateRange,
} from "@/src/utils/date-range-utils";
import { useEvalConfigMappingData } from "@/src/features/evals/hooks/useEvalConfigMappingData";
import { type PartialConfig } from "@/src/features/evals/types";
import { Switch } from "@/src/components/ui/switch";
import { type EvalCapabilities } from "@/src/features/evals/hooks/useEvalCapabilities";
import {
  EvaluationPromptPreview,
  getVariableColor,
} from "@/src/features/evals/components/evaluation-prompt-preview";
import { EvalVersionCallout } from "@/src/features/evals/components/eval-version-callout";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/src/components/ui/tooltip";
import { InfoIcon } from "lucide-react";
import {
  isEventTarget,
  isExperimentTarget,
  isLegacyEvalTarget,
} from "@/src/features/evals/utils/typeHelpers";
import {
  useUserFacingTarget,
  useEvaluatorTargetState,
} from "@/src/features/evals/hooks/useEvaluatorTarget";

// Lazy load TracesTable
const TracesTable = lazy(
  () => import("@/src/components/table/use-cases/traces"),
);

const OUTPUT_MAPPING = [
  "generation",
  "output",
  "response",
  "answer",
  "completion",
];

const INTERNAL_ENVIRONMENTS = [
  LangfuseInternalTraceEnvironment.LLMJudge,
  "langfuse-prompt-experiments",
  "langfuse-evaluation",
  "sdk-experiment",
] as const;

// Default filter for new trace evaluators - excludes internal Langfuse environments
// to prevent evaluators from running on their own traces
const DEFAULT_TRACE_FILTER = [
  {
    column: "environment",
    operator: "none of" as const,
    value: [...INTERNAL_ENVIRONMENTS],
    type: "stringOptions" as const,
  },
];

const inferDefaultMapping = (
  variable: string,
): Pick<VariableMapping, "langfuseObject" | "selectedColumnId"> => {
  return {
    langfuseObject: "trace" as const,
    selectedColumnId: OUTPUT_MAPPING.includes(variable.toLowerCase())
      ? "output"
      : "input",
  };
};

const fieldHasJsonSelectorOption = (
  selectedColumnId: string | undefined | null,
): boolean =>
  selectedColumnId === "input" ||
  selectedColumnId === "output" ||
  selectedColumnId === "metadata" ||
  selectedColumnId === "expected_output";

const propagationRequiredColumns = new Set([
  "release",
  "trace_name",
  "user_id",
  "session_id",
  "tags",
]);

/**
 * Converts observation filter columns to ColumnDefinition format and
 * augments with alerts for propagation-requiring columns when propagation is not available
 */
const getObservationFilterColumnsWithWarnings = (
  allowPropagationFilters: boolean,
): ColumnDefinitionWithAlert[] => {
  // Columns that require OTEL SDK with span propagation

  return observationEvalFilterColumns.map((col) => {
    // Convert to ColumnDefinition format
    let baseColumn: ColumnDefinitionWithAlert;

    if (col.type === "stringOptions" || col.type === "arrayOptions") {
      baseColumn = {
        ...col,
        internal: col.id,
        options: [], // Options will be populated at runtime if needed
      } as ColumnDefinitionWithAlert;
    } else {
      baseColumn = {
        ...col,
        internal: col.id,
      } as ColumnDefinitionWithAlert;
    }

    // Add alert if propagation is required but not available
    if (!allowPropagationFilters && propagationRequiredColumns.has(col.id)) {
      return {
        ...baseColumn,
        alert: {
          severity: "warning" as const,
          content: (
            <>
              This filter requires JS SDK &ge; 4.4.0 or Python SDK &ge; 3.9.0
              with attribute propagation enabled. Please{" "}
              <a
                href="https://langfuse.com/integrations/native/opentelemetry"
                target="_blank"
                rel="noopener noreferrer"
                className="text-dark-blue hover:opacity-80"
              >
                follow our docs
              </a>{" "}
              to configure your instrumentation to use this filter.
            </>
          ),
        },
      };
    }

    return baseColumn;
  });
};

const getTargetDisplayName = (target: string): string => {
  switch (target) {
    case "trace":
      return "traces";
    case "event":
      return "observations";
    case "dataset":
      return "dataset run items";
    case "experiment":
      return "experiments";
    default:
      return target;
  }
};

const TracesPreview = memo(
  ({
    projectId,
    filterState,
  }: {
    projectId: string;
    filterState: z.infer<typeof singleFilter>[];
  }) => {
    const dateRange = useMemo(() => {
      return {
        from: getDateFromOption({
          filterSource: "TABLE",
          option: "last1Day",
        }),
      } as TableDateRange;
    }, []);

    return (
      <>
        <div className="flex flex-col items-start gap-1">
          <span className="text-sm font-medium leading-none">
            Preview sample matched traces
          </span>
          <FormDescription>
            Sample over the last 24 hours that match these filters
          </FormDescription>
        </div>
        <div className="mb-4 flex max-h-[30dvh] w-full flex-col overflow-hidden border-b border-l border-r">
          <Suspense fallback={<Skeleton className="h-[30dvh] w-full" />}>
            <TracesTable
              projectId={projectId}
              hideControls
              externalFilterState={filterState}
              externalDateRange={dateRange}
              limitRows={10}
            />
          </Suspense>
        </div>
      </>
    );
  },
);

TracesPreview.displayName = "TracesPreview";

export const InnerEvaluatorForm = (props: {
  projectId: string;
  evalTemplate: EvalTemplate;
  useDialog: boolean;
  disabled?: boolean;
  existingEvaluator?: PartialConfig;
  onFormSuccess?: () => void;
  shouldWrapVariables?: boolean;
  mode?: "create" | "edit";
  hideTargetSection?: boolean;
  preventRedirect?: boolean;
  preprocessFormValues?: (values: any) => any;
  hideAdvancedSettings?: boolean;
  hideTargetSelection?: boolean;
  evalCapabilities: EvalCapabilities;
  renderFooter?: (params: {
    isLoading: boolean;
    formError: string | null;
  }) => React.ReactNode;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const capture = usePostHogClientCapture();
  const [showPreview, setShowPreview] = useState(false);
  const router = useRouter();
  const traceId = router.query.traceId as string;
  const [showTraceConfirmDialog, setShowTraceConfirmDialog] = useState(false);

  // Destructure eval capabilities passed from parent
  const { allowLegacy, allowPropagationFilters } = props.evalCapabilities;

  // Custom hooks for managing evaluator state
  const {
    userFacingTarget,
    setUserFacingTarget,
    useOtelDataForExperiment,
    setUseOtelDataForExperiment,
  } = useUserFacingTarget(props.existingEvaluator?.targetObject);

  const targetState = useEvaluatorTargetState();

  const form = useForm({
    resolver: zodResolver(evalConfigFormSchema),
    disabled: props.disabled,
    defaultValues: {
      scoreName:
        props.existingEvaluator?.scoreName ?? `${props.evalTemplate.name}`,
      target: props.existingEvaluator?.targetObject ?? EvalTargetObject.EVENT,
      filter: props.existingEvaluator?.filter
        ? z.array(singleFilter).parse(props.existingEvaluator.filter)
        : // For new trace evaluators, exclude internal environments by default
          (props.existingEvaluator?.targetObject ?? EvalTargetObject.TRACE) ===
            EvalTargetObject.TRACE
          ? DEFAULT_TRACE_FILTER
          : [],
      mapping: props.existingEvaluator?.variableMapping
        ? z
            .array(wipVariableMapping)
            .parse(props.existingEvaluator.variableMapping)
        : z.array(wipVariableMapping).parse(
            props.evalTemplate
              ? props.evalTemplate.vars.map((v) => ({
                  templateVariable: v,
                  langfuseObject: "trace" as const,
                  objectName: null,
                  selectedColumnId: "input",
                  jsonSelector: null,
                }))
              : [],
          ),
      sampling: props.existingEvaluator?.sampling
        ? props.existingEvaluator.sampling.toNumber()
        : 1,
      delay: props.existingEvaluator?.delay
        ? props.existingEvaluator.delay / 1000
        : 30,
      timeScope: (props.existingEvaluator?.timeScope ?? ["NEW"]).filter(
        (option): option is "NEW" | "EXISTING" =>
          ["NEW", "EXISTING"].includes(option),
      ),
    },
  }) as UseFormReturn<EvalFormType>;

  const traceFilterOptionsResponse = api.traces.filterOptions.useQuery(
    { projectId: props.projectId },
    {
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const environmentFilterOptionsResponse =
    api.projects.environmentFilterOptions.useQuery(
      {
        projectId: props.projectId,
      },
      {
        trpc: { context: { skipBatch: true } },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );

  const traceFilterOptions = useMemo(() => {
    // Normalize API response to match TraceOptions type (count should be number, not string)
    const normalized = traceFilterOptionsResponse.data
      ? {
          name: traceFilterOptionsResponse.data.name?.map((n) => ({
            value: n.value,
            count: Number(n.count),
          })),
          scores_avg: traceFilterOptionsResponse.data.scores_avg,
          score_categories: traceFilterOptionsResponse.data.score_categories,
          tags: traceFilterOptionsResponse.data.tags?.map((t) => ({
            value: t.value,
          })),
        }
      : {};

    return {
      ...normalized,
      environment: environmentFilterOptionsResponse.data?.map((e) => ({
        value: e.environment,
      })),
    };
  }, [traceFilterOptionsResponse.data, environmentFilterOptionsResponse.data]);

  const datasets = api.datasets.allDatasetMeta.useQuery(
    {
      projectId: props.projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const shouldFetch = !props.disabled && isTraceTarget(form.watch("target"));
  const { observationTypeToNames, traceWithObservations, isLoading } =
    useEvalConfigMappingData(props.projectId, form, traceId, shouldFetch);

  const datasetFilterOptions = useMemo(() => {
    if (!datasets.data) return undefined;
    return {
      datasetId: datasets.data?.map((d) => ({
        value: d.id,
        displayValue: d.name,
      })),
    };
  }, [datasets.data]);

  useEffect(() => {
    if (isTraceTarget(form.getValues("target")) && !props.disabled) {
      setShowPreview(true);
    } else {
      // For dataset, event, experiment targets, disable preview
      setShowPreview(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch("target"), props.disabled]);

  useEffect(() => {
    if (props.evalTemplate && form.getValues("mapping").length === 0) {
      form.setValue(
        "mapping",
        props.evalTemplate.vars.map((v) => ({
          templateVariable: v,
          ...inferDefaultMapping(v),
        })),
      );
      form.setValue("scoreName", `${props.evalTemplate.name}`);
    }
  }, [form, props.evalTemplate]);

  const { fields } = useFieldArray({
    control: form.control,
    name: "mapping",
  });

  const utils = api.useUtils();
  const createJobMutation = api.evals.createJob.useMutation({
    onSuccess: () => utils.models.invalidate(),
    onError: (error) => setFormError(error.message),
  });
  const updateJobMutation = api.evals.updateEvalJob.useMutation({
    onSuccess: () => utils.evals.invalidate(),
    onError: (error) => setFormError(error.message),
  });
  const [availableVariables, setAvailableVariables] = useState<
    typeof availableTraceEvalVariables | typeof availableDatasetEvalVariables
  >(() =>
    targetState.getAvailableVariables(
      props.existingEvaluator?.targetObject ?? EvalTargetObject.EVENT,
    ),
  );

  function onSubmit(values: z.infer<typeof evalConfigFormSchema>) {
    capture(
      props.mode === "edit"
        ? "eval_config:update"
        : "eval_config:new_form_submit",
    );

    // Apply preprocessFormValues if it exists
    if (props.preprocessFormValues) {
      values = props.preprocessFormValues(values);
    }

    const validatedFilter = z.array(singleFilter).safeParse(values.filter);

    if (
      props.existingEvaluator?.timeScope.includes("EXISTING") &&
      props.mode === "edit" &&
      !values.timeScope.includes("EXISTING")
    ) {
      form.setError("timeScope", {
        type: "manual",
        message:
          "The evaluator ran on existing traces already. This cannot be changed anymore.",
      });
      return;
    }
    if (form.getValues("timeScope").length === 0) {
      form.setError("timeScope", {
        type: "manual",
        message: "Please select at least one.",
      });
      return;
    }

    if (validatedFilter.success === false) {
      form.setError("filter", {
        type: "manual",
        message: "Please fill out all filter fields",
      });
      return;
    }

    const validatedVarMapping = validateAndTransformVariableMapping(
      values.mapping,
      values.target as EvalTargetObject,
    );

    if (!validatedVarMapping.success) {
      form.setError("mapping", {
        type: "manual",
        message: validatedVarMapping.error,
      });
      return;
    }

    const delay = values.delay * 1000; // convert to ms
    const sampling = values.sampling;
    const mapping = validatedVarMapping.data;
    const filter = validatedFilter.data;
    const scoreName = values.scoreName;

    (props.mode === "edit" && props.existingEvaluator?.id
      ? updateJobMutation.mutateAsync({
          projectId: props.projectId,
          evalConfigId: props.existingEvaluator.id,
          config: {
            delay,
            filter,
            variableMapping: mapping,
            sampling,
            scoreName,
            timeScope: values.timeScope,
          },
        })
      : createJobMutation.mutateAsync({
          projectId: props.projectId,
          target: values.target,
          evalTemplateId: props.evalTemplate.id,
          scoreName,
          filter,
          mapping,
          sampling,
          delay,
          timeScope: values.timeScope,
        })
    )
      .then(() => {
        props.onFormSuccess?.();
        form.reset();

        if (props.mode !== "edit" && !props.preventRedirect) {
          void router.push(`/project/${props.projectId}/evals`);
        }
      })
      .catch((error) => {
        if ("message" in error && typeof error.message === "string") {
          setFormError(error.message as string);
          return;
        } else {
          setFormError(JSON.stringify(error));
        }
      });
  }

  const mappingControlButtons = (
    <div className="flex items-center gap-2">
      {isTraceTarget(form.watch("target")) && !props.disabled && (
        <>
          <span className="text-xs text-muted-foreground">Show Preview</span>
          <Switch
            checked={showPreview}
            onCheckedChange={setShowPreview}
            disabled={props.disabled}
          />
          {showPreview &&
            (traceWithObservations ? (
              <DetailPageNav
                currentId={traceWithObservations.id}
                listKey="traces"
                path={(entry) =>
                  `/project/${props.projectId}/evals/new?evaluator=${props.evalTemplate.id}&traceId=${entry.id}`
                }
              />
            ) : (
              <div className="flex flex-row gap-1">
                <Skeleton className="h-8 w-[54px]" />
                <Skeleton className="h-8 w-[54px]" />
              </div>
            ))}
        </>
      )}
    </div>
  );

  const formBody = (
    <div className="grid gap-4">
      <FormField
        control={form.control}
        name="scoreName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Generated Score Name</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {!props.hideTargetSection && (
        <Card className="flex max-w-full flex-col gap-2 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            {!props.hideTargetSelection && (
              <FormField
                control={form.control}
                name="target"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Run on{" "}
                      {props.mode === "edit" && (
                        <Tooltip>
                          <TooltipTrigger>
                            <InfoIcon className="size-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[200px] p-2">
                            <span className="leading-4">
                              An evaluator&apos;s target data may only be
                              configured at creation.
                            </span>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Tabs
                        value={userFacingTarget}
                        onValueChange={(value) => {
                          const newUserFacingTarget = value as
                            | "trace"
                            | "event"
                            | "offline-experiment";

                          if (newUserFacingTarget === userFacingTarget) {
                            return;
                          }

                          // Show dialog when clicking trace if user has no legacy evals
                          if (
                            newUserFacingTarget === "trace" &&
                            !props.evalCapabilities.hasLegacyEvals &&
                            props.mode !== "edit"
                          ) {
                            setShowTraceConfirmDialog(true);
                            return;
                          }

                          // Update user-facing target
                          setUserFacingTarget(newUserFacingTarget);

                          // Determine the actual target based on selection
                          let actualTarget: EvalTargetObject;
                          if (newUserFacingTarget === "trace") {
                            actualTarget = EvalTargetObject.TRACE;
                          } else if (newUserFacingTarget === "event") {
                            actualTarget = EvalTargetObject.EVENT;
                          } else {
                            // offline-experiment
                            actualTarget = useOtelDataForExperiment
                              ? EvalTargetObject.EXPERIMENT
                              : EvalTargetObject.DATASET;
                          }

                          // Transform variable mapping for new target type
                          const currentMapping = form.getValues("mapping");
                          const newMapping = targetState.transformMapping(
                            currentMapping,
                            actualTarget,
                          );

                          // Update form state
                          form.setValue("filter", []);
                          form.setValue("mapping", newMapping);
                          setAvailableVariables(
                            targetState.getAvailableVariables(actualTarget),
                          );
                          field.onChange(actualTarget);
                        }}
                      >
                        <TabsList className="grid w-fit max-w-fit grid-flow-col">
                          <TabsTrigger
                            value="event"
                            disabled={props.disabled || props.mode === "edit"}
                            className="min-w-[100px]"
                          >
                            Live Observations [New]
                          </TabsTrigger>
                          {allowLegacy && (
                            <TabsTrigger
                              value="trace"
                              disabled={props.disabled || props.mode === "edit"}
                              className="min-w-[100px]"
                            >
                              Live Traces [Legacy]
                            </TabsTrigger>
                          )}
                          <TabsTrigger
                            value="offline-experiment"
                            disabled={props.disabled || props.mode === "edit"}
                            className="min-w-[100px]"
                          >
                            Offline Experiments
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Second tab bar for experiment data source selection */}
            {!props.hideTargetSelection &&
              userFacingTarget === "offline-experiment" &&
              props.evalCapabilities.allowLegacy && (
                <div className="flex flex-col gap-2">
                  <FormLabel className="text-sm">SDK Version</FormLabel>
                  <Tabs
                    value={useOtelDataForExperiment ? "otel" : "non-otel"}
                    onValueChange={(value) => {
                      // Don't allow changes in edit mode or disabled mode
                      if (props.mode === "edit" || props.disabled) {
                        return;
                      }

                      const useOtel = value === "otel";
                      setUseOtelDataForExperiment(useOtel);

                      // Update the actual form target
                      const actualTarget = useOtel
                        ? EvalTargetObject.EXPERIMENT
                        : EvalTargetObject.DATASET;
                      form.setValue("target", actualTarget);

                      // Transform variable mapping for new target type
                      const currentMapping = form.getValues("mapping");
                      const newMapping = targetState.transformMapping(
                        currentMapping,
                        actualTarget,
                      );

                      // Update form state
                      form.setValue("filter", []);
                      form.setValue("mapping", newMapping);
                      setAvailableVariables(
                        targetState.getAvailableVariables(actualTarget),
                      );
                    }}
                  >
                    <TabsList className="grid w-fit max-w-fit grid-cols-2">
                      <TabsTrigger
                        value="otel"
                        className="min-w-[150px]"
                        disabled={props.mode === "edit" || props.disabled}
                      >
                        {"JS SDK >= 4.4.0, Python SDK >= 3.9.0 [Recommended]"}
                      </TabsTrigger>
                      <TabsTrigger
                        value="non-otel"
                        className="min-w-[150px]"
                        disabled={props.mode === "edit" || props.disabled}
                      >
                        {"JS SDK < 4.4.0, Python SDK < 3.9.0"}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {!props.disabled && (
                    <FormDescription>
                      Check with your technical team to see which version of the
                      Langfuse SDK you are using.
                    </FormDescription>
                  )}
                </div>
              )}

            {!props.hideTargetSelection &&
              props.mode !== "edit" &&
              !props.disabled && (
                <EvalVersionCallout
                  targetObject={form.watch("target")}
                  evalCapabilities={props.evalCapabilities}
                />
              )}

            {!props.hideAdvancedSettings &&
              isLegacyEvalTarget(form.watch("target")) && (
                <FormField
                  control={form.control}
                  name="timeScope"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Evaluate</FormLabel>
                      <FormControl>
                        <div className="flex flex-col gap-2">
                          <div className="items-top flex space-x-2">
                            <Checkbox
                              id="newObjects"
                              checked={field.value.includes("NEW")}
                              onCheckedChange={(checked) => {
                                const newValue = checked
                                  ? [...field.value, "NEW"]
                                  : field.value.filter((v) => v !== "NEW");
                                field.onChange(newValue);
                              }}
                              disabled={props.disabled}
                            />
                            <div className="grid gap-1.5 leading-none">
                              <label
                                htmlFor="newObjects"
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                New {getTargetDisplayName(form.watch("target"))}
                              </label>
                            </div>
                          </div>
                          <div className="items-top flex space-x-2">
                            <Checkbox
                              id="existingObjects"
                              checked={field.value.includes("EXISTING")}
                              onCheckedChange={(checked) => {
                                const newValue = checked
                                  ? [...field.value, "EXISTING"]
                                  : field.value.filter((v) => v !== "EXISTING");
                                field.onChange(newValue);
                              }}
                              disabled={
                                props.disabled ||
                                (props.mode === "edit" &&
                                  field.value.includes("EXISTING"))
                              }
                            />
                            <div className="flex items-center gap-1.5 leading-none">
                              <label
                                htmlFor="existingObjects"
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                Existing{" "}
                                {getTargetDisplayName(form.watch("target"))}
                              </label>
                              {field.value.includes("EXISTING") &&
                                !props.disabled &&
                                (props.mode === "edit" ? (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <InfoIcon className="size-3 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[300px] p-2">
                                      <span className="leading-4">
                                        This evaluator has already run on
                                        existing{" "}
                                        {getTargetDisplayName(
                                          form.watch("target"),
                                        )}{" "}
                                        once. Set up a new evaluator to re-run
                                        on existing{" "}
                                        {getTargetDisplayName(
                                          form.watch("target"),
                                        )}
                                        .
                                      </span>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <ExecutionCountTooltip
                                    projectId={props.projectId}
                                    item={form.watch("target")}
                                    filter={form.watch("filter")}
                                  />
                                ))}
                            </div>
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

            <FormField
              control={form.control}
              name="filter"
              render={({ field }) => {
                const target = form.watch("target");

                // Get appropriate columns based on target type
                const getFilterColumns = () => {
                  if (isEventTarget(target)) {
                    return getObservationFilterColumnsWithWarnings(
                      allowPropagationFilters,
                    );
                  } else if (isTraceTarget(target)) {
                    return tracesTableColsWithOptions(
                      traceFilterOptions,
                      evalTraceTableCols,
                    );
                  } else {
                    // dataset or experiment
                    return datasetFormFilterColsWithOptions(
                      datasetFilterOptions,
                      evalDatasetFormFilterCols,
                    );
                  }
                };

                const hasFilters = field.value && field.value.length > 0;

                return (
                  <FormItem>
                    <FormLabel>Where</FormLabel>
                    <FormControl>
                      <div className="max-w-[500px]">
                        {props.disabled && !hasFilters ? (
                          <p className="text-xs text-muted-foreground">
                            All {getTargetDisplayName(target)} will be evaluated
                          </p>
                        ) : (
                          <InlineFilterBuilder
                            columns={getFilterColumns()}
                            filterState={field.value ?? []}
                            onChange={(
                              value: z.infer<typeof singleFilter>[],
                            ) => {
                              field.onChange(value);
                              if (router.query.traceId) {
                                const { traceId, ...otherParams } =
                                  router.query;
                                router.replace(
                                  {
                                    pathname: router.pathname,
                                    query: otherParams,
                                  },
                                  undefined,
                                  { shallow: true },
                                );
                              }
                            }}
                            disabled={props.disabled}
                            columnsWithCustomSelect={
                              isEventTarget(target) || isTraceTarget(target)
                                ? ["tags"]
                                : undefined
                            }
                          />
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {isTraceTarget(form.watch("target")) && !props.disabled && (
              <TracesPreview
                projectId={props.projectId}
                filterState={form.watch("filter") ?? []}
              />
            )}

            {!props.hideAdvancedSettings && (
              <>
                <FormField
                  control={form.control}
                  name="sampling"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sampling</FormLabel>
                      <FormControl>
                        <div className="max-w-[500px]">
                          <Slider
                            disabled={props.disabled}
                            min={0}
                            max={1}
                            step={0.0001}
                            value={[field.value]}
                            onValueChange={(value) => field.onChange(value[0])}
                            showInput={true}
                            displayAsPercentage={true}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {isLegacyEvalTarget(form.watch("target")) && (
                  <FormField
                    control={form.control}
                    name="delay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Delay (seconds)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" min={0} />
                        </FormControl>
                        <FormDescription>
                          Time between first Trace/Dataset run event and
                          evaluation execution to ensure all data is available
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </>
            )}
          </div>
        </Card>
      )}
      <Card className="min-w-0 max-w-full p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-lg font-medium">Variable mapping</span>
        </div>
        {isTraceTarget(form.watch("target")) && !props.disabled && (
          <FormDescription>
            Preview of the evaluation prompt with the variables replaced with
            the first matched trace data subject to the filters.
          </FormDescription>
        )}
        <div className="flex max-w-full flex-col gap-4">
          <FormField
            control={form.control}
            name="mapping"
            render={() => (
              <>
                <div
                  className={cn(
                    "my-2 flex max-w-full flex-col gap-2",
                    !props.shouldWrapVariables && "lg:flex-row",
                  )}
                >
                  {showPreview ? (
                    traceWithObservations ? (
                      <EvaluationPromptPreview
                        evalTemplate={props.evalTemplate}
                        trace={traceWithObservations}
                        variableMapping={form.watch("mapping")}
                        isLoading={isLoading}
                        className={cn(
                          "min-h-48 bg-muted/50",
                          !props.shouldWrapVariables && "lg:w-2/3",
                        )}
                        controlButtons={mappingControlButtons}
                      />
                    ) : (
                      <div className="flex max-h-full min-h-48 w-full flex-col gap-1 bg-muted/50 lg:w-2/3">
                        <div className="flex flex-row items-center justify-between py-0 text-sm font-medium capitalize">
                          <div className="flex flex-row items-center gap-2">
                            Evaluation Prompt Preview
                            <Skeleton className="h-[25px] w-[63px]" />
                          </div>
                          <div className="flex justify-end">
                            {mappingControlButtons}
                          </div>
                        </div>
                        <div className="flex h-full w-full flex-1 items-center justify-center rounded border">
                          <p className="text-center text-sm text-muted-foreground">
                            No trace data found, please adjust filters or switch
                            to not show preview.
                          </p>
                        </div>
                      </div>
                    )
                  ) : (
                    <JSONView
                      title={"Evaluation Prompt"}
                      json={props.evalTemplate.prompt ?? null}
                      className={cn(
                        "min-h-48 bg-muted/50",
                        !props.shouldWrapVariables && "lg:w-2/3",
                      )}
                      codeClassName="flex-1"
                      collapseStringsAfterLength={null}
                      controlButtons={mappingControlButtons}
                    />
                  )}
                  <div
                    className={cn(
                      "flex flex-col gap-2",
                      !props.shouldWrapVariables && "lg:w-1/3",
                    )}
                  >
                    {isLegacyEvalTarget(form.watch("target")) // Complex variable mapping for trace/dataset targets (legacy)
                      ? fields.map((mappingField, index) => (
                          <Card className="flex flex-col gap-2 p-4" key={index}>
                            <div
                              className={cn(
                                "text-sm font-semibold",
                                getVariableColor(index),
                              )}
                            >
                              {"{{"}
                              {mappingField.templateVariable}
                              {"}}"}
                              <DocPopup
                                description={
                                  "Variable in the template to be replaced with the mapped data."
                                }
                                href={
                                  "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                }
                              />
                            </div>
                            <FormField
                              control={form.control}
                              key={`${mappingField.id}-langfuseObject`}
                              name={`mapping.${index}.langfuseObject`}
                              render={({ field }) => (
                                <div className="flex items-center gap-2">
                                  <VariableMappingDescription
                                    title="Object"
                                    description={
                                      "Langfuse object to retrieve the data from."
                                    }
                                    href={
                                      "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                    }
                                  />
                                  <FormItem className="w-2/3">
                                    <FormControl>
                                      <Select
                                        disabled={props.disabled}
                                        defaultValue={field.value}
                                        onValueChange={(value) => {
                                          field.onChange(value);
                                          form.setValue(
                                            `mapping.${index}.objectName`,
                                            undefined,
                                          );
                                        }}
                                      >
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {availableVariables.map(
                                            (evalObject) => (
                                              <SelectItem
                                                value={evalObject.id}
                                                key={evalObject.id}
                                              >
                                                {evalObject.display}
                                              </SelectItem>
                                            ),
                                          )}
                                        </SelectContent>
                                      </Select>
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                </div>
                              )}
                            />

                            {!isTraceOrDatasetObject(
                              form.watch(`mapping.${index}.langfuseObject`),
                            ) ? (
                              <FormField
                                control={form.control}
                                key={`${mappingField.id}-objectName`}
                                name={`mapping.${index}.objectName`}
                                render={({ field }) => {
                                  const type = String(
                                    form.watch(
                                      `mapping.${index}.langfuseObject`,
                                    ),
                                  ).toUpperCase() as ObservationType;
                                  const nameOptions = Array.from(
                                    observationTypeToNames.get(type) ?? [],
                                  );
                                  const isCustomOption =
                                    field.value === "custom" ||
                                    (field.value &&
                                      !nameOptions.includes(field.value));
                                  return (
                                    <div className="flex items-center gap-2">
                                      <VariableMappingDescription
                                        title={"Object Name"}
                                        description={
                                          "Name of the Langfuse object to retrieve the data from."
                                        }
                                        href={
                                          "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                        }
                                      />
                                      <FormItem className="w-2/3">
                                        <FormControl>
                                          {isCustomOption ? (
                                            <div className="flex flex-col gap-2">
                                              <Select
                                                onValueChange={(value) => {
                                                  if (value !== "custom") {
                                                    field.onChange(value);
                                                  }
                                                }}
                                                value="custom"
                                                disabled={props.disabled}
                                              >
                                                <SelectTrigger>
                                                  <SelectValue>
                                                    Enter name...
                                                  </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {nameOptions?.map((name) => (
                                                    <SelectItem
                                                      key={name}
                                                      value={name}
                                                    >
                                                      {name}
                                                    </SelectItem>
                                                  ))}
                                                  <SelectItem
                                                    key="custom"
                                                    value="custom"
                                                  >
                                                    Enter name...
                                                  </SelectItem>
                                                </SelectContent>
                                              </Select>
                                              <Input
                                                value={
                                                  field.value === "custom"
                                                    ? ""
                                                    : field.value || ""
                                                }
                                                onChange={(e) =>
                                                  field.onChange(e.target.value)
                                                }
                                                placeholder="Enter langfuse object name"
                                                disabled={props.disabled}
                                              />
                                            </div>
                                          ) : (
                                            <Select
                                              {...field}
                                              value={field.value ?? ""}
                                              onValueChange={field.onChange}
                                              disabled={props.disabled}
                                            >
                                              <SelectTrigger>
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {nameOptions?.map((name) => (
                                                  <SelectItem
                                                    key={name}
                                                    value={name}
                                                  >
                                                    {name}
                                                  </SelectItem>
                                                ))}
                                                <SelectItem
                                                  key="custom"
                                                  value="custom"
                                                >
                                                  Enter name...
                                                </SelectItem>
                                              </SelectContent>
                                            </Select>
                                          )}
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    </div>
                                  );
                                }}
                              />
                            ) : undefined}

                            <FormField
                              control={form.control}
                              key={`${mappingField.id}-selectedColumnId`}
                              name={`mapping.${index}.selectedColumnId`}
                              render={({ field }) => (
                                <div className="flex items-center gap-2">
                                  <VariableMappingDescription
                                    title={"Object Field"}
                                    description={
                                      "Field on the Langfuse object to insert into the template."
                                    }
                                    href={
                                      "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                    }
                                  />
                                  <FormItem className="w-2/3">
                                    <FormControl>
                                      <Select
                                        disabled={props.disabled}
                                        defaultValue={field.value ?? undefined}
                                        onValueChange={(value) => {
                                          const availableColumns =
                                            availableVariables.find(
                                              (evalObject) =>
                                                evalObject.id ===
                                                form.watch(
                                                  `mapping.${index}.langfuseObject`,
                                                ),
                                            )?.availableColumns;

                                          const column = availableColumns?.find(
                                            (column) => column.id === value,
                                          );

                                          field.onChange(column?.id);
                                        }}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="Object type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {availableVariables
                                            .find(
                                              (evalObject) =>
                                                evalObject.id ===
                                                form.watch(
                                                  `mapping.${index}.langfuseObject`,
                                                ),
                                            )
                                            ?.availableColumns.map((column) => (
                                              <SelectItem
                                                value={column.id}
                                                key={column.id}
                                              >
                                                {column.name}
                                              </SelectItem>
                                            ))}
                                        </SelectContent>
                                      </Select>
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                </div>
                              )}
                            />
                            {fieldHasJsonSelectorOption(
                              form.watch(`mapping.${index}.selectedColumnId`),
                            ) ? (
                              <FormField
                                control={form.control}
                                key={`${mappingField.id}-jsonSelector`}
                                name={`mapping.${index}.jsonSelector`}
                                render={({ field }) => (
                                  <div className="flex items-center gap-2">
                                    <VariableMappingDescription
                                      title={"JsonPath"}
                                      description={
                                        "Optional selection: Use JsonPath syntax to select from a JSON object stored on a trace. If not selected, we will pass the entire object into the prompt."
                                      }
                                      href={
                                        "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                      }
                                    />
                                    <FormItem className="w-2/3">
                                      <FormControl>
                                        <Input
                                          {...field}
                                          value={field.value ?? ""}
                                          disabled={props.disabled}
                                          placeholder="Optional"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  </div>
                                )}
                              />
                            ) : undefined}
                          </Card>
                        ))
                      : // Simplified variable mapping for event/experiment targets
                        fields.map((mappingField, index) => (
                          <Card className="flex flex-col gap-2 p-4" key={index}>
                            <div
                              className={cn(
                                "text-sm font-semibold",
                                getVariableColor(index),
                              )}
                            >
                              {"{{"}
                              {mappingField.templateVariable}
                              {"}}"}
                              <DocPopup
                                description={
                                  "Variable in the template to be replaced with the mapped data."
                                }
                                href={
                                  "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                }
                              />
                            </div>
                            {props.hideAdvancedSettings && (
                              <div className="flex items-center gap-2">
                                <VariableMappingDescription
                                  title="Object"
                                  description="Type of object to retrieve the data from."
                                  href="https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                />
                                <div className="w-2/3">
                                  <Input
                                    value={
                                      isEventTarget(form.watch("target"))
                                        ? "Observation"
                                        : "Experiment item"
                                    }
                                    disabled
                                  />
                                </div>
                              </div>
                            )}
                            <FormField
                              control={form.control}
                              key={`${mappingField.id}-selectedColumnId`}
                              name={`mapping.${index}.selectedColumnId`}
                              render={({ field }) => {
                                // Filter columns based on target
                                // For observations (event), exclude experiment-specific fields
                                const availableColumns =
                                  form.watch("target") ===
                                  EvalTargetObject.EVENT
                                    ? observationEvalVariableColumns.filter(
                                        (col) =>
                                          col.id !==
                                          "experiment_item_expected_output",
                                      )
                                    : observationEvalVariableColumns;

                                return (
                                  <div className="flex items-center gap-2">
                                    <VariableMappingDescription
                                      title={"Object Field"}
                                      description={
                                        "Observation field to insert into the template."
                                      }
                                      href={
                                        "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                      }
                                    />
                                    <FormItem className="w-2/3">
                                      <FormControl>
                                        <Select
                                          disabled={props.disabled}
                                          defaultValue={
                                            field.value ?? undefined
                                          }
                                          onValueChange={field.onChange}
                                        >
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select field" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {availableColumns.map((column) => (
                                              <SelectItem
                                                value={column.id}
                                                key={column.id}
                                              >
                                                {column.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  </div>
                                );
                              }}
                            />
                            {(form.watch(
                              `mapping.${index}.selectedColumnId`,
                            ) === "metadata" ||
                              form.watch(
                                `mapping.${index}.selectedColumnId`,
                              ) === "input" ||
                              form.watch(
                                `mapping.${index}.selectedColumnId`,
                              ) === "output" ||
                              form.watch(
                                `mapping.${index}.selectedColumnId`,
                              ) === "experiment_item_expected_output") && (
                              <FormField
                                control={form.control}
                                key={`${mappingField.id}-jsonSelector`}
                                name={`mapping.${index}.jsonSelector`}
                                render={({ field }) => (
                                  <div className="flex items-center gap-2">
                                    <VariableMappingDescription
                                      title={"JsonPath"}
                                      description={
                                        "Optional selection: Use JsonPath syntax to select from a JSON object. If not selected, we will pass the entire object into the prompt."
                                      }
                                      href={
                                        "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                      }
                                    />
                                    <FormItem className="w-2/3">
                                      <FormControl>
                                        <Input
                                          {...field}
                                          value={field.value ?? ""}
                                          disabled={props.disabled}
                                          placeholder="Optional"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  </div>
                                )}
                              />
                            )}
                          </Card>
                        ))}
                  </div>
                </div>
                <FormMessage />
              </>
            )}
          />
        </div>
      </Card>
    </div>
  );

  const mutationIsLoading =
    createJobMutation.isPending || updateJobMutation.isPending;

  const formFooter = props.renderFooter ? (
    props.renderFooter({ isLoading: mutationIsLoading, formError })
  ) : (
    <div className="flex w-full flex-col items-end gap-4">
      {!props.disabled ? (
        <Button
          type="submit"
          loading={mutationIsLoading}
          className="mt-3 max-w-fit"
        >
          {props.mode === "edit" ? "Update" : "Execute"}
        </Button>
      ) : null}
      {formError ? (
        <p className="text-red w-full text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      ) : null}
    </div>
  );

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={(e) => {
            e.stopPropagation(); // Prevent event bubbling to parent forms
            form.handleSubmit(onSubmit)(e);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
              e.preventDefault();
            }
          }}
          className="flex w-full flex-col gap-4"
        >
          {props.useDialog ? <DialogBody>{formBody}</DialogBody> : formBody}

          {formFooter &&
            (props.useDialog ? (
              <DialogFooter>{formFooter}</DialogFooter>
            ) : (
              <div className="mt-4 flex flex-row justify-end">{formFooter}</div>
            ))}
        </form>
      </Form>

      <Dialog
        open={showTraceConfirmDialog}
        onOpenChange={setShowTraceConfirmDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>You selected a legacy evaluator</DialogTitle>
          </DialogHeader>
          <DialogBody className="text-sm">
            We strongly recommend using live observations evaluators. Trace
            evaluators will be deprecated in the future. Only proceed if you are
            sure you cannot upgrade your SDK version now.
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowTraceConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowTraceConfirmDialog(false);
                setUserFacingTarget("trace");

                // Update form and mapping
                const actualTarget = "trace";
                const langfuseObject: LangfuseObject = "trace";
                const newMapping = form.getValues("mapping").map((field) => ({
                  ...field,
                  langfuseObject,
                }));
                form.setValue("filter", []);
                form.setValue("mapping", newMapping);
                setAvailableVariables(availableTraceEvalVariables);
                form.setValue("target", actualTarget);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
