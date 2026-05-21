import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { FormDescription } from "@/src/components/ui/form";
import { usePreviewData } from "@/src/features/evals/hooks/usePreviewData";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { api } from "@/src/utils/api";
import { EvalTargetObject, type EvalTemplate } from "@langfuse/shared";
import { type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { type EvalFormType } from "@/src/features/evals/utils/evaluator-form-utils";
import { getCodeEvalVariableMapping } from "@/src/features/evals/utils/code-eval-template-utils";
import { isEventTarget } from "@/src/features/evals/utils/typeHelpers";

export function CodeEvalTestRunCard({
  projectId,
  evalTemplate,
  form,
  disabled = false,
}: {
  projectId: string;
  evalTemplate: EvalTemplate;
  form: UseFormReturn<EvalFormType>;
  disabled?: boolean;
}) {
  const { isBetaEnabled } = useV4Beta();
  const target = form.watch("target");
  const scoreName = form.watch("scoreName");
  const canTest = isBetaEnabled && isEventTarget(target) && !disabled;

  const { previewData, isLoading } = usePreviewData(
    projectId,
    form,
    canTest,
    undefined,
    undefined,
  );

  const observationId =
    previewData?.type === EvalTargetObject.EVENT
      ? previewData.observationId
      : undefined;

  const testRunMutation = api.evals.testRunCodeEval.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        return;
      }

      toast.error(result.error.message);
    },
  });

  if (!canTest) return null;

  return (
    <Card className="flex items-center justify-between gap-4 p-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Test run</span>
        <FormDescription>
          Run this evaluator against the first matching observation.
        </FormDescription>
      </div>
      <Button
        type="button"
        variant="outline"
        loading={testRunMutation.isPending}
        disabled={!observationId || isLoading}
        onClick={() => {
          if (!observationId) return;

          testRunMutation.mutate({
            projectId,
            evalTemplateId: evalTemplate.id,
            target: EvalTargetObject.EVENT,
            mapping: getCodeEvalVariableMapping(),
            scoreName,
            observationId,
          });
        }}
      >
        Test
      </Button>
    </Card>
  );
}
