import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { getEvaluatorBlockMetadata } from "@langfuse/shared";
import { type TopicRule } from "@langfuse/shared/topics";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  AutomaticProcessingControl,
  type AutomaticProcessingState,
} from "./AutomaticProcessingControl";
import { AutomaticProcessingDialog } from "./AutomaticProcessingDialog";

type StoredSettings = RouterOutputs["topics"]["modelSettings"];

/**
 * The header control and dialog for automatic processing. `openEnable` lets
 * the paused notice open the same dialog.
 */
export function useAutomaticProcessing({
  canWrite,
  projectId,
  rule,
  stored,
  traceIdleMs,
}: {
  canWrite: boolean;
  projectId: string;
  rule: TopicRule | null;
  stored: StoredSettings | undefined;
  traceIdleMs: number | null;
}) {
  const utils = api.useUtils();
  // The switch's starting position while the dialog is open.
  const [dialog, setDialog] = useState<{ enabled: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutation = api.topics.setAutomaticProcessing.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.topics.modelSettings.invalidate({ projectId }),
        utils.topics.rules.invalidate({ projectId }),
      ]),
  });
  const state = automaticProcessingState(stored, rule);
  const paused =
    stored?.blockMessage && state.status === "paused"
      ? { shortLabel: state.shortLabel, message: stored.blockMessage }
      : null;
  const open = (enabled: boolean) => {
    setError(null);
    setDialog({ enabled });
  };
  const save = (input: { enabled: boolean; sampling: number }) => {
    setError(null);
    mutation
      .mutateAsync({ projectId, ...input })
      .then(() => setDialog(null))
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not save automatic processing.",
        ),
      );
  };

  const control = (
    <>
      <AutomaticProcessingControl
        state={state}
        canWrite={canWrite && !mutation.isPending}
        onOpen={() => open(state.status === "on")}
      />
      <DialogPrimitive.Root
        open={dialog !== null}
        onOpenChange={(next) => {
          if (!next) setDialog(null);
        }}
      >
        {dialog ? (
          <AutomaticProcessingDialog
            initialEnabled={dialog.enabled}
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
        ) : null}
      </DialogPrimitive.Root>
    </>
  );

  return {
    control,
    openEnable: () => open(true),
    clearPause: () => mutation.mutate({ projectId, enabled: false }),
  };
}

function automaticProcessingState(
  stored: StoredSettings | undefined,
  rule: TopicRule | null,
): AutomaticProcessingState {
  if (!stored || stored.enabled === null || !rule)
    return { status: "unconfigured" };
  if (!stored.processingAvailable) return { status: "unavailable" };
  if (stored.blockMessage)
    return {
      status: "paused",
      shortLabel: stored.blockReason
        ? getEvaluatorBlockMetadata(stored.blockReason).shortLabel
        : "Paused",
    };
  if (stored.enabled) return { status: "on" };
  return { status: "off" };
}
