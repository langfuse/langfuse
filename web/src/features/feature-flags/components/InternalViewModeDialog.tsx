import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "@/src/components/ui/dialog";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Button } from "@/src/components/ui/button";
import { useInternalViewMode } from "../hooks/useInternalViewMode";

export function InternalViewModeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const viewMode = useInternalViewMode();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>View mode</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription className="m-0 leading-relaxed">
            Internal view includes unreleased features for the Langfuse team.
            Switch it off for the external view. Permissions and feature preview
            settings stay unchanged.
          </DialogDescription>
          <div className="flex items-center gap-4 py-2">
            <label
              htmlFor="internal-view-mode"
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              Internal view
            </label>
            <Switch
              id="internal-view-mode"
              checked={viewMode.mode === "INTERNAL"}
              disabled={viewMode.saving}
              onCheckedChange={(enabled) =>
                viewMode.setMode(enabled ? "INTERNAL" : "EXTERNAL")
              }
            />
          </div>
        </DialogBody>
        <DialogFooter className="p-4">
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
