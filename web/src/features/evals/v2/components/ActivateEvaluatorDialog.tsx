import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { ActivationCostEstimate } from "@/src/features/evals/v2/components/ActivationCostEstimate";
import { type FilterState } from "@langfuse/shared";

export function ActivateEvaluatorDialog({
  projectId,
  evaluatorId,
  setupFilter,
  setupSampling,
  testRunCostUsd,
  isCodeEvaluator,
  open,
  onOpenChange,
  onComplete,
  onCreateRule,
}: {
  projectId: string;
  evaluatorId: string;
  setupFilter: FilterState;
  setupSampling: number;
  testRunCostUsd: number | null;
  isCodeEvaluator: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  onCreateRule: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" closeOnInteractionOutside>
        <DialogHeader variant="action">
          <DialogTitle>Evaluator saved successfully</DialogTitle>
        </DialogHeader>

        <DialogBody className="gap-4">
          <DialogDescription>
            Your evaluator is ready. Would you like to run it automatically on
            incoming production observations?
          </DialogDescription>

          <ActivationCostEstimate
            projectId={projectId}
            evaluatorId={evaluatorId}
            filter={setupFilter}
            sampling={setupSampling}
            testRunCostUsd={testRunCostUsd}
            isCodeEvaluator={isCodeEvaluator}
            enabled={open}
          />
        </DialogBody>

        <DialogFooter variant="action">
          <Button type="button" variant="outline" onClick={onComplete}>
            Not now
          </Button>
          <Button type="button" onClick={onCreateRule}>
            Set up production rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
