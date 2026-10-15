import { type ReactNode } from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { BackfillDialog } from "./BackfillDialog";
import { useTopicBackfill } from "./useTopicBackfill";

export type BackfillDialogControllerProps = {
  projectId: string;
  children: (control: { openDialog: () => void }) => ReactNode;
};

/**
 * Owns the Run backfill dialog and its request; every opener receives
 * `openDialog`. The request lives here, not in the dialog content, because the
 * content remounts on every open.
 */
export function BackfillDialogController({
  projectId,
  children,
}: BackfillDialogControllerProps) {
  const backfill = useTopicBackfill(projectId);

  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <BackfillDialog backfill={backfill} closeDialog={closeDialog} />
      )}
    >
      {({ openDialog }) => {
        function openBackfill() {
          backfill.resetResult();
          openDialog();
        }
        return children({ openDialog: openBackfill });
      }}
    </DialogController>
  );
}
