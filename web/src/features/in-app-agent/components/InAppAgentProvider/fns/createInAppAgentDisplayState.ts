import { type InAppAgentDisplayState } from "@/src/features/in-app-agent/components/InAppAgentProvider/InAppAiAgentProvider";

export function createInAppAgentDisplayState() {
  const state: InAppAgentDisplayState = {
    latestPlacement: null,
    nativeToolCallParentMessageId: null,
    latestNewMessageId: null,
    nextOrder: 0,
    seenMessageIds: new Set(),
    textByMessageId: {},
    toolCallPlacements: {},
  };

  return state;
}
