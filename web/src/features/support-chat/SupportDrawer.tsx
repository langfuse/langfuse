import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { X, Slash } from "lucide-react";
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
import { SupportFormSection } from "@/src/features/support-chat/SupportFormSection";
import { cn } from "@/src/utils/tailwind";

export const SupportDrawer = ({
  showCloseButton = true,
  className,
}: {
  showCloseButton?: boolean;
  className?: string;
}) => {
  const { open, setOpen } = useSupportDrawer();
  const [currentMode, setCurrentMode] = useState<"intro" | "form" | "success">(
    "intro",
  );
  const close = () => setOpen(false);

  if (!open) return null;

  return (
    <div
      className={cn([
        "flex h-full w-full min-w-0 flex-col bg-background",
        className,
      ])}
    >
      <div className="bg-background">
        <div className="flex min-h-12 w-full items-center justify-between gap-1 px-4 py-1">
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
                  <BreadcrumbSeparator>
                    <Slash />
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
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto border-t">
        <div className="px-2 py-1">
          <div className="h-full bg-background">
            <div className="p-2">
              {currentMode === "intro" && (
                <IntroSection onStartForm={() => setCurrentMode("form")} />
              )}
              {currentMode === "form" && (
                <SupportFormSection
                  onSuccess={() => setCurrentMode("success")}
                  onCancel={() => setCurrentMode("intro")}
                />
              )}
              {currentMode === "success" && (
                <SuccessSection
                  onClose={close}
                  onAnother={() => setCurrentMode("form")}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
