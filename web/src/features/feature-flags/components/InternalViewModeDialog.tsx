import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/src/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import type { useInternalViewMode } from "../hooks/useInternalViewMode";
import { InternalFeatureBadge } from "./InternalFeatureBadge";

export function InternalViewModeDialog({
  viewMode,
}: {
  viewMode: ReturnType<typeof useInternalViewMode>;
}) {
  return (
    <Dialog open={viewMode.open} onOpenChange={viewMode.setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>View mode</DialogTitle>
          <DialogDescription>
            External mode hides internal-only features. Permissions and feature
            preview settings stay unchanged.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ToggleGroup
            type="single"
            value={viewMode.mode}
            disabled={viewMode.saving}
            aria-label="View mode"
            onValueChange={(mode) => {
              if (mode === "INTERNAL" || mode === "EXTERNAL")
                viewMode.setMode(mode);
            }}
          >
            <ToggleGroupItem value="INTERNAL" className="gap-2">
              Internal <InternalFeatureBadge />
            </ToggleGroupItem>
            <ToggleGroupItem value="EXTERNAL">External</ToggleGroupItem>
          </ToggleGroup>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
