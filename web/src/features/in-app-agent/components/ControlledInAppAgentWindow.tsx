"use client";

import { useMemo } from "react";
import { useRouter } from "next/router";
import { InAppAgentWindow } from "./InAppAgentWindow";
import type { InAppAgentWindowConversation } from "./InAppAgentWindow";
import { useInAppAiAgent } from "./InAppAiAgentProvider";
import { useSmoothStreamingMessages } from "./useSmoothStreamingMessages";
import { getDrawerMessages, withInterruptedRunNotices } from "./utils/utils";
import { getInAppAgentScreenContextDescription } from "@/src/features/in-app-agent/context";
import {
  getInAppAgentFocusedQuickActions,
  getInAppAgentQuickActionContext,
} from "@/src/features/in-app-agent/quickActions";

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
  const router = useRouter();
  const {
    conversations,
    error,
    hasMoreConversations,
    isLoadingMoreConversations,
    isRunning,
    isSelectedConversationHydrating,
    backgroundRunNotice,
    cancelRun,
    isCancellingRun,
    interruptedRuns,
    isSubmitting,
    invalidateConversations,
    loadMoreConversations,
    liveMessageVersion,
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
  const {
    isAnimating,
    messages: displayedMessages,
    pendingToolApprovals: displayedPendingToolApprovals,
    runningToolCallIds,
  } = useSmoothStreamingMessages({
    messages,
    liveMessageVersion,
    pendingToolApprovals,
    // Stop pacing the reveal once the user has asked the run to stop. The
    // background path delivers whole compacted blocks, so a backlog can easily
    // outlive the run itself — and watching buffered text keep typing out after
    // pressing stop reads as "cancel did nothing", even though the run is
    // already CANCELLED server-side.
    shouldFlush: error !== null || isCancellingRun,
  });
  const isInputDisabled =
    isRunning ||
    isAnimating ||
    isSubmitting ||
    selectedConversationIsWriteLocked ||
    isSelectedConversationHydrating ||
    pendingToolApprovals.length > 0;
  const displayError = selectedConversationIsWriteLocked
    ? ({
        type: "generic",
        message: SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE,
      } as const)
    : error;
  const screenContextDescription = useMemo(
    () => getInAppAgentScreenContextDescription(router.asPath),
    [router.asPath],
  );
  const quickActionContext = getInAppAgentQuickActionContext(router.asPath);
  const focusedQuickActions = getInAppAgentFocusedQuickActions(
    screenContextDescription.type,
  );
  // Strip query and hash so peek views and filter changes on the same page do
  // not reset the quick-action picker.
  const quickActionResetKey = router.asPath.replace(/[?#].*$/, "");

  const drawerMessages = useMemo(
    () =>
      withInterruptedRunNotices(
        getDrawerMessages({
          error,
          isRunning: isRunning || isAnimating,
          messages: displayedMessages,
          pendingToolApprovals: displayedPendingToolApprovals,
          runningToolCallIds,
        }),
        interruptedRuns,
      ),
    [
      displayedMessages,
      displayedPendingToolApprovals,
      error,
      interruptedRuns,
      isAnimating,
      isRunning,
      runningToolCallIds,
    ],
  );

  const closeButtonProps =
    props.showCloseButton === false
      ? ({ showCloseButton: false } as const)
      : ({ showCloseButton: true, onClose: props.onClose } as const);

  return (
    <InAppAgentWindow
      error={displayError}
      isAssistantTurnInProgress={
        isRunning || isAnimating || displayedPendingToolApprovals.length > 0
      }
      isHeaderDragHandleEnabled={props.isHeaderDragHandleEnabled}
      isExpanded={props.isExpanded}
      isInputDisabled={isInputDisabled}
      disablePendingToolApprovalActions={selectedConversationIsWriteLocked}
      messages={drawerMessages}
      quickActionContext={quickActionContext}
      focusedQuickActions={focusedQuickActions}
      quickActionResetKey={quickActionResetKey}
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
      backgroundRunNotice={backgroundRunNotice}
      isCancellingRun={isCancellingRun}
      onCancelRun={cancelRun}
      onApproveToolCall={approveToolCall}
      onRejectToolCall={rejectToolCall}
      onSubmitFeedback={submitFeedback}
      {...closeButtonProps}
    />
  );
}
