import { type InAppAgentDisplayState } from "@/src/features/in-app-agent/components/InAppAgentProvider/InAppAiAgentProvider";
import { type AgUiMessage } from "@langfuse/shared/in-app-agent";

export function recordInAppAgentMessagesForDisplay(
  state: InAppAgentDisplayState,
  messages: AgUiMessage[],
): InAppAgentDisplayState {
  const seenMessageIds = new Set(state.seenMessageIds);
  const textByMessageId = { ...state.textByMessageId };
  let latestNewMessageId = state.latestNewMessageId;
  let latestPlacement = state.latestPlacement;
  let nativeToolCallParentMessageId = state.nativeToolCallParentMessageId;
  let nextOrder = state.nextOrder;

  for (const message of messages) {
    if (seenMessageIds.has(message.id)) {
      continue;
    }

    seenMessageIds.add(message.id);
    latestNewMessageId = message.id;
    latestPlacement = null;
    nativeToolCallParentMessageId = null;

    if (message.role === "assistant" && typeof message.content === "string") {
      textByMessageId[message.id] = {
        nativeContent: message.content,
        publishedContent: message.content,
        segments: [],
      };
    }
  }

  for (const message of messages) {
    if (message.role !== "assistant" || typeof message.content !== "string") {
      continue;
    }

    const textState = textByMessageId[message.id];
    if (!textState || textState.publishedContent === message.content) {
      continue;
    }

    nativeToolCallParentMessageId = null;
    if (!message.content.startsWith(textState.publishedContent)) {
      textByMessageId[message.id] = {
        nativeContent: message.content,
        publishedContent: message.content,
        segments: [],
      };
      continue;
    }

    const appendedContent = message.content.slice(
      textState.publishedContent.length,
    );
    const latestSegment = textState.segments.at(-1);
    if (latestPlacement && latestSegment?.order === latestPlacement.order) {
      textByMessageId[message.id] = {
        ...textState,
        publishedContent: message.content,
        segments: textState.segments.slice(0, -1).concat({
          ...latestSegment,
          content: latestSegment.content + appendedContent,
        }),
      };
      continue;
    }

    if (latestNewMessageId === message.id && latestPlacement === null) {
      textByMessageId[message.id] = {
        ...textState,
        nativeContent: textState.nativeContent + appendedContent,
        publishedContent: message.content,
      };
      continue;
    }

    const anchorMessageId =
      latestPlacement?.anchorMessageId ?? latestNewMessageId;
    if (!anchorMessageId) {
      textByMessageId[message.id] = {
        ...textState,
        nativeContent: textState.nativeContent + appendedContent,
        publishedContent: message.content,
      };
      continue;
    }

    const placement = { anchorMessageId, order: nextOrder };
    const segment = {
      ...placement,
      id: `display-text-${message.id}-${textState.segments.length + 1}`,
      content: appendedContent,
    };
    nextOrder += 1;
    latestPlacement = placement;
    textByMessageId[message.id] = {
      ...textState,
      publishedContent: message.content,
      segments: textState.segments.concat(segment),
    };
  }

  return {
    ...state,
    latestPlacement,
    nativeToolCallParentMessageId,
    latestNewMessageId,
    nextOrder,
    seenMessageIds,
    textByMessageId,
  };
}
