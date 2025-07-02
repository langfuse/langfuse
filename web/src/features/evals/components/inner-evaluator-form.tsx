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
  availableDatasetEvalVariables,
  type ObservationType,
} from "@langfuse/shared";
import { z } from "zod/v4";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/src/utils/api";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type EvalTemplate, variableMapping } from "@langfuse/shared";
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
} from "@/src/features/evals/utils/evaluator-form-utils";
import { ExecutionCountTooltip } from "@/src/features/evals/components/execution-count-tooltip";
import {
  TimeScopeDescription,
  VariableMappingDescription,
} from "@/src/features/evals/components/eval-form-descriptions";
import { Suspense, lazy } from "react";
import {
  getDateFromOption,
  type TableDateRange,
} from "@/src/utils/date-range-utils";
import { useEvalConfigMappingData } from "@/src/features/evals/hooks/useEvalConfigMappingData";
import { type PartialConfig } from "@/src/features/evals/types";
import { Switch } from "@/src/components/ui/switch";
import {
  EvaluationPromptPreview,
  getVariableColor,
} from "@/src/features/evals/components/evaluation-prompt-preview";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";

// Lazy load TracesTable
const TracesTable = lazy(
  () => import("@/src/components/table/use-cases/traces"),
);

const fieldHasJsonSelectorOption = (
  selectedColumnId: string | undefined | null,
): boolean =>
  selectedColumnId === "input" ||
  selectedColumnId === "output" ||
  selectedColumnId === "metadata" ||
  selectedColumnId === "expected_output";

