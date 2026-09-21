import { z } from "zod";

import {
  IN_APP_AGENT_REDIRECT_TOOL_NAME,
  type AgUiMessage,
} from "@langfuse/shared/in-app-agent";
import type { InAppAgentUiMessage } from "../schema";

/**
 * Rendering-only derivation of the persisted event log. The canonical messages
 * stay untouched; this state records where interleaved reasoning and tool calls
 * landed so the projection can reproduce that ordering. It lives in web because
 * only the browser renders — the worker never does.
 *
 * The state is produced twice from the same events: once on the web server when
 * building a conversation snapshot, and once incrementally on the client as
 * live events arrive. Both use these same functions, so the two agree.
 */

type InAppAgentDisplayPlacement = {
  anchorMessageId: string;
  order: number;
};

export type InAppAgentDisplayState = {
  latestPlacement: InAppAgentDisplayPlacement | null;
  nativeToolCallParentMessageId: string | null;
  latestNewMessageId: string | null;
  nextOrder: number;
  /** Message id to when this client first saw it. Doubles as the processed-id
   * ledger: a key exists exactly when the message has been recorded. */
  messageTimestamps: Record<string, number>;
  textByMessageId: Record<
    string,
    {
      nativeContent: string;
      publishedContent: string;
      segments: Array<
        InAppAgentDisplayPlacement & {
          id: string;
          content: string;
          timestamp?: number;
        }
      >;
    }
  >;
  toolCallPlacements: Record<string, InAppAgentDisplayPlacement | null>;
};

type InAppAgentDisplayMessage = InAppAgentUiMessage & {
  feedbackMessageId?: string;
  timestamp?: number;
};

type InAppAgentToolCall = NonNullable<
  Extract<AgUiMessage, { role: "assistant" }>["toolCalls"]
>[number];

const InAppAgentDisplayPlacementSchema = z.object({
  anchorMessageId: z.string(),
  order: z.number(),
});

/**
 * Wire form of {@link InAppAgentDisplayState}. Validated rather than relying on
 * the tRPC transformer so the contract stays explicit and transport-independent.
 * Nothing stores it: the server rebuilds the state from the event log on every
 * conversation fetch, so the only skew to survive is a rolling deploy.
 *
 * The sidecar duplicates assistant text, and `publishedContent` is always
 * `nativeContent` plus every segment's content joined in order, so it could be
 * dropped from the wire and recomputed on deserialize. Measured overhead on a
 * large real conversation is ~12% of the message payload, because tool results
 * dominate and are never duplicated here, so that optimization is not worth
 * its invariant today.
 */
const SerializedInAppAgentDisplayStateSchema = z.object({
  latestPlacement: InAppAgentDisplayPlacementSchema.nullable(),
  nativeToolCallParentMessageId: z.string().nullable(),
  latestNewMessageId: z.string().nullable(),
  nextOrder: z.number(),
  // Superseded by messageTimestamps' keys. Still written so a tab holding the
  // previous bundle keeps parsing this payload across a rolling deploy;
  // ignored on read and removable a release later.
  seenMessageIds: z.array(z.string()).optional(),
  messageTimestamps: z.record(z.string(), z.number()).default({}),
  textByMessageId: z.record(
    z.string(),
    z.object({
      nativeContent: z.string(),
      publishedContent: z.string(),
      segments: z.array(
        InAppAgentDisplayPlacementSchema.extend({
          id: z.string(),
          content: z.string(),
          timestamp: z.number().optional(),
        }),
      ),
    }),
  ),
  toolCallPlacements: z.record(
    z.string(),
    InAppAgentDisplayPlacementSchema.nullable(),
  ),
});

export type SerializedInAppAgentDisplayState = z.infer<
  typeof SerializedInAppAgentDisplayStateSchema
>;

export function serializeInAppAgentDisplayState(
  state: InAppAgentDisplayState,
): SerializedInAppAgentDisplayState {
  return { ...state, seenMessageIds: Object.keys(state.messageTimestamps) };
}

