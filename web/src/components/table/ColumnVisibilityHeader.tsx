import { RotateCcw } from "lucide-react";
import { Button } from "@/src/components/ui/button";

export function ColumnVisibilityHeader({
  onRestoreDefaults,
}: {
  onRestoreDefaults: () => void;
}) {
  return (
    <div className="bg-popover sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-3 py-2">
      <p className="text-sm font-bold">Columns</p>
      <Button
        variant="outline"
        className="bg-accent gap-1.5"
        onClick={onRestoreDefaults}
      >
        <RotateCcw className="size-3.5" />
        Restore Defaults
      </Button>
    </div>
  );
}
