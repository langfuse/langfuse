"use client";

import type { ReactNode, RefObject } from "react";

import {
  MovableResizablePanel,
  type MovableResizablePanelGeometry,
  type MovableResizablePanelSize,
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

type InitialInAppAgentWindowShellGeometryParams = {
  viewportWidth: number;
  viewportHeight: number;
  anchorRect?: Pick<DOMRect, "right"> | null;
};

const IN_APP_AGENT_WINDOW_SHELL_MAX_SIZE = {
  width: IN_APP_AGENT_WINDOW_SHELL_MAX_WIDTH_PX,
  height: IN_APP_AGENT_WINDOW_SHELL_MAX_HEIGHT_PX,
} satisfies MovableResizablePanelSize;

export function getInitialInAppAgentWindowShellGeometry({
  viewportWidth,
  viewportHeight,
  anchorRect,
}: InitialInAppAgentWindowShellGeometryParams): MovableResizablePanelGeometry {
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
}

type InAppAgentWindowShellProps = {
  children: (props: { isHeaderDragHandleEnabled: boolean }) => ReactNode;
  floatingGeometry: MovableResizablePanelGeometry | null;
  isExpanded: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  zIndex: number;
  onPositionChange: (
    position: MovableResizablePanelGeometry["position"],
  ) => void;
  onSizeChange: (size: MovableResizablePanelGeometry["size"]) => void;
};

export function InAppAgentWindowShell({
  children,
  floatingGeometry,
  isExpanded,
  panelRef,
  zIndex,
  onPositionChange,
  onSizeChange,
}: InAppAgentWindowShellProps) {
  if (!floatingGeometry) {
    return null;
  }

  return (
    <MovableResizablePanel
      boundsPadding={IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX}
      className={
        isExpanded
          ? "inset-x-3 top-[calc(var(--banner-offset)+0.75rem)] bottom-3"
          : undefined
      }
      dragHandleSelector={IN_APP_AGENT_WINDOW_SHELL_DRAG_HANDLE_SELECTOR}
      ignoreOutsideInteraction
      isGeometryManaged={!isExpanded}
      isMovable={!isExpanded}
      isResizable={!isExpanded}
      maxSize={IN_APP_AGENT_WINDOW_SHELL_MAX_SIZE}
      minSize={IN_APP_AGENT_WINDOW_SHELL_MIN_SIZE}
      panelRef={panelRef}
      position={floatingGeometry.position}
      size={floatingGeometry.size}
      zIndex={zIndex}
      onPositionChange={onPositionChange}
      onSizeChange={onSizeChange}
    >
      <div
        data-ignore-outside-interaction
        className="h-full w-full origin-top-left"
      >
        {children({ isHeaderDragHandleEnabled: !isExpanded })}
      </div>
    </MovableResizablePanel>
  );
}
