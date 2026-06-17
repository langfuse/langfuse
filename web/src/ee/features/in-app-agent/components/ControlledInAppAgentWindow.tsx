"use client";

import { useMemo } from "react";
import { InAppAgentWindow } from "./InAppAgentWindow";
import { useInAppAiAgent } from "./InAppAiAgentProvider";
import { getDrawerMessages } from "./utils/utils";

type ControlledInAppAgentWindowBaseProps = {
  isHeaderDragHandleEnabled?: boolean;
  zIndex?: number;
  isExpanded: boolean;
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
    loadMoreConversations,
    messages,
    selectConversation,
    selectedConversationId,
    submit,
    submitFeedback,
  } = useInAppAiAgent();
  const isInputDisabled =
    isRunning || isSubmitting || isSelectedConversationHydrating;

  const drawerMessages = useMemo(
    () => getDrawerMessages({ error, isRunning, messages }),
    [error, isRunning, messages],
  );

  const closeButtonProps =
    props.showCloseButton === false
      ? ({ showCloseButton: false } as const)
      : ({ showCloseButton: true, onClose: props.onClose } as const);

  return (
    <InAppAgentWindow
      error={error}
      isHeaderDragHandleEnabled={props.isHeaderDragHandleEnabled}
      isExpanded={props.isExpanded}
      isInputDisabled={isInputDisabled}
      messages={drawerMessages}
      conversations={conversations}
      hasMoreConversations={hasMoreConversations}
      zIndex={props.zIndex}
      isLoadingMoreConversations={isLoadingMoreConversations}
      selectedConversationId={selectedConversationId}
      onLoadMoreConversations={loadMoreConversations}
      onSelectConversation={selectConversation}
      onNewConversation={() => selectConversation(null)}
      onExpandedChange={props.onExpandedChange}
      onSubmit={submit}
      onSubmitFeedback={submitFeedback}
      {...closeButtonProps}
    />
  );
}
