import { CardContent } from "@/src/components/ui/card";
import { Card } from "@/src/components/ui/card";
import { ManageDefaultEvalModel } from "@/src/features/evals/components/manage-default-eval-model";

export function SetupDefaultEvalModelCard({
  projectId,
}: {
  projectId: string;
}) {
  return (
    <Card className="mt-2 border-dark-yellow bg-light-yellow">
      <CardContent className="mt-2 flex flex-col gap-1">
        <ManageDefaultEvalModel
          projectId={projectId}
          setUpMessage="Set up default evaluation model to use this evaluator"
          variant="color-coded"
        />
        <p className="text-xs text-dark-yellow/70">
          This evaluator expects to use the default evaluation model for your
          project.
        </p>
      </CardContent>
    </Card>
  );
}
