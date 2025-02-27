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
  type langfuseObjects,
  TimeScopeSchema,
} from "@langfuse/shared";
import * as z from "zod";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/src/utils/api";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import {
  type EvalTemplate,
  variableMapping,
  wipVariableMapping,
} from "@langfuse/shared";
import router from "next/router";
import { Slider } from "@/src/components/ui/slider";
import { Card } from "@/src/components/ui/card";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { Label } from "@/src/components/ui/label";
import DocPopup from "@/src/components/layouts/doc-popup";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { CheckIcon, ChevronDown, ExternalLink } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
  InputCommandSeparator,
} from "@/src/components/ui/input-command";
import { cn } from "@/src/utils/tailwind";
import { Dialog, DialogContent, DialogTitle } from "@/src/components/ui/dialog";
import { EvalTemplateForm } from "@/src/ee/features/evals/components/template-form";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { Checkbox } from "@/src/components/ui/checkbox";
import { compactNumberFormatter } from "@/src/utils/numbers";

export const fieldHasJsonSelectorOption = (
  selectedColumnId: string | undefined | null,
): boolean =>
  selectedColumnId === "input" ||
  selectedColumnId === "output" ||
  selectedColumnId === "expected_output";

const formSchema = z.object({
  scoreName: z.string(),
  target: z.string(),
  filter: z.array(singleFilter).nullable(), // reusing the filter type from the tables
  mapping: z.array(wipVariableMapping),
  sampling: z.coerce.number().gt(0).lte(1),
  delay: z.coerce.number().optional().default(10),
  timeScope: TimeScopeSchema,
});

type LangfuseObject = (typeof langfuseObjects)[number];

const isTraceTarget = (target: string): boolean => target === "trace";
const isTraceOrDatasetObject = (object: LangfuseObject): boolean =>
  object === "trace" || object === "dataset_item";

