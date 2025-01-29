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
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandList,
  InputCommand,
  InputCommandItem,
} from "@/src/components/ui/input-command";
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
  Code2,
  Wand2,
} from "lucide-react";
import { api } from "@/src/utils/api";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/src/components/ui/card";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useModelParams } from "@/src/ee/features/playground/page/hooks/useModelParams";
import { getFinalModelParams } from "@/src/ee/utils/getFinalModelParams";
import {
  type ColumnDefinition,
  datasetCol,
  extractVariables,
  type FilterCondition,
  stringOptionsFilter,
  ZodModelConfig,
} from "@langfuse/shared";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { PromptType } from "@/src/features/prompts/server/utils/validation";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Input } from "@/src/components/ui/input";
import { EvaluatorStatus } from "@/src/ee/features/evals/types";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/src/components/ui/dialog";
import Link from "next/link";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const CreateExperimentData = z.object({
  name: z
    .union([z.string().length(0), z.string().min(1)])
    .optional()
    .transform((str) => str?.trim())
    .transform((str) => (str === "" ? undefined : str)),
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
  handleExperimentSettled,
  handleExperimentSuccess,
  showSDKRunInfoPage = false,
}: {
  projectId: string;
  setFormOpen: (open: boolean) => void;
  defaultValues?: Partial<CreateExperiment>;
  promptDefault?: {
    name: string;
    version: number;
  };
  handleExperimentSuccess?: (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
    runName: string;
  }) => Promise<void>;
  handleExperimentSettled?: (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
    runName: string;
  }) => Promise<void>;
  showSDKRunInfoPage?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const hasPromptExperimentEntitlement =
    useHasEntitlement("prompt-experiments");
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
  const [showPromptForm, setShowPromptForm] = useState(false);

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

  const hasExperimentWriteAccess = useHasProjectAccess({
    projectId,
    scope: "promptExperiments:CUD",
  });

  const hasEvalReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:read",
  });

  const hasEvalWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  const promptMeta = api.prompts.allPromptMeta.useQuery(
    {
      projectId,
    },
    {
      enabled: hasPromptExperimentEntitlement,
    },
  );

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
      enabled: hasPromptExperimentEntitlement,
    },
  );

  const promptId = form.watch("promptId");
  const datasetId = form.watch("datasetId");

  const evaluators = api.evals.jobConfigsByTarget.useQuery(
    { projectId, targetObject: "dataset" },
    {
      enabled:
        hasEvalReadAccess && !!datasetId && hasPromptExperimentEntitlement,
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

  const expectedColumns = useMemo(() => {
    const prompt = promptMeta.data?.find((p) => p.id === promptId);
    if (!prompt) return [];

    return extractVariables(
      prompt.type === PromptType.Text
        ? (prompt?.prompt?.toString() ?? "")
        : JSON.stringify(prompt?.prompt),
    );
  }, [promptId, promptMeta.data]);

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
      enabled: Boolean(promptId && datasetId) && hasPromptExperimentEntitlement,
    },
  );

  const experimentMutation = api.experiments.createExperiment.useMutation({
    onSuccess: handleExperimentSuccess ?? (() => {}),
    onError: (error) => {
      showErrorToast(
        error.message || "Failed to trigger experiment run",
        "Please try again.",
      );
    },
    onSettled: handleExperimentSettled ?? (() => {}),
  });

  const archiveEvaluatorMutation = api.evals.updateEvalJob.useMutation();

  // Watch model config changes and update form
  useEffect(() => {
    form.setValue("modelConfig", {
      provider: modelParams.provider.value,
      model: modelParams.model.value,
      modelParams: getFinalModelParams(modelParams),
    });
  }, [modelParams, form]);

  const onSubmit = async (data: CreateExperiment) => {
    capture("dataset_run:new_form_submit");
    const experiment = {
      ...data,
      projectId,
    };
    await experimentMutation.mutateAsync(experiment);
    form.reset();
    setFormOpen(false);
  };

  const handleOnValueChange = (
    values: { key: string; value: string }[],
    changedValueId?: string,
  ) => {
    if (!changedValueId) return;
    const evaluator = evaluators.data?.find((e) => e.id === changedValueId);
    if (!evaluator) return;

    if (evaluator.status === "INACTIVE") {
      const confirmed = window.confirm(
        `Are you sure you want to activate "${evaluator.scoreName}"? You can always always archive the evaluator.`,
      );
      if (!confirmed) {
        return;
      }
    } else {
      const confirmed = window.confirm(
        `Are you sure you want to archive "${evaluator.scoreName}"? You can always always re-activate the evaluator.`,
      );
      if (!confirmed) {
        return;
      }
    }

    archiveEvaluatorMutation.mutate({
      projectId,
      evalConfigId: changedValueId,
      config: {
        status:
          evaluator.status === EvaluatorStatus.INACTIVE
            ? EvaluatorStatus.ACTIVE
            : EvaluatorStatus.INACTIVE,
      },
    });

    setSelectedEvaluators(values);
  };

  const promptsByName = useMemo(
    () =>
      promptMeta.data?.reduce<
        Record<string, Array<{ version: number; id: string }>>
      >((acc, prompt) => {
        if (!acc[prompt.name]) {
          acc[prompt.name] = [];
        }
        acc[prompt.name].push({ version: prompt.version, id: prompt.id });
        return acc;
      }, {}),
    [promptMeta.data],
  );

  if (!hasExperimentWriteAccess) {
    return null;
  }

  if (showSDKRunInfoPage && !showPromptForm) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Run Experiment on Dataset</DialogTitle>
          <DialogDescription>
            Experiments allow to test iterations of your application or prompt
            on a dataset. Learn more about datasets and experiments{" "}
            <Link
              href="https://langfuse.com/docs/datasets/overview"
              target="_blank"
              className="underline"
            >
              here
            </Link>
            .
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          {hasPromptExperimentEntitlement && (
            <Card className="flex flex-1 flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Wand2 className="size-4" />
                  Prompt Experiment
                </CardTitle>
                <CardDescription>
                  Test single prompts and model configurations via Langfuse UI
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">
                  <li>Compare prompt versions</li>
                  <li>Compare model configurations</li>
                  <li>No code required</li>
                </ul>
              </CardContent>
              <CardFooter className="mt-auto flex flex-row gap-2">
                <Button
                  className="w-full"
                  onClick={() => setShowPromptForm(true)}
                >
                  Create
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  asChild
                  onClick={() =>
                    capture("dataset_run:view_prompt_experiment_docs")
                  }
                >
                  <Link href="https://langfuse.com/docs/datasets/prompt-experiments">
                    View Docs
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          )}

          <Card className="flex flex-1 flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Code2 className="size-4" />
                Custom Experiment
              </CardTitle>
              <CardDescription>
                Run any experiment via the Langfuse SDKs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">
                <li>Full control over experiment execution</li>
                <li>Custom evaluation logic</li>
                <li>Integration with your codebase</li>
              </ul>
            </CardContent>
            <CardFooter className="mt-auto">
              <Button
                className="w-full"
                variant="secondary"
                asChild
                onClick={() =>
                  capture("dataset_run:view_custom_experiment_docs")
                }
              >
                <Link
                  href="https://langfuse.com/docs/datasets/get-started"
                  target="_blank"
                >
                  View Docs
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </>
    );
  }

  if (!hasPromptExperimentEntitlement) {
    return null;
  }

  if (
    !promptMeta.data ||
    !datasets.data ||
    (hasEvalReadAccess && !!datasetId && !evaluators.data)
  ) {
    return <Skeleton className="min-h-[70dvh] w-full" />;
  }

  return (
    <>
      <DialogHeader>
        {showSDKRunInfoPage && (
          <Button
            variant="ghost"
            onClick={() => setShowPromptForm(false)}
            className="inline-block self-start"
          >
            ← Back
          </Button>
        )}
        <DialogTitle>New Prompt Experiment</DialogTitle>
        <DialogDescription>
          Create an experiment to test a prompt version on a dataset. See{" "}
          <Link
            href="https://langfuse.com/docs/datasets/prompt-experiments"
            target="_blank"
            className="underline"
          >
            documentation
          </Link>{" "}
          to learn more.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Experiment name (optional)</FormLabel>
                <FormControl>
                  <Input {...field} type="string" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
                {/* FIX: I need the Inputcommand list in the popover to be scrollable, currently it's not */}
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
                      <InputCommand>
                        <InputCommandInput
                          placeholder="Search prompts..."
                          className="h-9"
                        />
                        <InputCommandList>
                          <InputCommandEmpty>
                            No prompt found.
                          </InputCommandEmpty>
                          <InputCommandGroup>
                            {promptsByName &&
                              Object.entries(promptsByName).map(
                                ([name, promptData]) => (
                                  <InputCommandItem
                                    key={name}
                                    onSelect={() => {
                                      setSelectedPromptName(name);
                                      const latestVersion = promptData[0];
                                      setSelectedPromptVersion(
                                        latestVersion.version,
                                      );
                                      form.setValue(
                                        "promptId",
                                        latestVersion.id,
                                      );
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
                                  </InputCommandItem>
                                ),
                              )}
                          </InputCommandGroup>
                        </InputCommandList>
                      </InputCommand>
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
                      <InputCommand>
                        <InputCommandList>
                          <InputCommandEmpty>
                            No version found.
                          </InputCommandEmpty>
                          <InputCommandGroup className="overflow-y-auto">
                            {promptsByName &&
                            selectedPromptName &&
                            promptsByName[selectedPromptName] ? (
                              promptsByName[selectedPromptName].map(
                                (prompt) => (
                                  <InputCommandItem
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
                                  </InputCommandItem>
                                ),
                              )
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
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="modelConfig"
            render={() => (
              <FormItem>
                <Card className="p-4">
                  <ModelParameters
                    {...{
                      modelParams,
                      availableModels,
                      availableProviders,
                      updateModelParamValue: updateModelParamValue,
                      setModelParamEnabled,
                    }}
                  />
                </Card>
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
                <div className="flex items-center gap-2">
                  <FormLabel>Dataset</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <span className="cursor-pointer text-xs text-muted-foreground">
                        (expected columns)
                      </span>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="flex flex-col space-y-2">
                        <h4 className="text-sm font-medium leading-none">
                          Expected columns
                        </h4>
                        <span className="text-sm text-muted-foreground">
                          {promptId ? (
                            <div>
                              <span>
                                Given current prompt, dataset item input must
                                contain at least one of these first-level JSON
                                keys, mapped to a string value:
                              </span>
                              <ul className="my-2 ml-2 list-inside list-disc">
                                {expectedColumns.map((col) => (
                                  <li key={col}>{col}</li>
                                ))}
                              </ul>
                              <span>
                                These will be used as the input to your prompt.
                              </span>
                            </div>
                          ) : (
                            "Please select a prompt first"
                          )}
                        </span>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
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
                Will run against your experiment results.
              </FormDescription>
              <MultiSelectKeyValues
                key={datasetId}
                placeholder="Value"
                align="end"
                className="grid grid-cols-[auto,1fr,auto,auto] gap-2"
                disabled={!hasEvalWriteAccess}
                onValueChange={handleOnValueChange}
                options={evaluatorOptions}
                values={
                  selectedEvaluators as {
                    value: string;
                    key: string;
                  }[]
                }
                hideClearButton
                controlButtons={
                  <DropdownMenuItem
                    onSelect={() => {
                      window.open(`/project/${projectId}/evals`, "_blank");
                    }}
                  >
                    Manage evaluators
                  </DropdownMenuItem>
                }
              />
            </FormItem>
          ) : (
            <FormItem>
              <FormLabel>Evaluators</FormLabel>
              {hasEvalReadAccess ? (
                <FormDescription>
                  Select a dataset first to set up evaluators.
                </FormDescription>
              ) : (
                <FormDescription>
                  ⓘ You do not have access to view evaluators. Please contact
                  your admin to upgrade your role.
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
                    <ul className="my-2 ml-2 list-inside list-disc">
                      {Object.entries(
                        validationResult.data.variablesMap ?? {},
                      ).map(([variable, count]) => (
                        <li key={variable}>
                          <strong>{variable}:</strong> {count} /{" "}
                          {validationResult.data?.isValid
                            ? validationResult.data.totalItems
                            : "unknown"}
                        </li>
                      ))}
                    </ul>
                    Items missing all prompt variables will be excluded from the
                    experiment.
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
    </>
  );
};
