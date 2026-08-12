import type { ReactNode } from "react";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
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
        <DialogHeader variant="action">
          <DialogTitle>Evaluator saved successfully</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            Your evaluator is ready. Run it automatically on incoming production
            observations by creating a rule or attaching it to an existing one.
          </DialogDescription>
          <div className="space-y-2">
            <div>
              <p className="text-sm font-bold">Choose a rule</p>
              <p className="text-muted-foreground text-sm">
                The evaluator will run on incoming observations matched by this
                rule.
              </p>
            </div>
            {rulePicker}
            {isEstimating ? (
              <div
                className="flex items-center gap-2 rounded-md border p-3"
                aria-label="Calculating evaluator costs"
              >
                <Spinner size="sm" variant="muted" />
                <span className="text-muted-foreground text-sm">
                  Calculating costs
                </span>
              </div>
            ) : (
              costEstimate
            )}
          </div>
        </DialogBody>
        <DialogFooter variant="action">
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
