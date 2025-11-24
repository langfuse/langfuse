/**
 * CollapsiblePanelGroup - Wrapper around ResizablePanelGroup with context
 *
 * Provides collapse/expand state management for child panels
 */

import { type ReactNode } from "react";
import { ResizablePanelGroup } from "@/src/components/ui/resizable";
import { CollapsiblePanelProvider } from "../contexts/CollapsiblePanelContext";

interface CollapsiblePanelGroupProps {
  children: ReactNode;
  direction: "horizontal" | "vertical";
  id?: string;
  autoSaveId?: string;
  className?: string;
  storageKey?: string; // Optional: persist collapsed state
}

export function CollapsiblePanelGroup({
  children,
  direction,
  id,
  autoSaveId,
  className,
  storageKey,
}: CollapsiblePanelGroupProps) {
  return (
    <CollapsiblePanelProvider storageKey={storageKey}>
      <ResizablePanelGroup
        direction={direction}
        id={id}
        autoSaveId={autoSaveId}
        className={className}
      >
        {children}
      </ResizablePanelGroup>
    </CollapsiblePanelProvider>
  );
}
