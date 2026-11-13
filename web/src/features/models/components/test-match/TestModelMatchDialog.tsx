/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { Dialog } from "@/src/components/ui/dialog";
import { TestModelMatchDialogContent } from "./TestModelMatchDialogContent";

type TestModelMatchDialogProps = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export type { TestModelMatchDialogProps };

export function TestModelMatchDialog({
  projectId,
  open,
  onOpenChange,
}: TestModelMatchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TestModelMatchDialogContent
        projectId={projectId}
        open={open}
        onClose={() => onOpenChange(false)}
      />
    </Dialog>
  );
}
