import { type ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { EditDatasetItemDialog } from "@/src/features/datasets/components/EditDatasetItemDialog";

export type EditDatasetItemDialogState = {
  datasetItemId: string;
};

export function EditDatasetItemDialogController({
  projectId,
  datasetId,
  children,
}: {
  projectId: string;
  datasetId: string;
  children: (control: {
    openDialog: (state: EditDatasetItemDialogState) => void;
  }) => ReactNode;
}) {
  return (
    <DialogController<EditDatasetItemDialogState>
      renderDialog={({ state, closeDialog }) => (
        <EditDatasetItemDialog
          projectId={projectId}
          datasetId={datasetId}
          datasetItemId={state.datasetItemId}
          onSuccess={closeDialog}
        />
      )}
    >
      {children}
    </DialogController>
  );
}
