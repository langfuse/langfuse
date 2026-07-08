"use client";

import { useCallback, type ReactNode, type RefObject } from "react";

import {
  MovableResizablePanel,
  type MovableResizablePanelHandle,
  type MovableResizablePanelSize,
  useMovableResizablePanelControl,
} from "@/src/components/movable-resizable-panel";

const IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX = 8;
const IN_APP_AGENT_WINDOW_SHELL_DEFAULT_WIDTH_PX = 448;
const IN_APP_AGENT_WINDOW_SHELL_DEFAULT_MAX_HEIGHT_PX = 672;
const IN_APP_AGENT_WINDOW_SHELL_MAX_WIDTH_PX = 1296;
const IN_APP_AGENT_WINDOW_SHELL_MAX_HEIGHT_PX = 760;
const IN_APP_AGENT_WINDOW_SHELL_DRAG_HANDLE_SELECTOR =
  "[data-in-app-agent-window-drag-handle='true']";
const IN_APP_AGENT_WINDOW_SHELL_MIN_SIZE = {
  width: 360,
  height: 420,
} satisfies MovableResizablePanelSize;

const IN_APP_AGENT_WINDOW_SHELL_MAX_SIZE = {
  width: IN_APP_AGENT_WINDOW_SHELL_MAX_WIDTH_PX,
  height: IN_APP_AGENT_WINDOW_SHELL_MAX_HEIGHT_PX,
} satisfies MovableResizablePanelSize;

export function useInAppAgentWindowShellPanelControl({
  anchorRef,
}: {
  anchorRef?: RefObject<HTMLElement | null>;
} = {}) {
  const getInitialGeometry = useCallback(() => {
    const anchorRect = anchorRef?.current?.getBoundingClientRect();
    const viewportHeight =
      typeof window === "undefined" ? 768 : window.innerHeight;
    const viewportWidth =
      typeof window === "undefined" ? 1024 : window.innerWidth;
    const width = Math.min(
      IN_APP_AGENT_WINDOW_SHELL_DEFAULT_WIDTH_PX,
      viewportWidth - IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX * 2,
    );
    const height = Math.min(
      IN_APP_AGENT_WINDOW_SHELL_DEFAULT_MAX_HEIGHT_PX,
      viewportHeight - 32,
    );

    return {
      position: {
        left: anchorRect
          ? anchorRect.right - 6
          : viewportWidth - width - IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX,
        top:
          viewportHeight - height - IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX,
      },
      size: { width, height },
    };
  }, [anchorRef]);

  return useMovableResizablePanelControl({
    boundsPadding: IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX,
    getInitialGeometry,
    maxSize: IN_APP_AGENT_WINDOW_SHELL_MAX_SIZE,
    minSize: IN_APP_AGENT_WINDOW_SHELL_MIN_SIZE,
  });
}

type InAppAgentWindowShellProps = {
  children: (props: { isHeaderDragHandleEnabled: boolean }) => ReactNode;
  floatingPanelHandle: MovableResizablePanelHandle;
  isExpanded: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
};

export function InAppAgentWindowShell({
  children,
  floatingPanelHandle,
  isExpanded,
  panelRef,
}: InAppAgentWindowShellProps) {
  if (!isExpanded && !floatingPanelHandle.geometry) {
    return null;
  }

  // The shell renders inside the `agent` overlay layer (see
  // components/ui/layer.tsx), whose container is `pointer-events: none` so the
  // rest of the app stays click-through. The panel is the interactive surface,
  // so it opts pointer events back in via `pointer-events-auto`. No z-index:
  // layer ORDER stacks the whole `agent` layer below every transient overlay.
  if (isExpanded) {
    return (
      <div
        ref={panelRef}
        className="pointer-events-auto fixed inset-x-3 top-[calc(var(--banner-offset)+0.75rem)] bottom-3 origin-top-left"
        data-ignore-outside-interaction
      >
        <div
          data-ignore-outside-interaction
          className="h-full w-full origin-top-left"
        >
          {children({ isHeaderDragHandleEnabled: false })}
        </div>
      </div>
    );
  }

  return (
    <MovableResizablePanel
      dragHandleSelector={IN_APP_AGENT_WINDOW_SHELL_DRAG_HANDLE_SELECTOR}
      ignoreOutsideInteraction
      ref={panelRef}
      handle={floatingPanelHandle}
      className="pointer-events-auto"
    >
      <div
        data-ignore-outside-interaction
        className="h-full w-full origin-top-left"
      >
        {children({ isHeaderDragHandleEnabled: true })}
      </div>
    </MovableResizablePanel>
  );
}
