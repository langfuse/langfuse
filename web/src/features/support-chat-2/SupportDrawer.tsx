import { useSupportDrawer } from "@/src/features/support-chat-2/SupportDrawerProvider";
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
  const close = () => setOpen(false);
  // Fallback state if not wired; keep local runtime-only state on window to avoid re-renders across hot reloads
  if (!(window as any).__supportDrawerMode) {
    (window as any).__supportDrawerMode = [
      "intro",
      (v: string) => (
        ((window as any).__supportDrawerMode = [
          v,
          (window as any).__supportDrawerMode[1],
        ]),
        v
      ),
    ];
  }

  const currentMode = (window as any).__supportDrawerMode[0] as
    | "intro"
    | "form"
    | "success";
  const setModeUnsafe = (m: "intro" | "form" | "success") => {
    (window as any).__supportDrawerMode = [
      m,
      (window as any).__supportDrawerMode[1],
    ];
    // Force a micro rerender by closing and reopening synchronously
    setOpen(false);
    setTimeout(() => setOpen(true), 0);
  };

  if (!open) return null;

  return (
    <div className="flex h-dvh w-full min-w-0 flex-col bg-background">
      <div className="bg-background">
        <div className="flex min-h-12 w-full items-center justify-between gap-1 border-b px-3 py-1">
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
                        onClick={() => setModeUnsafe("intro")}
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
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <SupportForm
            mode={currentMode}
            onModeChange={setModeUnsafe}
            onClose={close}
          />
        </div>
      </div>
    </div>
  );
};
