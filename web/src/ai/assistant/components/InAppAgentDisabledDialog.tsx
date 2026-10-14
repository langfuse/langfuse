import { Button } from "@/src/app/design-system/legacy-primitives/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/app/design-system/legacy-primitives/dialog";
import { AIFeaturesDisabledNotice } from "@/src/identity/organizations";

export function InAppAgentDisabledDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI features are disabled</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <AIFeaturesDisabledNotice
            organizationId={organizationId}
            onSettingsOpened={() => {
              onOpenChange(false);
            }}
          >
            The Langfuse Assistant requires AI features to be enabled for this
            organization.
          </AIFeaturesDisabledNotice>
        </DialogBody>
        <DialogFooter>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
