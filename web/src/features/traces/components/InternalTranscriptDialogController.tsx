import { type ReactNode } from "react";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled";

export type TranscriptSource = {
  projectId: string;
  traceId: string;
  timestamp: Date;
};

/** Internal-only dialog for inspecting a trace's transcript; `openDialog` is undefined outside Internal view. */
export function InternalTranscriptDialogController({
  title,
  renderInspector,
  children,
  ...source
}: TranscriptSource & {
  title: string;
  renderInspector: (source: TranscriptSource) => ReactNode;
  children: (control: { openDialog: (() => void) | undefined }) => ReactNode;
}) {
  const internalFeaturesEnabled = useInternalFeaturesEnabled();
  if (!internalFeaturesEnabled) {
    return children({ openDialog: undefined });
  }

  return (
    <DialogController<TranscriptSource>
      renderDialog={({ state }) => (
        <Dialog title={title} size="lg" closeOnInteractionOutside>
          <Dialog.Body>
            <div className="ph-no-capture flex flex-col gap-4">
              {renderInspector(state)}
            </div>
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) => children({ openDialog: () => openDialog(source) })}
    </DialogController>
  );
}
