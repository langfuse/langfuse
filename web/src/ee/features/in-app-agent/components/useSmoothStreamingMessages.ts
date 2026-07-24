import { useEffect, useEffectEvent, useReducer } from "react";

import type { InAppAgentPendingToolApproval } from "./InAppAiAgentProvider";
import { IN_APP_AGENT_REDIRECT_TOOL_NAME } from "@langfuse/shared/ee/in-app-agent";
import type { AgUiMessage } from "@langfuse/shared/ee/in-app-agent";
import { assertUnreachable } from "@/src/utils/types";

const FRAME_DURATION_MS = 40;
const DEFAULT_GRAPHEMES_PER_SECOND = 40;
const MIN_GRAPHEMES_PER_SECOND = 20;
const MAX_GRAPHEMES_PER_SECOND = 400;
const PACING_EMA_WEIGHT = 0.35;
const PACING_TARGET_UTILIZATION = 0.8;
const MAX_PACING_INCREASE_FACTOR = 1.2;
const MIN_SMOOTHED_GRAPHEMES = 16;
const TOOL_TRANSITION_INTERVAL_MS = 500;
const MIN_TOOL_RUNNING_DURATION_MS = 750;

type ToolDisplayState = Record<
  string,
  {
    visibleAtMs: number;
    terminalVisible: boolean;
    order: number;
  }
>;

type SmoothStreamingState = {
  displayedMessages: AgUiMessage[];
  targetMessages: AgUiMessage[];
  liveMessageVersion: number;
  textPacingByMessageId: Record<
    string,
    {
      lastPublishedAtMs: number;
      graphemesPerSecond: number | null;
    }
  >;
  targetToolApprovals: InAppAgentPendingToolApproval[];
  displayedToolApprovals: InAppAgentPendingToolApproval[];
  toolDisplayById: ToolDisplayState;
  lastToolTransitionAtMs: number | null;
  nowMs: number;
  animation: {
    messageId: string;
    graphemeBudget: number;
  } | null;
};

/**
 * Keeps canonical AG-UI messages untouched while exposing a paced display copy.
 * `liveMessageVersion` changes only for live stream publications, so hydrated
 * history appears immediately. The reducer owns display progress; effects only
 * integrate it with the browser timer and visibility lifecycle.
 */