const TracesPreview = ({
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
        option: "24 hours",
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
      <div className="mb-4 flex max-h-[30dvh] flex-col overflow-hidden border-b border-l border-r">
        <Suspense fallback={<Skeleton className="h-[30dvh] w-full" />}>
          <TracesTable
            projectId={projectId}
            hideControls
            externalFilterState={filterState}
            externalDateRange={dateRange}
          />
        </Suspense>
      </div>
    </>
  );
};

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
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const capture = usePostHogClientCapture();
  const [showPreview, setShowPreview] = useState(false);
  const router = useRouter();
  const traceId = router.query.traceId as string;

  const form = useForm({
    resolver: zodResolver(evalConfigFormSchema),
    disabled: props.disabled,
    defaultValues: {
      scoreName:
        props.existingEvaluator?.scoreName ?? `${props.evalTemplate.name}`,
      target: props.existingEvaluator?.targetObject ?? "trace",
      filter: props.existingEvaluator?.filter
        ? z.array(singleFilter).parse(props.existingEvaluator.filter)
        : [],
      mapping: props.existingEvaluator?.variableMapping
        ? z
            .array(variableMapping)
            .parse(props.existingEvaluator.variableMapping)
        : z.array(variableMapping).parse(
            props.evalTemplate
              ? props.evalTemplate.vars.map((v) => ({
                  templateVariable: v,
                  langfuseObject: "trace" as const,
                  selectedColumnId: "input",
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
      { projectId: props.projectId },
      {
        trpc: { context: { skipBatch: true } },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );

  const traceFilterOptions = useMemo(() => {
    return {
      ...(traceFilterOptionsResponse.data ?? {}),
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

  const shouldFetch = !props.disabled && form.watch("target") === "trace";
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
    if (form.getValues("target") === "trace" && !props.disabled) {
      setShowPreview(true);
    } else if (form.getValues("target") === "dataset") {
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
          langfuseObject: "trace" as const,
          selectedColumnId: "input",
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
  >(
    isTraceTarget(props.existingEvaluator?.targetObject ?? "trace")
      ? availableTraceEvalVariables
      : availableDatasetEvalVariables,
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

    const validatedVarMapping = z
      .array(variableMapping)
      .safeParse(values.mapping);

    if (validatedVarMapping.success === false) {
      form.setError("mapping", {
        type: "manual",
        message: "Please fill out all variable mappings",
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if ("message" in error && typeof error.message === "string") {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          setFormError(error.message as string);
          return;
        } else {
          setFormError(JSON.stringify(error));
          console.error(error);
        }
      });
  }

  const mappingControlButtons = (
    <div className="flex items-center gap-2">
      {form.watch("target") === "trace" && !props.disabled && (
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
          <span className="text-lg font-medium">Target</span>
          <div className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="timeScope"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>Evaluator runs on</FormLabel>
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
                            New{" "}
                            {form.watch("target") === "trace"
                              ? "traces"
                              : "dataset run items"}
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
                            {form.watch("target") === "trace"
                              ? "traces"
                              : "dataset run items"}
                          </label>
                          {field.value.includes("EXISTING") &&
                            props.mode !== "edit" &&
                            !props.disabled && (
                              <ExecutionCountTooltip
                                projectId={props.projectId}
                                item={form.watch("target")}
                                filter={form.watch("filter")}
                              />
                            )}
                        </div>
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="target"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target data</FormLabel>
                  <FormControl>
                    <Tabs
                      defaultValue="trace"
                      value={field.value}
                      onValueChange={(value) => {
                        const isTrace = isTraceTarget(value);
                        const langfuseObject: LangfuseObject = isTrace
                          ? "trace"
                          : "dataset_item";
                        const newMapping = form
                          .getValues("mapping")
                          .map((field) => ({
                            ...field,
                            langfuseObject,
                          }));
                        form.setValue("filter", []);
                        form.setValue("mapping", newMapping);
                        setAvailableVariables(
                          isTrace
                            ? availableTraceEvalVariables
                            : availableDatasetEvalVariables,
                        );
                        field.onChange(value);
                      }}
                    >
                      <TabsList>
                        <TabsTrigger
                          value="trace"
                          disabled={props.disabled || props.mode === "edit"}
                        >
                          Live tracing data
                        </TabsTrigger>
                        <TabsTrigger
                          value="dataset"
                          disabled={props.disabled || props.mode === "edit"}
                        >
                          Experiment runs
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="filter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target filter</FormLabel>
                  {isTraceTarget(form.watch("target")) ? (
                    <>
                      <FormControl>
                        <div className="max-w-[500px]">
                          <InlineFilterBuilder
                            columns={tracesTableColsWithOptions(
                              traceFilterOptions,
                              evalTraceTableCols,
                            )}
                            filterState={field.value ?? []}
                            onChange={(
                              value: z.infer<typeof singleFilter>[],
                            ) => {
                              field.onChange(value);
                              if (router.query.traceId) {
                                // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
                            columnsWithCustomSelect={["tags"]}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </>
                  ) : (
                    <>
                      <FormControl>
                        <InlineFilterBuilder
                          columns={datasetFormFilterColsWithOptions(
                            datasetFilterOptions,
                            evalDatasetFormFilterCols,
                          )}
                          filterState={field.value ?? []}
                          onChange={field.onChange}
                          disabled={props.disabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </>
                  )}
                </FormItem>
              )}
            />

            {form.watch("target") === "trace" && !props.disabled && (
              <TracesPreview
                projectId={props.projectId}
                filterState={form.watch("filter") ?? []}
              />
            )}

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
                  <div className="flex flex-col">
                    <FormDescription className="mt-1 flex flex-row gap-1">
                      <TimeScopeDescription
                        projectId={props.projectId}
                        timeScope={form.watch("timeScope")}
                        target={
                          form.watch("target") as "trace" | "dataset_item"
                        }
                      />
                    </FormDescription>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                    Time between first Trace/Dataset run event and evaluation
                    execution to ensure all data is available
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </Card>
      )}
      <Card className="min-w-0 max-w-full p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-lg font-medium">Variable mapping</span>
        </div>
        {form.watch("target") === "trace" && !props.disabled && (
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
                          "min-h-48",
                          !props.shouldWrapVariables && "lg:w-2/3",
                        )}
                        controlButtons={mappingControlButtons}
                      />
                    ) : (
                      <div className="flex max-h-full min-h-48 w-full flex-col gap-1 lg:w-2/3">
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
                        "min-h-48",
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
                    {fields.map((mappingField, index) => (
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
                              "https://langfuse.com/docs/scores/model-based-evals"
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
                                  "https://langfuse.com/docs/scores/model-based-evals"
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
                                      {availableVariables.map((evalObject) => (
                                        <SelectItem
                                          value={evalObject.id}
                                          key={evalObject.id}
                                        >
                                          {evalObject.display}
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

                        {!isTraceOrDatasetObject(
                          form.watch(`mapping.${index}.langfuseObject`),
                        ) ? (
                          <FormField
                            control={form.control}
                            key={`${mappingField.id}-objectName`}
                            name={`mapping.${index}.objectName`}
                            render={({ field }) => {
                              const type = String(
                                form.watch(`mapping.${index}.langfuseObject`),
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
                                      "https://langfuse.com/docs/scores/model-based-evals"
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
                                title={"Object Variable"}
                                description={
                                  "Variable on the Langfuse object to insert into the template."
                                }
                                href={
                                  "https://langfuse.com/docs/scores/model-based-evals"
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
                                    "https://langfuse.com/docs/scores/model-based-evals"
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

  const formFooter = (
    <div className="flex w-full flex-col items-end gap-4">
      {!props.disabled ? (
        <Button
          type="submit"
          loading={createJobMutation.isLoading || updateJobMutation.isLoading}
          className="mt-3 max-w-fit"
        >
          Execute
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
    <Form {...form}>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex w-full flex-col gap-4"
      >
        {props.useDialog ? <DialogBody>{formBody}</DialogBody> : formBody}

        {props.useDialog ? (
          <DialogFooter>{formFooter}</DialogFooter>
        ) : (
          <div className="mt-4 flex flex-row justify-end">{formFooter}</div>
        )}
      </form>
    </Form>
  );
};
