import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { getEvaluatorBlockMetadata } from "@langfuse/shared";
import { type TopicRule } from "@langfuse/shared/topics";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  AutomaticProcessingMenu,
  type AutomaticProcessingState,
} from "./AutomaticProcessingMenu";
import { EnableAutomaticProcessingDialog } from "./EnableAutomaticProcessingDialog";

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
  const [dialog, setDialog] = useState<"enable" | "edit" | null>(null);
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
  const open = (next: "enable" | "edit") => {
    setError(null);
    setDialog(next);
  };
  const submit = (sampling: number) => {
    setError(null);
    mutation
      .mutateAsync({ projectId, enabled: true, sampling })
      .then(() => setDialog(null))
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not turn on automatic processing.",
        ),
      );
  };

  const control = (
    <>
      <AutomaticProcessingMenu
        state={state}
        canWrite={canWrite && !mutation.isPending}
        onEnable={() => open("enable")}
        onEditSampling={() => open("edit")}
        onTurnOff={() => mutation.mutate({ projectId, enabled: false })}
      />
      <DialogPrimitive.Root
        open={dialog !== null}
        onOpenChange={(next) => {
          if (!next) setDialog(null);
        }}
      >
        {dialog ? (
          <EnableAutomaticProcessingDialog
            key={dialog}
            mode={dialog}
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
            onSubmit={submit}
          />
        ) : null}
      </DialogPrimitive.Root>
    </>
  );

  return { control, openEnable: () => open("enable") };
}

function automaticProcessingState(
  stored: StoredSettings | undefined,
  rule: TopicRule | null,
): AutomaticProcessingState {
  if (!stored || stored.enabled === null || !rule)
    return { status: "unconfigured" };
  if (stored.blockMessage)
    return {
      status: "paused",
      shortLabel: stored.blockReason
        ? getEvaluatorBlockMetadata(stored.blockReason).shortLabel
        : "Paused",
    };
  if (stored.enabled) return { status: "on", sampling: rule.sampling };
  return { status: "off" };
}
