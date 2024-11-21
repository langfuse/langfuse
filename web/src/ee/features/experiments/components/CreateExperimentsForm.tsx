import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form } from "@/src/components/ui/form";
import { Textarea } from "@/src/components/ui/textarea";
import { ModelParameters } from "@/src/components/ModelParameters";
import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  Command,
  CommandItem,
} from "@/src/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { z, type ZodSchema } from "zod";
import { cn } from "@/src/utils/tailwind";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  ChevronDown,
  CheckIcon,
  Info,
  CircleCheck,
  Loader2,
} from "lucide-react";
import { api } from "@/src/utils/api";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useModelParams } from "@/src/ee/features/playground/page/hooks/useModelParams";
import {
  Accordion,
  AccordionItem,
  AccordionContent,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { getFinalModelParams } from "@/src/ee/utils/getFinalModelParams";
import {
  type ColumnDefinition,
  datasetCol,
  type FilterCondition,
  stringOptionsFilter,
  ZodModelConfig,
} from "@langfuse/shared";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Skeleton } from "@/src/components/ui/skeleton";

const CreateExperimentData = z.object({
  promptId: z.string().min(1, "Please select a prompt"),
  datasetId: z.string().min(1, "Please select a dataset"),
  description: z.string().max(1000).optional(),
  modelConfig: z.object({
    provider: z.string().min(1, "Please select a provider"),
    model: z.string().min(1, "Please select a model"),
    modelParams: ZodModelConfig,
  }),
});

export type CreateExperiment = z.infer<typeof CreateExperimentData>;

const isDatasetTarget = <T extends ZodSchema>(
  filters: FilterCondition[] | null,
  condition: {
    column: ColumnDefinition;
    schema: T;
    isValid: (filter: z.infer<T>) => boolean;
  },
): boolean => {
  if (!filters) return true;

  const { column, schema, isValid } = condition;
  const datasetFilters = filters.filter(
    (filter) =>
      (filter.column === column.id || column.name) &&
      schema.safeParse(filter).success,
  );
  return datasetFilters.every((filter): boolean => isValid(filter));
};

