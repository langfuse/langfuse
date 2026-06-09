"use client";

import { useMemo } from "react";
import { z } from "zod";
import {
  InAppAgentWindow,
  type InAppAgentWindowMessage,
} from "./InAppAgentWindow";
import type { InAppAgentToolCallContent } from "./InAppAgentMessage";
import { useInAppAiAgent } from "./InAppAiAgentProvider";
import {
  AgUiMessageSchema,
  type AgUiMessage,
} from "@/src/features/in-app-agent/schema";

type ControlledInAppAgentWindowProps =
  | {
      isExpanded: boolean;
      showCloseButton: false;
      onExpandedChange: (isExpanded: boolean) => void;
      onClose?: () => void;
    }
  | {
      isExpanded: boolean;
      showCloseButton?: true;
      onExpandedChange: (isExpanded: boolean) => void;
      onClose: () => void;
    };

export function ControlledInAppAgentWindow(
  props: ControlledInAppAgentWindowProps,
) {
  const {
    conversations,
    error,
    hasMoreConversations,
    isLoadingMoreConversations,
    isRunning,
    isSelectedConversationHydrating,
    isSubmitting,
    loadMoreConversations,
    messages,
    selectConversation,
    selectedConversationId,
    submit,
  } = useInAppAiAgent();
  const isInputDisabled =
    isRunning || isSubmitting || isSelectedConversationHydrating;

  const drawerMessages = useMemo(() => {
    const parsedMessages = z.array(AgUiMessageSchema).parse(messages);
    const toolResults = getToolResultsByToolCallId(parsedMessages);

    const mappedMessages: InAppAgentWindowMessage[] = [];
    let pendingTools: InAppAgentToolCallContent[] = [];
    let pendingToolGroupId: string | null = null;
    const flushPendingTools = () => {
      if (pendingTools.length === 0) {
        return;
      }

      mappedMessages.push({
        id: pendingToolGroupId ?? "tools-pending",
        role: "assistant",
        content: { type: "toolGroup", tools: pendingTools },
      });
      pendingTools = [];
      pendingToolGroupId = null;
    };

    parsedMessages.forEach((message, index) => {
      if (
        message.role === "system" ||
        message.role === "developer" ||
        message.role === "tool" ||
        message.role === "activity"
      ) {
        return;
      }

      const role = message.role === "user" ? "user" : "assistant";
      const isLoading = message.role === "reasoning";

      if (isLoading) {
        flushPendingTools();

        const hasLaterAssistantMessage = parsedMessages.some(
          (message, messageIndex) =>
            messageIndex > index && message.role === "assistant",
        );

        if (!isRunning || hasLaterAssistantMessage) {
          return;
        }

        mappedMessages.push({
          id: message.id,
          role,
          content: { type: "loading" },
        });
        return;
      }

      const text =
        typeof message.content === "string"
          ? message.content
          : Array.isArray(message.content)
            ? message.content
                .flatMap((part) => (part.type === "text" ? [part.text] : []))
                .join("")
            : "";

      const toolContent =
        message.role === "assistant"
          ? (message.toolCalls?.map((toolCall): InAppAgentToolCallContent => {
              const result = toolResults.get(toolCall.id);

              return {
                type: "tool",
                name: toolCall.function.name,
                args: toolCall.function.arguments,
                ...(result?.content !== undefined
                  ? { result: result.content }
                  : {}),
                ...(result?.error !== undefined ? { error: result.error } : {}),
              };
            }) ?? [])
          : [];

      if (role === "assistant" && toolContent.length > 0 && !text.trim()) {
        pendingToolGroupId ??= `tools-${message.id}`;
        pendingTools.push(...toolContent);
        return;
      }

      flushPendingTools();

      if (role === "assistant" && !text.trim() && toolContent.length === 0) {
        return;
      }

      if (text.trim() || role === "user") {
        mappedMessages.push({
          id: message.id,
          role,
          content: {
            type: "text",
            text,
          },
        });
      }

      if (toolContent.length > 0) {
        mappedMessages.push({
          id: `${message.id}-tools`,
          role,
          content: { type: "toolGroup", tools: toolContent },
        });
      }
    });

    flushPendingTools();

    const latestUserMessageIndex = mappedMessages.findLastIndex(
      (message) => message.role === "user",
    );
    const latestAssistantMessageIndex = mappedMessages.findLastIndex(
      (message, index) =>
        index > latestUserMessageIndex && message.role === "assistant",
    );
    const latestAssistantMessage = mappedMessages[latestAssistantMessageIndex];

    // Insert an optimistic loading message
    if (
      isRunning &&
      !error &&
      latestUserMessageIndex >= 0 &&
      latestAssistantMessage?.content.type !== "text" &&
      latestAssistantMessage?.content.type !== "loading"
    ) {
      if (latestAssistantMessage?.content.type === "toolGroup") {
        // Set the tool group message to loading state
        return mappedMessages.map((message, index) =>
          index === latestAssistantMessageIndex
            ? {
                ...message,
                content: { ...latestAssistantMessage.content, isLoading: true },
              }
            : message,
        );
      }

      const hasAssistantAnswer = mappedMessages.some(
        (message) =>
          message.role === "assistant" && message.content.type === "text",
      );

      return [
        ...mappedMessages,
        {
          id: hasAssistantAnswer ? "loading" : "connecting",
          role: "assistant",
          content: hasAssistantAnswer
            ? { type: "loading" }
            : { type: "loading", label: "Connecting..." },
        } satisfies InAppAgentWindowMessage,
      ];
    }

    return mappedMessages;
  }, [error, isRunning, messages]);

  const closeButtonProps =
    props.showCloseButton === false
      ? ({ showCloseButton: false } as const)
      : ({ showCloseButton: true, onClose: props.onClose } as const);

  return (
    <InAppAgentWindow
      error={error}
      isExpanded={props.isExpanded}
      isInputDisabled={isInputDisabled}
      messages={drawerMessages}
      conversations={conversations}
      hasMoreConversations={hasMoreConversations}
      isLoadingMoreConversations={isLoadingMoreConversations}
      selectedConversationId={selectedConversationId}
      onLoadMoreConversations={loadMoreConversations}
      onSelectConversation={selectConversation}
      onNewConversation={() => selectConversation(null)}
      onExpandedChange={props.onExpandedChange}
      onSubmit={submit}
      {...closeButtonProps}
    />
  );
}

function getToolResultsByToolCallId(messages: readonly AgUiMessage[]) {
  const results = new Map<string, Extract<AgUiMessage, { role: "tool" }>>();

  for (const message of messages) {
    if (message.role === "tool") {
      results.set(message.toolCallId, message);
    }
  }

  return results;
}
