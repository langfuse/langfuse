import { createStore } from "zustand/vanilla";

import { buildMockAssistantReply } from "@/src/features/in-app-agent/stage/chat/buildMockAssistantReply";
import type {
  StageChatMessage,
  StageContextAttachment,
} from "@/src/features/in-app-agent/stage/chat/types";

type MockConversation = {
  id: string;
  title: string;
  messages: StageChatMessage[];
};

export type MockStageChatState = {
  conversations: MockConversation[];
  activeConversationId: string | null;
  respondingMessageId: string | null;
  actions: {
    send: (text: string, attachment: StageContextAttachment) => void;
    stop: () => void;
    newConversation: () => void;
    selectConversation: (conversationId: string) => void;
  };
};

export const MOCK_REPLY_TIMINGS = {
  thinkingMs: 700,
  wordIntervalMs: 28,
  wordsPerTick: 2,
} as const;

const TITLE_LENGTH = 60;

function titleFrom(text: string) {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > TITLE_LENGTH
    ? `${singleLine.slice(0, TITLE_LENGTH - 1)}…`
    : singleLine;
}

/**
 * Local stand-in for the assistant backend: keeps conversations for the app
 * session and streams a reply computed from the attached context.
 */
export function createMockStageChatStore(params: {
  createId: () => string;
  now: () => number;
}) {
  return createStore<MockStageChatState>()((set, get) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const updateMessage = (
      messageId: string,
      update: (message: StageChatMessage) => StageChatMessage,
    ) => {
      set((state) => ({
        conversations: state.conversations.map((conversation) => ({
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === messageId ? update(message) : message,
          ),
        })),
      }));
    };

    const finish = (messageId: string, text: string) => {
      clearTimer();
      updateMessage(messageId, (message) => ({
        ...message,
        content: { type: "text", text, isStreaming: false },
      }));
      set({ respondingMessageId: null });
    };

    const stream = (messageId: string, reply: string) => {
      const words = reply.split(/(?<=\s)/);
      let shown = 0;
      const tick = () => {
        shown = Math.min(words.length, shown + MOCK_REPLY_TIMINGS.wordsPerTick);
        const text = words.slice(0, shown).join("");
        if (shown >= words.length) {
          finish(messageId, text);
          return;
        }
        updateMessage(messageId, (message) => ({
          ...message,
          content: { type: "text", text, isStreaming: true },
        }));
        timer = setTimeout(tick, MOCK_REPLY_TIMINGS.wordIntervalMs);
      };
      timer = setTimeout(tick, MOCK_REPLY_TIMINGS.thinkingMs);
    };

    return {
      conversations: [],
      activeConversationId: null,
      respondingMessageId: null,
      actions: {
        send(text, attachment) {
          const question = text.trim();
          if (!question || get().respondingMessageId) {
            return;
          }
          const timestamp = params.now();
          const existing = get().conversations.find(
            (conversation) => conversation.id === get().activeConversationId,
          );
          const isFirstTurn = !existing || existing.messages.length === 0;
          const userMessage: StageChatMessage = {
            id: params.createId(),
            role: "user",
            timestamp,
            content: { type: "text", text: question },
            // The page is attached once, to the message that hands it over.
            ...(isFirstTurn ? { attachment } : {}),
          };
          const replyId = params.createId();
          const reply: StageChatMessage = {
            id: replyId,
            role: "assistant",
            timestamp,
            content: { type: "loading", label: "Reading the attached page" },
          };

          set((state) => {
            if (existing) {
              return {
                respondingMessageId: replyId,
                conversations: state.conversations.map((conversation) =>
                  conversation.id === existing.id
                    ? {
                        ...conversation,
                        messages: [
                          ...conversation.messages,
                          userMessage,
                          reply,
                        ],
                      }
                    : conversation,
                ),
              };
            }
            const conversation: MockConversation = {
              id: params.createId(),
              title: titleFrom(question),
              messages: [userMessage, reply],
            };
            return {
              respondingMessageId: replyId,
              activeConversationId: conversation.id,
              conversations: [conversation, ...state.conversations],
            };
          });

          stream(
            replyId,
            buildMockAssistantReply(question, attachment.context),
          );
        },
        stop() {
          const messageId = get().respondingMessageId;
          if (!messageId) {
            return;
          }
          const message = get()
            .conversations.flatMap((conversation) => conversation.messages)
            .find((candidate) => candidate.id === messageId);
          const text =
            message?.content.type === "text" ? message.content.text : "";
          finish(messageId, text || "_Stopped._");
        },
        newConversation() {
          get().actions.stop();
          set({ activeConversationId: null });
        },
        selectConversation(conversationId) {
          get().actions.stop();
          set({ activeConversationId: conversationId });
        },
      },
    };
  });
}

export type MockStageChatStore = ReturnType<typeof createMockStageChatStore>;
