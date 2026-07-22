import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { ActivationCostEstimate } from "@/src/features/evals/v2/components/ActivationCostEstimate";
import { type FilterState } from "@langfuse/shared";

type EvaluationRule = {
  name: string;
  filter: FilterState;
  sampling: number;
};

export function ConfirmEvaluationRuleAttachmentDialog({
  projectId,
  evaluatorId,
  rule,
  isCodeEvaluator,
  open,
  onOpenChange,
  onConfirm,
  loading = false,
}: {
  projectId: string;
  evaluatorId: string;
  rule: EvaluationRule | null;
  isCodeEvaluator: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attach evaluator to rule?</DialogTitle>
        </DialogHeader>

        <DialogBody className="gap-4">
          <p className="text-sm">
            {rule
              ? `Do you want this evaluator to run on incoming traces matched by “${rule.name}”?`
              : "Do you want to attach this evaluator to the evaluation rule?"}
          </p>

          {rule ? (
            <ActivationCostEstimate
              projectId={projectId}
              evaluatorId={evaluatorId}
              filter={rule.filter}
              sampling={rule.sampling}
              testRunCostUsd={null}
              isCodeEvaluator={isCodeEvaluator}
              enabled={open}
            />
          ) : null}
        </DialogBody>

        <DialogFooter className="py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" loading={loading} onClick={onConfirm}>
            Attach evaluator
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmEvaluationRuleDetachmentDialog({
  rule,
  isOnlyAttachedRule,
  open,
  onOpenChange,
  onConfirm,
  loading = false,
}: {
  rule: Pick<EvaluationRule, "name"> | null;
  isOnlyAttachedRule: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Detach evaluator from rule?"
      description={
        rule
          ? `The evaluator will stop running on incoming traces matched by “${rule.name}”.${isOnlyAttachedRule ? " Since this is its only evaluation rule, the evaluator will become inactive." : ""} The evaluation rule itself will not be deleted.`
          : undefined
      }
      confirmLabel="Detach evaluator"
      loading={loading}
      onConfirm={onConfirm}
    />
  );
}
