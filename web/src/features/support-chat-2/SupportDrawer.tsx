import { useSupportDrawer } from "@/src/features/support-chat-2/SupportDrawerProvider";
import { useState } from "react";
import { SupportForm } from "@/src/features/support-chat-2/SupportForm";
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

export const SupportDrawer = () => {
  const { open, setOpen } = useSupportDrawer();
  const [currentMode, setCurrentMode] = useState<"intro" | "form" | "success">(
    "intro",
  );
  const close = () => setOpen(false);

  if (!open) return null;

  return (
    <div className="flex h-dvh w-full min-w-0 flex-col bg-background">
      <div className="bg-background">
        <div className="flex min-h-12 w-full items-center justify-between gap-1 px-3 py-1">
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
          <Button
            variant="ghost"
            size="icon"
            onClick={close}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto border-t">
        <div className="p-4">
          <SupportForm
            mode={currentMode}
            onModeChange={setCurrentMode}
            onClose={close}
          />
        </div>
      </div>
    </div>
  );
};
