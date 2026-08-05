import {
  InAppAiAgentContext,
  type InAppAiAgentContextType,
} from "@/src/features/in-app-agent/components/InAppAgentProvider/InAppAiAgentProvider";
import { useContext } from "react";

const NOOP_CONTEXT: InAppAiAgentContextType = {
  isAvailable: false,
  open: false,
  setOpen: () => undefined,
  openAssistant: () => false,
  isExpanded: false,
  setIsExpanded: () => undefined,
  isRunning: false,
  isSubmitting: false,
  pendingToolApprovals: [],
  isSelectedConversationHydrating: false,
  error: null,
  messages: [],
  liveMessageVersion: 0,
  conversations: [],
  hasMoreConversations: false,
  isLoadingMoreConversations: false,
  selectedConversationId: undefined,
  selectedConversationIsWriteLocked: false,
  loadMoreConversations: () => undefined,
  invalidateConversations: () => undefined,
  selectConversation: () => undefined,
  deleteConversation: async () => undefined,
  submit: async () => false,
  approveToolCall: async () => undefined,
  rejectToolCall: async () => undefined,
  submitFeedback: async () => undefined,
};

export function useInAppAiAgent() {
  const ctx = useContext(InAppAiAgentContext);
  if (!ctx) {
    return NOOP_CONTEXT;
  }
  return ctx;
}
