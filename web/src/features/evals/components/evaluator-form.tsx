import { type EvalTemplate } from "@langfuse/shared";
import { InnerEvaluatorForm } from "@/src/features/evals/components/inner-evaluator-form";
import { type PartialConfig } from "@/src/features/evals/types";

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
  preventRedirect?: boolean;
  preprocessFormValues?: (values: any) => any;
}) => {
  const currentTemplate =
    props.existingEvaluator?.evalTemplate ??
    props.evalTemplates.find((t) => t.id === props.templateId);

  if (!currentTemplate) {
    return null;
  }

  return (
    <>
      <InnerEvaluatorForm
        projectId={props.projectId}
        disabled={props.disabled}
        existingEvaluator={props.existingEvaluator}
        evalTemplate={props.existingEvaluator?.evalTemplate ?? currentTemplate}
        onFormSuccess={props.onFormSuccess}
        shouldWrapVariables={props.shouldWrapVariables}
        hideTargetSection={props.hideTargetSection}
        mode={props.mode}
        preventRedirect={props.preventRedirect ?? true}
        preprocessFormValues={props.preprocessFormValues}
        useDialog={props.useDialog}
      />
    </>
  );
};
