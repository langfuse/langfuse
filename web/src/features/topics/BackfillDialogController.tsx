import { type ReactNode } from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { BackfillDialog } from "./BackfillDialog";

export type BackfillDialogControllerProps = {
  projectId: string;
  children: (control: { openDialog: () => void }) => ReactNode;
};

/** Owns the Run backfill dialog; every opener receives `openDialog`. */
export function BackfillDialogController({
  projectId,
  children,
}: BackfillDialogControllerProps) {
  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <BackfillDialog projectId={projectId} closeDialog={closeDialog} />
      )}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}