export function useSmoothStreamingMessages({
  messages,
  liveMessageVersion,
  pendingToolApprovals,
  shouldFlush,
}: {
  messages: AgUiMessage[];
  liveMessageVersion: number;
  pendingToolApprovals: InAppAgentPendingToolApproval[];
  shouldFlush: boolean;
}) {
  const [state, dispatch] = useReducer(
    smoothStreamingReducer,
    { messages, liveMessageVersion },
    ({ messages: initialMessages, liveMessageVersion: initialVersion }) => {
      const initialSnapshot = snapshotMessages(initialMessages);
      const initialToolDisplay = createImmediateToolDisplay(
        initialSnapshot,
        pendingToolApprovals,
      );

      return {
        displayedMessages: initialSnapshot,
        targetMessages: initialSnapshot,
        liveMessageVersion: initialVersion,
        textPacingByMessageId: {},
        targetToolApprovals: pendingToolApprovals,
        displayedToolApprovals: pendingToolApprovals,
        toolDisplayById: initialToolDisplay,
        lastToolTransitionAtMs: null,
        nowMs: performance.now(),
        animation: null,
      } satisfies SmoothStreamingState;
    },
  );

  const canAnimate = useEffectEvent(
    () =>
      !shouldFlush &&
      document.visibilityState === "visible" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    dispatch({
      type: "enqueue",
      messages,
      liveMessageVersion,
      pendingToolApprovals,
      canAnimate: canAnimate(),
      publishedAtMs: performance.now(),
    });
  }, [liveMessageVersion, messages, pendingToolApprovals]);

  const animation = state.animation;
  const nextToolTransitionAtMs = getNextToolTransitionAtMs(state);
  useEffect(() => {
    if (animation === null && nextToolTransitionAtMs === null) {
      return;
    }

    const delayMs =
      animation === null && nextToolTransitionAtMs !== null
        ? Math.max(0, nextToolTransitionAtMs - performance.now())
        : FRAME_DURATION_MS;
    const timeoutId = window.setTimeout(() => {
      dispatch({
        type: canAnimate() ? "tick" : "finish",
        nowMs: performance.now(),
      });
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [animation, nextToolTransitionAtMs]);

  const isAnimating = animation !== null || nextToolTransitionAtMs !== null;
  useEffect(() => {
    if (!isAnimating) {
      return;
    }

    const handleVisibilityChange = () => {
      if (!canAnimate()) {
        dispatch({ type: "finish", nowMs: performance.now() });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAnimating]);

  const activeMessageId = animation?.messageId ?? null;
  const projectedMessages = projectToolMessages(
    state.displayedMessages,
    state.toolDisplayById,
  );
  const runningToolCallIds = getRunningToolCallIds(state.toolDisplayById);

  return {
    isAnimating,
    pendingToolApprovals: state.displayedToolApprovals,
    runningToolCallIds,
    messages:
      activeMessageId === null
        ? projectedMessages
        : projectedMessages.map((message) =>
            message.id === activeMessageId
              ? { ...message, isLoading: true }
              : message,
          ),
  };
}

type SmoothStreamingAction =
  | {
      type: "enqueue";
      messages: AgUiMessage[];
      liveMessageVersion: number;
      pendingToolApprovals: InAppAgentPendingToolApproval[];
      canAnimate: boolean;
      publishedAtMs: number;
    }
  | { type: "tick"; nowMs: number }
  | { type: "finish"; nowMs: number };

function smoothStreamingReducer(
  state: SmoothStreamingState,
  action: SmoothStreamingAction,
) {
  if (action.type === "enqueue") {
    return enqueueStreamingUpdate(state, action);
  }

  if (action.type === "tick") {
    const nextState = {
      ...state,
      nowMs: action.nowMs,
    };
    const nextTextState = nextState.animation
      ? advanceStreamingFrame(nextState)
      : nextState;

    return nextTextState.animation === null
      ? applyNextToolTransition(nextTextState, action.nowMs)
      : nextTextState;
  }

  if (action.type === "finish") {
    return flushStreaming(state, action.nowMs);
  }

  return assertUnreachable(action);
}

function enqueueStreamingUpdate(
  state: SmoothStreamingState,
  action: Extract<SmoothStreamingAction, { type: "enqueue" }>,
) {
  const nextMessages = snapshotMessages(action.messages);
  const isLivePublication =
    action.liveMessageVersion !== state.liveMessageVersion;
  const isLoadingOnlyUpdate =
    !isLivePublication &&
    areMessagesEqualExceptLoading(state.targetMessages, nextMessages);
  const publishedTexts = isLivePublication
    ? findPublishedTexts(state.targetMessages, nextMessages)
    : [];
  const nextState = {
    ...state,
    targetMessages: nextMessages,
    liveMessageVersion: action.liveMessageVersion,
    targetToolApprovals: action.pendingToolApprovals,
    displayedToolApprovals: mergeDisplayedToolApprovals(
      state.displayedToolApprovals,
      action.pendingToolApprovals,
    ),
    nowMs: action.publishedAtMs,
    textPacingByMessageId: isLivePublication
      ? updateTextPacing(
          state.textPacingByMessageId,
          publishedTexts,
          nextMessages,
          action.publishedAtMs,
        )
      : state.textPacingByMessageId,
  };
  const nextTextState = updateTextStreaming(
    nextState,
    publishedTexts,
    action.canAnimate,
  );
  const approvalsChanged = !areToolApprovalsEqual(
    state.targetToolApprovals,
    action.pendingToolApprovals,
  );

  if (
    !action.canAnimate ||
    (!isLivePublication &&
      !isLoadingOnlyUpdate &&
      !approvalsChanged &&
      nextTextState.animation === null)
  ) {
    return flushStreaming(nextTextState, action.publishedAtMs);
  }

  if (nextTextState.animation !== null) {
    return nextTextState;
  }

  return applyNextToolTransition(nextTextState, action.publishedAtMs);
}

function updateTextStreaming(
  state: SmoothStreamingState,
  publishedTexts: ReturnType<typeof findPublishedTexts>,
  canAnimate: boolean,
) {
  const appendedText = publishedTexts.find(
    (
      publishedText,
    ): publishedText is { messageId: string; appendedText: string } =>
      typeof publishedText.appendedText === "string" &&
      publishedText.appendedText.length > 0,
  );

  if (!appendedText) {
    return state.animation === null ? finishTextStreaming(state) : state;
  }

  if (!canAnimate) {
    return finishTextStreaming(state);
  }

  if (state.animation !== null) {
    return state;
  }

  if (
    splitGraphemes(appendedText.appendedText).length < MIN_SMOOTHED_GRAPHEMES
  ) {
    return finishTextStreaming(state);
  }

  return advanceStreamingFrame({
    ...state,
    animation: {
      messageId: appendedText.messageId,
      graphemeBudget: 0,
    },
  });
}

function advanceStreamingFrame(state: SmoothStreamingState) {
  if (state.animation === null) {
    return state;
  }

  const pendingText = findPendingText(
    state.displayedMessages,
    state.targetMessages,
  );
  if (!pendingText) {
    return finishTextStreaming(state);
  }

  const remainingGraphemes = splitGraphemes(
    pendingText.targetText.slice(pendingText.displayedText.length),
  );
  const graphemeBudget =
    state.animation.graphemeBudget +
    (state.textPacingByMessageId[pendingText.targetMessage.id]
      ?.graphemesPerSecond ?? DEFAULT_GRAPHEMES_PER_SECOND) *
      (FRAME_DURATION_MS / 1_000);
  const graphemesThisFrame = Math.floor(graphemeBudget);
  const nextText =
    pendingText.displayedText +
    remainingGraphemes.slice(0, graphemesThisFrame).join("");

  if (nextText === pendingText.targetText) {
    const displayedMessages = state.targetMessages.slice(
      0,
      pendingText.targetIndex + 1,
    );
    const nextPendingText = findPendingText(
      displayedMessages,
      state.targetMessages,
    );

    if (!nextPendingText) {
      return finishTextStreaming(state);
    }

    return advanceStreamingFrame({
      ...state,
      displayedMessages,
      animation: {
        messageId: nextPendingText.targetMessage.id,
        graphemeBudget: 0,
      },
    });
  }

  return {
    ...state,
    displayedMessages: state.targetMessages
      .slice(0, pendingText.targetIndex)
      .concat(withTextContent(pendingText.targetMessage, nextText)),
    animation: {
      messageId: pendingText.targetMessage.id,
      graphemeBudget: graphemeBudget - graphemesThisFrame,
    },
  };
}

function finishTextStreaming(state: SmoothStreamingState) {
  return {
    ...state,
    displayedMessages: state.targetMessages,
    animation: null,
  };
}

function flushStreaming(state: SmoothStreamingState, nowMs: number) {
  const finishedTextState = finishTextStreaming(state);

  return {
    ...finishedTextState,
    displayedToolApprovals: state.targetToolApprovals,
    toolDisplayById: createImmediateToolDisplay(
      state.targetMessages,
      state.targetToolApprovals,
      nowMs,
    ),
    lastToolTransitionAtMs: null,
    nowMs,
  };
}

function getTargetTools(
  messages: AgUiMessage[],
  pendingToolApprovals: InAppAgentPendingToolApproval[],
) {
  const resultToolCallIds = new Set(
    messages.flatMap((message) =>
      message.role === "tool" ? [message.toolCallId] : [],
    ),
  );
  const approvalIds = new Set(
    pendingToolApprovals.map((approval) => approval.id),
  );
  const tools: Array<{
    id: string;
    isTerminal: boolean;
    order: number;
  }> = [];
  const seenToolCallIds = new Set<string>();

  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }

    for (const toolCall of message.toolCalls ?? []) {
      if (toolCall.function.name === IN_APP_AGENT_REDIRECT_TOOL_NAME) {
        continue;
      }

      seenToolCallIds.add(toolCall.id);
      tools.push({
        id: toolCall.id,
        isTerminal:
          resultToolCallIds.has(toolCall.id) ||
          (!isMessageLoading(message) && !approvalIds.has(toolCall.id)),
        order: tools.length,
      });
    }
  }

  for (const approval of pendingToolApprovals) {
    if (seenToolCallIds.has(approval.id)) {
      continue;
    }

    tools.push({
      id: approval.id,
      isTerminal: false,
      order: tools.length,
    });
  }

  return tools;
}

function createImmediateToolDisplay(
  messages: AgUiMessage[],
  pendingToolApprovals: InAppAgentPendingToolApproval[],
  visibleAtMs = 0,
) {
  const toolDisplayById: ToolDisplayState = {};

  for (const tool of getTargetTools(messages, pendingToolApprovals)) {
    toolDisplayById[tool.id] = {
      visibleAtMs,
      terminalVisible: tool.isTerminal,
      order: tool.order,
    };
  }

  return toolDisplayById;
}

function getToolTransitionCandidates(state: SmoothStreamingState) {
  const targetTools = getTargetTools(
    state.targetMessages,
    state.targetToolApprovals,
  );
  const targetToolsById = new Map(targetTools.map((tool) => [tool.id, tool]));
  const nextGlobalTransitionAtMs =
    state.lastToolTransitionAtMs === null
      ? state.nowMs
      : state.lastToolTransitionAtMs + TOOL_TRANSITION_INTERVAL_MS;
  const candidates: Array<{
    id: string;
    type: "appearance" | "terminal";
    dueAtMs: number;
    order: number;
  }> = [];

  for (const tool of targetTools) {
    if (!state.toolDisplayById[tool.id]) {
      candidates.push({
        id: tool.id,
        type: "appearance",
        dueAtMs: nextGlobalTransitionAtMs,
        order: tool.order,
      });
    }
  }

  for (const [toolCallId, display] of Object.entries(state.toolDisplayById)) {
    const targetTool = targetToolsById.get(toolCallId);
    if (!display.terminalVisible && (!targetTool || targetTool.isTerminal)) {
      candidates.push({
        id: toolCallId,
        type: "terminal",
        dueAtMs: Math.max(
          nextGlobalTransitionAtMs,
          display.visibleAtMs + MIN_TOOL_RUNNING_DURATION_MS,
        ),
        order: display.order,
      });
    }
  }

  return candidates;
}

function getNextToolTransitionAtMs(state: SmoothStreamingState) {
  const candidates = getToolTransitionCandidates(state);
  if (candidates.length === 0) {
    return null;
  }

  return Math.min(...candidates.map((candidate) => candidate.dueAtMs));
}

function applyNextToolTransition(state: SmoothStreamingState, nowMs: number) {
  const candidate = getToolTransitionCandidates(state)
    .filter((transition) => transition.dueAtMs <= nowMs)
    .sort((left, right) => left.order - right.order)[0];

  if (!candidate) {
    return state;
  }

  if (candidate.type === "appearance") {
    const targetTool = getTargetTools(
      state.targetMessages,
      state.targetToolApprovals,
    ).find((tool) => tool.id === candidate.id);
    if (!targetTool) {
      return state;
    }

    const approval = state.targetToolApprovals.find(
      (currentApproval) => currentApproval.id === candidate.id,
    );
    return {
      ...state,
      displayedToolApprovals:
        approval &&
        !state.displayedToolApprovals.some(
          (displayedApproval) => displayedApproval.id === approval.id,
        )
          ? state.displayedToolApprovals.concat(approval)
          : state.displayedToolApprovals,
      toolDisplayById: {
        ...state.toolDisplayById,
        [candidate.id]: {
          visibleAtMs: nowMs,
          terminalVisible: false,
          order: targetTool.order,
        },
      },
      lastToolTransitionAtMs: nowMs,
      nowMs,
    };
  }

  const display = state.toolDisplayById[candidate.id];
  if (!display) {
    return state;
  }

  return {
    ...state,
    displayedToolApprovals: state.displayedToolApprovals.filter(
      (approval) => approval.id !== candidate.id,
    ),
    toolDisplayById: {
      ...state.toolDisplayById,
      [candidate.id]: {
        ...display,
        terminalVisible: true,
      },
    },
    lastToolTransitionAtMs: nowMs,
    nowMs,
  };
}

function mergeDisplayedToolApprovals(
  displayedApprovals: InAppAgentPendingToolApproval[],
  targetApprovals: InAppAgentPendingToolApproval[],
) {
  const targetApprovalsById = new Map(
    targetApprovals.map((approval) => [approval.id, approval]),
  );

  return displayedApprovals.map(
    (approval) => targetApprovalsById.get(approval.id) ?? approval,
  );
}

function areToolApprovalsEqual(
  currentApprovals: InAppAgentPendingToolApproval[],
  nextApprovals: InAppAgentPendingToolApproval[],
) {
  return (
    currentApprovals.length === nextApprovals.length &&
    currentApprovals.every(
      (approval, index) =>
        approval.id === nextApprovals[index]?.id &&
        approval.status === nextApprovals[index]?.status,
    )
  );
}

function projectToolMessages(
  messages: AgUiMessage[],
  toolDisplayById: ToolDisplayState,
) {
  const knownToolCallIds = new Set(Object.keys(toolDisplayById));
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }

    for (const toolCall of message.toolCalls ?? []) {
      if (toolCall.function.name !== IN_APP_AGENT_REDIRECT_TOOL_NAME) {
        knownToolCallIds.add(toolCall.id);
      }
    }
  }

  return messages.flatMap<AgUiMessage>((message) => {
    if (message.role === "tool") {
      if (!knownToolCallIds.has(message.toolCallId)) {
        return [message];
      }

      return toolDisplayById[message.toolCallId]?.terminalVisible
        ? [message]
        : [];
    }

    if (message.role !== "assistant" || !message.toolCalls) {
      return [message];
    }

    const toolCalls = message.toolCalls.filter(
      (toolCall) =>
        toolCall.function.name === IN_APP_AGENT_REDIRECT_TOOL_NAME ||
        Boolean(toolDisplayById[toolCall.id]),
    );
    const hasPendingTool = message.toolCalls.some((toolCall) => {
      if (toolCall.function.name === IN_APP_AGENT_REDIRECT_TOOL_NAME) {
        return false;
      }

      return !toolDisplayById[toolCall.id]?.terminalVisible;
    });

    return [
      {
        ...message,
        toolCalls,
        ...(hasPendingTool ? { isLoading: true } : {}),
      },
    ];
  });
}

