// @vitest-environment node

import type { AgUiMessage } from "@langfuse/shared/in-app-agent";
import type { InAppAgentUiMessage } from "../schema";
import {
  createInAppAgentDisplayState,
  deserializeInAppAgentDisplayState,
  projectInAppAgentMessagesForDisplay,
  recordInAppAgentMessagesForDisplay,
  recordInAppAgentToolCallForDisplay,
} from "@/src/features/in-app-agent/lib/display";

const assistantToolMessage = {
  id: "assistant-tools",
  role: "assistant",
  content: "",
  toolCalls: ["tool-1", "tool-2", "tool-3"].map((toolCallId) => ({
    id: toolCallId,
    type: "function" as const,
    function: {
      name: `tool-${toolCallId}`,
      arguments: "{}",
    },
  })),
} satisfies AgUiMessage;

describe("in-app agent display projection", () => {
  it("keeps first-observed timestamps for canonical and projected text blocks", () => {
    const initialMessages = [
      { id: "user", role: "user", content: "Investigate this" },
      { id: "assistant", role: "assistant", content: "First answer." },
    ] satisfies AgUiMessage[];
    const messagesWithReasoning = [
      ...initialMessages,
      {
        id: "reasoning",
        role: "reasoning",
        content: "Another thought.",
      },
    ] satisfies AgUiMessage[];
    const finalMessages = messagesWithReasoning.map((message) =>
      message.id === "assistant"
        ? { ...message, content: "First answer. Second answer." }
        : message,
    );
    let displayState = createInAppAgentDisplayState();
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      initialMessages,
      1_000,
    );
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      messagesWithReasoning,
      2_000,
    );
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      finalMessages,
      3_000,
    );

    expect(
      projectInAppAgentMessagesForDisplay(finalMessages, displayState).map(
        (message) => ({ id: message.id, timestamp: message.timestamp }),
      ),
    ).toEqual([
      { id: "user", timestamp: 1_000 },
      { id: "assistant", timestamp: 1_000 },
      { id: "reasoning", timestamp: 2_000 },
      { id: "display-text-assistant-1", timestamp: 3_000 },
    ]);
  });

  it("still hydrates a payload from the bundle that sent seen ids separately", () => {
    const { messageTimestamps: _messageTimestamps, ...legacyState } = {
      ...createInAppAgentDisplayState(),
      seenMessageIds: ["assistant"],
    };

    expect(deserializeInAppAgentDisplayState(legacyState)).toEqual(
      createInAppAgentDisplayState(),
    );
  });

  it("keeps consecutive tool calls with the same parent together", () => {
    const assistantMessage = {
      id: "assistant-tools",
      role: "assistant",
      content: "I'll query both periods.",
    } satisfies AgUiMessage;
    const initialMessages = [
      {
        id: "user",
        role: "user",
        content: "Compare both weeks",
      },
      assistantMessage,
    ] satisfies InAppAgentUiMessage[];
    const messagesWithBothTools = [
      initialMessages[0],
      {
        ...assistantMessage,
        toolCalls: assistantToolMessage.toolCalls.slice(0, 2),
      },
    ] satisfies AgUiMessage[];
    let displayState = createInAppAgentDisplayState();
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      initialMessages,
    );
    displayState = recordInAppAgentToolCallForDisplay(
      displayState,
      "tool-1",
      "assistant-tools",
    );
    displayState = recordInAppAgentToolCallForDisplay(
      displayState,
      "tool-2",
      "assistant-tools",
    );
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      messagesWithBothTools,
    );

    const projectedMessages = projectInAppAgentMessagesForDisplay(
      messagesWithBothTools,
      displayState,
    );

    expect(
      projectedMessages.map((message) => ({
        id: message.id,
        toolCallIds:
          message.role === "assistant"
            ? message.toolCalls?.map((toolCall) => toolCall.id)
            : undefined,
      })),
    ).toEqual([
      { id: "user", toolCallIds: undefined },
      { id: "assistant-tools", toolCallIds: ["tool-1", "tool-2"] },
    ]);
  });

  it("projects interleaved tools without changing canonical messages", () => {
    const messages = [
      {
        id: "user",
        role: "user",
        content: "Investigate this",
      },
      assistantToolMessage,
      {
        id: "result-tool-1",
        role: "tool",
        toolCallId: "tool-1",
        content: "done",
      },
      {
        id: "interleaved-assistant",
        role: "assistant",
        content: "Checking another angle.",
      },
      {
        id: "interleaved-reasoning",
        role: "reasoning",
        content: "I should run another tool.",
      },
    ] satisfies AgUiMessage[];
    let displayState = createInAppAgentDisplayState();
    displayState = recordInAppAgentMessagesForDisplay(displayState, [
      messages[0],
      {
        ...assistantToolMessage,
        toolCalls: [assistantToolMessage.toolCalls[0]],
      },
    ]);
    displayState = recordInAppAgentToolCallForDisplay(
      displayState,
      "tool-1",
      "assistant-tools",
    );
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      messages.slice(0, 4),
    );
    displayState = recordInAppAgentToolCallForDisplay(
      displayState,
      "tool-2",
      "assistant-tools",
    );
    displayState = recordInAppAgentMessagesForDisplay(displayState, messages);
    displayState = recordInAppAgentToolCallForDisplay(
      displayState,
      "tool-3",
      "assistant-tools",
    );

    const projectedMessages = projectInAppAgentMessagesForDisplay(
      messages,
      displayState,
    );

    expect(
      projectedMessages.map((message) => ({
        id: message.id,
        toolCallIds:
          message.role === "assistant"
            ? message.toolCalls?.map((toolCall) => toolCall.id)
            : undefined,
      })),
    ).toEqual([
      { id: "user", toolCallIds: undefined },
      { id: "assistant-tools", toolCallIds: ["tool-1"] },
      { id: "result-tool-1", toolCallIds: undefined },
      { id: "interleaved-assistant", toolCallIds: undefined },
      {
        id: "display-tool-tool-2",
        toolCallIds: ["tool-2"],
      },
      { id: "interleaved-reasoning", toolCallIds: undefined },
      {
        id: "display-tool-tool-3",
        toolCallIds: ["tool-3"],
      },
    ]);
    expect(
      assistantToolMessage.toolCalls.map((toolCall) => toolCall.id),
    ).toEqual(["tool-1", "tool-2", "tool-3"]);
  });

  it("splits text appended after a later reasoning message", () => {
    const firstMessages = [
      {
        id: "reasoning-1",
        role: "reasoning",
        content: "First thought.",
      },
      {
        id: "assistant-continuation",
        role: "assistant",
        content: "First answer.",
        runId: "run-1",
        feedback: { value: "thumbs_up", comment: null },
      },
    ] satisfies InAppAgentUiMessage[];
    const reasoningMessages = firstMessages.concat({
      id: "reasoning-2",
      role: "reasoning",
      content: "Second thought.",
    } satisfies AgUiMessage);
    const canonicalMessages = reasoningMessages.map((message) =>
      message.id === "assistant-continuation"
        ? { ...message, content: "First answer. Second answer." }
        : message,
    );
    let displayState = createInAppAgentDisplayState();
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      firstMessages,
    );
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      reasoningMessages,
    );
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      canonicalMessages,
    );
    const finalMessages = canonicalMessages.map((message) =>
      message.id === "assistant-continuation"
        ? { ...message, content: `${message.content} Third answer.` }
        : message,
    );
    displayState = recordInAppAgentMessagesForDisplay(
      displayState,
      finalMessages,
    );

    const projectedMessages = projectInAppAgentMessagesForDisplay(
      finalMessages,
      displayState,
    );

    expect(
      projectedMessages.map((message) => ({
        id: message.id,
        content: message.content,
        ...(message.role === "assistant"
          ? {
              runId: message.runId,
              feedback: message.feedback,
              feedbackMessageId: message.feedbackMessageId,
            }
          : {}),
      })),
    ).toEqual([
      { id: "reasoning-1", content: "First thought." },
      {
        id: "assistant-continuation",
        content: "First answer.",
        runId: "run-1",
        feedback: { value: "thumbs_up", comment: null },
        feedbackMessageId: undefined,
      },
      { id: "reasoning-2", content: "Second thought." },
      {
        id: "display-text-assistant-continuation-1",
        content: " Second answer. Third answer.",
        runId: "run-1",
        feedback: { value: "thumbs_up", comment: null },
        feedbackMessageId: "assistant-continuation",
      },
    ]);
    expect(canonicalMessages[1]?.content).toBe("First answer. Second answer.");
  });
});
