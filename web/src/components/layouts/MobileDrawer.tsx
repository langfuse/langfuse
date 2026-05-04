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
import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { ControlledInAppAgentDrawer } from "@/src/features/in-app-agent/components";

export function MobileDrawer({
  aiAgentEnabled,
  children,
}: PropsWithChildren<{ aiAgentEnabled?: boolean }>) {
  const { open: supportOpen, setOpen: setSupportOpen } = useSupportDrawer();
  const { open: aiAgentOpen, setOpen: setAiAgentOpen } = useInAppAiAgent();
  const showAiAgent = Boolean(aiAgentEnabled && aiAgentOpen);

  return (
    <>
      <main className="h-full flex-1" style={{ overscrollBehaviorY: "none" }}>
        {children}
      </main>

      <Drawer
        open={showAiAgent || supportOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAiAgentOpen(false);
            setSupportOpen(false);
          }
        }}
        forceDirection="bottom"
      >
        <DrawerContent
          id="support-drawer"
          className="min-h-screen-with-banner inset-x-0 top-[calc(var(--banner-offset)+10px)] bottom-0"
          size="full"
        >
          <DrawerHeader className="absolute inset-x-0 top-0 p-0 text-left">
            <div className="flex w-full items-center justify-center pt-3">
              <div className="bg-muted h-2 w-20 rounded-full" />
            </div>
            {/* sr-only for screen readers and accessibility */}
            <DrawerTitle className="sr-only">
              {showAiAgent ? "AI-Agent" : "Support"}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              {showAiAgent
                ? "An AI assistant to help you with your questions."
                : "A list of resources and options to help you with your questions."}
            </DrawerDescription>
          </DrawerHeader>
          <div className="mt-4 max-h-full">
            {showAiAgent ? (
              <ControlledInAppAgentDrawer showCloseButton={false} />
            ) : (
              <SupportDrawer showCloseButton={false} className="h-full pb-20" />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
