import { type InAppAiAgentMessage } from "@/src/features/in-app-agent/components/ControlledInAppAgentWindow/fns/getDrawerMessages";
import {
  type InAppAgentSubmitOptions,
  type InAppAgentError,
} from "@/src/features/in-app-agent/types";
import {
  type InAppAgentToolApprovalRequest,
  type InAppAgentMessageFeedbackValue,
} from "@langfuse/shared/in-app-agent";
import { createContext, type Dispatch, type SetStateAction } from "react";

export type InAppAgentEntryPoint =
  | "top_nav"
  | "keyboard_shortcut"
  | "dashboard_widget";

export type InAppAgentPendingToolApproval = {
  id: string;
  approvalRequest: InAppAgentToolApprovalRequest;
  status: "pending" | "submitting";
};

export type InAppAiAgentConversation = {
  id: string;
  title: string | null;
  updatedAt: Date;
  isWriteLocked: boolean;
};

export type InAppAiAgentContextType = {
  isAvailable: boolean;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  /** Open the assistant from an entrypoint. Owns the AI-features gate: shows
   * the disabled dialog and returns false when the organization has AI
   * features turned off. */
  openAssistant: (source: InAppAgentEntryPoint) => boolean;
  isExpanded: boolean;
  setIsExpanded: Dispatch<SetStateAction<boolean>>;
  isRunning: boolean;
  isSubmitting: boolean;
  pendingToolApprovals: InAppAgentPendingToolApproval[];
  isSelectedConversationHydrating: boolean;
  error: InAppAgentError | null;
  messages: InAppAiAgentMessage[];
  liveMessageVersion: number;
  conversations: InAppAiAgentConversation[];
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  selectedConversationId: string | undefined;
  selectedConversationIsWriteLocked: boolean;
  loadMoreConversations: () => void;
  invalidateConversations: () => void;
  selectConversation: (conversationId: string | null) => void;
  deleteConversation: (conversationId: string) => Promise<void>;
  submit: (
    content: string,
    options?: InAppAgentSubmitOptions,
  ) => Promise<boolean>;
  approveToolCall: (approvalId: string) => Promise<void>;
  rejectToolCall: (approvalId: string) => Promise<void>;
  submitFeedback: (params: {
    messageId: string;
    runId: string;
    value: InAppAgentMessageFeedbackValue | null;
    comment?: string | null;
  }) => Promise<void>;
};

export const InAppAiAgentContext =
  createContext<InAppAiAgentContextType | null>(null);
