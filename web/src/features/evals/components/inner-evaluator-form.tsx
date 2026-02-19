import { type UseFormReturn, useForm } from "react-hook-form";
import { AlertDescription } from "@/src/components/ui/alert";
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
import { zodResolver } from "@hookform/resolvers/zod";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Badge } from "@/src/components/ui/badge";
import {
  tracesTableColsWithOptions,
  singleFilter,
  availableTraceEvalVariables,
  datasetFormFilterColsWithOptions,
  observationEvalFilterColsWithOptions,
  experimentEvalFilterColsWithOptions,
  type ColumnDefinition,
  type availableDatasetEvalVariables,
  JobConfigState,
} from "@langfuse/shared";
import { z } from "zod/v4";
import { useEffect, useMemo, useState, memo } from "react";
import { api } from "@/src/utils/api";
import {
  InlineFilterBuilder,
  type ColumnDefinitionWithAlert,
} from "@/src/features/filters/components/filter-builder";
import {
  type EvalTemplate,
  variableMapping,
  observationVariableMapping,
} from "@langfuse/shared";
import { useRouter } from "next/router";
import { Slider } from "@/src/components/ui/slider";
import { Card } from "@/src/components/ui/card";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Switch } from "@/src/components/ui/switch";
import {
  evalConfigFormSchema,
  type EvalFormType,
  getTargetDisplayName,
  inferDefaultMapping,
  type LangfuseObject,
} from "@/src/features/evals/utils/evaluator-form-utils";
import { validateAndTransformVariableMapping } from "@/src/features/evals/utils/variable-mapping-validation";
import { EvalTargetObject } from "@langfuse/shared";
import { ExecutionCountTooltip } from "@/src/features/evals/components/execution-count-tooltip";
import { Suspense, lazy } from "react";
import {
  getDateFromOption,
  type TableDateRange,
} from "@/src/utils/date-range-utils";
import { type PartialConfig } from "@/src/features/evals/types";
import { type EvalCapabilities } from "@/src/features/evals/hooks/useEvalCapabilities";
import { EvalVersionCallout } from "@/src/features/evals/components/eval-version-callout";
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
import {
  BetweenHorizonalStart,
  CircleDot,
  AlertTriangle,
  FlaskConical,
  InfoIcon,
  ListTree,
} from "lucide-react";
import {
  isDatasetTarget,
  isEventTarget,
  isExperimentTarget,
  isLegacyEvalTarget,
  isTraceTarget,
} from "@/src/features/evals/utils/typeHelpers";
import {
  useUserFacingTarget,
  useEvaluatorTargetState,
} from "@/src/features/evals/hooks/useEvaluatorTarget";
import {
  COLUMN_IDENTIFIERS_THAT_REQUIRE_PROPAGATION,
  DEFAULT_OBSERVATION_FILTER,
  DEFAULT_TRACE_FILTER,
} from "@/src/features/evals/utils/evaluator-constants";
import { useEvalConfigFilterOptions } from "@/src/features/evals/hooks/useEvalConfigFilterOptions";
import { VariableMappingCard } from "@/src/features/evals/components/variable-mapping-card";
import { useIsObservationEvalsFullyReleased } from "@/src/features/events/hooks/useObservationEvals";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

/**
 * Adds propagation warnings to columns that require OTEL SDK with span propagation
 */
