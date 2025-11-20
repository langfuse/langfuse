/**
 * Resizable content component for support drawer
 * Desktop: Resizable panels with programmatic control
 * Mobile: Bottom drawer
 *
 * Extracted from original layout.tsx (lines 414-493)
 */

import { type PropsWithChildren, useRef, useLayoutEffect } from "react";
import { useMediaQuery } from "react-responsive";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { SupportDrawer } from "@/src/features/support-chat/SupportDrawer";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ImperativePanelHandle,
} from "@/src/components/ui/resizable";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";

/**
 * Resizable content for support drawer on the right side of the screen (desktop).
 * On mobile, renders a Drawer instead of a resizable sidebar.
 *
 * Key optimization: Always renders ResizablePanelGroup on desktop to prevent
 * remounting children when drawer opens/closes. Uses refs for programmatic control.
 */
export function ResizableContent({ children }: PropsWithChildren) {
  const { open, setOpen } = useSupportDrawer();
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });

  // 👉 DESKTOP: Always render ResizablePanelGroup to prevent remounting children
  // Use refs to programmatically control panel sizes when drawer opens/closes
  const drawerPanelRef = useRef<ImperativePanelHandle>(null);
  const mainPanelRef = useRef<ImperativePanelHandle>(null);

  useLayoutEffect(() => {
    if (!isDesktop) return;

    if (open) {
      // Open drawer: resize main to 70%, drawer to 30%
      drawerPanelRef.current?.resize(30);
      mainPanelRef.current?.resize(70);
    } else {
      // Close drawer: resize main to 100%, drawer to 0%
      drawerPanelRef.current?.resize(0);
      mainPanelRef.current?.resize(100);
    }
  }, [open, isDesktop]);

  // 👉 MOBILE: Render bottom drawer
  if (!isDesktop) {
    return (
      <>
        <main className="h-full flex-1" style={{ overscrollBehaviorY: "none" }}>
          {children}
        </main>

        <Drawer open={open} onOpenChange={setOpen} forceDirection="bottom">
          <DrawerContent
            id="support-drawer"
            className="inset-x-0 bottom-0 top-[calc(var(--banner-offset)+10px)] min-h-screen-with-banner"
            size="full"
          >
            <DrawerHeader className="absolute inset-x-0 top-0 p-0 text-left">
              <div className="flex w-full items-center justify-center pt-3">
                <div className="h-2 w-20 rounded-full bg-muted" />
              </div>
              {/* sr-only for screen readers and accessibility */}
              <DrawerTitle className="sr-only">Support</DrawerTitle>
              <DrawerDescription className="sr-only">
                A list of resources and options to help you with your questions.
              </DrawerDescription>
            </DrawerHeader>
            <div className="mt-4 max-h-full">
              <SupportDrawer showCloseButton={false} className="h-full pb-20" />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  // 👉 DESKTOP: Always render ResizablePanelGroup to prevent remounting children
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
