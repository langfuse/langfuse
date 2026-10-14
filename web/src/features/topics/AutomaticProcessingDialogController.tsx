import { useState, type ReactNode } from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { type TopicRule } from "@langfuse/shared/topics";
import { type RouterOutputs } from "@/src/utils/api";
import { AutomaticProcessingDialog } from "./AutomaticProcessingDialog";
import {
  automaticProcessingState,
  useSetAutomaticProcessing,
} from "./useAutomaticProcessing";

type StoredSettings = RouterOutputs["topics"]["modelSettings"];

type AutomaticProcessingSettings = {
  projectId: string;
  rule: TopicRule | null;
  stored: StoredSettings | undefined;
  traceIdleMs: number | null;
};

/**
 * Owns the automatic processing dialog. Wrap the shared parent and pass
 * `openDialog` to every opener, e.g. the header control and the paused notice.
 */
export function AutomaticProcessingDialogController({
  children,
  ...settings
}: AutomaticProcessingSettings & {
  children: (control: {
    openDialog: (initialEnabled: boolean) => void;
  }) => ReactNode;
}) {
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
  initialEnabled,
  projectId,
  rule,
  stored,
  traceIdleMs,
}: AutomaticProcessingSettings & {
  closeDialog: () => void;
  initialEnabled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useSetAutomaticProcessing(projectId);
  const state = automaticProcessingState(stored, rule);
  const paused =
    stored?.blockMessage && state.status === "paused"
      ? { shortLabel: state.shortLabel, message: stored.blockMessage }
      : null;
  const save = (input: { enabled: boolean; sampling: number }) => {
    setError(null);
    mutation
      .mutateAsync({ projectId, ...input })
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
      initialEnabled={initialEnabled}
      initialSampling={rule?.sampling ?? 1}
      traceIdleMs={traceIdleMs ?? 600_000}
      models={{
        summary: stored?.summary?.model ?? null,
        embedding: stored?.embedding?.model ?? null,
        clustering: stored?.clustering?.model ?? null,
      }}
      paused={paused}
      saving={mutation.isPending}
      error={error}
      onSave={save}
    />
  );
}
