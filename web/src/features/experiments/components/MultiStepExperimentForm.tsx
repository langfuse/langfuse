import React, { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Form } from "@/src/components/ui/form";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/src/components/ui/dialog";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";
import { api } from "@/src/utils/api";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useEvaluatorDefaults } from "@/src/features/experiments/hooks/useEvaluatorDefaults";
import { useExperimentEvaluatorData } from "@/src/features/experiments/hooks/useExperimentEvaluatorData";
import { useExperimentNameValidation } from "@/src/features/experiments/hooks/useExperimentNameValidation";
import { useExperimentPromptData } from "@/src/features/experiments/hooks/useExperimentPromptData";
import { useObservationEvals } from "@/src/features/events/hooks/useObservationEvals";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  CreateExperimentData,
  type CreateExperiment,
} from "@/src/features/experiments/types";
import {
  generateDefaultExperimentName,
  generateDefaultExperimentDescription,
  generateDatasetRunName,
} from "@/src/features/experiments/util";

// Import step components
import { PromptModelStep } from "./steps/PromptModelStep";
import { DatasetStep } from "./steps/DatasetStep";
import { EvaluatorsStep } from "./steps/EvaluatorsStep";
import { ExperimentDetailsStep } from "./steps/ExperimentDetailsStep";
import { ReviewStep } from "./steps/ReviewStep";

// Import step prop types
import { PromptType } from "@langfuse/shared";

