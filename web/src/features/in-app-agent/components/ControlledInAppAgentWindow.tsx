"use client";

import { useMemo } from "react";
import { useRouter } from "next/router";
import {
  InAppAgentWindow,
  type InAppAgentWindowConversation,
  type InAppAgentWindowExecutionUi,
} from "./InAppAgentWindow";
import { useInAppAiAgent } from "./InAppAiAgentProvider";
import { useSmoothStreamingMessages } from "./useSmoothStreamingMessages";
import { getDrawerMessages } from "./utils/utils";
import { getInAppAgentScreenContextDescription } from "@/src/features/in-app-agent/context";
import {
  getInAppAgentFocusedQuickActions,
  getInAppAgentQuickActionContext,
} from "@/src/features/in-app-agent/quickActions";
import {
  getBackgroundRunNotice,
  getSettledActivityOutcome,
  isCancellableBackgroundRun,
} from "@/src/features/in-app-agent/lib/backgroundExecutionSession";
import {
  InAppAgentRunStatus,
  isUnsettledInAppAgentRunStatus,
} from "@langfuse/shared/in-app-agent";

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
    activityByConversationId,
    conversations,
    dock,
    error,
    hasMoreConversations,
    isLoadingMoreConversations,
    isRunning,
    isSelectedConversationHydrating,
    execution,
    isSubmitting,
    invalidateConversations,
    loadMoreConversations,
    liveMessageVersion,
    messages,
    pendingToolApprovals,
    approveToolCall,
    alwaysAllowToolCall,
    rejectToolCall,
    selectConversation,
    selectedConversationId,
    selectedConversationTitle,
    setDock,
    submit,
    submitFeedback,
  } = useInAppAiAgent();
  const isCancellingRun = execution.isCancelling;
  const shouldFlushCancelledRun = execution.run?.cancelRequested === true;
  const {
    finishAnimation,
    isAnimating,
    messages: displayedMessages,
    pendingToolApprovals: displayedPendingToolApprovals,
    runningToolCallIds,
  } = useSmoothStreamingMessages({
    messages,
    liveMessageVersion,
    pendingToolApprovals,
    // Keep the cancelled run flushed through its terminal publication. The
    // final events and terminal status can arrive in one React batch, after
    // `isCancelling` has cleared, and must not restart the reveal after Stop.
    shouldFlush: error !== null || isCancellingRun || shouldFlushCancelledRun,
  });
  const windowExecutionUi: InAppAgentWindowExecutionUi = {
    notice: getBackgroundRunNotice(execution.run),
    activityOutcome: getSettledActivityOutcome(execution.run),
    stop:
      execution.run && isCancellableBackgroundRun(execution.run.status)
        ? {
            status: execution.isCancelling ? "stopping" : "available",
            onStop: () => {
              finishAnimation();
              execution.cancel();
            },
          }
        : null,
  };
  // An assistant turn -- including one paused on an approval -- blocks
  // submission but leaves the draft editable. Hydration is the only case that
  // disables the composer outright so a stale snapshot cannot be submitted.
  const isConversationInteractionDisabled = isSelectedConversationHydrating;
  const isAssistantTurnInProgress =
    isRunning ||
    isAnimating ||
    isSubmitting ||
    pendingToolApprovals.length > 0 ||
    displayedPendingToolApprovals.length > 0;
  // Settle from the durable run, not from attach/animation. A finished
  // attached conversation can still be `isRunning` while the watch connects.
  // A hydrated in-flight run may have no `execution.run` yet — then `isRunning`
  // is the only signal that the turn is still open.
  const isRunUnsettled =
    isSubmitting ||
    pendingToolApprovals.length > 0 ||
    displayedPendingToolApprovals.length > 0 ||
    (execution.run
      ? isUnsettledInAppAgentRunStatus(execution.run.status)
      : isRunning);
  // Both halves are needed. The status alone stays AWAITING_APPROVAL after the
  // user decides, until the watch reports the resumed run, which would leave the
  // drawer claiming to wait on someone who already answered. Pending approvals
  // alone are not enough either: an always-allowed tool carries one and keeps
  // executing.
  const isAwaitingApproval =
    execution.run?.status === InAppAgentRunStatus.AWAITING_APPROVAL &&
    (pendingToolApprovals.length > 0 ||
      displayedPendingToolApprovals.length > 0);
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
      getDrawerMessages({
        error,
        isRunning: isRunning || isAnimating,
        messages: displayedMessages,
        pendingToolApprovals: displayedPendingToolApprovals,
        runningToolCallIds,
      }),
    [
      displayedMessages,
      displayedPendingToolApprovals,
      error,
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
      error={error}
      isAssistantTurnInProgress={isAssistantTurnInProgress}
      isRunUnsettled={isRunUnsettled}
      isAwaitingApproval={isAwaitingApproval}
      isHeaderDragHandleEnabled={props.isHeaderDragHandleEnabled}
      isExpanded={props.isExpanded}
      dock={dock}
      onDockChange={setDock}
      isConversationInteractionDisabled={isConversationInteractionDisabled}
      isSelectedConversationHydrating={isSelectedConversationHydrating}
      messages={drawerMessages}
      quickActionContext={quickActionContext}
      focusedQuickActions={focusedQuickActions}
      quickActionResetKey={quickActionResetKey}
      screenContextDescription={screenContextDescription}
      conversations={conversations}
      activityByConversationId={activityByConversationId}
      hasMoreConversations={hasMoreConversations}
      isLoadingMoreConversations={isLoadingMoreConversations}
      selectedConversationId={selectedConversationId}
      selectedConversationTitle={selectedConversationTitle}
      onLoadMoreConversations={loadMoreConversations}
      onOpenConversationHistory={invalidateConversations}
      onDeleteConversation={props.onDeleteConversation}
      onSelectConversation={selectConversation}
      onNewConversation={() => {
        selectConversation(null);
      }}
      onExpandedChange={props.onExpandedChange}
      onSubmit={submit}
      executionUi={windowExecutionUi}
      onApproveToolCall={approveToolCall}
      onAlwaysAllowToolCall={alwaysAllowToolCall}
      onRejectToolCall={rejectToolCall}
      onSubmitFeedback={submitFeedback}
      {...closeButtonProps}
    />
  );
}
