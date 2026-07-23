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
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type FilterState } from "@langfuse/shared";

export function ActivateEvaluatorDialog({
  projectId,
  evaluatorId,
  evaluatorName,
  setupFilter,
  setupSampling,
  testRunCostUsd,
  isCodeEvaluator,
  open,
  onOpenChange,
  onComplete,
}: {
  projectId: string;
  evaluatorId: string;
  evaluatorName: string;
  setupFilter: FilterState;
  setupSampling: number;
  testRunCostUsd: number | null;
  isCodeEvaluator: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}) {
  const utils = api.useUtils();

  const activate = api.evalsV2.activateEvaluator.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: () => {
      Promise.all([utils.evals.invalidate(), utils.evalsV2.invalidate()]).catch(
        () => undefined,
      );
      showSuccessToast({
        title: "Evaluator is live",
        description: `“${evaluatorName}” will evaluate new matching observations.`,
      });
      onComplete();
    },
  });

  const handleActivate = () => {
    activate.mutate({
      projectId,
      evaluatorId,
      rule: { mode: "setup" },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" closeOnInteractionOutside>
        <DialogHeader variant="action">
          <DialogTitle>Run evaluator on incoming observations?</DialogTitle>
        </DialogHeader>

        <DialogBody className="gap-4">
          <DialogDescription>
            This creates an evaluation rule using the filters you configured to
            select sample observations.
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
          <Button
            type="button"
            variant="outline"
            disabled={activate.isPending}
            onClick={onComplete}
          >
            Keep disabled
          </Button>
          <Button
            type="button"
            loading={activate.isPending}
            onClick={handleActivate}
          >
            Run on matching observations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
