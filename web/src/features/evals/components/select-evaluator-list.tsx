import { useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { BrainCircuit, Code2 } from "lucide-react";
import { EvaluatorSelector } from "./evaluator-selector";
import { EvalTemplateForm } from "./template-form";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { SetupDefaultEvalModelCard } from "@/src/features/evals/components/set-up-default-eval-model-card";
import { useTemplateValidation } from "@/src/features/evals/hooks/useTemplateValidation";
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

type SelectEvaluatorListProps = {
  projectId: string;
};

export function SelectEvaluatorList({ projectId }: SelectEvaluatorListProps) {
  const router = useRouter();
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
  const [customEvaluatorType, setCustomEvaluatorType] = useState<
    typeof EvalTemplateType.LLM_AS_JUDGE | typeof EvalTemplateType.CODE | null
  >(null);
  const { enabled: isCodeEvalEnabled } = useIsCodeEvalEnabled();

  const handleSelectEvaluator = (template: EvalTemplate) => {
    router.push(`/project/${projectId}/evals/new?evaluator=${template.id}`);
  };

  const { isSelectionValid, selectedTemplate, setSelectedTemplate } =
    useTemplateValidation({
      projectId,
      onValidSelection: handleSelectEvaluator,
    });

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

  const handleOpenCreateEvaluator = (
    type: typeof EvalTemplateType.LLM_AS_JUDGE | typeof EvalTemplateType.CODE,
  ) => {
    setCustomEvaluatorType(type);
    setIsCreateTemplateOpen(true);
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.data?.templates.find((t) => t.id === templateId);
    if (template) {
      setSelectedTemplate(template);
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
                    Run TypeScript or Python logic to create Langfuse scores.
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
              <BrainCircuit className="h-5 w-5 shrink-0" />
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
                    selectedTemplateId={selectedTemplate?.id || undefined}
                    onTemplateSelect={(templateId) =>
                      handleTemplateSelect(templateId)
                    }
                  />
                </div>
              )}
            </div>

            {!isSelectionValid && (
              <div className="px-4">
                <SetupDefaultEvalModelCard projectId={projectId} />
              </div>
            )}
          </Card>
        </div>
      </div>

      <Dialog
        open={isCreateTemplateOpen}
        onOpenChange={(open) => {
          setIsCreateTemplateOpen(open);
          if (!open) {
            setCustomEvaluatorType(null);
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
          </DialogHeader>
          <EvalTemplateForm
            key={customEvaluatorType ?? "custom-evaluator"}
            projectId={projectId}
            preventRedirect={true}
            isEditing={true}
            useDialog={true}
            templateTypeSelectorMode={
              customEvaluatorType === EvalTemplateType.CODE
                ? "code-only"
                : "hidden"
            }
            preFilledFormValues={{
              name: "",
              type: customEvaluatorType ?? EvalTemplateType.LLM_AS_JUDGE,
              prompt: "",
              vars: [],
              ...(customEvaluatorType === EvalTemplateType.CODE
                ? {
                    sourceCode: getDefaultCodeEvalSource(
                      EvalTemplateSourceCodeLanguage.TYPESCRIPT,
                    ),
                    sourceCodeLanguage:
                      EvalTemplateSourceCodeLanguage.TYPESCRIPT,
                  }
                : {}),
            }}
            onFormSuccess={(newTemplate) => {
              setIsCreateTemplateOpen(false);
              setCustomEvaluatorType(null);
              void utils.evals.allTemplates.invalidate();
              if (newTemplate) {
                setSelectedTemplate(newTemplate);
              }
              showSuccessToast({
                title: "Evaluator created successfully",
                description: "You can now use this evaluator.",
              });
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
