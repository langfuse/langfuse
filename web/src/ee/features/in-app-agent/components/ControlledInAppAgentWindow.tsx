"use client";

import { useMemo } from "react";
import { useRouter } from "next/router";
import { InAppAgentWindow } from "./InAppAgentWindow";
import type { InAppAgentWindowConversation } from "./InAppAgentWindow";
import { useInAppAiAgent } from "./InAppAiAgentProvider";
import { getDrawerMessages } from "./utils/utils";
import { getInAppAgentScreenContextDescription } from "@/src/ee/features/in-app-agent/context";

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
  const router = useRouter();
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
    submit,
    submitFeedback,
  } = useInAppAiAgent();
  const isInputDisabled =
    isRunning ||
    isSubmitting ||
    isSelectedConversationHydrating ||
    pendingToolApprovals.length > 0;
  const screenContextDescription = useMemo(
    () => getInAppAgentScreenContextDescription(router.asPath),
    [router.asPath],
  );

  const drawerMessages = useMemo(
    () =>
      getDrawerMessages({
        error,
        isRunning,
        messages,
        pendingToolApprovals,
      }),
    [error, isRunning, messages, pendingToolApprovals],
  );

  const closeButtonProps =
    props.showCloseButton === false
      ? ({ showCloseButton: false } as const)
      : ({ showCloseButton: true, onClose: props.onClose } as const);

  return (
    <InAppAgentWindow
      error={error}
      isAssistantTurnInProgress={isRunning || pendingToolApprovals.length > 0}
      isHeaderDragHandleEnabled={props.isHeaderDragHandleEnabled}
      isExpanded={props.isExpanded}
      isInputDisabled={isInputDisabled}
      messages={drawerMessages}
      screenContextDescription={screenContextDescription}
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
