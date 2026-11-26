/* eslint-disable @repo/no-null-render */
"use client";

import { useLayoutEffect, useRef } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Layer } from "@/src/components/design-system/Layer/Layer";
import { ControlledInAppAgentWindow } from "@/src/features/in-app-agent/components/ControlledInAppAgentWindow";
import type { InAppAgentWindowConversation } from "@/src/features/in-app-agent/components/InAppAgentWindow";
import {
  InAppAgentWindowShell,
  useInAppAgentWindowShellPanelControl,
} from "@/src/features/in-app-agent/components/InAppAgentWindowShell";
import {
  useIsInAppAgentLauncherVisible,
  useInAppAiAgent,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";

/**
 * Hosts the floating assistant window and its drag/resize geometry. Must be
 * rendered from a scope that survives route changes (the authenticated
 * layout), NOT from per-page chrome like PageHeader — otherwise the open
 * window unmounts and its geometry resets on every navigation.
 */
export function InAppAgentWindowHost() {
  const isInAppAgentLauncherVisible = useIsInAppAgentLauncherVisible();
  const { deleteConversation, open, setOpen, isExpanded, setIsExpanded } =
    useInAppAiAgent();
  const [deleteConversationWithLoading, isDeletingConversation] =
    useWatchedPromiseCallback(deleteConversation, [deleteConversation]);
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

  // Captures the outgoing rect so the layout effect above can animate the
  // floating <-> expanded swap from where the window actually was.
  const handleExpandedChange = (nextIsExpanded: boolean) => {
    previousPanelRectRef.current =
      panelRef.current?.getBoundingClientRect() ?? null;
    setIsExpanded(nextIsExpanded);
  };

  // Geometry follows the open state: cleared on close so every open starts
  // from the default placement, initialized on open for the floating panel.
  useLayoutEffect(() => {
    if (!open) {
      floatingPanelHandle.clearGeometry();
      return;
    }

    if (isExpanded || floatingPanelHandle.geometry) {
      return;
    }

    floatingPanelHandle.initializeGeometry();
  }, [floatingPanelHandle, isExpanded, open]);

  // Only `isInAppAgentLauncherVisible` gates the tree: the shell owns the `open` guard
  // so the handheld drawer stays mounted and can animate itself closed.
  if (!isInAppAgentLauncherVisible) {
    return null;
  }

  return (
    <ConfirmationDialogController<InAppAgentWindowConversation>
      title="Delete conversation"
      text="This removes the conversation from your recent conversations. This action cannot be undone."
      confirmLabel="Delete conversation"
      variant="destructive"
      loading={isDeletingConversation}
      onConfirm={(conversation) =>
        deleteConversationWithLoading(conversation.id)
      }
    >
      {(deleteConversationDialog) => (
        // The assistant window lives in the `agent` overlay layer — a
        // <body>-level layer container that floats above page content and
        // panel surfaces, but below true modals and transient overlays by DOM
        // order alone. No z-index: layer ORDER stacks it (see
        // context/LayerContext/LayerContext.tsx). This replaces the old body portal + z-51,
        // which fought the nav-user dropdown's z-60 at <body> level.
        <Layer name="agent">
          <InAppAgentWindowShell
            floatingPanelHandle={floatingPanelHandle}
            isExpanded={isExpanded}
            onClose={() => {
              setOpen(false);
            }}
            onExpandedChange={handleExpandedChange}
            open={open}
            panelRef={panelRef}
          >
            {({ isHeaderDragHandleEnabled }) => (
              <ControlledInAppAgentWindow
                isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
                isExpanded={isExpanded}
                onDeleteConversation={(conversation) => {
                  deleteConversationDialog.openDialog(conversation);
                }}
                onExpandedChange={handleExpandedChange}
                onClose={() => {
                  setOpen(false);
                }}
              />
            )}
          </InAppAgentWindowShell>
        </Layer>
      )}
    </ConfirmationDialogController>
  );
}
