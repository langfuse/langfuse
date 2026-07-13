import { useLayoutEffect, useRef } from "react";

import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { DialogController } from "@/src/components/ui/dialog-controller";
import { Layer } from "@/src/components/ui/layer";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import { ControlledInAppAgentWindow } from "./ControlledInAppAgentWindow";
import {
  InAppAgentWindowShell,
  useInAppAgentWindowShellPanelControl,
} from "./InAppAgentWindowShell";
import { useInAppAiAgent } from "./InAppAiAgentProvider";
import type { InAppAgentWindowConversation } from "./InAppAgentWindow";

function DeleteConversationDialog({
  close,
  conversation,
  onDeleteConversation,
}: {
  close: () => void;
  conversation: InAppAgentWindowConversation | null;
  onDeleteConversation: (conversationId: string) => Promise<void>;
}) {
  const [deleteConversation, isDeletingConversation] =
    useWatchedPromiseCallback(async () => {
      if (!conversation) {
        return;
      }

      try {
        await onDeleteConversation(conversation.id);
        close();
      } catch {
        // Error is already surfaced by the provider; keep the dialog open for retry.
      }
    }, [close, conversation, onDeleteConversation]);

  return (
    <ConfirmDialog
      open={conversation !== null}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      title="Delete conversation"
      description="This removes the conversation from your recent conversations. This action cannot be undone."
      confirmLabel="Delete conversation"
      loading={isDeletingConversation}
      onConfirm={deleteConversation}
    />
  );
}

export function InAppAgentHost() {
  const {
    deleteConversation,
    isAvailable,
    open,
    setOpen,
    isExpanded,
    setIsExpanded,
  } = useInAppAiAgent();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousPanelRectRef = useRef<DOMRect | null>(null);
  const floatingPanelHandle = useInAppAgentWindowShellPanelControl();

  useLayoutEffect(() => {
    const previousRect = previousPanelRectRef.current;
    const panel = panelRef.current;

    previousPanelRectRef.current = null;

    if (!previousRect || !panel) {
      return;
    }

    const nextRect = panel.getBoundingClientRect();

    panel.animate(
      [
        {
          transform: `translate(${previousRect.left - nextRect.left}px, ${previousRect.top - nextRect.top}px) scale(${nextRect.width > 0 ? previousRect.width / nextRect.width : 1}, ${nextRect.height > 0 ? previousRect.height / nextRect.height : 1})`,
        },
        { transform: "translate(0, 0) scale(1, 1)" },
      ],
      {
        duration: 180,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      },
    );
  }, [isExpanded]);

  useLayoutEffect(() => {
    if (!open || isExpanded || floatingPanelHandle.geometry) {
      return;
    }

    floatingPanelHandle.initializeGeometry();
  }, [floatingPanelHandle, isExpanded, open]);

  if (!isAvailable || !open) {
    return null;
  }

  return (
    <DialogController<InAppAgentWindowConversation>
      dialog={(close, conversation) => (
        <DeleteConversationDialog
          close={close}
          conversation={conversation}
          onDeleteConversation={deleteConversation}
        />
      )}
    >
      {(deleteConversationDialog) => (
        <Layer name="agent">
          <InAppAgentWindowShell
            floatingPanelHandle={floatingPanelHandle}
            isExpanded={isExpanded}
            panelRef={panelRef}
          >
            {({ isHeaderDragHandleEnabled }) => (
              <ControlledInAppAgentWindow
                isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
                isExpanded={isExpanded}
                onDeleteConversation={(conversation) => {
                  deleteConversationDialog.open(conversation);
                }}
                onExpandedChange={(nextIsExpanded) => {
                  previousPanelRectRef.current =
                    panelRef.current?.getBoundingClientRect() ?? null;
                  setIsExpanded(nextIsExpanded);
                }}
                onClose={() => {
                  floatingPanelHandle.clearGeometry();
                  setOpen(false);
                }}
              />
            )}
          </InAppAgentWindowShell>
        </Layer>
      )}
    </DialogController>
  );
}