function getRunningToolCallIds(toolDisplayById: ToolDisplayState) {
  return Object.entries(toolDisplayById).flatMap(([toolCallId, display]) =>
    display.terminalVisible ? [] : [toolCallId],
  );
}

function isMessageLoading(message: AgUiMessage) {
  return "isLoading" in message && message.isLoading === true;
}

function snapshotMessages(messages: AgUiMessage[]) {
  // AG-UI may mutate message objects in place; snapshots keep reducer history
  // stable so appended text remains detectable on the next publication.
  return messages.map((message) => {
    if (message.role !== "assistant" || !message.toolCalls) {
      return { ...message };
    }

    return {
      ...message,
      toolCalls: message.toolCalls.map((toolCall) => ({
        ...toolCall,
        function: { ...toolCall.function },
      })),
    };
  });
}

function areMessagesEqualExceptLoading(
  currentMessages: AgUiMessage[],
  nextMessages: AgUiMessage[],
) {
  if (currentMessages.length !== nextMessages.length) {
    return false;
  }

  return currentMessages.every((message, index) => {
    const nextMessage = nextMessages[index];
    if (!nextMessage) {
      return false;
    }

    return (
      JSON.stringify(withoutLoadingState(message)) ===
      JSON.stringify(withoutLoadingState(nextMessage))
    );
  });
}

