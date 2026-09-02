/* eslint-disable @repo/no-null-render */
"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { DialogController } from "@/src/features/in-app-agent/components/dialog-controller";
import { Layer } from "@/src/components/ui/layer";
import { ResizableSplitLayout } from "@/src/components/ui/resizable-split-layout";
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
import { useIsHandheld } from "@/src/hooks/use-mobile";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

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

function InAppAgentHostFrame({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}

function createInAppAgentOutletNode() {
  if (typeof document === "undefined") {
    return null;
  }

  const node = document.createElement("div");
  node.className = "h-full min-h-0 w-full";
  return node;
}

function InAppAgentPersistentWindow({
  children,
  node,
}: {
  children: ReactNode;
  node: HTMLElement | null;
}) {
  if (!node) {
    return null;
  }

  return createPortal(children, node);
}

function InAppAgentPersistentWindowSink({
  node,
}: {
  node: HTMLElement | null;
}) {
  const slotRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot || !node) {
      return;
    }

    slot.appendChild(node);
    return () => {
      if (node.parentElement === slot) {
        slot.removeChild(node);
      }
    };
  }, [node]);

  return <div className="h-full min-h-0" ref={slotRef} />;
}

/**
 * Hosts the assistant window and its presentations. Must be rendered from a
 * scope that survives route changes (the authenticated layout), wrapping page
 * content so the docked sidebar can push the page — including the top chrome
 * — aside. Overlay presentations (detached and fullscreen) still render
 * through the `agent` layer; the handheld drawer is unchanged.
 *
 * Sidebar and overlay chrome are mutually exclusive in the DOM. The window
 * itself is rendered once into a detached node that the active chrome reparents,
 * so composer state survives dock, detach, and expand.
 */
export function InAppAgentWindowHost({ children }: { children: ReactNode }) {
  const isInAppAgentLauncherVisible = useIsInAppAgentLauncherVisible();
  const isHandheld = useIsHandheld();
  const capture = usePostHogClientCapture();
  const { deleteConversation, dock, open, setOpen, isExpanded, setIsExpanded } =
    useInAppAiAgent();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousPanelRectRef = useRef<DOMRect | null>(null);
  const [outletNode] = useState(createInAppAgentOutletNode);

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
    if (nextIsExpanded !== isExpanded) {
      capture("in_app_agent:presentation_changed", {
        presentation: nextIsExpanded ? "fullscreen" : dock,
      });
    }
    setIsExpanded(nextIsExpanded);
  };

  // Geometry belongs to the detached overlay: cleared on close so every open
  // starts from the default placement, initialized only once the movable panel
  // is the active presentation.
  useLayoutEffect(() => {
    if (!open) {
      floatingPanelHandle.clearGeometry();
      return;
    }

    if (isHandheld || isExpanded || dock !== "detached") {
      return;
    }

    if (floatingPanelHandle.geometry) {
      return;
    }

    floatingPanelHandle.initializeGeometry();
  }, [dock, floatingPanelHandle, isExpanded, isHandheld, open]);

  // Only `isInAppAgentLauncherVisible` gates the assistant tree: page content
  // always stays mounted, and the shell owns the `open` guard so the handheld
  // drawer can animate itself closed.
  if (!isInAppAgentLauncherVisible) {
    return <InAppAgentHostFrame>{children}</InAppAgentHostFrame>;
  }

  const showSidebar = open && dock === "sidebar" && !isExpanded && !isHandheld;
  const showOverlay =
    isHandheld || (open && (isExpanded || dock === "detached"));
  const showWindow = showSidebar || showOverlay;
  const isHeaderDragHandleEnabled = showOverlay && !isHandheld && !isExpanded;

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
      {(deleteConversationDialog) => {
        const agentWindow = (
          <ControlledInAppAgentWindow
            isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
            isExpanded={isExpanded}
            onDeleteConversation={(conversation) => {
              deleteConversationDialog.open(conversation);
            }}
            onExpandedChange={handleExpandedChange}
            onClose={() => {
              setOpen(false);
            }}
          />
        );

        return (
          <InAppAgentHostFrame>
            {showWindow ? (
              <InAppAgentPersistentWindow node={outletNode}>
                {agentWindow}
              </InAppAgentPersistentWindow>
            ) : null}
            {isHandheld ? (
              children
            ) : (
              <ResizableSplitLayout
                className="flex h-full min-h-0 w-full flex-1"
                primaryContent={children}
                secondaryContent={
                  <div
                    data-testid="in-app-agent-sidebar"
                    data-ignore-outside-interaction
                    className="h-full min-h-0 overflow-hidden"
                  >
                    <InAppAgentPersistentWindowSink node={outletNode} />
                  </div>
                }
                open={showSidebar}
                defaultPrimarySize={70}
                defaultSecondarySize={30}
                minPrimarySize={40}
                maxSecondarySize={50}
                // Floor where quick-action tabs and the composer footer
                // still layout; dragging can only widen from here.
                minSecondarySize="24rem"
                keepSecondaryMounted={false}
                persistId="in-app-agent-sidebar"
              />
            )}
            {showOverlay ? (
              // Detached, fullscreen, and handheld presentations live in the
              // `agent` overlay layer — a <body>-level layer container that
              // floats above page content and panel surfaces, but below true
              // modals and transient overlays by DOM order alone. No z-index:
              // layer ORDER stacks it (see components/ui/layer.tsx). The
              // docked sidebar is in-flow above, not in this layer.
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
                  {() => <InAppAgentPersistentWindowSink node={outletNode} />}
                </InAppAgentWindowShell>
              </Layer>
            ) : null}
          </InAppAgentHostFrame>
        );
      }}
    </DialogController>
  );
}
