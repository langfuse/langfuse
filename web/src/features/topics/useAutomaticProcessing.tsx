import { getEvaluatorBlockMetadata } from "@langfuse/shared";
import { type TopicRule } from "@langfuse/shared/topics";
import { api, type RouterOutputs } from "@/src/utils/api";
import { type AutomaticProcessingState } from "./AutomaticProcessingControl";

type StoredSettings = RouterOutputs["topics"]["modelSettings"];

/**
 * Automatic processing status plus the paused notice's "Keep off" action.
 * `AutomaticProcessingDialogController` owns the dialog that turns it on.
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
    clearingPause: mutation.isPending,
  };
}

export function useSetAutomaticProcessing(projectId: string) {
  const utils = api.useUtils();
  return api.topics.setAutomaticProcessing.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.topics.modelSettings.invalidate({ projectId }),
        utils.topics.rules.invalidate({ projectId }),
      ]),
  });
}

export function automaticProcessingState(
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
  // Only turning on needs the allowlist, so a running setup can still be turned off.
  if (!stored.processingAvailable) return { status: "unavailable" };
  return { status: "off" };
}
