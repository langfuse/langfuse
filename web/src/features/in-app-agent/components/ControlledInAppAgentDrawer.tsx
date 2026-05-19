"use client";

import { useMemo } from "react";
import { z } from "zod";
import {
  InAppAgentDrawer,
  type InAppAgentDrawerMessage,
} from "./InAppAgentDrawer";
import { useInAppAiAgent } from "./InAppAiAgentProvider";
import { AgUiMessageSchema } from "@/src/features/in-app-agent/schema";

type ControlledInAppAgentDrawerProps =
  | {
      showCloseButton: false;
      onClose?: () => void;
    }
  | {
      showCloseButton?: true;
      onClose: () => void;
    };

export function ControlledInAppAgentDrawer(
  props: ControlledInAppAgentDrawerProps,
) {
  const { error, isRunning, messages, submit } = useInAppAiAgent();
  const drawerMessages = useMemo(() => {
    const parsedMessages = z.array(AgUiMessageSchema).parse(messages);

    const mappedMessages = parsedMessages.flatMap(
      (message, index): InAppAgentDrawerMessage[] => {
        if (message.role === "system" || message.role === "activity") {
          return [];
        }

        const role = message.role === "user" ? "user" : "assistant";
        const isLoading = message.role === "reasoning";

        if (isLoading) {
          const hasLaterAssistantMessage = parsedMessages.some(
            (message, messageIndex) =>
              messageIndex > index && message.role === "assistant",
          );

          if (!isRunning || hasLaterAssistantMessage) {
            return [];
          }

          return [
            {
              id: message.id,
              role,
              content: [{ type: "loading" }],
            },
          ];
        }

        const text =
          typeof message.content === "string"
            ? message.content
            : Array.isArray(message.content)
              ? message.content
                  .flatMap((part) => (part.type === "text" ? [part.text] : []))
                  .join("")
              : "";

        if (role === "assistant" && !text.trim()) {
          return [];
        }

        return [
          {
            id: message.id,
            role,
            content: [
              {
                type: "text",
                text,
              },
            ],
          },
        ];
      },
    );

    const lastMessage = mappedMessages.at(-1);
    const hasAssistantAnswer = mappedMessages.some(
      (message) =>
        message.role === "assistant" &&
        message.content.some((content) => content.type === "text"),
    );

    // Insert an optimistic loading message
    if (isRunning && !error && lastMessage?.role === "user") {
      return [
        ...mappedMessages,
        {
          id: hasAssistantAnswer ? "loading" : "connecting",
          role: "assistant",
          content: [
            hasAssistantAnswer
              ? { type: "loading" }
              : { type: "loading", label: "Connecting..." },
          ],
        } satisfies InAppAgentDrawerMessage,
      ];
    }

    return mappedMessages;
  }, [error, isRunning, messages]);

  const closeButtonProps =
    props.showCloseButton === false
      ? ({ showCloseButton: false } as const)
      : ({ showCloseButton: true, onClose: props.onClose } as const);

  return (
    <InAppAgentDrawer
      error={error}
      isRunning={isRunning}
      messages={drawerMessages}
      onSubmit={submit}
      {...closeButtonProps}
    />
  );
}
