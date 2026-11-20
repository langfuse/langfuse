/* eslint-disable @repo/no-null-render */
"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { ArrowLeft } from "@langfuse/icons";
import { useRouter } from "next/router";

import { Button } from "@/src/components/design-system/Button/Button";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Layer } from "@/src/components/design-system/Layer/Layer";
import { ControlledInAppAgentWindow } from "@/src/features/in-app-agent/components/ControlledInAppAgentWindow";
import { InAppAgentLayoutSwitcher } from "@/src/features/in-app-agent/components/InAppAgentLayoutSwitcher";
import type { InAppAgentWindowConversation } from "@/src/features/in-app-agent/components/InAppAgentWindow";
import {
  InAppAgentWindowShell,
  useInAppAgentWindowShellPanelControl,
} from "@/src/features/in-app-agent/components/InAppAgentWindowShell";
import {
  useIsInAppAgentLauncherVisible,
  useInAppAiAgent,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import type { InAppAgentLayoutMode } from "@/src/features/in-app-agent/layoutMode";
import { useIsHandheld } from "@/src/hooks/use-mobile";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import { cn } from "@/src/utils/tailwind";

const PROJECT_HOME_PATHNAME = "/project/[projectId]";

function stripQueryAndHash(url: string) {
  return url.replace(/[?#].*$/, "");
}

/**
 * The layout mode the window currently renders inline with the page content,
 * or null while it is closed or floating. A phone has one presentation (the
 * drawer), so the layout mode only applies on desktop.
 */
export function useInAppAgentInlinePresentation(): Exclude<
  InAppAgentLayoutMode,
  "floating"
> | null {
  const isInAppAgentLauncherVisible = useIsInAppAgentLauncherVisible();
  const { open, layoutMode } = useInAppAiAgent();
  const isHandheld = useIsHandheld();

  if (
    !isInAppAgentLauncherVisible ||
    !open ||
    isHandheld ||
    layoutMode === "floating"
  ) {
    return null;
  }

  return layoutMode;
}

/**
 * Hosts the assistant window: floating (with its drag/resize geometry) in the
 * `agent` layer, or inline beside the page content when docked or full page.
 * Must be rendered from a scope that survives route changes (the authenticated
 * layout), NOT from per-page chrome like PageHeader — otherwise the open
 * window unmounts and its geometry resets on every navigation.
 */
export function InAppAgentWindowHost() {
  const router = useRouter();
  const isHandheld = useIsHandheld();
  const isInAppAgentLauncherVisible = useIsInAppAgentLauncherVisible();
  const inlinePresentation = useInAppAgentInlinePresentation();
  const {
    deleteConversation,
    open,
    setOpen,
    isExpanded,
    setIsExpanded,
    layoutMode,
    dockLayoutMode,
    setLayoutMode,
  } = useInAppAiAgent();
  const currentPath = stripQueryAndHash(router.asPath);

  // External system: the Next router's event emitter. Full page stands in for
  // the page it was opened on, so navigating elsewhere docks the conversation
  // beside the destination instead of covering it.
  useEffect(() => {
    if (layoutMode !== "full") {
      return;
    }

    const handleRouteChangeStart = (url: string) => {
      if (!stripQueryAndHash(url).endsWith(currentPath)) {
        setLayoutMode(dockLayoutMode);
      }
    };

    router.events.on("routeChangeStart", handleRouteChangeStart);

    return () => {
      router.events.off("routeChangeStart", handleRouteChangeStart);
    };
  }, [currentPath, dockLayoutMode, layoutMode, router.events, setLayoutMode]);
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

  const layoutSwitcher = isHandheld ? null : (
    <InAppAgentLayoutSwitcher value={layoutMode} onChange={setLayoutMode} />
  );

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
      {(deleteConversationDialog) =>
        inlinePresentation ? (
          <aside
            className={cn(
              "bg-background flex min-h-0 flex-col",
              inlinePresentation === "full" && "min-w-0 flex-1",
              inlinePresentation === "dock-right" && "w-105 shrink-0 border-l",
              inlinePresentation === "dock-left" &&
                "order-first w-105 shrink-0 border-r",
            )}
          >
            <ControlledInAppAgentWindow
              isFlush
              isExpanded={inlinePresentation === "full"}
              expandToggleLabels={{
                expand: "Open full page",
                collapse: "Dock to side",
              }}
              headerLeading={
                inlinePresentation === "full" &&
                router.pathname === PROJECT_HOME_PATHNAME ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={ArrowLeft}
                    text="Home"
                    onClick={() => {
                      setOpen(false);
                    }}
                  />
                ) : undefined
              }
              headerActions={layoutSwitcher}
              onDeleteConversation={(conversation) => {
                deleteConversationDialog.openDialog(conversation);
              }}
              onExpandedChange={(nextIsExpanded) => {
                setLayoutMode(nextIsExpanded ? "full" : dockLayoutMode);
              }}
              onClose={() => {
                setOpen(false);
              }}
            />
          </aside>
        ) : (
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
                  headerActions={layoutSwitcher}
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
        )
      }
    </ConfirmationDialogController>
  );
}
