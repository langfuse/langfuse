/* eslint-disable @repo/no-null-render */
import { X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Layer } from "@/src/components/ui/layer";

export function OverviewSelectionBar({
  selectedCount,
  onClear,
  children,
}: {
  selectedCount: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (selectedCount === 0) return null;

  return (
    <Layer name="panel">
      <div className="pointer-events-none fixed inset-x-0 bottom-16 flex justify-center">
        <div className="ring-dark-blue/20 dark:border-dark-blue/30 dark:ring-dark-blue/30 bg-background pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 opacity-95 shadow-lg ring-2 backdrop-blur-md dark:shadow-none">
          <span className="text-sm font-bold">{selectedCount} selected</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Clear selection"
            onClick={onClear}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="bg-border h-5 w-px" />
          <div className="flex items-center gap-2">{children}</div>
        </div>
      </div>
    </Layer>
  );
}
