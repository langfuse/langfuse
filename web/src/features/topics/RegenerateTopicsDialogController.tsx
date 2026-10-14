import { type ComponentProps, type ReactNode, useState } from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { RegenerateTopicsDialog } from "./RegenerateTopicsDialog";
import {
  type RegenerateRequest,
  type RegenerateTopics,
} from "./useRegenerateTopics";

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
          <RegenerateTopicsDialogContent
            facets={regenerate.facets}
            timeRange={timeRange}
            lastRun={regenerate.lastRun}
            disabledReason={regenerate.disabledReason}
            isSubmitting={regenerate.isSubmitting}
            submit={regenerate.submit}
            onDone={(executionId) => {
              closeDialog();
              onTriggered(executionId);
            }}
          />
        )
      }
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}

function RegenerateTopicsDialogContent({
  submit,
  onDone,
  ...props
}: Omit<
  ComponentProps<typeof RegenerateTopicsDialog>,
  "error" | "onSubmit" | "onOpenRun"
> & {
  submit: (request: RegenerateRequest) => Promise<string>;
  onDone: (executionId: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <RegenerateTopicsDialog
      {...props}
      error={error}
      onSubmit={async (values) => {
        setError(null);
        try {
          onDone(await submit(values));
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not regenerate topics.",
          );
        }
      }}
      onOpenRun={onDone}
    />
  );
}
