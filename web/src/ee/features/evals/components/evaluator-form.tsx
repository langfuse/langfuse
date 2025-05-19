import { type JobConfiguration } from "@langfuse/shared";
import { type EvalTemplate } from "@langfuse/shared";
import { InnerEvaluatorForm } from "@/src/ee/features/evals/components/inner-evaluator-form";

// TODO: see which props can be removed due to no template selector
export const EvaluatorForm = (props: {
  projectId: string;
  evalTemplates: EvalTemplate[];
  disabled?: boolean;
  existingEvaluator?: JobConfiguration & { evalTemplate: EvalTemplate };
  onFormSuccess?: () => void;
  mode?: "create" | "edit";
  shouldWrapVariables?: boolean;
  templateId?: string;
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
        key={currentTemplate.id}
        projectId={props.projectId}
        disabled={props.disabled}
        existingEvaluator={props.existingEvaluator}
        evalTemplate={props.existingEvaluator?.evalTemplate ?? currentTemplate}
        onFormSuccess={props.onFormSuccess}
        shouldWrapVariables={props.shouldWrapVariables}
        mode={props.mode}
      />
    </>
  );
};
