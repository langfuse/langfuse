import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { X } from "@langfuse/icons";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import { IntroSection } from "@/src/features/support-chat/IntroSection";
import { SuccessSection } from "@/src/features/support-chat/SuccessSection";
import { ConnectedSupportFormSection } from "@/src/features/support-chat/ConnectedSupportFormSection";
import { cn } from "@/src/utils/tailwind";

function SupportDrawerContent({
  showCloseButton = true,
  layout = "default",
}: {
  showCloseButton?: boolean;
  layout?: "default" | "mobileDrawer";
}) {
  const { setOpen, initialMode } = useSupportDrawer();
  const [currentMode, setCurrentMode] = useState<"intro" | "form" | "success">(
    initialMode,
  );
  const close = () => setOpen(false);

  return (
    <div
      className={cn(
        "bg-background flex h-full w-full min-w-0 flex-col",
        layout === "mobileDrawer" &&
          "min-h-0 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]",
      )}
    >
      <div className="bg-background">
        <div className="flex min-h-11 w-full items-center justify-between gap-1 px-4 py-1">
          <Breadcrumb>
            <BreadcrumbList>
              {currentMode === "intro" ? (
                <BreadcrumbItem>
                  <BreadcrumbPage>Support</BreadcrumbPage>
                </BreadcrumbItem>
              ) : (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <button
                        type="button"
                        onClick={() => setCurrentMode("intro")}
                        className="text-foreground"
                      >
                        Support
                      </button>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="text-foreground-tertiary">
                    /
                  </BreadcrumbSeparator>
                  <BreadcrumbItem>
                    <BreadcrumbPage>Email Engineer</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          {showCloseButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={close}
              aria-label="Close"
            >
              <X size="base" color="default" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto border-t">
        <div className="px-2 py-1">
          <div className="bg-background h-full">
            <div className="p-2">
              {currentMode === "intro" && (
                <IntroSection onStartForm={() => setCurrentMode("form")} />
              )}
              {currentMode === "form" && (
                <ConnectedSupportFormSection
                  onSuccess={() => setCurrentMode("success")}
                  onCancel={() => setCurrentMode("intro")}
                />
              )}
              {currentMode === "success" && (
                <SuccessSection onAnother={() => setCurrentMode("form")} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SupportDrawer(props: {
  showCloseButton?: boolean;
  layout?: "default" | "mobileDrawer";
}) {
  const { openEpoch } = useSupportDrawer();

  // Keyed by openEpoch so re-opening (openWithMode while already open)
  // remounts the content and re-seeds mode/topic from the provider.
  return <SupportDrawerContent key={openEpoch} {...props} />;
}
