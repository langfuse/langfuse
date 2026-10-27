import { useMemo, useState } from "react";

import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { getDrawerMessages } from "@/src/features/in-app-agent/components/utils/utils";
import type {
  StageChatController,
  StageChatMessage,
  StageContextAttachment,
} from "@/src/features/in-app-agent/stage/chat/types";

type SentAttachment = { text: string; attachment: StageContextAttachment };

/**
 * The transcript keeps only text, so the page is re-attached for display to
 * the user message it was sent with, matched by content.
 */
function attachSentContext(
  messages: StageChatMessage[],
  sent: SentAttachment[],
): StageChatMessage[] {
  if (sent.length === 0) {
    return messages;
  }
  const remaining = [...sent];
  return messages.map((message) => {
    if (message.role !== "user" || message.content.type !== "text") {
      return message;
    }
    const text = message.content.text;
    const index = remaining.findIndex((candidate) => candidate.text === text);
    if (index === -1) {
      return message;
    }
    const [match] = remaining.splice(index, 1);
    return match ? { ...message, attachment: match.attachment } : message;
  });
}

function getBlockedReason(
  agent: ReturnType<typeof useInAppAiAgent>,
): string | null {
  if (agent.pendingToolApprovals.length > 0) {
    return "The assistant is waiting for a tool approval. Review it in the assistant window.";
  }
  if (agent.error?.type === "rate_limit") {
    return "You have reached the assistant's rate limit. Try again in a moment.";
  }
  return agent.error?.message ?? null;
}

/**
 * The live assistant behind the stage UI. Each stage session starts as a draft
 * that becomes a new conversation on the first send; the page snapshot rides
 * along as structured run context on every turn.
 */
export function useInAppAgentStageChat(): StageChatController {
  const agent = useInAppAiAgent();
  const [isDraft, setIsDraft] = useState(true);
  const [sentAttachments, setSentAttachments] = useState<SentAttachment[]>([]);

  const windowMessages = useMemo(
    () =>
      isDraft
        ? []
        : getDrawerMessages({
            error: null,
            isRunning: agent.isRunning,
            messages: agent.messages,
            pendingToolApprovals: agent.pendingToolApprovals,
          }),
    [agent.isRunning, agent.messages, agent.pendingToolApprovals, isDraft],
  );

  const blockedReason = getBlockedReason(agent);

  return {
    backend: "assistant",
    messages: attachSentContext(windowMessages, sentAttachments),
    isResponding: agent.isRunning || agent.isSubmitting,
    blockedReason,
    conversations: agent.conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
    })),
    activeConversationId: isDraft
      ? null
      : (agent.selectedConversationId ?? null),
    send(text, attachment) {
      const startsConversation = isDraft;
      agent
        .submit(text, {
          newConversation: startsConversation,
          entryPoint: "assistant-stage",
          pageContext: attachment.context,
        })
        .then((started) => {
          if (!started) {
            return;
          }
          setIsDraft(false);
          if (startsConversation) {
            setSentAttachments((current) => [...current, { text, attachment }]);
          }
        })
        .catch(() => undefined);
    },
    stop: agent.execution.run ? agent.execution.cancel : null,
    newConversation() {
      setIsDraft(true);
    },
    selectConversation(conversationId) {
      agent.selectConversation(conversationId);
      setIsDraft(false);
    },
  };
}
