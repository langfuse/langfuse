import { Card } from "@/src/components/ui/card";
import {
  EvaluatorForm,
  useEvaluatorFormTemplate,
} from "@/src/features/evals/components/evaluator-form";
import { type RouterOutputs } from "@/src/utils/api";

type RunEvaluatorFormProps = {
  projectId: string;
  evaluatorId: string;
  evalTemplates: RouterOutputs["evals"]["allTemplates"]["templates"];
};

export function RunEvaluatorForm({
  projectId,
  evaluatorId,
  evalTemplates,
}: RunEvaluatorFormProps) {
  const evalTemplate = useEvaluatorFormTemplate({
    evalTemplates,
    templateId: evaluatorId,
  });

  return (
    <Card className="grid p-3">
      {evalTemplate && (
        <EvaluatorForm
          projectId={projectId}
          evalTemplate={evalTemplate}
          preventRedirect={false}
          useDialog={false}
        />
      )}
    </Card>
  );
}
