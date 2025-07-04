import React, { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
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
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import { ZodModelConfig } from "@langfuse/shared";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Input } from "@/src/components/ui/input";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Dialog,
  DialogContent,
  DialogBody,
  DialogFooter,
} from "@/src/components/ui/dialog";
import Link from "next/link";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { TemplateSelector } from "@/src/features/evals/components/template-selector";
import { EvaluatorForm } from "@/src/features/evals/components/evaluator-form";
import { useEvaluatorDefaults } from "@/src/features/experiments/hooks/useEvaluatorDefaults";
import { useExperimentEvaluatorData } from "@/src/features/experiments/hooks/useExperimentEvaluatorData";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";
import { useExperimentNameValidation } from "@/src/features/experiments/hooks/useExperimentNameValidation";
import { useExperimentPromptData } from "@/src/features/experiments/hooks/useExperimentPromptData";

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

  const [selectedPromptName, setSelectedPromptName] = useState<string>(
    promptDefault?.name ?? "",
  );
  const [selectedPromptVersion, setSelectedPromptVersion] = useState<
    number | null
  >(promptDefault?.version ?? null);
  const [showPromptForm, setShowPromptForm] = useState(false);

  const { createDefaultEvaluator } = useEvaluatorDefaults();

  const {
    modelParams,
    updateModelParamValue,
    setModelParamEnabled,
    availableModels,
    availableProviders,
  } = useModelParams();

  const form = useForm({
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

  const datasetId = form.watch("datasetId");

  const evaluators = api.evals.jobConfigsByTarget.useQuery(
    { projectId, targetObject: "dataset" },
    {
      enabled: hasEvalReadAccess && !!datasetId,
    },
  );

  const evalTemplates = api.evals.allTemplates.useQuery(
    { projectId },
    {
      enabled: hasEvalReadAccess,
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
      enabled: true,
    },
  );

  const {
    activeEvaluators,
    inActiveEvaluators,
    selectedEvaluatorData,
    showEvaluatorForm,
    handleConfigureEvaluator,
    handleCloseEvaluatorForm,
    handleEvaluatorSuccess,
    handleSelectEvaluator,
  } = useExperimentEvaluatorData({
    datasetId,
    createDefaultEvaluator,
    evaluatorsData: evaluators.data,
    evalTemplatesData: evalTemplates.data,
    refetchEvaluators: evaluators.refetch,
  });

  const { promptId, promptsByName, expectedColumns } = useExperimentPromptData({
    projectId,
    form,
  });

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
    onSuccess: handleExperimentSuccess ?? (() => {}),
    onError: (error) => {
      showErrorToast(
        error.message || "Failed to trigger experiment run",
        "Please try again.",
      );
    },
    onSettled: handleExperimentSettled ?? (() => {}),
  });

  useExperimentNameValidation({
    projectId,
    datasetId,
    form,
  });

  // Watch model config changes and update form
  useEffect(() => {
    form.setValue("modelConfig", {
      provider: modelParams.provider.value,
      model: modelParams.model.value,
      modelParams: getFinalModelParams(modelParams),
    });

    // Clear errors when valid values are set
    if (modelParams.provider.value && modelParams.model.value) {
      form.clearErrors("modelConfig");
    }
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

  // TODO: show a warning if someone has multiple configs defined for the same template that target this dataset. Do not let them submit the form to create experiment.
  // Prompt them to delete duplicate running evaluators.

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
        <DialogBody>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
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
        </DialogBody>
      </>
    );
  }
  if (
    !promptsByName ||
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
          <DialogBody>
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
                                        setSelectedPromptVersion(
                                          prompt.version,
                                        );
                                        form.setValue("promptId", prompt.id);
                                        form.clearErrors("promptId");
                                      }}
                                    >
                                      Version {prompt.version}
                                      <CheckIcon
                                        className={cn(
                                          "ml-auto h-4 w-4",
                                          prompt.version ===
                                            selectedPromptVersion
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
                                  keys:
                                </span>
                                <ul className="my-2 ml-2 list-inside list-disc">
                                  {expectedColumns.map((col) => (
                                    <li key={col}>{col}</li>
                                  ))}
                                </ul>
                                <span>
                                  Variables (like {"{{variable}}"}) should be
                                  mapped to string values. Placeholders should
                                  be mapped to arrays of message objects. These
                                  will be used as the input to your prompt.
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
                <TemplateSelector
                  projectId={projectId}
                  datasetId={datasetId}
                  evalTemplates={evalTemplates.data?.templates ?? []}
                  onConfigureTemplate={handleConfigureEvaluator}
                  onSelectEvaluator={handleSelectEvaluator}
                  activeTemplateIds={activeEvaluators}
                  inactiveTemplateIds={inActiveEvaluators}
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
                      Checking dataset items against prompt variables and
                      placeholders
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
              {validationResult.data?.isValid === false && (
                <Card className="relative overflow-hidden rounded-md border-dark-yellow bg-light-yellow shadow-none group-data-[collapsible=icon]:hidden">
                  <CardHeader className="p-2">
                    <CardTitle className="flex items-center justify-between text-sm text-dark-yellow">
                      <span>Invalid configuration</span>
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
                      Matches between dataset items and prompt
                      variables/placeholders
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
                      Items missing all required variables and placeholders will
                      be excluded from the experiment.
                    </div>
                  </CardHeader>
                </Card>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={
                  (Boolean(promptId && datasetId) &&
                    !validationResult.data?.isValid) ||
                  !!form.formState.errors.name
                }
                loading={form.formState.isSubmitting}
              >
                Create
              </Button>
            </div>
          </DialogFooter>
        </form>
      </Form>

      {/* Dialog for configuring evaluators */}
      {selectedEvaluatorData && (
        <Dialog
          open={showEvaluatorForm}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseEvaluatorForm();
            }
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-screen-md overflow-y-auto">
            <DialogTitle>
              {selectedEvaluatorData.evaluator.id ? "Edit" : "Configure"}{" "}
              Evaluator
            </DialogTitle>
            <EvaluatorForm
              projectId={projectId}
              useDialog={true}
              evalTemplates={evalTemplates.data?.templates ?? []}
              templateId={selectedEvaluatorData.templateId}
              existingEvaluator={selectedEvaluatorData.evaluator}
              mode={selectedEvaluatorData.evaluator.id ? "edit" : "create"}
              hideTargetSection={!selectedEvaluatorData.evaluator.id}
              onFormSuccess={handleEvaluatorSuccess}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
