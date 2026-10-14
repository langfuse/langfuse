import { type ReactNode } from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { RegenerateTopicsDialog } from "./RegenerateTopicsDialog";
import { type RegenerateTopics } from "./useRegenerateTopics";

/**
 * Owns the Regenerate topics dialog. Wrap the shared parent and pass
 * `openDialog` to every opener, e.g. the header button and the mobile menu
 * row; the menu content unmounts on close, so keep the controller outside it.
 */
export function RegenerateTopicsDialogController({
  regenerate,
  onTriggered,
  children,
}: {
  regenerate: RegenerateTopics;
  onTriggered: (executionId: string) => void;
  children: (control: { openDialog: () => void }) => ReactNode;
}) {
  const { timeRange } = regenerate;
  return (
    <DialogController
      renderDialog={({ closeDialog }) =>
        timeRange && (
          <RegenerateTopicsDialog
            facets={regenerate.facets}
            timeRange={timeRange}
            lastRun={regenerate.lastRun}
            disabledReason={regenerate.disabledReason}
            isSubmitting={regenerate.isSubmitting}
            error={regenerate.error}
            onSubmit={async (values) => {
              const executionId = await regenerate.submit(values);
              if (executionId === null) return;
              closeDialog();
              onTriggered(executionId);
            }}
            onOpenRun={(executionId) => {
              closeDialog();
              onTriggered(executionId);
            }}
          />
        )
      }
    >
      {({ openDialog }) =>
        children({
          openDialog: () => {
            regenerate.clearError();
            openDialog();
          },
        })
      }
    </DialogController>
  );
}
