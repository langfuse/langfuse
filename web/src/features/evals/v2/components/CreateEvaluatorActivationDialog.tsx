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

export function CreateEvaluatorActivationDialog({
  projectId,
  setupFilter,
  setupSampling,
  testRunCostUsd,
  isCodeEvaluator,
  open,
  loading,
  onOpenChange,
  onSave,
}: {
  projectId: string;
  setupFilter: FilterState;
  setupSampling: number;
  testRunCostUsd: number | null;
  isCodeEvaluator: boolean;
  open: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (runContinuously: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" closeOnInteractionOutside>
        <DialogHeader variant="action">
          <DialogTitle>Save and start running?</DialogTitle>
        </DialogHeader>

        <DialogBody className="gap-4">
          <DialogDescription>
            Choose whether to run this evaluator on new observations matching
            the filters from step 1, or save it inactive and start it later.
          </DialogDescription>

          <ActivationCostEstimate
            projectId={projectId}
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
            disabled={loading}
            onClick={() => onSave(false)}
          >
            Save only
          </Button>
          <Button type="button" loading={loading} onClick={() => onSave(true)}>
            Save &amp; run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
