"use client";

import { type PropsWithChildren, useLayoutEffect, useRef } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ImperativePanelHandle,
} from "@/src/components/ui/resizable";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { SupportDrawer } from "@/src/features/support-chat/SupportDrawer";

/**
 * Desktop-only resizable layout for the support drawer.
 * Always render ResizablePanelGroup to prevent remounting children.
 * Use refs to programmatically control panel sizes when drawer opens/closes.
 */
export function ResizableDesktopLayout({ children }: PropsWithChildren) {
  const { open } = useSupportDrawer();
  const drawerPanelRef = useRef<ImperativePanelHandle>(null);
  const mainPanelRef = useRef<ImperativePanelHandle>(null);

  useLayoutEffect(() => {
    if (open) {
      // Open drawer: resize main to 70%, drawer to 30%
      drawerPanelRef.current?.resize(30);
      mainPanelRef.current?.resize(70);
    } else {
      // Close drawer: resize main to 100%, drawer to 0%
      drawerPanelRef.current?.resize(0);
      mainPanelRef.current?.resize(100);
    }
  }, [open]);

  return (
    <ResizablePanelGroup direction="horizontal" className="flex h-full w-full">
      <ResizablePanel ref={mainPanelRef} defaultSize={100} minSize={30}>
        <main
          className="relative h-full w-full overflow-scroll"
          style={{ overscrollBehaviorY: "none" }}
        >
          {children}
        </main>
      </ResizablePanel>
      {open && <ResizableHandle withHandle />}
      <ResizablePanel
        ref={drawerPanelRef}
        defaultSize={0}
        minSize={0}
        maxSize={60}
        collapsible={true}
        collapsedSize={0}
      >
        {open && <SupportDrawer />}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
