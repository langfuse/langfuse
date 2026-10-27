import { useStore } from "zustand";

import type { MockStageChatStore } from "@/src/features/in-app-agent/stage/chat/mockStageChatStore";
import type {
  StageChatController,
  StageChatMessage,
} from "@/src/features/in-app-agent/stage/chat/types";

const NO_MESSAGES: StageChatMessage[] = [];

export function useMockStageChat(
  store: MockStageChatStore,
): StageChatController {
  const conversations = useStore(store, (state) => state.conversations);
  const activeConversationId = useStore(
    store,
    (state) => state.activeConversationId,
  );
  const isResponding = useStore(
    store,
    (state) => state.respondingMessageId !== null,
  );
  const actions = useStore(store, (state) => state.actions);

  return {
    backend: "mock",
    messages:
      conversations.find(
        (conversation) => conversation.id === activeConversationId,
      )?.messages ?? NO_MESSAGES,
    isResponding,
    blockedReason: null,
    conversations,
    activeConversationId,
    send: actions.send,
    stop: actions.stop,
    newConversation: actions.newConversation,
    selectConversation: actions.selectConversation,
  };
}
