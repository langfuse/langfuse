import type { ReactNode } from "react";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { SetupInstructions } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/SetupInstructions";

type UsageInstructionsDialogControllerProps = {
  organizationId: string;
  children: (control: { openDialog: () => void }) => ReactNode;
};

export function UsageInstructionsDialogController({
  organizationId,
  children,
}: UsageInstructionsDialogControllerProps) {
  return (
    <DialogController
      renderDialog={() => (
        <Dialog title="Connect to the AI Gateway" size="md" closeLabel="Close">
          <Dialog.Body>
            <SetupInstructions
              organizationId={organizationId}
              defaultExpanded
            />
          </Dialog.Body>
        </Dialog>
      )}
    >
      {children}
    </DialogController>
  );
}