function withoutLoadingState(message: AgUiMessage) {
  const result: AgUiMessage & { isLoading?: boolean } = { ...message };
  delete result.isLoading;
  return result;
}

function getSmoothableText(message: AgUiMessage | undefined) {
  if (message?.role === "reasoning") {
    return message.content;
  }

  if (message?.role === "assistant" && typeof message.content === "string") {
    return message.content;
  }

  return null;
}

function findPublishedTexts(
  previousMessages: AgUiMessage[],
  nextMessages: AgUiMessage[],
) {
  const previousTextByMessageId = new Map(
    previousMessages.map((message) => [message.id, getSmoothableText(message)]),
  );
  const publishedTexts: Array<{
    messageId: string;
    appendedText: string | null;
  }> = [];

  for (const nextMessage of nextMessages) {
    const nextText = getSmoothableText(nextMessage);
    if (nextText === null) {
      continue;
    }

    const hasPreviousText = previousTextByMessageId.has(nextMessage.id);
    const previousText = previousTextByMessageId.get(nextMessage.id) ?? "";
    if (!hasPreviousText || nextText !== previousText) {
      publishedTexts.push({
        messageId: nextMessage.id,
        appendedText: nextText.startsWith(previousText)
          ? nextText.slice(previousText.length)
          : null,
      });
    }
  }

  return publishedTexts;
}