export function deserializeInAppAgentDisplayState(
  serialized: unknown,
): InAppAgentDisplayState {
  const parsed = SerializedInAppAgentDisplayStateSchema.safeParse(serialized);
  if (!parsed.success) {
    return createInAppAgentDisplayState();
  }

  const { seenMessageIds: _legacySeenMessageIds, ...state } = parsed.data;
  return state;
}

export function createInAppAgentDisplayState(): InAppAgentDisplayState {
  return {
    latestPlacement: null,
    nativeToolCallParentMessageId: null,
    latestNewMessageId: null,
    nextOrder: 0,
    messageTimestamps: {},
    textByMessageId: {},
    toolCallPlacements: {},
  };
}

export function recordInAppAgentMessagesForDisplay(
  state: InAppAgentDisplayState,
  messages: readonly AgUiMessage[],
  observedAt = Date.now(),
): InAppAgentDisplayState {
  const messageTimestamps = { ...state.messageTimestamps };
  const textByMessageId = { ...state.textByMessageId };
  let latestNewMessageId = state.latestNewMessageId;
  let latestPlacement = state.latestPlacement;
  let nativeToolCallParentMessageId = state.nativeToolCallParentMessageId;
  let nextOrder = state.nextOrder;

  for (const message of messages) {
    if (message.id in messageTimestamps) {
      continue;
    }

    messageTimestamps[message.id] = observedAt;
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
      timestamp: observedAt,
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
    messageTimestamps,
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
  messages: readonly InAppAgentUiMessage[],
  state: InAppAgentDisplayState,
): InAppAgentDisplayMessage[] {
  // Canonical messages stay untouched for persistence and subsequent runs.
  const messageIds = new Set(messages.map((message) => message.id));
  const firstToolCallMessageIds = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }

    for (const toolCall of message.toolCalls ?? []) {
      if (
        toolCall.function.name !== IN_APP_AGENT_REDIRECT_TOOL_NAME &&
        !firstToolCallMessageIds.has(toolCall.id)
      ) {
        firstToolCallMessageIds.set(toolCall.id, message.id);
      }
    }
  }
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
        toolCall.function.name === IN_APP_AGENT_REDIRECT_TOOL_NAME ||
        firstToolCallMessageIds.get(toolCall.id) !== message.id
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
        timestamp: segment.timestamp,
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

  const isDuplicateToolCallForMessage = (
    toolCall: InAppAgentToolCall,
    messageId: string,
  ) =>
    toolCall.function.name !== IN_APP_AGENT_REDIRECT_TOOL_NAME &&
    firstToolCallMessageIds.get(toolCall.id) !== messageId;

  return messages.flatMap<InAppAgentDisplayMessage>((message) => {
    const projectedMessage: InAppAgentDisplayMessage =
      message.role === "assistant"
        ? {
            ...message,
            timestamp: state.messageTimestamps[message.id],
            content:
              state.textByMessageId[message.id]?.nativeContent ??
              message.content,
            toolCalls: message.toolCalls?.filter((toolCall) => {
              if (isDuplicateToolCallForMessage(toolCall, message.id)) {
                return false;
              }

              if (toolCall.function.name === IN_APP_AGENT_REDIRECT_TOOL_NAME) {
                return true;
              }

              const placement = state.toolCallPlacements[toolCall.id];
              return !placement || !messageIds.has(placement.anchorMessageId);
            }),
          }
        : // Reasoning is its own role here and starts most turns, so it carries
          // the timestamp the "Worked for" duration measures from.
          {
            ...message,
            timestamp: state.messageTimestamps[message.id],
          };
    const isEmptyDuplicateToolCallMessage =
      message.role === "assistant" &&
      projectedMessage.role === "assistant" &&
      !projectedMessage.content?.trim() &&
      Boolean(message.toolCalls?.length) &&
      message.toolCalls?.every((toolCall) =>
        isDuplicateToolCallForMessage(toolCall, message.id),
      );
    const projectedMessages = isEmptyDuplicateToolCallMessage
      ? []
      : [projectedMessage];
    const placements = placementsByAnchor.get(message.id);
    if (!placements) {
      return projectedMessages;
    }

    return [
      ...projectedMessages,
      ...placements
        .sort((left, right) => left.order - right.order)
        .map(({ message: placedMessage }) => placedMessage),
    ];
  });
}
