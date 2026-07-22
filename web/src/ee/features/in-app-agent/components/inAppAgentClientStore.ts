import { createStore, type StoreApi } from "zustand/vanilla";

import type {
  AgUiMessage,
  AgUiRunAgentInput,
  InAppAgentToolApprovalRequest,
} from "../schema";
import type { InAppAgentSubmitOptions } from "../quickActions";
import type { InAppAgentError } from "./utils/utils";

export type InAppAgentPendingToolApproval = {
  id: string;
  approvalRequest: InAppAgentToolApprovalRequest;
  status: "pending" | "submitting";
};

export const NEW_CONVERSATION_DRAFT_KEY = "__new_conversation__";

export type InAppAgentQueuedMessage = {
  id: string;
  content: string;
  context: AgUiRunAgentInput["context"];
  options?: InAppAgentSubmitOptions;
};

export type InAppAgentConversationClientState = {
  messages: AgUiMessage[];
  pendingToolApprovals: InAppAgentPendingToolApproval[];
  isRunning: boolean;
  isSubmitting: boolean;
  loadingEventIds: ReadonlySet<string>;
  error: InAppAgentError | null;
  liveMessageVersion: number;
  queuedMessages: InAppAgentQueuedMessage[];
  draft: string;
  unreadOutcome: "completed" | "failed" | null;
};

export const EMPTY_IN_APP_AGENT_CONVERSATION_STATE: InAppAgentConversationClientState =
  {
    messages: [],
    pendingToolApprovals: [],
    isRunning: false,
    isSubmitting: false,
    loadingEventIds: new Set(),
    error: null,
    liveMessageVersion: 0,
    queuedMessages: [],
    draft: "",
    unreadOutcome: null,
  };

type InAppAgentClientStoreState = {
  conversations: Record<string, InAppAgentConversationClientState>;
  localConversations: Record<
    string,
    { id: string; title: string | null; updatedAt: Date; isWriteLocked: false }
  >;
  actions: {
    updateConversation: (
      conversationId: string,
      update: (
        current: InAppAgentConversationClientState,
      ) => InAppAgentConversationClientState,
    ) => void;
    removeConversation: (conversationId: string) => void;
    rememberLocalConversation: (conversationId: string, title: string) => void;
  };
};

export type InAppAgentClientStore = StoreApi<InAppAgentClientStoreState>;

export function createInAppAgentClientStore(): InAppAgentClientStore {
  return createStore<InAppAgentClientStoreState>((set) => ({
    conversations: {},
    localConversations: {},
    actions: {
      updateConversation: (conversationId, update) => {
        set((state) => ({
          conversations: {
            ...state.conversations,
            [conversationId]: update(
              state.conversations[conversationId] ??
                EMPTY_IN_APP_AGENT_CONVERSATION_STATE,
            ),
          },
        }));
      },
      removeConversation: (conversationId) => {
        set((state) => {
          const conversations = { ...state.conversations };
          const localConversations = { ...state.localConversations };
          delete conversations[conversationId];
          delete localConversations[conversationId];
          return { conversations, localConversations };
        });
      },
      rememberLocalConversation: (conversationId, title) => {
        set((state) => ({
          localConversations: {
            ...state.localConversations,
            [conversationId]: {
              id: conversationId,
              title,
              updatedAt: new Date(),
              isWriteLocked: false,
            },
          },
        }));
      },
    },
  }));
}
