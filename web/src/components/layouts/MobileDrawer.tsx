import { type PropsWithChildren } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { SupportDrawer } from "@/src/features/support-chat/SupportDrawer";

export function MobileDrawer({ children }: PropsWithChildren) {
  const { open, setOpen } = useSupportDrawer();

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
