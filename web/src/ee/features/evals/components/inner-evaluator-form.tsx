import { useFieldArray, useForm } from "react-hook-form";
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
  type JobConfiguration,
  availableTraceEvalVariables,
  datasetFormFilterColsWithOptions,
  availableDatasetEvalVariables,
} from "@langfuse/shared";
import * as z from "zod";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/src/utils/api";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type EvalTemplate, variableMapping } from "@langfuse/shared";
import router from "next/router";
import { Slider } from "@/src/components/ui/slider";
import { Card } from "@/src/components/ui/card";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import DocPopup from "@/src/components/layouts/doc-popup";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  evalConfigFormSchema,
  isTraceOrDatasetObject,
  isTraceTarget,
  type LangfuseObject,
} from "@/src/ee/features/evals/utils/evaluator-form-utils";
import { ExecutionCountTooltip } from "@/src/ee/features/evals/components/execution-count-tooltip";
import {
  TimeScopeDescription,
  VariableMappingDescription,
} from "@/src/ee/features/evals/components/eval-form-descriptions";

const fieldHasJsonSelectorOption = (
  selectedColumnId: string | undefined | null,
): boolean =>
  selectedColumnId === "input" ||
  selectedColumnId === "output" ||
  selectedColumnId === "metadata" ||
  selectedColumnId === "expected_output";

export const InnerEvaluatorForm = (props: {
  projectId: string;
  evalTemplate: EvalTemplate;
  disabled?: boolean;
  existingEvaluator?: JobConfiguration;
  onFormSuccess?: () => void;
  shouldWrapVariables?: boolean;
  mode?: "create" | "edit";
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const capture = usePostHogClientCapture();

  const form = useForm<z.infer<typeof evalConfigFormSchema>>({
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
        : 10,
      timeScope: (props.existingEvaluator?.timeScope ?? ["NEW"]).filter(
        (option): option is "NEW" | "EXISTING" =>
          ["NEW", "EXISTING"].includes(option),
      ),
    },
  });

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

    (props.mode === "edit" && props.existingEvaluator
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
        form.reset();
        props.onFormSuccess?.();

        if (props.mode !== "edit") {
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

  return (
    <Form {...form}>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex w-full flex-col gap-4"
      >
        <div className="grid gap-4">
          <FormField
            control={form.control}
            name="scoreName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Score Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Card className="flex max-w-full flex-col gap-6 overflow-y-auto p-4">
            <FormField
              control={form.control}
              name="target"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target object</FormLabel>
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
                          .map((field) => ({ ...field, langfuseObject }));
                        form.setValue("mapping", newMapping);
                        form.setValue("delay", isTrace ? 10 : 20);
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
                          Trace
                        </TabsTrigger>
                        <TabsTrigger
                          value="dataset"
                          disabled={props.disabled || props.mode === "edit"}
                        >
                          Dataset
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex min-w-[300px]">
              <FormField
                control={form.control}
                name="timeScope"
                render={({ field }) => (
                  <FormItem>
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
            </div>

            <FormField
              control={form.control}
              name="filter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target filter</FormLabel>
                  {isTraceTarget(form.watch("target")) ? (
                    <>
                      <FormControl>
                        <InlineFilterBuilder
                          columns={tracesTableColsWithOptions(
                            traceFilterOptions,
                            evalTraceTableCols,
                          )}
                          filterState={field.value ?? []}
                          onChange={field.onChange}
                          disabled={props.disabled}
                          columnsWithCustomSelect={["tags"]}
                        />
                      </FormControl>
                      <FormDescription>
                        <TimeScopeDescription
                          projectId={props.projectId}
                          timeScope={form.watch("timeScope")}
                          target="trace"
                        />
                      </FormDescription>
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
                      <FormDescription>
                        <TimeScopeDescription
                          projectId={props.projectId}
                          timeScope={form.watch("timeScope")}
                          target="dataset_item"
                        />
                      </FormDescription>
                      <FormMessage />
                    </>
                  )}
                </FormItem>
              )}
            />
          </Card>
          <Card className="p-4">
            <FormField
              control={form.control}
              name="mapping"
              render={() => (
                <>
                  <FormLabel className="">Variable mapping</FormLabel>
                  <FormControl>
                    Here will some variable mapping be added.
                  </FormControl>
                  <div
                    className={cn(
                      "my-2 flex flex-col gap-2",
                      !props.shouldWrapVariables && "lg:flex-row",
                    )}
                  >
                    <JSONView
                      title={"Eval Template"}
                      json={props.evalTemplate.prompt ?? null}
                      className={cn(
                        "min-h-48",
                        !props.shouldWrapVariables && "lg:w-2/3",
                      )}
                      codeClassName="flex-1"
                    />
                    <div
                      className={cn(
                        "flex flex-col gap-2",
                        !props.shouldWrapVariables && "lg:w-1/3",
                      )}
                    >
                      {fields.map((mappingField, index) => (
                        <Card className="flex flex-col gap-2 p-4" key={index}>
                          <div className="text-sm font-semibold">
                            {"{{"}
                            {mappingField.templateVariable}
                            {"}}"}
                            <DocPopup
                              description={
                                "Variable in the template to be replaced with the trace data."
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
                                      onValueChange={field.onChange}
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
                              render={({ field }) => (
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
                                      <Input
                                        {...field}
                                        value={field.value ?? ""}
                                        disabled={props.disabled}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                </div>
                              )}
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
                  <FormDescription>
                    Insert trace data into the prompt template.
                  </FormDescription>
                  <FormMessage />
                </>
              )}
            />
          </Card>
          <Card className="flex flex-col gap-6 p-4">
            <FormField
              control={form.control}
              name="sampling"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sampling</FormLabel>
                  <FormControl>
                    <Slider
                      disabled={props.disabled}
                      min={0}
                      max={1}
                      step={0.01}
                      value={[field.value]}
                      onValueChange={(value) => field.onChange(value[0])}
                    />
                  </FormControl>
                  <div className="flex flex-col">
                    <FormDescription className="flex justify-between">
                      <span>0%</span>
                      <span>100%</span>
                    </FormDescription>
                    <FormDescription className="mt-1 flex flex-row gap-1">
                      <span>Percentage of traces to evaluate.</span>
                      <span>
                        Currently set to {(field.value * 100).toFixed(0)}%.
                      </span>
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
                    <Input {...field} type="number" />
                  </FormControl>
                  <FormDescription>
                    Time between first Trace/Dataset run event and evaluation
                    execution to ensure all data is available
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Card>
        </div>

        {!props.disabled ? (
          <Button
            type="submit"
            loading={createJobMutation.isLoading || updateJobMutation.isLoading}
            className="mt-3"
          >
            Save
          </Button>
        ) : null}
      </form>
      {formError ? (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      ) : null}
    </Form>
  );
};
