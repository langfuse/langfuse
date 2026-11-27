/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { Dialog } from "@/src/components/ui/dialog";
import { type ModelOwner } from "@/src/features/models/modelOwner";
import { TestModelMatchDialogContent } from "./TestModelMatchDialogContent";

type TestModelMatchDialogProps = {
  owner: ModelOwner;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export type { TestModelMatchDialogProps };

export function TestModelMatchDialog({
  owner,
  open,
  onOpenChange,
}: TestModelMatchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TestModelMatchDialogContent
        owner={owner}
        open={open}
        onClose={() => onOpenChange(false)}
      />
    </Dialog>
  );
}
