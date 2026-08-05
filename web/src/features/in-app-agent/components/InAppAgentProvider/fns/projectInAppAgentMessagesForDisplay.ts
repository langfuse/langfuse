import { type InAppAiAgentMessage } from "@/src/features/in-app-agent/components/ControlledInAppAgentWindow/fns/getDrawerMessages";
import {
  type InAppAgentDisplayPlacement,
  type InAppAgentDisplayState,
} from "@/src/features/in-app-agent/components/InAppAgentProvider/InAppAiAgentProvider";
import {
  IN_APP_AGENT_REDIRECT_TOOL_NAME,
  type AgUiMessage,
} from "@langfuse/shared/in-app-agent";

export function projectInAppAgentMessagesForDisplay(
  messages: AgUiMessage[],
  state: InAppAgentDisplayState,
) {
  // Canonical messages stay untouched for persistence and subsequent runs.
  const messageIds = new Set(messages.map((message) => message.id));
  const placementsByAnchor = new Map<
    string,
    Array<{ order: number; message: AgUiMessage }>
  >();

  const addPlacement = (
    placement: InAppAgentDisplayPlacement,
    message: AgUiMessage,
  ) => {
    if (!messageIds.has(placement.anchorMessageId)) {
      return;
    }

    placementsByAnchor.set(
      placement.anchorMessageId,
      (placementsByAnchor.get(placement.anchorMessageId) ?? []).concat({
        order: placement.order,
        message,
      }),
    );
  };

  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }

    for (const toolCall of message.toolCalls ?? []) {
      const placement = state.toolCallPlacements[toolCall.id];
      if (
        !placement ||
        toolCall.function.name === IN_APP_AGENT_REDIRECT_TOOL_NAME
      ) {
        continue;
      }

      addPlacement(placement, {
        id: `display-tool-${toolCall.id}`,
        role: "assistant",
        content: "",
        toolCalls: [toolCall],
      });
    }
  }

  for (const [sourceMessageId, textState] of Object.entries(
    state.textByMessageId,
  )) {
    const sourceMessage = messages.find(
      (message) =>
        message.role === "assistant" && message.id === sourceMessageId,
    );

    for (const segment of textState.segments) {
      addPlacement(segment, {
        id: segment.id,
        role: "assistant",
        content: segment.content,
        ...(sourceMessage?.role === "assistant"
          ? {
              runId: sourceMessage.runId,
              feedback: sourceMessage.feedback,
              feedbackMessageId: sourceMessage.id,
            }
          : {}),
      });
    }
  }

  return messages.flatMap<InAppAiAgentMessage>((message) => {
    const projectedMessage =
      message.role === "assistant"
        ? {
            ...message,
            content:
              state.textByMessageId[message.id]?.nativeContent ??
              message.content,
            toolCalls: message.toolCalls?.filter((toolCall) => {
              const placement = state.toolCallPlacements[toolCall.id];
              return (
                toolCall.function.name === IN_APP_AGENT_REDIRECT_TOOL_NAME ||
                !placement ||
                !messageIds.has(placement.anchorMessageId)
              );
            }),
          }
        : message;

    const placements = placementsByAnchor.get(message.id);
    if (!placements) {
      return [projectedMessage];
    }

    return [
      projectedMessage,
      ...placements
        .sort((left, right) => left.order - right.order)
        .map(({ message: placedMessage }) => placedMessage),
    ];
  });
}
