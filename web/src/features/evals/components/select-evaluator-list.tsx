import { Fragment, type ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Bot, Check, Code2 } from "lucide-react";
import { EvaluatorSelector } from "./evaluator-selector";
import { EvalTemplateForm } from "./template-form";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
  type EvalTemplate,
} from "@langfuse/shared";
import { getDefaultCodeEvalSource } from "@/src/features/evals/utils/code-eval-template-starter-examples";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import { CODE_EVAL_ESCAPE_CONFIRM_MESSAGE } from "@/src/features/evals/utils/code-eval-template-utils";
import { InlineDefaultEvalModelSetup } from "@/src/features/evals/components/default-eval-model-setup";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";

type SelectEvaluatorListProps = {
  projectId: string;
};

type CreateEvaluatorStep = "connection" | "define";

export function SelectEvaluatorList({ projectId }: SelectEvaluatorListProps) {
  const router = useRouter();
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
  const [customEvaluatorType, setCustomEvaluatorType] = useState<
    typeof EvalTemplateType.LLM_AS_JUDGE | typeof EvalTemplateType.CODE | null
  >(null);
  const [createEvaluatorStep, setCreateEvaluatorStep] =
    useState<CreateEvaluatorStep>("define");
  const [useLlmCreateWizard, setUseLlmCreateWizard] = useState(false);
  const [defaultModelConfiguredInDialog, setDefaultModelConfiguredInDialog] =
    useState(false);
  const codeEvalCapabilities = useIsCodeEvalEnabled();
  const { enabled: isCodeEvalEnabled } = codeEvalCapabilities;

  const handleSelectEvaluator = (template: EvalTemplate) => {
    router.push(`/project/${projectId}/evals/new?evaluator=${template.id}`);
  };

  // Fetch templates
  const templates = api.evals.allTemplates.useQuery(
    {
      projectId,
    },
    {
      enabled: Boolean(projectId),
    },
  );

  const utils = api.useUtils();
  const defaultModel = api.defaultLlmModel.fetchDefaultModel.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );
  const hasDefaultEvalModel =
    Boolean(defaultModel.data) || defaultModelConfiguredInDialog;

  const handleOpenCreateEvaluator = (
    type: typeof EvalTemplateType.LLM_AS_JUDGE | typeof EvalTemplateType.CODE,
  ) => {
    const shouldUseWizard =
      type === EvalTemplateType.LLM_AS_JUDGE && !hasDefaultEvalModel;

    setCustomEvaluatorType(type);
    setUseLlmCreateWizard(shouldUseWizard);
    setCreateEvaluatorStep(shouldUseWizard ? "connection" : "define");
    setIsCreateTemplateOpen(true);
  };

  useEffect(() => {
    if (
      isCreateTemplateOpen &&
      customEvaluatorType === EvalTemplateType.LLM_AS_JUDGE &&
      useLlmCreateWizard &&
      defaultModel.data
    ) {
      setCreateEvaluatorStep("define");
    }
  }, [
    customEvaluatorType,
    defaultModel.data,
    isCreateTemplateOpen,
    useLlmCreateWizard,
  ]);

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.data?.templates.find((t) => t.id === templateId);
    if (template) {
      handleSelectEvaluator(template);
    }
  };

  return (
    <>
      <div className="mb-4 flex max-h-full min-h-0 flex-col gap-5">
        <div className="shrink-0 space-y-2">
          <h2 className="text-base font-semibold">Create from scratch</h2>
          <div className="flex flex-wrap gap-3">
            {isCodeEvalEnabled ? (
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-24 w-full justify-start gap-3 px-4 py-4 text-left whitespace-normal sm:w-[360px]"
                onClick={() => handleOpenCreateEvaluator(EvalTemplateType.CODE)}
              >
                <Code2 className="h-5 w-5 shrink-0" />
                <span className="flex flex-col gap-1">
                  <span className="font-medium">Code evaluator</span>
                  <span className="text-muted-foreground text-sm font-normal">
                    Use code to create Langfuse scores.
                  </span>
                </span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-24 w-full justify-start gap-3 px-4 py-4 text-left whitespace-normal sm:w-[360px]"
              onClick={() =>
                handleOpenCreateEvaluator(EvalTemplateType.LLM_AS_JUDGE)
              }
            >
              <Bot className="h-5 w-5 shrink-0" />
              <span className="flex flex-col gap-1">
                <span className="font-medium">LLM as a judge evaluator</span>
                <span className="text-muted-foreground text-sm font-normal">
                  Use a prompt and model to score traces or observations.
                </span>
              </span>
            </Button>
          </div>
        </div>

        <div className="flex max-h-full min-h-0 flex-col gap-2">
          <h2 className="shrink-0 text-base font-semibold">Use existing</h2>
          <Card className="grid max-h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-y-auto p-3">
            <div className="flex min-h-0 flex-col overflow-hidden">
              {templates.isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : templates.isError ? (
                <div className="text-destructive py-8 text-center">
                  Error: {templates.error.message}
                </div>
              ) : templates.data?.templates.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center">
                  No evaluators found. Create a new evaluator to get started.
                </div>
              ) : (
                <div className="flex-1 overflow-hidden">
                  <EvaluatorSelector
                    projectId={projectId}
                    evalTemplates={templates.data?.templates || []}
                    showMissingProviderWarning={false}
                    onTemplateSelect={(templateId) =>
                      handleTemplateSelect(templateId)
                    }
                  />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={isCreateTemplateOpen}
        onOpenChange={(open) => {
          setIsCreateTemplateOpen(open);
          if (!open) {
            setCustomEvaluatorType(null);
            setCreateEvaluatorStep("define");
            setUseLlmCreateWizard(false);
            setDefaultModelConfiguredInDialog(false);
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-(--breakpoint-md) overflow-y-auto"
          confirmCloseOnEscape={
            customEvaluatorType === EvalTemplateType.CODE
              ? CODE_EVAL_ESCAPE_CONFIRM_MESSAGE
              : undefined
          }
        >
          <DialogHeader>
            <DialogTitle>Create new evaluator</DialogTitle>
            {useLlmCreateWizard ? (
              <DialogDescription>
                Set up an LLM connection first, then define the evaluator.
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {useLlmCreateWizard ? (
            <CreateLlmEvaluatorWizard
              projectId={projectId}
              activeStep={createEvaluatorStep}
              hasDefaultEvalModel={hasDefaultEvalModel}
              onStepChange={setCreateEvaluatorStep}
              onProviderConfigured={() => {
                setDefaultModelConfiguredInDialog(true);
                setCreateEvaluatorStep("define");
              }}
              renderEvalTemplateForm={(shouldUseDefaultModel) => (
                <CreateEvaluatorTemplateForm
                  key={`llm-${shouldUseDefaultModel ? "default" : "custom"}`}
                  projectId={projectId}
                  customEvaluatorType={EvalTemplateType.LLM_AS_JUDGE}
                  shouldUseDefaultModel={shouldUseDefaultModel}
                  onSuccess={(newTemplate) => {
                    setIsCreateTemplateOpen(false);
                    setCustomEvaluatorType(null);
                    setUseLlmCreateWizard(false);
                    utils.evals.allTemplates.invalidate();
                    if (newTemplate) {
                      handleSelectEvaluator(newTemplate);
                    }
                  }}
                />
              )}
            />
          ) : (
            <CreateEvaluatorTemplateForm
              key={customEvaluatorType ?? "custom-evaluator"}
              projectId={projectId}
              customEvaluatorType={
                customEvaluatorType ?? EvalTemplateType.LLM_AS_JUDGE
              }
              onSuccess={(newTemplate) => {
                setIsCreateTemplateOpen(false);
                setCustomEvaluatorType(null);
                utils.evals.allTemplates.invalidate();
                if (newTemplate) {
                  handleSelectEvaluator(newTemplate);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateLlmEvaluatorWizard({
  projectId,
  activeStep,
  hasDefaultEvalModel,
  onStepChange,
  onProviderConfigured,
  renderEvalTemplateForm,
}: {
  projectId: string;
  activeStep: CreateEvaluatorStep;
  hasDefaultEvalModel: boolean;
  onStepChange: (step: CreateEvaluatorStep) => void;
  onProviderConfigured: () => void;
  renderEvalTemplateForm: (shouldUseDefaultModel: boolean) => ReactNode;
}) {
  const steps: Array<{ id: CreateEvaluatorStep; label: string }> = [
    { id: "connection", label: "Set up LLM connection" },
    { id: "define", label: "Define evaluator" },
  ];
  const shouldUseDefaultModel = hasDefaultEvalModel;

  return (
    <>
      <Breadcrumb className="px-4 py-2">
        <BreadcrumbList>
          {steps.map((step, index) => {
            const isActive = step.id === activeStep;
            const isComplete = step.id === "connection" && hasDefaultEvalModel;
            const canNavigateToStep =
              step.id === "connection" || hasDefaultEvalModel;

            return (
              <Fragment key={step.id}>
                <BreadcrumbItem>
                  {isActive ? (
                    <BreadcrumbPage className="flex items-center font-semibold">
                      {isComplete ? (
                        <Check className="text-dark-green mr-1.5 h-3.5 w-3.5" />
                      ) : null}
                      {index + 1}. {step.label}
                    </BreadcrumbPage>
                  ) : !canNavigateToStep ? (
                    <BreadcrumbPage className="text-muted-foreground flex items-center">
                      {index + 1}. {step.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      onClick={() => onStepChange(step.id)}
                      className="flex cursor-pointer items-center"
                    >
                      {isComplete ? (
                        <Check className="text-dark-green mr-1.5 h-3.5 w-3.5" />
                      ) : null}
                      {index + 1}. {step.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {index < steps.length - 1 ? <BreadcrumbSeparator /> : null}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {activeStep === "connection" ? (
        <DialogBody className="space-y-4">
          <p className="text-muted-foreground text-sm">
            LLM-as-a-judge evaluators need an LLM connection for scoring. Set a
            project default connection now to continue defining the evaluator.
          </p>
          <InlineDefaultEvalModelSetup
            projectId={projectId}
            onSuccess={onProviderConfigured}
            submitLabel="Save and continue"
          />
        </DialogBody>
      ) : (
        renderEvalTemplateForm(shouldUseDefaultModel)
      )}
    </>
  );
}

function CreateEvaluatorTemplateForm({
  projectId,
  customEvaluatorType,
  shouldUseDefaultModel,
  onSuccess,
}: {
  projectId: string;
  customEvaluatorType:
    | typeof EvalTemplateType.LLM_AS_JUDGE
    | typeof EvalTemplateType.CODE;
  shouldUseDefaultModel?: boolean;
  onSuccess: (newTemplate?: EvalTemplate) => void;
}) {
  return (
    <EvalTemplateForm
      projectId={projectId}
      preventRedirect={true}
      isEditing={true}
      useDialog={true}
      templateTypeSelectorMode={
        customEvaluatorType === EvalTemplateType.CODE ? "code-only" : "hidden"
      }
      preFilledFormValues={{
        name: "",
        type: customEvaluatorType,
        prompt: "",
        vars: [],
        ...(customEvaluatorType === EvalTemplateType.LLM_AS_JUDGE &&
        shouldUseDefaultModel !== undefined
          ? { shouldUseDefaultModel }
          : {}),
        ...(customEvaluatorType === EvalTemplateType.CODE
          ? {
              sourceCode: getDefaultCodeEvalSource(
                EvalTemplateSourceCodeLanguage.TYPESCRIPT,
              ),
              sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
            }
          : {}),
      }}
      onFormSuccess={(newTemplate) => {
        onSuccess(newTemplate);
        showSuccessToast({
          title: "Evaluator created successfully",
          description: "You can now use this evaluator.",
        });
      }}
    />
  );
}
