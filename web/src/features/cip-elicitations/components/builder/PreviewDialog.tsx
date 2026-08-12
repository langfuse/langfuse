// CIP fork feature (see FORK.md): fullscreen preview of the draft with a
// desktop/mobile width toggle. Nothing submitted from here is stored.
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { cn } from "@/src/utils/tailwind";
import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { type FormField, type FormSettings } from "../../lib/contract";
import { ElicitationRenderer } from "../renderer/ElicitationRenderer";

export function PreviewDialog({
  open,
  onOpenChange,
  fields,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: FormField[];
  settings: FormSettings;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-w-[90vw] flex-col gap-0 p-0">
        <DialogHeader className="flex-row items-center justify-between space-y-0 border-b px-4 py-2">
          <DialogTitle className="text-sm font-medium">Preview</DialogTitle>
          <div className="mr-6 flex gap-1">
            <Button
              variant={device === "desktop" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setDevice("desktop")}
            >
              <Monitor className="h-4 w-4" />
              <span className="sr-only">Desktop preview</span>
            </Button>
            <Button
              variant={device === "mobile" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setDevice("mobile")}
            >
              <Smartphone className="h-4 w-4" />
              <span className="sr-only">Mobile preview</span>
            </Button>
          </div>
        </DialogHeader>
        <div className="flex flex-1 items-stretch justify-center overflow-hidden bg-muted/30 p-4">
          <div
            className={cn(
              "flex overflow-hidden rounded-lg border bg-background shadow-sm transition-all",
              device === "mobile" ? "w-[375px]" : "w-full",
            )}
          >
            {/* Remount on open so a finished preview run resets. */}
            {open && (
              <ElicitationRenderer
                key={device}
                fields={fields}
                settings={settings}
                onSubmit={async () => {
                  // Preview only — nothing is stored.
                }}
                className="w-full"
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