export const CreateExperimentsForm = ({
  projectId,
  setFormOpen,
  defaultValues = {},
  promptDefault,
  handleExperimentSettled = async () => {},
}: {
  projectId: string;
  setFormOpen: (open: boolean) => void;
  defaultValues?: Partial<CreateExperiment>;
  promptDefault?: {
    name: string;
    version: number;
  };
  handleExperimentSettled?: (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
  }) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [evaluatorOptions, setEvaluatorOptions] = useState<
    { key: string; value: string }[]
  >([]);
  const [selectedEvaluators, setSelectedEvaluators] = useState<
    { key: string; value: string }[]
  >([]);
  const [selectedPromptName, setSelectedPromptName] = useState<string>(
    promptDefault?.name ?? "",
  );
  const [selectedPromptVersion, setSelectedPromptVersion] = useState<
    number | null
  >(promptDefault?.version ?? null);
  const {
    modelParams,
    updateModelParamValue,
    setModelParamEnabled,
    availableModels,
    availableProviders,
  } = useModelParams();

  const form = useForm<CreateExperiment>({
    resolver: zodResolver(CreateExperimentData),
    defaultValues: {
      promptId: "",
      datasetId: "",
      modelConfig: {},
      ...defaultValues,
    },
  });

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:read",
  });

  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  const promptNamesAndVersions = api.prompts.allNamesAndVersions.useQuery({
    projectId,
  });

  const datasets = api.datasets.allDatasetMeta.useQuery(
    { projectId },
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

  const promptId = form.watch("promptId");
  const datasetId = form.watch("datasetId");

  const evaluators = api.evals.evaluatorsByTarget.useQuery(
    { projectId, targetObject: "dataset" },
    {
      enabled: hasReadAccess && !!datasetId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  useEffect(() => {
    if (evaluators.data) {
      const isValidFilter = (filter: z.infer<typeof stringOptionsFilter>) => {
        const filterIncludesId = filter.value.includes(datasetId);
        if (filter.operator === "any of") {
          return filterIncludesId;
        } else {
          return !filterIncludesId;
        }
      };

      const initialEvaluators = evaluators.data.reduce<
        { key: string; value: string }[]
      >((acc, evaluator) => {
        if (
          isDatasetTarget(evaluator.filter, {
            column: datasetCol,
            schema: stringOptionsFilter,
            isValid: isValidFilter,
          })
        ) {
          acc.push({
            key: evaluator.id,
            value: evaluator.scoreName,
          });
        }
        return acc;
      }, []);

      setEvaluatorOptions(initialEvaluators);
      setSelectedEvaluators(initialEvaluators);
    }
  }, [evaluators.data, datasetId]);

  const validationResult = api.experiments.validateConfig.useQuery(
    {
      projectId,
      promptId: promptId as string,
      datasetId: datasetId as string,
    },
    {
      enabled: Boolean(promptId && datasetId),
    },
  );

  const experimentMutation = api.experiments.createExperiment.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Experiment run triggered successfully",
        description: "Waiting for experiment to complete...",
        duration: 28_000,
      });
    },
    onError: (error) => {
      showErrorToast(
        error.message || "Failed to trigger experiment run",
        "Please try again.",
      );
    },
    onSettled: handleExperimentSettled,
  });

  // Watch model config changes and update form
  useEffect(() => {
    form.setValue("modelConfig", {
      provider: modelParams.provider.value,
      model: modelParams.model.value,
      modelParams: getFinalModelParams(modelParams),
    });
  }, [modelParams, form]);

  const onSubmit = async (data: CreateExperiment) => {
    // TODO: MUST re-attach evaluators in the form, show warning that this edit will happen on dataset level

    const experiment = {
      ...data,
      projectId,
    };
    await experimentMutation.mutateAsync(experiment);
    form.reset();
    setFormOpen(false);
  };

  const handleOnValueChange = (values: { key: string; value: string }[]) => {
    setSelectedEvaluators(values);
  };

  const promptsByName = useMemo(
    () =>
      promptNamesAndVersions.data?.reduce<
        Record<string, Array<{ version: number; id: string }>>
      >((acc, prompt) => {
        if (!acc[prompt.name]) {
          acc[prompt.name] = [];
        }
        acc[prompt.name].push({ version: prompt.version, id: prompt.id });
        return acc;
      }, {}),
    [promptNamesAndVersions.data],
  );

  if (
    !promptNamesAndVersions.data ||
    !datasets.data ||
    (hasReadAccess && !!datasetId && !evaluators.data)
  ) {
    return <Skeleton className="min-h-10 w-full" />;
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Add description..."
                  className="focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 active:ring-0"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="promptId"
          render={() => (
            <FormItem>
              <FormLabel>Prompt</FormLabel>
              {/* FIX: I need the command list in the popover to be scrollable, currently it's not */}
              <div className="mb-2 flex gap-2">
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={open}
                      className="w-2/3 justify-between px-2 font-normal"
                    >
                      {selectedPromptName || "Select a prompt"}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] overflow-auto p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput
                        placeholder="Search prompts..."
                        className="h-9"
                      />
                      <CommandList>
                        <CommandEmpty>No prompt found.</CommandEmpty>
                        <CommandGroup>
                          {promptsByName &&
                            Object.entries(promptsByName).map(
                              ([name, promptData]) => (
                                <CommandItem
                                  key={name}
                                  onSelect={() => {
                                    setSelectedPromptName(name);
                                    const latestVersion = promptData[0];
                                    setSelectedPromptVersion(
                                      latestVersion.version,
                                    );
                                    form.setValue("promptId", latestVersion.id);
                                    form.clearErrors("promptId");
                                  }}
                                >
                                  {name}
                                  <CheckIcon
                                    className={cn(
                                      "ml-auto h-4 w-4",
                                      name === selectedPromptName
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                </CommandItem>
                              ),
                            )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      disabled={!selectedPromptName}
                      variant="outline"
                      role="combobox"
                      className="w-1/3 justify-between px-2 font-normal"
                    >
                      {selectedPromptVersion
                        ? `Version ${selectedPromptVersion}`
                        : "Version"}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandList>
                        <CommandEmpty>No version found.</CommandEmpty>
                        <CommandGroup className="overflow-y-auto">
                          {promptsByName &&
                          selectedPromptName &&
                          promptsByName[selectedPromptName] ? (
                            promptsByName[selectedPromptName].map((prompt) => (
                              <CommandItem
                                key={prompt.id}
                                onSelect={() => {
                                  setSelectedPromptVersion(prompt.version);
                                  form.setValue("promptId", prompt.id);
                                  form.clearErrors("promptId");
                                }}
                              >
                                Version {prompt.version}
                                <CheckIcon
                                  className={cn(
                                    "ml-auto h-4 w-4",
                                    prompt.version === selectedPromptVersion
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                              </CommandItem>
                            ))
                          ) : (
                            <CommandItem disabled>
                              No versions available
                            </CommandItem>
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="modelConfig"
          render={() => (
            <FormItem>
              <Accordion type="single" collapsible>
                <AccordionItem value="item-1" className="border-none">
                  <div className="sticky top-0 z-10 border-b bg-background">
                    <AccordionTrigger>
                      <span className="text-sm">Model config</span>
                    </AccordionTrigger>
                  </div>
                  <AccordionContent className="mt-4">
                    <Card className="p-4">
                      <ModelParameters
                        {...{
                          modelParams,
                          availableModels,
                          availableProviders,
                          updateModelParamValue: updateModelParamValue,
                          setModelParamEnabled,
                          modelParamsDescription:
                            "Select a model which supports function calling.",
                        }}
                        evalModelsOnly
                      />
                    </Card>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              {form.formState.errors.modelConfig && (
                <p
                  id="modelConfig"
                  className={cn("text-sm font-medium text-destructive")}
                >
                  {[
                    form.formState.errors.modelConfig?.model?.message,
                    form.formState.errors.modelConfig?.provider?.message,
                  ].join(", ")}
                </p>
              )}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="datasetId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dataset</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a dataset" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {datasets.data?.map((dataset) => (
                    <SelectItem value={dataset.id} key={dataset.id}>
                      {dataset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {evaluators.data && !!datasetId ? (
          <FormItem>
            <FormLabel>Evaluators</FormLabel>
            <FormDescription>
              Select evaluators to run against your experiment results.
            </FormDescription>
            <MultiSelectKeyValues
              key={datasetId}
              placeholder="Value"
              align="end"
              className="grid grid-cols-[auto,1fr,auto,auto] gap-2"
              disabled={!hasWriteAccess}
              onValueChange={handleOnValueChange}
              options={evaluatorOptions}
              values={
                selectedEvaluators as {
                  value: string;
                  key: string;
                }[]
              }
              controlButtons={
                <CommandItem
                  onSelect={() => {
                    window.open(`/project/${projectId}/evals`, "_blank");
                  }}
                >
                  Manage evaluators
                </CommandItem>
              }
            />
          </FormItem>
        ) : (
          <FormItem>
            <FormLabel>Evaluators</FormLabel>
            {hasReadAccess ? (
              <FormDescription>
                Select a dataset first to set up evaluators.
              </FormDescription>
            ) : (
              <FormDescription>
                ⓘ You do not have access to view evaluators. Please contact your
                admin to upgrade your role.
              </FormDescription>
            )}
          </FormItem>
        )}

        <div className="mt-4 flex flex-col gap-4">
          {validationResult.isLoading && Boolean(promptId && datasetId) && (
            <Card className="relative overflow-hidden rounded-md shadow-none group-data-[collapsible=icon]:hidden">
              <CardHeader className="p-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>Validating configuration...</span>
                  <Loader2 className="h-3 w-3 animate-spin" />
                </CardTitle>
                <CardDescription className="text-foreground">
                  Checking dataset items against prompt variables
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          {validationResult.data?.isValid === false && (
            <Card className="relative overflow-hidden rounded-md border-dark-yellow bg-light-yellow shadow-none group-data-[collapsible=icon]:hidden">
              <CardHeader className="p-2">
                <CardTitle className="flex items-center justify-between text-sm text-dark-yellow">
                  <span>Invalid configuration</span>
                  {/* TODO: add link to docs explaining error cases */}
                  <Info className="h-4 w-4" />
                </CardTitle>
                <CardDescription className="text-foreground">
                  {validationResult.data?.message}
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          {validationResult.data?.isValid === true && (
            <Card className="relative overflow-hidden rounded-md border-dark-green bg-light-green shadow-none group-data-[collapsible=icon]:hidden">
              <CardHeader className="p-2">
                <CardTitle className="flex items-center justify-between text-sm text-dark-green">
                  <span>Valid configuration</span>
                  <CircleCheck className="h-4 w-4" />
                </CardTitle>
                <div className="text-sm">
                  Matches between dataset items and prompt variables
                  <ul className="ml-2 list-inside list-disc">
                    {validationResult.data?.includesAll > 0 && (
                      <li key="includesAll">
                        Including all variables:{" "}
                        {validationResult.data?.includesAll} /{" "}
                        {validationResult.data?.totalItems}
                      </li>
                    )}
                    {validationResult.data?.includesSome > 0 && (
                      <li key="includesSome">
                        Includes some variables:{" "}
                        {validationResult.data?.includesSome}
                      </li>
                    )}
                    {validationResult.data?.missing > 0 && (
                      <li key="missing">
                        Missing variables: {validationResult.data?.missing}
                      </li>
                    )}
                  </ul>
                  {validationResult.data?.missing > 0 &&
                    "Items missing all prompt variables will be excluded from the experiment."}
                </div>
              </CardHeader>
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={
                Boolean(promptId && datasetId) &&
                !validationResult.data?.isValid
              }
              loading={form.formState.isSubmitting}
            >
              Create
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
};
