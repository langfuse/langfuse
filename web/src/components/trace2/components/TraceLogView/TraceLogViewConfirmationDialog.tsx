/**
 * LogViewConfirmationDialog - Confirmation dialog for viewing traces with many observations
 *
 * Warns users about potential performance issues when viewing log view
 * for traces with a large number of observations.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";

interface TraceLogViewConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  observationCount: number;
  onConfirm: () => void;
}

export function TraceLogViewConfirmationDialog({
  open,
  onOpenChange,
  observationCount,
  onConfirm,
}: TraceLogViewConfirmationDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sluggish Performance Warning</AlertDialogTitle>
          <AlertDialogDescription>
            This trace has {observationCount} observations. The log view may be
            slow to load and interact with. Do you want to continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Show Log View
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
