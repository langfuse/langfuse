/**
 * CollapsiblePanel - Panel with collapse/expand support
 *
 * Features:
 * - Remember last non-collapsed size
 * - Integrate with CollapsiblePanelContext
 * - Support imperative collapse/expand via ref
 * - Detect collapsed state from actual size
 */

import {
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type ReactNode,
} from "react";
import {
  ResizablePanel,
  type ImperativePanelHandle,
} from "@/src/components/ui/resizable";
import { useCollapsiblePanel } from "../contexts/CollapsiblePanelContext";
import { usePanelSizeMemory } from "../hooks/usePanelSizeMemory";

export interface CollapsiblePanelRef {
  collapse: () => void;
  expand: () => void;
  toggle: () => void;
  isCollapsed: () => boolean;
  getSize: () => number;
  resize: (size: number) => void;
}

interface CollapsiblePanelProps {
  id: string;
  children: ReactNode;
  defaultSize: number;
  minSize?: number;
  maxSize?: number;
  collapsedSize?: number;
  collapsedThreshold?: number;
  order?: number;
  className?: string;
  onCollapse?: (collapsed: boolean) => void;
  renderCollapsed?: () => ReactNode;
}

export const CollapsiblePanel = forwardRef<
  CollapsiblePanelRef,
  CollapsiblePanelProps
>(function CollapsiblePanel(
  {
    id,
    children,
    defaultSize,
    minSize = 10,
    maxSize = 70,
    collapsedSize = 3,
    collapsedThreshold = 5,
    order,
    className,
    onCollapse,
    renderCollapsed,
  },
  ref,
) {
  const panelRef = useRef<ImperativePanelHandle>(null);
  const {
    isCollapsed: isCollapsedInContext,
    collapse: contextCollapse,
    expand: contextExpand,
  } = useCollapsiblePanel();

  const { captureSize, getRestoreSize } = usePanelSizeMemory(
    id,
    defaultSize,
    collapsedThreshold,
  );

  const isCollapsed = isCollapsedInContext(id);

  const handleResize = useCallback(
    (size: number) => {
      // Capture size for memory
      captureSize(size);

      // Detect collapsed state from size
      const collapsed = size <= collapsedThreshold;
      if (collapsed !== isCollapsed) {
        if (collapsed) {
          contextCollapse(id);
        } else {
          contextExpand(id);
        }
        onCollapse?.(collapsed);
      }
    },
    [
      id,
      captureSize,
      collapsedThreshold,
      isCollapsed,
      contextCollapse,
      contextExpand,
      onCollapse,
    ],
  );

  // Expose imperative API
  useImperativeHandle(
    ref,
    () => ({
      collapse: () => {
        panelRef.current?.collapse();
      },
      expand: () => {
        const restoreSize = getRestoreSize();
        panelRef.current?.resize(restoreSize);
      },
      toggle: () => {
        if (isCollapsed) {
          const restoreSize = getRestoreSize();
          panelRef.current?.resize(restoreSize);
        } else {
          panelRef.current?.collapse();
        }
      },
      isCollapsed: () => isCollapsed,
      getSize: () => panelRef.current?.getSize() ?? 0,
      resize: (size: number) => {
        panelRef.current?.resize(size);
      },
    }),
    [isCollapsed, getRestoreSize],
  );

  return (
    <ResizablePanel
      ref={panelRef}
      id={id}
      order={order}
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
      collapsible={true}
      collapsedSize={collapsedSize}
      onResize={handleResize}
      className={className}
    >
      {isCollapsed && renderCollapsed ? renderCollapsed() : children}
    </ResizablePanel>
  );
});