const addPropagationWarnings = (
  columns: ColumnDefinition[],
  allowPropagationFilters: boolean,
): ColumnDefinitionWithAlert[] => {
  return columns.map((col) => {
    if (
      !allowPropagationFilters &&
      COLUMN_IDENTIFIERS_THAT_REQUIRE_PROPAGATION.has(col.id)
    ) {
      return {
        ...col,
        alert: {
          severity: "warning" as const,
          content: (
            <>
              This filter requires JS SDK &ge; 4.0.0 or Python SDK &ge; 3.0.0
              with attribute propagation enabled. Please{" "}
              <a
                href="https://langfuse.com/integrations/native/opentelemetry#propagating-attributes"
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

    return col;
  });
};

// Lazy load tables
const TracesTable = lazy(
  () => import("@/src/components/table/use-cases/traces"),
);
const ObservationsTable = lazy(
  () => import("@/src/components/table/use-cases/observations"),
);

const EventsTable = lazy(
  () => import("@/src/features/events/components/EventsTable"),
);

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

const ObservationsPreview = memo(
  ({
    projectId,
    filterState,
  }: {
    projectId: string;
    filterState: z.infer<typeof singleFilter>[];
  }) => {
    const isv4Enabled = useV4Beta();

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
          <FormDescription>
            Sample over the last 24 hours that match filters
          </FormDescription>
        </div>
        <div className="mb-4 flex max-h-[30dvh] w-full flex-col overflow-hidden border-b border-l border-r">
          <Suspense fallback={<Skeleton className="h-[30dvh] w-full" />}>
            {isv4Enabled ? (
              <EventsTable
                projectId={projectId}
                hideControls
                externalFilterState={filterState}
                externalDateRange={dateRange}
                limitRows={10}
              />
            ) : (
              <ObservationsTable
                projectId={projectId}
                hideControls
                externalFilterState={filterState}
                externalDateRange={dateRange}
                limitRows={10}
              />
            )}
          </Suspense>
        </div>
      </>
    );
  },
);

ObservationsPreview.displayName = "ObservationsPreview";

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
  hidePreviewTable?: boolean;
  evalCapabilities: EvalCapabilities;
  defaultRunOnLive?: boolean;
  renderFooter?: (params: {
    isLoading: boolean;
    formError: string | null;
  }) => React.ReactNode;
  oldConfigId?: string;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const isFullyReleased = useIsObservationEvalsFullyReleased();
  const capture = usePostHogClientCapture();
  const router = useRouter();
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

  const {
    traceFilterOptions,
    observationEvalFilterOptions,
    experimentEvalFilterOptions,
    datasetFilterOptions,
  } = useEvalConfigFilterOptions({ projectId: props.projectId });

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
        : (props.existingEvaluator?.targetObject ?? EvalTargetObject.EVENT) ===
            EvalTargetObject.TRACE
          ? // For new trace evaluators, exclude internal environments by default
            DEFAULT_TRACE_FILTER
          : (props.existingEvaluator?.targetObject ??
                EvalTargetObject.EVENT) === EvalTargetObject.EVENT
            ? // For new observation evaluators, default to GENERATION type
              DEFAULT_OBSERVATION_FILTER
            : [],
      mapping: props.existingEvaluator?.variableMapping
        ? isEventTarget(props.existingEvaluator.targetObject) ||
          isExperimentTarget(props.existingEvaluator.targetObject)
          ? z
              .array(observationVariableMapping)
              .parse(props.existingEvaluator.variableMapping)
          : z
              .array(variableMapping)
              .parse(props.existingEvaluator.variableMapping)
        : z.array(variableMapping).parse(
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
      runOnLive: props.existingEvaluator
        ? props.existingEvaluator.status === "ACTIVE"
        : (props.defaultRunOnLive ?? true),
    },
  }) as UseFormReturn<EvalFormType>;

  useEffect(() => {
    if (props.evalTemplate && form.getValues("mapping").length === 0) {
      const target = form.getValues("target");
      form.setValue(
        "mapping",
        props.evalTemplate.vars.map((v) => ({
          templateVariable: v,
          langfuseObject: isLegacyEvalTarget(target)
            ? ("trace" as const)
            : undefined,
          ...inferDefaultMapping(v),
        })),
      );
      form.setValue("scoreName", `${props.evalTemplate.name}`);
    }
  }, [form, props.evalTemplate]);

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

    // For modern targets, derive status from runOnLive
    const isModern = !isLegacyEvalTarget(values.target);
    const status = isModern
      ? values.runOnLive
        ? JobConfigState.ACTIVE
        : JobConfigState.INACTIVE
      : undefined;

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
            timeScope: isModern ? ["NEW"] : values.timeScope,
            ...(status ? { status } : {}),
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
          timeScope: isModern ? ["NEW"] : values.timeScope,
          ...(status ? { status } : {}),
        })
    )
      .then(() => {
        props.onFormSuccess?.();

        if (props.mode !== "edit" && !props.preventRedirect) {
          void router.push(`/project/${props.projectId}/evals`);
          // Don't reset form when redirecting - it will unmount anyway
        } else {
          // Only reset form when NOT redirecting
          form.reset();
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

  function handleAndResolveTarget(value: string) {
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
      // offline-experiment: only use EXPERIMENT if beta is enabled AND OTEL is selected
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

    // Update form state with target-appropriate default filters
    form.setValue(
      "filter",
      actualTarget === EvalTargetObject.TRACE
        ? DEFAULT_TRACE_FILTER
        : actualTarget === EvalTargetObject.EVENT
          ? DEFAULT_OBSERVATION_FILTER
          : [],
    );
    form.setValue("mapping", newMapping);
    form.setValue("runOnLive", props.defaultRunOnLive ?? true);
    setAvailableVariables(targetState.getAvailableVariables(actualTarget));
    return actualTarget;
  }

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
                          const actualTarget = handleAndResolveTarget(value);
                          if (actualTarget) {
                            field.onChange(actualTarget);
                          }
                        }}
                      >
                        <TabsList className="grid w-fit max-w-fit grid-flow-col gap-4">
                          <TabsTrigger
                            value="event"
                            disabled={props.disabled || props.mode === "edit"}
                            className="min-w-[100px] gap-1.5"
                          >
                            <CircleDot className="h-3.5 w-3.5" />
                            Observations
                            <Badge
                              variant="secondary"
                              size="sm"
                              className="border border-border font-normal"
                            >
                              Beta
                            </Badge>
                          </TabsTrigger>
                          {allowLegacy && (
                            <TabsTrigger
                              value="trace"
                              disabled={props.disabled || props.mode === "edit"}
                              className="min-w-[100px] gap-1.5"
                            >
                              <ListTree className="h-3.5 w-3.5" />
                              Traces
                              {isFullyReleased && (
                                <Badge
                                  variant="secondary"
                                  size="sm"
                                  className="border border-border font-normal"
                                >
                                  Legacy
                                </Badge>
                              )}
                            </TabsTrigger>
                          )}
                          <TabsTrigger
                            value="offline-experiment"
                            disabled={props.disabled || props.mode === "edit"}
                            className="min-w-[100px] gap-1.5"
                          >
                            <FlaskConical className="h-3.5 w-3.5" />
                            Experiments
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
                  <FormLabel className="text-sm">Experiment Method</FormLabel>
                  <Tabs
                    value={useOtelDataForExperiment ? "otel" : "non-otel"}
                    onValueChange={(value) => {
                      // Don't allow changes in edit mode or disabled mode
                      if (props.mode === "edit" || props.disabled) {
                        return;
                      }

                      const useOtel = value === "otel";
                      setUseOtelDataForExperiment(useOtel);

                      // Update the actual form target: only use EXPERIMENT if beta is enabled
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
                    <TabsList className="grid w-fit max-w-fit grid-flow-col gap-4">
                      <TabsTrigger
                        value="otel"
                        className="min-w-[100px] gap-1.5"
                        disabled={props.mode === "edit" || props.disabled}
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                        Experiment Runner SDK
                        <Badge
                          variant="secondary"
                          size="sm"
                          className="border border-border font-normal"
                        >
                          Beta
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger
                        value="non-otel"
                        className="min-w-[100px] gap-1.5"
                        disabled={props.mode === "edit" || props.disabled}
                      >
                        <BetweenHorizonalStart className="h-3.5 w-3.5" />
                        Low-level SDK methods
                        {isFullyReleased && (
                          <Badge
                            variant="secondary"
                            size="sm"
                            className="border border-border font-normal"
                          >
                            Legacy
                          </Badge>
                        )}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
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

            {/* Run on Live toggle for modern (non-legacy) targets */}
            {!props.hideAdvancedSettings &&
              !isLegacyEvalTarget(form.watch("target")) && (
                <FormField
                  control={form.control}
                  name="runOnLive"
                  render={({ field }) => {
                    const target = form.watch("target");
                    return (
                      <div className="flex max-w-4xl flex-col gap-2">
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>
                              {isEventTarget(target)
                                ? "Run on live incoming observations"
                                : "Run on new experiments"}
                            </FormLabel>
                            <FormDescription>
                              Automatically evaluate new incoming{" "}
                              {getTargetDisplayName(target)}.
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={props.disabled}
                            />
                          </FormControl>
                        </FormItem>
                        {!field.value && isEventTarget(target) && (
                          <p className="text-xs text-muted-foreground">
                            This evaluator can still be used for batched
                            evaluation of historic observations.
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
              )}

            {(isLegacyEvalTarget(form.watch("target")) ||
              form.watch("runOnLive")) && (
              <>
                <FormField
                  control={form.control}
                  name="filter"
                  render={({ field }) => {
                    const target = form.watch("target");

                    // Get appropriate columns based on target type
                    const getFilterColumns = () => {
                      if (isEventTarget(target)) {
                        // Event evaluators - use observation columns with propagation warnings
                        const baseColumns =
                          observationEvalFilterColsWithOptions(
                            observationEvalFilterOptions,
                          );
                        return addPropagationWarnings(
                          baseColumns,
                          allowPropagationFilters,
                        );
                      } else if (isTraceTarget(target)) {
                        return tracesTableColsWithOptions(traceFilterOptions);
                      } else if (isExperimentTarget(target)) {
                        // Experiment evaluators - only dataset filter
                        return experimentEvalFilterColsWithOptions(
                          experimentEvalFilterOptions,
                        );
                      } else {
                        // dataset (legacy non-OTEL experiments)
                        return datasetFormFilterColsWithOptions(
                          datasetFilterOptions,
                        );
                      }
                    };

                    const hasFilters = field.value && field.value.length > 0;

                    return (
                      <FormItem>
                        <FormLabel>Filter</FormLabel>
                        <FormControl>
                          <div className="max-w-[500px]">
                            {props.disabled && !hasFilters ? (
                              <p className="text-xs text-muted-foreground">
                                All {getTargetDisplayName(target)} will be
                                evaluated
                              </p>
                            ) : (
                              <InlineFilterBuilder
                                columnIdentifier={
                                  isDatasetTarget(target) ||
                                  isTraceTarget(target)
                                    ? "name"
                                    : "id"
                                }
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
                                    ? ["tags", "name"]
                                    : undefined
                                }
                              />
                            )}
                          </div>
                        </FormControl>
                        {!props.disabled && !hasFilters && (
                          <div className="align-center flex max-w-[500px] gap-1">
                            <AlertTriangle className="h-4 w-4 text-dark-yellow" />
                            <AlertDescription className="text-dark-yellow">
                              No filters set. This evaluator will run on all{" "}
                              {getTargetDisplayName(target)}.
                            </AlertDescription>
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                {/* Preview based on target type */}
                {!props.disabled && !props.hidePreviewTable && (
                  <>
                    {isTraceTarget(form.watch("target")) && (
                      <TracesPreview
                        projectId={props.projectId}
                        filterState={form.watch("filter") ?? []}
                      />
                    )}

                    {isEventTarget(form.watch("target")) && (
                      <ObservationsPreview
                        projectId={props.projectId}
                        filterState={form.watch("filter") ?? []}
                      />
                    )}
                  </>
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
                                onValueChange={(value) =>
                                  field.onChange(value[0])
                                }
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
                              evaluation execution to ensure all data is
                              available
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </Card>
      )}
      <VariableMappingCard
        projectId={props.projectId}
        availableVariables={availableVariables}
        evalTemplate={props.evalTemplate}
        form={form}
        disabled={props.disabled}
        shouldWrapVariables={props.shouldWrapVariables}
        hideAdvancedSettings={props.hideAdvancedSettings}
        oldConfigId={props.oldConfigId}
      />
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
            We strongly recommend using observation evaluators. Trace evaluators
            will be deprecated in the future. Only proceed if you are sure you
            cannot upgrade your SDK version now.
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
                form.setValue("filter", DEFAULT_TRACE_FILTER);
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
