import type { ReactNode } from "react";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { Button } from "@/src/components/ui/button";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";

export function EvaluatorSavedDialog({
  open,
  rulePicker,
  costEstimate,
  canSubmit,
  isAttaching,
  isEstimating,
  primaryActionLabel,
  onOpenChange,
  onPrimaryAction,
  onCloseAnimationEnd,
}: {
  open: boolean;
  rulePicker: ReactNode;
  costEstimate: ReactNode;
  canSubmit: boolean;
  isAttaching: boolean;
  isEstimating: boolean;
  primaryActionLabel: string;
  onOpenChange: (open: boolean) => void;
  onPrimaryAction: () => void;
  onCloseAnimationEnd?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        closeOnInteractionOutside
        onCloseAutoFocus={onCloseAnimationEnd}
      >
        <DialogHeader>
          <DialogTitle>Evaluator saved successfully</DialogTitle>
          <DialogDescription>
            Your evaluator is ready. Set up a rule to run it automatically on
            incoming observations.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-2">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold">Choose a rule</p>
                <InfoTooltip label="About evaluation rules">
                  Saved evaluators are available for experiments and batch
                  evaluations on historical data. Connect this evaluator to a
                  rule to run it automatically on new incoming observations.
                </InfoTooltip>
              </div>
              <p className="text-muted-foreground text-sm">
                The evaluator will run on incoming observations matched by this
                rule.
              </p>
            </div>
            {rulePicker}
          </div>
          {isEstimating ? (
            <div className="space-y-2">
              <div>
                <p className="text-sm font-bold">Cost estimation</p>
                <p className="text-muted-foreground text-sm">
                  Review the expected cost before running this evaluator
                  automatically.
                </p>
              </div>
              <div
                className="flex items-center gap-2 rounded-md border p-3"
                aria-label="Calculating evaluator costs"
              >
                <Spinner size="sm" variant="muted" />
                <span className="text-muted-foreground text-sm">
                  Calculating costs
                </span>
              </div>
            </div>
          ) : (
            costEstimate
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isAttaching}
            onClick={() => onOpenChange(false)}
          >
            Not now
          </Button>
          <Button
            disabled={!canSubmit}
            loading={isAttaching}
            loadingText="Attaching evaluator..."
            onClick={onPrimaryAction}
          >
            {primaryActionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