function updateTextPacing(
  currentPacing: SmoothStreamingState["textPacingByMessageId"],
  publishedTexts: ReturnType<typeof findPublishedTexts>,
  nextMessages: AgUiMessage[],
  publishedAtMs: number,
) {
  const nextPacing: SmoothStreamingState["textPacingByMessageId"] = {};
  const smoothableMessageIds = new Set(
    nextMessages.flatMap((message) =>
      getSmoothableText(message) === null ? [] : [message.id],
    ),
  );

  for (const messageId of smoothableMessageIds) {
    const pacing = currentPacing[messageId];
    if (pacing) {
      nextPacing[messageId] = pacing;
    }
  }

  for (const publishedText of publishedTexts) {
    const current = currentPacing[publishedText.messageId];
    const appendedGraphemes =
      publishedText.appendedText === null
        ? 0
        : splitGraphemes(publishedText.appendedText).length;
    const elapsedMs = current ? publishedAtMs - current.lastPublishedAtMs : 0;
    let graphemesPerSecond = current?.graphemesPerSecond ?? null;

    if (appendedGraphemes > 0 && elapsedMs > 0) {
      const targetRate = Math.min(
        MAX_GRAPHEMES_PER_SECOND,
        Math.max(
          MIN_GRAPHEMES_PER_SECOND,
          appendedGraphemes * (1_000 / elapsedMs) * PACING_TARGET_UTILIZATION,
        ),
      );
      if (graphemesPerSecond === null) {
        graphemesPerSecond = targetRate;
      } else {
        const smoothedRate =
          graphemesPerSecond * (1 - PACING_EMA_WEIGHT) +
          targetRate * PACING_EMA_WEIGHT;
        graphemesPerSecond = Math.min(
          smoothedRate,
          graphemesPerSecond * MAX_PACING_INCREASE_FACTOR,
        );
      }
    }

    nextPacing[publishedText.messageId] = {
      lastPublishedAtMs: publishedAtMs,
      graphemesPerSecond,
    };
  }

  return nextPacing;
}

function findPendingText(
  displayedMessages: AgUiMessage[],
  targetMessages: AgUiMessage[],
) {
  const displayedTextByMessageId = new Map(
    displayedMessages.map((message) => [
      message.id,
      getSmoothableText(message),
    ]),
  );

  for (const [targetIndex, targetMessage] of targetMessages.entries()) {
    const targetText = getSmoothableText(targetMessage);
    if (targetText === null) {
      continue;
    }

    const displayedText = displayedTextByMessageId.get(targetMessage.id) ?? "";
    if (
      targetText.startsWith(displayedText) &&
      targetText.length > displayedText.length
    ) {
      return {
        targetIndex,
        targetMessage,
        targetText,
        displayedText,
      };
    }
  }

  return null;
}

function withTextContent(message: AgUiMessage, content: string) {
  if (message.role === "reasoning" || message.role === "assistant") {
    return { ...message, content };
  }

  throw new Error("Only assistant and reasoning messages can be smoothed");
}

const graphemeSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function splitGraphemes(value: string) {
  if (!graphemeSegmenter) {
    return Array.from(value);
  }

  return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment);
}
