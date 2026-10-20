import { useState, type ReactNode } from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { type TopicRule } from "@langfuse/shared/topics";
import { type RouterOutputs } from "@/src/utils/api";
import { AutomaticProcessingDialog } from "./AutomaticProcessingDialog";
import { automaticProcessingState } from "./useAutomaticProcessing";

type StoredSettings = RouterOutputs["topics"]["modelSettings"];

type AutomaticProcessingSettings = {
  projectId: string;
  rule: TopicRule | null;
  stored: StoredSettings | undefined;
  traceIdleMs: number | null;
  /** The write shared with "Keep off", so it outlives a close. */
  save: (input: { enabled: boolean; sampling: number }) => Promise<unknown>;
  saving: boolean;
};

type AutomaticProcessingDialogControllerProps = AutomaticProcessingSettings & {
  children: (control: {
    openDialog: (initialEnabled: boolean) => void;
  }) => ReactNode;
};

/**
 * Owns the automatic processing dialog. Wrap the shared parent and pass
 * `openDialog` to every opener, e.g. the header control and the paused notice.
 */
export function AutomaticProcessingDialogController({
  children,
  ...settings
}: AutomaticProcessingDialogControllerProps) {
  return (
    <DialogController<boolean>
      renderDialog={({ state, closeDialog }) => (
        <AutomaticProcessingDialogContent
          {...settings}
          initialEnabled={state}
          closeDialog={closeDialog}
        />
      )}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}

function AutomaticProcessingDialogContent({
  closeDialog,
  projectId,
  initialEnabled,
  rule,
  save,
  saving,
  stored,
  traceIdleMs,
}: AutomaticProcessingSettings & {
  closeDialog: () => void;
  initialEnabled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const state = automaticProcessingState(stored, rule);
  const paused =
    stored?.blockMessage && state.status === "paused"
      ? { shortLabel: state.shortLabel, message: stored.blockMessage }
      : null;
  const submit = (input: { enabled: boolean; sampling: number }) => {
    setError(null);
    save(input)
      .then(closeDialog)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not save automatic processing.",
        ),
      );
  };

  return (
    <AutomaticProcessingDialog
      projectId={projectId}
      initialEnabled={initialEnabled}
      initialSampling={rule?.sampling ?? 1}
      traceIdleMs={traceIdleMs ?? 600_000}
      models={{
        summary: stored?.summary?.model ?? null,
        embedding: stored?.embedding?.model ?? null,
        clustering: stored?.clustering?.model ?? null,
      }}
      paused={paused}
      saving={saving}
      error={error}
      onSave={submit}
    />
  );
}