export const EvaluatorForm = (props: {
  projectId: string;
  evalTemplates: EvalTemplate[];
  disabled?: boolean;
  existingEvaluator?: JobConfiguration & { evalTemplate: EvalTemplate };
  onFormSuccess?: () => void;
  mode?: "create" | "edit";
  shouldWrapVariables?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [evalTemplate, setEvalTemplate] = useState<string | undefined>(
    props.existingEvaluator?.evalTemplate.id,
  );
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
  const [selectedTemplateName, setSelectedTemplateName] = useState<
    string | undefined
  >(props.existingEvaluator?.evalTemplate.name);
  const [selectedTemplateVersion, setSelectedTemplateVersion] = useState<
    number | undefined
  >(props.existingEvaluator?.evalTemplate.version);

  const utils = api.useUtils();
  const currentTemplate = props.evalTemplates.find(
    (t) => t.id === evalTemplate,
  );

  useEffect(() => {
    if (props.existingEvaluator?.evalTemplate && !evalTemplate) {
      setEvalTemplate(props.existingEvaluator.evalTemplate.id);
    }
  }, [props.existingEvaluator, evalTemplate]);

  // Group templates by name
  const templatesByName = props.evalTemplates.reduce(
    (acc, template) => {
      if (!acc[template.name]) {
        acc[template.name] = [];
      }
      acc[template.name].push(template);
      return acc;
    },
    {} as Record<string, EvalTemplate[]>,
  );

  return (
    <>
      {!props.disabled ? (
        <div className="mb-2 flex gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                disabled={props.disabled || props.mode === "edit"}
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-2/3 justify-between px-2 font-normal"
              >
                {selectedTemplateName || "Select a template"}
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[--radix-popover-trigger-width] overflow-auto p-0"
              align="start"
            >
              <InputCommand>
                <InputCommandInput
                  placeholder="Search templates..."
                  className="h-9"
                />
                <InputCommandList>
                  <InputCommandEmpty>No template found.</InputCommandEmpty>
                  <InputCommandGroup>
                    {Object.entries(templatesByName).map(
                      ([name, templateData]) => (
                        <InputCommandItem
                          key={name}
                          onSelect={() => {
                            setSelectedTemplateName(name);
                            const latestVersion =
                              templateData[templateData.length - 1];
                            setSelectedTemplateVersion(latestVersion.version);
                            setEvalTemplate(latestVersion.id);
                          }}
                        >
                          {name}
                          <CheckIcon
                            className={cn(
                              "ml-auto h-4 w-4",
                              name === selectedTemplateName
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                        </InputCommandItem>
                      ),
                    )}
                  </InputCommandGroup>
                  <InputCommandSeparator alwaysRender />
                  <InputCommandGroup forceMount>
                    <InputCommandItem
                      onSelect={() => setIsCreateTemplateOpen(true)}
                    >
                      Create new template
                      <ExternalLink className="ml-auto h-4 w-4" />
                    </InputCommandItem>
                  </InputCommandGroup>
                </InputCommandList>
              </InputCommand>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                disabled={
                  props.disabled ||
                  !selectedTemplateName ||
                  props.mode === "edit"
                }
                variant="outline"
                role="combobox"
                className="w-1/3 justify-between px-2 font-normal"
              >
                {selectedTemplateVersion
                  ? `Version ${selectedTemplateVersion}`
                  : "Version"}
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[--radix-popover-trigger-width] overflow-auto p-0"
              align="start"
            >
              <InputCommand>
                <InputCommandList>
                  <InputCommandEmpty>No version found.</InputCommandEmpty>
                  <InputCommandGroup>
                    {selectedTemplateName &&
                    templatesByName[selectedTemplateName] ? (
                      templatesByName[selectedTemplateName].map((template) => (
                        <InputCommandItem
                          key={template.id}
                          onSelect={() => {
                            setSelectedTemplateVersion(template.version);
                            setEvalTemplate(template.id);
                          }}
                        >
                          Version {template.version}
                          <CheckIcon
                            className={cn(
                              "ml-auto h-4 w-4",
                              template.version === selectedTemplateVersion
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                        </InputCommandItem>
                      ))
                    ) : (
                      <InputCommandItem disabled>
                        No versions available
                      </InputCommandItem>
                    )}
                  </InputCommandGroup>
                </InputCommandList>
              </InputCommand>
            </PopoverContent>
          </Popover>
        </div>
      ) : undefined}
      <Dialog
        open={isCreateTemplateOpen}
        onOpenChange={setIsCreateTemplateOpen}
      >
        <DialogContent className="max-h-[90vh] max-w-screen-md overflow-y-auto">
          <DialogTitle>Create new template</DialogTitle>
          <EvalTemplateForm
            projectId={props.projectId}
            preventRedirect={true}
            isEditing={true}
            onFormSuccess={() => {
              setIsCreateTemplateOpen(false);
              void utils.evals.allTemplates.invalidate();
              showSuccessToast({
                title: "Template created successfully",
                description:
                  "You can now use this template in a new eval config.",
              });
            }}
          />
        </DialogContent>
      </Dialog>
      {evalTemplate && currentTemplate ? (
        <InnerEvalConfigForm
          key={evalTemplate}
          projectId={props.projectId}
          disabled={props.disabled}
          existingEvaluator={props.existingEvaluator}
          evalTemplate={
            props.existingEvaluator?.evalTemplate ?? currentTemplate
          }
          onFormSuccess={props.onFormSuccess}
          shouldWrapVariables={props.shouldWrapVariables}
          mode={props.mode}
        />
      ) : null}
    </>
  );
};

export const InnerEvalConfigForm = (props: {
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

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
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

  const traceFilterOptions = api.traces.filterOptions.useQuery(
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

  function onSubmit(values: z.infer<typeof formSchema>) {
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
      console.log(validatedVarMapping.error);
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
                                : "dataset items"}
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
                          <div className="grid gap-1.5 leading-none">
                            <label
                              htmlFor="existingObjects"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Existing{" "}
                              {form.watch("target") === "trace"
                                ? "traces"
                                : "dataset items"}
                            </label>
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
                            traceFilterOptions.data,
                            evalTraceTableCols,
                          )}
                          filterState={field.value ?? []}
                          onChange={(value) => field.onChange(value)}
                          disabled={props.disabled}
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
                          onChange={(value) => field.onChange(value)}
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
function VariableMappingDescription(p: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <div className="flex w-1/2 items-center">
      <Label className="muted-foreground text-sm font-light">{p.title}</Label>
      <DocPopup description={p.description} href={p.href} />
    </div>
  );
}

export const TimeScopeDescription = (props: {
  projectId: string;
  timeScope: ("NEW" | "EXISTING")[] | undefined;
  target: "trace" | "dataset_item" | undefined;
}) => {
  if (!props.timeScope || props.timeScope.length === 0) {
    return "Select a time scope to run this configuration on.";
  }

  const globalConfig = api.evals.globalJobConfigs.useQuery({
    projectId: props.projectId,
  });
  return (
    <div>
      This configuration will run on{" "}
      {props.timeScope?.includes("NEW") && props.timeScope?.includes("EXISTING")
        ? "all future and existing"
        : props.timeScope?.includes("NEW")
          ? "all future"
          : "all existing"}{" "}
      {props.target === "trace" ? "traces" : "dataset items"} that match these
      filters.{" "}
      {globalConfig.data && props.timeScope?.includes("EXISTING")
        ? `We execute the evaluation on up to ${compactNumberFormatter(globalConfig.data)} historic evaluations.`
        : null}
    </div>
  );
};
