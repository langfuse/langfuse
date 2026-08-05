import { type InAppAgentDisplayState } from "@/src/features/in-app-agent/components/InAppAgentProvider/InAppAiAgentProvider";

export function recordInAppAgentToolCallForDisplay(
  state: InAppAgentDisplayState,
  toolCallId: string,
  parentMessageId: string | undefined,
): InAppAgentDisplayState {
  if (toolCallId in state.toolCallPlacements) {
    return state;
  }

  const anchorMessageId =
    state.latestPlacement?.anchorMessageId ?? state.latestNewMessageId;
  const placement = anchorMessageId
    ? { anchorMessageId, order: state.nextOrder }
    : null;
  const isNativePlacement =
    (state.latestPlacement === null && anchorMessageId === parentMessageId) ||
    state.nativeToolCallParentMessageId === parentMessageId;

  return {
    ...state,
    latestPlacement: placement,
    nativeToolCallParentMessageId: isNativePlacement ? anchorMessageId : null,
    nextOrder: state.nextOrder + 1,
    toolCallPlacements: {
      ...state.toolCallPlacements,
      [toolCallId]: isNativePlacement ? null : placement,
    },
  };
}
