import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  AddCustomModelDialog,
  type AddCustomModelDialogProps,
} from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/AddCustomModelDialogController/components/AddCustomModelDialog/AddCustomModelDialog";

export type AddCustomModelDialogControllerProps = Omit<
  AddCustomModelDialogProps,
  "onAdded"
> & {
  children: (control: { openDialog: () => void }) => ReactNode;
};

export function AddCustomModelDialogController({
  children,
  ...dialogProps
}: AddCustomModelDialogControllerProps) {
  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <AddCustomModelDialog {...dialogProps} onAdded={closeDialog} />
      )}
    >
      {children}
    </DialogController>
  );
}
