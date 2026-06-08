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
  evalTemplates: EvalTemplate[];
  useDialog: boolean;
  disabled?: boolean;
  existingEvaluator?: PartialConfig & { evalTemplate: EvalTemplate };
  onFormSuccess?: () => void;
  mode?: "create" | "edit";
  shouldWrapVariables?: boolean;
  templateId?: string;
  hideTargetSection?: boolean;
  hideTargetSelection?: boolean;
  preventRedirect?: boolean;
  preprocessFormValues?: (values: any) => any;
  defaultRunOnLive?: boolean;
  hidePreviewTable?: boolean;
  defaultTarget?: EvalTargetObject;
}) => {
  const codeEvalCapabilities = useIsCodeEvalEnabled();

  const currentTemplate =
    props.existingEvaluator?.evalTemplate ??
    props.evalTemplates
      .filter((template) =>
        shouldShowEvalTemplate(template, codeEvalCapabilities),
      )
      .find((t) => t.id === props.templateId);

  const evalCapabilities = useEvalCapabilities(props.projectId, {
    isCodeEvalTemplate:
      !!currentTemplate && isCodeEvalTemplate(currentTemplate),
  });

  if (
    !currentTemplate ||
    (isCodeEvalTemplate(currentTemplate) &&
      !shouldShowEvalTemplate(currentTemplate, codeEvalCapabilities))
  ) {
    return null;
  }

  return (
    <>
      {evalCapabilities.isLoading ? (
        <Skeleton className="h-[30dvh] w-full" />
      ) : (
        <InnerEvaluatorForm
          projectId={props.projectId}
          disabled={props.disabled}
          existingEvaluator={props.existingEvaluator}
          evalTemplate={
            props.existingEvaluator?.evalTemplate ?? currentTemplate
          }
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
