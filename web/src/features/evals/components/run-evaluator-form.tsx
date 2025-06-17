import { Card } from "@/src/components/ui/card";
import { EvaluatorForm } from "@/src/features/evals/components/evaluator-form";
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
  return (
    <Card className="grid max-h-[90vh] overflow-y-auto p-3">
      <EvaluatorForm
        projectId={projectId}
        evalTemplates={evalTemplates}
        templateId={evaluatorId}
        preventRedirect={false}
        useDialog={false}
      />
    </Card>
  );
}
