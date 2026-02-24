"use client";

import { useCallback } from "react";
import * as ResizablePrimitive from "react-resizable-panels";

// TODO: UI component shouldn't import storage
import useSessionStorage from "@/src/components/useSessionStorage";
import { cn } from "@/src/utils/tailwind";

function ResizablePanelGroup({
  className,
  orientation,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className,
      )}
      orientation={orientation}
      {...props}
    />
  );
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "focus-visible:outline-hidden relative flex w-px items-center justify-center bg-border ring-offset-background after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:-translate-y-1/2 aria-[orientation=horizontal]:after:translate-x-0 [&[aria-orientation=horizontal]>div]:rotate-90",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />
      )}
    </ResizablePrimitive.Separator>
  );
}

function usePersistentPanelSize({
  storageKey,
  panelId,
  defaultSize,
}: {
  storageKey: string;
  panelId: string;
  defaultSize: number;
}) {
  const [panelSize, setPanelSize] = useSessionStorage<number>(
    storageKey,
    defaultSize,
  );

  const onLayoutChanged = useCallback(
    (layout: ResizablePrimitive.Layout) => {
      const nextPanelSize = layout[panelId];
      if (nextPanelSize != null) {
        setPanelSize(nextPanelSize);
      }
    },
    [panelId, setPanelSize],
  );

  return { panelSize, onLayoutChanged };
}

const usePanelRef = ResizablePrimitive.usePanelRef;
const useDefaultLayout = ResizablePrimitive.useDefaultLayout;

export {
  usePersistentPanelSize,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  usePanelRef,
  useDefaultLayout,
};
type ImperativePanelHandle = ResizablePrimitive.PanelImperativeHandle;
export type { ImperativePanelHandle };
