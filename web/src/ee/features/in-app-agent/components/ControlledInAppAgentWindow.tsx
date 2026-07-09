"use client";

import { useMemo } from "react";
import { InAppAgentWindow } from "./InAppAgentWindow";
import type { InAppAgentWindowConversation } from "./InAppAgentWindow";
import { useInAppAiAgent } from "./InAppAiAgentProvider";
import { getDrawerMessages } from "./utils/utils";

const SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE =
  "Sandbox-enabled conversations become read-only after 8 hours. Start a new conversation to continue.";

type ControlledInAppAgentWindowBaseProps = {
  isHeaderDragHandleEnabled?: boolean;
  isExpanded: boolean;
  onDeleteConversation: (conversation: InAppAgentWindowConversation) => void;
  onExpandedChange: (isExpanded: boolean) => void;
};

type ControlledInAppAgentWindowProps = ControlledInAppAgentWindowBaseProps &
  (
    | {
        showCloseButton: false;
        onClose?: () => void;
      }
    | {
        showCloseButton?: true;
        onClose: () => void;
      }
  );

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
    invalidateConversations,
    loadMoreConversations,
    messages,
    pendingToolApprovals,
    approveToolCall,
    rejectToolCall,
    selectConversation,
    selectedConversationId,
    selectedConversationIsWriteLocked,
    submit,
    submitFeedback,
  } = useInAppAiAgent();
  const isInputDisabled =
    isRunning ||
    isSubmitting ||
    selectedConversationIsWriteLocked ||
    isSelectedConversationHydrating ||
    pendingToolApprovals.length > 0;
  const displayError = selectedConversationIsWriteLocked
    ? SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE
    : error;

  const drawerMessages = useMemo(
    () =>
      getDrawerMessages({ error, isRunning, messages, pendingToolApprovals }),
    [error, isRunning, messages, pendingToolApprovals],
  );

  const closeButtonProps =
    props.showCloseButton === false
      ? ({ showCloseButton: false } as const)
      : ({ showCloseButton: true, onClose: props.onClose } as const);

  return (
    <InAppAgentWindow
      error={displayError}
      isHeaderDragHandleEnabled={props.isHeaderDragHandleEnabled}
      isExpanded={props.isExpanded}
      isInputDisabled={isInputDisabled}
      disablePendingToolApprovalActions={selectedConversationIsWriteLocked}
      messages={drawerMessages}
      conversations={conversations}
      hasMoreConversations={hasMoreConversations}
      isLoadingMoreConversations={isLoadingMoreConversations}
      selectedConversationId={selectedConversationId}
      onLoadMoreConversations={loadMoreConversations}
      onOpenConversationHistory={invalidateConversations}
      onDeleteConversation={props.onDeleteConversation}
      onSelectConversation={selectConversation}
      onNewConversation={() => {
        selectConversation(null);
      }}
      onExpandedChange={props.onExpandedChange}
      onSubmit={submit}
      onApproveToolCall={approveToolCall}
      onRejectToolCall={rejectToolCall}
      onSubmitFeedback={submitFeedback}
      {...closeButtonProps}
    />
  );
}