export const MultiStepExperimentForm = ({
  projectId,
  setFormOpen,
  defaultValues = {},
  promptDefault,
  handleExperimentSettled,
  handleExperimentSuccess,
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
}) => {
  const capture = usePostHogClientCapture();
  const [activeStep, setActiveStep] = useState("prompt");
  const [selectedPromptName, setSelectedPromptName] = useState<string>(
    promptDefault?.name ?? "",
  );
  const [selectedPromptVersion, setSelectedPromptVersion] = useState<
    number | null
  >(promptDefault?.version ?? null);
  // View State Pattern:
  // - Form state (react-hook-form): All values submitted to API (promptId, datasetId, name, runName, etc.)
  // - Local useState: Display-only values not submitted but used for UI display
  //   - selectedPromptName/Version: Human-readable display (actual promptId is in form)
  //   - structuredOutputEnabled: UI toggle (actual schema object is in form.structuredOutputSchema)
  //   - selectedSchemaName: Schema name for display (actual schema object is in form)
  const [structuredOutputEnabled, setStructuredOutputEnabled] = useState(false);
  const [selectedSchemaName, setSelectedSchemaName] = useState<string | null>(
    null,
  );

  const steps = [
    { id: "prompt", label: "Prompt & Model" },
    { id: "dataset", label: "Dataset" },
    { id: "evaluators", label: "Evaluators" },
    { id: "details", label: "Experiment run details" },
    { id: "review", label: "Review" },
  ];

  const hasEvalReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:read",
  });

  const hasEvalWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  const isBetaEnabled = useObservationEvals();

  const form = useForm({
    resolver: zodResolver(CreateExperimentData),
    defaultValues: {
      promptId: "",
      datasetId: "",
      datasetVersion: undefined,
      modelConfig: {},
      name: "",
      runName: "",
      description: "",
      ...defaultValues,
    },
  });

  const datasetId = form.watch("datasetId");
  const datasetVersion = form.watch("datasetVersion") as Date | undefined;

  // Reset dataset version when dataset changes
  useEffect(() => {
    form.setValue("datasetVersion", undefined);
  }, [datasetId, form]);

  const evaluators = api.evals.jobConfigsByTarget.useQuery(
    {
      projectId,
      targetObject: isBetaEnabled ? ["dataset", "experiment"] : ["dataset"],
    },
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

  const { createDefaultEvaluator } = useEvaluatorDefaults();

  const {
    activeEvaluators,
    pausedEvaluators,
    evaluatorTargetObjects,
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

  const {
    modelParams,
    updateModelParamValue,
    setModelParamEnabled,
    availableModels,
    providerModelCombinations,
    availableProviders,
  } = useModelParams();

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

  const {
    promptId: promptIdFromHook,
    promptsByName,
    expectedColumns,
  } = useExperimentPromptData({
    projectId,
    form,
  });

  const experimentMutation = api.experiments.createExperiment.useMutation({
    onSuccess: handleExperimentSuccess ?? (() => {}),
    onError: (error) => {
      showErrorToast(
        error.message || "Failed to trigger dataset run",
        "Please try again.",
      );
    },
    onSettled: handleExperimentSettled ?? (() => {}),
  });

  const validationResult = api.experiments.validateConfig.useQuery(
    {
      projectId,
      promptId: promptIdFromHook as string,
      datasetId: datasetId as string,
      datasetVersion: datasetVersion,
    },
    {
      enabled: Boolean(promptIdFromHook && datasetId),
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

  // Callback for preprocessing evaluator form values
  // For new experiment evaluators (beta enabled), we only run on new data (not historic)
  // For legacy dataset evaluators (beta disabled), allow user to choose
  const preprocessFormValues = (values: any) => {
    if (!isBetaEnabled) {
      const shouldRunOnHistoric = confirm(
        "Do you also want to execute this evaluator on historic data? If not, click cancel.",
      );

      if (shouldRunOnHistoric && !values.timeScope.includes("EXISTING")) {
        values.timeScope = [...values.timeScope, "EXISTING"];
      }
    }

    return values;
  };

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

  // Generate default experiment name and description when prompt and dataset are selected
  useEffect(() => {
    if (!selectedPromptName || selectedPromptVersion === null || !datasetId) {
      return;
    }

    const selectedDataset = datasets.data?.find((d) => d.id === datasetId);
    if (!selectedDataset) return;

    const defaultName = generateDefaultExperimentName(
      selectedPromptName,
      selectedPromptVersion,
      selectedDataset.name,
    );
    form.setValue("name", defaultName);

    const defaultDescription = generateDefaultExperimentDescription(
      selectedPromptName,
      selectedPromptVersion,
      selectedDataset.name,
    );
    form.setValue("description", defaultDescription);
  }, [
    selectedPromptName,
    selectedPromptVersion,
    datasetId,
    datasets.data,
    form,
  ]);

  // Auto-generate run name when experiment name changes
  const experimentName = form.watch("name");
  useEffect(() => {
    if (experimentName && experimentName.trim() !== "") {
      const generatedRunName = generateDatasetRunName(experimentName);
      form.setValue("runName", generatedRunName);
    } else {
      form.setValue("runName", "");
    }
  }, [experimentName, form]);

  // Get evaluator names for review step
  const activeEvaluatorNames =
    evalTemplates.data?.templates
      .filter((t) => activeEvaluators.includes(t.id))
      .map((t) => t.name) ?? [];

  // Get dataset info for review step
  const selectedDataset = datasets.data?.find((d) => d.id === datasetId);

  // Step validation function
  const isStepValid = (stepId: string): boolean => {
    switch (stepId) {
      case "prompt":
        return !!(
          form.getValues("promptId") &&
          modelParams.provider.value &&
          modelParams.model.value &&
          !form.formState.errors.promptId &&
          !form.formState.errors.modelConfig
        );
      case "dataset":
        return !!(
          form.getValues("datasetId") &&
          validationResult.data?.isValid &&
          !form.formState.errors.datasetId
        );
      case "evaluators":
        return true; // Optional step
      case "details":
        return !!(form.getValues("name") && !form.formState.errors.name);
      case "review":
        return (
          isStepValid("prompt") &&
          isStepValid("dataset") &&
          isStepValid("details")
        );
      default:
        return false;
    }
  };

  if (
    !promptsByName ||
    !datasets.data ||
    (hasEvalReadAccess && !!datasetId && !evaluators.data)
  ) {
    return <Skeleton className="min-h-[70dvh] w-full" />;
  }

  // Prepare grouped props
  const formState = { form: form as UseFormReturn<CreateExperiment> };
  const navigationState = { setActiveStep };
  const promptModelState = {
    selectedPromptName,
    setSelectedPromptName,
    selectedPromptVersion,
    setSelectedPromptVersion,
    promptsByName,
  };
  const modelState = {
    modelParams,
    updateModelParamValue,
    setModelParamEnabled,
    availableModels,
    providerModelCombinations,
    availableProviders,
  };
  const structuredOutputState = {
    structuredOutputEnabled,
    setStructuredOutputEnabled,
    selectedSchemaName,
    setSelectedSchemaName,
  };
  const datasetState = {
    datasets: datasets.data,
    selectedDatasetId: datasetId,
    selectedDataset,
    selectedDatasetVersion: datasetVersion,
    validationResult: validationResult.data,
    expectedColumnsForDataset: {
      inputVariables: expectedColumns || [],
      outputVariableType: PromptType.Text,
      outputVariableName: "expected_output",
    },
  };
  const evaluatorState = {
    activeEvaluators,
    pausedEvaluators,
    evaluatorTargetObjects,
    evalTemplates: evalTemplates.data?.templates ?? [],
    activeEvaluatorNames,
    selectedEvaluatorData,
    showEvaluatorForm,
    handleConfigureEvaluator,
    handleCloseEvaluatorForm,
    handleEvaluatorSuccess,
    handleSelectEvaluator,
    handleEvaluatorToggled: () => void evaluators.refetch(),
    preprocessFormValues,
  };
  const permissions = { hasEvalReadAccess, hasEvalWriteAccess };
  const reviewSummary = {
    selectedPromptName,
    selectedPromptVersion,
    selectedDataset,
    modelParams,
    activeEvaluatorNames,
    structuredOutputEnabled,
    selectedSchemaName,
    validationResult: validationResult.data,
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Run Experiment</DialogTitle>
        <DialogDescription>
          Run an experiment to evaluate prompts and model configurations against
          a dataset. See{" "}
          <Link
            href="https://langfuse.com/docs/evaluation/dataset-runs/native-run"
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
            <Breadcrumb className="mb-6 w-full">
              <BreadcrumbList className="flex w-full justify-between sm:justify-start">
                {steps.map((step, index) => (
                  <React.Fragment key={step.id}>
                    <BreadcrumbItem>
                      {step.id === activeStep ? (
                        <BreadcrumbPage className="flex items-center">
                          {isStepValid(step.id) && (
                            <Check className="mr-1.5 h-3.5 w-3.5 text-green-600" />
                          )}
                          {step.label}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          onClick={() => setActiveStep(step.id)}
                          className="flex cursor-pointer items-center"
                        >
                          {isStepValid(step.id) && (
                            <Check className="mr-1.5 h-3.5 w-3.5 text-green-600" />
                          )}
                          {step.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {index < steps.length - 1 && <BreadcrumbSeparator />}
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>

            <div className="min-h-[500px] overflow-y-auto px-0.5">
              {activeStep === "prompt" && (
                <PromptModelStep
                  projectId={projectId}
                  formState={formState}
                  promptModelState={promptModelState}
                  modelState={modelState}
                  structuredOutputState={structuredOutputState}
                />
              )}

              {activeStep === "dataset" && (
                <DatasetStep
                  projectId={projectId}
                  formState={formState}
                  datasetState={datasetState}
                  promptInfo={{
                    selectedPromptName,
                    selectedPromptVersion,
                  }}
                />
              )}

              {activeStep === "evaluators" && (
                <EvaluatorsStep
                  projectId={projectId}
                  datasetId={datasetId}
                  evaluatorState={evaluatorState}
                  permissions={permissions}
                />
              )}

              {activeStep === "details" && (
                <ExperimentDetailsStep formState={formState} />
              )}

              {activeStep === "review" && (
                <ReviewStep
                  formState={formState}
                  navigationState={navigationState}
                  summary={reviewSummary}
                />
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <div className="flex w-full justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={(e) => {
                  e.preventDefault();
                  const stepIds = steps.map((s) => s.id);
                  const currentIndex = stepIds.indexOf(activeStep);
                  if (currentIndex > 0) {
                    setActiveStep(stepIds[currentIndex - 1]);
                  }
                }}
                disabled={activeStep === "prompt"}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>

              <div className="flex gap-2">
                {activeStep !== "review" ? (
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      const stepIds = steps.map((s) => s.id);
                      const currentIndex = stepIds.indexOf(activeStep);
                      if (currentIndex < steps.length - 1) {
                        setActiveStep(stepIds[currentIndex + 1]);
                      }
                    }}
                  >
                    Next
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={
                      (Boolean(promptIdFromHook && datasetId) &&
                        !validationResult.data?.isValid) ||
                      !!form.formState.errors.name
                    }
                    loading={form.formState.isSubmitting}
                  >
                    Run Experiment
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
};
