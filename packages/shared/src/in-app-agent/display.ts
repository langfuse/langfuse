import { IN_APP_AGENT_REDIRECT_TOOL_NAME } from "./constants";
import type { AgUiMessage } from "./schema";

type InAppAgentDisplayPlacement = {
  anchorMessageId: string;
  order: number;
};

export type InAppAgentDisplayState = {
  latestPlacement: InAppAgentDisplayPlacement | null;
  nativeToolCallParentMessageId: string | null;
  latestNewMessageId: string | null;
  nextOrder: number;
  seenMessageIds: ReadonlySet<string>;
  textByMessageId: Record<
    string,
    {
      nativeContent: string;
      publishedContent: string;
      segments: Array<
        InAppAgentDisplayPlacement & {
          id: string;
          content: string;
        }
      >;
    }
  >;
  toolCallPlacements: Record<string, InAppAgentDisplayPlacement | null>;
};

type InAppAgentDisplayMessage = AgUiMessage & {
  feedbackMessageId?: string;
};

export function createInAppAgentDisplayState(): InAppAgentDisplayState {
  return {
    latestPlacement: null,
    nativeToolCallParentMessageId: null,
    latestNewMessageId: null,
    nextOrder: 0,
    seenMessageIds: new Set(),
    textByMessageId: {},
    toolCallPlacements: {},
  };
}

export function recordInAppAgentMessagesForDisplay(
  state: InAppAgentDisplayState,
  messages: readonly AgUiMessage[],
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

export function projectInAppAgentMessagesForDisplay(
  messages: readonly AgUiMessage[],
  state: InAppAgentDisplayState,
): InAppAgentDisplayMessage[] {
  // Canonical messages stay untouched for persistence and subsequent runs.
  const messageIds = new Set(messages.map((message) => message.id));
  const placementsByAnchor = new Map<
    string,
    Array<{ order: number; message: InAppAgentDisplayMessage }>
  >();

  const addPlacement = (
    placement: InAppAgentDisplayPlacement,
    message: InAppAgentDisplayMessage,
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

  return messages.flatMap<InAppAgentDisplayMessage>((message) => {
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
