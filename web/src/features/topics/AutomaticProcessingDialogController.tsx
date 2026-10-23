import { useState, type ReactNode } from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { TOPICS_MODEL_SLOTS, type TopicRule } from "@langfuse/shared/topics";
import { api, type RouterOutputs } from "@/src/utils/api";
import { AutomaticProcessingDialog } from "./AutomaticProcessingDialog";
import { TOPIC_SETUP_BACKFILL_DAYS } from "./topic-setup-flow";

type StoredSettings = RouterOutputs["topics"]["modelSettings"];

type AutomaticProcessingSettings = {
  projectId: string;
  rule: TopicRule | null;
  stored: StoredSettings | undefined;
  /** The write shared with "Keep off", so it outlives a close. */
  save: (input: { enabled: boolean; sampling: number }) => Promise<unknown>;
  saving: boolean;
};

type AutomaticProcessingDialogControllerProps = AutomaticProcessingSettings & {
  children: (control: {
    openDialog: (initialEnabled: boolean) => void;
  }) => ReactNode;
};

/** Finished traces per day over the backfill window; null until counted. */
function useDailyTraceEstimate(projectId: string) {
  const counts = api.topics.setupTraceCounts.useQuery(
    { projectId },
    { retry: false },
  );
  return counts.data
    ? counts.data.finished7d / TOPIC_SETUP_BACKFILL_DAYS
    : null;
}

function AutomaticProcessingDialogContent({
  closeDialog,
  projectId,
  initialEnabled,
  rule,
  save,
  saving,
  stored,
}: AutomaticProcessingSettings & {
  closeDialog: () => void;
  initialEnabled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const dailyTraces = useDailyTraceEstimate(projectId);
  const submit = (input: { enabled: boolean; sampling: number }) => {
    setError(null);
    save(input)
      .then(closeDialog)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not save auto-analyze.",
        ),
      );
  };

  return (
    <AutomaticProcessingDialog
      initialEnabled={initialEnabled}
      initialSampling={rule?.sampling ?? 1}
      dailyTraces={dailyTraces}
      missingModel={TOPICS_MODEL_SLOTS.some((slot) => !stored?.[slot]?.model)}
      saving={saving}
      error={error}
      onSave={submit}
    />
  );
}

/**
 * Owns the Analyze traces dialog. Wrap the shared parent and pass
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
