import { getEvaluatorBlockMetadata } from "@langfuse/shared";
import { type TopicRule } from "@langfuse/shared/topics";
import { api, type RouterOutputs } from "@/src/utils/api";
import { type AutomaticProcessingState } from "./prepare-topics-actions";

type StoredSettings = RouterOutputs["topics"]["modelSettings"];

/**
 * Automatic processing status and its single write. The paused notice's
 * "Keep off" and the dialog's Save share it, so writes never overlap.
 */
export function useAutomaticProcessing({
  projectId,
  rule,
  stored,
}: {
  projectId: string;
  rule: TopicRule | null;
  stored: StoredSettings | undefined;
}) {
  const mutation = useSetAutomaticProcessing(projectId);
  return {
    state: automaticProcessingState(stored, rule),
    clearPause: () => mutation.mutate({ projectId, enabled: false }),
    save: (input: { enabled: boolean; sampling: number }) =>
      mutation.mutateAsync({ projectId, ...input }),
    saving: mutation.isPending,
  };
}

function useSetAutomaticProcessing(projectId: string) {
  const utils = api.useUtils();
  return api.topics.setAutomaticProcessing.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.topics.modelSettings.invalidate({ projectId }),
        utils.topics.rules.invalidate({ projectId }),
      ]),
  });
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
  if (stored.enabled) return { status: "on" };
  return { status: "off" };
}
