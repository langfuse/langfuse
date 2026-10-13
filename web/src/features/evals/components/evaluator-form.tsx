import { type EvalTemplate, type EvalTargetObject } from "@langfuse/shared";
import { InnerEvaluatorForm } from "@/src/features/evals/components/inner-evaluator-form";
import { type PartialConfig } from "@/src/features/evals/types";
import { useEvalCapabilities } from "@/src/features/evals/hooks/useEvalCapabilities";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import {
  isCodeEvalTemplate,
  shouldShowEvalTemplate,
} from "@/src/features/evals/utils/code-eval-template-utils";

export const EvaluatorForm = (props: {
  projectId: string;
  evalTemplate: EvalTemplate;
  useDialog: boolean;
  disabled?: boolean;
  existingEvaluator?: PartialConfig & { evalTemplate: EvalTemplate };
  onFormSuccess?: () => void;
  mode?: "create" | "edit";
  shouldWrapVariables?: boolean;
  hideTargetSection?: boolean;
  hideTargetSelection?: boolean;
  preventRedirect?: boolean;
  preprocessFormValues?: (values: any) => any;
  defaultRunOnLive?: boolean;
  hidePreviewTable?: boolean;
  defaultTarget?: EvalTargetObject;
}) => {
  const evalCapabilities = useEvalCapabilities(props.projectId, {
    isCodeEvalTemplate: isCodeEvalTemplate(props.evalTemplate),
  });

  return (
    <>
      {evalCapabilities.isLoading ? (
        <Skeleton className="h-[30dvh] w-full" />
      ) : (
        <InnerEvaluatorForm
          projectId={props.projectId}
          disabled={props.disabled}
          existingEvaluator={props.existingEvaluator}
          evalTemplate={props.evalTemplate}
          onFormSuccess={props.onFormSuccess}
          shouldWrapVariables={props.shouldWrapVariables}
          hideTargetSection={props.hideTargetSection}
          hideTargetSelection={props.hideTargetSelection}
          mode={props.mode}
          preventRedirect={props.preventRedirect ?? true}
          preprocessFormValues={props.preprocessFormValues}
          useDialog={props.useDialog}
          evalCapabilities={evalCapabilities}
          defaultRunOnLive={props.defaultRunOnLive}
          hidePreviewTable={props.hidePreviewTable}
          defaultTarget={props.defaultTarget}
        />
      )}
    </>
  );
};

export function useEvaluatorFormTemplate({
  evalTemplates,
  evalTemplate,
  templateId,
}: {
  evalTemplates: EvalTemplate[];
  evalTemplate?: EvalTemplate;
  templateId?: string;
}) {
  const codeEvalCapabilities = useIsCodeEvalEnabled();
  const currentTemplate =
    evalTemplate ??
    evalTemplates.find((template) => template.id === templateId);

  if (
    !currentTemplate ||
    (isCodeEvalTemplate(currentTemplate) &&
      !shouldShowEvalTemplate(currentTemplate, codeEvalCapabilities))
  ) {
    return undefined;
  }

  return currentTemplate;
}
