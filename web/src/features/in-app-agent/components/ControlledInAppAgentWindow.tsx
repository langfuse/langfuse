"use client";

import { useMemo } from "react";
import { useRouter } from "next/router";
import { InAppAgentWindow } from "./InAppAgentWindow";
import type {
  InAppAgentWindowConversation,
  InAppAgentWindowExecutionUi,
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
  getBackgroundRunFailureMessage,
  isCancellableBackgroundRun,
  type BackgroundExecutionRunView,
} from "@/src/features/in-app-agent/lib/backgroundExecutionSession";
import { InAppAgentRunStatus } from "@langfuse/shared";
import { isActiveInAppAgentRunStatus } from "@langfuse/shared/in-app-agent";

const SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE =
  "Sandbox-enabled conversations become read-only after 8 hours. Start a new conversation to continue.";

function getBackgroundRunNotice(
  run: BackgroundExecutionRunView | null,
): string | null {
  if (!run) {
    return null;
  }

  if (isActiveInAppAgentRunStatus(run.status) && run.cancelRequested) {
    return "Stopping the run…";
  }

  if (run.status === InAppAgentRunStatus.QUEUED) {
    return "Waiting for a worker to pick this up. You can close this; the run continues in the background.";
  }

  if (run.status === InAppAgentRunStatus.RUNNING) {
    return "You can close this; the run continues in the background.";
  }

  if (run.status === InAppAgentRunStatus.FAILED) {
    return getBackgroundRunFailureMessage(run.errorCode ?? null);
  }

  return null;
}

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
    execution,
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
  const isCancellingRun =
    execution.type === "background" && execution.isCancelling;
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
    // Stop pacing the reveal once the user has asked the run to stop. The
    // background path delivers whole compacted blocks, so a backlog can easily
    // outlive the run itself — and watching buffered text keep typing out after
    // pressing stop reads as "cancel did nothing", even though the run is
    // already CANCELLED server-side.
    shouldFlush: error !== null || isCancellingRun,
  });
  const windowExecutionUi: InAppAgentWindowExecutionUi =
    execution.type === "foreground"
      ? execution
      : {
          type: "background",
          notice: getBackgroundRunNotice(execution.run),
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
  // Only a read-only conversation disables the composer outright. An assistant
  // turn -- including one paused on an approval -- blocks submission but leaves
  // the draft editable.
  const isConversationInteractionDisabled =
    selectedConversationIsWriteLocked || isSelectedConversationHydrating;
  const isAssistantTurnInProgress =
    isRunning ||
    isAnimating ||
    isSubmitting ||
    pendingToolApprovals.length > 0 ||
    displayedPendingToolApprovals.length > 0;
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
      error={displayError}
      isAssistantTurnInProgress={isAssistantTurnInProgress}
      isHeaderDragHandleEnabled={props.isHeaderDragHandleEnabled}
      isExpanded={props.isExpanded}
      isConversationInteractionDisabled={isConversationInteractionDisabled}
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
      executionUi={windowExecutionUi}
      onApproveToolCall={approveToolCall}
      onRejectToolCall={rejectToolCall}
      onSubmitFeedback={submitFeedback}
      {...closeButtonProps}
    />
  );
}
